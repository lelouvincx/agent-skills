---
doc_schema: "amp-rfc/v1"
code: "RFC-0017"
title: "Self-hosted Amp orbs on Docker Cloud Sandboxes"
slug: "self-hosted-amp-orbs-on-docker-cloud-sandboxes"
file: "rfc-0017-self-hosted-amp-orbs-on-docker-cloud-sandboxes.md"
status: "Implemented"
summary: "Run Amp orbs as Docker Cloud Sandboxes through a personal self-hosted orb provider on Chinh's Mac, paid by Docker's $250 sign-up credit."
created: "2026-11-16"
updated: "2026-11-16"
amp_thread_id:
  T-01a1d9c3-2570-73ea-9da5-945b146f72af: "planned the setup, compared prices, owns the plan artifact"
  T-01a1e340-0de7-767d-bfea-eb7767aef04e: "installed sbx, copied the image, wrote and tested dispatch.sh, registered the provider, ran Phases 4 and 5"
  T-01a1e43c-88bc-70eb-8e99-5c65906b339b: "wrote this RFC"
dependency: []
implementation:
  - path: "../../orb-docker/dispatch.sh"
  - path: "../../orb-docker/refresh-image.sh"
  - path: "../../orb-docker/launchd/com.lelouvincx.amp-orb-provider.plist"
  - path: "../../orb-docker/launchd/com.lelouvincx.amp-orb-refresh.plist"
inputs:
  - name: "Amp orb provider job"
    kind: "environment variables set by `amp orb provider`"
    purpose: "ORB_OPERATION (spawn, pause or delete), ORB_ID, and for spawn ORB_TOKEN and ORB_TYPE when the thread has one; AMP_URL only when the server is not ampcode.com."
  - name: "AMP_ORB_* settings"
    kind: "environment variables"
    purpose: "Image, size, time limit and carry-over threshold for dispatch.sh."
outputs:
  - name: "Docker Cloud Sandbox named ORB_ID"
    kind: "cloud microVM"
    purpose: "Runs `amp orb bootstrap`, which connects the orb to its Amp thread."
  - name: "Carry-over templates ORB_ID-disk-<unix time>"
    kind: "Docker Cloud template"
    purpose: "Keep an orb's disk across Docker's 24-hour sandbox cap."
supersedes: []
superseded_by: null
related:
  - path: "./rfc-0015-personal-project-agent-infrastructure.md"
    purpose: "Orbs started by this provider still run each project's .agents/setup from that RFC."
tags: [orbs, infrastructure, docker, costs]
---

# RFC-0017: Self-hosted Amp orbs on Docker Cloud Sandboxes

## Summary

Amp threads started with the `docker-cloud` orb provider run their orbs as Docker Cloud Sandboxes instead of Amp-hosted orbs. A provider process on Chinh's Mac receives jobs from Amp and runs `dispatch.sh`, which drives the `sbx --cloud` CLI.

Status on 16 November 2026:

- Phases 1 to 5 are done: Docker account, open-question spike, dispatch script, end-to-end test and a launchd service.
- Every end-to-end check passed after two script fixes. See [Test results](#test-results).
- The provider runs as the LaunchAgent `com.lelouvincx.amp-orb-provider`. It reads its token from the Amp CLI's own secret storage, so no 1Password item is needed.
- Tests on Docker credit cost about $0.63 in total, estimated.

Sources:

- [Plan and test results](https://ampcode.com/artifacts/plan-self-hosted-amp-orbs-on-docker-cloud-sandboxes-a07a0d8c-e93c-47b8-8c18-9b442efdba7c), the main record, including the full script and every test.
- [Planning thread](https://ampcode.com/threads/T-01a1d9c3-2570-73ea-9da5-945b146f72af), including the price comparison.
- [Install and test thread](https://ampcode.com/threads/T-01a1e340-0de7-767d-bfea-eb7767aef04e), which ran Phases 1 to 5.

## Context

Docker gives new Docker Agentic Platform sign-ups a one-time $250 compute credit. Amp lets any machine act as an orb provider through a small dispatch contract, and self-hosted orbs are free on Amp's Hobby, Individual and Teams plans. Together, these let Chinh run orbs on Docker's credit.

Amp publishes no example for Docker Cloud Sandboxes, so the plan tested every assumption before relying on it.

Guides:

- [Amp: Self-Hosted Orbs](https://ampcode.com/docs/orbs/self-hosted) covers the provider, dispatch contract and orb image.
- [Docker: Use cloud sandboxes](https://docs.docker.com/ai/sandboxes/cloud/usage) covers create, exec, stop, time limits and templates.
- [Docker: $250 promo terms](https://www.docker.com/c/sbx-promo/).

## Decision

- Run one personal orb provider named `docker-cloud` on Chinh's Mac, as a LaunchAgent.
- Size each sandbox from the thread's orb type, `a1.tiny` to `a1.xxlarge`, with Medium (4 CPU, 8 GiB) as the default. Create sandboxes from the public copy `docker.io/lelouvincx/amp-orb:latest`, refreshed weekly by a LaunchAgent.
- Give each sandbox a 30-minute time limit that stops it, as a safety net when a pause job is missed.
- Carry the disk over to a new sandbox before Docker's 24-hour cap, using templates.
- Ignore Amp project snapshots for now, so every new thread runs `.agents/setup`.
- Use the credit, then decide whether to keep the setup or return to Amp-hosted orbs. See [Costs](#costs).

`docker-cloud` is not the default orb provider. Chinh picks it per thread.

## Contract

### How the pieces fit

1. Amp sends a job to `amp orb provider`, which runs on the Mac.
2. The provider runs `dispatch.sh` once per job.
3. `dispatch.sh` calls `sbx --cloud …` to create, resume, stop or remove a sandbox named `$ORB_ID` (`amp-<thread id>`).
4. On spawn, `dispatch.sh` starts `amp orb bootstrap` inside the sandbox, detached, as `user`.
5. The bootstrap process connects back to the thread on ampcode.com.

After step 5 the orb talks to Amp directly, so the Mac can sleep while a thread works. The Mac must be awake for every later job: pause, spawn (wake) and delete.

### Dispatch operations

| Operation | What `dispatch.sh` does |
| --- | --- |
| `spawn` | Creates the sandbox if missing, from the newest carry-over template or else the image, sized by `ORB_TYPE`. Resumes it if stopped. Carries the disk over if less than `AMP_ORB_CARRY_OVER_BELOW` seconds remain before the 24-hour cap. Then starts `amp orb bootstrap`. |
| `pause` | Runs `sbx --cloud stop`, which keeps memory and disk. Does nothing if the sandbox is missing, stopped or stopping. |
| `delete` | Removes the sandbox, then every `$ORB_ID-disk-*` template. |

Every operation is safe to repeat and has fitted Amp's 5-minute job limit in tests. The slowest case seen was 199 s, a carry-over right after a pause.

Amp sets these variables:

- `ORB_OPERATION` and `ORB_ID` for every job
- `ORB_TOKEN` for spawn, minted for one spawn and valid for 15 minutes
- `ORB_TYPE` for spawn when the thread has an orb type
- `ORB_SNAPSHOT_ID` sometimes, which `dispatch.sh` ignores
- `AMP_URL` only when the server is not ampcode.com, so it is unset for normal use

`dispatch.sh` passes `AMP_URL` into the sandbox only when it is set. A missing `ORB_OPERATION`, `ORB_ID` or `ORB_TOKEN` exits 1.

### Orb types

The orb types registered on `docker-cloud` match Amp's size names. Amp sends them with hyphens, such as `ORB_TYPE=a1-small`, so `dispatch.sh` accepts both `a1-small` and `a1.small`.

| Orb type | CPUs | Memory |
| --- | --- | --- |
| `a1.tiny` | 1 | 2 GiB |
| `a1.small` | 2 | 4 GiB |
| `a1.medium` (default) | 4 | 8 GiB |
| `a1.large` | 8 | 16 GiB |
| `a1.xxlarge` | 16 | 32 GiB |

The type applies only when a sandbox is created. Resumes and carry-overs keep the size. Without `ORB_TYPE`, spawn uses `AMP_ORB_CPUS` and `AMP_ORB_MEMORY`. Any other type exits 1 and creates nothing.

### Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `AMP_ORB_IMAGE_REF` | `docker.io/lelouvincx/amp-orb:latest` | Image for new sandboxes |
| `AMP_ORB_CPUS` | `4` | CPUs when `ORB_TYPE` is unset (Medium) |
| `AMP_ORB_MEMORY` | `8g` | Memory when `ORB_TYPE` is unset (Medium) |
| `AMP_ORB_TTL` | `30m` | Time limit per run |
| `AMP_ORB_CARRY_OVER_BELOW` | `7200` | Seconds before the 24-hour cap at which spawn carries the disk over |

### Files

The scripts and LaunchAgents live in this repository under [`amp/orb-docker/`](../../orb-docker/README.md):

| Repository path | Purpose |
| --- | --- |
| [`amp/orb-docker/dispatch.sh`](../../orb-docker/dispatch.sh) | Dispatch script |
| [`amp/orb-docker/refresh-image.sh`](../../orb-docker/refresh-image.sh) | Weekly image refresh script |
| [`amp/orb-docker/launchd/com.lelouvincx.amp-orb-provider.plist`](../../orb-docker/launchd/com.lelouvincx.amp-orb-provider.plist) | LaunchAgent that runs the provider |
| [`amp/orb-docker/launchd/com.lelouvincx.amp-orb-refresh.plist`](../../orb-docker/launchd/com.lelouvincx.amp-orb-refresh.plist) | LaunchAgent that runs the refresh on Mondays at 10:00 local time |

On the Mac:

| Path | Purpose |
| --- | --- |
| `~/Library/LaunchAgents/com.lelouvincx.amp-orb-provider.plist` | Installed copy of the provider LaunchAgent |
| `~/Library/LaunchAgents/com.lelouvincx.amp-orb-refresh.plist` | Installed copy of the refresh LaunchAgent |
| `~/Library/Logs/amp-orb-docker/provider.log` | Provider and dispatch log, the LaunchAgent's stdout and stderr |
| `~/Library/Logs/amp-orb-docker/refresh-image.log` | Refresh log, one timestamped line per step |
| `~/Library/Logs/amp-orb-docker/.refresh-image.lock` | Refresh lock, present only during a run |

The live provider and refresh job run the scripts directly from the main checkout, `/Users/lelouvincx/Developer/agent-skills`. There is no separate installed copy. So:

- keep the scripts on `main`, and merge script changes before relying on them
- do not leave the main checkout on a branch that removes or breaks these files; the provider reads `dispatch.sh` fresh for every job, so a broken branch breaks orbs at once
- after changing a plist, reinstall it as shown in [Install the LaunchAgents](#install-the-launchagents); script changes need no reinstall or restart

The LaunchAgent runs `/Users/lelouvincx/.amp/bin/amp orb provider /Users/lelouvincx/Developer/agent-skills/amp/orb-docker/dispatch.sh` with:

- `RunAtLoad` and `KeepAlive`, so it starts at login and restarts after a crash
- `ThrottleInterval` 10 s, so a crash loop does not hammer ampcode.com
- `HOME` set, and `PATH` = `~/.amp/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`
- `WorkingDirectory` `~/Library/Logs/amp-orb-docker`, so nothing it writes lands in the repository

### Provider token

`amp orb provider` reads the provider token from the Amp CLI's own secret storage, `~/.local/share/amp/secrets.json`. `manage_amp orb_providers create` saved it there when the provider was registered, and the LaunchAgent can read it. The plist, the start command and this repository hold no token. This replaces the earlier plan to resolve the token from 1Password.

## Behavior

### Image copy

Docker Cloud pulls `--image-ref` only from `docker.io`, `registry-1.docker.io`, `index.docker.io` and `dhi.io`. It rejects Amp's registry, `us-central1-docker.pkg.dev`. So the orb image is a registry-to-registry copy at `docker.io/lelouvincx/amp-orb:latest`.

The copy is public. It started private, but Docker cannot save templates from sandboxes booted from a private image, which broke the carry-over. Before publishing, its manifests were checked byte for byte against Amp's image. Amp's image is already publicly pullable.

A LaunchAgent refreshes the copy every Monday. See [Weekly image refresh](#weekly-image-refresh).

### Weekly image refresh

Every Monday at 10:00 local time, launchd runs `refresh-image.sh`. If the Mac is asleep then, the run happens on wake. The script:

1. compares the linux/amd64 manifest digest in Amp's `amp-orb:latest` index with the one in `docker.io/lelouvincx/amp-orb:latest`; it never compares index digests, because our index is rebuilt from the single amd64 manifest
2. logs one skip line and exits 0 when the digests match
3. otherwise copies Amp's image by digest with `docker buildx imagetools create`
4. checks that our `latest` now points at the new amd64 digest, and that the repository is public with only the `latest` tag

The script also:

- starts OrbStack if it is not running, because OrbStack provides the docker engine and BuildKit for the copy
- takes a lock, so a second run during a copy exits 1; a lock left by a dead run is taken over
- exits non-zero on any failure, with a `FAILED:` line in the log

Refresh weekly, not on every Amp push. Amp pushes a new `latest` many times a day, and the plan records that an orb gets the current `amp` CLI when it starts anyway.

New sandboxes use the refreshed image. Existing sandboxes and carry-over templates keep their old image until their thread is deleted.

Tested on 16 November 2026: the first manual run copied `sha256:84b7e2cc…` over `sha256:0dbf1440…` in 60 s, because most layers were already on Docker Hub, and passed verification. Later manual and `launchctl kickstart` runs skipped with exit 0. A run started during the copy exited 1 on the lock. The launchd job can read the Docker Hub credential in the keychain. Details are in the plan's "Weekly image refresh" section.

### 30-minute time limit

Each sandbox is created with `--ttl 30m --on-timeout stop`:

- When the limit passes, Docker freezes the sandbox. Processes and memory survive, and the next `exec` resumes them.
- Each resume starts a new 30-minute limit.
- `sbx --cloud ttl +30m <name>` extends a running sandbox.

A freeze mid-turn does not lose the turn:

1. The thread shows "Reconnecting to orb".
2. About 2 minutes later, Amp sends a new spawn on its own.
3. `dispatch.sh` resumes the sandbox in about 9 s.
4. The original `amp orb bootstrap` is still running, reconnects, and the stalled tool calls finish.
5. The second bootstrap that spawn started exits, with no conflict.

So a long turn cut by the limit pauses for about 2 minutes and then carries on.

The time limit, not Amp's pause, ends most idle billing. Amp's idle pause arrived 23 to 36 minutes after a thread went idle, so the 30-minute limit often stops the orb first. An idle orb therefore costs up to about $0.14 of Medium per wake. A missed pause, for example while the Mac sleeps, costs the same.

### 24-hour carry-over

Docker caps a sandbox at 24 hours from creation, counting stopped time. Resuming does not reset that cap. So every orb reaches the cap one day after its thread starts.

When spawn finds less than `AMP_ORB_CARRY_OVER_BELOW` seconds left, it:

1. starts the sandbox if stopped, because only a running sandbox can be saved
2. saves it as template `$ORB_ID-disk-<unix time>`
3. removes the sandbox
4. creates a new sandbox with the same name from that template, which gets a fresh 24-hour cap
5. removes the orb's older templates

Each carry-over uses a new template name because Docker cannot remove a template while a sandbox made from it exists. If carry-over fails, spawn keeps the current sandbox and continues.

Tested in Phase 3 on the real image: files and checksums survived, the cap was fresh and `amp` started. Not tested: an orb that is not woken before its cap passes. The script then removes the sandbox and recreates it from the newest template, or from the image, but the disk may be lost.

### Thread lifecycle in Amp

- **Early pause:** soon after a new thread's first spawn (7 s and 11 s in tests), Amp sends a pause with `ORB_SNAPSHOT_ID` set, then a spawn again. That resume took 99 to 104 s, mostly waiting for Docker to finish stopping.
- **Idle pause:** Amp sends a pause 23 to 36 minutes after a thread goes idle. Often the 30-minute limit has already stopped the orb, and the pause finds it stopped.
- **Wake:** the next message sends a spawn. After the limit stopped an orb, it resumed in 10 s with files and the same processes, including a running portal server.
- **Archive:** archiving a thread does not send a delete. The stopped sandbox stays, at no compute cost.
- **Delete:** deleting a thread sends a delete. It removed the sandbox and its templates in about 6 s.
- **One job at a time:** the provider runs jobs one after another. A slow resume delays every spawn queued behind it, so busy periods queue spawns.
- **Provider down:** while the provider is stopped, the 30-minute limit still stops running orbs. After a restart, Amp does not replay jobs it could not deliver.

### Test results

All tests ran on 16 November 2026. Details are in the plan's "Phase 4 results" and "Phase 5 results" sections.

| Check | Result |
| --- | --- |
| Spawn, cold create | Pass: 27 s and 64 s for Medium, 26 s for `a1.small`, 58 s for `a1.tiny` |
| Terminal and portal | Pass, opened by Chinh |
| Pause and resume, files kept | Pass |
| Freeze mid-turn | Pass: Amp re-spawned after about 2 minutes and the turn finished |
| Two bootstraps after a re-spawn | No conflict |
| 30-minute limit with the provider stopped | Pass: the idle orb stopped at its limit |
| Delete | Pass: sandbox and templates removed |
| LaunchAgent start and `kickstart -k` restart | Pass: one provider process, `last exit code = 0` |
| Orb types | Pass: sizes match the table; unknown types exit 1 and create nothing |

Two script fixes came out of the tests:

- **`AMP_URL`:** Amp leaves `AMP_URL` unset for ampcode.com. The script required it, and the Mac's bash 3.2 lost the `${VAR:?}` failure status, so the first real spawn exited 0 in 417 ms without creating anything. Amp treated the orb as starting and did not retry. The script now passes `AMP_URL` only when set, checks required variables with an explicit `exit 1`, and keeps the exit code in its `EXIT` trap.
- **Orb type names:** Amp sends `a1-small`, not `a1.small`. The first typed spawn failed with `unknown orb type 'a1-small'`. The script now accepts both forms.

When the LaunchAgent replaced the tmux provider, Amp still listed the old connection. The new provider logged `Another amp orb provider is connected for this token` and waited about 48 s before `Orb provider started`.

## Permissions and side effects

- The provider holds a personal Amp orb provider token. Run exactly one provider process per token.
- `dispatch.sh` creates, stops and removes Docker Cloud sandboxes and templates in Chinh's Docker account. Running sandboxes cost money; see [Costs](#costs).
- `dispatch.sh` passes `ORB_TOKEN` into the sandbox with `sbx --cloud exec -e`. The token is minted for one spawn and expires after 15 minutes.
- Inside the sandbox, `amp orb bootstrap` logs to `~/.amp-bootstrap.log`.
- Sandboxes have open outbound network access. `sbx --cloud policy ls` shows `deny-all` with no rules, but every tested host was reachable. The network policy is an open decision.
- `docker.io/lelouvincx/amp-orb` is a public Docker Hub repository. Push only unchanged copies of Amp's image to it.
- Do not paste the provider token, `ORB_TOKEN` values or the raw provider log into threads or docs. Filter the log as shown below.

## Examples

### Operate the provider

Check its status:

```bash
launchctl print gui/$(id -u)/com.lelouvincx.amp-orb-provider | grep -E 'state|pid|last exit'
pgrep -fl 'amp orb provider'
```

Restart it:

```bash
launchctl kickstart -k gui/$(id -u)/com.lelouvincx.amp-orb-provider
```

The provider finishes running jobs, stops, and starts again about 2 s later. It runs `dispatch.sh` fresh for each job, so script edits take effect without a restart.

Read its log:

```bash
tail -f ~/Library/Logs/amp-orb-docker/provider.log
```

Disable it, and turn it back on:

```bash
launchctl bootout gui/$(id -u)/com.lelouvincx.amp-orb-provider
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.lelouvincx.amp-orb-provider.plist
```

While the provider is stopped, `docker-cloud` threads cannot start or wake, and running orbs stop at their 30-minute limit.

Run exactly one provider per token. Before running `amp orb provider` by hand for debugging, disable the LaunchAgent.

### Install the LaunchAgents

Run this from the main checkout on a new Mac, or after a plist change is merged. Only one provider may run: after the bootstrap, wait for `Orb provider started` in the log, which can take about 48 s while Amp drops the old connection.

```bash
cd ~/Developer/agent-skills && git switch main && git pull --ff-only
mkdir -p ~/Library/Logs/amp-orb-docker
for job in amp-orb-provider amp-orb-refresh; do
  install -m 644 amp/orb-docker/launchd/com.lelouvincx.$job.plist ~/Library/LaunchAgents/
  launchctl bootout gui/$(id -u)/com.lelouvincx.$job 2>/dev/null || true
  launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.lelouvincx.$job.plist
done
grep 'Orb provider started' ~/Library/Logs/amp-orb-docker/provider.log | tail -1
pgrep -fl 'amp orb provider'   # exactly one
```

### Roll back

1. Disable both LaunchAgents and delete their plists from `~/Library/LaunchAgents/`.
2. In Amp **Settings → Orbs**, remove `docker-cloud` or rotate its token.
3. Remove leftover sandboxes and templates listed by `sbx --cloud ls` and `sbx --cloud template ls`.
4. Optionally delete `~/Library/Logs/amp-orb-docker/`. The scripts can stay in the repository.

To roll back only a script change, revert it on `main`. The next job uses the reverted script.

### Use it in a thread

Pick `docker-cloud` as the thread's orb provider, and an orb type if Medium is not the right size.

### Debug

Read the provider log without tokens:

```bash
grep -viE 'aop_live|ORB_TOKEN=' ~/Library/Logs/amp-orb-docker/provider.log | tail -40
grep -E 'Claimed job|Completed job' ~/Library/Logs/amp-orb-docker/provider.log | tail -20
```

Each job logs `dispatch[<op> <orb id>]: start` and `exit <code>` lines. The provider also logs repeated `Could not answer a spawn log read` and `Could not wait for spawn log reads; retrying` warnings. So far they have not broken any spawn.

Check sandboxes, templates and time left:

```bash
sbx --cloud ls
sbx --cloud template ls
sbx --cloud ttl <orb id> --json   # max_remaining_seconds, expires_in_seconds, stopped
sbx --cloud diagnose
```

Look inside a sandbox, with tokens redacted:

```bash
sbx --cloud exec <orb id> bash -c 'ps -eo pid,user,etime,cmd | grep -E "orb bootstrap|headless"; tail -c 600 ~/.amp-bootstrap.log' \
  | sed -E 's/(ORB_TOKEN=)[^ ]+/\1[redacted]/g'
```

Run one operation by hand with a fake token. Amp rejects the token, which still proves the sandbox and `amp` start:

```bash
cd ~/Developer/agent-skills/amp/orb-docker
ORB_OPERATION=spawn ORB_ID=amp-manual-test ORB_TOKEN=fake AMP_ORB_CPUS=2 AMP_ORB_MEMORY=4g ./dispatch.sh; echo "exit $?"
ORB_OPERATION=delete ORB_ID=amp-manual-test ./dispatch.sh; echo "exit $?"
```

Remove a leftover sandbox or template, for example after a delete job was missed while the Mac slept:

```bash
sbx --cloud rm --force <orb id>
sbx --cloud template rm --force <orb id>-disk-<unix time>
```

### Refresh the image

Run the refresh now, either directly or through launchd:

```bash
~/Developer/agent-skills/amp/orb-docker/refresh-image.sh
launchctl kickstart gui/$(id -u)/com.lelouvincx.amp-orb-refresh
```

The script writes only to its log, so check the result there:

```bash
tail -5 ~/Library/Logs/amp-orb-docker/refresh-image.log
launchctl print gui/$(id -u)/com.lelouvincx.amp-orb-refresh | grep -E 'runs|last exit code'
```

A healthy run ends with `up to date (<digest>); skipping` or `verified: … repository public, tags ["latest"]`.

Disable the weekly job. To remove it completely, also delete the plist:

```bash
launchctl bootout gui/$(id -u)/com.lelouvincx.amp-orb-refresh
```

Turn it back on:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.lelouvincx.amp-orb-refresh.plist
```

Both the script and a manual copy need the docker CLI signed in to Docker Hub as `lelouvincx`. If the script cannot run, copy by hand. This runs registry to registry and writes nothing to local disk. A full copy took about 14 minutes; a copy that reuses layers already on Docker Hub took 60 s:

```bash
docker buildx imagetools create \
  --tag docker.io/lelouvincx/amp-orb:latest \
  us-central1-docker.pkg.dev/amp-prod-0/amp-orb/amp-orb:latest
```

## Maintenance notes

### Costs

Prices per hour of running orb:

| Size | Docker Cloud Sandbox | Amp-hosted orb |
| --- | --- | --- |
| Small (2 CPU, 4 GB) | $0.14 | $0.17 |
| Medium (4 CPU, 8 GB), chosen | $0.28 | $0.33 |

Sources: Docker's [Cloud Sandboxes launch post](https://www.docker.com/blog/introducing-cloud-sandboxes-start-on-your-laptop-finish-in-the-cloud/) and [usage docs](https://docs.docker.com/ai/sandboxes/cloud/usage); Amp's [orb sizes and costs](https://ampcode.com/docs/orbs/sizes-and-costs).

Other costs:

- Docker bills compute per second. Stopped sandboxes cost nothing.
- Amp charges nothing for self-hosted orbs on Hobby, Individual and Teams plans. Enterprise workspaces would also pay Amp's orb price.
- The public Docker Hub image and the provider on the Mac cost nothing. Model usage costs the same Amp credits either way.
- Each carry-over adds about 99 to 199 s of compute, roughly one cent.
- Tests used about $0.63 of credit: $0.17 in Phases 2 and 3, $0.45 in Phase 4 and $0.01 in Phase 5. These are estimates, because Docker's usage page lags.
- Larger orb types cost more per hour. Docker's prices for types other than Small and Medium were not checked.

The $250 credit:

- It is a one-time credit for new Docker Agentic Platform sign-ups. The sign-up deadline is 31 January 2027.
- It expires 6 months after it is claimed. Unused credit is lost.
- It pays only for sandbox compute, including setup and idle running time.
- It buys about 890 Medium hours.
- A card is required and is charged for usage beyond the credit.
- Docker's usage page can lag by up to 48 hours, so spend can pass the credit before it shows.

At an assumed 4 hours a day of Medium (about 88 hours a month), Docker costs about $25 a month and Amp about $29. The planning thread's conclusion: use the credit, then probably return to Amp-hosted orbs, because about $4 a month does not pay for the upkeep, slower starts, missing snapshots and dependence on the Mac.

### Known limits and risks

- Amp does not support this setup. It supports only its side of the dispatch contract.
- Threads cannot start or wake while the Mac is asleep or offline. A missed delete leaves a stopped sandbox behind, and so does archiving a thread. Clean up with `sbx --cloud ls` now and then.
- The provider runs one job at a time, so a slow resume delays other threads' spawns.
- Amp's idle pause is slow, so each wake usually bills until the 30-minute limit.
- An orb not woken before its 24-hour cap may lose its disk. This is untested.
- Without project snapshots, every new thread runs `.agents/setup`, so starts are slower than on Amp-hosted orbs.
- A resume right after a pause can take about 80 to 100 s while Docker finishes stopping the sandbox. A carry-over in that state took 199 s, about 100 s inside the 5-minute job limit. A larger disk change would make the save slower.
- `sbx --cloud exec` has no detach flag. The bootstrap command must redirect every file descriptor, or `exec` hangs and exits 125.
- Copying the image as a Docker template from the Mac (`sbx --cloud template load`) failed after 16 minutes at about 1.7 MB/s. Do not rely on that route.

### Drift risks

- The live jobs run the scripts from the main checkout. A branch switch in that checkout changes what the provider runs on its next job.
- The image copy can be up to a week behind Amp's image. If the refresh fails, for example because the Docker Hub sign-in expires or OrbStack cannot start, it stays behind until someone reads `refresh-image.log`. Nothing alerts on a failed run.
- `sbx` was tested at v0.53.0. Its flags and states (`stopping`, `hibernating`) may change.
- Docker's credit terms and prices may change.
- Amp's orb type names, job timing and pause behaviour may change. Keep the orb type table in `dispatch.sh` and in this RFC in step.

### Follow-up for Chinh

- Set a billing alert or check Docker usage weekly, because the usage page lags.
- `docker-cloud` stays a non-default provider unless Chinh decides otherwise.

Keep detailed test results in the plan artifact and update this RFC when the setup changes.

## Open questions

- Does Docker charge $9 per user per month? Docker's sign-up docs say there is no recurring subscription fee, but its product page shows "$9 per user/month" next to Cloud Sandboxes. If it applies, Docker costs more than Amp at the assumed usage.
- Do stored templates cost anything? Docker says it meters only compute and that volumes are free, but templates are not named.
- Does Chinh's Amp plan include orb hours? If so, Amp-hosted orbs may cost less than the table shows.
- Network policy: keep the default open egress, set `allow-all` explicitly, or use `balanced` with allow rules?
