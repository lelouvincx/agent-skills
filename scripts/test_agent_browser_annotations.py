from __future__ import annotations

import argparse
import importlib.machinery
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
COMMAND = ROOT / "bin" / "agent-browser-lifecycle"
OWNER = "T-11111111-1111-1111-1111-111111111111"
SESSION = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


def load_lifecycle_module():
    loader = importlib.machinery.SourceFileLoader(
        "agent_browser_lifecycle_annotations", str(COMMAND)
    )
    spec = importlib.util.spec_from_loader(
        "agent_browser_lifecycle_annotations", loader
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load agent-browser-lifecycle")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class BrowserAnnotationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.lifecycle = load_lifecycle_module()
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.root = Path(self.temporary_directory.name)
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()

    def document(self):
        return {
            "schema": "amp-browser-annotations/v1",
            "toolkitVersion": "1",
            "collectedAt": "2026-09-22T00:00:00.000Z",
            "viewport": {"width": 1440, "height": 900, "devicePixelRatio": 2},
            "annotations": [
                {
                    "id": "a1",
                    "kind": "element",
                    "comment": "Move this tooltip",
                    "geometry": {"x": 10, "y": 20, "width": 30, "height": 40},
                    "anchor": {
                        "tag": "div",
                        "testId": "chart-tooltip",
                        "domPath": [1, 2],
                    },
                }
            ],
        }

    def wrapper_stdout(self, envelope):
        return (
            json.dumps(
                {
                    "success": True,
                    "data": {"result": json.dumps(envelope)},
                    "error": None,
                }
            )
            + "\n"
        )

    def success_envelope(self, payload):
        return {
            "ok": True,
            "complete": True,
            "payload": payload,
            "terminator": "AMP_ANNOTATION_END_v1",
        }

    def test_build_eval_uses_only_pinned_sources_and_fixed_operation(self) -> None:
        script = self.lifecycle.build_annotation_eval("stop", discard_uncollected=True)
        self.assertIn("amp.browserAnnotations.v1", script)
        self.assertIn("discardUncollected: true", script)
        self.assertNotIn(str(self.workspace), script)
        with self.assertRaisesRegex(
            self.lifecycle.LifecycleError, "unsupported annotation operation"
        ):
            self.lifecycle.build_annotation_eval("eval('page supplied')")

    def test_cli_requires_fixed_annotation_operation_and_stable_tab(self) -> None:
        parser = self.lifecycle.build_parser()
        parsed = parser.parse_args(
            [
                "annotate",
                "stop",
                "--session-id",
                SESSION,
                "--actor-thread-id",
                OWNER,
                "--tab-id",
                "t2",
                "--discard-uncollected",
            ]
        )
        self.assertEqual("annotate", parsed.command)
        self.assertEqual("stop", parsed.annotation_command)
        self.assertTrue(parsed.discard_uncollected)

    def test_parse_success_and_typed_error_envelopes(self) -> None:
        parsed = self.lifecycle.parse_annotation_eval_stdout(
            self.wrapper_stdout(self.success_envelope({"state": "active"}))
        )
        self.assertEqual({"state": "active"}, parsed["payload"])
        error = {
            "ok": False,
            "complete": True,
            "error": {"code": "uncollected_comments", "message": "Collect first"},
            "terminator": "AMP_ANNOTATION_END_v1",
        }
        with self.assertRaisesRegex(
            self.lifecycle.AnnotationError, "Collect first"
        ) as raised:
            self.lifecycle.parse_annotation_eval_stdout(self.wrapper_stdout(error))
        self.assertEqual("uncollected_comments", raised.exception.code)

    def test_parse_refuses_truncated_duplicate_and_trailing_output(self) -> None:
        valid = self.wrapper_stdout(self.success_envelope({"state": "active"}))
        for stdout in (
            valid[:-8],
            valid + "trailing",
            '{"success":true,"success":true,"data":{"result":"x"}}',
            json.dumps({"success": True, "data": {"result": "{}"}, "error": None}),
        ):
            with self.subTest(stdout=stdout):
                with self.assertRaises(self.lifecycle.LifecycleError):
                    self.lifecycle.parse_annotation_eval_stdout(stdout)

    def test_validate_document_rejects_extra_or_sensitive_structure(self) -> None:
        self.lifecycle.validate_annotation_document(self.document())
        cases = []
        extra = self.document()
        extra["url"] = "https://example.test/?token=secret"
        cases.append(extra)
        text = self.document()
        text["annotations"][0]["text"] = "private page text"
        cases.append(text)
        secret_id = self.document()
        secret_id["annotations"][0]["anchor"]["testId"] = "session-token"
        cases.append(secret_id)
        for value in cases:
            with self.subTest(value=value):
                with self.assertRaises(self.lifecycle.LifecycleError):
                    self.lifecycle.validate_annotation_document(value)

    def test_validate_document_counts_utf16_units_and_refuses_surrogates(self) -> None:
        too_long = self.document()
        too_long["annotations"][0]["comment"] = "😀" * 1001
        lone_surrogate = self.document()
        lone_surrogate["annotations"][0]["comment"] = "bad\ud800value"
        for value in (too_long, lone_surrogate):
            with self.subTest(value=value):
                with self.assertRaisesRegex(
                    self.lifecycle.LifecycleError, "comment length"
                ):
                    self.lifecycle.validate_annotation_document(value)

    def test_validate_status_and_stop_payloads_are_minimized(self) -> None:
        status = {
            "schema": "amp-browser-annotations/v1",
            "toolkitVersion": "1",
            "state": "active",
            "mode": "element",
            "annotationCount": 1,
            "uncollectedCount": 1,
        }
        self.assertEqual(status, self.lifecycle.validate_annotation_status(status))
        leaked = {**status, "pageText": "private"}
        with self.assertRaises(self.lifecycle.LifecycleError):
            self.lifecycle.validate_annotation_status(leaked)
        with self.assertRaises(self.lifecycle.LifecycleError):
            self.lifecycle.validate_annotation_stop(
                {"stopped": True, "discardedCount": 0, "url": "private"}
            )

    def test_write_artifact_uses_workspace_and_actor_metadata(self) -> None:
        result = self.lifecycle.write_annotation_artifact(
            self.workspace, OWNER, self.document()
        )
        directory = Path(result["artifact_directory"])
        self.assertTrue(
            directory.is_relative_to(
                self.workspace.resolve() / ".amp" / "in" / "artifacts"
            )
        )
        self.assertEqual(
            OWNER + "\n", (directory / ".thread-metadata").read_text(encoding="utf-8")
        )
        self.assertEqual(
            self.document(),
            json.loads((directory / "annotations.json").read_text(encoding="utf-8")),
        )
        self.assertEqual(0o600, (directory / "annotations.json").stat().st_mode & 0o777)

    def test_write_artifact_refuses_symlinked_artifact_parent(self) -> None:
        outside = self.root / "outside"
        outside.mkdir()
        amp = self.workspace / ".amp"
        amp.mkdir()
        (amp / "in").symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(self.lifecycle.LifecycleError, "symbolic link"):
            self.lifecycle.write_annotation_artifact(
                self.workspace, OWNER, self.document()
            )
        self.assertEqual([], list(outside.iterdir()))

    def test_collect_writes_then_acknowledges_same_revision(self) -> None:
        session = {"workspace": str(self.workspace)}
        context = mock.Mock(session=session, command_base=["agent-browser"], env={})
        collect = self.success_envelope({"revision": 7, "document": self.document()})
        acknowledge = self.success_envelope(
            {
                "schema": "amp-browser-annotations/v1",
                "toolkitVersion": "1",
                "state": "active",
                "mode": "element",
                "annotationCount": 1,
                "uncollectedCount": 0,
            }
        )
        completed = [
            subprocess.CompletedProcess(
                ["agent-browser"], 0, self.wrapper_stdout(collect), ""
            ),
            subprocess.CompletedProcess(
                ["agent-browser"], 0, self.wrapper_stdout(acknowledge), ""
            ),
        ]
        with (
            mock.patch.object(
                self.lifecycle, "lifecycle_dir", return_value=self.root / "state"
            ),
            mock.patch.object(
                self.lifecycle, "managed_execution_context", return_value=context
            ),
            mock.patch.object(self.lifecycle, "select_managed_tab"),
            mock.patch.object(
                self.lifecycle.subprocess, "run", side_effect=completed
            ) as run,
        ):
            result = self.lifecycle.command_annotate(
                argparse.Namespace(
                    annotation_command="collect",
                    session_id=SESSION,
                    actor_thread_id=OWNER,
                    tab_id="t2",
                    discard_uncollected=False,
                )
            )
        self.assertEqual(7, result["revision"])
        self.assertTrue(Path(result["artifact_directory"]).is_dir())
        self.assertIn("acknowledge({ revision: 7 })", run.call_args_list[1].args[0][-1])

    def test_typed_annotation_error_does_not_record_cleanup_pending(self) -> None:
        session = {"workspace": str(self.workspace)}
        context = mock.Mock(session=session, command_base=["agent-browser"], env={})
        error = {
            "ok": False,
            "complete": True,
            "error": {"code": "uncollected_comments", "message": "Collect first"},
            "terminator": "AMP_ANNOTATION_END_v1",
        }
        completed = subprocess.CompletedProcess(
            ["agent-browser"], 0, self.wrapper_stdout(error), ""
        )
        with (
            mock.patch.object(
                self.lifecycle, "lifecycle_dir", return_value=self.root / "state"
            ),
            mock.patch.object(
                self.lifecycle, "managed_execution_context", return_value=context
            ),
            mock.patch.object(self.lifecycle, "select_managed_tab"),
            mock.patch.object(self.lifecycle.subprocess, "run", return_value=completed),
            mock.patch.object(self.lifecycle, "record_cleanup_pending") as cleanup,
        ):
            with self.assertRaises(self.lifecycle.AnnotationError):
                self.lifecycle.command_annotate(
                    argparse.Namespace(
                        annotation_command="stop",
                        session_id=SESSION,
                        actor_thread_id=OWNER,
                        tab_id="t2",
                        discard_uncollected=False,
                    )
                )
        cleanup.assert_not_called()

    def test_invalid_success_payload_records_cleanup_pending(self) -> None:
        context = mock.Mock(
            session={"workspace": str(self.workspace)},
            command_base=["agent-browser"],
            env={},
        )
        leaked = self.success_envelope({"state": "active", "pageText": "private"})
        completed = subprocess.CompletedProcess(
            ["agent-browser"], 0, self.wrapper_stdout(leaked), ""
        )
        with (
            mock.patch.object(
                self.lifecycle, "lifecycle_dir", return_value=self.root / "state"
            ),
            mock.patch.object(
                self.lifecycle, "managed_execution_context", return_value=context
            ),
            mock.patch.object(self.lifecycle, "select_managed_tab"),
            mock.patch.object(self.lifecycle.subprocess, "run", return_value=completed),
            mock.patch.object(self.lifecycle, "record_cleanup_pending") as cleanup,
        ):
            with self.assertRaises(self.lifecycle.LifecycleError):
                self.lifecycle.command_annotate(
                    argparse.Namespace(
                        annotation_command="start",
                        session_id=SESSION,
                        actor_thread_id=OWNER,
                        tab_id="t2",
                        discard_uncollected=False,
                    )
                )
        cleanup.assert_called_once()


if __name__ == "__main__":
    unittest.main()
