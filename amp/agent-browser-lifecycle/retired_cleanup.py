"""Post-reboot cleanup for retired Agent Browser session artifacts.

This module is intentionally a pure API. It does not discover live sessions,
write lifecycle state or clean the user's active runtime by itself. Callers pass
one retired session record, the current boot identity and a listener check.
"""

from __future__ import annotations

import os
import shutil
import stat
from pathlib import Path
from typing import Any, Callable, Literal


CleanupResult = Literal["awaiting-reboot", "removed"]
ListenerCheck = Callable[[dict[str, Any]], bool]


class CleanupBlocked(RuntimeError):
    """Cleanup is unsafe and must be retried or investigated later."""


def remove_retired_artifacts(
    session: dict[str, Any],
    current_boot: Any,
    check_listeners: ListenerCheck,
) -> CleanupResult:
    """Remove retired profile/runtime directories only after a newer boot.

    Safety rules:
    - the session must include the recorded artifact boot; same-artifact-boot
      cleanup returns `"awaiting-reboot"` without listener checks or filesystem
      effects, while contradictory boot evidence blocks cleanup
    - every recorded process birth boot must match the recorded artifact boot
    - `check_listeners(session)` runs before any filesystem effects; a truthy
      result blocks cleanup
    - both `profile_identity` and `runtime_identity` must provide absolute
      path/device/inode records, and each existing path must still match before
      any deletion starts
    - symlink components are refused for target paths and existing parents
    - deletion uses `shutil.rmtree` with a parent directory fd guard
    - already-missing target paths are treated as successful, making retries safe
    """

    if not isinstance(session, dict):
        raise CleanupBlocked("session must be a dictionary")

    artifact_boot = _boot_record(session.get("artifact_boot"), "artifact_boot")
    current = _boot_record(current_boot, "current_boot")
    boot_state = _cleanup_boot_state(artifact_boot, current)
    if boot_state == "awaiting-reboot":
        return "awaiting-reboot"

    _require_births_match_artifact_boot(session, artifact_boot)

    if check_listeners(session):
        raise CleanupBlocked("session still has active listeners")

    targets = _targets_from_session(session)

    verified: list[CleanupTarget] = []
    for target in targets:
        _verify_target_identity(target)
        verified.append(target)

    for target in sorted(verified, key=lambda candidate: len(candidate.path.parts), reverse=True):
        _rmtree_verified(target)

    return "removed"


class CleanupTarget:
    def __init__(self, path: Path, device: int, inode: int) -> None:
        self.path = path
        self.device = device
        self.inode = inode


def _cleanup_boot_state(
    artifact_boot: dict[str, Any], current_boot: dict[str, Any]
) -> Literal["awaiting-reboot", "safe-after-reboot"]:
    artifact_uuid = artifact_boot["session_uuid"]
    current_uuid = current_boot["session_uuid"]
    artifact_time = int(artifact_boot["boot_time_us"])
    current_time = int(current_boot["boot_time_us"])

    if artifact_uuid is not None and current_uuid is not None:
        if artifact_uuid == current_uuid and artifact_time != current_time:
            raise CleanupBlocked("artifact boot contradicts current boot identity")
        if artifact_uuid != current_uuid and artifact_time == current_time:
            raise CleanupBlocked("artifact boot contradicts current boot identity")

    if artifact_uuid == current_uuid and artifact_time == current_time:
        return "awaiting-reboot"
    if current_time <= artifact_time:
        return "awaiting-reboot"
    return "safe-after-reboot"


def _require_births_match_artifact_boot(
    session: dict[str, Any], artifact_boot: dict[str, Any]
) -> None:
    births = list(_birth_identity_records(session))
    if not births:
        raise CleanupBlocked("session has no recorded birth identities")
    for birth in births:
        boot = _boot_record(birth.get("boot"), "birth_identity.boot")
        if boot != artifact_boot:
            raise CleanupBlocked("birth boot does not match artifact boot")


def _birth_identity_records(session: dict[str, Any]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    roles = session.get("roles")
    if isinstance(roles, dict):
        for role in roles.values():
            if isinstance(role, dict) and isinstance(role.get("birth_identity"), dict):
                records.append(role["birth_identity"])
    for key in ("chrome_birth_identity", "daemon_birth_identity", "birth_identity"):
        value = session.get(key)
        if isinstance(value, dict):
            records.append(value)
    return records


def _boot_record(value: Any, field: str) -> dict[str, Any]:
    if hasattr(value, "session_uuid") and hasattr(value, "boot_time_us"):
        return {"session_uuid": value.session_uuid, "boot_time_us": value.boot_time_us}
    if not isinstance(value, dict):
        raise CleanupBlocked(f"{field} must contain session_uuid and boot_time_us")
    if "session_uuid" not in value or "boot_time_us" not in value:
        raise CleanupBlocked(f"{field} must contain session_uuid and boot_time_us")
    if not isinstance(value["boot_time_us"], int) or value["boot_time_us"] <= 0:
        raise CleanupBlocked(f"{field}.boot_time_us must be a positive integer")
    session_uuid = value["session_uuid"]
    if session_uuid is not None and not isinstance(session_uuid, str):
        raise CleanupBlocked(f"{field}.session_uuid must be null or a string")
    return {"session_uuid": session_uuid, "boot_time_us": value["boot_time_us"]}


def _targets_from_session(session: dict[str, Any]) -> list[CleanupTarget]:
    user_data_dir = _path_field(session, "user_data_dir")
    runtime_path = _path_field(session, "runtime_path")
    profile_target = _target_from_record(
        session.get("profile_identity"), "profile_identity", user_data_dir
    )
    runtime_target = _target_from_record(
        session.get("runtime_identity"), "runtime_identity", runtime_path
    )
    _require_distinct_non_nested(profile_target.path, runtime_target.path)
    return [profile_target, runtime_target]


def _path_field(session: dict[str, Any], field: str) -> Path:
    value = session.get(field)
    if not isinstance(value, str) or not Path(value).is_absolute():
        raise CleanupBlocked(f"{field} must be an absolute path")
    path = Path(value)
    _refuse_lexical_parent_reference(path, field)
    return path


def _target_from_record(value: Any, field: str, expected_path: Path) -> CleanupTarget:
    if not isinstance(value, dict):
        raise CleanupBlocked(f"{field} is required")
    path_value = value.get("path")
    device = value.get("device")
    inode = value.get("inode")
    if not isinstance(path_value, str) or not Path(path_value).is_absolute():
        raise CleanupBlocked(f"{field}.path must be an absolute path")
    path = Path(path_value)
    _refuse_lexical_parent_reference(path, f"{field}.path")
    if path != expected_path:
        raise CleanupBlocked(f"{field}.path must match recorded session path")
    if not isinstance(device, int) or device < 0:
        raise CleanupBlocked(f"{field}.device must be a non-negative integer")
    if not isinstance(inode, int) or inode <= 0:
        raise CleanupBlocked(f"{field}.inode must be a positive integer")
    return CleanupTarget(path, device, inode)


def _refuse_lexical_parent_reference(path: Path, field: str) -> None:
    if ".." in path.parts:
        raise CleanupBlocked(f"{field} must not contain '..'")


def _require_distinct_non_nested(first: Path, second: Path) -> None:
    if first == second or _is_relative_to(first, second) or _is_relative_to(second, first):
        raise CleanupBlocked("profile and runtime targets must be distinct non-nested paths")


def _is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return path != parent


def _verify_target_identity(target: CleanupTarget) -> CleanupTarget | None:
    _refuse_symlink_components(target.path)
    try:
        stat_result = target.path.stat()
    except FileNotFoundError:
        return None
    try:
        lstat_result = target.path.lstat()
    except FileNotFoundError:
        return None
    if os.path.islink(target.path):
        raise CleanupBlocked(f"cleanup target is a symlink: {target.path}")
    if not target.path.is_dir():
        raise CleanupBlocked(f"cleanup target is not a directory: {target.path}")
    if stat_result.st_dev != lstat_result.st_dev or stat_result.st_ino != lstat_result.st_ino:
        raise CleanupBlocked(f"cleanup target changed while verifying: {target.path}")
    if stat_result.st_dev != target.device or stat_result.st_ino != target.inode:
        raise CleanupBlocked(f"cleanup target identity does not match: {target.path}")
    return target


def _rmtree_verified(target: CleanupTarget) -> None:
    try:
        _refuse_symlink_components(target.path)
        parent_fd = _open_parent_fd(target.path)
    except FileNotFoundError:
        return
    try:
        try:
            stat_result = os.stat(target.path.name, dir_fd=parent_fd, follow_symlinks=False)
        except FileNotFoundError:
            os.fsync(parent_fd)
            return
        if not stat.S_ISDIR(stat_result.st_mode):
            raise CleanupBlocked(f"cleanup target is not a plain directory: {target.path}")
        if stat_result.st_dev != target.device or stat_result.st_ino != target.inode:
            raise CleanupBlocked(f"cleanup target identity changed before removal: {target.path}")
        if not shutil.rmtree.avoids_symlink_attacks:
            raise CleanupBlocked("shutil.rmtree lacks fd-based symlink attack protection")
        try:
            shutil.rmtree(target.path.name, dir_fd=parent_fd)
        except FileNotFoundError:
            pass
        os.fsync(parent_fd)
    finally:
        os.close(parent_fd)


def _open_parent_fd(path: Path) -> int:
    directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC
    nofollow_directory_flags = directory_flags | getattr(os, "O_NOFOLLOW", 0)
    current_fd = os.open(path.anchor, directory_flags)
    try:
        for part in path.parent.parts[1:]:
            next_fd = os.open(part, nofollow_directory_flags, dir_fd=current_fd)
            os.close(current_fd)
            current_fd = next_fd
        return current_fd
    except Exception:
        os.close(current_fd)
        raise


def _refuse_symlink_components(path: Path) -> None:
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current = current / part
        try:
            current.lstat()
        except FileNotFoundError:
            return
        if os.path.islink(current):
            raise CleanupBlocked(f"cleanup path contains a symlink: {current}")
