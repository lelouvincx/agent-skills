#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="${SKILLS_DIR:-$REPO_DIR/skills}"
BIN_DIR="$REPO_DIR/bin"
AMP_DIR="$REPO_DIR/amp"
REMOTE_SKILLS_CONFIG="${REMOTE_SKILLS_CONFIG:-$REPO_DIR/remote-skills.yaml}"
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
	local skill_archive=""
	local skill_archive_path=""
	local in_files=false

	_flush_skill() {
		if [[ -n "$skill_name" && -n "$skill_enabled" && ( -n "$skill_url" || -n "$skill_archive" ) ]]; then
			echo "$skill_name|$skill_url|$skill_enabled|$skill_files|$skill_archive|$skill_archive_path"
		fi
		skill_name=""
		skill_url=""
		skill_enabled=""
		skill_files=""
		skill_archive=""
		skill_archive_path=""
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
		elif [[ "$line" =~ ^[[:space:]]*archive:[[:space:]]*(.+)$ ]]; then
			skill_archive="${BASH_REMATCH[1]}"
			in_files=false
		elif [[ "$line" =~ ^[[:space:]]*archive_path:[[:space:]]*(.+)$ ]]; then
			skill_archive_path="${BASH_REMATCH[1]}"
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

normalize_remote_skill() {
	local input="$1"
	local output="$2"

	if [[ "$(head -n 1 "$input")" == "---" ]]; then
		awk '
			NR == 1 { in_frontmatter = 1; print; next }
			in_frontmatter && $0 == "---" { in_frontmatter = 0; closed = 1; print; next }
			in_frontmatter && /^disable-model-invocation:[[:space:]]*/ { next }
			{ print }
			END { if (!closed) exit 1 }
		' "$input" > "$output"
	else
		{
			printf '%s\n' '---' '---' ''
			cat "$input"
		} > "$output"
	fi
}

merge_personal_overlay() {
	local remote_file="$1"
	local personal_file="$2"
	local output="$3"
	local work_dir="$4"
	local personal_body="$work_dir/personal-body"
	local merged_remote="$work_dir/remote-merged"

	if [ ! -f "$personal_file" ]; then
		cp "$remote_file" "$output" || return 1
		return
	fi

	cp "$remote_file" "$merged_remote" || return 1
	if [[ "$(head -n 1 "$personal_file")" == "---" ]]; then
		if ! awk '
			NR == 1 { in_frontmatter = 1; next }
			in_frontmatter && $0 == "---" { in_frontmatter = 0; closed = 1; next }
			!in_frontmatter { print }
			END { if (!closed) exit 1 }
		' "$personal_file" > "$personal_body"; then
			return 1
		fi
		local personal_description
		if ! personal_description="$(awk '
			NR == 1 { next }
			$0 == "---" { exit }
			/^description:[[:space:]]*/ { print; exit }
		' "$personal_file")"; then
			return 1
		fi
		if [ -n "$personal_description" ]; then
			if ! awk -v description="$personal_description" '
				NR == 1 { in_frontmatter = 1; print; next }
				in_frontmatter && $0 == "---" {
					if (!replaced) print description
					in_frontmatter = 0
					print
					next
				}
				in_frontmatter && /^description:[[:space:]]*/ {
					print description
					replaced = 1
					next
				}
				{ print }
			' "$remote_file" > "$merged_remote"; then
				return 1
			fi
		fi
	else
		cp "$personal_file" "$personal_body" || return 1
	fi
	{
		cat "$merged_remote"
		printf '\n'
		cat "$personal_body"
	} > "$output" || return 1
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
			return 1
		fi
	done
}

sync_remote_archive_skill() {
	local name="$1"
	local archive="$2"
	local archive_path="$3"
	local skill_dir="$SKILLS_DIR/$name"
	local personal_file="$skill_dir/PERSONAL.md"
	local work_dir archive_file extract_dir archive_root source_dir publish_dir normalized_file
	local archive_hash personal_hash=""

	if [ -z "$archive_path" ] || [[ "$archive_path" = /* ]] \
		|| [[ "/$archive_path/" = *"/../"* ]] || [[ "/$archive_path/" = *"/./"* ]]; then
		echo "→ $name: ✗ archive_path must be a relative path without dot segments" >&2
		return 1
	fi

	work_dir="$(mktemp -d "$SKILLS_DIR/.${name}-remote.XXXXXX")"
	archive_file="$work_dir/source.tar.gz"
	extract_dir="$work_dir/extract"
	publish_dir="$work_dir/publish"
	normalized_file="$work_dir/normalized-skill.md"
	mkdir -p "$extract_dir" "$publish_dir"

	echo -n "→ $name: fetching archive... "
	if ! curl -fsSL "$archive" -o "$archive_file" 2>/dev/null; then
		echo "✗ failed"
		rm -rf "$work_dir"
		return 1
	fi
	if ! tar -xzf "$archive_file" -C "$extract_dir"; then
		echo "✗ invalid archive"
		rm -rf "$work_dir"
		return 1
	fi
	archive_root="$(find "$extract_dir" -mindepth 1 -maxdepth 1 -type d -print)"
	if [ -z "$archive_root" ] || [ "$(printf '%s\n' "$archive_root" | wc -l | tr -d ' ')" -ne 1 ]; then
		echo "✗ archive must contain exactly one top-level directory"
		rm -rf "$work_dir"
		return 1
	fi
	source_dir="$archive_root/$archive_path"
	if [ -z "$source_dir" ] || [ ! -f "$source_dir/SKILL.md" ]; then
		echo "✗ archive path not found"
		rm -rf "$work_dir"
		return 1
	fi
	if ! cp -R "$source_dir/." "$publish_dir/" \
		|| ! normalize_remote_skill "$publish_dir/SKILL.md" "$normalized_file" \
		|| ! merge_personal_overlay "$normalized_file" "$personal_file" "$publish_dir/SKILL.md" "$work_dir"; then
		echo "✗ invalid skill payload"
		rm -rf "$work_dir"
		return 1
	fi

	if [ -f "$personal_file" ]; then
		cp "$personal_file" "$publish_dir/PERSONAL.md"
		personal_hash="$(shasum -a 256 "$personal_file" | awk '{print $1}')"
	fi
	if command -v sha256sum &>/dev/null; then
		archive_hash="$(sha256sum "$archive_file" | awk '{print $1}')"
	else
		archive_hash="$(shasum -a 256 "$archive_file" | awk '{print $1}')"
	fi
	cat > "$publish_dir/.remote-source" <<-EOF
	SOURCE_URL=$archive
	ARCHIVE_PATH=$archive_path
	LAST_SYNC=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
	REMOTE_HASH=$archive_hash
	PERSONAL_HASH=$personal_hash
	EOF

	local backup_root backup_dir publish_failed=false
	backup_root="$(mktemp -d "$SKILLS_DIR/.${name}-backup.XXXXXX")"
	backup_dir="$backup_root/payload"
	trap 'if [ ! -e "$skill_dir" ] && [ -e "$backup_dir" ]; then mv "$backup_dir" "$skill_dir"; fi; rm -rf "$backup_root" "$work_dir"; exit 1' HUP INT TERM
	if [ -e "$skill_dir" ]; then
		mv "$skill_dir" "$backup_dir"
	fi
	if [ "${SYNC_SKILLS_TEST_FAIL_AFTER_BACKUP:-}" = "1" ]; then
		publish_failed=true
	elif ! mv "$publish_dir" "$skill_dir"; then
		publish_failed=true
	fi
	if [ "$publish_failed" = true ]; then
		[ -e "$backup_dir" ] && mv "$backup_dir" "$skill_dir"
		echo "✗ publish failed"
		trap - HUP INT TERM
		rm -rf "$backup_root" "$work_dir"
		return 1
	fi
	trap - HUP INT TERM
	rm -rf "$backup_root" "$work_dir"
	echo "✓ synced complete directory"
}

# --- Remote Skills Sync ---

sync_remote_skills() {
	local requested_skill="${1:-}"
	local matched=false

	[ -f "$REMOTE_SKILLS_CONFIG" ] || {
		echo "No remote-skills.yaml found, skipping remote sync"
		return 0
	}

	# One-time cleanup for retired upstream artifacts.
	rm -rf "$SKILLS_DIR/to-prd"
	rm -rf "$SKILLS_DIR/writing-great-skills"
	rm -rf "$SKILLS_DIR/remotion"
	rm -f "$SKILLS_DIR/tdd/refactoring.md"

	echo "Syncing remote skills..."
	echo ""

	while IFS='|' read -r name url enabled files archive archive_path; do
		if [ -n "$requested_skill" ] && [ "$name" != "$requested_skill" ]; then
			continue
		fi
		matched=true
		[[ "$enabled" != "true" ]] && {
			echo "⊘ $name: disabled, skipping"
			continue
		}
		if [ -n "$archive" ]; then
			sync_remote_archive_skill "$name" "$archive" "$archive_path"
			continue
		fi

		local skill_dir="$SKILLS_DIR/$name"
		local skill_file="$skill_dir/SKILL.md"
		local personal_file="$skill_dir/PERSONAL.md"
		local remote_source="$skill_dir/.remote-source"
		local tmp_file="$skill_dir/.remote-tmp"
		local personal_body="$skill_dir/.personal-body"
		local merged_remote="$skill_dir/.remote-merged"

		mkdir -p "$skill_dir"

		echo -n "→ $name: fetching remote... "

		# Fetch remote content
		if ! curl -fsSL "$url" -o "$tmp_file" 2>/dev/null; then
			echo "✗ failed to fetch"
			rm -f "$tmp_file"
			continue
		fi

		# Normalize frontmatter and remove controls unsupported by Amp.
		if ! normalize_remote_skill "$tmp_file" "${tmp_file}.amp"; then
			echo "✗ invalid frontmatter"
			rm -f "$tmp_file" "${tmp_file}.amp"
			continue
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

		local personal_hash=""
		if [ -f "$personal_file" ]; then
			if command -v sha256sum &>/dev/null; then
				personal_hash=$(sha256sum "$personal_file" | awk '{print $1}')
			else
				personal_hash=$(shasum -a 256 "$personal_file" | awk '{print $1}')
			fi
		fi
		local old_personal_hash=""
		if [ -f "$remote_source" ]; then
			old_personal_hash=$(grep "^PERSONAL_HASH=" "$remote_source" | cut -d'=' -f2 || true)
		fi

		if [ "$new_hash" = "$old_hash" ] && [ "$personal_hash" = "$old_personal_hash" ] && [ -f "$skill_file" ]; then
			echo "✓ up-to-date"
			rm -f "$tmp_file"
			sync_companion_files "$skill_dir" "$url" "$files" true
			continue
		fi

		echo -n "downloaded, "

		# Build final SKILL.md: normalized remote base + PERSONAL.md body. A
		# one-line description in PERSONAL.md frontmatter overrides the remote
		# description so personal invocation branches remain discoverable.
		if ! merge_personal_overlay "$tmp_file" "$personal_file" "$skill_file" "$skill_dir"; then
			echo "✗ invalid PERSONAL.md frontmatter"
			rm -f "$tmp_file" "$personal_body" "$merged_remote"
			continue
		fi

		# Update metadata
		cat > "$remote_source" <<-EOF
		SOURCE_URL=$url
		LAST_SYNC=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
		REMOTE_HASH=$new_hash
		PERSONAL_HASH=$personal_hash
		EOF

		rm -f "$tmp_file" "$personal_body" "$merged_remote"

		if [ -f "$personal_file" ]; then
			echo "✓ merged with PERSONAL.md"
		else
			echo "✓ generated"
		fi
		sync_companion_files "$skill_dir" "$url" "$files" false

	done < <(parse_yaml "$REMOTE_SKILLS_CONFIG")

	if [ -n "$requested_skill" ] && [ "$matched" != true ]; then
		echo "error: required skill $requested_skill is not in remote-skills.yaml" >&2
		return 1
	fi

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

	if [ -d "$AMP_DIR/conventions" ]; then
		if [ -L "$AMP_CONFIG_DIR/conventions" ]; then
			rm "$AMP_CONFIG_DIR/conventions"
		fi
		mkdir -p "$AMP_CONFIG_DIR/conventions"
		rsync -a --delete "$AMP_DIR/conventions/" "$AMP_CONFIG_DIR/conventions/"
		echo "synced: amp/conventions/ -> $AMP_CONFIG_DIR/conventions/"
	fi

	if [ -f "$AMP_DIR/settings.json" ]; then
		mkdir -p "$AMP_CONFIG_DIR"
		cp "$AMP_DIR/settings.json" "$AMP_CONFIG_DIR/settings.json"
		echo "copied: amp/settings.json -> $AMP_CONFIG_DIR/settings.json"
	fi

	if [ -d "$AMP_DIR/github-thread-events" ]; then
		mkdir -p "$AMP_CONFIG_DIR/github-thread-events"
		rsync -a --delete "$AMP_DIR/github-thread-events/" "$AMP_CONFIG_DIR/github-thread-events/"
		echo "synced: amp/github-thread-events/ -> $AMP_CONFIG_DIR/github-thread-events/"
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

ensure_skill_dependencies() {
	local owner dependency
	local dependency_linter="$REPO_DIR/scripts/check-skill-dependencies"

	"$dependency_linter" --skills-dir "$SKILLS_DIR" --remote-config "$REMOTE_SKILLS_CONFIG"
	while IFS='|' read -r owner dependency; do
		[ -f "$SKILLS_DIR/$dependency/SKILL.md" ] && continue
		echo "Installing $dependency, required by $owner..."
		sync_remote_skills "$dependency"
	done < <("$dependency_linter" --skills-dir "$SKILLS_DIR" --remote-config "$REMOTE_SKILLS_CONFIG" --list)
	"$dependency_linter" --skills-dir "$SKILLS_DIR" --remote-config "$REMOTE_SKILLS_CONFIG" --require-installed
}

# Check for --remote flag
if [[ "${1:-}" == "--remote" ]]; then
	sync_remote_skills
fi

ensure_skill_dependencies
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
