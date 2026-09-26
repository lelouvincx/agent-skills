#!/usr/bin/env python3
"""Browser-free contract tests for bin/agent-browser."""

from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WRAPPER = ROOT / "bin" / "agent-browser"
THREAD_1 = "T-01a0dc15-4c50-75eb-8ad4-f89d2ceaecbb"
THREAD_2 = "T-11a0dc15-4c50-75eb-8ad4-f89d2ceaecbc"
RESERVED_FLAGS = {
    "--config", "--session", "--session-name", "--namespace", "--profile",
    "--executable-path", "--headed", "--idle-timeout", "--cdp", "--auto-connect",
    "--extension", "--init-script", "--enable", "--args", "--user-agent", "--proxy",
    "--proxy-bypass", "--ignore-https-errors", "--ca-cert", "--no-ca-cert",
    "--allow-file-access", "-p", "--provider", "--device", "--engine", "--state",
    "--restore", "--restore-save", "--restore-check-url", "--restore-check-text",
    "--restore-check-fn", "--allowed-domains", "--action-policy", "--confirm-actions",
    "--confirm-interactive", "--webgpu", "--no-webmcp", "--hide-scrollbars",
    "--download-path", "--input-mode", "--debug",
}

FAKE_STOCK = r'''#!/usr/bin/env python3
import fcntl
import json
import os
import sys
import time
from pathlib import Path

root = Path(__file__).parent
args = sys.argv[1:]
session = args[args.index("--session") + 1] if "--session" in args else None
profile = args[args.index("--profile") + 1] if "--profile" in args else None

with (root / "calls.lock").open("a+") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    with (root / "calls.jsonl").open("a", encoding="utf-8") as log:
        log.write(json.dumps({"args": args, "env": dict(os.environ)}) + "\n")

state_path = root / "stock-state.json"
with (root / "state.lock").open("a+") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    try:
        state = json.loads(state_path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        state = {}

    if args[-3:] == ["session", "info", "--json"]:
        print(json.dumps({"data": {"active": bool(state.get(session))}, "success": True}))
    elif "open" in args or "goto" in args or "navigate" in args:
        command = next(value for value in ("open", "goto", "navigate") if value in args)
        target = args[args.index(command) + 1] if len(args) > args.index(command) + 1 else ""
        time.sleep(0.15)
        if target == "fail-open":
            print("open failed", file=sys.stderr)
            raise SystemExit(9)
        state[session] = {"profile": profile}
        state_path.write_text(json.dumps(state))
        print("opened")
    elif args[-2:] == ["stream", "disable"]:
        if (root / "fail-stream").exists():
            raise SystemExit(1)
    elif args[-1:] == ["close"]:
        state[session] = None
        state_path.write_text(json.dumps(state))
        print("closed")
    elif args[-1:] == ["kill"]:
        state[session] = None
        state_path.write_text(json.dumps(state))
    elif args[-1:] == ["emit"]:
        os.write(1, b"raw:\xff\x00\n")
        os.write(2, b"problem\n")
        raise SystemExit(7)
    elif args[-1:] == ["fail-command"]:
        print("failed once", file=sys.stderr)
        raise SystemExit(6)
    else:
        print("ok")
'''

FAKE_PS = r'''#!/usr/bin/env python3
import json
from pathlib import Path

root = Path(__file__).parent
with (root / "ps-calls").open("a") as log:
    log.write("call\n")
path = root / "processes.json"
try:
    processes = json.loads(path.read_text())
except FileNotFoundError:
    processes = []
remaining = []
for process in processes:
    print(f"{process['pid']} Chrome --user-data-dir={process['profile']}")
    process["reports"] -= 1
    if process["reports"] > 0:
        remaining.append(process)
path.write_text(json.dumps(remaining))
'''


class AgentBrowserWrapperTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="agent-browser-wrapper-")
        self.temp = Path(self.temporary.name)
        self.stock = self.temp / "stock"
        self.ps = self.temp / "ps"
        self.stock.write_text(FAKE_STOCK)
        self.ps.write_text(FAKE_PS)
        self.stock.chmod(0o755)
        self.ps.chmod(0o755)
        self.state = self.temp / "wrapper-state"
        self.env = os.environ.copy()
        self.env.update(
            {
                "AB_WRAPPER_STOCK": str(self.stock),
                "AB_WRAPPER_STATE_DIR": str(self.state),
                "AB_WRAPPER_PS": str(self.ps),
                "AB_WRAPPER_CHROME": "/fake/Chrome",
                "AB_THREAD": THREAD_1,
            }
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def run_wrapper(
        self, *args: str, env: dict[str, str] | None = None
    ) -> subprocess.CompletedProcess[bytes]:
        return subprocess.run(
            [str(WRAPPER), *args],
            env=env or self.env,
            capture_output=True,
            check=False,
        )

    def calls(self) -> list[dict[str, object]]:
        path = self.temp / "calls.jsonl"
        if not path.exists():
            return []
        return [json.loads(line) for line in path.read_text().splitlines()]

    def user_calls(self, name: str) -> list[dict[str, object]]:
        return [call for call in self.calls() if name in call["args"]]

    def open_session(self, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[bytes]:
        return self.run_wrapper("open", "https://example.test", env=env)

    def test_pass_through_commands_need_no_identity_and_use_config(self) -> None:
        env = self.env.copy()
        env.pop("AB_THREAD")
        env["AGENT_BROWSER_SECRET"] = "must-not-leak"
        for args in [(), ("--help",), ("--version",), ("skills", "list")]:
            with self.subTest(args=args):
                result = self.run_wrapper(*args, env=env)
                self.assertEqual(result.returncode, 0)
        for call in self.calls():
            self.assertEqual(call["args"][0], "--config")
            self.assertNotIn("AGENT_BROWSER_SECRET", call["env"])
            self.assertNotIn("AB_WRAPPER_STOCK", call["env"])

    def test_identity_validation(self) -> None:
        for key, value in [("AB_THREAD", "bad"), ("AB_AGENT", "UPPER"), ("AB_PROFILE", "bad_name")]:
            env = self.env.copy()
            env[key] = value
            with self.subTest(key=key):
                result = self.run_wrapper("get", "title", env=env)
                self.assertEqual(result.returncode, 2)
        self.assertEqual(self.calls(), [])

    def test_reserved_flags_reject_separate_and_equals_forms(self) -> None:
        for flag in RESERVED_FLAGS:
            forms = [(flag, "value")]
            if flag.startswith("--"):
                forms.append((f"{flag}=value",))
            for form in forms:
                with self.subTest(form=form):
                    result = self.run_wrapper("get", "title", *form)
                    self.assertEqual(result.returncode, 2)
                    self.assertIn(flag.encode(), result.stderr)
        self.assertEqual(self.calls(), [])

    def test_command_restrictions_and_dashboard_port(self) -> None:
        for args in [("connect",), ("install",), ("upgrade",), ("close", "--all"), ("close", "-a"), ("dashboard",)]:
            with self.subTest(args=args):
                self.assertEqual(self.run_wrapper(*args).returncode, 2)
        allowed = self.run_wrapper("dashboard", "--port=9222")
        self.assertEqual(allowed.returncode, 4)

    def test_dead_non_launch_command_never_reaches_stock(self) -> None:
        result = self.run_wrapper("get", "title")
        self.assertEqual(result.returncode, 4)
        self.assertIn(b"not running", result.stderr)
        calls = self.calls()
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["args"][-3:], ["session", "info", "--json"])

    def test_value_flags_before_command_do_not_hide_the_command(self) -> None:
        result = self.run_wrapper("--max-output", "100", "open", "https://example.test")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.user_calls("open")), 1)
        result = self.run_wrapper("--color-scheme", "dark", "close")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.user_calls("close")), 1)

    def test_launch_uses_canonical_flags_state_permissions_and_cleared_env(self) -> None:
        self.env["AGENT_BROWSER_FOO"] = "secret"
        self.env["UNRELATED"] = "also-not-kept"
        result = self.open_session()
        self.assertEqual(result.returncode, 0, result.stderr)
        opens = self.user_calls("open")
        self.assertEqual(len(opens), 1)
        args = opens[0]["args"]
        for expected in ["--namespace", "amp", "--session", "t-f89d2ceaecbb", "--idle-timeout", "8h", "--executable-path", "/fake/Chrome"]:
            self.assertIn(expected, args)
        self.assertNotIn("AGENT_BROWSER_FOO", opens[0]["env"])
        self.assertNotIn("UNRELATED", opens[0]["env"])
        self.assertFalse(any(key.startswith("AB_") for key in opens[0]["env"]))
        self.assertEqual(len(self.user_calls("stream")), 1)
        state_file = self.state / "wrapper" / "t-f89d2ceaecbb.json"
        state = json.loads(state_file.read_text())
        self.assertEqual(state["owner"], THREAD_1)
        self.assertEqual(state["mode"], "headless")
        self.assertTrue(state["ephemeral"])
        self.assertEqual(stat.S_IMODE(state_file.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(state_file.parent.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(Path(state["profile_dir"]).stat().st_mode), 0o700)

    def test_named_headed_subagent_identity_and_literal_separator(self) -> None:
        env = self.env.copy()
        env.update({"AB_AGENT": "worker-1", "AB_PROFILE": "login", "AB_HEADED": "1"})
        result = self.open_session(env)
        self.assertEqual(result.returncode, 0, result.stderr)
        opened = self.user_calls("open")[0]
        self.assertIn("p-login", opened["args"])
        self.assertIn("--headed", opened["args"])
        state = json.loads((self.state / "wrapper" / "p-login.json").read_text())
        self.assertEqual(state["owner"], f"{THREAD_1}/worker-1")
        self.assertFalse(state["ephemeral"])
        passed = self.run_wrapper("get", "title", "--", "--headed", env=env)
        self.assertEqual(passed.returncode, 0)
        self.assertEqual(self.user_calls("get")[-1]["args"][-4:], ["get", "title", "--", "--headed"])

    def test_stdout_stderr_and_exit_code_are_preserved_without_retry(self) -> None:
        self.assertEqual(self.open_session().returncode, 0)
        result = self.run_wrapper("emit")
        self.assertEqual(result.returncode, 7)
        self.assertEqual(result.stdout, b"raw:\xff\x00\n")
        self.assertEqual(result.stderr, b"problem\n")
        failed = self.run_wrapper("fail-command")
        self.assertEqual(failed.returncode, 6)
        self.assertEqual(len(self.user_calls("fail-command")), 1)

    def test_mode_change_is_refused_without_touching_stock_command(self) -> None:
        self.assertEqual(self.open_session().returncode, 0)
        env = self.env.copy()
        env["AB_HEADED"] = "1"
        result = self.run_wrapper("get", "title", env=env)
        self.assertEqual(result.returncode, 5)
        self.assertIn(b"running headless", result.stderr)
        self.assertEqual(len(self.user_calls("get")), 0)

    def test_second_owner_is_refused(self) -> None:
        env = self.env.copy()
        env["AB_PROFILE"] = "shared"
        self.assertEqual(self.open_session(env).returncode, 0)
        other = env.copy()
        other["AB_THREAD"] = THREAD_2
        result = self.run_wrapper("get", "title", env=other)
        self.assertEqual(result.returncode, 3)
        self.assertIn(THREAD_1.encode(), result.stderr)

    def test_stale_state_is_reported_and_dead_command_is_not_run(self) -> None:
        self.assertEqual(self.open_session().returncode, 0)
        self.assertEqual(self.run_wrapper("kill").returncode, 0)
        before = len(self.user_calls("get"))
        result = self.run_wrapper("get", "title")
        self.assertEqual(result.returncode, 4)
        self.assertIn(b"page state is lost", result.stderr)
        self.assertEqual(len(self.user_calls("get")), before)
        self.assertFalse((self.state / "wrapper" / "t-f89d2ceaecbb.json").exists())

    def test_stale_ephemeral_profile_is_kept_while_chrome_is_reported(self) -> None:
        self.assertEqual(self.open_session().returncode, 0)
        profile = self.state / "ephemeral" / "t-f89d2ceaecbb"
        marker = profile / "keep"
        marker.write_text("present")
        self.assertEqual(self.run_wrapper("kill").returncode, 0)
        (self.temp / "processes.json").write_text(
            json.dumps([{"pid": 9876, "profile": str(profile), "reports": 10}])
        )
        self.assertEqual(self.run_wrapper("get", "title").returncode, 4)
        self.assertTrue(marker.exists())

    def orphan(self, profile: Path, *, ignore_term: bool = False) -> subprocess.Popen[bytes]:
        code = "import signal, time\n"
        if ignore_term:
            code += "signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
        code += "time.sleep(60)\n"
        process = subprocess.Popen([sys.executable, "-c", code, f"--user-data-dir={profile}"])
        self.addCleanup(process.kill)
        time.sleep(0.3)
        return process

    def test_open_stops_orphaned_chrome_on_own_profile_before_launch(self) -> None:
        self.assertEqual(self.open_session().returncode, 0)
        profile = self.state / "ephemeral" / "t-f89d2ceaecbb"
        self.assertEqual(self.run_wrapper("kill").returncode, 0)
        orphan = self.orphan(profile)
        env = self.env.copy()
        env.pop("AB_WRAPPER_PS")
        result = self.open_session(env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(b"orphaned Chrome", result.stderr)
        self.assertIsNotNone(orphan.poll())
        self.assertEqual(len(self.user_calls("open")), 2)

    def test_open_refuses_when_orphan_survives(self) -> None:
        profile = self.state / "ephemeral" / "t-f89d2ceaecbb"
        profile.mkdir(parents=True)
        orphan = self.orphan(profile, ignore_term=True)
        env = self.env.copy()
        env.pop("AB_WRAPPER_PS")
        result = self.open_session(env)
        self.assertEqual(result.returncode, 1)
        self.assertIn(str(orphan.pid).encode(), result.stderr)
        self.assertEqual(self.user_calls("open"), [])

    def test_unmanaged_live_session_is_refused(self) -> None:
        (self.temp / "stock-state.json").write_text(
            json.dumps({"t-f89d2ceaecbb": {"profile": "unmanaged"}})
        )
        result = self.run_wrapper("get", "title")
        self.assertEqual(result.returncode, 3)
        self.assertIn(b"without wrapper ownership", result.stderr)

    def test_close_on_dead_session_is_successful_without_stock_close(self) -> None:
        result = self.run_wrapper("close")
        self.assertEqual(result.returncode, 0)
        self.assertIn(b"is not running", result.stdout)
        self.assertEqual(self.user_calls("close"), [])

    def test_close_waits_for_chrome_then_removes_ephemeral_profile(self) -> None:
        self.assertEqual(self.open_session().returncode, 0)
        profile = self.state / "ephemeral" / "t-f89d2ceaecbb"
        (self.temp / "processes.json").write_text(
            json.dumps([{"pid": 4321, "profile": str(profile), "reports": 2}])
        )
        result = self.run_wrapper("close")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertGreaterEqual(len((self.temp / "ps-calls").read_text().splitlines()), 3)
        self.assertFalse(profile.exists())
        self.assertFalse((self.state / "wrapper" / "t-f89d2ceaecbb.json").exists())

    def test_named_profile_is_never_deleted(self) -> None:
        env = self.env.copy()
        env["AB_PROFILE"] = "login"
        self.assertEqual(self.open_session(env).returncode, 0)
        profile = self.state / "profiles" / "login"
        marker = profile / "cookies"
        marker.write_text("keep")
        self.assertEqual(self.run_wrapper("close", env=env).returncode, 0)
        self.assertTrue(marker.exists())

    def test_failed_open_cleans_state_and_does_not_retry(self) -> None:
        result = self.run_wrapper("open", "fail-open")
        self.assertEqual(result.returncode, 9)
        self.assertEqual(len(self.user_calls("open")), 1)
        self.assertEqual(len(self.user_calls("close")), 1)
        self.assertFalse((self.state / "wrapper" / "t-f89d2ceaecbb.json").exists())

    def test_stream_disable_failure_only_warns(self) -> None:
        (self.temp / "fail-stream").touch()
        result = self.open_session()
        self.assertEqual(result.returncode, 0)
        self.assertIn(b"warning: failed to disable streaming", result.stderr)

    def test_concurrent_launches_on_one_profile_produce_one_open(self) -> None:
        first = self.env.copy()
        first["AB_PROFILE"] = "shared"
        second = first.copy()
        second["AB_THREAD"] = THREAD_2
        processes = [
            subprocess.Popen(
                [str(WRAPPER), "open", "https://example.test"],
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            for env in (first, second)
        ]
        results = [process.communicate(timeout=5) + (process.returncode,) for process in processes]
        self.assertEqual(sorted(result[2] for result in results), [0, 3])
        self.assertEqual(len(self.user_calls("open")), 1)


if __name__ == "__main__":
    unittest.main()
