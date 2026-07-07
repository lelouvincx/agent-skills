#!/usr/bin/env python3
"""Validate Amp plugin capability documentation consistency."""

from __future__ import annotations

import re
import sys
from pathlib import Path


AMP_ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = AMP_ROOT / "docs" / "tools"

REQUIRED_TOP_LEVEL = {
    "doc_schema": "scalar",
    "title": "scalar",
    "slug": "scalar",
    "status": "scalar",
    "summary": "scalar",
    "capability": "mapping",
    "plugin": "mapping",
    "amp": "mapping",
    "contract": "mapping",
    "runtime": "mapping",
    "safety": "mapping",
    "related": "list",
    "tags": "list",
}

REQUIRED_NESTED = {
    "capability": {
        "id": "scalar",
        "type": "scalar",
        "surface": "scalar",
        "invocation": "scalar",
        "registration_api": "scalar",
        "api_stability": "scalar",
    },
    "plugin": {
        "file": "scalar",
        "scope": "scalar",
        "install_source": "scalar",
        "metadata_comments": "list",
    },
    "amp": {
        "api_docs_source": "scalar",
        "agent_options_source": "scalar",
        "last_verified": "scalar",
    },
    "contract": {
        "input_kind": "scalar",
        "output_kind": "scalar",
        "event": "nullable_scalar",
        "command_id": "nullable_scalar",
        "agent_mode_key": "nullable_scalar",
    },
    "runtime": {
        "uses": "list",
        "dependencies": "list",
        "env": "list",
        "reads": "list",
        "writes": "list",
        "network": "list",
        "logs": "list",
    },
    "safety": {
        "permission_level": "scalar",
        "user_gate": "scalar",
        "constraints": "list",
        "risks": "list",
    },
}

ENUMS = {
    "capability.type": {
        "agent_tool",
        "command",
        "event_handler",
        "agent_mode",
        "status_item",
        "helper_agent",
    },
    "capability.surface": {
        "agent",
        "command_palette",
        "plugin_event_pipeline",
        "mode_picker",
        "status_bar",
        "internal",
    },
    "capability.invocation": {
        "tool_call",
        "command_palette",
        "plugin_event",
        "new_thread_mode",
        "status_update",
        "internal_call",
    },
    "capability.api_stability": {"stable", "experimental", "mixed"},
}

REQUIRED_H2S = [
    "Summary",
    "Invocation",
    "Contract",
    "Behavior",
    "Permissions and side effects",
    "Examples",
    "Troubleshooting",
    "Maintenance notes",
]


def frontmatter(path: Path) -> str | None:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return None

    end = text.find("\n---", 4)
    if end == -1:
        return None

    return text[4:end]


def parse_scalar(value: str) -> str | None | list[str]:
    value = value.strip()
    if value == "null":
        return None
    if value == "[]":
        return []
    if value.startswith("[") and value.endswith("]"):
        return [item.strip().strip('"\'') for item in value[1:-1].split(",") if item.strip()]
    return value.strip('"\'')


def parse_frontmatter(fm: str) -> dict[str, object]:
    data: dict[str, object] = {}
    current_map: dict[str, object] | None = None
    current_list: list[str] | None = None
    pending_top_list_key: str | None = None

    for line in fm.splitlines():
        if not line.strip():
            continue

        top_level = re.match(r"^([^:]+):\s*(.*)$", line)
        if top_level and not line.startswith(" "):
            key = top_level.group(1)
            raw_value = top_level.group(2)
            current_list = None
            pending_top_list_key = None
            if raw_value == "":
                current_map = {}
                data[key] = current_map
                pending_top_list_key = key
            else:
                current_map = None
                value = parse_scalar(raw_value)
                data[key] = value
                if isinstance(value, list):
                    current_list = value
            continue

        nested = re.match(r"^  ([^:]+):\s*(.*)$", line)
        if nested and current_map is not None:
            key = nested.group(1)
            raw_value = nested.group(2)
            value = [] if raw_value == "" else parse_scalar(raw_value)
            current_map[key] = value
            current_list = value if isinstance(value, list) else None
            pending_top_list_key = None
            continue

        item = re.match(r'^  -\s*"?([^"\n]+?)"?\s*$', line)
        if item and current_list is None and pending_top_list_key is not None:
            current_map = None
            current_list = []
            data[pending_top_list_key] = current_list
        if item and current_list is not None:
            current_list.append(item.group(1).strip())

    return data


def validate_type(path: Path, field: str, value: object, expected: str, errors: list[str]) -> None:
    if expected == "mapping":
        valid = isinstance(value, dict)
    elif expected == "list":
        valid = isinstance(value, list)
    elif expected == "nullable_scalar":
        valid = value is None or isinstance(value, str)
    else:
        valid = isinstance(value, str) and bool(value)

    if not valid:
        errors.append(f"{path}: {field} must be {expected}")


def markdown_h2s(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    body = text.split("\n---", 1)[1] if text.startswith("---\n") and "\n---" in text[4:] else text
    body = re.sub(r"^```.*?^```", "", body, flags=re.MULTILINE | re.DOTALL)
    return re.findall(r"^## (.+)$", body, re.MULTILINE)


def validate_schema_contract(path: Path, data: dict[str, object], errors: list[str]) -> None:
    for field, expected in REQUIRED_TOP_LEVEL.items():
        if field not in data:
            errors.append(f"{path}: missing required frontmatter field {field}")
            continue
        validate_type(path, field, data[field], expected, errors)

    if data.get("doc_schema") != "amp-plugin-capability/v1":
        errors.append(f"{path}: doc_schema must be 'amp-plugin-capability/v1'")

    for section, fields in REQUIRED_NESTED.items():
        value = data.get(section)
        if not isinstance(value, dict):
            continue
        for field, expected in fields.items():
            full_field = f"{section}.{field}"
            if field not in value:
                errors.append(f"{path}: missing required frontmatter field {full_field}")
                continue
            validate_type(path, full_field, value[field], expected, errors)

    for field, allowed in ENUMS.items():
        section, key = field.split(".")
        section_value = data.get(section)
        value = section_value.get(key) if isinstance(section_value, dict) else None
        if isinstance(value, str) and value not in allowed:
            errors.append(f"{path}: {field} has invalid value {value!r}")

    amp = data.get("amp")
    last_verified = amp.get("last_verified") if isinstance(amp, dict) else None
    if isinstance(last_verified, str) and not re.match(r"^\d{4}-\d{2}-\d{2}$", last_verified):
        errors.append(f"{path}: amp.last_verified must use YYYY-MM-DD")

    h2s = markdown_h2s(path)
    if h2s != REQUIRED_H2S:
        errors.append(f"{path}: H2 headings must be exactly {REQUIRED_H2S!r}; got {h2s!r}")


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

        data = parse_frontmatter(fm)
        validate_schema_contract(doc, data, errors)

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
