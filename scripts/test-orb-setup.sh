#!/usr/bin/env bash
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
export HOME="$scratch/home"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
mkdir -p "$HOME/.local/bin" "$scratch/upstream/.agents"
export PATH="$HOME/.local/bin:$PATH"
export MARKER="$scratch/marker"

# Exercise real pulls, but never install packages or project into the live HOME.
for tool in uv uvx op rsync; do
	printf '#!/usr/bin/env bash\nexit 0\n' > "$HOME/.local/bin/$tool"
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
