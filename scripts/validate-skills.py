#!/usr/bin/env python3
"""Validate tracked local skills and the remote skill registry."""

from __future__ import annotations

import posixpath
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath
from urllib.parse import unquote

import yaml


REPO_ROOT = Path(__file__).resolve().parents[1]
NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
MARKDOWN_LINK_RE = re.compile(r"!?\[[^]]*\]\(([^)]+)\)")


def tracked_paths(root: Path) -> list[Path]:
    result = subprocess.run(
        ["git", "-C", str(root), "ls-files", "skills"],
        check=True,
        capture_output=True,
        text=True,
    )
    return [Path(line) for line in result.stdout.splitlines()]


def valid_name(name: object) -> bool:
    return isinstance(name, str) and len(name) <= 64 and bool(NAME_RE.fullmatch(name))


def safe_companion_path(skill_name: str, companion: str) -> bool:
    path = PurePosixPath(companion)
    if path.is_absolute() or "\\" in companion:
        return False
    if ".." not in path.parts:
        return True
    if skill_name != "develop-amql":
        return False

    normalized = PurePosixPath(
        posixpath.normpath(str(PurePosixPath("skills") / skill_name / path))
    )
    return len(normalized.parts) > 1 and normalized.parts[0] == "references"


def load_registry(path: Path, errors: list[str]) -> list[dict[str, object]]:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        errors.append(f"{path}: cannot parse registry: {exc}")
        return []

    if not isinstance(data, dict) or not isinstance(data.get("skills"), list):
        errors.append(f"{path}: top-level skills must be a list")
        return []

    entries = data["skills"]
    if not all(isinstance(entry, dict) for entry in entries):
        errors.append(f"{path}: every skill entry must be a mapping")
        return []
    return entries


def validate_registry(
    root: Path,
    entries: list[dict[str, object]],
    tracked: list[Path],
    errors: list[str],
) -> set[str]:
    names: set[str] = set()
    for index, entry in enumerate(entries, start=1):
        name = entry.get("name")
        context = f"{root / 'remote-skills.yaml'}: skill entry {index}"
        if not valid_name(name):
            errors.append(f"{context}: name must follow the Agent Skills name constraints")
            continue
        assert isinstance(name, str)
        if name in names:
            errors.append(f"{context}: duplicate name {name!r}")
        names.add(name)

        skill_path = root / "skills" / name
        if skill_path.exists() and not skill_path.is_dir():
            errors.append(f"{context}: {skill_path} must be a directory")

        files = entry.get("files", [])
        if not isinstance(files, list):
            errors.append(f"{context}: files must be a list")
            continue
        for companion in files:
            if not isinstance(companion, str) or not companion:
                errors.append(f"{context}: companion paths must be non-empty strings")
                continue
            if not safe_companion_path(name, companion):
                errors.append(
                    f"{context}: companion path {companion!r} must stay within skills/{name}"
                    " (develop-amql may use the shared references/ root)"
                )

    for path in tracked:
        if len(path.parts) >= 3 and path.parts[0] == "skills" and path.name in {
            ".remote-source",
            "PERSONAL.md",
        }:
            directory = path.parts[1]
            if directory not in names:
                errors.append(
                    f"{root / path}: remote metadata directory {directory!r} has no matching registry entry"
                )
    return names


def without_fenced_code(text: str) -> str:
    kept: list[str] = []
    fence: str | None = None
    for line in text.splitlines():
        marker = line.lstrip()[:3]
        if marker in {"```", "~~~"}:
            fence = None if fence == marker else marker if fence is None else fence
            continue
        if fence is None:
            kept.append(line)
    return "\n".join(kept)


def validate_markdown_references(path: Path, body: str, errors: list[str]) -> None:
    for match in MARKDOWN_LINK_RE.finditer(without_fenced_code(body)):
        target = match.group(1).strip()
        if target.startswith("<") and target.endswith(">"):
            target = target[1:-1]
        else:
            target = target.split(maxsplit=1)[0]
        target = unquote(target.split("#", 1)[0].split("?", 1)[0])
        if not target or target.startswith(("/", "#", "//")) or ":" in target.split("/", 1)[0]:
            continue
        if not (path.parent / target).exists():
            errors.append(f"{path}: relative Markdown reference does not exist: {target}")


def validate_local_skill(path: Path, errors: list[str]) -> None:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        errors.append(f"{path}: frontmatter must start with ---")
        return
    try:
        closing = lines.index("---", 1)
    except ValueError:
        errors.append(f"{path}: frontmatter is not closed with ---")
        return

    try:
        data = yaml.safe_load("\n".join(lines[1:closing]))
    except yaml.YAMLError as exc:
        errors.append(f"{path}: cannot parse frontmatter: {exc}")
        return
    if not isinstance(data, dict):
        errors.append(f"{path}: frontmatter must be a mapping")
        return

    name = data.get("name")
    if not valid_name(name):
        errors.append(f"{path}: name must follow the Agent Skills name constraints")
    elif name != path.parent.name:
        errors.append(f"{path}: name {name!r} must match directory {path.parent.name!r}")

    description = data.get("description")
    if not isinstance(description, str) or not description.strip() or len(description) > 1024:
        errors.append(f"{path}: description must be a non-empty string of at most 1024 characters")

    validate_markdown_references(path, "\n".join(lines[closing + 1 :]), errors)


def validate_repository(root: Path, tracked: list[Path] | None = None) -> tuple[list[str], int, int]:
    errors: list[str] = []
    tracked = tracked if tracked is not None else tracked_paths(root)
    entries = load_registry(root / "remote-skills.yaml", errors)
    remote_names = validate_registry(root, entries, tracked, errors)
    local_skills = [
        root / path
        for path in tracked
        if len(path.parts) == 3
        and path.parts[0] == "skills"
        and path.name == "SKILL.md"
        and path.parent.name not in remote_names
    ]
    for path in local_skills:
        validate_local_skill(path, errors)
    return errors, len(local_skills), len(entries)


def main() -> int:
    try:
        errors, local_count, remote_count = validate_repository(REPO_ROOT)
    except subprocess.CalledProcessError as exc:
        print(f"error: cannot list tracked skills: {exc}", file=sys.stderr)
        return 1
    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1
    print(f"Skill validation passed ({local_count} local, {remote_count} remote)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
