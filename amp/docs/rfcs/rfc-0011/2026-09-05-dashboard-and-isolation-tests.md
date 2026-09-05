# RFC-0011 experiment: dashboard sign-in and session isolation

Supporting evidence for [RFC-0011: Quiet browser sessions and approved authentication](../rfc-0011-quiet-browser-sessions-and-approved-authentication.md).

## Live tests on 5 September 2026

Two subagents tested installed agent-browser 0.36.0 with headless system Chrome and local synthetic data. The [dashboard test thread](https://ampcode.com/threads/T-01a070f6-00d8-72d3-87fe-64a24e0e731e) exercised the actual UI through a second headless browser. The [isolation test thread](https://ampcode.com/threads/T-01a070f6-6bff-7019-ad5a-f7f1c7dea454) exercised native stream clients and a real cross-thread handoff.

| Test | Observed result |
| --- | --- |
| Dashboard keyboard sign-in | Failed. Separate key presses submitted `dashboard-test@exampleinvalid` instead of `dashboard-test@example.invalid`. The unchanged fixture rejected the login. |
| Viewer CLI `keyboard type`, Tab and Enter | Failed. Fake credentials reached dashboard AI Chat, not the remote form. Chat returned a missing-gateway-key error. This did not test physical human typing or paste. |
| Session isolation | Passed. Two concurrent profiles kept different cookies, local storage, session storage and input values on the same origin. A's input and shutdown left B unchanged. |
| Stream defaults and shutdown | First attachment enabled the listener without an explicit enable call. Disabling closed both open clients, removed the listener and refused new clients. It stayed disabled through an ordinary CLI command. Re-enabling changed only the stream port. |
| Input coordination | Both stream clients and CLI commands could supply input concurrently. There is no built-in exclusive human-input lock. |
| Cross-thread lifecycle handoff | Owner shutdown was rejected while the parent thread was attached. Closing the parent's dedicated tab and detaching allowed normal shutdown. |
| Namespace and daemon naming | A dedicated namespace excluded unrelated sessions from dashboard discovery. Full UUID daemon names failed the macOS socket-path limit: 107 bytes against a 103-byte maximum. Short mapped names worked. |
| Dashboard reconnect and URL | Navigating the viewer away and back preserved the target PID, profile, CDP port and page target. The root dashboard URL worked; adding `?port=49536` returned a download instead of HTML. |

## Source analysis

The [dashboard key handler](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/packages/dashboard/src/components/viewport.tsx#L360-L398) maps `.` to virtual-key code 46 rather than 190. It also sends `text: "."`, so the source shows inconsistent metadata, not proof by itself of Chrome's interpretation. The observed missing dot is a failed acceptance test regardless of the precise cause.

The native [typing implementation](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/cli/src/native/interaction.rs#L239-L297) uses `Input.insertText` for printable characters. The dashboard forwards canvas keydown and keyup events instead. [Chat persists messages in local storage](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/packages/dashboard/src/components/chat-panel.tsx#L397-L426); a missing gateway key is not a privacy boundary. No real secrets were used, and the [missing-key branch](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/cli/src/native/stream/chat.rs#L667-L689) returned before gateway requests. The tests do not establish that physical human typing would follow the same Chat failure path.

## Limits and cleanup

The isolation harness initially recorded `ready` before successful CLI URL/title checks because a pipeline hid an error. Those checks passed before the tests and handoff; history was not rewritten. This run does not validate strict readiness-publication ordering. Native authentication, real accounts, Touch ID, passkeys and physical desktop focus remain untested. Both workers stopped their browsers and services, removed their profiles and recorded terminal lifecycle events. No test sessions remain active.

## Human typing follow-up on 5 September 2026

Chinh used the actual dashboard in the [RFC design thread](https://ampcode.com/threads/T-01a06fe4-8468-755a-911b-48950a722cb9). The target was a fresh headless Chrome session, with its own profile and CDP port 9241. Namespace `r11-human` exposed only the synthetic `human-login` session. Automated browser input remained paused throughout the human attempt.

The fixture still required `dashboard-test@example.invalid` and `fake-dashboard-only`. HTTP-only setup checks accepted the exact pair and rejected the missing-dot email; they did not authenticate the browser. The server logged only match booleans, not submitted values.

Chinh reported: “you’re right, i can’t type the dot”. This reproduces the missing-dot symptom with physical human typing, not `keyboard type` or scripted key presses. It does not isolate the underlying key-mapping cause or establish successful sign-in. Clipboard forwarding remains unverified; the earlier question about copy-paste is not a recorded paste experiment.

Chinh approved headless routine work and explicitly approved fresh headed sessions for human sign-in. Dashboard authentication remains blocked pending input fixes and retesting. Dedicated profiles, CDP ports and lifecycle ownership are unchanged.

After the decision, the owner disabled streaming, recorded `stopping`, disconnected the daemon and received a CDP `Browser.close` acknowledgement. Chrome, fixture and dashboard processes and their listeners were verified absent before profile removal. The lifecycle recorded `stopped` at 10:31:57 UTC. The temporary fixture was removed; unrelated sessions were left untouched.
