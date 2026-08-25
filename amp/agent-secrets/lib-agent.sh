# shellcheck shell=bash
# Shared agent abstraction layer for Logseq automation.
# Supports: amp, claude
#
# Globals (read by callers after agent_run):
#   AGENT_BIN          resolved binary path
#   AGENT_THREAD_ID    session/thread ID returned by the agent
#   AGENT_THREAD_URL   user-facing URL (or "(session: ID)" if agent has none)
#   AGENT_RESULT       final assistant message / result text

AGENT_BIN=""
AGENT_THREAD_ID=""
AGENT_THREAD_URL=""
AGENT_RESULT=""

AGENT_SECRETS_BIN="${AGENT_SECRETS_BIN:-$HOME/.local/bin/agent-secrets}"

# Default tool set for non-amp agents that need explicit allowlists.
# Covers what the weekly/1on1 prompts need: read/write report file, run git/gh.
AGENT_CLAUDE_ALLOWED_TOOLS="${AGENT_CLAUDE_ALLOWED_TOOLS:-Bash,Edit,Read,Write,Glob,Grep,WebFetch}"

agent_auth_mode() {
	local shared="${AGENT_SECRET_AUTH:-}" legacy="${LOGSEQ_REPORT_AUTH:-}" mode
	if [[ -n "$shared" && -n "$legacy" && "$shared" != "$legacy" ]]; then
		echo "ERROR: AGENT_SECRET_AUTH and LOGSEQ_REPORT_AUTH conflict" >&2
		return 1
	fi
	mode="${shared:-${legacy:-interactive}}"
	case "$mode" in
	interactive | service-account)
		printf '%s\n' "$mode"
		;;
	*)
		echo "ERROR: Authentication selector must be interactive or service-account" >&2
		return 1
		;;
	esac
}

agent_resolver() {
	local mode
	mode=$(agent_auth_mode) || return 1
	[[ -x "$AGENT_SECRETS_BIN" ]] || {
		echo "ERROR: Shared resolver is not executable: $AGENT_SECRETS_BIN" >&2
		return 1
	}
	AGENT_SECRET_AUTH="$mode" "$AGENT_SECRETS_BIN" "$@"
}

agent_resolver_with_bundles() {
	local bundle bundle_args=()
	while [[ $# -gt 0 && "$1" != -- ]]; do
		bundle="$1"
		bundle_args+=(--bundle "$bundle")
		shift
	done
	[[ "${1:-}" == -- ]] || {
		echo "ERROR: Bundle request is missing a target command" >&2
		return 1
	}
	shift
	agent_resolver run "${bundle_args[@]}" -- "$@"
}

agent_run_preflight() {
	agent_resolver_with_bundles "${AGENT_PREFLIGHT_BUNDLES[@]}" -- "$AGENT_PREFLIGHT_BIN"
}

agent_run_publisher() {
	agent_resolver_with_bundles "${AGENT_PUBLISHER_BUNDLES[@]}" -- "$AGENT_PUBLISHER_BIN" "$@"
}

agent_stat_mode() {
	stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1" 2>/dev/null
}

agent_stat_owner() {
	stat -f '%u' "$1" 2>/dev/null || stat -c '%u' "$1" 2>/dev/null
}


agent_unset_publishing_credentials() {
	unset GH_TOKEN_BOT GIT_ASKPASS SSH_ASKPASS
}


agent_file_digest() {
	local path="$1"
	if [[ -L "$path" ]]; then
		printf 'symlink:%s' "$(readlink "$path")"
	elif [[ -f "$path" ]]; then
		if command -v shasum >/dev/null 2>&1; then
			shasum -a 256 "$path" | awk '{print $1}'
		else
			sha256sum "$path" | awk '{print $1}'
		fi
	elif [[ -e "$path" ]]; then
		printf 'other'
	else
		printf 'deleted'
	fi
}

agent_stdin_digest() {
	if command -v shasum >/dev/null 2>&1; then
		shasum -a 256 | awk '{print $1}'
	else
		sha256sum | awk '{print $1}'
	fi
}

agent_snapshot_worktree() {
	local output_file="$1" path common_dir git_dir metadata_path
	: >"$output_file"
	printf 'git-head:%s\t%s\n' "$(git rev-parse HEAD)" '__AGENT_GIT_HEAD__' >>"$output_file"
	printf 'git-branch:%s\t%s\n' "$(git symbolic-ref --quiet --short HEAD || printf detached)" '__AGENT_GIT_BRANCH__' >>"$output_file"
	printf 'git-config:%s\t%s\n' "$(git config --local --null --list | agent_stdin_digest)" '__AGENT_GIT_CONFIG__' >>"$output_file"
	printf 'git-index:%s\t%s\n' "$(git ls-files --stage -v -z | agent_stdin_digest)" '__AGENT_GIT_INDEX__' >>"$output_file"
	printf 'git-refs:%s\t%s\n' "$(git for-each-ref --format='%(refname)%09%(objectname)' | agent_stdin_digest)" '__AGENT_GIT_REFS__' >>"$output_file"
	common_dir=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
	git_dir=$(cd "$(git rev-parse --git-dir)" && pwd -P)

	for metadata_path in \
		"$common_dir/packed-refs" \
		"$common_dir/info/exclude" \
		"$common_dir/objects/info/alternates" \
		"$common_dir/shallow" \
		"$git_dir/MERGE_HEAD" \
		"$git_dir/CHERRY_PICK_HEAD" \
		"$git_dir/REVERT_HEAD" \
		"$git_dir/REBASE_HEAD"; do
		printf '%s\t%s\n' "$(agent_file_digest "$metadata_path")" "__AGENT_GIT_METADATA__:$metadata_path" >>"$output_file"
	done
	for metadata_path in "$common_dir"/hooks/*; do
		[[ -e "$metadata_path" || -L "$metadata_path" ]] || continue
		printf '%s\t%s\n' "$(agent_file_digest "$metadata_path")" "__AGENT_GIT_METADATA__:$metadata_path" >>"$output_file"
	done

	while IFS= read -r -d '' path; do
		if [[ "$path" == *$'\t'* || "$path" == *$'\n'* ]]; then
			echo "ERROR: Repository paths may not contain tabs or newlines: $path" >&2
			return 1
		fi
		printf '%s\t%s\n' "$(agent_file_digest "$path")" "$path" >>"$output_file"
	done < <(git ls-files -z)

	while IFS= read -r -d '' path; do
		if [[ "$path" == *$'\t'* || "$path" == *$'\n'* ]]; then
			echo "ERROR: Repository paths may not contain tabs or newlines: $path" >&2
			return 1
		fi
		printf '%s\t%s\n' "$(agent_file_digest "$path")" "$path" >>"$output_file"
	done < <(git ls-files --others --exclude-standard -z)

	while IFS= read -r -d '' path; do
		if [[ "$path" == *$'\t'* || "$path" == *$'\n'* ]]; then
			echo "ERROR: Repository paths may not contain tabs or newlines: $path" >&2
			return 1
		fi
		printf '%s\t%s\n' "$(agent_file_digest "$path")" "$path" >>"$output_file"
	done < <(git ls-files --others --ignored --exclude-standard -z)

	LC_ALL=C sort -o "$output_file" "$output_file"
}

agent_filter_manifest() {
	local input_file="$1" output_file="$2"
	shift 2
	local digest path allowed skip
	: >"$output_file"
	while IFS=$'\t' read -r digest path; do
		[[ -n "$path" ]] || continue
		skip=false
		for allowed in "$@"; do
			if [[ "$path" == "$allowed" ]]; then
				skip=true
				break
			fi
		done
		[[ "$skip" == true ]] || printf '%s\t%s\n' "$digest" "$path" >>"$output_file"
	done <"$input_file"
}

agent_validate_generated_files() {
	local baseline_manifest="$1"
	shift
	local path after_manifest before_filtered after_filtered

	for path in "$@"; do
		if [[ -L "$path" || ! -f "$path" || ! -s "$path" ]]; then
			echo "ERROR: Agent output must be a non-empty regular file: $path" >&2
			return 1
		fi
	done

	after_manifest=$(mktemp)
	before_filtered=$(mktemp)
	after_filtered=$(mktemp)
	agent_snapshot_worktree "$after_manifest"
	agent_filter_manifest "$baseline_manifest" "$before_filtered" "$@"
	agent_filter_manifest "$after_manifest" "$after_filtered" "$@"

	if ! cmp -s "$before_filtered" "$after_filtered"; then
		rm -f "$after_manifest" "$before_filtered" "$after_filtered"
		echo "ERROR: Agent changed files outside the allowed output contract" >&2
		return 1
	fi

	rm -f "$after_manifest" "$before_filtered" "$after_filtered"
	if ! git diff --check -- "$@"; then
		echo "ERROR: Agent output failed git diff validation" >&2
		return 1
	fi
}

agent_collect_changed_paths() {
	local baseline_manifest="$1" output_file="$2" after_manifest
	after_manifest=$(mktemp)
	agent_snapshot_worktree "$after_manifest"

	python3 - "$baseline_manifest" "$after_manifest" "$output_file" <<'PY'
import sys


def read_manifest(path):
    entries = {}
    with open(path, encoding="utf-8") as manifest:
        for line in manifest:
            digest, name = line.rstrip("\n").split("\t", 1)
            entries[name] = digest
    return entries


before = read_manifest(sys.argv[1])
after = read_manifest(sys.argv[2])
changed = sorted(
    path for path in before.keys() | after.keys()
    if before.get(path) != after.get(path)
)
with open(sys.argv[3], "w", encoding="utf-8") as output:
    for path in changed:
        output.write(f"{path}\n")
PY

	rm -f "$after_manifest"
}

agent_validate_maintenance_files() {
	local baseline_manifest="$1" changed_paths_file="$2" path
	agent_collect_changed_paths "$baseline_manifest" "$changed_paths_file"

	while IFS= read -r path; do
		[[ -n "$path" ]] || continue
		if ! agent_path_matches_patterns "$path" "${AGENT_MAINTENANCE_ALLOWED_PATTERNS[@]}"; then
			echo "ERROR: Knowledge maintenance changed a file outside pages/: $path" >&2
			return 1
		fi
		if agent_path_matches_patterns "$path" "${AGENT_MAINTENANCE_PROTECTED_PATTERNS[@]}"; then
			echo "ERROR: Knowledge maintenance changed a generated report or planning page: $path" >&2
			return 1
		fi
		if [[ -L "$path" || ! -f "$path" || ! -s "$path" ]]; then
			echo "ERROR: Knowledge maintenance output must be a non-empty regular file: $path" >&2
			return 1
		fi
	done <"$changed_paths_file"

	if [[ -s "$changed_paths_file" ]]; then
		local changed_paths=()
		while IFS= read -r path; do
			[[ -n "$path" ]] && changed_paths+=("$path")
		done <"$changed_paths_file"
		git diff --check -- "${changed_paths[@]}" || {
			echo "ERROR: Knowledge maintenance output failed git diff validation" >&2
			return 1
		}
	fi
}

agent_bot_ssh_command() {
	local key_file="$1"
	printf '/usr/bin/ssh -F /dev/null -o HostName=github.com -o ProxyCommand=none -o ProxyJump=none -o BatchMode=yes -o IdentitiesOnly=yes -o IdentityAgent=none -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -i %q' "$key_file"
}

agent_validate_bot_ssh_key() {
	local key_file="$1"
	if [[ -L "$key_file" || ! -f "$key_file" ]]; then
		echo "ERROR: Bot SSH key must be a regular non-symlink file: $key_file" >&2
		return 1
	fi
	if [[ "$(agent_stat_owner "$key_file")" != "$(id -u)" ]]; then
		echo "ERROR: Bot SSH key must be owned by the current user: $key_file" >&2
		return 1
	fi
	if [[ "$(agent_stat_mode "$key_file")" != "600" ]]; then
		echo "ERROR: Bot SSH key must have mode 0600: $key_file" >&2
		return 1
	fi
}

agent_validate_bot_git_config() {
	local gitconfig="$1" keys expected_keys expected_ssh_command
	if [[ -L "$gitconfig" || ! -f "$gitconfig" ]]; then
		echo "ERROR: Bot Git config must be a regular non-symlink file: $gitconfig" >&2
		return 1
	fi
	if [[ "$(git config --file "$gitconfig" user.name)" != "$AGENT_BOT_GITHUB_LOGIN" ]]; then
		echo "ERROR: Bot Git config user.name must be $AGENT_BOT_GITHUB_LOGIN" >&2
		return 1
	fi
	if [[ "$(git config --file "$gitconfig" user.email)" != "$AGENT_BOT_GIT_EMAIL" ]]; then
		echo "ERROR: Bot Git config has an unexpected user.email" >&2
		return 1
	fi
	expected_ssh_command="/usr/bin/ssh -F /dev/null -o HostName=github.com -o ProxyCommand=none -o ProxyJump=none -o BatchMode=yes -o IdentitiesOnly=yes -o IdentityAgent=none -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -i $AGENT_BOT_SIGNING_KEY_CONFIG"
	if [[ "$(git config --file "$gitconfig" user.signingkey)" != "$AGENT_BOT_SIGNING_KEY_CONFIG" || \
		"$(git config --file "$gitconfig" commit.gpgsign)" != "true" || \
		"$(git config --file "$gitconfig" gpg.format)" != "ssh" || \
		"$(git config --file "$gitconfig" core.sshCommand)" != "$expected_ssh_command" ]]; then
		echo "ERROR: Bot Git config signing or SSH settings do not match the approved contract" >&2
		return 1
	fi
	expected_keys=$'commit.gpgsign\ncore.sshcommand\ngpg.format\nuser.email\nuser.name\nuser.signingkey'
	keys=$(git config --file "$gitconfig" --name-only --get-regexp '.*' | LC_ALL=C sort)
	if [[ "$keys" != "$expected_keys" ]]; then
		echo "ERROR: Bot Git config contains settings outside the approved contract" >&2
		return 1
	fi
}

agent_bot_git() {
	local gitconfig="$1" key_file="$2"
	shift 2
	env \
		-u GH_TOKEN \
		-u GITHUB_TOKEN \
		-u GH_TOKEN_BOT \
		-u GIT_ASKPASS \
		-u SSH_ASKPASS \
		-u GIT_CONFIG \
		-u GIT_CONFIG_COUNT \
		-u GIT_CONFIG_PARAMETERS \
		-u GIT_EXEC_PATH \
		-u SSH_AGENT_PID \
		-u SSH_AUTH_SOCK \
		GIT_CONFIG_GLOBAL="$gitconfig" \
		GIT_CONFIG_NOSYSTEM=1 \
		GIT_TERMINAL_PROMPT=0 \
		GIT_SSH_COMMAND="$(agent_bot_ssh_command "$key_file")" \
		git \
		-c credential.helper= \
		-c user.name="$AGENT_BOT_GITHUB_LOGIN" \
		-c user.email="$AGENT_BOT_GIT_EMAIL" \
		-c user.signingkey="$key_file" \
		-c commit.gpgsign=true \
		-c gpg.format=ssh \
		-c gpg.ssh.program=/usr/bin/ssh-keygen \
		-c core.hooksPath=/dev/null \
		-c core.fsmonitor=false \
		"$@"
}

agent_validate_origin() {
	local remote_url unsafe_config
	remote_url=$(git remote get-url origin 2>/dev/null) || {
		echo "ERROR: Git remote origin is missing" >&2
		return 1
	}
	if [[ "$remote_url" != "git@github.com:$AGENT_GITHUB_REPOSITORY.git" ]]; then
		echo "ERROR: Git remote origin must be git@github.com:$AGENT_GITHUB_REPOSITORY.git" >&2
		return 1
	fi
	unsafe_config=$(git config --local --name-only --get-regexp \
		'^(include(path)?\.|url\.|http\.|https\.|credential\.|core\.sshcommand$|remote\..*\.(pushurl|proxy|proxyauthmethod|uploadpack|receivepack)$)' 2>/dev/null || true)
	if [[ -n "$unsafe_config" ]]; then
		echo "ERROR: Local Git config contains network or credential overrides: $unsafe_config" >&2
		return 1
	fi
}

agent_validate_bot_transport() {
	local gitconfig="$1" key_file="$2" output status
	agent_validate_bot_git_config "$gitconfig" || return 1
	agent_validate_bot_ssh_key "$key_file" || return 1
	agent_validate_origin || return 1

	if output=$(/usr/bin/ssh -T \
		-F /dev/null \
		-o HostName=github.com \
		-o ProxyCommand=none \
		-o ProxyJump=none \
		-o BatchMode=yes \
		-o IdentitiesOnly=yes \
		-o IdentityAgent=none \
		-o PasswordAuthentication=no \
		-o KbdInteractiveAuthentication=no \
		-i "$key_file" \
		git@github.com 2>&1); then
		status=0
	else
		status=$?
	fi
	if [[ "$status" -ne 1 || "$output" != *"Hi $AGENT_BOT_GITHUB_LOGIN! You've successfully authenticated"* ]]; then
		echo "ERROR: Bot SSH key did not authenticate as $AGENT_BOT_GITHUB_LOGIN" >&2
		return 1
	fi
	if ! agent_bot_git "$gitconfig" "$key_file" ls-remote origin HEAD >/dev/null 2>&1; then
		echo "ERROR: Bot SSH key cannot read $AGENT_GITHUB_REPOSITORY" >&2
		return 1
	fi
}

agent_gh() {
	local token="$1"
	shift
	env \
		-u GH_TOKEN_BOT \
		-u GH_ENTERPRISE_TOKEN \
		-u GITHUB_ENTERPRISE_TOKEN \
		-u GH_HTTP_UNIX_SOCKET \
		-u GIT_ASKPASS \
		GH_TOKEN="$token" \
		GITHUB_TOKEN= \
		GH_HOST=github.com \
		GH_PROMPT_DISABLED=1 \
		gh "$@"
}

agent_github_token_scopes() {
	local token="$1"
	agent_gh "$token" api --include user 2>/dev/null |
		tr -d '\r' |
		awk 'tolower($0) ~ /^x-oauth-scopes:[[:space:]]*/ {
			sub(/^[^:]*:[[:space:]]*/, "")
			print
			exit
		}'
}

agent_github_token_expiration() {
	local token="$1"
	agent_gh "$token" api --include user 2>/dev/null |
		tr -d '\r' |
		awk 'tolower($0) ~ /^github-authentication-token-expiration:[[:space:]]*/ {
			sub(/^[^:]*:[[:space:]]*/, "")
			print
			exit
		}'
}

agent_validate_work_token() {
	local token="$1" login scopes
	if ! login=$(agent_gh "$token" api user --jq .login 2>/dev/null); then
		echo "ERROR: Company GitHub authentication failed" >&2
		return 1
	fi
	if [[ "$login" != "$AGENT_WORK_GITHUB_LOGIN" ]]; then
		echo "ERROR: Company GitHub token has an unexpected owner: $login" >&2
		return 1
	fi
	scopes=$(agent_github_token_scopes "$token") || return 1
	if [[ -z "$scopes" ]]; then
		echo "ERROR: Company GitHub credential must be the accepted classic token" >&2
		return 1
	fi
}

agent_validate_bot_token() {
	local token="$1" repository="$2" login scopes expiration push admin repositories organizations
	local accessible_repository allowed_repository repository_allowed repository_found=false
	if ! login=$(agent_gh "$token" api user --jq .login 2>/dev/null); then
		echo "ERROR: Bot GitHub authentication failed" >&2
		return 1
	fi
	if [[ "$login" != "$AGENT_BOT_GITHUB_LOGIN" ]]; then
		echo "ERROR: GH_TOKEN_BOT identifies as $login, expected $AGENT_BOT_GITHUB_LOGIN" >&2
		return 1
	fi

	scopes=$(agent_github_token_scopes "$token") || return 1
	if [[ "${scopes// /}" != "repo" ]]; then
		echo "ERROR: GH_TOKEN_BOT must be a classic PAT with only the repo scope" >&2
		return 1
	fi
	expiration=$(agent_github_token_expiration "$token") || return 1
	if [[ -z "$expiration" ]] || ! python3 - "$expiration" <<'PY'
from datetime import datetime, timezone
import sys

try:
    expiration = datetime.strptime(sys.argv[1], "%Y-%m-%d %H:%M:%S %Z").replace(tzinfo=timezone.utc)
except ValueError:
    raise SystemExit(1)
raise SystemExit(expiration <= datetime.now(timezone.utc))
PY
	then
		echo "ERROR: GH_TOKEN_BOT must have a valid future expiration" >&2
		return 1
	fi

	if ! repositories=$(agent_gh "$token" api --paginate \
		'user/repos?affiliation=owner,collaborator,organization_member&per_page=100' \
		--jq '.[].full_name' 2>/dev/null); then
		echo "ERROR: Could not audit repositories available to $AGENT_BOT_GITHUB_LOGIN" >&2
		return 1
	fi
	repositories=$(printf '%s\n' "$repositories" | sed '/^$/d' | LC_ALL=C sort -u)
	while IFS= read -r accessible_repository; do
		[[ -n "$accessible_repository" ]] || continue
		repository_allowed=false
		for allowed_repository in "${AGENT_BOT_GITHUB_REPOSITORY_ALLOWLIST[@]}"; do
			if [[ "$accessible_repository" == "$allowed_repository" ]]; then
				repository_allowed=true
				break
			fi
		done
		if [[ "$repository_allowed" != true ]]; then
			echo "ERROR: Bot repository is not allowlisted: $accessible_repository" >&2
			return 1
		fi
		[[ "$accessible_repository" == "$repository" ]] && repository_found=true

		if ! push=$(agent_gh "$token" api "repos/$accessible_repository" --jq '.permissions.push // false' 2>/dev/null); then
			echo "ERROR: Bot token cannot access $accessible_repository" >&2
			return 1
		fi
		admin=$(agent_gh "$token" api "repos/$accessible_repository" --jq '.permissions.admin // false' 2>/dev/null) || return 1
		if [[ "$push" != "true" || "$admin" != "false" ]]; then
			echo "ERROR: Bot must have write access, but not admin access, to $accessible_repository" >&2
			return 1
		fi
	done <<<"$repositories"
	if [[ "$repository_found" != true ]]; then
		echo "ERROR: Bot token cannot access required repository: $repository" >&2
		return 1
	fi

	if ! organizations=$(agent_gh "$token" api --paginate \
		'user/memberships/orgs?state=active&per_page=100' \
		--jq '.[].organization.login' 2>/dev/null); then
		echo "ERROR: Could not audit organizations available to $AGENT_BOT_GITHUB_LOGIN" >&2
		return 1
	fi
	if [[ -n "$organizations" ]]; then
		echo "ERROR: $AGENT_BOT_GITHUB_LOGIN must not belong to a GitHub organization" >&2
		return 1
	fi
}

agent_path_is_allowed() {
	local path="$1"
	shift
	local allowed
	for allowed in "$@"; do
		[[ "$path" == "$allowed" ]] && return 0
	done
	return 1
}

agent_path_matches_patterns() {
	local path="$1" pattern
	shift
	for pattern in "$@"; do
		[[ "$path" == $pattern ]] && return 0
	done
	return 1
}

agent_commit_files() {
	local gitconfig="$1" key_file="$2" message="$3"
	shift 3
	local path
	if [[ "$#" -eq 0 ]]; then
		echo "ERROR: No approved files were provided for commit" >&2
		return 1
	fi

	git add -- "$@"
	while IFS= read -r path; do
		[[ -n "$path" ]] || continue
		if ! agent_path_is_allowed "$path" "$@"; then
			echo "ERROR: Refusing to commit unapproved staged file: $path" >&2
			return 1
		fi
	done < <(git diff --cached --name-only)

	if ! git diff --cached --quiet; then
		agent_bot_git "$gitconfig" "$key_file" commit -m "$message"
	fi
}

agent_push_branch() {
	local gitconfig="$1" key_file="$2" branch="$3"
	agent_validate_origin || return 1
	agent_bot_git "$gitconfig" "$key_file" push origin "$branch"
}

agent_publish_pull_request() {
	local token="$1" repository="$2" branch="$3" base="$4" title="$5" body_file="$6" comment_body="$7"
	local owner pr_number
	if [[ -L "$body_file" || ! -f "$body_file" || ! -s "$body_file" ]]; then
		echo "ERROR: Pull request body must be a non-empty regular file: $body_file" >&2
		return 1
	fi
	owner="${repository%%/*}"

	pr_number=$(agent_gh "$token" api \
		--method GET \
		"repos/$repository/pulls" \
		--field state=open \
		--field "head=$owner:$branch" \
		--field "base=$base" \
		--jq '.[0].number // empty') || return 1

	if [[ -z "$pr_number" ]]; then
		pr_number=$(agent_gh "$token" api \
			--method POST \
			"repos/$repository/pulls" \
			--raw-field "title=$title" \
			--raw-field "head=$branch" \
			--raw-field "base=$base" \
			--field "body=@$body_file" \
			--jq .number) || return 1
		if [[ -z "$pr_number" ]]; then
			echo "ERROR: Pull request creation did not return an open pull request" >&2
			return 1
		fi
	else
		agent_gh "$token" api \
			--method PATCH \
			"repos/$repository/pulls/$pr_number" \
			--raw-field "title=$title" \
			--field "body=@$body_file" >/dev/null || return 1
	fi
	agent_gh "$token" api \
		--method POST \
		"repos/$repository/pulls/$pr_number/requested_reviewers" \
		--field "reviewers[]=$AGENT_GITHUB_REVIEWER" >/dev/null || return 1
	agent_gh "$token" api \
		--method POST \
		"repos/$repository/issues/$pr_number/assignees" \
		--field "assignees[]=$AGENT_BOT_GITHUB_LOGIN" >/dev/null || return 1

	if [[ -n "$comment_body" ]]; then
		agent_gh "$token" pr comment "$pr_number" \
			--repo "$repository" \
			--body "$comment_body" >/dev/null || return 1
	fi
	printf '%s\n' "$pr_number"
}

agent_validate_master_ruleset() {
	local token="$1" repository="$2" default_branch="$3" ids details id
	ids=$(agent_gh "$token" api --paginate "repos/$repository/rulesets?includes_parents=false" --jq '.[].id') || {
		echo "ERROR: Could not inspect repository rulesets" >&2
		return 1
	}
	details=""
	while IFS= read -r id; do
		[[ -n "$id" ]] || continue
		details+="$(agent_gh "$token" api "repos/$repository/rulesets/$id")"$'\n' || return 1
	done <<<"$ids"

	if ! printf '%s' "$details" | python3 -c '
import fnmatch
import json
import sys

branch = sys.argv[1]
required = set(sys.argv[2:])
found = set()
matched = False

for line in sys.stdin:
    if not line.strip():
        continue
    ruleset = json.loads(line)
    if ruleset.get("enforcement") != "active" or ruleset.get("target") != "branch":
        continue
    conditions = ruleset.get("conditions", {}).get("ref_name", {})
    includes = conditions.get("include", [])
    excludes = conditions.get("exclude", [])
    patterns = {
        "~ALL": "refs/heads/*",
        "~DEFAULT_BRANCH": f"refs/heads/{branch}",
    }
    targets_branch = any(
        fnmatch.fnmatch(f"refs/heads/{branch}", patterns.get(pattern, pattern))
        for pattern in includes
    )
    excludes_branch = any(
        fnmatch.fnmatch(f"refs/heads/{branch}", patterns.get(pattern, pattern))
        for pattern in excludes
    )
    if not targets_branch or excludes_branch:
        continue
    matched = True
    if ruleset.get("bypass_actors"):
        raise SystemExit(1)
    found.update(rule.get("type") for rule in ruleset.get("rules", []))

raise SystemExit(not matched or not required.issubset(found))
' "$default_branch" "${AGENT_REQUIRED_RULESET_TYPES[@]}"; then
		echo "ERROR: master must require pull requests and block force-push, deletion, and bypass" >&2
		return 1
	fi
}

agent_validate_launchd_auth() {
	local plist="$1" shared_mode="" legacy_mode="" mode
	shared_mode=$(plutil -extract EnvironmentVariables.AGENT_SECRET_AUTH raw "$plist" 2>/dev/null) || shared_mode=""
	legacy_mode=$(plutil -extract EnvironmentVariables.LOGSEQ_REPORT_AUTH raw "$plist" 2>/dev/null) || legacy_mode=""

	if [[ -n "$shared_mode" && -n "$legacy_mode" && "$shared_mode" != "$legacy_mode" ]]; then
		echo "ERROR: launchd authentication selectors conflict" >&2
		return 1
	fi
	mode="${shared_mode:-$legacy_mode}"
	if [[ -z "$mode" ]]; then
		echo "ERROR: Could not read launchd authentication mode from $plist" >&2
		return 1
	fi
	if [[ "$mode" != "service-account" ]]; then
		echo "ERROR: launchd must select service-account authentication" >&2
		return 1
	fi
}

agent_doctor() {
	local repo_dir="$1" gitconfig="$2" plist="$3"

	if [[ "$(pwd -P)" != "$(cd "$repo_dir" && pwd -P)" ]]; then
		echo "ERROR: Doctor must run from the repository root: $repo_dir" >&2
		return 1
	fi
	echo "Checking local prerequisites..."
	agent_validate_local_prerequisites || return 1
	command -v plutil >/dev/null 2>&1 || {
		echo "ERROR: Required command was not found: plutil" >&2
		return 1
	}
	agent_resolver doctor || return 1
	agent_run_preflight || return 1
	agent_validate_bot_transport "$gitconfig" "$AGENT_BOT_SSH_KEY" || return 1
	agent_run_publisher doctor --repo "$AGENT_GITHUB_REPOSITORY" || return 1
	agent_validate_launchd_auth "$plist" || return 1

	agent_unset_publishing_credentials
	echo "Doctor checks passed for $(agent_auth_mode) mode."
}

agent_validate_local_prerequisites() {
	local command_name executable
	for command_name in git gh python3 ssh; do
		if ! command -v "$command_name" >/dev/null 2>&1; then
			echo "ERROR: Required command was not found: $command_name" >&2
			return 1
		fi
	done

	for executable in "$AGENT_BIN" "$AGENT_SECRETS_BIN" "$AGENT_PREFLIGHT_BIN" "$AGENT_PUBLISHER_BIN"; do
		if [[ ! -x "$executable" ]]; then
			echo "ERROR: Required executable was not found: $executable" >&2
			return 1
		fi
	done
}

agent_setup() {
	local agent="$1"
	case "$agent" in
	amp)
		AGENT_BIN="$AGENT_AMP_BIN"
		;;
	claude)
		AGENT_BIN="$AGENT_CLAUDE_BIN"
		;;
	*)
		echo "ERROR: Unsupported agent: $agent (supported: amp, claude)" >&2
		return 1
		;;
	esac
}
# Runs the agent non-interactively with the given prompt file. Stdout+stderr go to output_file.
# Populates AGENT_THREAD_ID, AGENT_THREAD_URL, AGENT_RESULT on success.
# Usage: agent_run <agent> <prompt_file> <output_file> [label]
agent_run() {
	local agent="$1" prompt_file="$2" output_file="$3" label="${4:-}"
	case "$agent" in
	amp)
		local amp_args=(-x --mode medium --dangerously-allow-all --stream-json --no-archive-after-execute)
		[[ -n "$label" ]] && amp_args+=(--label "$label")
		cat "$prompt_file" | GH_HOST=github.com GH_HTTP_UNIX_SOCKET= GH_PROMPT_DISABLED=1 \
			GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_SSH_COMMAND=/usr/bin/false \
			GIT_TERMINAL_PROMPT=0 \
			agent_resolver_with_bundles "${AGENT_AMP_BUNDLES[@]}" -- "$AGENT_BIN" "${amp_args[@]}" >"$output_file" 2>&1
		AGENT_THREAD_ID=$(grep -o '"session_id":"[^"]*"' "$output_file" | head -1 | cut -d'"' -f4)
		AGENT_RESULT=$(grep -o '"result":"[^"]*"' "$output_file" | tail -1 | cut -d'"' -f4 || echo "(no result)")
		AGENT_THREAD_URL="https://ampcode.com/threads/$AGENT_THREAD_ID"
		;;
	claude)
		# --output-format json → single JSON object with session_id, result, total_cost_usd
		# --permission-mode acceptEdits → auto-approve file writes + common fs commands
		# --allowedTools → broad allowlist; claude -p's bash parenthesis syntax is buggy
		#                  so we grant the full Bash tool here.
		cat "$prompt_file" | GH_HOST=github.com GH_HTTP_UNIX_SOCKET= GH_PROMPT_DISABLED=1 \
			GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_SSH_COMMAND=/usr/bin/false \
			GIT_TERMINAL_PROMPT=0 \
			agent_resolver_with_bundles "${AGENT_CLAUDE_BUNDLES[@]}" -- "$AGENT_BIN" -p \
			--output-format json \
			--permission-mode acceptEdits \
			--allowedTools "$AGENT_CLAUDE_ALLOWED_TOOLS" \
			>"$output_file" 2>&1
		AGENT_THREAD_ID=$(grep -o '"session_id":"[^"]*"' "$output_file" | head -1 | cut -d'"' -f4)
		AGENT_RESULT=$(grep -o '"result":"[^"]*"' "$output_file" | head -1 | cut -d'"' -f4 || echo "(no result)")
		if [[ -n "$AGENT_THREAD_ID" ]]; then
			AGENT_THREAD_URL="(claude session: $AGENT_THREAD_ID)"
		else
			AGENT_THREAD_URL="(claude session: unknown)"
		fi
		;;
	esac
}
