"""Work-only history contract, with no credentials or inference requests."""

import copy
import io
import json
import os
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from test_amp_claude_subscription_selector import CONFIG, ROOT, FakeAPI, selector

WORK = "claude-fixture-worker@holistics.io.json"
ACCOUNT = {"name": WORK, "email": "worker@holistics.io", "auth_index": "work-index"}


def fixture(index="work-index"):
    return {
        "timestamp": "2026-11-02T12:00:00.123456789+07:00",
        "model": "claude-fixture",
        "provider": "claude",
        "auth_index": index,
        "request_id": "fixture-request",
        "failed": False,
        "api_key": "NEVER-PERSIST-API-KEY",
        "response_headers": {"secret": "NEVER-PERSIST-HEADER"},
        "token_breakdown": {
            "schema_version": 2,
            "quality": "complete",
            "total_tokens": 170,
            "input": {
                "uncached_tokens": 100,
                "cache_read_tokens": 40,
                "cache_write_tokens": 10,
            },
            "output": {"total_tokens": 20},
        },
    }


class UsageAPI(FakeAPI):
    def __init__(self, records=()):
        super().__init__()
        self.entries[0].update(ACCOUNT)
        self.records = list(records)

    def call(self, method, endpoint, payload=None):
        if endpoint == "usage-statistics-enabled":
            return {"usage-statistics-enabled": True}
        if endpoint == "usage-queue?count=1000":
            result, self.records = self.records[:1000], self.records[1000:]
            return result
        raise AssertionError(endpoint)


class WorkUsageTests(unittest.TestCase):
    def test_durable_work_only_report_survives_a_new_process(self):
        config = {**CONFIG, "preferred": WORK}
        work = fixture()
        personal = fixture("personal-index")
        unknown = fixture("unknown-index")
        other_provider = {**work, "provider": "codex"}
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(selector, "STATE", Path(directory)),
        ):
            selector.save(Path(directory) / "config.json", config)
            selector.save(Path(directory) / "work-usage-account.json", ACCOUNT)
            api = UsageAPI([work, work, personal, unknown, other_provider])
            result = selector.collect_usage(api, config)
            self.assertEqual(
                (result["stored"], result["excluded"], result["rejected"]), (1, 3, 0)
            )
            # No resolution or provider access is needed to reopen durable history.
            report = subprocess.run(
                [str(ROOT / "bin/amp-claude-selector"), "usage-report", "--details"],
                env={**os.environ, "AMP_CLAUDE_SELECTOR_STATE_DIR": directory},
                capture_output=True,
                text=True,
                check=True,
            )
            payload = json.loads(report.stdout)
            self.assertEqual(payload["requests"], 1)
            self.assertEqual(
                payload["tokens"],
                {
                    "uncached_input": 100,
                    "output": 20,
                    "cache_read": 40,
                    "cache_write": 10,
                },
            )
            self.assertEqual(payload["history"][0]["timestamp"], work["timestamp"])
            self.assertEqual(payload["history"][0]["account"], ACCOUNT)
            raw = (Path(directory) / "work-usage.sqlite").read_bytes()
            for excluded in (
                b"NEVER-PERSIST",
                b"personal-index",
                b"unknown-index",
                b"response_headers",
                b"api_key",
            ):
                self.assertNotIn(excluded, raw)
            self.assertEqual(
                (Path(directory) / "work-usage.sqlite").stat().st_mode & 0o777, 0o600
            )

    def test_identity_drift_fails_before_destructive_queue_read(self):
        config = {**CONFIG, "preferred": WORK}
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(selector, "STATE", Path(directory)),
        ):
            selector.save(Path(directory) / "work-usage-account.json", ACCOUNT)
            api = UsageAPI([fixture()])
            api.entries[0]["auth_index"] = "changed-index"
            with self.assertRaises(selector.SelectorError):
                selector.collect_usage(api, config)
            self.assertEqual(len(api.records), 1)
            api.entries[0].update(ACCOUNT, email="personal@gmail.com")
            with self.assertRaises(selector.SelectorError):
                selector.collect_usage(api, config)
            self.assertEqual(len(api.records), 1)

    def test_malformed_work_is_rejected_without_losing_valid_batch_entries(self):
        bad = copy.deepcopy(fixture())
        bad["token_breakdown"]["input"]["uncached_tokens"] = -1
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(selector, "STATE", Path(directory)),
        ):
            selector.save(Path(directory) / "work-usage-account.json", ACCOUNT)
            with self.assertRaises(selector.SelectorError):
                selector.collect_usage(
                    UsageAPI([bad, fixture()]), {**CONFIG, "preferred": WORK}
                )
            output = io.StringIO()
            with redirect_stdout(output):
                selector.usage_report()
            report = json.loads(output.getvalue())
            self.assertEqual(report["requests"], 1)
            self.assertEqual(report["last_collection"]["rejected"], 1)

    def test_restart_drains_before_restart_and_rechecks_after(self):
        config = {**CONFIG, "preferred": WORK}
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(selector, "STATE", Path(directory)),
        ):
            selector.save(Path(directory) / "work-usage-account.json", ACCOUNT)
            api = UsageAPI([fixture()])

            def restart(args):
                self.assertEqual(args, ["docker", "restart", "amp-cliproxyapi"])
                self.assertEqual(api.records, [])
                api.records = [fixture("personal-index")]

            with patch.object(selector, "command", side_effect=restart):
                selector.restart_usage(api, config)
            output = io.StringIO()
            with redirect_stdout(output):
                selector.usage_report()
            self.assertEqual(json.loads(output.getvalue())["requests"], 1)


if __name__ == "__main__":
    unittest.main()
