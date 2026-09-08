"""Safe process and profile identity helpers for Agent Browser lifecycle tests.

This module is a narrow stage-3 prototype for RFC-0012. It provides:

- `process_identity(pid)`: macOS birth identity from the current boot identity,
  PID and libproc microsecond process start time. A missing process returns
  `None`; inspection failures raise `ProcessInspectionError`.
- process snapshots and descendant inventory from observed parent-PID edges.
- identity comparison helpers that are safe for saved process records.
- profile directory device/inode identity with symlink refusal.

It deliberately does not launch, stop or signal processes. Descendant inventory
is observational: if a parent has exited, the returned descendants are only the
processes still visible with observed parent edges. That is not proof that no
unobserved or reparented helper process remains.

macOS is the supported implementation. Other platforms refuse clearly for now.
"""

from __future__ import annotations

import ctypes
import errno
import os
import platform
from dataclasses import dataclass
from pathlib import Path


class ProcessInspectionError(RuntimeError):
    """Process metadata could not be inspected reliably."""


class UnsupportedPlatformError(ProcessInspectionError):
    """The current platform has no process birth-identity implementation."""


class UnsafeProfilePathError(ValueError):
    """A profile path is not a plain existing directory."""


@dataclass(frozen=True)
class BootIdentity:
    session_uuid: str | None
    boot_time_us: int


@dataclass(frozen=True)
class ProcessIdentity:
    pid: int
    boot: BootIdentity
    start_time_us: int
    ppid: int
    uid: int
    name: str

    def birth_key(self) -> tuple[BootIdentity, int, int]:
        return (self.boot, self.pid, self.start_time_us)


@dataclass(frozen=True)
class IdentityComparison:
    matches: bool
    reason: str
    current: ProcessIdentity | None = None


@dataclass(frozen=True)
class ProcessSnapshot:
    processes: dict[int, ProcessIdentity]
    unavailable_pids: dict[int, str]
    complete: bool


@dataclass(frozen=True)
class DescendantInventory:
    roots: dict[int, ProcessIdentity]
    descendants: dict[int, ProcessIdentity]
    uncertain: bool
    limitations: tuple[str, ...]


@dataclass(frozen=True)
class ProfileIdentity:
    path: str
    device: int
    inode: int

    def identity_key(self) -> tuple[int, int]:
        return (self.device, self.inode)


def process_identity(pid: int) -> ProcessIdentity | None:
    """Return a process birth identity, or `None` if the PID is absent."""

    if pid <= 0:
        raise ValueError("pid must be positive")
    if platform.system() != "Darwin":
        raise UnsupportedPlatformError("process identity is only implemented on macOS")
    return _macos_process_identity(pid)


def process_snapshot(pids: list[int] | tuple[int, ...] | None = None) -> ProcessSnapshot:
    """Inspect selected PIDs or every visible process on macOS."""

    if platform.system() != "Darwin":
        raise UnsupportedPlatformError("process snapshots are only implemented on macOS")
    requested = _macos_list_pids() if pids is None else [int(pid) for pid in pids]
    processes: dict[int, ProcessIdentity] = {}
    unavailable: dict[int, str] = {}
    for pid in requested:
        if pid <= 0:
            continue
        try:
            identity = process_identity(pid)
        except ProcessInspectionError as exc:
            unavailable[pid] = str(exc)
            continue
        if identity is None:
            unavailable[pid] = "process is absent"
            continue
        processes[pid] = identity
    return ProcessSnapshot(processes=processes, unavailable_pids=unavailable, complete=not unavailable)


def compare_process_identity(saved: ProcessIdentity, pid: int | None = None) -> IdentityComparison:
    """Compare a saved process identity with the process currently at its PID."""

    inspected_pid = saved.pid if pid is None else pid
    current = process_identity(inspected_pid)
    if current is None:
        return IdentityComparison(False, "process is absent", None)
    if saved.birth_key() != current.birth_key():
        return IdentityComparison(False, "process birth identity does not match", current)
    return IdentityComparison(True, "process birth identity matches", current)


def descendants_for_roots(
    root_identities: list[ProcessIdentity] | tuple[ProcessIdentity, ...],
    snapshot: ProcessSnapshot,
) -> DescendantInventory:
    """Return descendants observed through current parent-PID edges.

    If any root is absent from the snapshot, the inventory is conservative and
    marked uncertain because helpers may already have been reparented.
    """

    saved_roots = {identity.pid: identity for identity in root_identities}
    live_roots = {
        pid: identity
        for pid, identity in snapshot.processes.items()
        if pid in saved_roots and identity.birth_key() == saved_roots[pid].birth_key()
    }
    children_by_parent: dict[int, list[ProcessIdentity]] = {}
    for identity in snapshot.processes.values():
        children_by_parent.setdefault(identity.ppid, []).append(identity)

    descendants: dict[int, ProcessIdentity] = {}
    stack = list(live_roots)
    while stack:
        parent_pid = stack.pop()
        for child in children_by_parent.get(parent_pid, []):
            if child.pid in descendants or child.pid in live_roots:
                continue
            descendants[child.pid] = child
            stack.append(child.pid)

    limitations = [
        "process snapshots are not atomic; observed descendants are not a complete "
        "ownership inventory and cannot authorize cleanup success"
    ]
    missing_roots = sorted(set(saved_roots) - set(live_roots))
    if missing_roots:
        limitations.append(
            "root process absent or identity-mismatched; observed descendants do not "
            "prove that no unobserved or reparented helper remains"
        )
    if snapshot.unavailable_pids:
        limitations.append("some process identities were unavailable during snapshot")

    return DescendantInventory(
        roots=live_roots,
        descendants=descendants,
        uncertain=bool(limitations),
        limitations=tuple(limitations),
    )


def profile_identity(path: str | os.PathLike[str]) -> ProfileIdentity:
    """Return device/inode identity for a profile directory, refusing symlinks."""

    profile_path = Path(path)
    _refuse_existing_symlink_components(profile_path)
    try:
        stat_result = profile_path.stat()
    except FileNotFoundError as exc:
        raise UnsafeProfilePathError(f"profile path does not exist: {profile_path}") from exc
    if not profile_path.is_dir():
        raise UnsafeProfilePathError(f"profile path is not a directory: {profile_path}")
    return ProfileIdentity(
        path=str(profile_path),
        device=stat_result.st_dev,
        inode=stat_result.st_ino,
    )


def compare_profile_identity(saved: ProfileIdentity) -> bool:
    """Return whether the profile path still has the saved device/inode identity."""

    current = profile_identity(saved.path)
    return saved.identity_key() == current.identity_key()


MAXCOMLEN = 16
PROC_ALL_PIDS = 1
PROC_PIDTBSDINFO = 3


class _Timeval(ctypes.Structure):
    _fields_ = [("tv_sec", ctypes.c_long), ("tv_usec", ctypes.c_int)]


class _ProcBSDInfo(ctypes.Structure):
    # Verified against the installed macOS SDK sys/proc_info.h on 2026-09-07:
    # sizeof(struct proc_bsdinfo) == 136, pbi_start_tvsec offset == 120,
    # pbi_start_tvusec offset == 128.
    _fields_ = [
        ("pbi_flags", ctypes.c_uint32),
        ("pbi_status", ctypes.c_uint32),
        ("pbi_xstatus", ctypes.c_uint32),
        ("pbi_pid", ctypes.c_uint32),
        ("pbi_ppid", ctypes.c_uint32),
        ("pbi_uid", ctypes.c_uint32),
        ("pbi_gid", ctypes.c_uint32),
        ("pbi_ruid", ctypes.c_uint32),
        ("pbi_rgid", ctypes.c_uint32),
        ("pbi_svuid", ctypes.c_uint32),
        ("pbi_svgid", ctypes.c_uint32),
        ("rfu_1", ctypes.c_uint32),
        ("pbi_comm", ctypes.c_char * MAXCOMLEN),
        ("pbi_name", ctypes.c_char * (2 * MAXCOMLEN)),
        ("pbi_nfiles", ctypes.c_uint32),
        ("pbi_pgid", ctypes.c_uint32),
        ("pbi_pjobc", ctypes.c_uint32),
        ("e_tdev", ctypes.c_uint32),
        ("e_tpgid", ctypes.c_uint32),
        ("pbi_nice", ctypes.c_int32),
        ("pbi_start_tvsec", ctypes.c_uint64),
        ("pbi_start_tvusec", ctypes.c_uint64),
    ]


def _macos_process_identity(pid: int) -> ProcessIdentity | None:
    libproc = _libproc()
    info = _ProcBSDInfo()
    size = ctypes.sizeof(info)
    ctypes.set_errno(0)
    result = libproc.proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, ctypes.byref(info), size)
    if result == 0:
        err = ctypes.get_errno()
        if err == errno.ESRCH:
            return None
        raise ProcessInspectionError(f"proc_pidinfo({pid}) failed: errno {err}")
    if result != size:
        raise ProcessInspectionError(
            f"proc_pidinfo({pid}) returned {result} bytes; expected {size}"
        )
    name = bytes(info.pbi_name).split(b"\0", 1)[0].decode("utf-8", "replace")
    if not name:
        name = bytes(info.pbi_comm).split(b"\0", 1)[0].decode("utf-8", "replace")
    return ProcessIdentity(
        pid=int(info.pbi_pid),
        boot=_macos_boot_identity(),
        start_time_us=int(info.pbi_start_tvsec * 1_000_000 + info.pbi_start_tvusec),
        ppid=int(info.pbi_ppid),
        uid=int(info.pbi_uid),
        name=name,
    )


def _macos_list_pids() -> list[int]:
    libproc = _libproc()
    ctypes.set_errno(0)
    needed = libproc.proc_listpids(PROC_ALL_PIDS, 0, None, 0)
    if needed <= 0:
        raise ProcessInspectionError("proc_listpids failed to size process list")
    count = needed // ctypes.sizeof(ctypes.c_int) + 256
    buffer = (ctypes.c_int * count)()
    ctypes.set_errno(0)
    used = libproc.proc_listpids(PROC_ALL_PIDS, 0, buffer, ctypes.sizeof(buffer))
    if used <= 0:
        err = ctypes.get_errno()
        raise ProcessInspectionError(f"proc_listpids failed: errno {err}")
    if used >= ctypes.sizeof(buffer):
        raise ProcessInspectionError("process list grew during inspection; retry required")
    return [int(pid) for pid in buffer[: used // ctypes.sizeof(ctypes.c_int)] if pid > 0]


def _macos_boot_identity() -> BootIdentity:
    timeval = _Timeval()
    size = ctypes.c_size_t(ctypes.sizeof(timeval))
    libc = ctypes.CDLL(None, use_errno=True)
    ctypes.set_errno(0)
    result = libc.sysctlbyname(
        b"kern.boottime", ctypes.byref(timeval), ctypes.byref(size), None, 0
    )
    if result != 0:
        err = ctypes.get_errno()
        raise ProcessInspectionError(f"sysctlbyname(kern.boottime) failed: errno {err}")
    return BootIdentity(
        session_uuid=_macos_boot_session_uuid(),
        boot_time_us=int(timeval.tv_sec * 1_000_000 + timeval.tv_usec),
    )


def _macos_boot_session_uuid() -> str | None:
    libc = ctypes.CDLL(None, use_errno=True)
    size = ctypes.c_size_t(0)
    ctypes.set_errno(0)
    result = libc.sysctlbyname(b"kern.bootsessionuuid", None, ctypes.byref(size), None, 0)
    if result != 0 or size.value <= 1:
        return None
    buffer = ctypes.create_string_buffer(size.value)
    ctypes.set_errno(0)
    result = libc.sysctlbyname(
        b"kern.bootsessionuuid", buffer, ctypes.byref(size), None, 0
    )
    if result != 0:
        return None
    return buffer.value.decode("utf-8", "replace")


def _libproc() -> ctypes.CDLL:
    libproc = ctypes.CDLL("/usr/lib/libproc.dylib", use_errno=True)
    libproc.proc_pidinfo.argtypes = [
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_uint64,
        ctypes.c_void_p,
        ctypes.c_int,
    ]
    libproc.proc_pidinfo.restype = ctypes.c_int
    libproc.proc_listpids.argtypes = [
        ctypes.c_uint32,
        ctypes.c_uint32,
        ctypes.c_void_p,
        ctypes.c_int,
    ]
    libproc.proc_listpids.restype = ctypes.c_int
    return libproc


def _refuse_existing_symlink_components(path: Path) -> None:
    absolute = path if path.is_absolute() else Path.cwd() / path
    current = Path(absolute.anchor)
    for part in absolute.parts[1:]:
        current = current / part
        try:
            current.lstat()
        except FileNotFoundError:
            raise UnsafeProfilePathError(f"profile path does not exist: {path}") from None
        if os.path.islink(current):
            raise UnsafeProfilePathError(f"profile path contains a symlink: {current}")
