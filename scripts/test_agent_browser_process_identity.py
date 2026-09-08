from __future__ import annotations

import importlib.util
import os
import platform
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "amp" / "agent-browser-lifecycle" / "process_identity.py"
SPEC = importlib.util.spec_from_file_location("process_identity", MODULE_PATH)
assert SPEC is not None
process_identity = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules["process_identity"] = process_identity
SPEC.loader.exec_module(process_identity)


BootIdentity = process_identity.BootIdentity
ProcessIdentity = process_identity.ProcessIdentity
ProcessSnapshot = process_identity.ProcessSnapshot


class ProcessIdentityTest(unittest.TestCase):
    def identity(
        self, pid: int, ppid: int = 1, start_time_us: int | None = None
    ) -> ProcessIdentity:
        return ProcessIdentity(
            pid=pid,
            boot=BootIdentity(session_uuid="boot-a", boot_time_us=1000),
            start_time_us=pid * 1_000_000 if start_time_us is None else start_time_us,
            ppid=ppid,
            uid=os.getuid(),
            name=f"process-{pid}",
        )

    @unittest.skipIf(platform.system() != "Darwin", "macOS libproc test")
    def test_current_process_identity_is_stable_and_microsecond_precise(self) -> None:
        first = process_identity.process_identity(os.getpid())
        second = process_identity.process_identity(os.getpid())

        self.assertIsNotNone(first)
        self.assertEqual(first, second)
        assert first is not None
        self.assertEqual(os.getpid(), first.pid)
        self.assertGreater(first.start_time_us, 1_000_000)
        self.assertIsInstance(first.start_time_us, int)
        self.assertGreater(first.boot.boot_time_us, 1_000_000)

    @unittest.skipIf(platform.system() != "Darwin", "macOS libproc test")
    def test_missing_process_identity_is_none(self) -> None:
        self.assertIsNone(process_identity.process_identity(99_999_999))

    def test_compare_process_identity_detects_simulated_pid_reuse(self) -> None:
        saved = self.identity(123, start_time_us=10)
        reused = replace(saved, start_time_us=20)

        original = process_identity.process_identity
        try:
            process_identity.process_identity = lambda pid: reused
            comparison = process_identity.compare_process_identity(saved)
        finally:
            process_identity.process_identity = original

        self.assertFalse(comparison.matches)
        self.assertEqual("process birth identity does not match", comparison.reason)
        self.assertEqual(reused, comparison.current)

    def test_compare_process_identity_reports_absence_distinctly(self) -> None:
        saved = self.identity(123)

        original = process_identity.process_identity
        try:
            process_identity.process_identity = lambda pid: None
            comparison = process_identity.compare_process_identity(saved)
        finally:
            process_identity.process_identity = original

        self.assertFalse(comparison.matches)
        self.assertEqual("process is absent", comparison.reason)
        self.assertIsNone(comparison.current)

    def test_inspection_unavailable_is_not_treated_as_absence(self) -> None:
        def unavailable(pid: int) -> ProcessIdentity | None:
            raise process_identity.ProcessInspectionError("inspection unavailable")

        original = process_identity.process_identity
        original_system = process_identity.platform.system
        try:
            process_identity.platform.system = lambda: "Darwin"
            process_identity.process_identity = unavailable
            snapshot = process_identity.process_snapshot([123])
        finally:
            process_identity.process_identity = original
            process_identity.platform.system = original_system

        self.assertFalse(snapshot.complete)
        self.assertEqual({123: "inspection unavailable"}, snapshot.unavailable_pids)
        self.assertEqual({}, snapshot.processes)

    def test_descendant_inventory_tracks_observed_process_tree(self) -> None:
        root = self.identity(10, ppid=1)
        child = self.identity(11, ppid=10)
        grandchild = self.identity(12, ppid=11)
        unrelated = self.identity(13, ppid=1)
        snapshot = ProcessSnapshot(
            processes={
                root.pid: root,
                child.pid: child,
                grandchild.pid: grandchild,
                unrelated.pid: unrelated,
            },
            unavailable_pids={},
            complete=True,
        )

        inventory = process_identity.descendants_for_roots([root], snapshot)

        self.assertTrue(inventory.uncertain)
        self.assertEqual({root.pid: root}, inventory.roots)
        self.assertEqual({child.pid: child, grandchild.pid: grandchild}, inventory.descendants)

    def test_descendant_inventory_is_conservative_when_parent_exited_first(self) -> None:
        root = self.identity(10, ppid=1)
        previously_observed_child = self.identity(11, ppid=10)
        snapshot = ProcessSnapshot(
            processes={previously_observed_child.pid: previously_observed_child},
            unavailable_pids={},
            complete=True,
        )

        inventory = process_identity.descendants_for_roots([root], snapshot)

        self.assertTrue(inventory.uncertain)
        self.assertEqual({}, inventory.roots)
        self.assertEqual({}, inventory.descendants)
        self.assertIn("unobserved or reparented helper", " ".join(inventory.limitations))

    def test_profile_identity_detects_directory_replacement(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            base = Path(temporary_directory).resolve()
            profile = base / "profile"
            profile.mkdir()
            saved = process_identity.profile_identity(profile)

            profile.rename(base / "original-profile")
            profile.mkdir()

            self.assertFalse(process_identity.compare_profile_identity(saved))

    def test_profile_identity_refuses_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            base = Path(temporary_directory).resolve()
            target = base / "target"
            target.mkdir()
            symlink = base / "profile-link"
            symlink.symlink_to(target, target_is_directory=True)

            with self.assertRaises(process_identity.UnsafeProfilePathError):
                process_identity.profile_identity(symlink)


if __name__ == "__main__":
    unittest.main()
