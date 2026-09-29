# Cloudflare conventions

- Use `cf` as the default Cloudflare CLI. Discover unfamiliar operations with `cf cli search`, then inspect the command's help or schema instead of guessing from Wrangler.
- Keep `cf`'s JSON output and filter it with `jq`.
- Prefer `cloudflare.config.ts` and Vite for Workers. Use Wrangler only when `cf` delegates to it or a verified compatibility blocker requires it.
