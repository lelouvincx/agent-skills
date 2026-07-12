#!/usr/bin/env python3
"""Validate Amp artifact documentation consistency."""

from __future__ import annotations

import re
import sys
from datetime import date
from pathlib import Path

import yaml


AMP_ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = AMP_ROOT / "docs" / "tools"

V2_REQUIRED_TOP_LEVEL = {
    "doc_schema": "scalar",
    "title": "scalar",
    "slug": "scalar",
    "status": "scalar",
    "summary": "scalar",
    "artifact": "mapping",
    "source": "mapping",
    "amp": "mapping",
    "contract": "mapping",
    "runtime": "mapping",
    "safety": "mapping",
    "related": "list",
    "tags": "list",
}

V2_REQUIRED_NESTED = {
    "artifact": {
        "id": "scalar",
        "type": "scalar",
        "surface": "scalar",
        "invocation": "scalar",
        "api_stability": "scalar",
    },
    "source": {
        "kind": "scalar",
        "file": "scalar",
        "scope": "scalar",
        "install_source": "scalar",
        "registration_api": "nullable_scalar",
        "metadata_comments": "list",
    },
    "amp": {
        "docs_sources": "mapping",
        "last_verified": "scalar",
    },
    "contract": {
        "input_kind": "scalar",
        "output_kind": "scalar",
        "trigger": "nullable_scalar",
        "allowed_tools": "list",
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

V2_OPTIONAL_NESTED = {
    "contract": {
        "required_inputs": "list",
        "optional_inputs": "list",
        "model": "scalar",
    },
}

PLUGIN_INVARIANTS = {
    "agent_tool": ("agent", "tool_call", "amp.registerTool", None),
    "command": ("command_palette", "command_palette", "amp.registerCommand", "command_id"),
    "event_handler": ("plugin_event_pipeline", "plugin_event", "amp.on", "event"),
    "agent_mode": ("mode_picker", "new_thread_mode", "amp.experimental.registerAgentMode", "agent_mode_key"),
}

V2_ENUMS = {
    "artifact.type": {"skill", "agent_tool", "command", "event_handler", "agent_mode", "status_item", "helper_agent"},
    "artifact.surface": {"agent_context", "agent", "command_palette", "plugin_event_pipeline", "mode_picker", "status_bar", "internal"},
    "artifact.invocation": {"skill_load", "tool_call", "command_palette", "plugin_event", "new_thread_mode", "status_update", "internal_call"},
    "artifact.api_stability": {"stable", "experimental", "mixed"},
    "source.kind": {"plugin", "skill"},
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


def parse_frontmatter(fm: str) -> dict[str, object]:
    data = yaml.safe_load(fm)
    return data if isinstance(data, dict) else {}


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
    schema = data.get("doc_schema")
    if schema == "amp-artifact/v2":
        required_top_level = V2_REQUIRED_TOP_LEVEL
        required_nested = V2_REQUIRED_NESTED
        enums = V2_ENUMS
    else:
        errors.append(f"{path}: unsupported doc_schema {schema!r}")
        return

    for field, expected in required_top_level.items():
        if field not in data:
            errors.append(f"{path}: missing required frontmatter field {field}")
            continue
        validate_type(path, field, data[field], expected, errors)

    for section, fields in required_nested.items():
        value = data.get(section)
        if not isinstance(value, dict):
            continue
        allowed_fields = set(fields) | set(V2_OPTIONAL_NESTED.get(section, {}))
        for unknown in sorted(set(value) - allowed_fields):
            errors.append(f"{path}: unknown frontmatter field {section}.{unknown}")
        for field, expected in fields.items():
            full_field = f"{section}.{field}"
            if field not in value:
                errors.append(f"{path}: missing required frontmatter field {full_field}")
                continue
            validate_type(path, full_field, value[field], expected, errors)
        for field, expected in V2_OPTIONAL_NESTED.get(section, {}).items():
            if field in value:
                validate_type(path, f"{section}.{field}", value[field], expected, errors)

    for unknown in sorted(set(data) - set(required_top_level)):
        errors.append(f"{path}: unknown top-level frontmatter field {unknown}")

    for field, allowed in enums.items():
        section, key = field.split(".")
        section_value = data.get(section)
        value = section_value.get(key) if isinstance(section_value, dict) else None
        if isinstance(value, str) and value not in allowed:
            errors.append(f"{path}: {field} has invalid value {value!r}")

    amp = data.get("amp")
    last_verified = amp.get("last_verified") if isinstance(amp, dict) else None
    try:
        date.fromisoformat(last_verified) if isinstance(last_verified, str) else None
    except ValueError:
        last_verified = None
    if not isinstance(last_verified, str) or not re.match(r"^\d{4}-\d{2}-\d{2}$", last_verified):
        errors.append(f"{path}: amp.last_verified must use YYYY-MM-DD")

    docs_sources = amp.get("docs_sources") if isinstance(amp, dict) else None
    if isinstance(docs_sources, dict):
        if set(docs_sources) != {"api_docs", "agent_options"}:
            errors.append(f"{path}: amp.docs_sources must contain exactly api_docs and agent_options")
        for role, value in docs_sources.items():
            if value is not None and not isinstance(value, str):
                errors.append(f"{path}: amp.docs_sources.{role} must be nullable_scalar")

    if schema == "amp-artifact/v2":
        artifact = data.get("artifact")
        source = data.get("source")
        if isinstance(artifact, dict) and isinstance(source, dict):
            artifact_type = artifact.get("type")
            source_kind = source.get("kind")
            registration_api = source.get("registration_api")
            if artifact_type == "skill":
                if artifact.get("surface") != "agent_context" or artifact.get("invocation") != "skill_load":
                    errors.append(f"{path}: skill artifacts must use surface 'agent_context' and invocation 'skill_load'")
                if source_kind != "skill" or registration_api is not None:
                    errors.append(f"{path}: skill artifacts must use source.kind 'skill' and a null registration_api")
            elif source_kind != "plugin" or not isinstance(registration_api, str) or not registration_api:
                errors.append(f"{path}: plugin artifacts must use source.kind 'plugin' and a non-empty registration_api")
            elif artifact_type in PLUGIN_INVARIANTS:
                surface, invocation, api, discriminator = PLUGIN_INVARIANTS[artifact_type]
                if (artifact.get("surface"), artifact.get("invocation"), registration_api) != (surface, invocation, api):
                    errors.append(f"{path}: {artifact_type} must use surface {surface!r}, invocation {invocation!r}, and registration_api {api!r}")
                contract = data.get("contract")
                if isinstance(contract, dict):
                    if contract.get("trigger") != invocation:
                        errors.append(f"{path}: {artifact_type} requires contract.trigger {invocation!r}")
                    for field in ("event", "command_id", "agent_mode_key"):
                        value = contract.get(field)
                        if field == discriminator:
                            if not isinstance(value, str) or not value:
                                errors.append(f"{path}: {artifact_type} requires non-empty contract.{field}")
                        elif value is not None:
                            errors.append(f"{path}: {artifact_type} requires contract.{field} to be null")
            elif artifact_type != "skill":
                errors.append(f"{path}: artifact.type {artifact_type!r} has no documented invariant")

    h2s = markdown_h2s(path)
    if h2s != REQUIRED_H2S:
        errors.append(f"{path}: H2 headings must be exactly {REQUIRED_H2S!r}; got {h2s!r}")


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

        slug = data.get("slug")
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

        data = parse_frontmatter(fm)
        related = data.get("related", [])
        for related_slug in related if isinstance(related, list) else []:
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
        print("Amp artifact doc validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Validated {len(doc_to_slug)} Amp artifact docs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
