#!/usr/bin/env bash
# Keeps docker.io/lelouvincx/amp-orb:latest a copy of Amp's orb image (linux/amd64).
# Copies only when the amd64 manifest digest of Amp's `latest` differs from the one
# in our copy's index. Run weekly by ~/Library/LaunchAgents/com.lelouvincx.amp-orb-refresh.plist.
# Logs to ~/Library/Logs/amp-orb-docker/refresh-image.log, outside the repository.
# Exits non-zero on failure.
set -euo pipefail

export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.orbstack/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SRC_REPO=us-central1-docker.pkg.dev/amp-prod-0/amp-orb/amp-orb
DST_REPO=docker.io/lelouvincx/amp-orb
DST_NS=lelouvincx
DST_NAME=amp-orb
LOG_DIR=${AMP_ORB_LOG_DIR:-$HOME/Library/Logs/amp-orb-docker}
LOG="$LOG_DIR/refresh-image.log"
LOCK="$LOG_DIR/.refresh-image.lock"

mkdir -p "$LOG_DIR"
exec >>"$LOG" 2>&1
log() { echo "$(date '+%Y-%m-%d %H:%M:%S %z') refresh-image[$$]: $*"; }
fail() { log "FAILED: $*"; exit 1; }

# Lock: mkdir is atomic; macOS has no flock. A lock left by a dead run is taken over.
if ! mkdir "$LOCK" 2>/dev/null; then
  old=$(cat "$LOCK/pid" 2>/dev/null || true)
  if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then
    log "another run (pid $old) holds the lock; exiting"
    exit 1
  fi
  log "removing stale lock (pid ${old:-unknown})"
  rm -rf "$LOCK"
  mkdir "$LOCK" || fail "could not take the lock"
fi
echo $$ >"$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT

# OrbStack provides the docker engine and BuildKit used for the copy.
if [ "$(orb status 2>/dev/null)" != Running ]; then
  log "OrbStack is not running; starting it"
  orb start || fail "could not start OrbStack"
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
fi
docker info >/dev/null 2>&1 || fail "docker engine (OrbStack) is not reachable"

# Prints the linux/amd64 manifest digest listed in a reference's index. Index digests
# are never compared: our index is rebuilt from the single amd64 manifest.
amd64_digest() {
  docker buildx imagetools inspect --raw "$1" |
    jq -er '[.manifests[] | select(.platform.os == "linux" and .platform.architecture == "amd64")][0].digest'
}

src=$(amd64_digest "$SRC_REPO:latest") || fail "could not read amd64 digest of $SRC_REPO:latest"
dst=$(amd64_digest "$DST_REPO:latest") || fail "could not read amd64 digest of $DST_REPO:latest"

if [ "$src" = "$dst" ]; then
  log "up to date ($src); skipping"
  exit 0
fi

log "copying $SRC_REPO@$src (ours: $dst)"
start=$(date +%s)
docker buildx imagetools create --tag "$DST_REPO:latest" "$SRC_REPO@$src" ||
  fail "imagetools create failed"
log "copy finished in $(($(date +%s) - start)) s"

# Verify: our latest points at the new amd64 digest, and the repo is public with only `latest`.
new=$(amd64_digest "$DST_REPO:latest") || fail "could not reread $DST_REPO:latest"
[ "$new" = "$src" ] || fail "after copy, $DST_REPO:latest amd64 is $new, expected $src"
hub=https://hub.docker.com/v2/namespaces/$DST_NS/repositories/$DST_NAME
private=$(curl -fsS "$hub" | jq -r '.is_private') || fail "could not read repository visibility"
[ "$private" = false ] || fail "repository is_private=$private, expected false"
tags=$(curl -fsS "$hub/tags?page_size=100" | jq -c '[.results[].name] | sort') || fail "could not list tags"
[ "$tags" = '["latest"]' ] || fail "repository tags are $tags, expected [\"latest\"]"
log "verified: $DST_REPO:latest amd64 is $src, repository public, tags $tags"
