from __future__ import annotations

import argparse
import importlib.machinery
import importlib.util
import json
import multiprocessing
import os
import queue
import stat
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path
from unittest import mock
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
LOADER = importlib.machinery.SourceFileLoader("readai_cli", str(ROOT / "bin/readai"))
SPEC = importlib.util.spec_from_loader(LOADER.name, LOADER)
assert SPEC is not None
readai = importlib.util.module_from_spec(SPEC)
LOADER.exec_module(readai)


ULID = "01HFYH0A6JM4R7MZ2E6X5T9BNP"
REDIRECT_URI = "http://127.0.0.1:45678/oauth/callback"


class FakeStore:
    def __init__(self, credentials, save_failures=0):
        self.credentials = credentials
        self.saved = []
        self.save_failures = save_failures

    def load(self):
        return dict(self.credentials)

    def save(self, credentials):
        if self.save_failures:
            self.save_failures -= 1
            raise readai.AuthenticationError("simulated save failure")
        self.credentials = dict(credentials)
        self.saved.append(dict(credentials))


class FakeHTTP:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def request(self, method, url, **kwargs):
        self.requests.append((method, url, kwargs))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def valid_credentials(**overrides):
    return {
        "version": 1,
        "client_id": "client",
        "client_secret": "secret",
        "access_token": "access",
        "refresh_token": "refresh",
        "expires_at": 4_000_000_000,
        **overrides,
    }


def token_response(**overrides):
    return {
        "access_token": "new-access",
        "refresh_token": "new-refresh",
        "expires_in": 600,
        "scope": readai.SCOPES,
        **overrides,
    }


def transcript_turn(text, start, end, speaker="Chinh"):
    return {
        "text": text,
        "start_time_ms": start,
        "end_time_ms": end,
        "speaker": {"name": speaker},
    }


def hold_credential_lock(state_home, acquired, release):
    os.environ["XDG_STATE_HOME"] = state_home
    with readai.credential_lock():
        acquired.put(os.getpid())
        release.wait(5)


def command_result(stdout=""):
    return mock.Mock(returncode=0, stdout=stdout, stderr="")


class ReadAITest(unittest.TestCase):
    def test_meeting_id_accepts_ulid_and_url(self):
        self.assertEqual(ULID, readai.parse_meeting_id(ULID.lower()))
        self.assertEqual(
            ULID,
            readai.parse_meeting_id(f"https://app.read.ai/analytics/meetings/{ULID}/"),
        )
        with self.assertRaises(argparse.ArgumentTypeError):
            readai.parse_meeting_id("not-a-meeting")
        with self.assertRaises(argparse.ArgumentTypeError):
            readai.parse_meeting_id(f"https://example.com/meetings/{ULID}")
        with self.assertRaises(argparse.ArgumentTypeError):
            readai.parse_meeting_id(f"http://app.read.ai/meetings/{ULID}")

    def test_date_boundaries_follow_daylight_saving_transitions(self):
        timezone = ZoneInfo("America/New_York")
        spring_lower = readai.parse_time_boundary(
            "2026-03-08", upper=False, timezone=timezone
        )
        spring_upper = readai.parse_time_boundary(
            "2026-03-08", upper=True, timezone=timezone
        )
        fall_lower = readai.parse_time_boundary(
            "2026-11-01", upper=False, timezone=timezone
        )
        fall_upper = readai.parse_time_boundary(
            "2026-11-01", upper=True, timezone=timezone
        )
        self.assertEqual(23 * 60 * 60 * 1000, spring_upper - spring_lower)
        self.assertEqual(25 * 60 * 60 * 1000, fall_upper - fall_lower)

    def test_registration_matches_the_mcp_public_client(self):
        http = FakeHTTP(
            [
                {
                    "client_id": "client",
                    "scope": readai.SCOPES,
                }
            ]
        )
        credentials = readai.register_client(http, REDIRECT_URI)
        self.assertEqual("client", credentials["client_id"])
        body = http.requests[0][2]["json_body"]
        self.assertEqual(readai.SCOPES, body["scope"])
        self.assertEqual(readai.EXPECTED_SCOPES, set(body["scope"].split()))
        self.assertEqual([REDIRECT_URI], body["redirect_uris"])
        self.assertEqual("none", body["token_endpoint_auth_method"])

    def test_token_response_rejects_unexpected_scopes(self):
        with self.assertRaises(readai.AuthenticationError):
            readai.updated_credentials(
                valid_credentials(),
                token_response(scope=f"{readai.SCOPES} calendar:read"),
            )

    def test_onepassword_rejects_a_plaintext_credential_field(self):
        with self.assertRaisesRegex(readai.AuthenticationError, "not concealed"):
            readai.OnePasswordStore._credential_field(
                {"fields": [{"id": "credential", "type": "STRING", "value": "x"}]}
            )

    def test_onepassword_ignores_a_label_only_credential_field(self):
        field = readai.OnePasswordStore._credential_field(
            {
                "fields": [
                    {
                        "id": "password",
                        "label": "credential",
                        "type": "CONCEALED",
                        "value": "x",
                    }
                ]
            }
        )
        self.assertIsNone(field)

    def test_onepassword_create_pipes_concealed_credentials(self):
        template = {
            "category": "API_CREDENTIAL",
            "title": "",
            "fields": [{"id": "credential", "type": "CONCEALED", "value": ""}],
        }
        with mock.patch.object(
            readai.subprocess,
            "run",
            side_effect=[
                command_result("[]"),
                command_result(json.dumps(template)),
                command_result("{}"),
            ],
        ) as run:
            readai.OnePasswordStore().save(valid_credentials())
        create = run.call_args_list[2]
        self.assertNotIn("secret", " ".join(create.args[0]))
        created_item = json.loads(create.kwargs["input"])
        field = created_item["fields"][0]
        self.assertEqual("CONCEALED", field["type"])
        self.assertEqual("secret", json.loads(field["value"])["client_secret"])

    def test_onepassword_edit_pipes_rotated_credentials(self):
        item = {
            "id": "item-id",
            "title": readai.ITEM_TITLE,
            "fields": [{"id": "credential", "type": "CONCEALED", "value": "{}"}],
        }
        with mock.patch.object(
            readai.subprocess,
            "run",
            side_effect=[
                command_result(
                    json.dumps([{"id": "item-id", "title": readai.ITEM_TITLE}])
                ),
                command_result(json.dumps(item)),
                command_result("{}"),
            ],
        ) as run:
            readai.OnePasswordStore().save(valid_credentials(refresh_token="rotated"))
        edit = run.call_args_list[2]
        self.assertNotIn("rotated", " ".join(edit.args[0]))
        edited_item = json.loads(edit.kwargs["input"])
        stored = json.loads(edited_item["fields"][0]["value"])
        self.assertEqual("rotated", stored["refresh_token"])

    def test_authorization_url_uses_pkce_state_scopes_and_mcp_resource(self):
        url = readai.authorization_url(
            client_id="client",
            redirect_uri=REDIRECT_URI,
            state="state",
            challenge="challenge",
        )
        parsed = readai.urllib.parse.urlparse(url)
        query = readai.urllib.parse.parse_qs(parsed.query)
        self.assertEqual(
            readai.AUTHORIZATION_URL, f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
        )
        self.assertEqual(["code"], query["response_type"])
        self.assertEqual(["client"], query["client_id"])
        self.assertEqual([REDIRECT_URI], query["redirect_uri"])
        self.assertEqual(["state"], query["state"])
        self.assertEqual(["challenge"], query["code_challenge"])
        self.assertEqual(["S256"], query["code_challenge_method"])
        self.assertEqual([readai.RESOURCE_URL], query["resource"])
        self.assertEqual(readai.EXPECTED_SCOPES, set(query["scope"][0].split()))

    def test_local_callback_captures_code_and_state(self):
        with readai.oauth_callback_server() as (server, redirect_uri):
            thread = threading.Thread(target=server.handle_request)
            thread.start()
            with urllib.request.urlopen(
                f"{redirect_uri}?code=authorization-code&state=expected", timeout=2
            ) as response:
                self.assertEqual(200, response.status)
            thread.join(timeout=2)
            self.assertFalse(thread.is_alive())
            self.assertEqual(
                {"code": ["authorization-code"], "state": ["expected"]},
                server.authorization_result,
            )

    def test_auth_uses_browser_pkce_callback_and_public_token_exchange(self):
        store = FakeStore(None)
        http = FakeHTTP(
            [
                {"client_id": "client", "scope": readai.SCOPES},
                token_response(),
            ]
        )
        callback = mock.MagicMock()
        server = mock.Mock()
        callback.__enter__.return_value = (server, REDIRECT_URI)
        with (
            mock.patch.object(readai, "oauth_callback_server", return_value=callback),
            mock.patch.object(
                readai.secrets, "token_urlsafe", side_effect=["verifier", "state"]
            ),
            mock.patch.object(
                readai, "wait_for_authorization", return_value="authorization-code"
            ) as wait,
            mock.patch("builtins.print"),
        ):
            readai.authenticate(store, http)
        self.assertEqual("new-refresh", store.saved[-1]["refresh_token"])
        wait.assert_called_once()
        method, url, request = http.requests[1]
        self.assertEqual(("POST", readai.TOKEN_URL), (method, url))
        self.assertEqual(
            {
                "grant_type": "authorization_code",
                "code": "authorization-code",
                "redirect_uri": REDIRECT_URI,
                "code_verifier": "verifier",
                "client_id": "client",
                "resource": readai.RESOURCE_URL,
            },
            request["form"],
        )

    def test_interrupted_browser_auth_does_not_replace_credentials(self):
        store = FakeStore(None)
        http = FakeHTTP([{"client_id": "client", "scope": readai.SCOPES}])
        callback = mock.MagicMock()
        callback.__enter__.return_value = (mock.Mock(), REDIRECT_URI)
        with (
            mock.patch.object(readai, "oauth_callback_server", return_value=callback),
            mock.patch.object(
                readai, "wait_for_authorization", side_effect=KeyboardInterrupt
            ),
            self.assertRaises(KeyboardInterrupt),
        ):
            readai.authenticate(store, http)
        self.assertEqual([], store.saved)

    def test_meetings_paginates_with_last_meeting_id(self):
        http = FakeHTTP(
            [
                {"data": [{"id": "first"}], "has_more": True},
                {"data": [{"id": "second"}], "has_more": False},
            ]
        )
        client = readai.ReadAIClient(FakeStore(valid_credentials()), http)
        result = client.meetings(since_ms=100, until_ms=200, limit=2)
        self.assertEqual(
            ["first", "second"], [meeting["id"] for meeting in result["meetings"]]
        )
        self.assertFalse(result["truncated"])
        self.assertIn("start_time_ms.gte=100", http.requests[0][1])
        self.assertIn("start_time_ms.lt=200", http.requests[0][1])
        self.assertIn("cursor=first", http.requests[1][1])

    def test_meetings_reports_a_truncated_result(self):
        client = readai.ReadAIClient(
            FakeStore(valid_credentials()),
            FakeHTTP([{"data": [{"id": "first"}], "has_more": True}]),
        )
        result = client.meetings(since_ms=None, until_ms=None, limit=1)
        self.assertTrue(result["truncated"])

    def test_transcript_normalizes_timestamped_turns(self):
        http = FakeHTTP(
            [
                {
                    "id": ULID,
                    "title": "Planning",
                    "transcript": {
                        "speakers": [{"name": "Chinh"}],
                        "turns": [
                            transcript_turn("later", 20, 30),
                            transcript_turn("earlier", 10, 15),
                        ],
                    },
                }
            ]
        )
        client = readai.ReadAIClient(FakeStore(valid_credentials()), http)
        result = client.transcript(ULID)
        turns = result["transcript"]["turns"]
        self.assertEqual(["earlier", "later"], [turn["text"] for turn in turns])
        self.assertIn("expand%5B%5D=transcript", http.requests[0][1])

    def test_transcript_rejects_missing_speaker_or_timestamps(self):
        for turn in (
            {"text": "missing everything"},
            transcript_turn("", 10, 20),
            {"text": "missing timestamps", "speaker": {"name": "Chinh"}},
            transcript_turn("backwards", 20, 10),
        ):
            with self.subTest(turn=turn):
                client = readai.ReadAIClient(
                    FakeStore(valid_credentials()),
                    FakeHTTP([{"id": ULID, "transcript": {"turns": [turn]}}]),
                )
                with self.assertRaises(readai.ReadAIError):
                    client.transcript(ULID)

    def test_missing_transcript_is_not_reported_as_success(self):
        client = readai.ReadAIClient(
            FakeStore(valid_credentials()), FakeHTTP([{"id": ULID}])
        )
        with self.assertRaises(readai.TranscriptUnavailable):
            client.transcript(ULID)

    def test_expired_token_refreshes_and_persists_rotation(self):
        store = FakeStore(valid_credentials(expires_at=0))
        http = FakeHTTP(
            [
                token_response(),
                {"data": [], "has_more": False},
            ]
        )
        client = readai.ReadAIClient(store, http)
        client.meetings(since_ms=None, until_ms=None, limit=1)
        self.assertEqual("new-refresh", store.saved[0]["refresh_token"])
        self.assertEqual(
            "Bearer new-access", http.requests[1][2]["headers"]["Authorization"]
        )

    def test_unauthorized_request_refreshes_once_and_retries(self):
        store = FakeStore(valid_credentials())
        http = FakeHTTP(
            [
                readai.HTTPFailure(401),
                token_response(),
                {"data": [], "has_more": False},
            ]
        )
        client = readai.ReadAIClient(store, http)
        client.meetings(since_ms=None, until_ms=None, limit=1)
        self.assertEqual(3, len(http.requests))
        self.assertEqual(
            "Bearer new-access", http.requests[2][2]["headers"]["Authorization"]
        )

    def test_rotated_token_save_retries_the_same_credentials(self):
        store = FakeStore(valid_credentials(expires_at=0), save_failures=1)
        client = readai.ReadAIClient(
            store,
            FakeHTTP([token_response(), {"data": [], "has_more": False}]),
        )
        with mock.patch.object(readai.time, "sleep"):
            client.meetings(since_ms=None, until_ms=None, limit=1)
        self.assertEqual("new-refresh", store.saved[0]["refresh_token"])

    def test_rotated_token_save_failure_requires_reauthentication(self):
        store = FakeStore(valid_credentials(expires_at=0), save_failures=3)
        client = readai.ReadAIClient(store, FakeHTTP([token_response()]))
        with (
            mock.patch.object(readai.time, "sleep"),
            self.assertRaisesRegex(readai.AuthenticationError, "immediately"),
        ):
            client.meetings(since_ms=None, until_ms=None, limit=1)

    def test_lock_state_is_private(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            with (
                mock.patch.dict(os.environ, {"XDG_STATE_HOME": temporary_directory}),
                readai.credential_lock(),
            ):
                pass
            state_directory = Path(temporary_directory) / "readai"
            self.assertEqual(0o700, stat.S_IMODE(state_directory.stat().st_mode))
            self.assertEqual(
                0o600,
                stat.S_IMODE((state_directory / "credentials.lock").stat().st_mode),
            )

    def test_lock_excludes_another_process(self):
        context = multiprocessing.get_context("fork")
        with tempfile.TemporaryDirectory() as temporary_directory:
            acquired = context.Queue()
            release = context.Event()
            first = context.Process(
                target=hold_credential_lock,
                args=(temporary_directory, acquired, release),
            )
            second = context.Process(
                target=hold_credential_lock,
                args=(temporary_directory, acquired, release),
            )
            first.start()
            self.assertEqual(first.pid, acquired.get(timeout=2))
            second.start()
            with self.assertRaises(queue.Empty):
                acquired.get(timeout=0.2)
            release.set()
            self.assertEqual(second.pid, acquired.get(timeout=2))
            first.join(timeout=2)
            second.join(timeout=2)
            self.assertEqual(0, first.exitcode)
            self.assertEqual(0, second.exitcode)

    def test_cli_returns_distinct_unavailable_status(self):
        with (
            mock.patch.object(
                readai, "OnePasswordStore", return_value=FakeStore(valid_credentials())
            ),
            mock.patch.object(
                readai, "HTTPClient", return_value=FakeHTTP([{"id": ULID}])
            ),
            mock.patch.object(readai, "credential_lock", mock.MagicMock()),
            mock.patch("sys.stderr"),
        ):
            self.assertEqual(4, readai.main(["transcript", ULID]))


if __name__ == "__main__":
    unittest.main()
