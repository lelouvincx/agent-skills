# Amp orbs on Docker Cloud Sandboxes

Source for the `docker-cloud` self-hosted orb provider on Chinh's Mac. [RFC-0017](../docs/rfcs/rfc-0017-self-hosted-amp-orbs-on-docker-cloud-sandboxes.md) explains the design, operation, risks and costs.

## Files

- `dispatch.sh` runs once per orb job from `amp orb provider`. It creates, resumes, stops and removes Docker Cloud sandboxes.
- `refresh-image.sh` copies Amp's orb image to `docker.io/lelouvincx/amp-orb:latest` when its amd64 digest changes.
- `launchd/com.lelouvincx.amp-orb-provider.plist` runs the provider.
- `launchd/com.lelouvincx.amp-orb-refresh.plist` runs the image refresh on Mondays at 10:00 local time.

The plists hold no secrets. The provider reads its token from the Amp CLI's own secret storage.

## The live jobs run from this checkout

Both LaunchAgents run the scripts directly from `/Users/lelouvincx/Developer/agent-skills/amp/orb-docker/`. There is no separate installed copy.

- Keep these scripts on `main`, and merge script changes to `main` before relying on them.
- Do not leave the main checkout on a branch that removes or breaks these files. The provider reads `dispatch.sh` fresh for every job, so a broken branch breaks orbs at once.
- `sync-skills.sh` does not project this directory.

Logs and the refresh lock live in `~/Library/Logs/amp-orb-docker/`, outside the repository:

- `provider.log` holds the provider and dispatch output.
- `refresh-image.log` holds the image refresh output.

## Install the LaunchAgents

Run this on a new Mac, or after changing a plist. Edit the paths in the plists first if the home directory or checkout path differs.

```bash
mkdir -p ~/Library/Logs/amp-orb-docker
for job in amp-orb-provider amp-orb-refresh; do
  install -m 644 amp/orb-docker/launchd/com.lelouvincx.$job.plist ~/Library/LaunchAgents/
  launchctl bootout gui/$(id -u)/com.lelouvincx.$job 2>/dev/null || true
  launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.lelouvincx.$job.plist
done
```

Script changes need no reinstall or restart. The provider also needs the `docker-cloud` provider registered in Amp, `sbx` signed in to Docker, and the docker CLI signed in to Docker Hub for the refresh. RFC-0017 has the details.
