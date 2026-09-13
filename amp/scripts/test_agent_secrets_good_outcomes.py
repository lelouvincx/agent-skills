import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "bin" / "agent-secrets"


FAKE_OP = r'''#!/usr/bin/env python3
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
    reference = ":" + arguments[1] if stage == "read" else ""
    with Path(log_path).open("a") as log:
        log.write(f"{lane}:{stage}{reference}\n")

if stage in {"account", "vault"} and os.environ.get("FAKE_OP_FAIL_AUDIT") == "1":
    raise SystemExit(10)
if lane == "interactive" and os.environ.get("FAKE_OP_FAIL_INTERACTIVE") == "1":
    raise SystemExit(11)
if lane == "service" and stage == "read":
    failure_suffix = os.environ.get("FAKE_OP_FAIL_SERVICE_REFERENCE_SUFFIX")
    if failure_suffix and arguments[1].endswith(failure_suffix):
        raise SystemExit(12)

if stage == "account":
    print('{"url":"my.1password.com"}')
elif stage == "vault":
    vaults = os.environ.get("FAKE_OP_VAULTS", "Agent Secrets").split(",")
    print("[" + ",".join('{"name":"' + vault + '"}' for vault in vaults if vault) + "]")
elif stage == "read":
    print("resolved-" + arguments[1].rsplit("/", 1)[-1])
else:
    raise SystemExit(13)
'''


FAKE_CHILD = r'''#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

names = [
    "AMP_TOKEN",
    "GH_TOKEN_WORK",
    "PERSONAL_TOKEN",
    "AGENT_SECRET_AUTH",
    "OP_SERVICE_ACCOUNT_TOKEN",
    "INHERITED_SECRET",
    "SAFE_VALUE",
]
Path(sys.argv[1]).write_text(json.dumps({
    "arguments": sys.argv[2:],
    "environment": {name: os.environ[name] for name in names if name in os.environ},
}))
'''


def write_executable(path, contents):
    path.write_text(contents)
    path.chmod(0o700)


class AgentSecretsGoodOutcomeE2ETests(unittest.TestCase):
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
        self.bootstrap.write_text("test-bootstrap-token\n")
        self.bootstrap.chmod(0o600)

        self.bin_root = self.home / "bin"
        self.bin_root.mkdir()
        self.op = self.bin_root / "op"
        self.child = self.bin_root / "approved-child"
        write_executable(self.op, FAKE_OP)
        write_executable(self.child, FAKE_CHILD)
        self.op_log = self.home / "op.log"
        self.git = shutil.which("git")
        if self.git is None:
            self.skipTest("git is unavailable")

        manifest = {
            "version": 1,
            "command_classes": {
                "agent": {"executablePaths": [str(self.child)]},
                "git": {"executablePaths": [str(Path(self.git).resolve())]},
            },
            "bundles": {
                "amp-runtime": {
                    "audience": "agent",
                    "owner": "amp/runtime",
                    "variables": ["AMP_TOKEN"],
                    "compatibleBundles": ["work"],
                    "allowedCommandClasses": ["agent", "git"],
                },
                "work": {
                    "audience": "agent",
                    "owner": "github/work",
                    "variables": ["GH_TOKEN_WORK"],
                    "compatibleBundles": ["amp-runtime"],
                    "allowedCommandClasses": ["agent", "git"],
                },
                "personal": {
                    "audience": "agent",
                    "owner": "github/personal",
                    "variables": ["PERSONAL_TOKEN"],
                    "compatibleBundles": [],
                    "allowedCommandClasses": ["agent", "git"],
                },
            },
        }
        (self.config_root / "bundles.json").write_text(json.dumps(manifest) + "\n")
        self.write_bundle("amp-runtime", "AMP_TOKEN", "amp-token")
        self.write_bundle("work", "GH_TOKEN_WORK", "work-token")
        self.write_bundle("personal", "PERSONAL_TOKEN", "personal-token")

    def tearDown(self):
        self.temporary_directory.cleanup()

    def write_bundle(self, name, variable, field):
        path = self.bundle_root / f"{name}.env"
        path.write_text(f"{variable}=op://Agent Secrets/{name}/{field}\n")
        path.chmod(0o600)

    def environment(self, **changes):
        environment = {
            "HOME": str(self.home),
            "AMP_CONFIG_DIR": str(self.home / ".config" / "amp"),
            "PATH": f"{self.bin_root}:{os.environ.get('PATH', '')}",
            "AGENT_SECRET_AUTH": "service-account",
            "FAKE_OP_LOG": str(self.op_log),
            "SAFE_VALUE": "kept",
        }
        environment.update(changes)
        return environment

    def run_agent_secrets(self, *arguments, **environment_changes):
        return subprocess.run(
            [sys.executable, str(SCRIPT), *map(str, arguments)],
            check=False,
            capture_output=True,
            text=True,
            env=self.environment(**environment_changes),
        )

    def op_events(self):
        return self.op_log.read_text().splitlines() if self.op_log.exists() else []

    def test_run_uses_only_selected_reads_and_never_runs_broad_audit(self):
        output = self.home / "child.json"
        result = self.run_agent_secrets(
            "run",
            "--bundle",
            "amp-runtime",
            "--",
            self.child,
            output,
            "commit",
            FAKE_OP_FAIL_AUDIT="1",
            FAKE_OP_FAIL_INTERACTIVE="1",
            OP_SERVICE_ACCOUNT_TOKEN="inherited-token",
            INHERITED_SECRET="remove-me",
        )

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(
            ["service:read:op://Agent Secrets/amp-runtime/amp-token"],
            self.op_events(),
        )
        payload = json.loads(output.read_text())
        self.assertEqual(["commit"], payload["arguments"])
        self.assertEqual(
            {"AMP_TOKEN": "resolved-amp-token", "SAFE_VALUE": "kept"},
            payload["environment"],
        )

    def test_service_account_read_failure_fails_closed_without_interactive_retry(self):
        result = self.run_agent_secrets(
            "run",
            "--bundle",
            "amp-runtime",
            "--bundle",
            "work",
            "--",
            self.child,
            self.home / "child.json",
            FAKE_OP_FAIL_INTERACTIVE="1",
            FAKE_OP_FAIL_SERVICE_REFERENCE_SUFFIX="work-token",
        )

        self.assertNotEqual(0, result.returncode)
        self.assertEqual(
            [
                "service:read:op://Agent Secrets/amp-runtime/amp-token",
                "service:read:op://Agent Secrets/work/work-token",
            ],
            self.op_events(),
        )
        self.assertNotIn("interactive", "\n".join(self.op_events()))
        self.assertNotIn("retrying", result.stderr)
        self.assertNotIn("op://", result.stderr)
        self.assertNotIn("test-bootstrap-token", result.stderr)

    def test_doctor_is_the_broad_posture_check(self):
        result = self.run_agent_secrets("doctor")

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(
            [
                "service:vault",
                "service:read:op://Agent Secrets/amp-runtime/amp-token",
                "service:read:op://Agent Secrets/personal/personal-token",
                "service:read:op://Agent Secrets/work/work-token",
            ],
            self.op_events(),
        )
        self.assertIn("amp-runtime.AMP_TOKEN: ok", result.stdout)
        self.assertIn("personal.PERSONAL_TOKEN: ok", result.stdout)
        self.assertIn("work.GH_TOKEN_WORK: ok", result.stdout)
        self.assertIn("child-environment probe: ok", result.stdout)
        self.assertNotIn("resolved-", result.stdout + result.stderr)
        self.assertNotIn("op://", result.stdout + result.stderr)

    def test_wrong_vault_scope_blocks_doctor_not_the_run_hot_path(self):
        output = self.home / "child.json"
        run_result = self.run_agent_secrets(
            "run",
            "--bundle",
            "amp-runtime",
            "--",
            self.child,
            output,
            FAKE_OP_VAULTS="Agent Secrets,Other Vault",
        )
        self.assertEqual(0, run_result.returncode, run_result.stderr)

        self.op_log.unlink()
        doctor_result = self.run_agent_secrets(
            "doctor",
            FAKE_OP_VAULTS="Agent Secrets,Other Vault",
        )
        self.assertNotEqual(0, doctor_result.returncode)
        self.assertEqual(["service:vault"], self.op_events())
        self.assertIn("must access exactly Agent Secrets", doctor_result.stderr)

    def test_git_commit_child_does_not_invoke_1password_signing_when_signing_is_disabled(self):
        repository = self.home / "repository"
        repository.mkdir()
        subprocess.run([self.git, "init", "-q"], check=True, cwd=repository)
        (repository / "example.txt").write_text("example\n")
        subprocess.run([self.git, "add", "example.txt"], check=True, cwd=repository)

        signer_log = self.home / "signer.log"
        signer = self.bin_root / "op-ssh-sign"
        write_executable(
            signer,
            "#!/usr/bin/env bash\n"
            f"printf 'called\\n' >> {signer_log}\n"
            "exit 42\n",
        )
        global_config = self.home / "gitconfig"
        global_config.write_text(
            "[user]\n"
            "\tname = Agent Test\n"
            "\temail = agent-test@example.invalid\n"
            "[commit]\n"
            "\tgpgsign = false\n"
            "[gpg]\n"
            "\tformat = ssh\n"
            "[gpg \"ssh\"]\n"
            f"\tprogram = {signer}\n"
        )

        result = self.run_agent_secrets(
            "run",
            "--bundle",
            "amp-runtime",
            "--",
            self.git,
            "-C",
            repository,
            "commit",
            "-m",
            "Exercise unsigned commit",
            GIT_CONFIG_GLOBAL=str(global_config),
            GIT_CONFIG_NOSYSTEM="1",
            FAKE_OP_FAIL_AUDIT="1",
            FAKE_OP_FAIL_INTERACTIVE="1",
        )

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(
            ["service:read:op://Agent Secrets/amp-runtime/amp-token"],
            self.op_events(),
        )
        self.assertFalse(signer_log.exists())
        author = subprocess.run(
            [self.git, "-C", repository, "log", "-1", "--format=%an <%ae>"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        self.assertEqual("Agent Test <agent-test@example.invalid>", author)


if __name__ == "__main__":
    unittest.main()
