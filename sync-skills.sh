#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$REPO_DIR/skills"
BIN_DIR="$REPO_DIR/bin"
REMOTE_SKILLS_CONFIG="$REPO_DIR/remote-skills.yaml"
CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
LOCAL_BIN="$HOME/.local/bin"
SKILL_TARGET_DIRS=(
	"$AGENTS_DIR"
	"$OPENCODE_DIR"
)

mkdir -p "${SKILL_TARGET_DIRS[@]}" "$LOCAL_BIN"

# --- Parse YAML (simple parser for our needs) ---

parse_yaml() {
	local yaml_file="$1"
	local skill_name=""
	local skill_url=""
	local skill_enabled=""
	
	while IFS= read -r line; do
		# Skip comments and empty lines
		[[ "$line" =~ ^[[:space:]]*# ]] && continue
		[[ -z "${line// }" ]] && continue
		
		# Parse skill entries
		if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*name:[[:space:]]*(.+)$ ]]; then
			skill_name="${BASH_REMATCH[1]}"
			skill_url=""
			skill_enabled=""
		elif [[ "$line" =~ ^[[:space:]]*url:[[:space:]]*(.+)$ ]]; then
			skill_url="${BASH_REMATCH[1]}"
		elif [[ "$line" =~ ^[[:space:]]*enabled:[[:space:]]*(.+)$ ]]; then
			skill_enabled="${BASH_REMATCH[1]}"
			
			# When we have all three values, output them
			if [[ -n "$skill_name" && -n "$skill_url" && -n "$skill_enabled" ]]; then
				echo "$skill_name|$skill_url|$skill_enabled"
				skill_name=""
				skill_url=""
				skill_enabled=""
			fi
		fi
	done < "$yaml_file"
}

# --- Remote Skills Sync ---

sync_remote_skills() {
	[ -f "$REMOTE_SKILLS_CONFIG" ] || {
		echo "No remote-skills.yaml found, skipping remote sync"
		return 0
	}
	
	echo "Syncing remote skills..."
	echo ""
	
	while IFS='|' read -r name url enabled; do
		[[ "$enabled" != "true" ]] && {
			echo "⊘ $name: disabled, skipping"
			continue
		}
		
		local skill_dir="$SKILLS_DIR/$name"
		local skill_file="$skill_dir/SKILL.md"
		local personal_file="$skill_dir/PERSONAL.md"
		local remote_source="$skill_dir/.remote-source"
		local tmp_file="$skill_dir/.remote-tmp"
		
		mkdir -p "$skill_dir"
		
		echo -n "→ $name: fetching remote... "
		
		# Fetch remote content
		if ! curl -fsSL "$url" -o "$tmp_file" 2>/dev/null; then
			echo "✗ failed to fetch"
			rm -f "$tmp_file"
			continue
		fi
		
		# Calculate hash of remote content
		local new_hash
		new_hash=$(shasum -a 256 "$tmp_file" | awk '{print $1}')
		
		# Check if content changed
		local old_hash=""
		if [ -f "$remote_source" ]; then
			old_hash=$(grep "^REMOTE_HASH=" "$remote_source" | cut -d'=' -f2)
		fi
		
		if [ "$new_hash" = "$old_hash" ] && [ -f "$skill_file" ]; then
			echo "✓ up-to-date"
			rm -f "$tmp_file"
			continue
		fi
		
		echo -n "downloaded, "
		
		# Build final SKILL.md: PERSONAL.md (if exists) + remote content
		{
			if [ -f "$personal_file" ]; then
				cat "$personal_file"
				echo ""
				echo "---"
				echo ""
			fi
			cat "$tmp_file"
		} > "$skill_file"
		
		# Update metadata
		cat > "$remote_source" <<-EOF
		SOURCE_URL=$url
		LAST_SYNC=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
		REMOTE_HASH=$new_hash
		EOF
		
		rm -f "$tmp_file"
		
		if [ -f "$personal_file" ]; then
			echo "✓ merged with PERSONAL.md"
		else
			echo "✓ generated"
		fi
		
	done < <(parse_yaml "$REMOTE_SKILLS_CONFIG")
	
	echo ""
}

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

# Check for --remote flag
if [[ "${1:-}" == "--remote" ]]; then
	sync_remote_skills
fi

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
