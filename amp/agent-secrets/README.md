# Agent secrets

`bundles.json` is the source of truth for secret capability bundles. Each bundle lists the variables it can resolve and the registered command classes that may receive them. Private files contain only 1Password references and stay outside this repository.

## Runtime and doctor checks

`agent-secrets run` is the hot path. It validates the selected bundle files, command class, child environment and selected 1Password references. In service-account mode, it does not list vaults or run the full posture check.

`agent-secrets doctor` is the broad check. In service-account mode, it validates that the service account can access exactly the `Agent Secrets` vault, reads every registered reference, and probes that authentication variables do not reach child processes.
