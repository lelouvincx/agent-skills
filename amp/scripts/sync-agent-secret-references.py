"""Validate reference-only bundles and install them in the private runtime directory."""

import os
import runpy
import stat
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
RUNTIME = runpy.run_path(str(REPO / "bin" / "agent-secrets"))


def read_references(root, manifest):
    directory = root / "bundle-references"
    expected = {f"{name}.env" for name in manifest["bundles"]}
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError("source bundle-reference directory must be a real directory")
    if {path.name for path in directory.iterdir()} != expected:
        raise ValueError("source bundle-reference files must match the bundle manifest")
    contents = {}
    for name, bundle in manifest["bundles"].items():
        path = directory / f"{name}.env"
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"source bundle {name} must be a regular file")
        text = path.read_text()
        assignments = RUNTIME["parse_bundle_text"](text, name, bundle["variables"])
        normalized = "".join(f"{key}={value}\n" for key, value in assignments.items())
        if text != normalized:
            raise ValueError(f"source bundle {name} must contain only reference assignments")
        contents[path.name] = normalized
    return contents


def check_owned_path(path, directory=False):
    if not path.exists() and not path.is_symlink():
        return
    metadata = path.lstat()
    correct_type = stat.S_ISDIR(metadata.st_mode) if directory else stat.S_ISREG(metadata.st_mode)
    if not correct_type or metadata.st_uid != os.getuid():
        raise ValueError(f"refusing unsafe reference destination: {path.name}")


def sync_references(root, home):
    manifest = RUNTIME["load_manifest"](root / "bundles.json")
    contents = read_references(root, manifest)
    parent = home / ".credentials"
    destination = parent / "agent-secrets"
    check_owned_path(parent, directory=True)
    check_owned_path(destination, directory=True)
    for name in contents:
        check_owned_path(destination / name)
    parent.mkdir(mode=0o700, exist_ok=True)
    destination.mkdir(mode=0o700, exist_ok=True)
    destination.chmod(0o700)
    for name, text in contents.items():
        path = destination / name
        if path.exists() and path.read_text() == text:
            path.chmod(0o600)
            continue
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", dir=destination, delete=False) as handle:
                temporary = Path(handle.name)
                handle.write(text)
            temporary.replace(path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    print(f"synced: {len(contents)} reference-only bundles -> {destination}")


def main():
    try:
        sync_references(REPO / "amp" / "agent-secrets", Path.home())
    except (OSError, ValueError, RUNTIME["AgentSecretsError"]) as error:
        # Reference values and file contents must never appear in diagnostics.
        print(f"agent secret reference sync failed: {type(error).__name__}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
