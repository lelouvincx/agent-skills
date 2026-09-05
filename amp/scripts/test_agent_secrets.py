import json
import os
import runpy
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "bin" / "agent-secrets"
SMARTCLASS_WRAPPER = ROOT / "bin" / "smartclass-wrangler-dev"
RUNTIME = runpy.run_path(str(SCRIPT))
SMARTCLASS_RUNTIME = runpy.run_path(str(SMARTCLASS_WRAPPER))


FAKE_OP = r'''#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

lane = "service" if "OP_SERVICE_ACCOUNT_TOKEN" in os.environ else "interactive"
arguments = sys.argv[1:]
if arguments[:2] == ["account", "get"]:
    stage = "account"
elif arguments[:2] == ["vault", "list"]:
    stage = "vault"
elif arguments[:1] == ["read"]:
    stage = "read"
else:
    stage = "unknown"

log_path = os.environ.get("FAKE_OP_LOG")
if log_path:
    with Path(log_path).open("a") as log:
        log.write(f"{lane}:{stage}\n")

if lane == "interactive" and os.environ.get("FAKE_OP_FAIL_INTERACTIVE") == stage:
    raise SystemExit(19)
if lane == "service" and os.environ.get("FAKE_OP_FAIL_SERVICE") == stage:
    raise SystemExit(20)

if stage == "account":
    expected = ["--account", "my.1password.com", "--format", "json"]
    if arguments[2:] != expected or lane != "interactive":
        raise SystemExit(21)
    print(json.dumps({"url": "my.1password.com"}))
elif stage == "vault":
    names = os.environ.get("FAKE_OP_VAULTS", "Agent Secrets").split(",")
    print(json.dumps([{"name": name} for name in names if name]))
elif stage == "read":
    reference = arguments[1]
    failure_suffix = os.environ.get("FAKE_OP_FAIL_SERVICE_REFERENCE_SUFFIX")
    if lane == "service" and failure_suffix and reference.endswith(failure_suffix):
        raise SystemExit(22)
    if lane == "interactive" and arguments[2:] != ["--account", "my.1password.com"]:
        raise SystemExit(23)
    print("resolved-" + reference.rsplit("/", 1)[-1])
else:
    raise SystemExit(24)
'''


FAKE_CHILD = r'''#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

if sys.argv[1] == "exit":
    raise SystemExit(int(sys.argv[2]))

names = [
    "ALPHA_TOKEN",
    "BETA_KEY",
    "PUBLISH_TOKEN",
    "AGENT_SECRET_AUTH",
    "OP_SERVICE_ACCOUNT_TOKEN",
    "INHERITED_SECRET",
    "SAFE_VALUE",
    "BASH_ENV",
    "DYLD_INSERT_LIBRARIES",
    "NODE_OPTIONS",
    "PYTHONPATH",
    "GIT_CONFIG_KEY_0",
]
payload = {
    "arguments": sys.argv[2:],
    "environment": {name: os.environ[name] for name in names if name in os.environ},
}
Path(sys.argv[1]).write_text(json.dumps(payload))
'''


def write_executable(path, contents):
    path.write_text(contents)
    path.chmod(0o700)


class AgentSecretsTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.home = Path(self.temporary_directory.name)
        self.config_root = self.home / ".config" / "amp" / "agent-secrets"
        self.config_root.mkdir(parents=True)
        self.bundle_root = self.home / ".credentials" / "agent-secrets"
        self.bundle_root.mkdir(parents=True, mode=0o700)
        self.bundle_root.chmod(0o700)
        self.bootstrap_root = self.home / ".local" / "share" / "agent-secrets"
        self.bootstrap_root.mkdir(parents=True, mode=0o700)
        self.bootstrap_root.chmod(0o700)
        self.bootstrap = self.bootstrap_root / "op-service-account-token"
        self.bootstrap.write_text("test-bootstrap-value\n")
        self.bootstrap.chmod(0o600)

        self.bin_root = self.home / "bin"
        self.bin_root.mkdir()
        self.op = self.bin_root / "op"
        self.agent = self.bin_root / "agent-child"
        self.publisher = self.bin_root / "publisher-child"
        write_executable(self.op, FAKE_OP)
        write_executable(self.agent, FAKE_CHILD)
        write_executable(self.publisher, FAKE_CHILD)
        self.op_log = self.home / "op.log"

        self.manifest = {
            "version": 1,
            "command_classes": {
                "agent": {"executablePaths": [str(self.agent)]},
                "publisher": {"executablePaths": [str(self.publisher)]},
            },
            "bundles": {
                "alpha": {
                    "audience": "agent",
                    "owner": "lelouvincx/agent-skills",
                    "variables": ["ALPHA_TOKEN"],
                    "compatibleBundles": ["beta"],
                    "allowedCommandClasses": ["agent"],
                },
                "beta": {
                    "audience": "agent",
                    "owner": "lelouvincx/agent-skills",
                    "variables": ["BETA_KEY"],
                    "compatibleBundles": ["alpha"],
                    "allowedCommandClasses": ["agent"],
                },
                "publisher": {
                    "audience": "publisher",
                    "owner": "lelouvincx/second-brain-logseq",
                    "variables": ["ALPHA_TOKEN"],
                    "compatibleBundles": [],
                    "allowedCommandClasses": ["publisher"],
                },
            },
        }
        self.write_manifest()
        self.write_bundle("alpha", "ALPHA_TOKEN", "alpha-value")
        self.write_bundle("beta", "BETA_KEY", "beta-value")
        self.write_bundle("publisher", "ALPHA_TOKEN", "publisher-value")

    def tearDown(self):
        self.temporary_directory.cleanup()

    def write_manifest(self):
        (self.config_root / "bundles.json").write_text(
            json.dumps(self.manifest, indent=2) + "\n"
        )

    def write_bundle(self, bundle, variable, field, mode=0o600):
        path = self.bundle_root / f"{bundle}.env"
        path.write_text(f"{variable}=op://Agent Secrets/{bundle}/{field}\n")
        path.chmod(mode)
        return path

    def environment(self, auth="interactive", **changes):
        environment = {
            "HOME": str(self.home),
            "AMP_CONFIG_DIR": str(self.home / ".config" / "amp"),
            "PATH": f"{self.bin_root}:{os.environ.get('PATH', '')}",
            "AGENT_SECRET_AUTH": auth,
            "FAKE_OP_LOG": str(self.op_log),
            "SAFE_VALUE": "kept",
        }
        environment.update(changes)
        return environment

    def run_cli(self, *arguments, auth="interactive", **environment_changes):
        return subprocess.run(
            [sys.executable, str(SCRIPT), *map(str, arguments)],
            check=False,
            capture_output=True,
            text=True,
            env=self.environment(auth, **environment_changes),
        )

    def op_events(self):
        return self.op_log.read_text().splitlines() if self.op_log.exists() else []

    def test_interactive_run_preserves_arguments_and_builds_a_sanitized_child_environment(self):
        output = self.home / "child.json"
        self.bootstrap.chmod(0o666)
        result = self.run_cli(
            "run",
            "--bundle",
            "alpha",
            "--bundle",
            "beta",
            "--",
            self.agent,
            output,
            "space value",
            ";",
            INHERITED_SECRET="remove",
            OP_SERVICE_ACCOUNT_TOKEN="remove",
            BASH_ENV="remove",
            NODE_OPTIONS="remove",
            PYTHONPATH="remove",
            GIT_CONFIG_KEY_0="remove",
        )
        self.assertEqual(0, result.returncode, result.stderr)
        payload = json.loads(output.read_text())
        self.assertEqual(["space value", ";"], payload["arguments"])
        self.assertEqual(
            {
                "ALPHA_TOKEN": "resolved-alpha-value",
                "BETA_KEY": "resolved-beta-value",
                "SAFE_VALUE": "kept",
            },
            payload["environment"],
        )
        self.assertEqual(
            ["interactive:account", "interactive:read", "interactive:read"],
            self.op_events(),
        )

    def test_sanitization_removes_every_process_control_family(self):
        environment = {
            "SAFE_VALUE": "kept",
            "AGENT_SECRET_AUTH": "interactive",
            "INHERITED_PASSWORD": "remove",
            "BASH_ENV": "remove",
            "CDPATH": "remove",
            "DYLD_INSERT_LIBRARIES": "remove",
            "LD_PRELOAD": "remove",
            "NODE_OPTIONS": "remove",
            "PYTHONHOME": "remove",
            "RUBYOPT": "remove",
            "PERL5LIB": "remove",
            "GIT_ASKPASS": "remove",
            "GIT_CONFIG_COUNT": "remove",
            "GIT_CONFIG_KEY_0": "remove",
            "GIT_CONFIG_VALUE_0": "remove",
        }
        self.assertEqual(
            {"SAFE_VALUE": "kept"},
            RUNTIME["sanitized_environment"](environment),
        )

    def test_child_exit_status_is_returned(self):
        result = self.run_cli("run", "--bundle", "alpha", "--", self.agent, "exit", "23")
        self.assertEqual(23, result.returncode)

    def test_realpath_matching_accepts_an_alias_but_rejects_ambiguous_classes(self):
        alias = self.bin_root / "agent-alias"
        alias.symlink_to(self.agent)
        self.manifest["command_classes"]["agent"]["executablePaths"] = [str(alias)]
        self.write_manifest()
        output = self.home / "alias.json"
        result = self.run_cli("run", "--bundle", "alpha", "--", self.agent, output)
        self.assertEqual(0, result.returncode, result.stderr)

        second_alias = self.bin_root / "second-alias"
        second_alias.symlink_to(self.agent)
        self.manifest["command_classes"]["publisher"]["executablePaths"] = [str(second_alias)]
        self.write_manifest()
        self.op_log.unlink(missing_ok=True)
        result = self.run_cli("run", "--bundle", "alpha", "--", self.agent, output)
        self.assertNotEqual(0, result.returncode)
        self.assertIn("more than one class", result.stderr)
        self.assertEqual([], self.op_events())

    def test_bundle_and_command_policy_fail_before_1password_access(self):
        cases = [
            (["run", "--bundle", "unknown", "--", self.agent], "unknown bundle"),
            (
                [
                    "run",
                    "--bundle",
                    "alpha",
                    "--bundle",
                    "publisher",
                    "--",
                    self.agent,
                ],
                "mix agent and publisher",
            ),
            (["run", "--bundle", "publisher", "--", self.agent], "not allowed"),
            (["run", "--bundle", "alpha", "--", "relative-command"], "absolute path"),
        ]
        for arguments, message in cases:
            with self.subTest(message=message):
                self.op_log.unlink(missing_ok=True)
                result = self.run_cli(*arguments, auth="service-account")
                self.assertNotEqual(0, result.returncode)
                self.assertIn(message, result.stderr)
                self.assertEqual([], self.op_events())

    def test_local_bundle_syntax_and_permissions_fail_before_1password_access(self):
        cases = [
            ("ALPHA_TOKEN=plaintext\n", 0o600, "not in Agent Secrets"),
            ("export ALPHA_TOKEN=op://Agent Secrets/alpha/value\n", 0o600, "malformed"),
            ("ALPHA_TOKEN=op://Other Vault/alpha/value\n", 0o600, "not in Agent Secrets"),
            ("ALPHA_TOKEN=op://Agent Secrets/alpha/$value\n", 0o600, "unsafe syntax"),
            (
                "ALPHA_TOKEN=op://Agent Secrets/alpha/value?attribute=title\n",
                0o600,
                "unsafe syntax",
            ),
            ("ALPHA_TOKEN=op://Agent Secrets/alpha/value\n", 0o644, "permissions"),
            ("ALPHA_TOKEN=op://Agent Secrets/alpha/value\n", 0o400, "permissions"),
        ]
        path = self.bundle_root / "alpha.env"
        for contents, mode, message in cases:
            with self.subTest(message=message):
                path.unlink(missing_ok=True)
                path.write_text(contents)
                path.chmod(mode)
                self.op_log.unlink(missing_ok=True)
                result = self.run_cli(
                    "run", "--bundle", "alpha", "--", self.agent, self.home / "out",
                    auth="service-account",
                )
                self.assertNotEqual(0, result.returncode)
                self.assertIn(message, result.stderr)
                self.assertEqual([], self.op_events())

        path.unlink()
        path.symlink_to(self.bundle_root / "beta.env")
        result = self.run_cli(
            "run", "--bundle", "alpha", "--", self.agent, self.home / "out",
            auth="service-account",
        )
        self.assertNotEqual(0, result.returncode)
        self.assertIn("symbolic link", result.stderr)
        self.assertEqual([], self.op_events())

    def test_local_bundle_allows_the_otp_attribute_query(self):
        path = self.write_bundle(
            "alpha", "ALPHA_TOKEN", "one-time password?attribute=otp"
        )
        self.assertEqual(
            {
                "ALPHA_TOKEN": (
                    "op://Agent Secrets/alpha/one-time password?attribute=otp"
                )
            },
            RUNTIME["parse_bundle_file"](
                path, "alpha", self.manifest["bundles"]["alpha"]["variables"]
            ),
        )

    def test_service_account_runs_first_and_does_not_reach_the_child_environment(self):
        output = self.home / "service.json"
        result = self.run_cli(
            "run",
            "--bundle",
            "alpha",
            "--",
            self.agent,
            output,
            auth="service-account",
        )
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(["service:vault", "service:read"], self.op_events())
        payload = json.loads(output.read_text())
        self.assertNotIn("OP_SERVICE_ACCOUNT_TOKEN", payload["environment"])
        self.assertNotIn("AGENT_SECRET_AUTH", payload["environment"])

    def test_service_account_operational_failure_retries_the_complete_operation_interactively(self):
        output = self.home / "fallback.json"
        result = self.run_cli(
            "run",
            "--bundle",
            "alpha",
            "--bundle",
            "beta",
            "--",
            self.agent,
            output,
            auth="service-account",
            FAKE_OP_FAIL_SERVICE_REFERENCE_SUFFIX="beta-value",
        )
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(
            [
                "service:vault",
                "service:read",
                "service:read",
                "interactive:account",
                "interactive:read",
                "interactive:read",
            ],
            self.op_events(),
        )
        self.assertIn("retrying the complete operation interactively", result.stderr)
        self.assertNotIn("op://", result.stderr)
        self.assertNotIn("test-bootstrap-value", result.stderr)
        self.assertNotIn("resolved-", result.stderr)

    def test_interactive_failure_never_falls_back_to_service_account(self):
        result = self.run_cli(
            "run",
            "--bundle",
            "alpha",
            "--",
            self.agent,
            self.home / "out",
            FAKE_OP_FAIL_INTERACTIVE="account",
        )
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(["interactive:account"], self.op_events())
        self.assertNotIn("retrying", result.stderr)

    def test_wrong_service_account_vault_scope_is_a_policy_failure_without_fallback(self):
        result = self.run_cli(
            "run",
            "--bundle",
            "alpha",
            "--",
            self.agent,
            self.home / "out",
            auth="service-account",
            FAKE_OP_VAULTS="Agent Secrets,Other Vault",
        )
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(["service:vault"], self.op_events())
        self.assertIn("must access exactly Agent Secrets", result.stderr)
        self.assertNotIn("retrying", result.stderr)

    def test_unsafe_bootstrap_state_fails_without_1password_access_or_fallback(self):
        self.bootstrap.chmod(0o644)
        result = self.run_cli(
            "run",
            "--bundle",
            "alpha",
            "--",
            self.agent,
            self.home / "out",
            auth="service-account",
        )
        self.assertNotEqual(0, result.returncode)
        self.assertIn("bootstrap file permissions", result.stderr)
        self.assertEqual([], self.op_events())
        self.assertNotIn("retrying", result.stderr)

        self.bootstrap.chmod(0o600)
        self.bootstrap.write_text("OP_SERVICE_ACCOUNT_TOKEN=test-bootstrap-value\n")
        result = self.run_cli(
            "run",
            "--bundle",
            "alpha",
            "--",
            self.agent,
            self.home / "out",
            auth="service-account",
        )
        self.assertNotEqual(0, result.returncode)
        self.assertIn("must not contain an assignment", result.stderr)
        self.assertEqual([], self.op_events())

    def test_doctor_validates_every_bundle_and_reports_names_only(self):
        result = self.run_cli(
            "doctor",
            auth="service-account",
            OP_SERVICE_ACCOUNT_TOKEN="inherited-value",
        )
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("alpha.ALPHA_TOKEN: ok", result.stdout)
        self.assertIn("beta.BETA_KEY: ok", result.stdout)
        self.assertIn("publisher.ALPHA_TOKEN: ok", result.stdout)
        self.assertIn("child-environment probe: ok", result.stdout)
        self.assertNotIn("op://", result.stdout + result.stderr)
        self.assertNotIn("resolved-", result.stdout + result.stderr)
        self.assertNotIn("test-bootstrap-value", result.stdout + result.stderr)

    def test_doctor_rejects_an_unknown_bundle_file_before_1password_access(self):
        unknown = self.bundle_root / "unknown.env"
        unknown.write_text("UNKNOWN_TOKEN=op://Agent Secrets/unknown/value\n")
        unknown.chmod(0o600)
        result = self.run_cli("doctor", auth="service-account")
        self.assertNotEqual(0, result.returncode)
        self.assertIn("unknown files", result.stderr)
        self.assertEqual([], self.op_events())

    def test_invalid_authentication_selector_fails_before_manifest_or_1password_access(self):
        (self.config_root / "bundles.json").unlink()
        result = self.run_cli("doctor", auth="automatic")
        self.assertNotEqual(0, result.returncode)
        self.assertIn("must be interactive or service-account", result.stderr)
        self.assertNotIn("cannot read capability manifest", result.stderr)
        self.assertEqual([], self.op_events())

    def test_runtime_manifest_validation_rejects_duplicate_keys_before_1password_access(self):
        path = self.config_root / "bundles.json"
        manifest = path.read_text()
        path.write_text(
            manifest.replace(
                '  "version": 1,',
                '  "version": 1,\n  "version": 1,',
                1,
            )
        )
        result = self.run_cli("doctor", auth="service-account")
        self.assertNotEqual(0, result.returncode)
        self.assertIn("duplicate JSON key", result.stderr)
        self.assertEqual([], self.op_events())

    def test_runtime_manifest_rejects_authentication_variables_before_1password_access(self):
        for variable in ("AGENT_SECRET_AUTH", "OP_SERVICE_ACCOUNT_TOKEN"):
            with self.subTest(variable=variable):
                self.manifest["bundles"]["alpha"]["variables"] = [variable]
                self.write_manifest()
                self.write_bundle("alpha", variable, "value")
                self.op_log.unlink(missing_ok=True)
                result = self.run_cli(
                    "run",
                    "--bundle",
                    "alpha",
                    "--",
                    self.agent,
                    self.home / "out",
                    auth="service-account",
                )
                self.assertNotEqual(0, result.returncode)
                self.assertIn("process-control variable", result.stderr)
                self.assertEqual([], self.op_events())

    def test_no_clipboard_command_is_invoked(self):
        clipboard_log = self.home / "clipboard.log"
        for name in ("pbcopy", "xclip"):
            write_executable(
                self.bin_root / name,
                f"#!/bin/sh\necho called >> {clipboard_log}\nexit 99\n",
            )
        result = self.run_cli("doctor")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertFalse(clipboard_log.exists())


class SmartClassWranglerWrapperTests(unittest.TestCase):
    def run_wrapper(self, mode, environment=None):
        return subprocess.run(
            [sys.executable, str(SMARTCLASS_WRAPPER), mode],
            check=False,
            capture_output=True,
            text=True,
            env={} if environment is None else environment,
        )

    def test_probe_reports_presence_without_printing_the_value(self):
        secret_name = "DEEPSEEK" + "_API_KEY"
        result = self.run_wrapper("probe", {secret_name: "placeholder-value"})
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("DEEPSEEK_API_KEY is present\n", result.stdout)
        self.assertNotIn("placeholder-value", result.stdout + result.stderr)

    def test_wrapper_rejects_missing_secret_and_unapproved_modes(self):
        missing = self.run_wrapper("probe")
        self.assertNotEqual(0, missing.returncode)
        self.assertIn("DEEPSEEK_API_KEY is unavailable", missing.stderr)

        secret_name = "DEEPSEEK" + "_API_KEY"
        unapproved = self.run_wrapper("deploy", {secret_name: "placeholder-value"})
        self.assertEqual(2, unapproved.returncode)
        self.assertIn("{dev|probe}", unapproved.stderr)
        self.assertNotIn("placeholder-value", unapproved.stdout + unapproved.stderr)

    def test_dev_executes_only_local_wrangler_with_a_minimal_environment(self):
        secret_name = "DEEPSEEK" + "_API_KEY"
        inherited = {
            "HOME": "/tmp/untrusted-home",
            "PATH": "/tmp/untrusted-bin",
            "UNRELATED": "drop-me",
            "GH_TOKEN": "drop-me-too",
            secret_name: "placeholder-value",
        }
        with (
            mock.patch.object(sys, "argv", [str(SMARTCLASS_WRAPPER), "dev"]),
            mock.patch.dict(os.environ, inherited, clear=True),
            mock.patch.object(os.path, "isfile", return_value=True),
            mock.patch.object(os, "access", return_value=True),
            mock.patch.object(os, "chdir") as chdir,
            mock.patch.object(os, "execve", side_effect=RuntimeError("exec called")) as execve,
            self.assertRaisesRegex(RuntimeError, "exec called"),
        ):
            SMARTCLASS_RUNTIME["main"]()

        chdir.assert_called_once_with(SMARTCLASS_RUNTIME["PROJECT"])
        executable, arguments, environment = execve.call_args.args
        self.assertEqual(SMARTCLASS_RUNTIME["NODE"], executable)
        self.assertEqual(
            [
                SMARTCLASS_RUNTIME["NODE"],
                SMARTCLASS_RUNTIME["WRANGLER"],
                "dev",
                "--local",
                "--env-file",
                SMARTCLASS_RUNTIME["DEV_VARS"],
            ],
            arguments,
        )
        self.assertEqual(
            {
                "HOME": SMARTCLASS_RUNTIME["HOME"],
                "PATH": (
                    f"{SMARTCLASS_RUNTIME['NODE_DIRECTORY']}:"
                    "/opt/homebrew/bin:/usr/bin:/bin"
                ),
                secret_name: "placeholder-value",
                "CLOUDFLARE_INCLUDE_PROCESS_ENV": "true",
            },
            environment,
        )


if __name__ == "__main__":
    unittest.main()
