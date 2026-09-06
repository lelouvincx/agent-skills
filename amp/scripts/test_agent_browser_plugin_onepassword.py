import io
import json
import os
import runpy
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PLUGIN = ROOT / "bin" / "agent-browser-plugin-onepassword"
HANDLER = ROOT / "bin" / "agent-browser-credential-response"
RUNTIME = runpy.run_path(str(PLUGIN))


FAKE_OP = r'''#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

arguments = sys.argv[1:]
log = os.environ.get("FAKE_OP_LOG")
if log:
    with Path(log).open("a") as output:
        output.write("called\n")
if "OP_SERVICE_ACCOUNT_TOKEN" not in os.environ:
    raise SystemExit(10)
if arguments[:2] == ["vault", "list"]:
    print(json.dumps([{"name": "Agent Secrets"}]))
elif arguments[:1] == ["read"]:
    print("synthetic-" + arguments[1].rsplit("/", 1)[-1])
else:
    raise SystemExit(11)
'''


def write_executable(path, contents):
    path.write_text(contents)
    path.chmod(0o700)


class OnePasswordPluginTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.home = Path(self.temporary_directory.name)
        config = self.home / ".config" / "amp" / "agent-secrets"
        config.mkdir(parents=True)
        bundles = self.home / ".credentials" / "agent-secrets"
        bundles.mkdir(parents=True, mode=0o700)
        bundles.chmod(0o700)
        bootstrap = self.home / ".local" / "share" / "agent-secrets"
        bootstrap.mkdir(parents=True, mode=0o700)
        bootstrap.chmod(0o700)
        token = bootstrap / "op-service-account-token"
        token.write_text("synthetic-bootstrap\n")
        token.chmod(0o600)
        browser_bundle = bundles / "synthetic.env"
        browser_bundle.write_text(
            "LOGIN_USERNAME=op://Agent Secrets/synthetic/username\n"
            "LOGIN_PASSWORD=op://Agent Secrets/synthetic/password\n"
            "LOGIN_OTP=op://Agent Secrets/synthetic/otp?attribute=otp\n"
        )
        browser_bundle.chmod(0o600)
        manifest = {
            "version": 1,
            "command_classes": {
                "agent-browser-credential-handler": {
                    "executablePaths": [str(HANDLER)]
                }
            },
            "bundles": {
                "synthetic": {
                    "audience": "agent",
                    "owner": "lelouvincx/agent-skills",
                    "variables": ["LOGIN_USERNAME", "LOGIN_PASSWORD", "LOGIN_OTP"],
                    "compatibleBundles": [],
                    "allowedCommandClasses": ["agent-browser-credential-handler"],
                    "browserLogin": {
                        "usernameVariable": "LOGIN_USERNAME",
                        "passwordVariable": "LOGIN_PASSWORD",
                        "loginUrl": "https://example.invalid/login",
                        "credentialOrigin": "https://example.invalid",
                        "usernameSelector": "#username",
                        "passwordSelector": "#password",
                        "submitSelector": "button[type=submit]",
                        "otpVariable": "LOGIN_OTP",
                        "otpSelector": "#otp",
                        "otpSubmitSelector": "button[type=submit]",
                        "expectedPostLoginUrl": "https://example.invalid/account",
                        "accountMarkerSelector": "[data-account]",
                        "accountMarkerVariable": "LOGIN_USERNAME",
                    },
                }
            },
        }
        (config / "bundles.json").write_text(json.dumps(manifest))
        self.bin = self.home / "bin"
        self.bin.mkdir()
        write_executable(self.bin / "op", FAKE_OP)
        self.op_log = self.home / "op.log"

    def environment(self):
        environment = os.environ.copy()
        environment.update(
            {
                "HOME": str(self.home),
                "AMP_CONFIG_DIR": str(self.home / ".config" / "amp"),
                "PATH": f"{self.bin}:{environment.get('PATH', '')}",
                "AGENT_SECRET_AUTH": "interactive",
                "FAKE_OP_LOG": str(self.op_log),
                "OP_SERVICE_ACCOUNT_TOKEN": "must-not-reach-handler",
            }
        )
        return environment

    def invoke(self, payload, environment=None):
        return subprocess.run(
            [str(PLUGIN)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            check=False,
            env=self.environment() if environment is None else environment,
        )

    def envelope(self, request=None):
        return {
            "protocol": "agent-browser.plugin.v1",
            "type": "credential.resolve",
            "capability": "credential.read",
            "request": {
                "credentialContract": "rfc0011-v1",
                "profileName": "synthetic",
                "itemRef": None,
                "url": None,
            }
            if request is None
            else request,
        }

    def test_manifest_declares_only_credential_read_without_vault_access(self):
        result = self.invoke(
            {
                "protocol": "agent-browser.plugin.v1",
                "type": "plugin.manifest",
                "capability": "plugin.manifest",
                "request": {},
            },
            environment={"PATH": os.environ.get("PATH", "")},
        )
        self.assertEqual(0, result.returncode, result.stderr)
        payload = json.loads(result.stdout)
        self.assertTrue(payload["success"])
        self.assertEqual("onepassword", payload["manifest"]["name"])
        self.assertEqual(["credential.read"], payload["manifest"]["capabilities"])
        self.assertFalse(self.op_log.exists())

    def test_synthetic_credential_uses_strict_agent_secrets_resolution(self):
        result = self.invoke(self.envelope())
        self.assertEqual(0, result.returncode, result.stderr)
        payload = json.loads(result.stdout)
        self.assertTrue(payload["success"])
        self.assertEqual(
            {
                "username": "synthetic-username",
                "password": "synthetic-password",
                "url": "https://example.invalid/login",
                "usernameSelector": "#username",
                "passwordSelector": "#password",
                "submitSelector": "button[type=submit]",
                "credentialOrigin": "https://example.invalid",
                "otp": "synthetic-otp?attribute=otp",
                "otpSelector": "#otp",
                "otpSubmitSelector": "button[type=submit]",
                "expectedPostLoginUrl": "https://example.invalid/account",
                "accountMarkerSelector": "[data-account]",
                "accountMarkerValue": "synthetic-username",
            },
            payload["credential"],
        )
        self.assertEqual(
            ["called", "called", "called", "called"],
            self.op_log.read_text().splitlines(),
        )
        self.assertNotIn("synthetic-bootstrap", result.stdout + result.stderr)
        self.assertNotIn("must-not-reach-handler", result.stdout + result.stderr)

    def test_optional_item_and_url_may_be_omitted(self):
        result = self.invoke(
            self.envelope(
                {
                    "credentialContract": "rfc0011-v1",
                    "profileName": "synthetic",
                }
            )
        )
        self.assertEqual(0, result.returncode, result.stderr)
        payload = json.loads(result.stdout)
        self.assertTrue(payload["success"])
        self.assertEqual("synthetic-username", payload["credential"]["username"])

    def test_stock_request_without_contract_fails_before_vault_access(self):
        result = self.invoke(
            self.envelope(
                {"profileName": "synthetic", "itemRef": None, "url": None}
            )
        )
        payload = json.loads(result.stdout)
        self.assertFalse(payload["success"])
        self.assertFalse(self.op_log.exists())

    def test_malformed_and_unapproved_requests_fail_without_vault_access(self):
        cases = [
            {"protocol": "wrong", "type": "credential.resolve", "capability": "credential.read", "request": {}},
            self.envelope({"credentialContract": "rfc0011-v1", "profileName": "unknown", "itemRef": None, "url": None}),
            self.envelope({"credentialContract": "rfc0011-v1", "profileName": "synthetic", "itemRef": "other", "url": None}),
            self.envelope({"credentialContract": "rfc0011-v1", "profileName": "synthetic", "itemRef": None, "url": "https://wrong.invalid/login"}),
            {**self.envelope(), "capability": "command.run"},
        ]
        for request in cases:
            with self.subTest(request=request):
                self.op_log.unlink(missing_ok=True)
                result = self.invoke(request)
                payload = json.loads(result.stdout)
                self.assertFalse(payload["success"])
                self.assertEqual("credential resolution failed", payload["error"])
                self.assertNotIn("credential", payload)
                self.assertFalse(self.op_log.exists())

    def test_timeout_ends_the_resolver_process_group(self):
        marker = self.home / "detached-finished"
        slow = self.home / "slow.py"
        slow.write_text(
            "import subprocess,sys,time\n"
            "subprocess.Popen([sys.executable, '-c', "
            "f\"import time,pathlib;time.sleep(1);pathlib.Path({str(marker)!r}).write_text('done')\"])\n"
            "time.sleep(5)\n"
        )
        with self.assertRaises(RUNTIME["RequestError"]):
            RUNTIME["run_resolver"](
                [sys.executable, str(slow)], os.environ.copy(), timeout=0.1
            )
        time.sleep(1.2)
        self.assertFalse(marker.exists())

    def test_duplicate_json_keys_are_rejected(self):
        raw = b'{"protocol":"agent-browser.plugin.v1","protocol":"agent-browser.plugin.v1","type":"plugin.manifest","capability":"plugin.manifest","request":{}}'
        with self.assertRaises(RUNTIME["RequestError"]):
            RUNTIME["read_request"](io.BytesIO(raw))


if __name__ == "__main__":
    unittest.main()
