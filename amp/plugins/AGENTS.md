# Amp plugin instructions

## Docs-first workflow

- Do not change a plugin capability before updating its source-of-truth document under `../docs/tools/`.
- Keep plugin behavior aligned with the documented contract, then run `./sync-skills.sh` from the repository root.
- Prefer title case when registering commands. For example: "Logseq: Log Current Task" or "ChatGPT: Usage".

## Built-in medium mode default rationale

Rationale: [Amp's Dial announcement](https://ampcode.com/news/the-dial) says `medium` is backed by GPT-5.5 at medium reasoning effort. Chinh prefers this default while `medium` uses OpenAI models; reconsider if Amp changes `medium` away from OpenAI.
