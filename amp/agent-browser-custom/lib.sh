#!/usr/bin/env bash

agent_browser_custom_skill_manifest() {
	local skill_dir="$1"

	python3 - "$skill_dir" <<'PY'
import hashlib
import os
import stat
import sys
from pathlib import Path

root = Path(sys.argv[1])
errors: list[str] = []
entries: list[tuple[str, str]] = []

try:
    root_stat = os.lstat(root)
except OSError as error:
    print(f"cannot inspect skill-data root: {error.strerror}", file=sys.stderr)
    sys.exit(1)

if stat.S_ISLNK(root_stat.st_mode):
    print("unsupported skill-data root file type: symbolic link", file=sys.stderr)
    sys.exit(1)
if not stat.S_ISDIR(root_stat.st_mode):
    print("unsupported skill-data root file type: not a directory", file=sys.stderr)
    sys.exit(1)

for current, dirnames, filenames in os.walk(root, topdown=True, followlinks=False):
    current_path = Path(current)
    kept_dirs: list[str] = []
    for dirname in dirnames:
        path = current_path / dirname
        rel = path.relative_to(root).as_posix()
        try:
            mode = os.lstat(path).st_mode
        except OSError as error:
            errors.append(f"{rel}: cannot inspect: {error.strerror}")
            continue
        if stat.S_ISDIR(mode):
            kept_dirs.append(dirname)
        elif stat.S_ISLNK(mode):
            errors.append(f"{rel}: unsupported file type: symbolic link")
        else:
            errors.append(f"{rel}: unsupported file type")
    dirnames[:] = kept_dirs

    for filename in filenames:
        path = current_path / filename
        rel = path.relative_to(root).as_posix()
        try:
            mode = os.lstat(path).st_mode
        except OSError as error:
            errors.append(f"{rel}: cannot inspect: {error.strerror}")
            continue
        if stat.S_ISLNK(mode):
            errors.append(f"{rel}: unsupported file type: symbolic link")
            continue
        if not stat.S_ISREG(mode):
            errors.append(f"{rel}: unsupported file type")
            continue
        digest = hashlib.sha256()
        try:
            with path.open("rb") as file:
                for chunk in iter(lambda: file.read(1024 * 1024), b""):
                    digest.update(chunk)
        except OSError as error:
            errors.append(f"{rel}: cannot read: {error.strerror}")
            continue
        entries.append((rel, digest.hexdigest()))

if errors:
    for error in errors:
        print(error, file=sys.stderr)
    sys.exit(1)

for rel, digest in sorted(entries):
    print(f"{digest}  {rel}")
PY
}

agent_browser_custom_verify_skill_data() {
	local install_dir="$1"
	local repo_root="${2:-}"
	local skill_dir="$install_dir/skill-data"
	local manifest="$install_dir/skill-data.sha256"
	local pinned_manifest=""
	local actual

	if [ ! -d "$skill_dir" ]; then
		echo "agent-browser: installed skill-data is missing; run amp/agent-browser-custom/build" >&2
		return 1
	fi
	if [ ! -f "$manifest" ]; then
		echo "agent-browser: installed skill-data receipt is missing; run amp/agent-browser-custom/build" >&2
		return 1
	fi

	actual="$(mktemp)"
	if ! agent_browser_custom_skill_manifest "$skill_dir" > "$actual"; then
		rm -f "$actual"
		echo "agent-browser: could not verify installed skill-data; run amp/agent-browser-custom/build" >&2
		return 1
	fi
	if ! diff -u "$manifest" "$actual" >&2; then
		rm -f "$actual"
		echo "agent-browser: installed skill-data does not match its receipt; run amp/agent-browser-custom/build" >&2
		return 1
	fi
	rm -f "$actual"

	if [ -n "$repo_root" ]; then
		pinned_manifest="$repo_root/amp/agent-browser-custom/skill-data.sha256"
		if [ ! -f "$pinned_manifest" ]; then
			echo "agent-browser: tracked pinned skill-data manifest is missing; run amp/agent-browser-custom/build after regenerating the manifest" >&2
			return 1
		fi
		if ! diff -u "$pinned_manifest" "$manifest" >&2; then
			echo "agent-browser: installed skill-data receipt does not match tracked pinned metadata; run amp/agent-browser-custom/build" >&2
			return 1
		fi
	fi
}
