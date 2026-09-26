#!/usr/bin/env python3
"""Remove the retired, repository-owned agent-browser plugin registration."""

import json
import os
import stat
import sys
import tempfile
from pathlib import Path


class MigrationError(ValueError):
    """An invalid or conflicting agent-browser configuration."""


def reject_duplicate_keys(pairs):
    value = {}
    for key, child in pairs:
        if key in value:
            raise MigrationError(f"agent-browser config contains duplicate key: {key}")
        value[key] = child
    return value


def reject_nonstandard_number(value):
    raise MigrationError(f"agent-browser config contains nonstandard JSON number: {value}")


def read_config(path):
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        return None
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise MigrationError("agent-browser config must be a regular file")
    try:
        value = json.loads(
            path.read_text(),
            object_pairs_hook=reject_duplicate_keys,
            parse_constant=reject_nonstandard_number,
        )
    except MigrationError:
        raise
    except (OSError, json.JSONDecodeError) as error:
        raise MigrationError("agent-browser config is not valid JSON") from error
    if not isinstance(value, dict):
        raise MigrationError("agent-browser config must be a JSON object")
    return value


def migrate_config(config, command):
    plugins = config.get("plugins")
    if plugins is None:
        return False, None
    if not isinstance(plugins, list) or any(not isinstance(plugin, dict) for plugin in plugins):
        return False, "agent-browser plugins is not an array of objects; preserving it"
    registration = {
        "name": "onepassword",
        "command": command,
        "capabilities": ["credential.read"],
    }
    kept = [plugin for plugin in plugins if plugin != registration]
    conflicts = [
        plugin
        for plugin in kept
        if plugin.get("name") == "onepassword"
    ]
    warning = None
    if conflicts:
        warning = "conflicting onepassword plugin registration preserved"
    if len(kept) == len(plugins):
        return False, warning
    if kept:
        config["plugins"] = kept
    else:
        del config["plugins"]
    return True, warning


def write_config(path, config):
    previous_mode = stat.S_IMODE(path.stat().st_mode)
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
        print("usage: migrate-agent-browser-config.py <config> <command>", file=sys.stderr)
        return 2
    path = Path(arguments[0]).expanduser()
    command = Path(arguments[1]).expanduser()
    if not path.is_absolute() or not command.is_absolute():
        print("error: config and command paths must be absolute", file=sys.stderr)
        return 2
    try:
        config = read_config(path)
        if config is None:
            return 0
        changed, warning = migrate_config(config, str(command))
        if warning:
            print(f"warning: {warning}", file=sys.stderr)
        if not changed:
            return 0
        if os.environ.get("AGENT_SKILLS_MIGRATION_DRY_RUN") == "1":
            print(f"would remove: onepassword plugin from {path}")
            return 0
        write_config(path, config)
        print(f"removed: onepassword plugin from {path}")
    except (MigrationError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
