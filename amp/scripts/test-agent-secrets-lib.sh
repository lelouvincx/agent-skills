#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/amp/agent-secrets/lib-agent.sh"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

cat >"$TMP_DIR/agent-secrets" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$AGENT_SECRETS_TEST_LOG"
SH
chmod +x "$TMP_DIR/agent-secrets"

AGENT_SECRETS_TEST_LOG="$TMP_DIR/requests.log"
export AGENT_SECRETS_TEST_LOG
AGENT_SECRETS_BIN="$TMP_DIR/agent-secrets"
AGENT_PREFLIGHT_BIN="/test/preflight"
AGENT_PUBLISHER_BIN="/test/publisher"
AGENT_CLAUDE_BIN="/test/claude"
AGENT_PREFLIGHT_BUNDLES=("runtime-test" "work-test")
AGENT_PUBLISHER_BUNDLES=("publisher-test")
AGENT_MAINTENANCE_ALLOWED_PATTERNS=("notes/*.md")
AGENT_MAINTENANCE_PROTECTED_PATTERNS=("notes/Generated -*")

# shellcheck source=/dev/null
source "$LIB"

agent_run_preflight
agent_run_publisher doctor --repo test/repository
agent_setup claude

grep -Fxq 'run --bundle runtime-test --bundle work-test -- /test/preflight' "$AGENT_SECRETS_TEST_LOG"
grep -Fxq 'run --bundle publisher-test -- /test/publisher doctor --repo test/repository' "$AGENT_SECRETS_TEST_LOG"
[[ "$AGENT_BIN" == /test/claude ]]
agent_path_matches_patterns 'notes/keep.md' "${AGENT_MAINTENANCE_ALLOWED_PATTERNS[@]}"
! agent_path_matches_patterns 'pages/keep.md' "${AGENT_MAINTENANCE_ALLOWED_PATTERNS[@]}"
agent_path_matches_patterns 'notes/Generated - report.md' "${AGENT_MAINTENANCE_PROTECTED_PATTERNS[@]}"

SNAPSHOT_REPO="$TMP_DIR/snapshot-repo"
mkdir "$SNAPSHOT_REPO"
(
	cd "$SNAPSHOT_REPO"
	git init -q
	printf 'tracked image\n' >'-.png'
	git add -- '-.png'
	git -c user.name=test -c user.email=test@example.com commit -qm 'Add tracked image'
	printf 'untracked image\n' >'--sample.jpg'
	agent_snapshot_worktree "$TMP_DIR/snapshot.manifest"
)
grep -Eq '^[[:xdigit:]]{64}[[:space:]]+\-\.png$' "$TMP_DIR/snapshot.manifest"
grep -Eq '^[[:xdigit:]]{64}[[:space:]]+\-\-sample\.jpg$' "$TMP_DIR/snapshot.manifest"

if grep -Eq 'amp-runtime|lelouvincx-bot|pages/Weekly|reviewers\[\]=lelouvincx' "$LIB"; then
	echo "ERROR: Shared agent library contains repository policy" >&2
	exit 1
fi

echo "Shared agent library contract passed"
