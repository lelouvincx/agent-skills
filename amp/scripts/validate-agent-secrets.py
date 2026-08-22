"""Validate the source-controlled local agent secret capability policy."""

import json
import posixpath
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, SchemaError


ROOT = Path(__file__).resolve().parents[1] / "agent-secrets"
FORBIDDEN_VARIABLES = {
    "AGENT_SECRET_AUTH",
    "BASH_ENV",
    "CDPATH",
    "ENV",
    "FPATH",
    "GIT_ASKPASS",
    "GIT_CONFIG_COUNT",
    "GIT_CONFIG_PARAMETERS",
    "GIT_EXEC_PATH",
    "NODE_OPTIONS",
    "NODE_PATH",
    "OP_SERVICE_ACCOUNT_TOKEN",
    "PATH",
    "PERL5LIB",
    "PERL5OPT",
    "PYTHONHOME",
    "PYTHONPATH",
    "RUBYOPT",
    "SSH_ASKPASS",
}
FORBIDDEN_VARIABLE_PREFIXES = (
    "DYLD_",
    "GIT_CONFIG_KEY_",
    "GIT_CONFIG_VALUE_",
    "LD_",
)


class PolicyConfigurationError(ValueError):
    """The source-controlled policy is invalid and must fail closed."""


def _reject_duplicate_keys(pairs):
    value = {}
    for key, child in pairs:
        if key in value:
            raise PolicyConfigurationError(f"duplicate JSON key: {key}")
        value[key] = child
    return value


def read_json(path):
    try:
        return json.loads(path.read_text(), object_pairs_hook=_reject_duplicate_keys)
    except (OSError, json.JSONDecodeError, PolicyConfigurationError) as error:
        raise PolicyConfigurationError(f"{path}: {error}") from error


def schema_validator(path):
    schema = read_json(path)
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as error:
        raise PolicyConfigurationError(
            f"{path}: invalid Draft 2020-12 schema: {error.message}"
        ) from error
    return Draft202012Validator(schema)


def _strings(value, location="$"):
    if isinstance(value, dict):
        for key, child in value.items():
            yield from _strings(child, f"{location}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _strings(child, f"{location}[{index}]")
    elif isinstance(value, str):
        yield location, value


def _is_forbidden_variable(name):
    return name in FORBIDDEN_VARIABLES or name.startswith(FORBIDDEN_VARIABLE_PREFIXES)


def semantic_errors(path, data):
    errors = []
    if not isinstance(data, dict):
        return errors

    command_classes = data.get("command_classes", {})
    bundles = data.get("bundles", {})
    if not isinstance(command_classes, dict) or not isinstance(bundles, dict):
        return errors

    executable_owners = {}
    for class_name, command_class in command_classes.items():
        if not isinstance(command_class, dict):
            continue
        for executable_path in command_class.get("executablePaths", []):
            if not isinstance(executable_path, str):
                continue
            if not executable_path.startswith("/"):
                errors.append(
                    f"{path}: $.command_classes.{class_name}: executable path must be absolute"
                )
                continue
            if posixpath.normpath(executable_path) != executable_path:
                errors.append(
                    f"{path}: $.command_classes.{class_name}: executable path must be normalized"
                )
            previous = executable_owners.get(executable_path)
            if previous is not None and previous != class_name:
                errors.append(
                    f"{path}: executable path belongs to more than one command class: "
                    f"{previous}, {class_name}"
                )
            executable_owners[executable_path] = class_name

    class_names = set(command_classes)
    bundle_names = set(bundles)
    for bundle_name, bundle in bundles.items():
        if not isinstance(bundle, dict):
            continue
        compatible = bundle.get("compatibleBundles", [])
        for compatible_name in compatible:
            if compatible_name == bundle_name:
                errors.append(f"{path}: {bundle_name} cannot be compatible with itself")
                continue
            if compatible_name not in bundle_names:
                errors.append(
                    f"{path}: {bundle_name} names unknown compatible bundle: {compatible_name}"
                )
                continue
            other = bundles.get(compatible_name)
            if not isinstance(other, dict):
                continue
            if bundle_name not in other.get("compatibleBundles", []):
                errors.append(
                    f"{path}: compatibility must be symmetric: {bundle_name}, {compatible_name}"
                )
            if bundle.get("audience") != other.get("audience"):
                errors.append(
                    f"{path}: compatible bundles must have one audience: "
                    f"{bundle_name}, {compatible_name}"
                )
        for class_name in bundle.get("allowedCommandClasses", []):
            if class_name not in class_names:
                errors.append(
                    f"{path}: {bundle_name} names unknown command class: {class_name}"
                )
        for variable in bundle.get("variables", []):
            if isinstance(variable, str) and _is_forbidden_variable(variable):
                errors.append(
                    f"{path}: {bundle_name} contains process-control variable: {variable}"
                )

    for location, value in _strings(data):
        if "op://" in value.lower():
            errors.append(f"{path}: {location}: 1Password references are forbidden in policy")
    return errors


def validate_tree(root=ROOT):
    root = Path(root)
    errors = []
    schema_path = root / "bundles.schema.json"
    manifest_path = root / "bundles.json"
    try:
        validator = schema_validator(schema_path)
        data = read_json(manifest_path)
        errors.extend(
            f"{manifest_path}: {error.json_path}: {error.message}"
            for error in sorted(validator.iter_errors(data), key=lambda item: list(item.path))
        )
        errors.extend(semantic_errors(manifest_path, data))
    except (PolicyConfigurationError, ValueError) as error:
        errors.append(str(error))
    return errors


def main():
    errors = validate_tree()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("Agent secret capability policy is valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
