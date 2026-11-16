---
doc_schema: "amp-rfc/v1"
code: "RFC-0017"
title: "Self-hosted Amp orbs on Docker Cloud Sandboxes"
slug: "self-hosted-amp-orbs-on-docker-cloud-sandboxes"
file: "rfc-0017-self-hosted-amp-orbs-on-docker-cloud-sandboxes.md"
status: "Accepted"
summary: "Run Amp orbs as Docker Cloud Sandboxes through a personal self-hosted orb provider on Chinh's Mac, paid by Docker's $250 sign-up credit."
created: "2026-11-16"
updated: "2026-11-16"
amp_thread_id:
  T-01a1d9c3-2570-73ea-9da5-945b146f72af: "planned the setup, compared prices, owns the plan artifact"
  T-01a1e340-0de7-767d-bfea-eb7767aef04e: "installed sbx, copied the image, wrote and tested dispatch.sh, registered the provider, runs Phase 4"
  T-01a1e43c-88bc-70eb-8e99-5c65906b339b: "wrote this RFC"
dependency: []
implementation: []
inputs:
  - name: "Amp orb provider job"
    kind: "environment variables set by `amp orb provider`"
    purpose: "ORB_OPERATION (spawn, pause or delete), ORB_ID, and for spawn ORB_TOKEN; AMP_URL only when the server is not ampcode.com."
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

- Phases 1 to 3 are done: Docker account, open-question spike and dispatch script.
- Phase 4, the end-to-end test with the registered `docker-cloud` provider, is in progress. Spawn, resume, Terminal, portals and a simulated time-limit freeze work. The idle pause, thread deletion and provider-stopped checks are not finished yet.
- Phase 5, running the provider under launchd with the token in 1Password, has not started. The provider runs in tmux for now.

Sources:

- [Plan and test results](https://ampcode.com/artifacts/plan-self-hosted-amp-orbs-on-docker-cloud-sandboxes-a07a0d8c-e93c-47b8-8c18-9b442efdba7c), the main record, including the full script and every test.
- [Planning thread](https://ampcode.com/threads/T-01a1d9c3-2570-73ea-9da5-945b146f72af), including the price comparison.
- [Install and test thread](https://ampcode.com/threads/T-01a1e340-0de7-767d-bfea-eb7767aef04e), where Phase 4 continues.

## Context

Docker gives new Docker Agentic Platform sign-ups a one-time $250 compute credit. Amp lets any machine act as an orb provider through a small dispatch contract, and self-hosted orbs are free on Amp's Hobby, Individual and Teams plans. Together, these let Chinh run orbs on Docker's credit.

Amp publishes no example for Docker Cloud Sandboxes, so the plan tested every assumption before relying on it.

Guides:

- [Amp: Self-Hosted Orbs](https://ampcode.com/docs/orbs/self-hosted) covers the provider, dispatch contract and orb image.
- [Docker: Use cloud sandboxes](https://docs.docker.com/ai/sandboxes/cloud/usage) covers create, exec, stop, time limits and templates.
- [Docker: $250 promo terms](https://www.docker.com/c/sbx-promo/).

## Decision

- Run one personal orb provider named `docker-cloud` on Chinh's Mac.
- Create Medium sandboxes (4 CPU, 8 GiB) from the public copy `docker.io/lelouvincx/amp-orb:latest`, refreshed weekly by a LaunchAgent.
- Give each sandbox a 30-minute time limit that stops it, as a safety net when a pause job is missed.
- Carry the disk over to a new sandbox before Docker's 24-hour cap, using templates.
- Ignore Amp project snapshots for now, so every new thread runs `.agents/setup`.
- Use the credit, then decide whether to keep the setup or return to Amp-hosted orbs. See [Costs](#costs).

`docker-cloud` is not the default orb provider. A thread uses it only when started with `--orb-provider docker-cloud`.

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
| `spawn` | Creates the sandbox if missing, from the newest carry-over template or else the image. Resumes it if stopped. Carries the disk over if less than `AMP_ORB_CARRY_OVER_BELOW` seconds remain before the 24-hour cap. Then starts `amp orb bootstrap`. |
| `pause` | Runs `sbx --cloud stop`, which keeps memory and disk. Does nothing if the sandbox is missing, stopped or stopping. |
| `delete` | Removes the sandbox, then every `$ORB_ID-disk-*` template. |

Every operation is safe to repeat and has fitted Amp's 5-minute job limit in tests. The slowest case seen was 199 s, a carry-over right after a pause.

### Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `AMP_ORB_IMAGE_REF` | `docker.io/lelouvincx/amp-orb:latest` | Image for new sandboxes |
| `AMP_ORB_CPUS` | `4` | CPUs (Medium) |
| `AMP_ORB_MEMORY` | `8g` | Memory (Medium) |
| `AMP_ORB_TTL` | `30m` | Time limit per run |
| `AMP_ORB_CARRY_OVER_BELOW` | `7200` | Seconds before the 24-hour cap at which spawn carries the disk over |

### Files on the Mac

| Path | Purpose |
| --- | --- |
| `~/Developer/amp-orb-docker/dispatch.sh` | Dispatch script, the only copy |
| `~/Developer/amp-orb-docker/provider.log` | Provider and dispatch log, appended by `tee` |
| tmux session `amp-orb-provider` | Runs the provider |
| `~/Developer/amp-orb-docker/refresh-image.sh` | Weekly image refresh script, the only copy |
| `~/Library/LaunchAgents/com.lelouvincx.amp-orb-refresh.plist` | LaunchAgent that runs the refresh on Mondays at 10:00 local time |
| `~/Developer/amp-orb-docker/refresh-image.log` | Refresh log, one timestamped line per step |

`amp orb provider` reads the provider token from the Amp CLI's own secret storage, where provider registration saved it. Neither the start command nor any file in this repository holds it.

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

In Phase 4, a simulated freeze mid-turn (`sbx --cloud stop` while the agent waited on tool calls) recovered on its own. The thread showed "Reconnecting to orb". About 2 minutes later Amp sent a new spawn, the sandbox resumed in 9.4 s, and the original bootstrap reconnected and finished the turn. The second bootstrap exited without conflict. Why it exited was not checked.

A missed pause, for example while the Mac sleeps, costs at most 30 minutes of Medium: $0.14.

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

### Phase 4 progress

Done:

- registered the personal provider `docker-cloud` and started it in tmux
- fixed a bug where spawn failed because Amp omits `AMP_URL` for ampcode.com, and the Mac's bash 3.2 then reported exit 0
- cold create of a Medium sandbox: 26.5 s and 64 s in two threads
- resume after a pause: 98.7 s, mostly waiting for Docker to finish stopping
- Terminal and a portal both work, confirmed by Chinh
- the simulated time-limit freeze recovered, as described above

In progress or not started:

- check that Amp sends a pause for an idle thread, and that files survive the pause and resume
- check that deleting a thread removes its sandbox and templates
- stop the provider and check that the 30-minute limit still stops an idle orb
- remove test sandboxes and record Phase 4 results and spend in the plan

Check the [install and test thread](https://ampcode.com/threads/T-01a1e340-0de7-767d-bfea-eb7767aef04e) and the plan for the latest state.

## Permissions and side effects

- The provider holds a personal Amp orb provider token. Run exactly one provider process per token.
- `dispatch.sh` creates, stops and removes Docker Cloud sandboxes and templates in Chinh's Docker account. Running sandboxes cost money; see [Costs](#costs).
- `dispatch.sh` passes `ORB_TOKEN` into the sandbox with `sbx --cloud exec -e`. The token is minted for one spawn and expires after 15 minutes.
- Inside the sandbox, `amp orb bootstrap` logs to `~/.amp-bootstrap.log`.
- Sandboxes have open outbound network access. `sbx --cloud policy ls` shows `deny-all` with no rules, but every tested host was reachable. The network policy is an open decision.
- `docker.io/lelouvincx/amp-orb` is a public Docker Hub repository. Push only unchanged copies of Amp's image to it.
- Do not paste the provider token, `ORB_TOKEN` values or the raw provider log into threads or docs. Filter the log as shown below.

## Examples

### Start the provider

Check that no provider is running first, because only one may run per token:

```bash
pgrep -fl 'amp orb provider' || echo none
tmux has-session -t amp-orb-provider 2>/dev/null && echo "session exists"
```

Then start it:

```bash
bash -n ~/Developer/amp-orb-docker/dispatch.sh
tmux new-session -d -s amp-orb-provider -c ~/Developer/amp-orb-docker \
  "amp orb provider ~/Developer/amp-orb-docker/dispatch.sh 2>&1 | tee -a ~/Developer/amp-orb-docker/provider.log"
```

The provider runs `dispatch.sh` fresh for each job, so script edits take effect without a restart.

### Stop the provider

```bash
tmux kill-session -t amp-orb-provider
pgrep -fl 'amp orb provider' || echo stopped
```

While the provider is stopped, `docker-cloud` threads cannot start or wake, and running orbs stop at their 30-minute limit.

### Use it in a thread

Start a thread with `--orb-provider docker-cloud`, as the Phase 4 test threads did.

### Debug

Read the provider log without tokens:

```bash
grep -viE 'aop_live|ORB_TOKEN=' ~/Developer/amp-orb-docker/provider.log | tail -40
grep -E 'Claimed job|Completed job' ~/Developer/amp-orb-docker/provider.log | tail -20
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
cd ~/Developer/amp-orb-docker
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
~/Developer/amp-orb-docker/refresh-image.sh
launchctl kickstart gui/$(id -u)/com.lelouvincx.amp-orb-refresh
```

The script writes only to its log, so check the result there:

```bash
tail -5 ~/Developer/amp-orb-docker/refresh-image.log
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
- Phases 2 and 3 used about $0.17 of credit. Phase 4 spend is not recorded yet.

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
- Threads cannot start or wake while the Mac is asleep or offline. A missed delete leaves a stopped sandbox behind. Clean up with `sbx --cloud ls` now and then.
- An orb not woken before its 24-hour cap may lose its disk. This is untested.
- Without project snapshots, every new thread runs `.agents/setup`, so starts are slower than on Amp-hosted orbs.
- A resume right after a pause can take about 80 to 100 s while Docker finishes stopping the sandbox. A carry-over in that state took 199 s, about 100 s inside the 5-minute job limit. A larger disk change would make the save slower.
- `sbx --cloud exec` has no detach flag. The bootstrap command must redirect every file descriptor, or `exec` hangs and exits 125.
- Under launchd, `PATH` is minimal. `dispatch.sh` adds `/opt/homebrew/bin` for `sbx`, which is not yet tested under launchd.
- Copying the image as a Docker template from the Mac (`sbx --cloud template load`) failed after 16 minutes at about 1.7 MB/s. Do not rely on that route.

### Drift risks

- `dispatch.sh` and `refresh-image.sh` are not committed anywhere. Copy them into version control before changing them substantially.
- The image copy can be up to a week behind Amp's image. If the refresh fails, for example because the Docker Hub sign-in expires or OrbStack cannot start, it stays behind until someone reads `refresh-image.log`. Nothing alerts on a failed run.
- `sbx` was tested at v0.53.0. Its flags and states (`stopping`, `hibernating`) may change.
- Docker's credit terms and prices may change.

### Phase 5 follow-up

- Run the provider as a launchd agent with `KeepAlive` instead of tmux.
- Keep the provider token in 1Password and resolve it at start time.
- Write the launchd start, log and rollback steps into this RFC.
- Chinh: set a billing alert or check Docker usage weekly, and decide whether `docker-cloud` becomes the default orb provider.

When Phase 4 or 5 finishes, update the status, Phase 4 progress and examples here, and keep the detailed results in the plan artifact.

## Open questions

- Does Docker charge $9 per user per month? Docker's sign-up docs say there is no recurring subscription fee, but its product page shows "$9 per user/month" next to Cloud Sandboxes. If it applies, Docker costs more than Amp at the assumed usage.
- Do stored templates cost anything? Docker says it meters only compute and that volumes are free, but templates are not named.
- Does Chinh's Amp plan include orb hours? If so, Amp-hosted orbs may cost less than the table shows.
- Network policy: keep the default open egress, set `allow-all` explicitly, or use `balanced` with allow rules?
- Does Amp pause idle `docker-cloud` orbs on its own, and how soon? Phase 4 is checking.
