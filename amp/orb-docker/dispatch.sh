#!/usr/bin/env bash
# Dispatch script for `amp orb provider`: runs Amp orbs as Docker Cloud Sandboxes.
# Amp sets ORB_OPERATION (spawn|pause|delete), ORB_ID, and for spawn ORB_TOKEN; it sets
# AMP_URL only when the server is not ampcode.com.
# Every operation is safe to repeat. Logs go to stderr.
set -euo pipefail
# The provider may run under launchd with a minimal PATH; sbx lives in Homebrew.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

SBX=(sbx --cloud --no-input)
# Docker Cloud pulls --image-ref only from docker.io or dhi.io, so this is a copy of
# Amp's image.
IMAGE_REF=${AMP_ORB_IMAGE_REF:-docker.io/lelouvincx/amp-orb:latest}
CPUS=${AMP_ORB_CPUS:-4}
MEMORY=${AMP_ORB_MEMORY:-8g}
TTL=${AMP_ORB_TTL:-30m}
# Carry the disk over to a new sandbox when less than this many seconds remain
# before Docker's 24-hour cap.
CARRY_OVER_BELOW=${AMP_ORB_CARRY_OVER_BELOW:-7200}

[ -n "${ORB_OPERATION:-}" ] && [ -n "${ORB_ID:-}" ] || { echo "dispatch: ORB_OPERATION and ORB_ID are required" >&2; exit 1; }
# The orb's carry-over templates are named $ORB_ID-disk-<unix time>. A template
# can't be removed while a sandbox made from it exists, so each carry-over saves
# under a new name and removes the older ones after the new sandbox is created.
TPL_PREFIX="$ORB_ID-disk-"

log() { echo "$(date -u +%FT%TZ) dispatch[$ORB_OPERATION $ORB_ID]: $*" >&2; }
log "start${ORB_TYPE:+ type=$ORB_TYPE}${ORB_SNAPSHOT_ID:+ snapshot=$ORB_SNAPSHOT_ID}"
trap 'rc=$?; log "exit $rc"; exit $rc' EXIT

# Prints running, stopped, stopping, hibernating, ... or missing.
state() {
  "${SBX[@]}" inspect "$ORB_ID" --format json 2>/dev/null |
    python3 -c 'import json,sys; print(json.load(sys.stdin).get("state") or "unknown")' 2>/dev/null ||
    echo missing
}

# Waits while the sandbox is stopping or hibernating; rm and save fail then.
settle() {
  local s i
  for i in $(seq 1 30); do
    s=$(state)
    case "$s" in stopping | hibernating | starting | creating) sleep 5 ;; *) echo "$s"; return ;; esac
  done
  echo "$s"
}

max_remaining() {
  "${SBX[@]}" ttl "$ORB_ID" --json 2>/dev/null |
    python3 -c 'import json,sys; print(int(json.load(sys.stdin)["max_remaining_seconds"]))' 2>/dev/null ||
    echo 0
}

# Prints the orb's completed templates, newest first.
orb_templates() {
  "${SBX[@]}" template ls --json 2>/dev/null | python3 -c '
import json, sys
p = sys.argv[1]
ts = [t for t in json.load(sys.stdin) if t["name"].startswith(p) and t.get("status") == "completed"]
for t in sorted(ts, key=lambda t: t["name"], reverse=True): print(t["name"])' "$TPL_PREFIX" 2>/dev/null || true
}
latest_template() { orb_templates | head -1; }

# Removes the orb's templates except $1. Fails only for a template still in use.
remove_templates_except() {
  local t
  for t in $(orb_templates); do
    [ "$t" = "${1:-}" ] || "${SBX[@]}" template rm --force "$t" >&2
  done
}

create_from_disk_or_image() {
  local t
  t=$(latest_template)
  if [ -n "$t" ]; then create -t "$t"; else create; fi
}

remove_sandbox() {
  local i
  for i in 1 2 3 4 5 6; do
    [ "$(settle)" = missing ] && return 0
    "${SBX[@]}" rm --force "$ORB_ID" >&2 2>&1 && return 0
    sleep 5
  done
  [ "$(state)" = missing ]
}

create() { # create [-t TEMPLATE]
  local src
  if [ "${1:-}" = -t ]; then src=(-t "$2")
  else src=(--image-ref "$IMAGE_REF" --platform linux/amd64 --cpus "$CPUS" --memory "$MEMORY")
  fi
  log "creating from ${src[*]}"
  # A concurrent or repeated spawn may have created it already.
  "${SBX[@]}" create --name "$ORB_ID" --no-progress "${src[@]}" \
    --ttl "$TTL" --on-timeout stop >&2 || [ "$(state)" != missing ]
}

# Saves the disk as the orb's template and recreates the sandbox from it,
# which gives it a fresh 24-hour cap. Only a running sandbox can be saved.
carry_over() {
  log "carrying disk over ($(max_remaining)s left before the 24h cap)"
  local new="$TPL_PREFIX$(date +%s)"
  # Called from an `||` list, so set -e is off here: check each step.
  "${SBX[@]}" exec "$ORB_ID" true >/dev/null || return 1 # starts it if stopped
  # Fails for a sandbox booted from a private image; the sandbox is untouched then.
  "${SBX[@]}" template save "$ORB_ID" "$new" >&2 || return 1
  remove_sandbox || return 1
  create -t "$new" || return 1
  remove_templates_except "$new" || log "could not remove an older template"
}

start_bootstrap() {
  # exec starts a stopped sandbox first. Every fd of the background process must be
  # redirected, or exec hangs and exits 125. exec runs as the image user (`user`);
  # switch only if a future image changes that.
  local env=(-e ORB_TOKEN)
  if [ -n "${AMP_URL:-}" ]; then env+=(-e AMP_URL); fi
  "${SBX[@]}" exec "${env[@]}" "$ORB_ID" bash -c '
    cmd="cd ~; setsid nohup amp orb bootstrap </dev/null >>~/.amp-bootstrap.log 2>&1 &"
    if [ "$(id -un)" = user ]; then bash -lc "$cmd"
    else sudo -H -u user --preserve-env=ORB_TOKEN,AMP_URL bash -lc "$cmd"; fi'
}

case "$ORB_OPERATION" in
spawn)
  [ -n "${ORB_TOKEN:-}" ] || { log "ORB_TOKEN is not set"; exit 1; }
  # Orb types match Amp's size names. The size applies only when a sandbox is
  # created; resumes and carry-overs keep it, as a thread keeps its type for life.
  # Unset ORB_TYPE keeps AMP_ORB_CPUS/AMP_ORB_MEMORY (default Medium).
  # Amp's settings store the names with hyphens (a1-small), so accept both forms.
  t=${ORB_TYPE:-}
  case "${t//-/.}" in
  "") ;;
  a1.tiny) CPUS=1 MEMORY=2g ;;
  a1.small) CPUS=2 MEMORY=4g ;;
  a1.medium) CPUS=4 MEMORY=8g ;;
  a1.large) CPUS=8 MEMORY=16g ;;
  a1.xxlarge) CPUS=16 MEMORY=32g ;;
  *) log "unknown orb type '$ORB_TYPE' (expected a1.tiny, a1.small, a1.medium, a1.large or a1.xxlarge)"; exit 1 ;;
  esac
  s=$(settle)
  case "$s" in
  missing)
    create_from_disk_or_image ;;
  running | stopped)
    if [ "$(max_remaining)" -lt "$CARRY_OVER_BELOW" ]; then
      carry_over || log "carry-over failed; keeping the current sandbox"
    fi ;;
  *) # expired or broken: fall back to the saved disk, then to a fresh orb
    log "unexpected state $s; recreating"
    remove_sandbox || true
    create_from_disk_or_image ;;
  esac
  start_bootstrap
  log "bootstrap started"
  ;;
pause)
  s=$(state)
  case "$s" in
  missing | stopped | stopping | hibernating) log "nothing to stop ($s)" ;;
  *) "${SBX[@]}" stop "$ORB_ID" >&2 ;;
  esac
  ;;
delete)
  remove_sandbox
  remove_templates_except ""
  log "deleted"
  ;;
*) log "unknown operation"; exit 1 ;;
esac
