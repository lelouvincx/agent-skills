#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$REPO_DIR/skills"
BIN_DIR="$REPO_DIR/bin"
AGENTS_DIR="$HOME/.config/agents/skills"
LOCAL_BIN="$HOME/.local/bin"

mkdir -p "$AGENTS_DIR" "$LOCAL_BIN"

# --- Skills ---

# Remove stale symlinks pointing into our skills dir
for link in "$AGENTS_DIR"/*; do
	[ -L "$link" ] || continue
	target="$(readlink "$link")"
	if [[ "$target" == "$SKILLS_DIR"/* && ! -d "$target" ]]; then
		echo "removing stale: $(basename "$link")"
		rm "$link"
	fi
done

# Create/update symlinks for each skill
for skill in "$SKILLS_DIR"/*/; do
	name="$(basename "$skill")"
	link="$AGENTS_DIR/$name"
	if [ -L "$link" ] && [ "$(readlink "$link")" = "$skill" ]; then
		echo "ok: $name"
	else
		ln -sfn "$skill" "$link"
		echo "linked: $name -> $skill"
	fi
done

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
