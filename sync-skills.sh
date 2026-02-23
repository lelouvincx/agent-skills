#!/usr/bin/env bash
set -euo pipefail

SKILLS_DIR="$(cd "$(dirname "$0")" && pwd)/skills"
AGENTS_DIR="$HOME/.config/agents"

mkdir -p "$AGENTS_DIR"

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
