#!/usr/bin/env bash
set -euo pipefail

runtime_dir="${1:-$HOME/.local/share/amp-cliproxy}"
api_key_file="$runtime_dir/api-key.txt"
config_file="$runtime_dir/config.yaml"
template_file="$runtime_dir/config.example.yaml"
auth_dir="$runtime_dir/auth"

mkdir -p "$runtime_dir" "$auth_dir"
chmod 700 "$runtime_dir" "$auth_dir"

if [ ! -f "$api_key_file" ]; then
	umask 077
	if command -v openssl >/dev/null 2>&1; then
		openssl rand -base64 48 > "$api_key_file"
	else
		python3 - <<'PY' > "$api_key_file"
import secrets
print(secrets.token_urlsafe(48))
PY
	fi
fi

if [ ! -f "$config_file" ]; then
	if [ ! -f "$template_file" ]; then
		echo "error: missing config template: $template_file" >&2
		exit 1
	fi
	umask 077
	python3 - "$template_file" "$api_key_file" "$config_file" <<'PY'
import pathlib
import sys

template = pathlib.Path(sys.argv[1]).read_text()
api_key = pathlib.Path(sys.argv[2]).read_text().strip()
pathlib.Path(sys.argv[3]).write_text(template.replace("__API_KEY__", api_key))
PY
fi

chmod 600 "$api_key_file" "$config_file"
chmod 600 "$runtime_dir/docker-compose.yml" "$template_file" 2>/dev/null || true

echo "ready: $runtime_dir"
