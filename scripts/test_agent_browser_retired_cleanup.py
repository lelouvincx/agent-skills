from __future__ import annotations

import importlib.util
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "amp" / "agent-browser-lifecycle" / "retired_cleanup.py"
SPEC = importlib.util.spec_from_file_location("retired_cleanup", MODULE_PATH)
assert SPEC is not None
retired_cleanup = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules["retired_cleanup"] = retired_cleanup
SPEC.loader.exec_module(retired_cleanup)


class RetiredCleanupTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.root = Path(self.temporary_directory.name).resolve()
        self.profile = self.root / "profile"
        self.runtime = self.root / "runtime"
        self.profile.mkdir()
        self.runtime.mkdir()
        (self.profile / "profile-file").write_text("profile", encoding="utf-8")
        (self.runtime / "runtime-file").write_text("runtime", encoding="utf-8")

    def identity(self, path: Path) -> dict[str, object]:
        stat_result = path.stat()
        return {"path": str(path), "device": stat_result.st_dev, "inode": stat_result.st_ino}

    def birth(self, boot_time_us: int, session_uuid: str | None = None) -> dict[str, object]:
        return {
            "boot": {"session_uuid": session_uuid, "boot_time_us": boot_time_us},
            "pid": 123,
            "start_time_us": 456,
        }

    def session(self, boot_time_us: int = 100, session_uuid: str | None = "old") -> dict[str, object]:
        return {
            "session_id": "retired-session",
            "artifact_boot": {"session_uuid": session_uuid, "boot_time_us": boot_time_us},
            "user_data_dir": str(self.profile),
            "runtime_path": str(self.runtime),
            "profile_identity": self.identity(self.profile),
            "runtime_identity": self.identity(self.runtime),
            "roles": {
                "chrome": {"birth_identity": self.birth(boot_time_us, session_uuid)},
                "daemon": {"birth_identity": self.birth(boot_time_us, session_uuid)},
            },
        }

    def current_boot(self, boot_time_us: int = 200, session_uuid: str | None = "current") -> dict[str, object]:
        return {"session_uuid": session_uuid, "boot_time_us": boot_time_us}

    def test_removes_profile_and_runtime_only_after_reboot(self) -> None:
        result = retired_cleanup.remove_retired_artifacts(
            self.session(), self.current_boot(), lambda session: False
        )

        self.assertEqual("removed", result)
        self.assertFalse(self.profile.exists())
        self.assertFalse(self.runtime.exists())

    def test_sync_failure_does_not_certify_removal_and_retry_syncs_missing_target(self) -> None:
        session = self.session()
        with mock.patch.object(retired_cleanup.os, "fsync", side_effect=OSError("sync failed")):
            with self.assertRaisesRegex(OSError, "sync failed"):
                retired_cleanup.remove_retired_artifacts(session, self.current_boot(), lambda session: False)
        with mock.patch.object(retired_cleanup.os, "fsync", wraps=retired_cleanup.os.fsync) as sync:
            result = retired_cleanup.remove_retired_artifacts(session, self.current_boot(), lambda session: False)
        self.assertEqual("removed", result)
        self.assertEqual(2, sync.call_count)

    def test_same_boot_awaits_reboot_without_listener_check_or_deletion(self) -> None:
        calls: list[dict[str, object]] = []
        result = retired_cleanup.remove_retired_artifacts(
            self.session(boot_time_us=200, session_uuid="current"),
            self.current_boot(boot_time_us=200, session_uuid="current"),
            lambda session: calls.append(session) or False,
        )

        self.assertEqual("awaiting-reboot", result)
        self.assertEqual([], calls)
        self.assertTrue(self.profile.exists())
        self.assertTrue(self.runtime.exists())

    def test_later_boot_identity_awaits_reboot_without_deletion(self) -> None:
        result = retired_cleanup.remove_retired_artifacts(
            self.session(boot_time_us=300, session_uuid="future"),
            self.current_boot(boot_time_us=200, session_uuid="current"),
            lambda session: False,
        )

        self.assertEqual("awaiting-reboot", result)
        self.assertTrue(self.profile.exists())
        self.assertTrue(self.runtime.exists())

    def test_listener_callback_runs_before_filesystem_effects_and_can_block(self) -> None:
        observed: list[tuple[bool, bool]] = []

        def check_listeners(session: dict[str, object]) -> bool:
            observed.append((self.profile.exists(), self.runtime.exists()))
            return True

        with self.assertRaises(retired_cleanup.CleanupBlocked):
            retired_cleanup.remove_retired_artifacts(
                self.session(), self.current_boot(), check_listeners
            )

        self.assertEqual([(True, True)], observed)
        self.assertTrue(self.profile.exists())
        self.assertTrue(self.runtime.exists())

    def test_verifies_both_identities_before_any_deletion(self) -> None:
        session = self.session()
        replaced_runtime = self.root / "replaced-runtime"
        self.runtime.rename(replaced_runtime)
        self.runtime.mkdir()

        with self.assertRaises(retired_cleanup.CleanupBlocked):
            retired_cleanup.remove_retired_artifacts(
                session, self.current_boot(), lambda session: False
            )

        self.assertTrue(self.profile.exists())
        self.assertTrue(self.runtime.exists())
        self.assertTrue(replaced_runtime.exists())

    def test_missing_paths_are_retry_safe(self) -> None:
        session = self.session()
        shutil.rmtree(self.profile)
        shutil.rmtree(self.runtime)

        result = retired_cleanup.remove_retired_artifacts(
            session, self.current_boot(), lambda session: False
        )

        self.assertEqual("removed", result)
        self.assertFalse(self.profile.exists())
        self.assertFalse(self.runtime.exists())

    def test_refuses_parent_symlink(self) -> None:
        real_parent = self.root / "real-parent"
        real_parent.mkdir()
        profile = real_parent / "profile"
        profile.mkdir()
        runtime = real_parent / "runtime"
        runtime.mkdir()
        link_parent = self.root / "link-parent"
        link_parent.symlink_to(real_parent, target_is_directory=True)
        session = {
            "artifact_boot": {"session_uuid": "old", "boot_time_us": 100},
            "user_data_dir": str(link_parent / "profile"),
            "runtime_path": str(link_parent / "runtime"),
            "profile_identity": {
                **self.identity(profile),
                "path": str(link_parent / "profile"),
            },
            "runtime_identity": {
                **self.identity(runtime),
                "path": str(link_parent / "runtime"),
            },
            "roles": {"chrome": {"birth_identity": self.birth(100, "old")}},
        }

        with self.assertRaises(retired_cleanup.CleanupBlocked):
            retired_cleanup.remove_retired_artifacts(
                session, self.current_boot(), lambda session: False
            )

        self.assertTrue(profile.exists())
        self.assertTrue(runtime.exists())

    def test_requires_runtime_identity_record(self) -> None:
        session = self.session()
        del session["runtime_identity"]

        with self.assertRaises(retired_cleanup.CleanupBlocked):
            retired_cleanup.remove_retired_artifacts(
                session, self.current_boot(), lambda session: False
            )

        self.assertTrue(self.profile.exists())
        self.assertTrue(self.runtime.exists())

    def test_requires_artifact_boot_before_listener_check_or_deletion(self) -> None:
        session = self.session()
        del session["artifact_boot"]
        calls: list[dict[str, object]] = []

        with self.assertRaises(retired_cleanup.CleanupBlocked):
            retired_cleanup.remove_retired_artifacts(
                session, self.current_boot(), lambda session: calls.append(session) or False
            )

        self.assertEqual([], calls)
        self.assertTrue(self.profile.exists())
        self.assertTrue(self.runtime.exists())

    def test_same_artifact_boot_awaits_without_listener_check_or_deletion(self) -> None:
        calls: list[dict[str, object]] = []

        result = retired_cleanup.remove_retired_artifacts(
            self.session(boot_time_us=200, session_uuid="current"),
            self.current_boot(boot_time_us=200, session_uuid="current"),
            lambda session: calls.append(session) or False,
        )

        self.assertEqual("awaiting-reboot", result)
        self.assertEqual([], calls)
        self.assertTrue(self.profile.exists())
        self.assertTrue(self.runtime.exists())

    def test_blocks_artifact_boot_contradictions(self) -> None:
        cases = [
            self.current_boot(boot_time_us=300, session_uuid="old"),
            self.current_boot(boot_time_us=100, session_uuid="different"),
        ]

        for current_boot in cases:
            with self.subTest(current_boot=current_boot):
                with self.assertRaises(retired_cleanup.CleanupBlocked):
                    retired_cleanup.remove_retired_artifacts(
                        self.session(boot_time_us=100, session_uuid="old"),
                        current_boot,
                        lambda session: False,
                    )
                self.assertTrue(self.profile.exists())
                self.assertTrue(self.runtime.exists())

    def test_blocks_birth_boot_that_contradicts_artifact_boot(self) -> None:
        session = self.session()
        assert isinstance(session["roles"], dict)
        session["roles"]["daemon"] = {"birth_identity": self.birth(100, "other")}

        with self.assertRaises(retired_cleanup.CleanupBlocked):
            retired_cleanup.remove_retired_artifacts(
                session, self.current_boot(), lambda session: False
            )

        self.assertTrue(self.profile.exists())
        self.assertTrue(self.runtime.exists())

    def test_requires_identity_paths_to_match_bound_session_paths(self) -> None:
        session = self.session()
        session["runtime_path"] = str(self.root / "other-runtime")

        with self.assertRaises(retired_cleanup.CleanupBlocked):
            retired_cleanup.remove_retired_artifacts(
                session, self.current_boot(), lambda session: False
            )

        self.assertTrue(self.profile.exists())
        self.assertTrue(self.runtime.exists())

    def test_refuses_nested_or_lexical_parent_target_paths(self) -> None:
        cases = []
        nested = self.session()
        nested_runtime = self.profile / "nested-runtime"
        nested_runtime.mkdir()
        nested["runtime_path"] = str(nested_runtime)
        nested["runtime_identity"] = self.identity(nested_runtime)
        cases.append(nested)

        parent_reference = self.session()
        parent_reference["runtime_path"] = str(self.root / "runtime" / ".." / "other")
        cases.append(parent_reference)

        for session in cases:
            with self.subTest(session=session):
                with self.assertRaises(retired_cleanup.CleanupBlocked):
                    retired_cleanup.remove_retired_artifacts(
                        session, self.current_boot(), lambda session: False
                    )
                self.assertTrue(self.profile.exists())
                self.assertTrue(self.runtime.exists())

    def test_uses_fd_guarded_rmtree(self) -> None:
        calls: list[tuple[object, object]] = []

        def fake_rmtree(path: object, *args: object, **kwargs: object) -> None:
            calls.append((path, kwargs.get("dir_fd")))

        with mock.patch.object(retired_cleanup.shutil, "rmtree", side_effect=fake_rmtree):
            retired_cleanup.remove_retired_artifacts(
                self.session(), self.current_boot(), lambda session: False
            )

        self.assertEqual(["profile", "runtime"], sorted(str(call[0]) for call in calls))
        self.assertTrue(all(isinstance(call[1], int) for call in calls))


if __name__ == "__main__":
    unittest.main()
