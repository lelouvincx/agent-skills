import contextlib
import importlib.util
import io
import json
import stat
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATOR_PATH = ROOT / "amp" / "scripts" / "migrate-agent-browser-config.py"


def load_migrator():
    spec = importlib.util.spec_from_file_location(
        "migrate_agent_browser_config", MIGRATOR_PATH
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


MIGRATOR = load_migrator()


class MigrateAgentBrowserConfigTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.home = Path(self.temporary_directory.name)
        self.config_path = self.home / ".agent-browser" / "config.json"
        self.command_path = (
            self.home / ".local" / "bin" / "agent-browser-plugin-onepassword"
        )
        self.registration = {
            "name": "onepassword",
            "command": str(self.command_path),
            "capabilities": ["credential.read"],
        }

    def write_config(self, value, mode=0o640):
        self.config_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.config_path.write_text(value)
        self.config_path.chmod(mode)

    def invoke(self, config_path=None, command_path=None):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = MIGRATOR.main(
                [
                    str(self.config_path if config_path is None else config_path),
                    str(self.command_path if command_path is None else command_path),
                ]
            )
        return code, stdout.getvalue(), stderr.getvalue()

    def test_exact_entry_is_removed_and_unrelated_plugin_is_kept(self):
        unrelated = {"name": "other", "command": "/usr/bin/true"}
        self.write_config(
            json.dumps(
                {
                    "headed": False,
                    "plugins": [unrelated, self.registration],
                }
            )
        )
        code, stdout, stderr = self.invoke()
        self.assertEqual(0, code, stderr)
        self.assertIn("removed:", stdout)
        self.assertEqual(
            {"headed": False, "plugins": [unrelated]},
            json.loads(self.config_path.read_text()),
        )

    def test_plugins_key_is_removed_when_exact_entry_was_the_only_plugin(self):
        self.write_config(json.dumps({"future": True, "plugins": [self.registration]}))
        code, _, stderr = self.invoke()
        self.assertEqual(0, code, stderr)
        self.assertEqual({"future": True}, json.loads(self.config_path.read_text()))

    def test_conflicting_onepassword_entry_is_preserved_with_warning(self):
        original = (
            '{"plugins":[{"name":"onepassword","command":"/tmp/foreign",'
            '"capabilities":["credential.read"]}]}\n'
        )
        self.write_config(original)
        code, stdout, stderr = self.invoke()
        self.assertEqual(0, code)
        self.assertEqual("", stdout)
        self.assertIn("warning:", stderr)
        self.assertIn("conflicting", stderr)
        self.assertEqual(original, self.config_path.read_text())

    def test_invalid_json_duplicates_and_nonstandard_numbers_do_not_write(self):
        cases = [
            ("{ invalid\n", "not valid JSON"),
            ('{"plugins":[],"plugins":[]}\n', "duplicate key: plugins"),
            ('{"value":NaN}\n', "nonstandard JSON number"),
        ]
        for original, message in cases:
            with self.subTest(message=message):
                self.write_config(original)
                code, _, stderr = self.invoke()
                self.assertEqual(1, code)
                self.assertIn(message, stderr)
                self.assertEqual(original, self.config_path.read_text())

    def test_symlink_is_refused_without_replacement(self):
        self.config_path.parent.mkdir(parents=True)
        self.config_path.symlink_to(self.home / "missing-config")
        code, _, stderr = self.invoke()
        self.assertEqual(1, code)
        self.assertIn("regular file", stderr)
        self.assertTrue(self.config_path.is_symlink())

    def test_mode_is_preserved_when_migration_writes(self):
        self.write_config(json.dumps({"plugins": [self.registration]}), mode=0o664)
        code, _, stderr = self.invoke()
        self.assertEqual(0, code, stderr)
        self.assertEqual(0o664, stat.S_IMODE(self.config_path.stat().st_mode))

    def test_noop_is_byte_stable(self):
        original = b'{ "future": true, "plugins": [{"name": "other"}] }\n'
        self.write_config(original.decode())
        code, stdout, stderr = self.invoke()
        self.assertEqual(0, code, stderr)
        self.assertEqual("", stdout)
        self.assertEqual(original, self.config_path.read_bytes())

    def test_missing_config_is_not_created(self):
        code, stdout, stderr = self.invoke()
        self.assertEqual(0, code, stderr)
        self.assertEqual("", stdout)
        self.assertFalse(self.config_path.exists())

    def test_cli_requires_absolute_paths_and_reports_usage(self):
        code, _, stderr = self.invoke(config_path=Path("relative-config.json"))
        self.assertEqual(2, code)
        self.assertIn("must be absolute", stderr)
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = MIGRATOR.main([])
        self.assertEqual(2, code)
        self.assertIn("usage:", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
