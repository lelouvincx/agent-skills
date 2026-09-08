from __future__ import annotations

import argparse
import importlib.machinery
import importlib.util
import json
import os
import socket
import sys
import tempfile
import unittest
from dataclasses import dataclass
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
COMMAND = ROOT / "bin" / "agent-browser-lifecycle"
OWNER = "T-11111111-1111-1111-1111-111111111111"


def load_lifecycle_module():
    loader = importlib.machinery.SourceFileLoader("agent_browser_lifecycle_sweep", str(COMMAND))
    spec = importlib.util.spec_from_loader("agent_browser_lifecycle_sweep", loader)
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


class ManagedLifecycleSweepTest(unittest.TestCase):
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
        self.old_boot = FakeBoot("old-boot", 100)
        self.later_boot = FakeBoot("later-boot", 200)

    def free_port(self) -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("127.0.0.1", 0))
            return int(listener.getsockname()[1])

    def fake_identity(self, pid: int, boot: FakeBoot | None = None) -> FakeIdentity:
        return FakeIdentity(pid=pid, boot=boot or self.old_boot, start_time_us=1000 + pid)

    def patch_current_boot(self, boot: FakeBoot):
        return mock.patch.object(
            self.lifecycle,
            "process_birth_identity_record",
            return_value=self.lifecycle.ProcessBirthIdentityRecord(
                self.lifecycle.BootIdentityRecord(boot.session_uuid, boot.boot_time_us),
                os.getpid(),
                999,
            ),
        )

    def prepare(self):
        with self.patch_current_boot(self.old_boot):
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
            with self.patch_current_boot(self.old_boot):
                child = self.lifecycle.launch_managed_role(
                    session_id=prepared.session_id,
                    role=role,
                    argv=[sys.executable, "-c", "pass"],
                    state_dir=self.state_dir,
                    identity_provider=lambda pid, boot=self.old_boot: self.fake_identity(pid, boot),
                )
            self.assertEqual(0, child.wait(timeout=10))
        self.lifecycle.append_managed_ready(self.state_dir, prepared.session_id, "build-1")
        return prepared

    def history(self) -> list[dict[str, object]]:
        return [json.loads(line) for line in (self.state_dir / "lifecycle.jsonl").read_text(encoding="utf-8").splitlines()]

    def close_ready(self):
        prepared = self.ready_session()
        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir), \
             mock.patch.object(self.lifecycle, "attempt_verified_shutdown", return_value=(None, None)), \
             mock.patch.object(self.lifecycle, "wait_for_managed_closure", return_value=[]):
            result = self.lifecycle.command_stop(argparse.Namespace(session_id=prepared.session_id, owner_thread_id=OWNER))
        self.assertEqual("closed", result["state"])
        return prepared

    def sweep(self, boot: FakeBoot | None = None):
        with self.patch_current_boot(boot or self.later_boot), \
             mock.patch.object(self.lifecycle, "lsof_any_listener_pids", return_value=set()), \
             mock.patch.object(self.lifecycle, "daemon_socket_pending_reason", return_value=None):
            return self.lifecycle.sweep_retired_sessions(self.state_dir)

    def test_metadata_is_recorded_before_role_launch_and_schema_accepts_it(self) -> None:
        import jsonschema

        prepared = self.prepare()
        with self.patch_current_boot(self.old_boot):
            child = self.lifecycle.launch_managed_role(
                session_id=prepared.session_id,
                role="chrome",
                argv=[sys.executable, "-c", "pass"],
                state_dir=self.state_dir,
                identity_provider=lambda pid: self.fake_identity(pid, self.old_boot),
            )
        self.assertEqual(0, child.wait(timeout=10))
        events = [record["event"] for record in self.history()]
        self.assertEqual(["managed_intent", "managed_profile_created", "managed_role_identity", "managed_artifacts_recorded", "managed_role_release"], events)
        artifacts = self.history()[3]
        self.assertEqual(prepared.user_data_dir, artifacts["profile_identity"]["path"])
        self.assertEqual(prepared.runtime_path, artifacts["runtime_identity"]["path"])
        self.assertEqual({"session_uuid": "old-boot", "boot_time_us": 100}, artifacts["artifact_boot"])
        jsonschema.Draft202012Validator(json.loads((ROOT / "amp" / "agent-browser-lifecycle" / "schema.json").read_text())).validate(artifacts)

    def test_replay_completion_only_on_closed_and_current_view_excludes_retirement(self) -> None:
        prepared = self.close_ready()
        state = self.lifecycle.replay_state(self.history())
        self.assertNotIn(prepared.session_id, state.active)
        self.assertIn(prepared.session_id, state.retired)
        self.assertEqual([], self.lifecycle.current_view(self.lifecycle.replay(self.history()))["sessions"])
        self.assertEqual("managed_closed", self.history()[-1]["event"])

    def test_replay_rejects_artifact_removal_before_closed_double_wrong_identity_and_reclaimed_uuid(self) -> None:
        prepared = self.close_ready()
        records = self.history()
        retired = self.lifecycle.replay_state(records).retired[prepared.session_id]
        removal = self.lifecycle.managed_base_record(
            self.lifecycle.session_preparation_from_session(retired),
            "managed_artifacts_removed",
        )

        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "unknown retired session"):
            self.lifecycle.replay_state([*records[:-1], removal, records[-1]])

        removed_records = [*records, removal]
        self.lifecycle.replay_state(removed_records)
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "removed more than once"):
            self.lifecycle.replay_state([*removed_records, removal])

        wrong_identity = dict(removal, runtime_path=str(self.root / "other-runtime"))
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "runtime_path changed"):
            self.lifecycle.replay_state([*records, wrong_identity])

        reclaimed_intent = dict(records[0])
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "claimed again after closure"):
            self.lifecycle.replay_state([*records, reclaimed_intent])

    def test_sameboot_does_not_run_filesystem_or_listener_work(self) -> None:
        prepared = self.close_ready()
        with self.patch_current_boot(self.old_boot), \
             mock.patch.object(self.lifecycle, "retired_listener_blocked") as listener:
            result = self.lifecycle.sweep_retired_sessions(self.state_dir)
        self.assertEqual({"removed": 0, "awaiting_reboot": 1, "blocked": 0, "blocked_details": []}, result)
        self.assertTrue(Path(prepared.user_data_dir).is_dir())
        listener.assert_not_called()

    def test_laterboot_removes_disposable_dirs_and_records_completion(self) -> None:
        prepared = self.close_ready()
        result = self.sweep()
        self.assertEqual(1, result["removed"])
        self.assertFalse(Path(prepared.user_data_dir).exists())
        self.assertFalse(Path(prepared.runtime_path).exists())
        self.assertEqual("managed_artifacts_removed", self.history()[-1]["event"])

    def test_interrupted_deletion_before_append_retries_idempotently(self) -> None:
        prepared = self.close_ready()
        original_append = self.lifecycle.append_record

        def fail_removed_append(path, record):
            if record.get("event") == "managed_artifacts_removed":
                raise OSError("journal failed")
            return original_append(path, record)

        with mock.patch.object(self.lifecycle, "append_record", side_effect=fail_removed_append):
            result = self.sweep()
        self.assertEqual(1, result["blocked"])
        self.assertFalse(Path(prepared.user_data_dir).exists())
        result = self.sweep()
        self.assertEqual(1, result["removed"])
        self.assertEqual("managed_artifacts_removed", self.history()[-1]["event"])

    def test_active_managed_overlap_blocks_deletion(self) -> None:
        prepared = self.close_ready()
        active = self.lifecycle.prepare_managed_session(
            owner_thread_id=OWNER,
            workspace=self.workspace,
            namespace="activen",
            short_daemon_name="ab-active",
            runtime_path=self.root / "active-runtime",
            cdp_port=self.free_port(),
            build_digest="sha256:" + "c" * 64,
            config_digest="sha256:" + "d" * 64,
            state_dir=self.state_dir,
        )
        records = self.history()
        for record in records:
            if record["session_id"] == active.session_id:
                record["runtime_path"] = str(Path(prepared.runtime_path) / "nested")
        (self.state_dir / "lifecycle.jsonl").write_text("".join(json.dumps(record) + "\n" for record in records), encoding="utf-8")
        result = self.sweep()
        self.assertEqual(1, result["blocked"])
        self.assertIn(active.session_id, result["blocked_details"][0]["reason"])
        self.assertTrue(Path(prepared.user_data_dir).exists())

    def test_active_legacy_profile_overlap_blocks_deletion(self) -> None:
        prepared = self.close_ready()
        legacy_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        legacy = {
            "schema": "agent-browser-lifecycle/v1",
            "timestamp": "2026-09-07T00:00:00Z",
            "event": "claimed",
            "session_id": legacy_id,
            "owner_thread_id": OWNER,
            "actor_thread_id": OWNER,
            "cdp_host": "127.0.0.1",
            "cdp_port": self.free_port(),
            "user_data_dir": str(Path(prepared.user_data_dir) / "nested"),
            "browser_pid": None,
            "workspace": str(self.workspace),
        }
        with (self.state_dir / "lifecycle.jsonl").open("a", encoding="utf-8") as history:
            history.write(json.dumps(legacy) + "\n")
        result = self.sweep()
        self.assertEqual(1, result["blocked"])
        self.assertIn(legacy_id, result["blocked_details"][0]["reason"])
        self.assertTrue(Path(prepared.user_data_dir).exists())

    def test_prepare_refuses_unremoved_retired_path_overlap(self) -> None:
        prepared = self.close_ready()
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "unremoved retired session"):
            self.lifecycle.prepare_managed_session(
                owner_thread_id=OWNER,
                workspace=self.workspace,
                namespace="nextns",
                short_daemon_name="ab-next",
                runtime_path=Path(prepared.runtime_path) / "nested",
                cdp_port=self.free_port(),
                build_digest="sha256:" + "c" * 64,
                config_digest="sha256:" + "d" * 64,
                state_dir=self.state_dir,
            )

    def test_sameboot_summary_skips_namespace_conflicts(self) -> None:
        self.close_ready()
        active = self.lifecycle.prepare_managed_session(
            owner_thread_id=OWNER,
            workspace=self.workspace,
            namespace="activen",
            short_daemon_name="ab-active",
            runtime_path=self.root / "active-runtime",
            cdp_port=self.free_port(),
            build_digest="sha256:" + "c" * 64,
            config_digest="sha256:" + "d" * 64,
            state_dir=self.state_dir,
        )
        records = self.history()
        for record in records:
            if record["session_id"] == active.session_id:
                record["namespace"] = "testns"
                record["short_daemon_name"] = "ab-test"
        (self.state_dir / "lifecycle.jsonl").write_text("".join(json.dumps(record) + "\n" for record in records), encoding="utf-8")
        result = self.sweep(self.old_boot)
        self.assertEqual({"removed": 0, "awaiting_reboot": 1, "blocked": 0, "blocked_details": []}, result)

    def test_blocked_details_are_limited(self) -> None:
        for index in range(12):
            self.state_dir = self.root / f"state-blocked-{index}" / "agent-browser"
            self.close_ready()
        # Merge retired records into one state dir so one sweep reports every block.
        merged_state = self.root / "state-merged" / "agent-browser"
        merged_state.mkdir(parents=True)
        lines = []
        for index in range(12):
            history = self.root / f"state-blocked-{index}" / "agent-browser" / "lifecycle.jsonl"
            records = [json.loads(line) for line in history.read_text(encoding="utf-8").splitlines()]
            for record in records:
                if record["event"] == "managed_artifacts_recorded":
                    record["artifact_boot"] = {"session_uuid": "other", "boot_time_us": 100}
            lines.extend(json.dumps(record) + "\n" for record in records)
        (merged_state / "lifecycle.jsonl").write_text("".join(lines), encoding="utf-8")
        self.state_dir = merged_state
        result = self.sweep()
        self.assertEqual(12, result["blocked"])
        self.assertEqual(10, len(result["blocked_details"]))

    def test_wrong_identity_symlink_and_listener_are_blocked(self) -> None:
        cases = ["identity", "symlink", "listener"]
        for case in cases:
            with self.subTest(case=case):
                self.state_dir = self.root / f"state-{case}" / "agent-browser"
                prepared = self.close_ready()
                if case == "identity":
                    Path(prepared.runtime_path).rename(Path(prepared.runtime_path).with_name("runtime-original"))
                    Path(prepared.runtime_path).mkdir()
                elif case == "symlink":
                    original = Path(prepared.runtime_path).with_name("runtime-original")
                    Path(prepared.runtime_path).rename(original)
                    Path(prepared.runtime_path).symlink_to(original, target_is_directory=True)
                if case == "listener":
                    with self.patch_current_boot(self.later_boot), \
                         mock.patch.object(self.lifecycle, "lsof_any_listener_pids", return_value={123}):
                        result = self.lifecycle.sweep_retired_sessions(self.state_dir)
                else:
                    result = self.sweep()
                self.assertEqual(1, result["blocked"])

    def test_repeated_sweep_is_idempotent(self) -> None:
        self.close_ready()
        first = self.sweep()
        second = self.sweep()
        self.assertEqual(1, first["removed"])
        self.assertEqual({"removed": 0, "awaiting_reboot": 0, "blocked": 0, "blocked_details": []}, second)
        self.assertEqual(1, sum(1 for record in self.history() if record["event"] == "managed_artifacts_removed"))

    def test_old_missing_metadata_histories_are_replayable_but_not_deleted(self) -> None:
        prepared = self.close_ready()
        records = []
        for record in self.history():
            if record["event"] == "managed_artifacts_recorded":
                continue
            records.append(record)
        (self.state_dir / "lifecycle.jsonl").write_text("".join(json.dumps(record) + "\n" for record in records), encoding="utf-8")
        self.assertEqual({}, self.lifecycle.replay(self.history()))
        result = self.sweep()
        self.assertEqual(1, result["blocked"])
        self.assertTrue(Path(prepared.user_data_dir).exists())


if __name__ == "__main__":
    unittest.main()
