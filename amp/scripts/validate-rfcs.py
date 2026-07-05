#!/usr/bin/env python3
"""Validate Amp RFC documentation consistency."""

from __future__ import annotations

import re
import sys
from pathlib import Path


AMP_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = AMP_ROOT.parent
RFCS_DIR = AMP_ROOT / "docs" / "rfcs"
SCHEMA_FILE = RFCS_DIR / "_rfc_schema.md"
SCHEMA_CUTOFF = "2026-07-01"

REQUIRED_FIELDS = [
    "doc_schema",
    "code",
    "title",
    "slug",
    "file",
    "status",
    "summary",
    "created",
    "updated",
]

REQUIRED_H2S = [
    "Summary",
    "Context",
    "Decision",
    "Contract",
    "Behavior",
    "Permissions and side effects",
    "Examples",
    "Maintenance notes",
    "Open questions",
]


def frontmatter(path: Path) -> str | None:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---", 4)
    return None if end == -1 else text[4:end]


def scalar(fm: str, key: str) -> str | None:
    match = re.search(rf'^{re.escape(key)}:\s*"?([^"\n]+?)"?\s*$', fm, re.MULTILINE)
    return match.group(1).strip() if match else None


def amp_threads(fm: str) -> dict[str, str]:
    lines = fm.splitlines()
    threads: dict[str, str] = {}
    for index, line in enumerate(lines):
        if line != "amp_thread_id:":
            continue
        for nested_line in lines[index + 1 :]:
            if not nested_line.strip():
                continue
            if not nested_line.startswith(" "):
                break
            match = re.match(r'^  (T-[A-Za-z0-9-]+):\s*"?([^"\n]+?)"?\s*$', nested_line)
            if match:
                threads[match.group(1)] = match.group(2).strip()
        break
    return threads


def relative_paths(fm: str) -> list[str]:
    return re.findall(r'^\s*path:\s*"(\.[^"\n]+)"\s*$', fm, re.MULTILINE)


def is_list_field(fm: str, key: str) -> bool:
    lines = fm.splitlines()
    for index, line in enumerate(lines):
        match = re.match(rf"^{re.escape(key)}:\s*(.*)$", line)
        if not match:
            continue
        value = match.group(1).strip()
        if value == "[]" or (value.startswith("[") and value.endswith("]")):
            return True
        if value:
            return False
        for nested_line in lines[index + 1 :]:
            if not nested_line.strip():
                continue
            return nested_line.startswith("  - ")
        return True
    return True


def h2s(path: Path) -> list[str]:
    return re.findall(r"^## (.+)$", path.read_text(encoding="utf-8"), re.MULTILINE)


def validate_schema_file(errors: list[str]) -> None:
    fm = frontmatter(SCHEMA_FILE)
    if fm is None:
        errors.append(f"{SCHEMA_FILE}: missing or malformed frontmatter")
        return
    if scalar(fm, "doc_schema") != "amp-rfc-schema/v1.3":
        errors.append(f"{SCHEMA_FILE}: doc_schema must be 'amp-rfc-schema/v1.3'")
    if scalar(fm, "version") != "1.3":
        errors.append(f"{SCHEMA_FILE}: version must be '1.3'")
    if not amp_threads(fm):
        errors.append(f"{SCHEMA_FILE}: amp_thread_id must map thread IDs to intent descriptions")


def validate_rfc(path: Path, seen_codes: dict[str, Path], seen_slugs: dict[str, Path], errors: list[str]) -> None:
    fm = frontmatter(path)
    if fm is None:
        errors.append(f"{path}: missing or malformed frontmatter")
        return

    values = {field: scalar(fm, field) for field in REQUIRED_FIELDS}
    for field, value in values.items():
        if not value:
            errors.append(f"{path}: missing required frontmatter field {field}")

    threads = amp_threads(fm)
    if not threads:
        errors.append(f"{path}: amp_thread_id must map thread IDs to intent descriptions")
    for thread_id, intent in threads.items():
        if not re.fullmatch(r"T-[A-Za-z0-9-]+", thread_id):
            errors.append(f"{path}: invalid amp_thread_id key {thread_id!r}")
        if not intent:
            errors.append(f"{path}: amp_thread_id {thread_id!r} must describe the thread intent")

    if values["doc_schema"] and values["doc_schema"] != "amp-rfc/v1":
        errors.append(f"{path}: doc_schema must be 'amp-rfc/v1'")

    code = values["code"]
    if code and not re.fullmatch(r"RFC-\d{4}", code):
        errors.append(f"{path}: code must look like RFC-0001")
    if code:
        previous = seen_codes.setdefault(code, path)
        if previous != path:
            errors.append(f"{path}: duplicate code {code!r}; already used by {previous}")

    slug = values["slug"]
    if slug and not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        errors.append(f"{path}: slug must be URL-safe lowercase kebab-case")
    if slug:
        previous = seen_slugs.setdefault(slug, path)
        if previous != path:
            errors.append(f"{path}: duplicate slug {slug!r}; already used by {previous}")

    if values["file"] and values["file"] != path.name:
        errors.append(f"{path}: file must match filename {path.name!r}")

    for field in ("created", "updated"):
        value = values[field]
        if value and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            errors.append(f"{path}: {field} must use YYYY-MM-DD")

    for rel_path in relative_paths(fm):
        if not (path.parent / rel_path).resolve().exists():
            errors.append(f"{path}: frontmatter path {rel_path!r} does not exist")

    for field in ("inputs", "outputs"):
        if not is_list_field(fm, field):
            errors.append(f"{path}: optional frontmatter field {field} must be a list when present")

    created = values["created"] or ""
    updated = values["updated"] or ""
    if max(created, updated) >= SCHEMA_CUTOFF and h2s(path) != REQUIRED_H2S:
        errors.append(f"{path}: H2 headings must be exactly {REQUIRED_H2S!r}")


def main() -> int:
    errors: list[str] = []
    validate_schema_file(errors)

    seen_codes: dict[str, Path] = {}
    seen_slugs: dict[str, Path] = {}
    rfcs = sorted(RFCS_DIR.glob("rfc-*.md"))
    for path in rfcs:
        validate_rfc(path, seen_codes, seen_slugs, errors)

    if errors:
        print("Amp RFC validation failed:")
        for error in errors:
            print(f"- {error.relative_to(REPO_ROOT) if isinstance(error, Path) else error}")
        return 1

    print(f"Validated {len(rfcs)} Amp RFC docs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
