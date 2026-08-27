---
name: readai
description: Gets call transcripts from Read AI. Use when the user asks for a transcript, verbatim dialogue, or who said what in a call or Read AI meeting.
---

# Get a Read AI transcript

1. Resolve one meeting:
   - If the user supplies a meeting ULID or URL, pass it directly to `readai transcript` as one quoted argument.
   - Otherwise, run `readai meetings`. Add `--since` or `--until` with a `YYYY-MM-DD` or ISO 8601 value when the user supplies a time range.
   - Select a meeting only when the result proves it is unique. When `truncated` is `true`, narrow the dates, increase `--limit` up to 100, or ask the user to choose.

2. Fetch the resolved transcript:

   ```bash
   readai transcript '<meeting-ulid-or-url>'
   ```

3. Return the transcript content from the response, preserving speaker attribution and including timestamps when the user requests them. If the transcript is absent or not yet available, state that instead of presenting other meeting fields as a transcript.

If the CLI reports that authentication is missing, ask the user to run `readai auth` in an interactive terminal. Do not attempt to retrieve summaries, metrics, action items, recordings, or other meeting fields.

The workflow is complete only after `readai transcript` has returned the resolved meeting's transcript or reported it unavailable.
