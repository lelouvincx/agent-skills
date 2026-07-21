---
name: reading-social-posts
description: Reads public social posts through TikHub with uvx, downloads every attached image or video, and inspects the media. Use when asked to read TikTok, X, Reddit, LinkedIn, or other social post URLs with TikHub.
---

# Read social posts through TikHub

Use the **fast path**: make the first TikHub request immediately, then investigate only a concrete failure.

## Fetch

Resolve `TIKHUB_API_KEY` at execution time without printing it:

```bash
op run --env-file ~/.credentials/env -- uvx tikhub fetch '<url>'
```

Use `tikhub fetch` first for TikTok and other video URLs. Save its JSON to a temporary file so one paid response supplies the post text, metadata, and media URLs.

For X, Reddit, LinkedIn, or multiple mixed posts that the CLI cannot fetch, use one `uvx --from tikhub python` process and the generated SDK resources:

| Platform | Resource method | ID from URL |
| --- | --- | --- |
| X | `client.twitter_web.fetch_tweet_detail(tweet_id=...)` | Numeric status ID |
| Reddit | `client.reddit_app.fetch_post_details(post_id=..., need_format=True)` | Prefix the short post ID with `t3_` |
| LinkedIn | `client.linkedin_web.get_post_detail(post_id=...)` | Numeric activity/share ID |

Set `parse_response=False`, call `.json()` on each response, and retain the raw JSON until every attachment has been inspected. Fetch independent posts in the same process; do not start a fresh `uvx` environment for each URL.

The fetch step is complete when every requested URL has either returned post data or reached the failure budget below.

## Download and inspect every attachment

In the fetch command or its immediate follow-up:

1. Extract the author, caption/body, creation time, engagement counts, media type, and every image/video URL.
2. Download all media under `.amp/in/artifacts/social-posts/<platform>/`. Prefer original-resolution image URLs and non-watermarked video play URLs when TikHub provides them.
3. Call `view_media` for every downloaded image and video. Run independent image inspections in parallel.
4. For videos, ask for a chronological description, visible-text transcription, audio/dialogue summary, setting, actions, edits, and likely point.
5. For image posts, state explicitly when the API confirms there are no attachments.

The media step is complete only when the number of inspected files matches the attachments returned by TikHub.

## Failure budget

Keep recovery tight:

- **HTTP 402:** run `uvx tikhub user info` once, report paid/free balance status without exposing account secrets, and stop until the user adds paid balance.
- **HTTP 400/422:** inspect the endpoint in TikHub's live OpenAPI document once, correct the parameter shape, and retry once.
- **HTTP 404 or stale share URL:** resolve the public URL's canonical redirect once and retry its canonical ID or URL once.
- **HTTP 200 with empty data:** check the platform's native ID form once, such as Reddit's `t3_` prefix, then retry once.
- **Provider still fails:** report the TikHub request ID and failure. If the user asked for the post's contents rather than a TikHub-only diagnostic, read the public page as a clearly labelled fallback and inspect its media; do not present fallback data as TikHub data.

Do not probe multiple guessed IDs, URNs, slugs, search variants, or SDK versions after the corrected retry fails.

## Return

For each post, provide:

- author and concise content summary
- important claims, offer, joke, or argument
- useful engagement metadata
- attachment count and a description of each attachment
- links to downloaded artifacts when useful
- a short retrieval note only when TikHub failed or a fallback was required

The workflow is complete when every requested post is accounted for and every returned attachment has been viewed.
