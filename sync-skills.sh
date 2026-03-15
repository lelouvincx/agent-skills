#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$REPO_DIR/skills"
BIN_DIR="$REPO_DIR/bin"
CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
LOCAL_BIN="$HOME/.local/bin"

mkdir -p "$CLAUDE_SKILLS_DIR" "$LOCAL_BIN"

# --- Skills ---

remove_stale_skill_links() {
	local target_dir="$1"
	local link target

	for link in "$target_dir"/*; do
		[ -L "$link" ] || continue
		target="$(readlink "$link")"
		if [[ "$target" == "$SKILLS_DIR"/* && ! -d "$target" ]]; then
			echo "removing stale: $(basename "$link")"
			rm "$link"
		fi
	done
}

sync_skill_links() {
	local target_dir="$1"
	local skill name link

	for skill in "$SKILLS_DIR"/*/; do
		name="$(basename "$skill")"
		link="$target_dir/$name"
		if [ -L "$link" ] && [ "$(readlink "$link")" = "$skill" ]; then
			echo "ok: $name"
		else
			ln -sfn "$skill" "$link"
			echo "linked: $name -> $skill"
		fi
	done
}

remove_stale_skill_links "$CLAUDE_SKILLS_DIR"
sync_skill_links "$CLAUDE_SKILLS_DIR"

# --- CLI scripts (~/.local/bin) ---

# Symlink bin/* scripts
if [ -d "$BIN_DIR" ]; then
	for script in "$BIN_DIR"/*; do
		[ -f "$script" ] || continue
		name="$(basename "$script")"
		link="$LOCAL_BIN/$name"
		if [ -L "$link" ] && [ "$(readlink "$link")" = "$script" ]; then
			echo "ok: bin/$name"
		else
			ln -sfn "$script" "$link"
			echo "linked: bin/$name -> $script"
		fi
	done
fi

# Symlink skill scripts that should be CLI-accessible
for script in "$SKILLS_DIR"/*/scripts/*.sh; do
	[ -f "$script" ] || continue
	name="$(basename "$script")"
	link="$LOCAL_BIN/$name"
	if [ -L "$link" ] && [ "$(readlink "$link")" = "$script" ]; then
		echo "ok: bin/$name"
	else
		ln -sfn "$script" "$link"
		echo "linked: bin/$name -> $script"
	fi
done
