#!/usr/bin/env python3
"""Validate Amp plugin capability documentation consistency."""

from __future__ import annotations

import re
import sys
from pathlib import Path


AMP_ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = AMP_ROOT / "docs" / "tools"


def frontmatter(path: Path) -> str | None:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return None

    end = text.find("\n---", 4)
    if end == -1:
        return None

    return text[4:end]


def top_level_scalar(fm: str, key: str) -> str | None:
    match = re.search(rf'^{re.escape(key)}:\s*"?([^"\n]+?)"?\s*$', fm, re.MULTILINE)
    return match.group(1).strip() if match else None


def top_level_list(fm: str, key: str) -> list[str]:
    lines = fm.splitlines()

    for index, line in enumerate(lines):
        match = re.match(rf'^{re.escape(key)}:\s*(.*)$', line)
        if not match:
            continue

        inline_value = match.group(1).strip()
        if inline_value == "[]":
            return []
        if inline_value.startswith("[") and inline_value.endswith("]"):
            return [item.strip().strip('"\'') for item in inline_value[1:-1].split(",") if item.strip()]

        values: list[str] = []
        for nested_line in lines[index + 1 :]:
            if not nested_line.strip():
                continue
            item = re.match(r'^  -\s*"?([^"\n]+?)"?\s*$', nested_line)
            if item:
                values.append(item.group(1).strip())
                continue
            if not nested_line.startswith(" "):
                break
        return values

    return []


def markdown_links(path: Path) -> list[str]:
    return re.findall(r"\[[^\]]+\]\((\./[^)]+)\)", path.read_text(encoding="utf-8"))


def main() -> int:
    errors: list[str] = []
    docs = sorted(path for path in DOCS_DIR.glob("*.md") if path.name != "README.md" and not path.name.startswith("_"))

    slug_to_doc: dict[str, Path] = {}
    doc_to_slug: dict[Path, str] = {}

    for doc in docs:
        fm = frontmatter(doc)
        if fm is None:
            errors.append(f"{doc}: missing or malformed frontmatter")
            continue

        slug = top_level_scalar(fm, "slug")
        if not slug:
            errors.append(f"{doc}: missing slug")
            continue

        if slug in slug_to_doc:
            errors.append(f"{doc}: duplicate slug {slug!r}; already used by {slug_to_doc[slug]}")
        else:
            slug_to_doc[slug] = doc
            doc_to_slug[doc] = slug

    for doc in docs:
        fm = frontmatter(doc)
        if fm is None:
            continue

        for related_slug in top_level_list(fm, "related"):
            if related_slug not in slug_to_doc:
                errors.append(f"{doc}: related slug {related_slug!r} does not exist")

    readme = DOCS_DIR / "README.md"
    linked_docs: set[Path] = set()
    if not readme.exists():
        errors.append(f"{readme}: missing capability index")
    else:
        for link in markdown_links(readme):
            target = (DOCS_DIR / link.removeprefix("./")).resolve()
            linked_docs.add(target)
            if not target.exists():
                errors.append(f"{readme}: link {link!r} points to a missing file")

    for doc, slug in doc_to_slug.items():
        if doc.resolve() not in linked_docs:
            errors.append(f"{doc}: slug {slug!r} is not linked from {readme}")

    if errors:
        print("Amp plugin doc validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Validated {len(doc_to_slug)} Amp plugin capability docs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
