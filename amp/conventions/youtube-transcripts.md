# YouTube transcript conventions

Transcribe YouTube videos with OpenRouter's speech-to-text endpoint. Do not use YouTube captions or local Whisper.

1. Download the audio only with the latest yt-dlp. The Homebrew yt-dlp is outdated and gets HTTP 403:

   ```bash
   uvx --from "yt-dlp[default]@latest" yt-dlp --no-update -f "ba[ext=m4a]/ba" -o "audio.%(ext)s" "<url>"
   ```

2. If the file is over 25 MB, re-encode it before upload: `ffmpeg -i audio.m4a -ac 1 -b:a 32k audio.mp3`.
3. Send it to OpenRouter. Use `$OPENROUTER_API_KEY`; if it is unset, wrap the command in `op run --env-file ~/.credentials/openrouter.env --`:

   ```bash
   curl -sS https://openrouter.ai/api/v1/audio/transcriptions \
     -H "Authorization: Bearer $OPENROUTER_API_KEY" \
     -F file=@audio.m4a -F model=openai/whisper-large-v3-turbo \
     -F response_format=verbose_json -o transcript.json
   ```

   Add `-F language=<iso-639-1>` when the language is known. Read `.text` for the transcript and `.segments[]` (`start`, `text`) for timestamps.

4. Correct obvious mishearings of product and people names from context, and say which ones you changed.

Reference: a 6-minute video took 12 seconds and cost about $0.001.
