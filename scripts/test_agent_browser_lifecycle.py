from __future__ import annotations

import json
import os
import shutil
import socket
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMMAND = ROOT / "bin" / "agent-browser-lifecycle"
OWNER = "T-11111111-1111-1111-1111-111111111111"
CHILD = "T-22222222-2222-2222-2222-222222222222"


class AgentBrowserLifecycleTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.state_home = Path(self.temporary_directory.name) / "state"
        self.environment = os.environ.copy()
        self.environment["XDG_STATE_HOME"] = str(self.state_home)
        self.workspace = Path(self.temporary_directory.name) / "workspace"
        self.workspace.mkdir()

    def free_port(self) -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("127.0.0.1", 0))
            return int(listener.getsockname()[1])

    def run_command(
        self, *arguments: str, expected_status: int = 0
    ) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            [str(COMMAND), *arguments],
            cwd=self.workspace,
            env=self.environment,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(expected_status, result.returncode, result.stderr)
        return result

    def claim(self, port: int | None = None) -> dict[str, object]:
        if port is None:
            port = self.free_port()
        result = self.run_command(
            "claim", "--owner-thread-id", OWNER, "--cdp-port", str(port)
        )
        return json.loads(result.stdout)

    def ready_session(self) -> dict[str, object]:
        claim = self.claim()
        self.run_command(
            "record",
            "ready",
            "--session-id",
            str(claim["session_id"]),
            "--actor-thread-id",
            OWNER,
            "--browser-pid",
            "43210",
        )
        return claim

    def test_full_lifecycle_updates_current_view(self) -> None:
        claim = self.ready_session()
        session_id = str(claim["session_id"])
        user_data_dir = Path(str(claim["user_data_dir"]))

        self.assertTrue(user_data_dir.is_dir())
        self.run_command(
            "record", "attached", "--session-id", session_id, "--actor-thread-id", CHILD
        )
        current = json.loads(self.run_command("show").stdout)
        self.assertEqual("ready", current["sessions"][0]["state"])
        self.assertEqual([CHILD], current["sessions"][0]["attached_thread_ids"])

        self.run_command(
            "record", "detached", "--session-id", session_id, "--actor-thread-id", CHILD
        )
        self.run_command(
            "record", "stopping", "--session-id", session_id, "--actor-thread-id", OWNER
        )
        shutil.rmtree(user_data_dir.parent)
        self.run_command(
            "record", "stopped", "--session-id", session_id, "--actor-thread-id", OWNER
        )
        current = json.loads(self.run_command("show").stdout)
        self.assertEqual([], current["sessions"])

        lifecycle_dir = self.state_home / "agent-browser"
        history_lines = (
            (lifecycle_dir / "lifecycle.jsonl").read_text(encoding="utf-8").splitlines()
        )
        self.assertEqual(6, len(history_lines))
        self.assertEqual(
            ["claimed", "ready", "attached", "detached", "stopping", "stopped"],
            [json.loads(line)["event"] for line in history_lines],
        )
        self.assertEqual(
            0o600, stat.S_IMODE((lifecycle_dir / "lifecycle.jsonl").stat().st_mode)
        )
        self.assertEqual(
            0o600, stat.S_IMODE((lifecycle_dir / "current.json").stat().st_mode)
        )

    def test_claim_rejects_an_active_port(self) -> None:
        port = self.free_port()
        self.claim(port)
        result = self.run_command(
            "claim",
            "--owner-thread-id",
            OWNER,
            "--cdp-port",
            str(port),
            expected_status=2,
        )
        self.assertIn("already claimed", result.stderr)

    def test_claim_rejects_a_noncanonical_thread_id(self) -> None:
        result = self.run_command(
            "claim",
            "--owner-thread-id",
            "T-not-a-uuid",
            "--cdp-port",
            str(self.free_port()),
            expected_status=2,
        )
        self.assertIn("canonical lowercase", result.stderr)

    def test_parallel_claims_preserve_both_sessions(self) -> None:
        ports = [self.free_port(), self.free_port()]
        processes = [
            subprocess.Popen(
                [
                    str(COMMAND),
                    "claim",
                    "--owner-thread-id",
                    OWNER,
                    "--cdp-port",
                    str(port),
                ],
                cwd=self.workspace,
                env=self.environment,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            for port in ports
        ]
        results = [process.communicate(timeout=10) for process in processes]
        for process, (_, stderr) in zip(processes, results, strict=True):
            self.assertEqual(0, process.returncode, stderr)

        current = json.loads(self.run_command("show").stdout)
        self.assertEqual(
            sorted(ports), [session["cdp_port"] for session in current["sessions"]]
        )
        history_path = self.state_home / "agent-browser" / "lifecycle.jsonl"
        self.assertEqual(2, len(history_path.read_text(encoding="utf-8").splitlines()))

    def test_invalid_transition_does_not_append_history(self) -> None:
        claim = self.claim()
        session_id = str(claim["session_id"])
        result = self.run_command(
            "record",
            "detached",
            "--session-id",
            session_id,
            "--actor-thread-id",
            CHILD,
            expected_status=2,
        )
        self.assertIn("matching attached", result.stderr)
        history_path = self.state_home / "agent-browser" / "lifecycle.jsonl"
        self.assertEqual(1, len(history_path.read_text(encoding="utf-8").splitlines()))

    def test_duplicate_attach_is_rejected(self) -> None:
        claim = self.ready_session()
        session_id = str(claim["session_id"])
        arguments = (
            "record",
            "attached",
            "--session-id",
            session_id,
            "--actor-thread-id",
            CHILD,
        )
        self.run_command(*arguments)
        result = self.run_command(*arguments, expected_status=2)
        self.assertIn("already attached", result.stderr)
        history_path = self.state_home / "agent-browser" / "lifecycle.jsonl"
        self.assertEqual(3, len(history_path.read_text(encoding="utf-8").splitlines()))

    def test_stopping_rejects_attached_children(self) -> None:
        claim = self.ready_session()
        session_id = str(claim["session_id"])
        self.run_command(
            "record", "attached", "--session-id", session_id, "--actor-thread-id", CHILD
        )
        result = self.run_command(
            "record",
            "stopping",
            "--session-id",
            session_id,
            "--actor-thread-id",
            OWNER,
            expected_status=2,
        )
        self.assertIn("while child threads are attached", result.stderr)

    def test_stopping_rejects_new_attachments(self) -> None:
        claim = self.ready_session()
        session_id = str(claim["session_id"])
        self.run_command(
            "record", "stopping", "--session-id", session_id, "--actor-thread-id", OWNER
        )
        result = self.run_command(
            "record",
            "attached",
            "--session-id",
            session_id,
            "--actor-thread-id",
            CHILD,
            expected_status=2,
        )
        self.assertIn("only to a ready session", result.stderr)

    def test_observed_dead_rejects_an_in_flight_claim(self) -> None:
        claim = self.claim()
        result = self.run_command(
            "record",
            "observed_dead",
            "--session-id",
            str(claim["session_id"]),
            "--actor-thread-id",
            CHILD,
            expected_status=2,
        )
        self.assertIn("ready or stopping", result.stderr)

    def test_show_repairs_a_valid_but_stale_current_view(self) -> None:
        claim = self.claim()
        current_path = self.state_home / "agent-browser" / "current.json"
        stale_view = current_path.read_bytes()
        self.run_command(
            "record",
            "ready",
            "--session-id",
            str(claim["session_id"]),
            "--actor-thread-id",
            OWNER,
            "--browser-pid",
            "43210",
        )
        current_path.write_bytes(stale_view)

        repaired = json.loads(self.run_command("show").stdout)
        self.assertEqual("ready", repaired["sessions"][0]["state"])
        self.assertEqual(43210, repaired["sessions"][0]["browser_pid"])

    def test_rebuild_discards_an_unterminated_history_fragment(self) -> None:
        claim = self.claim()
        history_path = self.state_home / "agent-browser" / "lifecycle.jsonl"
        with history_path.open("ab") as history_file:
            history_file.write(b'{"schema":"agent-browser-lifecycle/v1"')

        rebuilt = json.loads(self.run_command("rebuild").stdout)
        self.assertEqual(claim["session_id"], rebuilt["sessions"][0]["session_id"])
        history = history_path.read_bytes()
        self.assertTrue(history.endswith(b"\n"))
        self.assertEqual(1, len(history.splitlines()))

    def test_rebuild_repairs_missing_current_view(self) -> None:
        claim = self.claim()
        current_path = self.state_home / "agent-browser" / "current.json"
        current_path.unlink()
        rebuilt = json.loads(self.run_command("rebuild").stdout)
        self.assertEqual(claim["session_id"], rebuilt["sessions"][0]["session_id"])
        self.assertTrue(current_path.exists())


if __name__ == "__main__":
    unittest.main()
