"""Validate and resolve source-controlled GitHub thread event policy."""

import json
import re
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, SchemaError


ROOT = Path(__file__).resolve().parents[1] / "github-thread-events"
REPOSITORY_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/[a-z0-9._-]+$")
REQUIRED_GLOBAL_POLICIES = {
    "github.workflow-run.failure",
    "github.pull-request.merged",
    "github.pull-request.review-feedback",
    "github.pull-request.merge-conflict",
}
BASE_SOURCE_POINTERS = {"delivery-id", "repository", "pull-request", "canonical-url"}
PREFLIGHT_SOURCE_POINTERS = {
    "failed-run-still-matches-current-head": {"head-sha"},
    "current-unresolved-review-feedback": {"actor"},
    "pull-request-currently-conflicting": {"head-sha"},
}
FORBIDDEN_KEYS = {
    "accountid",
    "credential",
    "credentials",
    "database",
    "databasepath",
    "queueid",
    "secret",
    "token",
    "webhooksecret",
}


class PolicyConfigurationError(ValueError):
    """An applicable policy file is invalid and lookup must fail closed."""


def read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise PolicyConfigurationError(f"{path}: {error}") from error


def schema_validator(path):
    schema = read_json(path)
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as error:
        raise PolicyConfigurationError(f"{path}: invalid Draft 2020-12 schema: {error.message}") from error
    return Draft202012Validator(schema)


def forbidden_keys(value, location="$"):
    errors = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_location = f"{location}.{key}"
            if key.lower() in FORBIDDEN_KEYS:
                errors.append(f"{child_location}: forbidden secret, deployment or runtime-state field")
            errors.extend(forbidden_keys(child, child_location))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            errors.extend(forbidden_keys(child, f"{location}[{index}]"))
    return errors


def validate_instance(path, validator):
    data = read_json(path)
    errors = [
        f"{path}: {error.json_path}: {error.message}"
        for error in sorted(validator.iter_errors(data), key=lambda item: list(item.path))
    ]
    errors.extend(f"{path}: {error}" for error in forbidden_keys(data))
    return data, errors


def validate_policy_set(path, validator):
    data, errors = validate_instance(path, validator)
    policies = data.get("policies", []) if isinstance(data, dict) else []
    ids = [policy.get("id") for policy in policies if isinstance(policy, dict)]
    duplicates = sorted({policy_id for policy_id in ids if ids.count(policy_id) > 1})
    if duplicates:
        errors.append(f"{path}: duplicate policy IDs: {', '.join(duplicates)}")
    for index, policy in enumerate(policies):
        if isinstance(policy, dict) and policy.get("id") != policy.get("sourceCandidate"):
            errors.append(f"{path}: $.policies[{index}]: id must equal sourceCandidate")
        if isinstance(policy, dict):
            required_pointers = BASE_SOURCE_POINTERS | PREFLIGHT_SOURCE_POINTERS.get(
                policy.get("currentStatePreflight"), set()
            )
            pointers = set(policy.get("sourcePointers", []))
            missing_pointers = sorted(required_pointers - pointers)
            if missing_pointers:
                errors.append(
                    f"{path}: $.policies[{index}]: missing required source pointers: "
                    f"{', '.join(missing_pointers)}"
                )
    return data, errors


def validate_tree(root=ROOT):
    root = Path(root)
    errors = []
    try:
        config_validator = schema_validator(root / "config.schema.json")
        policy_validator = schema_validator(root / "policy-set.schema.json")
        config, config_errors = validate_instance(root / "config.json", config_validator)
        errors.extend(config_errors)

        config_repositories = config.get("repositories", []) if isinstance(config, dict) else []
        repositories = [item.get("repository") for item in config_repositories if isinstance(item, dict)]
        duplicates = sorted({repository for repository in repositories if repositories.count(repository) > 1})
        if duplicates:
            errors.append(f"{root / 'config.json'}: duplicate repositories: {', '.join(duplicates)}")

        global_path = root / "policies" / "global.json"
        global_set, global_errors = validate_policy_set(global_path, policy_validator)
        errors.extend(global_errors)
        global_policies = global_set.get("policies", []) if isinstance(global_set, dict) else []
        global_ids = {policy.get("id") for policy in global_policies if isinstance(policy, dict)}
        missing = sorted(REQUIRED_GLOBAL_POLICIES - global_ids)
        if missing:
            errors.append(f"{global_path}: missing required global policies: {', '.join(missing)}")

        projects_root = root / "policies" / "projects"
        for path in sorted(projects_root.glob("*/*.json")):
            repository = f"{path.parent.name}/{path.stem}"
            if not REPOSITORY_PATTERN.fullmatch(repository):
                errors.append(f"{path}: project policy path must be lowercase owner/repository.json")
            if repository not in repositories:
                errors.append(f"{path}: project policy repository is not configured: {repository}")
            _, policy_errors = validate_policy_set(path, policy_validator)
            errors.extend(policy_errors)

        unexpected = sorted(path for path in projects_root.rglob("*.json") if len(path.relative_to(projects_root).parts) != 2)
        errors.extend(f"{path}: project policy must be at <owner>/<repository>.json" for path in unexpected)
    except (PolicyConfigurationError, ValueError) as error:
        errors.append(str(error))
    return errors


def load_valid_policy_set(path, validator):
    data, errors = validate_policy_set(path, validator)
    if errors:
        raise PolicyConfigurationError("\n".join(errors))
    return data


def resolve_policy(root, repository, policy_id):
    """Return (scope, policy), or ('missing-event-policy', None)."""
    root = Path(root)
    if not REPOSITORY_PATTERN.fullmatch(repository):
        raise PolicyConfigurationError(f"invalid repository: {repository}")
    config = read_json(root / "config.json")
    configured_repositories = {
        item.get("repository")
        for item in config.get("repositories", [])
        if isinstance(item, dict)
    }
    if repository not in configured_repositories:
        raise PolicyConfigurationError(f"repository is not configured for monitoring: {repository}")
    validator = schema_validator(root / "policy-set.schema.json")
    project_path = root / "policies" / "projects" / f"{repository}.json"
    if project_path.exists():
        project_set = load_valid_policy_set(project_path, validator)
        for policy in project_set["policies"]:
            if policy["id"] == policy_id:
                return "project", policy

    global_set = load_valid_policy_set(root / "policies" / "global.json", validator)
    for policy in global_set["policies"]:
        if policy["id"] == policy_id:
            return "global", policy
    return "missing-event-policy", None


def main():
    errors = validate_tree()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("GitHub thread event configuration is valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
