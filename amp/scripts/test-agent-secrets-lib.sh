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

EXPECTED_REPOSITORIES=$'lelouvincx/agent-skills\nlelouvincx/dotfiles\nlelouvincx/lms-leitner-material\nlelouvincx/nvim\nlelouvincx/second-brain-logseq\nlelouvincx/smartclass'
AGENT_BOT_GITHUB_LOGIN=lelouvincx-bot
[[ "$(agent_bot_repository_allowlist)" == "$EXPECTED_REPOSITORIES" ]]

MISSING_POLICY_DIR="$TMP_DIR/missing-policy"
mkdir "$MISSING_POLICY_DIR"
cp "$LIB" "$MISSING_POLICY_DIR/lib-agent.sh"
if bash -c 'AGENT_BOT_GITHUB_LOGIN=lelouvincx-bot; source "$1"; agent_bot_repository_allowlist' _ "$MISSING_POLICY_DIR/lib-agent.sh" >/dev/null 2>&1; then
	echo "ERROR: Shared agent library accepted a missing identity policy" >&2
	exit 1
fi
if bash -c 'AGENT_BOT_GITHUB_LOGIN=lelouvincx-bot; AGENT_BOT_GITHUB_REPOSITORY_ALLOWLIST=(fallback/repository); source "$1"; agent_gh() { return 0; }; agent_validate_bot_token test fallback/repository' _ "$MISSING_POLICY_DIR/lib-agent.sh" >/dev/null 2>&1; then
	echo "ERROR: Bot token validation fell back to a caller repository allowlist" >&2
	exit 1
fi

INVALID_POLICY_DIR="$TMP_DIR/invalid-policy"
mkdir "$INVALID_POLICY_DIR"
cp "$LIB" "$INVALID_POLICY_DIR/lib-agent.sh"
printf '%s\n' '{"version":1,"identities":{"lelouvincx-bot":{"repositoryAllowlist":["lelouvincx/nvim","lelouvincx/nvim"]}}}' >"$INVALID_POLICY_DIR/github-identities.json"
if bash -c 'AGENT_BOT_GITHUB_LOGIN=lelouvincx-bot; source "$1"; agent_bot_repository_allowlist' _ "$INVALID_POLICY_DIR/lib-agent.sh" >/dev/null 2>&1; then
	echo "ERROR: Shared agent library accepted an invalid identity policy" >&2
	exit 1
fi

if grep -Eq 'pages/Weekly|reviewers\[\]=lelouvincx' "$LIB"; then
	echo "ERROR: Shared agent library contains Logseq publishing policy" >&2
	exit 1
fi

echo "Shared agent library contract passed"
