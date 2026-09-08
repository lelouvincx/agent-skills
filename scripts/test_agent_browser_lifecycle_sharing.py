from __future__ import annotations

import argparse
import fcntl
import importlib.machinery
import importlib.util
import json
import os
import socket
import subprocess
import sys
import tempfile
import unittest
from dataclasses import dataclass
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
COMMAND = ROOT / "bin" / "agent-browser-lifecycle"
SCHEMA = ROOT / "amp" / "agent-browser-lifecycle" / "schema.json"
OWNER = "T-11111111-1111-1111-1111-111111111111"
CHILD = "T-22222222-2222-2222-2222-222222222222"
OTHER = "T-33333333-3333-3333-3333-333333333333"


def load_lifecycle_module():
    loader = importlib.machinery.SourceFileLoader("agent_browser_lifecycle_sharing", str(COMMAND))
    spec = importlib.util.spec_from_loader("agent_browser_lifecycle_sharing", loader)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load agent-browser-lifecycle")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@dataclass(frozen=True)
class FakeBoot:
    session_uuid: str | None
    boot_time_us: int


@dataclass(frozen=True)
class FakeIdentity:
    pid: int
    boot: FakeBoot
    start_time_us: int


class ManagedSharingTest(unittest.TestCase):
    def setUp(self) -> None:
        environment = mock.patch.dict(os.environ, {"PYTHONDONTWRITEBYTECODE": "1"})
        environment.start()
        self.addCleanup(environment.stop)
        self.lifecycle = load_lifecycle_module()
        artifacts = ROOT / ".amp" / "in" / "artifacts"
        artifacts.mkdir(parents=True, exist_ok=True)
        self.temporary_directory = tempfile.TemporaryDirectory(dir=artifacts)
        self.addCleanup(self.temporary_directory.cleanup)
        self.root = Path(self.temporary_directory.name)
        self.state_dir = self.root / "state" / "agent-browser"
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()

    def free_port(self) -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("127.0.0.1", 0))
            return int(listener.getsockname()[1])

    def fake_identity(self, pid: int) -> FakeIdentity:
        return FakeIdentity(pid=pid, boot=FakeBoot("SIMULATED-BOOT", 123456789), start_time_us=987654321 + pid)

    def prepare(self):
        return self.lifecycle.prepare_managed_session(
            owner_thread_id=OWNER,
            workspace=self.workspace,
            namespace="testns",
            short_daemon_name="ab-test",
            runtime_path=self.root / "runtime",
            cdp_port=self.free_port(),
            build_digest="sha256:" + "a" * 64,
            config_digest="sha256:" + "b" * 64,
            state_dir=self.state_dir,
        )

    def ready_session(self):
        prepared = self.prepare()
        for role in ("chrome", "daemon"):
            child = self.lifecycle.launch_managed_role(
                session_id=prepared.session_id,
                role=role,
                argv=[sys.executable, "-c", "pass"],
                state_dir=self.state_dir,
                identity_provider=self.fake_identity,
            )
            self.assertEqual(0, child.wait(timeout=10))
        self.lifecycle.append_managed_ready(self.state_dir, prepared.session_id, "build-1")
        return prepared

    def history(self) -> list[dict[str, object]]:
        path = self.state_dir / "lifecycle.jsonl"
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]

    def live_session(self, session_id: str) -> dict[str, object]:
        return self.lifecycle.replay(self.history())[session_id]

    def runtime(self):
        return self.lifecycle.ManagedRuntimeIdentity(
            str(ROOT / "bin" / "agent-browser"),
            str(self.root / "agent-browser"),
            str(self.root / "install"),
            "build-1",
            "sha256:" + "a" * 64,
        )

    def attach_with_live_checks(self, session_id: str, actor: str = CHILD):
        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir), \
             mock.patch.object(self.lifecycle, "verify_custom_runtime", return_value=self.runtime()), \
             mock.patch.object(self.lifecycle, "verify_ready_integrity", side_effect=lambda sid, runtime: self.live_session(sid)), \
             mock.patch.object(self.lifecycle, "wait_for_daemon", return_value={"connected": True}), \
             mock.patch.object(self.lifecycle, "check_no_daemon_stream"):
            return self.lifecycle.command_attach(argparse.Namespace(session_id=session_id, owner_thread_id=OWNER, actor_thread_id=actor))

    def test_attach_requires_saved_owner_ready_integrity_and_records_child(self) -> None:
        prepared = self.ready_session()
        result = self.attach_with_live_checks(prepared.session_id)
        session = self.live_session(prepared.session_id)
        self.assertEqual("ready", result["state"])
        self.assertEqual([CHILD], session["attached_thread_ids"])
        self.assertEqual("managed_attachment", self.history()[-1]["event"])
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "already attached"):
            self.attach_with_live_checks(prepared.session_id)
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "owner"):
            self.attach_with_live_checks(prepared.session_id, OWNER)

    def test_drain_refuses_new_attach_owner_exec_and_allows_attached_exec_until_detach_then_stop(self) -> None:
        prepared = self.ready_session()
        self.attach_with_live_checks(prepared.session_id)
        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir), \
             mock.patch.object(self.lifecycle, "attempt_verified_shutdown") as shutdown:
            stopped = self.lifecycle.command_stop(argparse.Namespace(session_id=prepared.session_id, owner_thread_id=OWNER))
        self.assertEqual("draining", stopped["state"])
        self.assertEqual([CHILD], stopped["attached_thread_ids"])
        self.assertEqual("managed_draining", self.history()[-1]["event"])
        shutdown.assert_not_called()
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "ready"):
            self.attach_with_live_checks(prepared.session_id, OTHER)
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "owner commands are refused"):
            with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir):
                self.lifecycle.command_exec(argparse.Namespace(session_id=prepared.session_id, actor_thread_id=OWNER, tab_id=None, argv=["snapshot"]))
        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir), \
             mock.patch.object(self.lifecycle, "verify_custom_runtime", return_value=self.runtime()), \
             mock.patch.object(self.lifecycle, "verify_ready_integrity", side_effect=lambda sid, runtime: self.live_session(sid)), \
             mock.patch.object(self.lifecycle, "wait_for_daemon", return_value={"connected": True}), \
             mock.patch.object(self.lifecycle, "check_no_daemon_stream"), \
             mock.patch.object(self.lifecycle.subprocess, "run", return_value=subprocess.CompletedProcess(["agent-browser"], 0, stdout="ok", stderr="")):
            ran = self.lifecycle.command_exec(argparse.Namespace(session_id=prepared.session_id, actor_thread_id=CHILD, tab_id=None, argv=["snapshot"]))
        self.assertEqual("ok", ran["stdout"])
        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir):
            detached = self.lifecycle.command_detach(argparse.Namespace(session_id=prepared.session_id, actor_thread_id=CHILD))
        self.assertEqual([], detached["attached_thread_ids"])
        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir), \
             mock.patch.object(self.lifecycle, "attempt_verified_shutdown", return_value=(None, None)), \
             mock.patch.object(self.lifecycle, "wait_for_managed_closure", return_value=[]):
            closed = self.lifecycle.command_stop(argparse.Namespace(session_id=prepared.session_id, owner_thread_id=OWNER))
        self.assertEqual("closed", closed["state"])
        self.assertEqual("managed_closed", self.history()[-1]["event"])

    def test_detach_requires_recorded_attachment_and_reconcile_requires_owner_confirmation(self) -> None:
        prepared = self.ready_session()
        self.attach_with_live_checks(prepared.session_id)
        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir):
            with self.assertRaisesRegex(self.lifecycle.LifecycleError, "confirm"):
                self.lifecycle.command_reconcile_managed(argparse.Namespace(session_id=prepared.session_id, owner_thread_id=OWNER, actor_thread_id=OWNER, reconciled_thread_id=CHILD, confirm_worker_finished=False))
            with self.assertRaisesRegex(self.lifecycle.LifecycleError, "owner actor"):
                self.lifecycle.command_reconcile_managed(argparse.Namespace(session_id=prepared.session_id, owner_thread_id=OWNER, actor_thread_id=OTHER, reconciled_thread_id=CHILD, confirm_worker_finished=True))
            reconciled = self.lifecycle.command_reconcile_managed(argparse.Namespace(session_id=prepared.session_id, owner_thread_id=OWNER, actor_thread_id=OWNER, reconciled_thread_id=CHILD, confirm_worker_finished=True))
            with self.assertRaisesRegex(self.lifecycle.LifecycleError, "matching attachment"):
                self.lifecycle.command_detach(argparse.Namespace(session_id=prepared.session_id, actor_thread_id=CHILD))
        self.assertEqual([], reconciled["attached_thread_ids"])
        self.assertEqual("managed_attachment_reconciled", self.history()[-1]["event"])

    def test_exec_tab_id_switch_and_command_are_serialized_under_one_operation_lock(self) -> None:
        prepared = self.ready_session()
        self.attach_with_live_checks(prepared.session_id)
        calls: list[list[str]] = []

        def run_with_locked_operation(command, **kwargs):
            with (self.state_dir / "operation-locks" / f"{prepared.session_id}.lock").open("r+") as lock:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            calls.append(command)
            return subprocess.CompletedProcess(command, 0, stdout=f"call-{len(calls)}", stderr="")

        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir), \
             mock.patch.object(self.lifecycle, "verify_custom_runtime", return_value=self.runtime()), \
             mock.patch.object(self.lifecycle, "verify_ready_integrity", side_effect=lambda sid, runtime: self.live_session(sid)), \
             mock.patch.object(self.lifecycle, "wait_for_daemon", return_value={"connected": True}), \
             mock.patch.object(self.lifecycle, "check_no_daemon_stream"), \
             mock.patch.object(self.lifecycle.subprocess, "run", side_effect=run_with_locked_operation):
            result = self.lifecycle.command_exec(argparse.Namespace(session_id=prepared.session_id, actor_thread_id=CHILD, tab_id="t2", argv=["click", "Login"]))
        self.assertEqual("call-2", result["stdout"])
        self.assertEqual(["tab", "t2"], calls[0][-2:])
        self.assertEqual(["click", "Login"], calls[1][-2:])
        self.lifecycle.validate_tab_id("1" + "a" * 31)
        for tab_id in ("--json", "--tab-id", "0", "1", "12", "t0", "tab-123"):
            with self.subTest(tab_id=tab_id):
                with self.assertRaisesRegex(self.lifecycle.LifecycleError, "stable target ID"):
                    self.lifecycle.validate_tab_id(tab_id)

    def test_tab_validator_show_filter_and_schema_accept_sharing_records(self) -> None:
        jsonschema = __import__("jsonschema")
        prepared = self.ready_session()
        self.attach_with_live_checks(prepared.session_id)
        for argv in (["tab"], ["tab", "t2"], ["tab", "list", "--json"], ["tab", "switch", "t2"], ["tab", "1" + "a" * 31]):
            self.lifecycle.validate_exec_argv(list(argv))
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "tab list"):
            self.lifecycle.validate_exec_argv(["tab", "list", "extra"])
        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir):
            view = self.lifecycle.command_show(argparse.Namespace(session_id=prepared.session_id))
            empty = self.lifecycle.command_show(argparse.Namespace(session_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"))
        self.assertEqual([prepared.session_id], [session["session_id"] for session in view["sessions"]])
        self.assertEqual([], empty["sessions"])
        validator = jsonschema.Draft202012Validator(json.loads(SCHEMA.read_text(encoding="utf-8")))
        validator.validate(self.history()[-1])
        validator.validate(self.lifecycle.current_view(self.lifecycle.replay(self.history())))

        partial = self.lifecycle.prepare_managed_session(
            owner_thread_id=OWNER,
            workspace=self.workspace,
            namespace="partialns",
            short_daemon_name="ab-partial",
            runtime_path=self.root / "partial-runtime",
            cdp_port=self.free_port(),
            build_digest="sha256:" + "c" * 64,
            config_digest="sha256:" + "d" * 64,
            state_dir=self.state_dir,
        )
        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir), \
             mock.patch.object(self.lifecycle, "attempt_verified_shutdown", return_value=(None, "no daemon yet")), \
             mock.patch.object(self.lifecycle, "wait_for_managed_closure", return_value=[]):
            recovered = self.lifecycle.command_recover_managed(argparse.Namespace(session_id=partial.session_id, owner_thread_id=OWNER))
        self.assertEqual("closed", recovered["state"])


if __name__ == "__main__":
    unittest.main()
