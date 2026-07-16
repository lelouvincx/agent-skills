---
name: readai
description: Gets call transcripts from Read AI. Use when the user asks for a transcript, verbatim dialogue, or who said what in a call or Read AI meeting.
---

# Get a Read AI transcript

1. Resolve one Read AI meeting ULID:
   - If the user provides a ULID, use it unchanged.
   - If the user provides a Read AI meeting URL, parse the final non-empty path segment and verify that it is a 26-character ULID.
   - Otherwise, use `mcp__readai__list_meetings`, applying any time range the user supplied. Select a meeting only when the result is unambiguous; otherwise ask the user to choose from the candidate meetings.

2. Fetch the resolved meeting with `mcp__readai__get_meeting_by_id`. Always request the transcript explicitly:

   ```json
   {
     "id": "<meeting-ulid>",
     "expand": ["transcript"]
   }
   ```

3. Return the transcript content from the response, preserving speaker attribution and including timestamps when the user requests them. If the transcript is absent or not yet available, state that instead of presenting other meeting fields as a transcript.

The workflow is complete only after `mcp__readai__get_meeting_by_id` has been called for the resolved ULID with `expand: ["transcript"]` and its transcript result has been returned or reported unavailable.
