import copy
import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("validate-agent-secrets.py")
SPEC = importlib.util.spec_from_file_location("validate_agent_secrets", SCRIPT)
validator = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(validator)
SOURCE = Path(__file__).resolve().parents[1] / "agent-secrets"


class AgentSecretPolicyValidationTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name) / "agent-secrets"
        shutil.copytree(SOURCE, self.root)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def read_manifest(self):
        return json.loads((self.root / "bundles.json").read_text())

    def write_manifest(self, manifest):
        (self.root / "bundles.json").write_text(json.dumps(manifest, indent=2) + "\n")

    def test_checked_in_policy_is_valid(self):
        self.assertEqual([], validator.validate_tree(SOURCE))

    def test_schema_is_closed(self):
        manifest = self.read_manifest()
        manifest["unexpected"] = True
        self.write_manifest(manifest)
        self.assertTrue(
            any("Additional properties" in error for error in validator.validate_tree(self.root))
        )

    def test_duplicate_json_keys_fail_closed(self):
        manifest = (self.root / "bundles.json").read_text()
        (self.root / "bundles.json").write_text(
            manifest.replace(
                '  "version": 1,',
                '  "version": 1,\n  "version": 1,',
                1,
            )
        )
        self.assertTrue(
            any("duplicate JSON key: version" in error for error in validator.validate_tree(self.root))
        )

    def test_invalid_schema_fails_closed(self):
        schema_path = self.root / "bundles.schema.json"
        schema = json.loads(schema_path.read_text())
        schema["type"] = "invalid-type"
        schema_path.write_text(json.dumps(schema, indent=2) + "\n")
        errors = validator.validate_tree(self.root)
        self.assertEqual(1, len(errors))
        self.assertIn("invalid Draft 2020-12 schema", errors[0])

    def test_unknown_compatibility_and_command_class_fail(self):
        manifest = self.read_manifest()
        manifest["bundles"]["work"]["compatibleBundles"].append("unknown")
        manifest["bundles"]["work"]["allowedCommandClasses"].append("unknown")
        self.write_manifest(manifest)
        errors = validator.validate_tree(self.root)
        self.assertTrue(any("unknown compatible bundle" in error for error in errors))
        self.assertTrue(any("unknown command class" in error for error in errors))

    def test_compatibility_must_be_symmetric_and_share_an_audience(self):
        manifest = self.read_manifest()
        manifest["bundles"]["work"]["compatibleBundles"] = ["lelouvincx-bot"]
        manifest["bundles"]["lelouvincx-bot"]["compatibleBundles"] = []
        self.write_manifest(manifest)
        errors = validator.validate_tree(self.root)
        self.assertTrue(any("compatibility must be symmetric" in error for error in errors))
        self.assertTrue(any("must have one audience" in error for error in errors))

    def test_duplicate_or_unnormalized_executable_paths_fail(self):
        manifest = self.read_manifest()
        duplicate = manifest["command_classes"]["amp"]["executablePaths"][0]
        manifest["command_classes"]["pi"]["executablePaths"] = [duplicate]
        manifest["command_classes"]["claude-code"]["executablePaths"] = [
            "/Users/lelouvincx/bin/../bin/claude"
        ]
        self.write_manifest(manifest)
        errors = validator.validate_tree(self.root)
        self.assertTrue(any("more than one command class" in error for error in errors))
        self.assertTrue(any("must be normalized" in error for error in errors))

    def test_secret_references_and_process_control_variables_fail(self):
        manifest = self.read_manifest()
        manifest["command_classes"]["amp"]["executablePaths"] = [
            "/op://Agent Secrets/item/field"
        ]
        manifest["bundles"]["work"]["variables"].append("GIT_CONFIG_KEY_0")
        self.write_manifest(manifest)
        errors = validator.validate_tree(self.root)
        self.assertTrue(any("1Password references are forbidden" in error for error in errors))
        self.assertTrue(any("process-control variable" in error for error in errors))

    def test_bundle_owner_is_required_and_rejects_secret_references(self):
        manifest = self.read_manifest()
        del manifest["bundles"]["work"]["owner"]
        manifest["bundles"]["amp-runtime"]["owner"] = "op://Agent Secrets/item/field"
        self.write_manifest(manifest)
        errors = validator.validate_tree(self.root)
        self.assertTrue(any("owner" in error and "required" in error for error in errors))
        self.assertTrue(any("1Password references are forbidden" in error for error in errors))

    def test_invalid_names_and_duplicate_array_members_fail_schema(self):
        manifest = self.read_manifest()
        manifest["bundles"]["Bad Name"] = copy.deepcopy(manifest["bundles"]["work"])
        manifest["bundles"]["work"]["variables"].append("GH_TOKEN")
        self.write_manifest(manifest)
        errors = validator.validate_tree(self.root)
        self.assertTrue(any("Bad Name" in error and "does not match" in error for error in errors))
        self.assertTrue(any("non-unique" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
