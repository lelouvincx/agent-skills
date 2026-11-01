#!/usr/bin/env bash
# Offline contract tests: real local Git, mocked resolver/GitHub/transport.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BOT_PR="${BOT_PR_UNDER_TEST:-$ROOT/bin/agent-bot-pr}"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
REAL_GIT=$(command -v git)
export REAL_GIT
mkdir -p "$TMP_DIR/bin" "$TMP_DIR/source/amp/agent-secrets" "$TMP_DIR/repo"
cp "$ROOT/amp/agent-secrets/lib-agent.sh" "$TMP_DIR/source/amp/agent-secrets/"
printf '%s\n' '{"version":1,"identities":{"lelouvincx-bot":{"repositoryAllowlist":["fixture/project","lelouvincx-bot/project"]}}}' >"$TMP_DIR/source/amp/agent-secrets/github-identities.json"
cat >"$TMP_DIR/bin/agent-secrets" <<'SH'
#!/usr/bin/env bash
set -eu
[[ "$1 $2 $3 $4" == 'run --bundle lelouvincx-bot --' ]]
[[ "${GH_TOKEN+x}${GITHUB_TOKEN+x}${GH_TOKEN_BOT+x}" == '' ]]
shift 4
exec "$@"
SH
cat >"$TMP_DIR/bin/git" <<'SH'
#!/usr/bin/env bash
set -eu
args=("$@")
while [[ "${1:-}" == -c ]]; do shift 2; done
if [[ "${1:-}" == push ]]; then
    printf '%s\n' "$*" >>"$TEST_LOG"
    [[ "$2 $3" == '--recurse-submodules=no --no-follow-tags' ]]
    shift 2
    if [[ "${TEST_SSH_TRANSPORT:-}" == 1 ]]; then
        [[ "$2" == git@github.com:fixture/project.git ]]
        [[ "$GIT_SSH_COMMAND" == "/usr/bin/ssh -F /dev/null -o HostName=github.com -o ProxyCommand=none -o ProxyJump=none -o BatchMode=yes -o IdentitiesOnly=yes -o IdentityAgent=none -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -i $AGENT_BOT_SSH_KEY" ]]
    else
        [[ "$2" == https://github.com/fixture/project.git ]]
        [[ "${args[*]}" == *"run --bundle lelouvincx-bot -- '$GH_BIN' auth git-credential"* ]]
        [[ "$GH_HOST" == github.com && "$GH_PROMPT_DISABLED" == 1 ]]
    fi
    [[ "$3" == refs/heads/feature/test:refs/heads/feature/test ]]
    exit
fi
exec "$REAL_GIT" "${args[@]}"
SH
cat >"$TMP_DIR/bin/gh" <<'SH'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >>"$TEST_LOG"
[[ "$1" == api ]]
shift
endpoint='' query='' paginate=false slurp=false method=GET
while [[ $# -gt 0 ]]; do
    case "$1" in
    --jq) query="$2"; shift 2 ;;
    --method) method="$2"; shift 2 ;;
    --paginate) paginate=true; shift ;;
    --slurp) slurp=true; shift ;;
    --field|--raw-field) shift 2 ;;
    *) endpoint="$1"; shift ;;
    esac
done
if "$slurp" && [[ -n "$query" ]]; then
    echo 'gh does not support --slurp with --jq' >&2
    exit 1
fi
sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
case "$endpoint" in
user) data="{\"login\":\"${TEST_LOGIN:-lelouvincx-bot}\"}" ;;
repos/fixture/project|repos/lelouvincx-bot/project)
    data="{\"full_name\":\"fixture/project\",\"default_branch\":\"master\",\"permissions\":{\"push\":${TEST_PUSH:-true},\"admin\":${TEST_ADMIN:-false}}}" ;;
repos/fixture/project/pulls/7)
    base=master; state=open; draft=false; repo=fixture/project
    case "${TEST_SCENARIO:-}" in
    wrong-base) base=release ;;
    closed) state=closed ;;
    draft) draft=true ;;
    fork) repo=other/project ;;
    changed) if [[ -f "$TEST_COUNTER" ]]; then sha=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; else : >"$TEST_COUNTER"; fi ;;
    esac
    data="{\"number\":7,\"head\":{\"sha\":\"$sha\",\"repo\":{\"full_name\":\"$repo\"}},\"state\":\"$state\",\"draft\":$draft,\"base\":{\"ref\":\"$base\",\"repo\":{\"full_name\":\"fixture/project\"}}}" ;;
repos/fixture/project/pulls/7/merge)
    [[ "$method" == PUT ]]
    data='{"merged":true,"sha":"merged","message":"ok"}'
    [[ "${TEST_SCENARIO:-}" != declined ]] || data='{"merged":false,"message":"blocked"}' ;;
repos/fixture/project/commits)
    data="[{\"sha\":\"$sha\"}]" ;;
*/check-runs*)
    data='{"check_runs":[{"name":"test","status":"completed","conclusion":"success"}]}'
    case "${TEST_SCENARIO:-}" in
    empty|status-only) data='{"check_runs":[]}' ;;
    pending) data='{"check_runs":[{"name":"test","status":"in_progress","conclusion":null}]}' ;;
    failure) data='{"check_runs":[{"name":"test","status":"completed","conclusion":"failure"}]}' ;;
    malformed) data='broken JSON' ;;
    page-failure)
        if "$paginate"; then data="$data"$'\n''{"check_runs":[{"name":"late","status":"completed","conclusion":"failure"}]}'; fi ;;
    api-error) exit 1 ;;
    esac ;;
*/statuses*)
    data='[]'
    case "${TEST_SCENARIO:-}" in
    status-failure) data='[{"context":"external","state":"failure"}]' ;;
    status-pending) data='[{"context":"external","state":"pending"}]' ;;
    status-only) data='[{"context":"external","state":"success"}]' ;;
    status-latest) data='[{"context":"external","state":"success"},{"context":"external","state":"failure"}]' ;;
    status-page-failure)
        if "$paginate"; then data='[{"context":"external","state":"success"}]'$'\n''[{"context":"another","state":"failure"}]'; fi ;;
    esac ;;
repos/fixture/project/pulls)
    if [[ "$method" == POST ]]; then data='{"number":7}'; else data='[]'; fi ;;
*/requested_reviewers|*/assignees) data='{}' ;;
*/actions/runs) data='{"total_count":0,"workflow_runs":[]}' ;;
*/actions/runs/1/jobs*)
    data='{"jobs":[{"id":1,"name":"first","status":"completed","conclusion":"success","steps":[]}]}'
    if "$paginate"; then
        data="$data"$'\n''{"jobs":[{"id":2,"name":"second","status":"completed","conclusion":"failure","steps":[]}]}'
    fi ;;
*) echo "Unexpected mocked endpoint: $endpoint" >&2; exit 1 ;;
esac
if "$slurp"; then data=$(printf '%s\n' "$data" | jq -s .); fi
if [[ -n "$query" ]]; then printf '%s\n' "$data" | jq -r "$query"; else printf '%s\n' "$data"; fi
SH
chmod +x "$TMP_DIR/bin/"*
export PATH="$TMP_DIR/bin:$PATH" AGENT_SKILLS_ROOT="$TMP_DIR/source"
export AGENT_SECRETS_BIN="$TMP_DIR/bin/agent-secrets" GH_BIN="$TMP_DIR/bin/gh"
export AGENT_BOT_SSH_KEY="$TMP_DIR/missing-key" TEST_LOG="$TMP_DIR/log" TEST_COUNTER="$TMP_DIR/counter"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
cd "$TMP_DIR/repo"
git init -q
git checkout -qb feature/test
git remote add origin https://github.com/fixture/project.git
printf 'fixture\n' >approved.txt
git add approved.txt
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -qm 'test: initial fixture'
printf 'body\n' >body.md
passed=0 failed=0
expect_success() {
    if "$@" >"$TMP_DIR/output" 2>&1; then passed=$((passed+1)); else
        printf 'FAIL expected success: %s\n' "$*"; cat "$TMP_DIR/output"; failed=$((failed+1))
    fi
}
expect_failure() {
    if "$@" >"$TMP_DIR/output" 2>&1; then
        printf 'FAIL expected rejection: %s\n' "$*"; failed=$((failed+1))
    else passed=$((passed+1)); fi
}
expect_success "$BOT_PR" help
expect_failure env AGENT_BOT_GITHUB_LOGIN=other "$BOT_PR" checks
expect_failure env AGENT_BOT_GIT_EMAIL=other@example.com "$BOT_PR" checks
expect_failure env AGENT_GITHUB_REPOSITORY=fixture/other "$BOT_PR" checks
for url in https://github.com/fixture/unapproved.git https://github.com.evil/fixture/project.git 'git@github.com:fixture/project.git?x' 'https://user@github.com/fixture/project.git'; do
    git remote set-url origin "$url"
    expect_failure "$BOT_PR" checks
done
for url in https://github.com/fixture/project https://github.com/fixture/project.git git@github.com:fixture/project.git; do
    git remote set-url origin "$url"
    expect_success "$BOT_PR" checks
    for key in url.https://evil/.insteadOf remote.origin.pushurl http.proxy credential.helper core.sshCommand include.path protocol.ext.allow remote.origin.receivepack remote.origin.mirror filter.test.clean; do
        git config "$key" unsafe
        : >"$TEST_LOG"
        expect_failure "$BOT_PR" push
        expect_success test ! -s "$TEST_LOG"
        git config --unset-all "$key"
    done
done
git remote set-url origin https://github.com/fixture/project.git
git config --add remote.origin.url https://github.com/fixture/another.git
expect_failure "$BOT_PR" checks
git config --unset-all remote.origin.url
git remote set-url origin https://github.com/fixture/project.git
for setting in TEST_LOGIN=other TEST_PUSH=false TEST_ADMIN=true; do
    : >"$TEST_LOG"
    expect_failure env "$setting" "$BOT_PR" push
    if grep -q '^push ' "$TEST_LOG"; then echo 'FAIL unauthorized push reached transport'; failed=$((failed+1)); fi
done
printf 'changed\n' >>approved.txt
for key in author.name author.email committer.name committer.email; do
    git config "$key" imposter
done
expect_success env GIT_AUTHOR_NAME=imposter GIT_AUTHOR_EMAIL=wrong@example.com GIT_COMMITTER_NAME=imposter GIT_COMMITTER_EMAIL=wrong@example.com GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=url.file:///evil.insteadOf GIT_CONFIG_VALUE_0=https://github.com/ GIT_EXEC_PATH=/nonexistent "$BOT_PR" commit -m 'test: identity' -- approved.txt
expect_success test "$(git log -1 --format='%an <%ae> %cn <%ce> %G?')" = 'lelouvincx-bot <bot@lelouvincx.com> lelouvincx-bot <bot@lelouvincx.com> N'
printf 'staged only\n' >>approved.txt
git add approved.txt
staged_blob=$(git rev-parse :approved.txt)
printf 'unrelated working edit\n' >>approved.txt
expect_success "$BOT_PR" commit --staged -m 'test: staged hunks only' -- approved.txt
expect_success test "$(git rev-parse HEAD:approved.txt)" = "$staged_blob"
expect_success grep -q 'unrelated working edit' approved.txt
expect_failure git diff --quiet -- approved.txt
printf 'extra\n' >unapproved.txt
git add unapproved.txt
expect_failure "$BOT_PR" commit --staged -m 'test: staged rejection' -- approved.txt
expect_failure "$BOT_PR" commit -m 'test: staged rejection' -- approved.txt
git reset -q unapproved.txt
git config push.followTags true
git config push.recurseSubmodules only
expect_success "$BOT_PR" push
expect_failure "$BOT_PR" push --all
expect_failure "$BOT_PR" push feature/test:master
expect_failure "$BOT_PR" pr --pr ../user
expect_failure "$BOT_PR" jobs --run 1 --extra
expect_failure "$BOT_PR" repo --anything
expect_success "$BOT_PR" pr --pr 7
expect_success "$BOT_PR" runs
expect_success "$BOT_PR" jobs --run 1
jobs_result=$(cat "$TMP_DIR/output")
expect_success test "$(printf '%s' "$jobs_result" | jq -r 'length')" = 2
expect_success test "$(printf '%s' "$jobs_result" | jq -r '.[1].conclusion')" = failure
expect_success "$BOT_PR" repo
expect_success "$BOT_PR" open --title 'test: fixture' --body-file body.md
expect_success grep -q 'base=master' "$TEST_LOG"
expect_success "$BOT_PR" open --title 'test: fixture' --body-file body.md --base release
expect_success grep -q 'base=release' "$TEST_LOG"
for scenario in empty pending failure page-failure status-failure status-pending status-page-failure malformed api-error wrong-base closed draft fork changed; do
    : >"$TEST_LOG"; rm -f "$TEST_COUNTER"
    expect_failure env TEST_SCENARIO="$scenario" "$BOT_PR" merge --pr 7
    if grep -q -- '--method PUT' "$TEST_LOG"; then echo "FAIL $scenario reached merge"; failed=$((failed+1)); fi
done
expect_failure env TEST_SCENARIO=declined "$BOT_PR" merge --pr 7
expect_success "$BOT_PR" merge --pr 7
expect_success env TEST_SCENARIO=status-only "$BOT_PR" merge --pr 7
expect_success env TEST_SCENARIO=status-latest "$BOT_PR" merge --pr 7
expect_success grep -q -- "sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" "$TEST_LOG"
expect_success env TEST_SCENARIO=wrong-base "$BOT_PR" merge --pr 7 --base release
printf 'not a key\n' >"$TMP_DIR/key"
chmod 644 "$TMP_DIR/key"
expect_failure env AGENT_BOT_SSH_KEY="$TMP_DIR/key" "$BOT_PR" commit -m 'test: invalid key' -- approved.txt
expect_failure env AGENT_BOT_SSH_KEY="$TMP_DIR/key" AGENT_BOT_SIGNING_KEY_CONFIG=other "$BOT_PR" push
ln -s "$TMP_DIR/missing" "$TMP_DIR/key-link"
expect_failure env AGENT_BOT_SSH_KEY="$TMP_DIR/key-link" "$BOT_PR" push

# Test the fixed absolute SSH command without opening a socket. This sourced
# harness replaces only the SSH process; Git staging/signing remain real.
sed '/^main "\$@"$/d' "$BOT_PR" >"$TMP_DIR/helper-functions"
ssh_contract() (
    local login="$1" action="${2:-validate}"
    # shellcheck source=/dev/null
    source "$TMP_DIR/helper-functions"
    /usr/bin/ssh() {
        [[ "$*" == "-T -F /dev/null -o HostName=github.com -o ProxyCommand=none -o ProxyJump=none -o BatchMode=yes -o IdentitiesOnly=yes -o IdentityAgent=none -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -i $AGENT_BOT_SSH_KEY git@github.com" ]] || return 2
        printf "Hi %s! You've successfully authenticated, but GitHub does not provide shell access.\n" "$login"
        return 1
    }
    AGENT_BOT_SSH_KEY="$TMP_DIR/valid-key"
    AGENT_BOT_SIGNING_KEY_CONFIG="$AGENT_BOT_SSH_KEY"
    load_contract
    if [[ "$action" == commit ]]; then
        command_commit -m 'test: signed fixture' -- approved.txt
    elif [[ "$action" == push ]]; then
        export TEST_SSH_TRANSPORT=1 AGENT_BOT_SSH_KEY
        command_push
    else
        validate_ssh_transport
    fi
)
/usr/bin/ssh-keygen -q -t ed25519 -N '' -f "$TMP_DIR/valid-key"
expect_success ssh_contract lelouvincx-bot
expect_failure ssh_contract other
expect_success ssh_contract lelouvincx-bot push
printf 'signed\n' >>approved.txt
expect_success ssh_contract lelouvincx-bot commit
expect_success test "$(git log -1 --format='%an <%ae> %cn <%ce>')" = 'lelouvincx-bot <bot@lelouvincx.com> lelouvincx-bot <bot@lelouvincx.com>'
printf 'bot@lelouvincx.com %s\n' "$(cat "$TMP_DIR/valid-key.pub")" >"$TMP_DIR/allowed-signers"
expect_success git -c "gpg.ssh.allowedSignersFile=$TMP_DIR/allowed-signers" verify-commit HEAD
publisher_contract() (
    # shellcheck source=/dev/null
    source "$TMP_DIR/helper-functions"
    export TEST_ADMIN=true
    load_contract
    validate_publisher
)
git remote set-url origin https://github.com/lelouvincx-bot/project.git
expect_success publisher_contract
git remote set-url origin https://github.com/fixture/project.git
expect_failure publisher_contract
printf 'Bot PR contracts: %s passed, %s failed\n' "$passed" "$failed"
[[ "$failed" == 0 ]]
