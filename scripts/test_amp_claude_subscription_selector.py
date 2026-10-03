"""Credential-free tests for the Claude selector's policy and control plane."""

import argparse
import copy
import importlib.machinery
import importlib.util
import io
import json
import plistlib
import shutil
import tempfile
import threading
import unittest
from contextlib import redirect_stdout
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
loader = importlib.machinery.SourceFileLoader(
    "selector", str(ROOT / "bin/amp-claude-selector")
)
spec = importlib.util.spec_from_loader(loader.name, loader)
selector = importlib.util.module_from_spec(spec)
loader.exec_module(selector)

CONFIG = {
    "preferred": "company.json",
    "fallback": "personal.json",
    "window": "weekly",
    "threshold": 40,
    "interval": 3600,
    "container": "amp-cliproxyapi",
    "docker": "docker",
    "management_key_ref": "op://vault/item/password",
}


class FakeAPI:
    def __init__(self, company=10, personal=20):
        self.entries = [
            {
                "name": name,
                "auth_index": str(i),
                "disabled": bool(i),
                "provider": "claude",
                "source": "file",
                "runtime_only": False,
            }
            for i, name in enumerate(["company.json", "personal.json"])
        ]
        self.used = {"company.json": company, "personal.json": personal}
        self.calls = []

    def accounts(self):
        return copy.deepcopy(self.entries)

    def quota(self, account, window):
        return selector.parse_quota(
            {
                "seven_day": {"utilization": self.used[account["name"]]},
                "five_hour": {"utilization": 0},
            },
            window,
        )

    def disable(self, account, disabled):
        self.calls.append((account["name"], disabled))
        for entry in self.entries:
            if entry["name"] == account["name"]:
                entry["disabled"] = disabled


class PolicyTests(unittest.TestCase):
    def test_defaults(self):
        args = selector.parser().parse_args(
            [
                "install",
                "--preferred",
                "c",
                "--fallback",
                "p",
                "--management-key-ref",
                CONFIG["management_key_ref"],
            ]
        )
        self.assertEqual(
            (args.window, args.threshold, args.interval), ("weekly", 40, 3600)
        )

    def test_preferred_noop(self):
        api = FakeAPI()
        self.assertEqual(selector.check(api, CONFIG)["selected"], "preferred")
        self.assertEqual(api.calls, [])

    def test_boundary_switches_disable_first(self):
        api = FakeAPI(company=60)
        self.assertEqual(selector.check(api, CONFIG)["selected"], "fallback")
        self.assertEqual(api.calls, [("company.json", True), ("personal.json", False)])

    def test_recovery(self):
        api = FakeAPI(company=60)
        selector.check(api, CONFIG)
        api.used["company.json"] = 59.9
        self.assertEqual(selector.check(api, CONFIG)["selected"], "preferred")
        self.assertEqual(
            api.calls[-2:], [("personal.json", True), ("company.json", False)]
        )

    def test_both_low_unchanged(self):
        api = FakeAPI(company=60, personal=90)
        self.assertEqual(selector.check(api, CONFIG)["selected"], "unchanged")
        self.assertEqual(api.calls, [])

    def test_unknown_quota_unchanged(self):
        for used in (None, True, "60", -1, 101, float("nan"), float("inf")):
            with self.subTest(used=used):
                api = FakeAPI(personal=used)
                with self.assertRaises(selector.SelectorError):
                    selector.check(api, CONFIG)
                self.assertEqual(api.calls, [])

    def test_windows(self):
        payload = {"seven_day": {"utilization": 20}, "five_hour": {"utilization": 99}}
        self.assertEqual(
            selector.parse_quota(payload, "weekly")["seven_day"]["remaining"], 80
        )
        self.assertEqual(
            selector.parse_quota(payload, "five-hour")["five_hour"]["remaining"], 1
        )
        self.assertEqual(len(selector.parse_quota(payload, "either")), 2)
        with self.assertRaises(selector.SelectorError):
            selector.parse_quota({"seven_day": None}, "weekly")

    def test_extra_account_rejected_before_writes(self):
        api = FakeAPI()
        api.entries.append({"name": "third.json", "disabled": False})
        with self.assertRaises(selector.SelectorError):
            selector.switch(api, CONFIG, "fallback")
        self.assertEqual(api.calls, [])

    def test_failed_enable_leaves_old_disabled(self):
        api = FakeAPI(company=60)
        original = api.disable

        def fail_enable(account, disabled):
            if not disabled:
                raise selector.SelectorError("Enable failed")
            original(account, disabled)

        api.disable = fail_enable
        with self.assertRaises(selector.SelectorError):
            selector.check(api, CONFIG)
        self.assertTrue(all(entry["disabled"] for entry in api.entries))

    def test_runtime_only_rejected(self):
        api = FakeAPI()
        api.entries[0]["runtime_only"] = True
        with self.assertRaises(selector.SelectorError):
            selector.check(api, CONFIG)


class TransportTests(unittest.TestCase):
    def api(self):
        with patch.object(selector, "secret", return_value="fixture-not-a-secret"):
            return selector.API(CONFIG)

    def test_key_only_on_stdin_and_local_namespace(self):
        with patch.object(selector, "command", return_value='{"files": []}') as run:
            self.api().accounts()
        args, stdin = run.call_args.args
        self.assertNotIn("fixture-not-a-secret", " ".join(args))
        self.assertIn("container:amp-cliproxyapi", args)
        self.assertIn("127.0.0.1:8317", stdin)
        self.assertIn("fixture-not-a-secret", stdin)

    def test_usage_nested_status(self):
        api = self.api()
        account = FakeAPI().entries[0]
        with patch.object(
            api, "call", return_value={"status_code": 403, "body": "sensitive"}
        ):
            with self.assertRaises(selector.SelectorError) as error:
                api.quota(account, "weekly")
            self.assertNotIn("sensitive", str(error.exception))

    def test_expired_token_refreshed_once(self):
        api = self.api()
        with patch.object(
            api,
            "call",
            side_effect=[
                {"status_code": 401},
                {"ok": True},
                {
                    "status_code": 200,
                    "body": json.dumps({"seven_day": {"utilization": 12}}),
                },
            ],
        ) as call:
            self.assertEqual(
                api.quota(FakeAPI().entries[1], "weekly")["seven_day"]["remaining"], 88
            )
            self.assertEqual(
                [c.args[1] for c in call.call_args_list],
                ["api-call", "auth-files/refresh", "api-call"],
            )

    def test_second_401_not_retried(self):
        api = self.api()
        with patch.object(
            api,
            "call",
            side_effect=[{"status_code": 401}, {"ok": True}, {"status_code": 401}],
        ) as call:
            with self.assertRaises(selector.SelectorError):
                api.quota(FakeAPI().entries[0], "weekly")
            self.assertEqual(call.call_count, 3)

    def test_secret_reference_required(self):
        with self.assertRaises(selector.SelectorError):
            selector.secret("plaintext")


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.state = Path(self.temp.name) / "state"
        self.agent = Path(self.temp.name) / "agents/selector.plist"
        self.state.mkdir()
        self.patchers = [
            patch.object(selector, "STATE", self.state),
            patch.object(selector, "AGENT", self.agent),
        ]
        for p in self.patchers:
            p.start()
            self.addCleanup(p.stop)
        selector.save(self.state / "config.json", CONFIG)

    def invoke(self, *args):
        with patch("sys.argv", ["selector", *args]):
            selector.main()

    def status(self, loaded=True):
        output = io.StringIO()
        with (
            patch.object(selector, "agent_loaded", return_value=loaded),
            redirect_stdout(output),
        ):
            self.invoke("status")
        return output.getvalue()

    def test_status_matches_chatgpt_report(self):
        selector.save(
            self.state / "last-run.json",
            {
                "timestamp": "2026-10-03T15:55:28.453128+00:00",
                "result": "ok",
                "selected": "preferred",
                "quotas": {
                    "preferred": {"seven_day": {"remaining": 85}},
                    "fallback": {"seven_day": {"remaining": 100}},
                },
                "reason": "Selected account has capacity",
            },
        )
        with patch.object(selector, "API") as api:
            self.assertEqual(
                self.status(),
                """Preferred: company (company.json)
Fallback: personal (personal.json)
Threshold: 40% remaining
Interval: 1 hour
Background check: scheduled
Last check: 2026-10-03 22:55:28 UTC+7
Next check: 2026-10-03 23:55:28 UTC+7
Result: ok
Selected: company (company.json)
Preferred remaining: weekly 85%
Fallback remaining: weekly 100%
Reason: preferred subscription still has remaining quota
""",
            )
            api.assert_not_called()

    def test_status_never_run_and_not_scheduled(self):
        output = self.status(loaded=False)
        for line in (
            "Last check: never",
            "Next check: not scheduled",
            "Result: never run",
            "Selected: none",
            "Preferred remaining: weekly unknown",
            "Reason: selector has not run yet",
        ):
            self.assertIn(line + "\n", output)
        self.assertIn("Next check: awaiting first check\n", self.status())

    def test_status_paused_failed_and_invalid_timestamp(self):
        (self.state / "paused").touch()
        selector.save(
            self.state / "last-run.json",
            {
                "timestamp": "invalid",
                "result": "failed",
                "selected": "unknown",
                "reason": "Claude usage request failed",
            },
        )
        output = self.status()
        for line in (
            "Background check: paused",
            "Last check: unknown",
            "Next check: paused",
            "Result: failed",
            "Selected: unknown",
            "Fallback remaining: weekly unknown",
            "Reason: Claude usage request failed",
        ):
            self.assertIn(line + "\n", output)

    def test_status_fallback_and_combined_windows(self):
        selector.save(self.state / "config.json", {**CONFIG, "window": "either"})
        selector.save(
            self.state / "last-run.json",
            {
                "selected": "fallback",
                "reason": "Selected account has capacity",
                "quotas": {
                    "preferred": {
                        "five_hour": {"remaining": 4},
                        "seven_day": {"remaining": 80},
                    },
                    "fallback": {
                        "five_hour": {"remaining": 99},
                        "seven_day": {"remaining": 100},
                    },
                },
            },
        )
        output = self.status()
        self.assertIn("Selected: personal (personal.json)\n", output)
        self.assertIn("Preferred remaining: five-hour 4%; weekly 80%\n", output)
        self.assertIn("Fallback remaining: five-hour 99%; weekly 100%\n", output)
        self.assertIn(
            "Reason: preferred subscription is at or below the remaining quota threshold\n",
            output,
        )

    def test_interval_format_matches_chatgpt(self):
        for seconds, expected in (
            (1, "1 second"),
            (59, "59 seconds"),
            (60, "1 minute"),
            (120, "2 minutes"),
            (3600, "1 hour"),
            (7200, "2 hours"),
            (3601, "3601 seconds"),
        ):
            with self.subTest(seconds=seconds):
                self.assertEqual(selector.format_interval(seconds), expected)

    def test_pause_run_resume(self):
        selector.schedule(CONFIG)
        with (
            patch.object(selector, "bootout"),
            patch.object(selector, "agent_loaded", return_value=False),
            patch.object(selector, "bootstrap"),
        ):
            self.invoke("pause")
            with self.assertRaises(selector.SelectorError):
                self.invoke("run")
            self.invoke("resume")
            self.assertFalse((self.state / "paused").exists())

    def test_manual_selection_requires_pause(self):
        with patch.object(selector, "API") as api:
            with self.assertRaises(selector.SelectorError):
                self.invoke("use", "company")
            api.assert_not_called()

    def test_configure_preserves_pause_and_partial_fields(self):
        (self.state / "paused").touch()
        with (
            patch.object(selector, "agent_loaded", return_value=False),
            patch.object(selector, "bootout"),
            patch.object(selector, "bootstrap") as start,
        ):
            self.invoke("configure", "--threshold", "20")
            start.assert_not_called()
        config = selector.load()
        self.assertEqual(
            (config["threshold"], config["interval"], config["window"]),
            (20, 3600, "weekly"),
        )
        self.assertTrue((self.state / "paused").exists())

    def test_schedule_contains_no_key(self):
        selector.schedule(CONFIG)
        plist = plistlib.loads(self.agent.read_bytes())
        self.assertEqual(plist["StartInterval"], 3600)
        self.assertEqual(plist["ProgramArguments"][-1], "run")
        self.assertNotIn("op://", self.agent.read_text())
        self.assertEqual(self.agent.stat().st_mode & 0o777, 0o600)

    def test_install_run_and_uninstall(self):
        api = FakeAPI(company=60)
        with (
            patch.object(selector, "API", return_value=api),
            patch.object(selector.shutil, "which", return_value="/bin/docker"),
            patch.object(selector, "bootout"),
            patch.object(selector, "bootstrap"),
        ):
            self.invoke(
                "install",
                "--preferred",
                "company.json",
                "--fallback",
                "personal.json",
                "--management-key-ref",
                CONFIG["management_key_ref"],
            )
            self.assertTrue(self.agent.exists())
            self.invoke("run")
            result = json.loads((self.state / "last-run.json").read_text())
            self.assertEqual(result["selected"], "fallback")
            self.invoke("uninstall")
            self.assertFalse(self.agent.exists())
            self.assertTrue(api.entries[0]["disabled"])
            self.assertFalse(api.entries[1]["disabled"])

    def test_failed_bootstrap_leaves_paused(self):
        with (
            patch.object(selector, "API", return_value=FakeAPI()),
            patch.object(selector.shutil, "which", return_value="/bin/docker"),
            patch.object(selector, "bootout"),
            patch.object(
                selector,
                "bootstrap",
                side_effect=selector.SelectorError("Cannot start scheduler"),
            ),
            self.assertRaises(selector.SelectorError),
        ):
            self.invoke(
                "install",
                "--preferred",
                "company.json",
                "--fallback",
                "personal.json",
                "--management-key-ref",
                CONFIG["management_key_ref"],
            )
        self.assertTrue((self.state / "paused").exists())

    def test_management_setup_preserves_config_and_local_only(self):
        runtime = Path(self.temp.name) / "runtime"
        runtime.mkdir()
        original = (ROOT / "amp/local-claude-cliproxy/config.example.yaml").read_text()
        path = runtime / "config.yaml"
        path.write_text(original)
        with (
            patch.object(selector, "secret", return_value="fixture"),
            patch.object(selector, "command", return_value="selector:$2y$12$fixture\n"),
        ):
            selector.setup_management(
                argparse.Namespace(
                    runtime=str(runtime),
                    management_key_ref=CONFIG["management_key_ref"],
                )
            )
        text = path.read_text()
        self.assertEqual(
            text, original.replace('secret-key: ""', 'secret-key: "$2y$12$fixture"')
        )
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)


@unittest.skipUnless(shutil.which("curl"), "curl is required for transport integration")
class HTTPIntegrationTests(unittest.TestCase):
    def test_real_curl_config_encodes_patch_request(self):
        received = {}

        class Handler(BaseHTTPRequestHandler):
            def do_PATCH(self):
                received["path"] = self.path
                received["authorization"] = self.headers["Authorization"]
                received["body"] = json.loads(
                    self.rfile.read(int(self.headers["Content-Length"]))
                )
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"status":"ok","disabled":true}')

            def log_message(self, *_args):
                pass

        server = HTTPServer(("127.0.0.1", 0), Handler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        real_command = selector.command

        def local_curl(_args, data):
            data = data.replace("127.0.0.1:8317", f"127.0.0.1:{server.server_port}")
            return real_command([shutil.which("curl"), "--config", "-"], data)

        try:
            with patch.object(selector, "secret", return_value='fixture"with\\escapes'):
                api = selector.API(CONFIG)
            with patch.object(selector, "command", side_effect=local_curl):
                api.disable({"name": 'company"account.json', "auth_index": "0"}, True)
        finally:
            server.shutdown()
            server.server_close()
            worker.join()
        self.assertEqual(received["authorization"], 'Bearer fixture"with\\escapes')
        self.assertEqual(received["path"], "/v0/management/auth-files/status")
        self.assertEqual(
            received["body"],
            {"name": 'company"account.json', "auth_index": "0", "disabled": True},
        )


if __name__ == "__main__":
    unittest.main()
