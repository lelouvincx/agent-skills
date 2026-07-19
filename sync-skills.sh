#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$REPO_DIR/skills"
BIN_DIR="$REPO_DIR/bin"
AMP_DIR="$REPO_DIR/amp"
REMOTE_SKILLS_CONFIG="$REPO_DIR/remote-skills.yaml"
CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
AGENTS_SKILLS_DIR="$HOME/.agents/skills"
AMP_CONFIG_DIR="${AMP_CONFIG_DIR:-$HOME/.config/amp}"
LOCAL_BIN="$HOME/.local/bin"

mkdir -p "$CLAUDE_SKILLS_DIR" "$AGENTS_SKILLS_DIR" "$LOCAL_BIN"

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

sync_companion_files() {
	local skill_dir="$1"
	local url="$2"
	local files="$3"
	local missing_only="$4"
	local base_url="${url%/*}"
	local file_path file_url file_dest file_dir
	local -a file_list

	[[ -z "$files" ]] && return 0
	IFS=',' read -ra file_list <<< "$files"
	for file_path in "${file_list[@]}"; do
		file_dest="$skill_dir/$file_path"
		[[ "$missing_only" == true && -f "$file_dest" ]] && continue
		file_url="$base_url/$file_path"
		file_dir="$(dirname "$file_dest")"
		mkdir -p "$file_dir"
		echo -n "  ↳ $file_path: "
		if curl -fsSL "$file_url" -o "$file_dest" 2>/dev/null; then
			echo "✓"
		else
			echo "✗ failed"
		fi
	done
}

# --- Remote Skills Sync ---

sync_remote_skills() {
	[ -f "$REMOTE_SKILLS_CONFIG" ] || {
		echo "No remote-skills.yaml found, skipping remote sync"
		return 0
	}

	# One-time cleanup for retired upstream artifacts.
	rm -rf "$SKILLS_DIR/to-prd"
	rm -f "$SKILLS_DIR/tdd/refactoring.md"

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

		# Normalize frontmatter and remove controls unsupported by Amp.
		if [[ "$(head -n 1 "$tmp_file")" == "---" ]]; then
			if ! awk '
				NR == 1 { in_frontmatter = 1; print; next }
				in_frontmatter && $0 == "---" { in_frontmatter = 0; closed = 1; print; next }
				in_frontmatter && /^disable-model-invocation:[[:space:]]*/ { next }
				{ print }
				END { if (!closed) exit 1 }
			' "$tmp_file" > "${tmp_file}.amp"; then
				echo "✗ invalid frontmatter"
				rm -f "$tmp_file" "${tmp_file}.amp"
				continue
			fi
		else
			{
				printf '%s\n' '---' '---' ''
				cat "$tmp_file"
			} > "${tmp_file}.amp"
		fi
		mv "${tmp_file}.amp" "$tmp_file"

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
			sync_companion_files "$skill_dir" "$url" "$files" true
			continue
		fi

		echo -n "downloaded, "

		# Build final SKILL.md: normalized remote base + PERSONAL.md (if exists)
		if [ -f "$personal_file" ]; then
			{
				cat "$tmp_file"
				printf '\n'
				cat "$personal_file"
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
		sync_companion_files "$skill_dir" "$url" "$files" false

	done < <(parse_yaml "$REMOTE_SKILLS_CONFIG")

	echo ""
}

# --- Amp artifacts (~/.config/amp) ---

sync_amp_artifacts() {
	[ -d "$AMP_DIR" ] || return 0

	echo "Syncing Amp artifacts..."
	echo ""

	if [ -f "$AMP_DIR/AGENTS.md" ]; then
		mkdir -p "$AMP_CONFIG_DIR"
		cp "$AMP_DIR/AGENTS.md" "$AMP_CONFIG_DIR/AGENTS.md"
		echo "copied: amp/AGENTS.md -> $AMP_CONFIG_DIR/AGENTS.md"
	fi

	if [ -f "$AMP_DIR/settings.json" ]; then
		mkdir -p "$AMP_CONFIG_DIR"
		cp "$AMP_DIR/settings.json" "$AMP_CONFIG_DIR/settings.json"
		echo "copied: amp/settings.json -> $AMP_CONFIG_DIR/settings.json"
	fi

	if [ -d "$AMP_DIR/plugins" ]; then
		mkdir -p "$AMP_CONFIG_DIR/plugins"
		rsync -a --delete "$AMP_DIR/plugins/" "$AMP_CONFIG_DIR/plugins/"
		echo "synced: amp/plugins/ -> $AMP_CONFIG_DIR/plugins/"
	fi

	if [ -d "$AMP_DIR/docs" ]; then
		mkdir -p "$AMP_CONFIG_DIR/docs"
		rsync -a --delete "$AMP_DIR/docs/" "$AMP_CONFIG_DIR/docs/"
		echo "synced: amp/docs/ -> $AMP_CONFIG_DIR/docs/"
	fi

	if [ -d "$AMP_DIR/mcp-servers" ]; then
		mkdir -p "$AMP_CONFIG_DIR/mcp-servers"
		rsync -a --delete "$AMP_DIR/mcp-servers/" "$AMP_CONFIG_DIR/mcp-servers/"
		echo "synced: amp/mcp-servers/ -> $AMP_CONFIG_DIR/mcp-servers/"
	fi

	if [ -f "$REPO_DIR/projects.yaml" ]; then
		mkdir -p "$AMP_CONFIG_DIR"
		cp "$REPO_DIR/projects.yaml" "$AMP_CONFIG_DIR/projects.yaml"
		echo "copied: projects.yaml -> $AMP_CONFIG_DIR/projects.yaml"
	fi

	if [ -f "$REPO_DIR/PROJECTS.md" ]; then
		mkdir -p "$AMP_CONFIG_DIR"
		cp "$REPO_DIR/PROJECTS.md" "$AMP_CONFIG_DIR/PROJECTS.md"
		echo "copied: PROJECTS.md -> $AMP_CONFIG_DIR/PROJECTS.md"
	fi

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

sync_amp_artifacts

for target in "$CLAUDE_SKILLS_DIR" "$AGENTS_SKILLS_DIR"; do
	remove_stale_skill_links "$target"
	sync_skill_links "$target"
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
