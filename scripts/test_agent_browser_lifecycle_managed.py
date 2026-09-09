from __future__ import annotations

import argparse
import importlib.machinery
import importlib.util
import json
import os
import socket
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from unittest import mock
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[1]
COMMAND = ROOT / "bin" / "agent-browser-lifecycle"
SCHEMA = ROOT / "amp" / "agent-browser-lifecycle" / "schema.json"
OWNER = "T-11111111-1111-1111-1111-111111111111"


def load_lifecycle_module():
    loader = importlib.machinery.SourceFileLoader("agent_browser_lifecycle", str(COMMAND))
    spec = importlib.util.spec_from_loader("agent_browser_lifecycle", loader)
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


class ManagedLifecycleTest(unittest.TestCase):
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

    def prepare(self, **overrides):
        kwargs = dict(
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
        kwargs.update(overrides)
        return self.lifecycle.prepare_managed_session(**kwargs)

    def ready_session(self, **overrides):
        prepared = self.prepare(**overrides)
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
        history_path = self.state_dir / "lifecycle.jsonl"
        if not history_path.exists():
            return []
        return [json.loads(line) for line in history_path.read_text(encoding="utf-8").splitlines()]

    def live_session(self, session_id: str | None = None) -> dict[str, object]:
        sessions = self.lifecycle.replay(self.history())
        return sessions[session_id or next(iter(sessions))]

    def test_prepare_persists_intent_before_profile_identity(self) -> None:
        prepared = self.prepare()
        records = self.history()
        self.assertEqual("managed_intent", records[0]["event"])
        self.assertEqual("managed_profile_created", records[1]["event"])
        self.assertEqual(prepared.session_id, records[0]["session_id"])
        self.assertNotIn("profile_identity", records[0])
        self.assertTrue(Path(records[1]["profile_identity"]["path"]).is_dir())

    def close_fixture(self, prepared, *, stop=False, pending=None):
        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir), \
             mock.patch.object(self.lifecycle, "attempt_verified_shutdown", return_value=(None, "lost response")), \
             mock.patch.object(self.lifecycle, "wait_for_managed_closure", return_value=pending or []):
            command = self.lifecycle.command_stop if stop else self.lifecycle.command_recover_managed
            return command(argparse.Namespace(session_id=prepared.session_id, owner_thread_id=prepared.owner_thread_id))

    def test_persistent_headed_stop_headless_stop_headed_preserves_identity_and_data(self):
        import jsonschema

        first = self.ready_session(profile_name="upwork", launch_mode="headed")
        marker = Path(first.user_data_dir) / "fixture-login"
        marker.write_text("fixture-only-not-a-cookie")
        marker.chmod(0o600)
        self.assertEqual("closed", self.close_fixture(first, stop=True)["state"])
        second = self.ready_session(profile_name="upwork", runtime_path=self.root / "run2")
        self.assertNotEqual(first.session_id, second.session_id)
        self.assertEqual(first.profile_identity, second.profile_identity)
        self.assertEqual("headless", second.launch_mode)
        self.assertEqual("fixture-only-not-a-cookie", marker.read_text())
        self.assertEqual("closed", self.close_fixture(second, stop=True)["state"])
        third = self.prepare(profile_name="upwork", launch_mode="headed", runtime_path=self.root / "run3",
                             owner_thread_id="T-22222222-2222-2222-2222-222222222222")
        self.assertEqual(first.profile_identity, third.profile_identity)
        validator = jsonschema.Draft202012Validator(json.loads(SCHEMA.read_text()))
        for record in self.history():
            validator.validate(record)
        validator.validate(self.lifecycle.current_view(self.lifecycle.replay(self.history())))
        self.assertNotIn("fixture-only-not-a-cookie", json.dumps(self.history()))
        for directory in (Path(first.user_data_dir), Path(first.user_data_dir).parent):
            self.assertEqual(0o700, directory.stat().st_mode & 0o777)

    def test_persistent_concurrent_owners_have_one_durable_claim(self):
        def attempt(index):
            try:
                return self.prepare(profile_name="shared", launch_mode="headed" if index else "headless",
                                    owner_thread_id=OWNER if index else "T-22222222-2222-2222-2222-222222222222",
                                    cdp_port=45000 + index, short_daemon_name=f"ab-{index}",
                                    runtime_path=self.root / f"run-{index}")
            except self.lifecycle.LifecycleError:
                return None

        with mock.patch.object(self.lifecycle, "port_is_available", return_value=True), ThreadPoolExecutor(2) as executor:
            results = list(executor.map(attempt, range(2)))
        self.assertEqual(1, sum(result is not None for result in results))
        self.assertEqual(1, len(self.lifecycle.replay(self.history())))
        self.assertEqual(1, sum(record["event"] == "managed_intent" for record in self.history()))

    def test_persistent_pending_shutdown_blocks_reuse_until_verified_closed(self):
        first = self.ready_session(profile_name="upwork")
        result = self.close_fixture(first, stop=True, pending=["chrome birth identity is still alive"])
        self.assertEqual("cleanup-pending", result["state"])
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "active session"):
            self.prepare(profile_name="upwork", runtime_path=self.root / "run2")
        self.assertEqual("closed", self.close_fixture(first)["state"])
        second = self.prepare(profile_name="upwork", runtime_path=self.root / "run2")
        self.assertEqual(first.profile_identity, second.profile_identity)

    def test_persistent_invalid_names_and_external_paths_are_refused(self):
        for name in ("", "../upwork", "/tmp/upwork", "UPWORK", "a/b", "a" * 64):
            with self.subTest(name=name), self.assertRaisesRegex(self.lifecycle.LifecycleError, "profile_name"):
                self.prepare(profile_name=name)
        self.assertEqual([], self.history())
        parser = self.lifecycle.build_parser()
        args = parser.parse_args(["start", "--owner-thread-id", OWNER, "--workspace", str(self.workspace),
                                  "--profile-name", "upwork", "--headed"])
        self.assertEqual("upwork", args.profile_name)
        self.assertTrue(args.headed)

    def test_persistent_locks_including_dangling_symlinks_block_before_intent_and_launch(self):
        first = self.prepare(profile_name="upwork")
        self.close_fixture(first)
        for name in ("SingletonLock", "SingletonSocket", "SingletonCookie"):
            lock = Path(first.user_data_dir) / name
            lock.symlink_to("missing-fixture-target")
            before = self.history()
            with self.assertRaisesRegex(self.lifecycle.LifecycleError, "lock artifacts"):
                self.prepare(profile_name="upwork", runtime_path=self.root / "run2")
            self.assertEqual(before, self.history())
            lock.unlink()
        second = self.prepare(profile_name="upwork", runtime_path=self.root / "run2")
        (Path(first.user_data_dir) / "SingletonLock").touch()
        with mock.patch.object(self.lifecycle.subprocess, "Popen") as spawn:
            with self.assertRaisesRegex(self.lifecycle.LifecycleError, "lock artifacts"):
                self.lifecycle.launch_managed_role(session_id=second.session_id, role="chrome",
                                                   argv=[sys.executable, "-c", "pass"], state_dir=self.state_dir)
            spawn.assert_not_called()

    def test_persistent_unsafe_permissions_symlinks_replacement_and_missing_profile_are_refused(self):
        first = self.prepare(profile_name="upwork")
        self.close_fixture(first)
        profile = Path(first.user_data_dir)
        profile.chmod(0o755)
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "0700"):
            self.prepare(profile_name="upwork", runtime_path=self.root / "run2")
        profile.chmod(0o700)
        saved = profile.with_name("saved")
        profile.rename(saved)
        profile.symlink_to(saved)
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "symlink"):
            self.prepare(profile_name="upwork", runtime_path=self.root / "run2")
        profile.unlink()
        profile.mkdir(mode=0o700)
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "adoption is unsupported"):
            self.prepare(profile_name="upwork", runtime_path=self.root / "run2")
        profile.rmdir()
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "missing"):
            self.prepare(profile_name="upwork", runtime_path=self.root / "run2")

    def test_persistent_unknown_directory_is_not_adopted(self):
        profile = self.state_dir / "profiles" / "upwork"
        profile.mkdir(parents=True, mode=0o700)
        profile.parent.chmod(0o700)
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "adoption is unsupported"):
            self.prepare(profile_name="upwork")
        self.assertEqual([], self.history())

    def test_persistent_preparation_failures_recover_without_discarding_saved_profile(self):
        first = self.prepare(profile_name="upwork")
        self.close_fixture(first)
        for index, stage in enumerate(("intent", "profile-create", "profile-record")):
            with self.assertRaisesRegex(self.lifecycle.LifecycleError, "injected failure"):
                self.prepare(profile_name="upwork", runtime_path=self.root / f"failed-{index}", fail_after=stage)
            session = self.live_session()
            prepared = self.lifecycle.session_preparation_from_session(session)
            with self.assertRaisesRegex(self.lifecycle.LifecycleError, "active session"):
                self.prepare(profile_name="upwork", runtime_path=self.root / "blocked")
            self.assertEqual("closed", self.close_fixture(prepared)["state"])
        last = self.prepare(profile_name="upwork", runtime_path=self.root / "last")
        self.assertEqual(first.profile_identity, last.profile_identity)

    def test_persistent_recovery_before_preparation_lock_prevents_late_file_creation(self):
        original_lock = self.lifecycle.session_operation_lock

        @contextmanager
        def recover_before_lock(state_dir, session_id):
            session = self.live_session(session_id)
            self.lifecycle.record_cleanup_pending(state_dir, session_id, "fixture recovery")
            self.lifecycle.append_managed_closed(state_dir, session)
            with original_lock(state_dir, session_id):
                yield

        with mock.patch.object(self.lifecycle, "session_operation_lock", side_effect=recover_before_lock):
            with self.assertRaisesRegex(self.lifecycle.LifecycleError, "no longer available"):
                self.prepare(profile_name="upwork")
        self.assertFalse((self.state_dir / "profiles" / "upwork").exists())
        self.assertEqual({}, self.lifecycle.replay(self.history()))

    def test_persistent_first_creation_without_recorded_identity_is_retained_but_not_adopted(self):
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "injected failure"):
            self.prepare(profile_name="upwork", fail_after="profile-create")
        prepared = self.lifecycle.session_preparation_from_session(self.live_session())
        self.assertEqual("closed", self.close_fixture(prepared)["state"])
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "adoption is unsupported"):
            self.prepare(profile_name="upwork", runtime_path=self.root / "run2")
        self.assertTrue(Path(prepared.user_data_dir).is_dir())

    def test_persistent_sweep_never_inspects_or_deletes_retained_artifacts(self):
        first = self.ready_session(profile_name="upwork")
        self.close_fixture(first)
        cleanup = self.lifecycle.load_retired_cleanup_module()
        for boot in (FakeBoot("SIMULATED-BOOT", 123456789), FakeBoot("NEXT-BOOT", 223456789)):
            identity = FakeIdentity(os.getpid(), boot, 987654321)
            with mock.patch.object(self.lifecycle, "process_birth_identity_record", return_value=identity), \
                 mock.patch.object(self.lifecycle, "load_retired_cleanup_module", return_value=cleanup), \
                 mock.patch.object(cleanup, "remove_retired_artifacts", side_effect=AssertionError("must not inspect")):
                summary = self.lifecycle.sweep_retired_sessions(self.state_dir)
            self.assertEqual(1, summary["retained_persistent"])
            self.assertEqual(0, summary["removed"])
        self.assertTrue(Path(first.user_data_dir).is_dir())
        self.assertTrue(Path(first.runtime_path).is_dir())
        retired = self.lifecycle.replay_state(self.history()).retired[first.session_id]
        with self.assertRaisesRegex(cleanup.CleanupBlocked, "explicitly approved"):
            cleanup.remove_retired_artifacts(retired, None, lambda _: self.fail("listener inspection"))
        removal = self.lifecycle.managed_base_record(first, "managed_artifacts_removed")
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "cannot be swept"):
            self.lifecycle.replay_state([*self.history(), removal])

    def test_persistent_metadata_cannot_change_and_runtime_cannot_overlap_saved_profiles(self):
        first = self.prepare(profile_name="upwork")
        records = self.history()
        changed = dict(records[-1], profile_name="different")
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "profile_name changed"):
            self.lifecycle.replay([records[0], changed])
        self.close_fixture(first)
        for path in (Path(first.user_data_dir), Path(first.user_data_dir) / "runtime", self.state_dir / "profiles"):
            with self.assertRaisesRegex(self.lifecycle.LifecycleError, "overlap"):
                self.prepare(runtime_path=path)

    def test_invalid_managed_arguments_have_no_side_effects(self) -> None:
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "namespace"):
            self.lifecycle.prepare_managed_session(
                owner_thread_id=OWNER,
                workspace=self.workspace,
                namespace="Bad Namespace",
                short_daemon_name="ab-test",
                runtime_path=self.root / "runtime",
                cdp_port=self.free_port(),
                build_digest="sha256:" + "a" * 64,
                config_digest="sha256:" + "b" * 64,
                state_dir=self.state_dir,
            )
        self.assertFalse(self.state_dir.exists())

    def test_mixed_replay_is_pure_and_marks_legacy_unverified(self) -> None:
        legacy = {
            "schema": "agent-browser-lifecycle/v1", "timestamp": "2026-09-07T00:00:00Z", "event": "claimed",
            "session_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "owner_thread_id": OWNER,
            "actor_thread_id": OWNER, "cdp_host": "127.0.0.1", "cdp_port": self.free_port(),
            "user_data_dir": str(self.root / "legacy-profile"), "browser_pid": None, "workspace": str(self.workspace),
        }
        prepared = self.prepare()
        before = sorted(str(path.relative_to(self.root)) for path in self.root.rglob("*"))
        sessions = self.lifecycle.replay([legacy, *self.history()])
        view = self.lifecycle.current_view(sessions)
        after = sorted(str(path.relative_to(self.root)) for path in self.root.rglob("*"))
        self.assertEqual(before, after)
        self.assertEqual("agent-browser-current/v2", view["schema"])
        self.assertEqual("legacy-unverified", next(s for s in view["sessions"] if s["session_id"] == legacy["session_id"])["verification"])
        self.assertEqual("managed-unverified", next(s for s in view["sessions"] if s["session_id"] == prepared.session_id)["verification"])

    def test_launch_role_records_identity_before_release_without_argv_or_env(self) -> None:
        prepared = self.prepare()
        marker = self.root / "role-ran.json"
        child = self.lifecycle.launch_managed_role(
            session_id=prepared.session_id,
            role="chrome",
            argv=[sys.executable, "-c", f"from pathlib import Path; Path({str(marker)!r}).write_text('ran', encoding='utf-8')"],
            state_dir=self.state_dir,
            identity_provider=self.fake_identity,
        )
        self.assertEqual(0, child.wait(timeout=10))
        self.assertEqual("ran", marker.read_text(encoding="utf-8"))
        events = [record["event"] for record in self.history()]
        self.assertLess(events.index("managed_role_identity"), events.index("managed_role_release"))
        serialized = json.dumps(self.history())
        self.assertNotIn("role-ran", serialized)
        self.assertNotIn("Path(", serialized)

    def test_artifact_boot_uses_injected_identity_provider(self) -> None:
        prepared = self.prepare()
        runtime_stat = Path(prepared.runtime_path).stat()
        runtime_identity = self.lifecycle.ProfileIdentityRecord(
            path=prepared.runtime_path,
            device=runtime_stat.st_dev,
            inode=runtime_stat.st_ino,
        )

        def fake_profile_identity(path: Path):
            if str(path) == prepared.user_data_dir:
                return prepared.profile_identity
            if str(path) == prepared.runtime_path:
                return runtime_identity
            raise AssertionError(f"unexpected profile identity path {path}")

        with mock.patch.object(self.lifecycle, "profile_identity_record", side_effect=fake_profile_identity), \
             mock.patch.object(self.lifecycle, "load_process_identity_module", side_effect=AssertionError("real process identity helper should not load")):
            child = self.lifecycle.launch_managed_role(
                session_id=prepared.session_id,
                role="chrome",
                argv=[sys.executable, "-c", "pass"],
                state_dir=self.state_dir,
                identity_provider=self.fake_identity,
            )

        self.assertEqual(0, child.wait(timeout=10))
        artifacts = next(record for record in self.history() if record["event"] == "managed_artifacts_recorded")
        self.assertEqual({"session_uuid": "SIMULATED-BOOT", "boot_time_us": 123456789}, artifacts["artifact_boot"])

    def test_no_retry_after_recorded_identity_or_release(self) -> None:
        prepared = self.prepare()
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "injected failure after role identity record"):
            self.lifecycle.launch_managed_role(session_id=prepared.session_id, role="daemon", argv=[sys.executable, "-c", "raise SystemExit(99)"], state_dir=self.state_dir, identity_provider=self.fake_identity, fail_after="identity-record")
        events = [record["event"] for record in self.history()]
        self.assertIn("managed_role_identity", events)
        self.assertIn("cleanup_pending", events)
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "cleanup-pending"):
            self.lifecycle.launch_managed_role(session_id=prepared.session_id, role="daemon", argv=[sys.executable, "-c", "raise SystemExit(88)"], state_dir=self.state_dir, identity_provider=self.fake_identity)

    def test_failure_injection_barriers_keep_claims_and_mark_cleanup_pending(self) -> None:
        for barrier in ("profile-create", "profile-record"):
            with self.subTest(barrier=barrier):
                self.state_dir = self.root / f"state-{barrier}"
                with self.assertRaisesRegex(self.lifecycle.LifecycleError, "injected failure"):
                    self.prepare(fail_after=barrier)
                records = [json.loads(line) for line in (self.state_dir / "lifecycle.jsonl").read_text(encoding="utf-8").splitlines()]
                self.assertEqual("managed_intent", records[0]["event"])
                self.assertEqual("cleanup_pending", records[-1]["event"])

    def test_parent_pipe_eof_exits_without_exec_after_parent_death(self) -> None:
        marker = self.root / "should-not-exist"
        fixture = self.root / "parent_exit_fixture.py"
        fixture.write_text(textwrap.dedent(f"""
            import json, os, subprocess, sys
            reader, writer = os.pipe()
            os.set_inheritable(reader, True)
            os.set_inheritable(writer, False)
            child = subprocess.Popen([sys.executable, {str(COMMAND)!r}, "_child-bootstrap", str(reader), json.dumps([sys.executable, "-c", "from pathlib import Path; Path({str(marker)!r}).write_text('bad', encoding='utf-8')"])], pass_fds=(reader,), close_fds=True)
            os.close(reader)
            os.write(1, str(child.pid).encode() + b"\\n")
            os._exit(0)
        """), encoding="utf-8")
        parent = subprocess.run([sys.executable, str(fixture)], text=True, capture_output=True, check=True)
        child_pid = int(parent.stdout.strip())
        for _ in range(50):
            ps = subprocess.run(["ps", "-p", str(child_pid)], capture_output=True)
            if ps.returncode != 0:
                break
            time.sleep(0.1)
        self.assertFalse(marker.exists())

    def test_all_launch_barriers_and_journal_failure_prevent_exec(self) -> None:
        for barrier in ("identity-inspect", "identity-record", "release-record", "journal"):
            with self.subTest(barrier=barrier):
                self.state_dir = self.root / f"state-{barrier}"
                prepared = self.prepare()
                marker = self.root / f"{barrier}-payload"
                patcher = mock.patch.object(self.lifecycle, "append_record", side_effect=OSError("journal failed")) if barrier == "journal" else mock.patch.object(self.lifecycle, "append_record", wraps=self.lifecycle.append_record)
                with patcher:
                    with self.assertRaises((self.lifecycle.LifecycleError, OSError)):
                        self.lifecycle.launch_managed_role(session_id=prepared.session_id, role="chrome", argv=[sys.executable, "-c", f"open({str(marker)!r}, 'w').close()"], state_dir=self.state_dir, identity_provider=self.fake_identity, fail_after=None if barrier == "journal" else barrier)
                self.assertFalse(marker.exists())
                if barrier != "journal":
                    self.assertEqual("cleanup_pending", self.history()[-1]["event"])
                if barrier in {"identity-inspect", "identity-record", "journal"}:
                    self.assertNotIn("managed_role_release", [record["event"] for record in self.history()])

    def test_cleanup_pending_blocks_other_role_and_legacy_records(self) -> None:
        prepared = self.prepare()
        self.lifecycle.record_cleanup_pending(self.state_dir, prepared.session_id, "test failure")
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "cleanup-pending"):
            self.lifecycle.launch_managed_role(session_id=prepared.session_id, role="daemon", argv=[sys.executable, "-c", "pass"], state_dir=self.state_dir, identity_provider=self.fake_identity)
        env = dict(os.environ, XDG_STATE_HOME=str(self.root / "state"))
        result = subprocess.run([str(COMMAND), "record", "ready", "--session-id", prepared.session_id, "--actor-thread-id", OWNER, "--browser-pid", "123"], env=env, capture_output=True, text=True)
        self.assertEqual(2, result.returncode)
        self.assertIn("managed sessions", result.stderr)

    def test_replaced_profile_prevents_process_creation(self) -> None:
        prepared = self.prepare()
        profile = Path(prepared.user_data_dir)
        profile.rename(profile.with_name("original"))
        profile.mkdir()
        with mock.patch.object(self.lifecycle.subprocess, "Popen") as spawn:
            with self.assertRaisesRegex(self.lifecycle.LifecycleError, "profile identity changed"):
                self.lifecycle.launch_managed_role(session_id=prepared.session_id, role="chrome", argv=[sys.executable, "-c", "pass"], state_dir=self.state_dir, identity_provider=self.fake_identity)
        spawn.assert_not_called()

    @unittest.skipUnless(sys.platform == "darwin", "real process birth identity requires macOS")
    def test_real_birth_identity_survives_exec_and_gate_reader_is_closed(self) -> None:
        prepared = self.prepare()
        marker = self.root / "real-child"
        code = "import sys,os,json,fcntl; sys.path.insert(0, %r); import process_identity; from dataclasses import asdict; fds=[]\nfor fd in range(3,256):\n try: fcntl.fcntl(fd,fcntl.F_GETFD); fds.append(fd)\n except OSError: pass\nopen(%r,'w').write(json.dumps({'identity':asdict(process_identity.process_identity(os.getpid())), 'fds':fds}))" % (str(ROOT / "amp" / "agent-browser-lifecycle"), str(marker))
        child = self.lifecycle.launch_managed_role(session_id=prepared.session_id, role="chrome", argv=[sys.executable, "-c", code], state_dir=self.state_dir)
        self.assertEqual(0, child.wait(timeout=10))
        report = json.loads(marker.read_text())
        birth = self.history()[2]["birth_identity"]
        self.assertEqual(birth["pid"], report["identity"]["pid"])
        self.assertEqual(birth["start_time_us"], report["identity"]["start_time_us"])
        self.assertEqual(birth["boot"], report["identity"]["boot"])
        self.assertNotIn(2, report["fds"])

    def test_global_lock_is_free_during_identity_inspection(self) -> None:
        import fcntl
        prepared = self.prepare()
        def inspect(pid):
            with (self.state_dir / "lifecycle.lock").open("r+") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                fcntl.flock(lock, fcntl.LOCK_UN)
            return self.fake_identity(pid)
        child = self.lifecycle.launch_managed_role(session_id=prepared.session_id, role="chrome", argv=[sys.executable, "-c", "pass"], state_dir=self.state_dir, identity_provider=inspect)
        self.assertEqual(0, child.wait(timeout=10))

    def test_intent_failure_creates_no_profile(self) -> None:
        with mock.patch.object(self.lifecycle, "write_current", side_effect=OSError("view failed")):
            with self.assertRaises(OSError):
                self.prepare()
        records = self.history()
        self.assertEqual("managed_intent", records[0]["event"])
        self.assertFalse(Path(records[0]["user_data_dir"]).exists())

    def test_fsync_failure_prevents_release_even_with_complete_record(self) -> None:
        prepared = self.prepare()
        marker = self.root / "fsync-payload"
        with mock.patch.object(self.lifecycle.os, "fsync", side_effect=OSError("disk failed")):
            with self.assertRaises(OSError):
                self.lifecycle.launch_managed_role(session_id=prepared.session_id, role="chrome", argv=[sys.executable, "-c", f"open({str(marker)!r}, 'w').close()"], state_dir=self.state_dir, identity_provider=self.fake_identity)
        self.assertFalse(marker.exists())
        self.assertNotIn("managed_role_release", [r["event"] for r in self.history()])

    def test_replay_rejects_launch_after_cleanup_pending(self) -> None:
        prepared = self.prepare()
        self.lifecycle.record_cleanup_pending(self.state_dir, prepared.session_id, "test failure")
        event = dict(self.history()[1])
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "cleanup-pending"):
            self.lifecycle.replay([*self.history(), event])

    def test_concurrent_role_launch_is_admitted_once(self) -> None:
        from concurrent.futures import ThreadPoolExecutor
        prepared = self.prepare()
        def launch(_):
            try:
                child = self.lifecycle.launch_managed_role(session_id=prepared.session_id, role="chrome", argv=[sys.executable, "-c", "pass"], state_dir=self.state_dir, identity_provider=self.fake_identity)
                return child.wait(timeout=10)
            except Exception:
                return "refused"
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(launch, range(2)))
        self.assertCountEqual([0, "refused"], outcomes)
        self.assertEqual(1, sum(1 for r in self.history() if r["event"] == "managed_role_release"))

    def test_exec_child_does_not_hold_lifecycle_or_operation_locks(self) -> None:
        prepared = self.prepare()
        report = self.root / "lock-report.json"
        parent_returned = self.root / "parent-returned"
        code = textwrap.dedent(f"""
            import fcntl, json, os, time
            deadline = time.monotonic() + 5
            while not os.path.exists({str(parent_returned)!r}):
                if time.monotonic() > deadline: raise SystemExit(1)
                time.sleep(0.01)
            paths = [{str(self.state_dir / 'lifecycle.lock')!r}, {str(self.state_dir / 'operation-locks' / (prepared.session_id + '.lock'))!r}]
            results = []
            for path in paths:
                fd = os.open(path, os.O_RDWR)
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB); results.append(True); fcntl.flock(fd, fcntl.LOCK_UN)
                except BlockingIOError:
                    results.append(False)
                finally:
                    os.close(fd)
            with open({str(report)!r}, 'w', encoding='utf-8') as handle: json.dump(results, handle)
        """)
        child = self.lifecycle.launch_managed_role(session_id=prepared.session_id, role="chrome", argv=[sys.executable, "-c", code], state_dir=self.state_dir, identity_provider=self.fake_identity)
        parent_returned.touch()
        self.assertEqual(0, child.wait(timeout=10))
        self.assertEqual([True, True], json.loads(report.read_text(encoding="utf-8")))

    def test_json_schema_accepts_v2_and_rejects_secret_argv_field(self) -> None:
        jsonschema = __import__("jsonschema")
        prepared = self.prepare()
        schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
        record = self.history()[0]
        jsonschema.Draft202012Validator(schema).validate(record)
        current = self.lifecycle.write_current(self.state_dir / "current.json", self.lifecycle.replay(self.history()))
        jsonschema.Draft202012Validator(schema).validate(current)
        bad = dict(record, secret="argv")
        with self.assertRaises(jsonschema.ValidationError):
            jsonschema.Draft202012Validator(schema).validate(bad)
        self.assertEqual(prepared.session_id, current["sessions"][0]["session_id"])

    def test_managed_ready_event_updates_current_view_and_schema(self) -> None:
        jsonschema = __import__("jsonschema")
        prepared = self.prepare()
        for role in ("chrome", "daemon"):
            child = self.lifecycle.launch_managed_role(session_id=prepared.session_id, role=role, argv=[sys.executable, "-c", "pass"], state_dir=self.state_dir, identity_provider=self.fake_identity)
            self.assertEqual(0, child.wait(timeout=10))
        ready = self.lifecycle.append_managed_ready(self.state_dir, prepared.session_id, "build-1")
        current = self.lifecycle.current_view(self.lifecycle.replay(self.history()))
        session = current["sessions"][0]
        self.assertIsInstance(session["chrome_pid"], int)
        self.assertIsInstance(session["daemon_pid"], int)
        self.assertEqual("ready", session["state"])
        self.assertEqual("managed-ready", session["verification"])
        schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
        jsonschema.Draft202012Validator(schema).validate(ready)
        jsonschema.Draft202012Validator(schema).validate(current)

    def test_config_snapshot_allows_default_merged_stage4_shape(self) -> None:
        home = self.root / "home"
        config_dir = home / ".agent-browser"
        config_dir.mkdir(parents=True)
        plugin = ROOT / "bin" / "agent-browser-plugin-onepassword"
        config_path = config_dir / "config.json"
        config = {"maxOutput": 50000, "autoConnect": False, "contentBoundaries": False, "headed": False, "plugins": [{"name": "onepassword", "command": str(plugin), "capabilities": ["credential.read"]}]}
        config_path.write_text(json.dumps(config), encoding="utf-8")
        with mock.patch.dict(os.environ, {"HOME": str(home)}, clear=True):
            data = self.lifecycle.validate_and_snapshot_config(self.workspace.resolve(), self.root / "runtime")
        self.assertTrue(Path(data.snapshot_path).is_file())
        self.assertTrue(data.config_digest.startswith("sha256:"))
        self.assertEqual(False, json.loads(Path(data.snapshot_path).read_text())["autoConnect"])
        bad_cases = [({"maxOutput": 1, "autoConnect": False, "plugins": [], "extra": True}, "unsupported config keys"), ({"headed": "yes"}, "headed to be false"), ({"$schema": 1}, "schema to be a string")]
        for bad_fragment, message in bad_cases:
            with self.subTest(bad_fragment=bad_fragment):
                config_path.write_text(json.dumps({"maxOutput": 50000, "autoConnect": False, "plugins": [], **bad_fragment}), encoding="utf-8")
                with mock.patch.dict(os.environ, {"HOME": str(home)}, clear=True):
                    with self.assertRaisesRegex(self.lifecycle.LifecycleError, message):
                        self.lifecycle.validate_and_snapshot_config(self.workspace.resolve(), self.root / "runtime-bad")

    def test_projected_onepassword_plugin_path_is_accepted(self) -> None:
        home = self.root / "home-projected"
        amp_config = home / ".config" / "amp"
        config_dir = home / ".agent-browser"
        config_dir.mkdir(parents=True)
        projected_plugin = amp_config / "bin" / "agent-browser-plugin-onepassword"
        projected_plugin.parent.mkdir(parents=True)
        projected_plugin.write_text("#!/bin/sh\n", encoding="utf-8")
        config_path = config_dir / "config.json"
        config_path.write_text(json.dumps({"$schema": "https://agent-browser.dev/schema.json", "maxOutput": 50000, "autoConnect": False, "plugins": [{"name": "onepassword", "command": str(projected_plugin), "capabilities": ["credential.read"]}]}), encoding="utf-8")
        with mock.patch.dict(os.environ, {"HOME": str(home), "AMP_CONFIG_DIR": str(amp_config)}, clear=True):
            config = self.lifecycle.validate_and_snapshot_config(self.workspace.resolve(), self.root / "runtime-projected")
        self.assertEqual(str(projected_plugin), config.data["plugins"][0]["command"])

    def test_rejects_dangerous_inherited_agent_browser_environment(self) -> None:
        with mock.patch.dict(os.environ, {"AGENT_BROWSER_CDP": "http://127.0.0.1:1"}, clear=True):
            with self.assertRaisesRegex(self.lifecycle.LifecycleError, "AGENT_BROWSER_CDP"):
                self.lifecycle.reject_dangerous_inherited_env()
        with mock.patch.dict(os.environ, {"AGENT_BROWSER_CUSTOM_INSTALL_DIR": "/tmp/install"}, clear=True):
            self.lifecycle.reject_dangerous_inherited_env()

    def test_exec_argv_allows_real_native_commands_and_rejects_reserved_flags(self) -> None:
        for argv in (["open", "https://example.com"], ["screenshot", "--screenshot-format", "jpeg"], ["wait", "--text", "Ready"], ["press", "Enter"], ["scroll", "down", "300", "--selector", "main"], ["tab", "new", "--label", "docs", "https://example.com"], ["auth", "login", "github", "--credential-provider", "onepassword", "--item", "GitHub"], ["eval", "() => '--cdp is just text'"], ["fill", "#notes", "batch script --cdp text"]):
            self.lifecycle.validate_exec_argv(argv)
        for argv, message in [(["open", "--cdp", "http://127.0.0.1:1", "https://example.com"], "--cdp"), (["auth", "login", "github", "--provider", "onepassword"], "--provider"), (["--engine", "lightpanda", "open", "https://example.com"], "--engine"), (["batch", "--json"], "batch")]:
            with self.assertRaisesRegex(self.lifecycle.LifecycleError, message):
                self.lifecycle.validate_exec_argv(argv)

    def test_clean_runtime_env_sets_daemon_flag_only_for_daemon_launch(self) -> None:
        runtime = self.lifecycle.ManagedRuntimeIdentity(str(ROOT / "bin" / "agent-browser"), str(self.root / "agent-browser"), str(self.root / "install"), "0.36.0+rfc0011.3", "sha256:" + "a" * 64)
        env = self.lifecycle.clean_runtime_env(runtime, "ab-test", "http://127.0.0.1:1", self.root / "runtime")
        daemon_env = self.lifecycle.clean_runtime_env(runtime, "ab-test", "http://127.0.0.1:1", self.root / "runtime", daemon=True)
        self.assertNotIn("AGENT_BROWSER_DAEMON", env)
        self.assertEqual("1", daemon_env["AGENT_BROWSER_DAEMON"])

    def test_native_build_id_comes_from_installed_binary(self) -> None:
        binary = self.root / "agent-browser"
        with mock.patch.object(self.lifecycle.subprocess, "run", return_value=subprocess.CompletedProcess([str(binary), "--managed-build-id"], 0, stdout="0.36.0+abc123\n", stderr="")) as run:
            build_id = self.lifecycle.native_daemon_build_id(binary)
        self.assertEqual("0.36.0+abc123", build_id)
        run.assert_called_once_with([str(binary), "--managed-build-id"], text=True, capture_output=True, check=True)

    def test_socket_peer_pid_inspection_fails_closed_when_unavailable(self) -> None:
        preparation = self.prepare()
        socket_path = Path(preparation.runtime_path) / f"{preparation.short_daemon_name}.sock"
        socket_path.parent.mkdir(parents=True, exist_ok=True)
        socket_path.touch()
        fake_socket = mock.MagicMock()
        fake_socket.__enter__.return_value = fake_socket
        with mock.patch.object(self.lifecycle.socket, "socket", return_value=fake_socket), mock.patch.object(self.lifecycle.sys, "platform", "linux"), mock.patch.object(self.lifecycle.socket, "LOCAL_PEERPID", None, create=True):
            with self.assertRaisesRegex(self.lifecycle.LifecycleError, "peer PID inspection is unavailable"):
                self.lifecycle.send_daemon_json(preparation, {"action": "managed_status"}, expected_peer_pid=123)

    def test_daemon_tcp_listener_check_uses_lsof_and_fails_closed(self) -> None:
        clean = subprocess.CompletedProcess(["lsof"], 1, stdout="", stderr="")
        preparation = self.prepare()
        with mock.patch.object(self.lifecycle.subprocess, "run", return_value=clean) as run:
            self.lifecycle.check_no_daemon_stream(preparation, 123)
        run.assert_called_once_with(["lsof", "-nP", "-a", "-p", "123", "-iTCP", "-sTCP:LISTEN"], text=True, capture_output=True, check=False)
        listener = subprocess.CompletedProcess(["lsof"], 0, stdout="COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\ndaemon 123 me 7u IPv4 0t0 TCP 127.0.0.1:5555 (LISTEN)\n", stderr="")
        with mock.patch.object(self.lifecycle.subprocess, "run", return_value=listener):
            with self.assertRaisesRegex(self.lifecycle.LifecycleError, "TCP listener"):
                self.lifecycle.check_no_daemon_stream(preparation, 123)

    def test_stop_and_recover_mark_cleanup_pending_without_signals(self) -> None:
        import fcntl
        prepared = self.prepare()
        def cleanup_child(child):
            if child.poll() is None:
                child.kill()
                child.wait(timeout=10)

        for role in ("chrome", "daemon"):
            child = self.lifecycle.launch_managed_role(session_id=prepared.session_id, role=role, argv=[sys.executable, "-c", "import time; time.sleep(0.2)"], state_dir=self.state_dir, identity_provider=self.fake_identity)
            self.addCleanup(cleanup_child, child)
        self.lifecycle.append_managed_ready(self.state_dir, prepared.session_id, "build-1")
        def send_with_locked_operation(*args, **kwargs):
            with (self.state_dir / "operation-locks" / f"{prepared.session_id}.lock").open("r+") as lock:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return None, "shutdown unavailable"
        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir), mock.patch.object(self.lifecycle, "attempt_verified_shutdown", side_effect=send_with_locked_operation), mock.patch.object(self.lifecycle, "wait_for_managed_closure", return_value=["chrome process is still running"]), mock.patch.object(self.lifecycle.os, "kill") as kill:
            stopped = self.lifecycle.command_stop(argparse.Namespace(session_id=prepared.session_id, owner_thread_id=OWNER))
            recovered = self.lifecycle.command_recover_managed(argparse.Namespace(session_id=prepared.session_id, owner_thread_id=OWNER))
        self.assertEqual("cleanup-pending", stopped["state"])
        self.assertEqual("cleanup-pending", recovered["state"])
        self.assertGreaterEqual(len(stopped["pending_reasons"]), 1)
        kill.assert_not_called()

    def test_stop_records_cleanup_pending_before_identity_failure(self) -> None:
        prepared = self.ready_session()
        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir), mock.patch.object(self.lifecycle, "attempt_verified_shutdown", return_value=(None, "identity failed")), mock.patch.object(self.lifecycle, "wait_for_managed_closure", return_value=["identity failed"]), mock.patch.object(self.lifecycle, "send_daemon_json") as send:
            result = self.lifecycle.command_stop(argparse.Namespace(session_id=prepared.session_id, owner_thread_id=OWNER))
        self.assertIn("cleanup-pending", result["state"])
        self.assertIn("identity failed", result["shutdown_error"])
        self.assertEqual("cleanup_pending", self.history()[-1]["event"])
        send.assert_not_called()

    def test_exec_holds_operation_lock_across_subprocess_effect(self) -> None:
        import fcntl
        session_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        session = {"session_id": session_id, "generation": 1, "owner_thread_id": OWNER, "workspace": str(self.workspace), "namespace": "ab-testns", "short_daemon_name": "ab-test", "runtime_path": str(self.root / "runtime"), "launch_mode": "headless", "cdp_host": "127.0.0.1", "cdp_port": 12345, "user_data_dir": str(self.root / "profile"), "profile_identity": {"path": str(self.root / "profile"), "device": 1, "inode": 2}, "build_digest": "sha256:" + "a" * 64, "config_digest": "sha256:" + "b" * 64, "roles": {"daemon": {"birth_identity": {"pid": 123}}, "chrome": {"birth_identity": {"pid": 456}}}}
        runtime = self.lifecycle.ManagedRuntimeIdentity(str(ROOT / "bin" / "agent-browser"), str(self.root / "agent-browser"), str(self.root / "install"), "0.36.0+rfc0011.3", "sha256:" + "a" * 64)
        def run_with_locked_operation(*args, **kwargs):
            with (self.state_dir / "operation-locks" / f"{session_id}.lock").open("r+") as lock:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return subprocess.CompletedProcess(args[0], 0, stdout="ok", stderr="")
        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir), mock.patch.object(self.lifecycle, "assert_managed_ready", return_value=session), mock.patch.object(self.lifecycle, "verify_custom_runtime", return_value=runtime), mock.patch.object(self.lifecycle, "verify_ready_integrity", return_value=session), mock.patch.object(self.lifecycle, "wait_for_daemon", return_value={"success": True}), mock.patch.object(self.lifecycle.subprocess, "run", side_effect=run_with_locked_operation):
            result = self.lifecycle.command_exec(argparse.Namespace(session_id=session_id, actor_thread_id=OWNER, argv=["snapshot"]))
        self.assertEqual("ok", result["stdout"])

    def test_process_absence_checks_do_not_treat_inspection_error_or_pid_reuse_as_gone(self) -> None:
        saved = {"boot": {"session_uuid": "SIMULATED-BOOT", "boot_time_us": 123456789}, "pid": 123, "start_time_us": 987654444}
        with mock.patch.object(self.lifecycle, "optional_process_birth_identity_record", return_value=None):
            self.assertIsNone(self.lifecycle.recorded_process_status(saved, "chrome"))
        with mock.patch.object(self.lifecycle, "optional_process_birth_identity_record", side_effect=self.lifecycle.LifecycleError("kernel inspection failed")):
            self.assertIn("inspection failed", self.lifecycle.recorded_process_status(saved, "chrome"))
        with mock.patch.object(self.lifecycle, "optional_process_birth_identity_record", return_value=self.lifecycle.ProcessBirthIdentityRecord(self.lifecycle.BootIdentityRecord("SIMULATED-BOOT", 123456789), 124, 987654445)):
            self.assertEqual("chrome PID was reused or identity changed", self.lifecycle.recorded_process_status(saved, "chrome"))

    def test_daemon_socket_absence_is_limited_to_missing_or_refused_errors(self) -> None:
        preparation = self.prepare()
        socket_path = Path(preparation.runtime_path) / f"{preparation.short_daemon_name}.sock"
        socket_path.parent.mkdir(parents=True, exist_ok=True)
        socket_path.touch()
        for err in (FileNotFoundError(self.lifecycle.errno.ENOENT, "missing"), ConnectionRefusedError(self.lifecycle.errno.ECONNREFUSED, "refused")):
            fake_socket = mock.MagicMock()
            fake_socket.__enter__.return_value = fake_socket
            fake_socket.connect.side_effect = err
            with mock.patch.object(self.lifecycle.socket, "socket", return_value=fake_socket):
                self.assertIsNone(self.lifecycle.daemon_socket_pending_reason(preparation, 123))
        fake_socket = mock.MagicMock()
        fake_socket.__enter__.return_value = fake_socket
        fake_socket.connect.side_effect = TimeoutError("timed out")
        with mock.patch.object(self.lifecycle.socket, "socket", return_value=fake_socket):
            self.assertIn("inspection failed", self.lifecycle.daemon_socket_pending_reason(preparation, 123))

    def test_lsof_any_listener_pids_fails_closed_on_errors_and_unknown_output(self) -> None:
        busy = subprocess.CompletedProcess(["lsof"], 0, stdout="111\n222\n", stderr="")
        clean = subprocess.CompletedProcess(["lsof"], 1, stdout="", stderr="")
        failed = subprocess.CompletedProcess(["lsof"], 2, stdout="", stderr="permission denied")
        unknown = subprocess.CompletedProcess(["lsof"], 0, stdout="not-a-pid\n", stderr="")
        with mock.patch.object(self.lifecycle.subprocess, "run", return_value=busy):
            self.assertEqual({111, 222}, self.lifecycle.lsof_any_listener_pids(4567))
        with mock.patch.object(self.lifecycle.subprocess, "run", return_value=clean):
            self.assertEqual(set(), self.lifecycle.lsof_any_listener_pids(4567))
        for result in (failed, unknown):
            with mock.patch.object(self.lifecycle.subprocess, "run", return_value=result):
                with self.assertRaisesRegex(self.lifecycle.LifecycleError, "could not inspect TCP"):
                    self.lifecycle.lsof_any_listener_pids(4567)

    def test_managed_closure_pending_reasons_verify_profile_identity(self) -> None:
        prepared = self.prepare()
        session = self.live_session(prepared.session_id)
        profile = Path(prepared.user_data_dir)
        profile.rename(profile.with_name("original"))
        profile.mkdir()
        with mock.patch.object(self.lifecycle, "lsof_any_listener_pids", return_value=set()), mock.patch.object(self.lifecycle, "daemon_socket_pending_reason", return_value=None):
            reasons = self.lifecycle.managed_closure_pending_reasons(session)
        self.assertIn("profile identity no longer matches", reasons)

    def test_missing_identity_before_release_is_noop_but_after_release_is_pending(self) -> None:
        prepared = self.prepare()
        session = self.live_session(prepared.session_id)
        with mock.patch.object(self.lifecycle, "lsof_any_listener_pids", return_value=set()), mock.patch.object(self.lifecycle, "daemon_socket_pending_reason", return_value=None):
            self.assertEqual([], self.lifecycle.managed_closure_pending_reasons(session))
            session["roles"]["chrome"]["released"] = True
            self.assertIn("chrome identity is missing", self.lifecycle.managed_closure_pending_reasons(session))

    def test_pending_recovery_closes_without_deleting_profile_or_retaining_claim(self) -> None:
        from jsonschema import Draft202012Validator

        prepared = self.ready_session()
        self.lifecycle.record_cleanup_pending(self.state_dir, prepared.session_id, "previous shutdown")
        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir), \
             mock.patch.object(self.lifecycle, "optional_process_birth_identity_record", return_value=None), \
             mock.patch.object(self.lifecycle, "lsof_any_listener_pids", return_value=set()), \
             mock.patch.object(self.lifecycle, "send_daemon_json") as send:
            result = self.lifecycle.command_recover_managed(argparse.Namespace(session_id=prepared.session_id, owner_thread_id=OWNER))
        self.assertEqual("closed", result["state"])
        self.assertTrue(Path(prepared.user_data_dir).is_dir())
        self.assertEqual("managed_closed", self.history()[-1]["event"])
        self.assertEqual([], self.lifecycle.current_view(self.lifecycle.replay(self.history()))["sessions"])
        Draft202012Validator(json.loads(SCHEMA.read_text())).validate(self.history()[-1])
        replacement = self.prepare(cdp_port=prepared.cdp_port, runtime_path=self.root / "replacement-runtime")
        self.assertNotEqual(prepared.session_id, replacement.session_id)
        send.assert_not_called()

    def test_lost_shutdown_response_does_not_block_verified_closure(self) -> None:
        prepared = self.ready_session()
        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir), \
             mock.patch.object(self.lifecycle, "attempt_verified_shutdown", return_value=(None, "response lost")), \
             mock.patch.object(self.lifecycle, "optional_process_birth_identity_record", return_value=None), \
             mock.patch.object(self.lifecycle, "lsof_any_listener_pids", return_value=set()):
            result = self.lifecycle.command_stop(argparse.Namespace(session_id=prepared.session_id, owner_thread_id=OWNER))
        self.assertEqual("closed", result["state"])
        self.assertEqual("response lost", result["shutdown_error"])
        self.assertNotIn(prepared.session_id, self.lifecycle.replay(self.history()))

    def test_repeated_closed_stop_and_recover_are_idempotent_and_verify_owner(self) -> None:
        prepared = self.ready_session()
        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir), mock.patch.object(self.lifecycle, "attempt_verified_shutdown", return_value=(None, None)), mock.patch.object(self.lifecycle, "wait_for_managed_closure", return_value=[]):
            first = self.lifecycle.command_stop(argparse.Namespace(session_id=prepared.session_id, owner_thread_id=OWNER))
        before = self.history()
        with mock.patch.object(self.lifecycle, "lifecycle_dir", return_value=self.state_dir), mock.patch.object(self.lifecycle, "attempt_verified_shutdown") as shutdown:
            second = self.lifecycle.command_stop(argparse.Namespace(session_id=prepared.session_id, owner_thread_id=OWNER))
            recovered = self.lifecycle.command_recover_managed(argparse.Namespace(session_id=prepared.session_id, owner_thread_id=OWNER))
            with self.assertRaisesRegex(self.lifecycle.LifecycleError, "owner thread"):
                self.lifecycle.command_stop(argparse.Namespace(session_id=prepared.session_id, owner_thread_id="T-22222222-2222-2222-2222-222222222222"))
        self.assertEqual("closed", first["state"])
        self.assertEqual("closed", second["state"])
        self.assertEqual("closed", recovered["state"])
        self.assertEqual(before, self.history())
        shutdown.assert_not_called()


if __name__ == "__main__":
    unittest.main()
