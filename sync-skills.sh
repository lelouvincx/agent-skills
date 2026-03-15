#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$REPO_DIR/skills"
BIN_DIR="$REPO_DIR/bin"
REMOTE_SKILLS_CONFIG="$REPO_DIR/remote-skills.yaml"
CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
LOCAL_BIN="$HOME/.local/bin"

mkdir -p "$CLAUDE_SKILLS_DIR" "$LOCAL_BIN"

# --- Parse YAML (simple parser for our needs) ---

parse_yaml() {
	local yaml_file="$1"
	local skill_name=""
	local skill_url=""
	local skill_enabled=""
	local skill_files=""
	local in_files=false

	_flush_skill() {
		if [[ -n "$skill_name" && -n "$skill_url" && -n "$skill_enabled" ]]; then
			echo "$skill_name|$skill_url|$skill_enabled|$skill_files"
		fi
		skill_name=""
		skill_url=""
		skill_enabled=""
		skill_files=""
		in_files=false
	}

	while IFS= read -r line; do
		# Skip comments and empty lines
		[[ "$line" =~ ^[[:space:]]*# ]] && continue
		[[ -z "${line// }" ]] && continue
		
		# Parse skill entries
		if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*name:[[:space:]]*(.+)$ ]]; then
			_flush_skill
			skill_name="${BASH_REMATCH[1]}"
		elif [[ "$line" =~ ^[[:space:]]*url:[[:space:]]*(.+)$ ]]; then
			skill_url="${BASH_REMATCH[1]}"
			in_files=false
		elif [[ "$line" =~ ^[[:space:]]*enabled:[[:space:]]*(.+)$ ]]; then
			skill_enabled="${BASH_REMATCH[1]}"
			in_files=false
		elif [[ "$line" =~ ^[[:space:]]*files:[[:space:]]*$ ]]; then
			in_files=true
		elif [[ "$in_files" == true ]] && [[ "$line" =~ ^[[:space:]]*-[[:space:]]*(.+)$ ]]; then
			local file_entry="${BASH_REMATCH[1]}"
			if [[ -n "$skill_files" ]]; then
				skill_files="$skill_files,$file_entry"
			else
				skill_files="$file_entry"
			fi
		else
			in_files=false
		fi
	done < "$yaml_file"
	_flush_skill
}

# --- Remote Skills Sync ---

sync_remote_skills() {
	[ -f "$REMOTE_SKILLS_CONFIG" ] || {
		echo "No remote-skills.yaml found, skipping remote sync"
		return 0
	}
	
	echo "Syncing remote skills..."
	echo ""
	
	while IFS='|' read -r name url enabled files; do
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
		if command -v sha256sum &>/dev/null; then
			new_hash=$(sha256sum "$tmp_file" | awk '{print $1}')
		else
			new_hash=$(shasum -a 256 "$tmp_file" | awk '{print $1}')
		fi
		
		# Check if content changed
		local old_hash=""
		if [ -f "$remote_source" ]; then
			old_hash=$(grep "^REMOTE_HASH=" "$remote_source" | cut -d'=' -f2)
		fi
		
		local personal_changed=false
		if [ -f "$personal_file" ] && [ -f "$skill_file" ] && [ "$personal_file" -nt "$skill_file" ]; then
			personal_changed=true
		fi

		if [ "$new_hash" = "$old_hash" ] && [ -f "$skill_file" ] && [ "$personal_changed" = false ]; then
			echo "✓ up-to-date"
			rm -f "$tmp_file"
			continue
		fi
		
		echo -n "downloaded, "
		
		# Build final SKILL.md: frontmatter + PERSONAL.md (if exists) + remote body
		if [ -f "$personal_file" ]; then
			# Extract frontmatter and body from remote file
			local in_frontmatter=false
			local frontmatter_done=false
			local frontmatter_lines=()
			local body_lines=()

			while IFS= read -r fmline; do
				if [ "$frontmatter_done" = true ]; then
					body_lines+=("$fmline")
				elif [ "$in_frontmatter" = false ] && [[ "$fmline" == "---" ]]; then
					in_frontmatter=true
					frontmatter_lines+=("$fmline")
				elif [ "$in_frontmatter" = true ] && [[ "$fmline" == "---" ]]; then
					frontmatter_lines+=("$fmline")
					frontmatter_done=true
				elif [ "$in_frontmatter" = true ]; then
					frontmatter_lines+=("$fmline")
				else
					# No frontmatter in file
					body_lines+=("$fmline")
				fi
			done < "$tmp_file"

			{
				# Write frontmatter first (if any)
				for fmline in "${frontmatter_lines[@]+"${frontmatter_lines[@]}"}"; do
					echo "$fmline"
				done
				echo ""
				cat "$personal_file"
				echo ""
				echo "---"
				echo ""
				# Write remote body
				for fmline in "${body_lines[@]+"${body_lines[@]}"}"; do
					echo "$fmline"
				done
			} > "$skill_file"
		else
			cp "$tmp_file" "$skill_file"
		fi
		
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
		
		# Fetch companion files
		if [[ -n "$files" ]]; then
			local base_url="${url%/*}"
			IFS=',' read -ra file_list <<< "$files"
			for file_path in "${file_list[@]}"; do
				local file_url="$base_url/$file_path"
				local file_dest="$skill_dir/$file_path"
				local file_dir
				file_dir="$(dirname "$file_dest")"
				mkdir -p "$file_dir"
				echo -n "  ↳ $file_path: "
				if curl -fsSL "$file_url" -o "$file_dest" 2>/dev/null; then
					echo "✓"
				else
					echo "✗ failed"
				fi
			done
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
