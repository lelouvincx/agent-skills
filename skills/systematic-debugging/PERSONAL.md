## Local workflow mappings

- Use the `tdd` skill where the upstream skill refers to `superpowers:test-driven-development`.
- Use `verification-before-completion` directly where the upstream skill uses its Superpowers-qualified name.
- Put one-off reproductions, diagnostic logs, and other local scratch artifacts under `.amp/in/artifacts/` when they do not belong in the source tree.
- For secret-looking environment variables, report only the variable name and whether its value is set, empty, an `op://` reference, or plaintext. Never print the value or use diagnostics such as `env | grep` when they may expose it.
