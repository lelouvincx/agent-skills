#!/usr/bin/env bash
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
export HOME="$scratch/home"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL="$HOME/.gitconfig"
mkdir -p "$HOME/.local/bin" "$scratch/upstream/.agents"
export PATH="$HOME/.local/bin:$PATH"
export MARKER="$scratch/marker"

# Exercise real pulls, but never install packages or project into the live HOME.
for tool in uv uvx op rsync entire entire-agent-amp; do
	printf '#!/usr/bin/env bash\nexit 0\n' > "$HOME/.local/bin/$tool"
	chmod +x "$HOME/.local/bin/$tool"
done
for tool in curl wget apt-get sudo go; do
	printf '#!/usr/bin/env bash\necho "unexpected installer: %s" >&2\nexit 99\n' "$tool" > "$HOME/.local/bin/$tool"
	chmod +x "$HOME/.local/bin/$tool"
done
cp "$root/.agents/setup" "$scratch/upstream/.agents/setup"
printf '#!/usr/bin/env bash\nprintf "stale-body\\n" >> "$MARKER"\n' > "$scratch/upstream/sync-skills.sh"
chmod +x "$scratch/upstream/.agents/setup" "$scratch/upstream/sync-skills.sh"
git -C "$scratch/upstream" init -q -b main
git -C "$scratch/upstream" add .
git -C "$scratch/upstream" -c user.name=Fixture -c user.email=fixture@example.invalid -c commit.gpgsign=false commit -qm initial
git clone -q "$scratch/upstream" "$scratch/checkout"
cp "$root/.agents/setup" "$scratch/copied-setup"

cat > "$scratch/upstream/.agents/setup" <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
test "$AGENT_SKILLS_REPO" = "$EXPECTED_REPO"
test "$AGENT_SKILLS_DIR" = "$EXPECTED_DIR"
test "$1" = 'argument with spaces'
printf 'current-body\n' >> "$MARKER"
HOOK
git -C "$scratch/upstream" add .
git -C "$scratch/upstream" -c user.name=Fixture -c user.email=fixture@example.invalid -c commit.gpgsign=false commit -qm updated
export AGENT_SKILLS_REPO="$scratch/upstream" EXPECTED_REPO="$scratch/upstream"
export AGENT_SKILLS_DIR="$scratch/checkout" EXPECTED_DIR="$scratch/checkout"
bash "$scratch/checkout/.agents/setup" 'argument with spaces'
test "$(cat "$MARKER")" = current-body
echo 'PASS: stale setup hands off to updated body before installer work'

# A copied bootstrap must also hand off when cloning or targeting a current repo.
for destination in "$scratch/new-checkout" "$scratch/checkout"; do
	rm "$MARKER"
	export AGENT_SKILLS_DIR="$destination" EXPECTED_DIR="$destination"
	bash "$scratch/copied-setup" 'argument with spaces'
	test "$(cat "$MARKER")" = current-body
done
echo 'PASS: copied setup delegates to missing and already-current destinations'

rm "$MARKER"
bash "$AGENT_SKILLS_DIR/.agents/setup" 'argument with spaces'
test "$(cat "$MARKER")" = current-body
echo 'PASS: warm invocation completes once'

# Every lifecycle entry point must preserve a selected checkout. Use real local
# Git repositories, with only installers and projection replaced by harmless tools.
mkdir -p "$scratch/safety-upstream/.agents"
cp "$root/.agents/"{setup,resume,pre-setup} "$scratch/safety-upstream/.agents/"
printf 'original\n' > "$scratch/safety-upstream/tracked"
cat > "$scratch/safety-upstream/sync-skills.sh" <<'SYNC'
#!/usr/bin/env bash
printf 'projection:%s\n' "$*" >> "$MARKER"
SYNC
chmod +x "$scratch/safety-upstream/sync-skills.sh"
git -C "$scratch/safety-upstream" init -q -b main
git -C "$scratch/safety-upstream" add .
git -C "$scratch/safety-upstream" -c user.name=Fixture -c user.email=fixture@example.invalid -c commit.gpgsign=false commit -qm initial
export AGENT_SKILLS_REPO="$scratch/safety-upstream"

# Count refreshes without mocking their results (in particular --ff-only errors).
export REAL_GIT="$(command -v git)" GIT_OPERATIONS="$scratch/git-operations"
cat > "$HOME/.local/bin/git" <<'GIT'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GIT_OPERATIONS"
exec "$REAL_GIT" "$@"
GIT
chmod +x "$HOME/.local/bin/git"

safety_case() (
	set -e
	local hook="$1" scenario="$2" case_dir="$scratch/$1-$2"
	mkdir -p "$case_dir"
	export AGENT_SKILLS_DIR="$case_dir/checkout"
	export MARKER="$case_dir/projection"
	local original_head expected_head status_before
	case "$scenario" in
		noncheckout)
			mkdir -p "$AGENT_SKILLS_DIR"
			printf 'keep me\n' > "$AGENT_SKILLS_DIR/sentinel"
			;;
		file)
			printf 'keep me\n' > "$AGENT_SKILLS_DIR"
			;;
		dangling-symlink)
			ln -s "$case_dir/missing" "$AGENT_SKILLS_DIR"
			;;
		absent) ;;
		*)
			git clone -q "$AGENT_SKILLS_REPO" "$AGENT_SKILLS_DIR"
			if [[ "$scenario" == linked* ]]; then
				mv "$AGENT_SKILLS_DIR" "$case_dir/main"
				git -C "$case_dir/main" worktree add -qb linked "$AGENT_SKILLS_DIR"
				git -C "$AGENT_SKILLS_DIR" branch -qu origin/main
			fi
			if [ "$scenario" = subdir ]; then
				mkdir "$AGENT_SKILLS_DIR/nested"
				export AGENT_SKILLS_DIR="$AGENT_SKILLS_DIR/nested"
				printf 'keep me\n' > "$AGENT_SKILLS_DIR/sentinel"
			fi
			original_head="$(git -C "$AGENT_SKILLS_DIR" rev-parse HEAD)"
			case "$scenario" in
				tracked|staged|linked-dirty)
					printf 'local edit\n' >> "$AGENT_SKILLS_DIR/tracked"
					if [ "$scenario" = staged ]; then
						git -C "$AGENT_SKILLS_DIR" add tracked
					fi
					;;
				untracked)
					mkdir "$AGENT_SKILLS_DIR/untracked"
					printf 'keep me\n' > "$AGENT_SKILLS_DIR/untracked/sentinel"
					git -C "$AGENT_SKILLS_DIR" config status.showUntrackedFiles no
					;;
				ff-failure)
					printf 'local commit\n' > "$AGENT_SKILLS_DIR/local-only"
					git -C "$AGENT_SKILLS_DIR" add local-only
					git -C "$AGENT_SKILLS_DIR" -c user.name=Fixture -c user.email=fixture@example.invalid -c commit.gpgsign=false commit -qm divergent
					original_head="$(git -C "$AGENT_SKILLS_DIR" rev-parse HEAD)"
					;;
			esac
			status_before="$(git -C "$AGENT_SKILLS_DIR" status --porcelain --untracked-files=all)"
			;;
	esac
	printf '%s %s\n' "$hook" "$scenario" >> "$scratch/safety-upstream/remote-change"
	git -C "$scratch/safety-upstream" add remote-change
	git -C "$scratch/safety-upstream" -c user.name=Fixture -c user.email=fixture@example.invalid -c commit.gpgsign=false commit -qm advance
	expected_head="$(git -C "$scratch/safety-upstream" rev-parse HEAD)"
	: > "$GIT_OPERATIONS"
	local exit_status=0
	bash "$root/.agents/$hook" 'argument with spaces' > "$case_dir/output" 2>&1 || exit_status=$?
	case "$scenario" in
		noncheckout|file|dangling-symlink|subdir|ff-failure)
			test "$exit_status" -ne 0
			test ! -e "$MARKER"
			case "$scenario" in
				noncheckout|subdir) test "$(cat "$AGENT_SKILLS_DIR/sentinel")" = 'keep me' ;;
				file) test "$(cat "$AGENT_SKILLS_DIR")" = 'keep me' ;;
				dangling-symlink) test -L "$AGENT_SKILLS_DIR" ;;
				ff-failure) test "$(git -C "$AGENT_SKILLS_DIR" rev-parse HEAD)" = "$original_head" ;;
			esac
			if [ "$scenario" != ff-failure ]; then
				! grep -Eq '(^| )(clone|pull)( |$)' "$GIT_OPERATIONS"
			fi
			;;
		*)
			test "$exit_status" -eq 0
			if [ "$hook" = resume ]; then
				test "$(cat "$MARKER")" = 'projection:'
			else
				test "$(cat "$MARKER")" = 'projection:--remote'
			fi
			case "$scenario" in
				tracked|staged|untracked|linked-dirty)
					test "$(git -C "$AGENT_SKILLS_DIR" rev-parse HEAD)" = "$original_head"
					test "$(git -C "$AGENT_SKILLS_DIR" status --porcelain --untracked-files=all)" = "$status_before"
					! grep -Eq '(^| )(clone|pull)( |$)' "$GIT_OPERATIONS"
					if [ "$scenario" = untracked ]; then
						test "$(cat "$AGENT_SKILLS_DIR/untracked/sentinel")" = 'keep me'
					else
						test "$(cat "$AGENT_SKILLS_DIR/tracked")" = "$(printf 'original\nlocal edit')"
					fi
					;;
				*)
					test "$(git -C "$AGENT_SKILLS_DIR" rev-parse HEAD)" = "$expected_head"
					if [ "$scenario" != absent ]; then
						test "$(grep -c ' pull --ff-only$' "$GIT_OPERATIONS")" -eq 1
					fi
					;;
			esac
			if [[ "$scenario" == linked* ]]; then
				test -f "$AGENT_SKILLS_DIR/.git"
				git -C "$case_dir/main" worktree list --porcelain | grep -Fx "worktree $(cd "$AGENT_SKILLS_DIR" && pwd -P)"
			fi
			;;
	esac
)

failures=0
for hook in setup resume pre-setup; do
	for scenario in absent clean tracked staged untracked noncheckout file dangling-symlink subdir linked linked-dirty ff-failure; do
		# Keep errexit active inside each case while collecting every regression.
		set +e
		safety_case "$hook" "$scenario"
		result=$?
		set -e
		if [ "$result" -eq 0 ]; then
			echo "PASS: $hook preserves checkout safety ($scenario)"
		else
			echo "FAIL: $hook preserves checkout safety ($scenario)" >&2
			cat "$scratch/$hook-$scenario/output" >&2
			failures=$((failures + 1))
		fi
	done
done
test "$failures" -eq 0
