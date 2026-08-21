# Python conventions

- Use `uv` for Python project setup, virtual environments, dependency management, lockfile syncing, and running project commands or scripts. Reuse the repository's existing `pyproject.toml`, `uv.lock`, and documented commands when present.
- Use `uvx` for ephemeral Python CLI tools that do not belong in a project's dependencies.
- Follow a repository's explicitly required toolchain instead of converting it solely to use `uv`. Use another tool only when `uv` is unavailable or the integration requires it, and avoid global package installs.
