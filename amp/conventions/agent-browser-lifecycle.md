# Browser lifecycle rules

## Managed session workflow

Use `agent-browser-lifecycle` for macOS session work. Read the [command recipe](../agent-browser-lifecycle/reference.md#managed-session-workflow) before first use; use `<command> --help` for syntax.

- Use actual Amp thread IDs, the returned session ID and the same state directory throughout.
- For login reuse across sessions or modes, read [persistent profiles](../agent-browser-lifecycle/reference.md#persistent-profiles). One active session owns the profile until verified closure, regardless of owner or mode.
- Work in your own tab. Pass its stable ID through `exec --tab-id` for every tab action. Prefer semantic selectors; snapshot refs require uninterrupted use.
- On failure, ask the owner to `recover`; never replay the command or launch a replacement before verified closure.
- The owner calls `stop`. Done means `closed`, not a successful shutdown request. For `cleanup-pending`, inspect `pending_reasons` and follow [recovery](../agent-browser-lifecycle/reference.md#recovery-and-retired-files).

## Subagent sharing

Before handoff or handling `draining`, read [sharing](../agent-browser-lifecycle/reference.md#subagent-sharing). Children must confirm attachment, use their own tabs, then close those tabs and confirm detachment. The owner retains shutdown responsibility.

## Retired files

Closed sessions may retain untracked helpers until reboot and ephemeral private files until `sweep`. Persistent profiles and their session artifacts are excluded from automatic sweep; deletion requires explicit human approval. They are not active claims. For disk cleanup, read [sweep rules](../agent-browser-lifecycle/reference.md#recovery-and-retired-files).

## Legacy/manual sessions

For non-macOS, debugging or explicit legacy work, follow the [manual procedure](../agent-browser-lifecycle/reference.md#legacymanual-sessions). A managed failure does not authorize this fallback.

## Managed launch foundation

For implementation or journal maintenance only, read the [state contract](../agent-browser-lifecycle/reference.md#state-contract) and [launch-gate contract](../agent-browser-lifecycle/reference.md#managed-launch-foundation).
