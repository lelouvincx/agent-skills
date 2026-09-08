import contextlib
import importlib.util
import io
import json
import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]
MERGER_PATH = ROOT / "amp" / "scripts" / "merge-agent-browser-plugin.py"


def load_merger():
    spec = importlib.util.spec_from_file_location("merge_agent_browser_plugin", MERGER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


MERGER = load_merger()


class MergeAgentBrowserConfigTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.home = Path(self.temporary_directory.name)
        self.config_path = self.home / ".agent-browser" / "config.json"
        self.command_path = self.home / ".local" / "bin" / "agent-browser-plugin-onepassword"
        self.command_path.parent.mkdir(parents=True)
        self.command_path.write_text("#!/bin/sh\n")
        self.command_path.chmod(0o700)

    def write_config(self, value, mode=0o640):
        self.config_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.config_path.write_text(value)
        self.config_path.chmod(mode)

    def invoke(self, config_path=None, command_path=None):
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = MERGER.main(
                [
                    str(self.config_path if config_path is None else config_path),
                    str(self.command_path if command_path is None else command_path),
                ]
            )
        return code, stderr.getvalue()

    def read_json(self):
        return json.loads(self.config_path.read_text())

    def assert_onepassword_plugin(self, config):
        self.assertEqual(
            {
                "name": "onepassword",
                "command": str(self.command_path),
                "capabilities": ["credential.read"],
            },
            config["plugins"][-1],
        )

    def test_absent_config_gets_defaults_plugin_and_new_0600_mode(self):
        code, stderr = self.invoke()
        self.assertEqual(0, code, stderr)
        config = self.read_json()
        self.assertEqual("https://agent-browser.dev/schema.json", config["$schema"])
        self.assertIs(config["contentBoundaries"], True)
        self.assertEqual(50000, config["maxOutput"])
        self.assertIs(config["autoConnect"], False)
        self.assert_onepassword_plugin(config)
        self.assertEqual(0o600, stat.S_IMODE(self.config_path.stat().st_mode))

    def test_valid_user_preferences_unrelated_keys_and_plugins_are_preserved(self):
        self.write_config(
            json.dumps(
                {
                    "$schema": "https://example.invalid/custom.schema.json",
                    "contentBoundaries": False,
                    "maxOutput": 0,
                    "autoConnect": True,
                    "headed": False,
                    "futurePreference": {"kept": True},
                    "plugins": [
                        {
                            "name": "unrelated",
                            "command": "/usr/bin/true",
                            "capabilities": ["command.run"],
                        }
                    ],
                }
            )
        )
        code, stderr = self.invoke()
        self.assertEqual(0, code, stderr)
        config = self.read_json()
        self.assertEqual("https://example.invalid/custom.schema.json", config["$schema"])
        self.assertIs(config["contentBoundaries"], False)
        self.assertEqual(0, config["maxOutput"])
        self.assertIs(config["autoConnect"], True)
        self.assertEqual(False, config["headed"])
        self.assertEqual({"kept": True}, config["futurePreference"])
        self.assertEqual("unrelated", config["plugins"][0]["name"])
        self.assert_onepassword_plugin(config)

    def test_file_mode_is_preserved_and_repeated_merge_is_byte_stable(self):
        self.write_config('{"headed":false,"plugins":[]}\n', mode=0o664)
        code, stderr = self.invoke()
        self.assertEqual(0, code, stderr)
        first_bytes = self.config_path.read_bytes()
        self.assertEqual(0o664, stat.S_IMODE(self.config_path.stat().st_mode))
        code, stderr = self.invoke()
        self.assertEqual(0, code, stderr)
        self.assertEqual(first_bytes, self.config_path.read_bytes())
        self.assertEqual(0o664, stat.S_IMODE(self.config_path.stat().st_mode))

    def test_repository_owned_defaults_are_pinned_and_strictly_typed(self):
        with self.assertRaisesRegex(MERGER.MergeError, "not pinned: typo"):
            MERGER.validate_repository_defaults({"typo": True})
        with self.assertRaisesRegex(MERGER.MergeError, "maxOutput must be an unsigned integer"):
            MERGER.validate_repository_defaults({"maxOutput": True})
        with self.assertRaisesRegex(MERGER.MergeError, "contentBoundaries must be a boolean"):
            MERGER.validate_repository_defaults({"contentBoundaries": "true"})

    def test_conflicting_owned_plugin_fails_without_writing(self):
        original = '{"plugins":[{"name":"onepassword","command":"/tmp/not-owned","capabilities":["credential.read"]}]}\n'
        self.write_config(original)
        code, stderr = self.invoke()
        self.assertEqual(1, code)
        self.assertIn("conflicting ownership", stderr)
        self.assertEqual(original, self.config_path.read_text())

    def test_recognized_preferences_reject_malformed_scalar_types_without_writing(self):
        cases = [
            ("contentBoundaries", '"true"', "must be a boolean"),
            ("contentBoundaries", "null", "must be a boolean"),
            ("contentBoundaries", "1", "must be a boolean"),
            ("autoConnect", '"false"', "must be a boolean"),
            ("autoConnect", "0", "must be a boolean"),
            ("maxOutput", '"50000"', "must be an unsigned integer"),
            ("maxOutput", "true", "must be an unsigned integer"),
            ("maxOutput", "-1", "must be an unsigned integer"),
            ("maxOutput", str(2**64), "must be an unsigned integer"),
            ("$schema", "null", "must be a string"),
        ]
        for name, value, message in cases:
            with self.subTest(name=name, value=value):
                self.write_config(f'{{"{name}":{value},"plugins":[]}}\n')
                original = self.config_path.read_text()
                code, stderr = self.invoke()
                self.assertEqual(1, code)
                self.assertIn(message, stderr)
                self.assertEqual(original, self.config_path.read_text())

    def test_invalid_json_duplicates_symlink_and_nonstandard_numbers_do_not_write(self):
        self.write_config("{ invalid\n")
        original = self.config_path.read_text()
        code, stderr = self.invoke()
        self.assertEqual(1, code)
        self.assertIn("not valid JSON", stderr)
        self.assertEqual(original, self.config_path.read_text())

        self.write_config('{"plugins":[],"plugins":[]}\n')
        original = self.config_path.read_text()
        code, stderr = self.invoke()
        self.assertEqual(1, code)
        self.assertIn("duplicate key: plugins", stderr)
        self.assertEqual(original, self.config_path.read_text())

        self.write_config('{"maxOutput":NaN,"plugins":[]}\n')
        original = self.config_path.read_text()
        code, stderr = self.invoke()
        self.assertEqual(1, code)
        self.assertIn("nonstandard JSON number", stderr)
        self.assertEqual(original, self.config_path.read_text())

        self.config_path.unlink()
        self.config_path.symlink_to(self.home / "missing-config")
        code, stderr = self.invoke()
        self.assertEqual(1, code)
        self.assertIn("regular file", stderr)
        self.assertTrue(self.config_path.is_symlink())

    def test_cli_requires_absolute_paths_and_reports_usage(self):
        code, stderr = self.invoke(config_path=Path("relative-config.json"))
        self.assertEqual(2, code)
        self.assertIn("must be absolute", stderr)
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = MERGER.main([])
        self.assertEqual(2, code)
        self.assertIn("usage:", stderr.getvalue())

    def test_unknown_repository_default_key_fails_cli_without_writing(self):
        self.write_config('{"plugins":[]}\n')
        original = self.config_path.read_text()
        with mock.patch.dict(MERGER.DEFAULTS, {"typo": True}):
            code, stderr = self.invoke()
        self.assertEqual(1, code)
        self.assertIn("not pinned: typo", stderr)
        self.assertEqual(original, self.config_path.read_text())


if __name__ == "__main__":
    unittest.main()
