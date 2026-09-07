#!/usr/bin/env python3
"""Install the repository-owned agent-browser plugin registration without clobbering config."""

import json
import os
import stat
import sys
import tempfile
from pathlib import Path


PLUGIN_NAME = "onepassword"


class MergeError(ValueError):
    """An invalid or conflicting agent-browser configuration."""


def reject_duplicate_keys(pairs):
    value = {}
    for key, child in pairs:
        if key in value:
            raise MergeError(f"agent-browser config contains duplicate key: {key}")
        value[key] = child
    return value


def read_config(path):
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        return {}
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise MergeError("agent-browser config must be a regular file")
    try:
        value = json.loads(path.read_text(), object_pairs_hook=reject_duplicate_keys)
    except MergeError:
        raise
    except (OSError, json.JSONDecodeError) as error:
        raise MergeError("agent-browser config is not valid JSON") from error
    if not isinstance(value, dict):
        raise MergeError("agent-browser config must be a JSON object")
    return value


def merge_config(config, command):
    plugins = config.get("plugins")
    if plugins is None:
        plugins = []
        config["plugins"] = plugins
    if not isinstance(plugins, list) or any(not isinstance(plugin, dict) for plugin in plugins):
        raise MergeError("agent-browser plugins must be an array of objects")
    registration = {
        "name": PLUGIN_NAME,
        "command": command,
        "capabilities": ["credential.read"],
    }
    owned = [plugin for plugin in plugins if plugin.get("name") == PLUGIN_NAME]
    if len(owned) > 1:
        raise MergeError("agent-browser config contains duplicate onepassword plugins")
    if owned and owned[0] != registration:
        raise MergeError("agent-browser onepassword plugin has conflicting ownership")
    if not owned:
        plugins.append(registration)
    return config


def write_config(path, config):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.parent.chmod(0o700)
    previous_mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o600
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=".config.",
            suffix=".tmp",
            delete=False,
        ) as output:
            temporary_path = Path(output.name)
            os.fchmod(output.fileno(), previous_mode)
            json.dump(config, output, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary_path, path)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()


def main(arguments=None):
    arguments = sys.argv[1:] if arguments is None else arguments
    if len(arguments) != 2:
        print("usage: merge-agent-browser-plugin.py <config> <command>", file=sys.stderr)
        return 2
    path = Path(arguments[0]).expanduser()
    command = Path(arguments[1]).expanduser()
    if not path.is_absolute() or not command.is_absolute():
        print("error: config and command paths must be absolute", file=sys.stderr)
        return 2
    try:
        config = merge_config(read_config(path), str(command))
        write_config(path, config)
    except (MergeError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
