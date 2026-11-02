import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

// RFC-0016: receives Slack Events API deliveries for the Amp Slack app and
// forwards events for watched Slack threads to per-thread Amp webhooks.
export default defineConfig({
	worker: {
		name: "slack-events",
		compatibilityDate: "2026-10-23",
		entrypoint,
		env: {
			WATCHES: bindings.kv(),
			SLACK_SIGNING_SECRET: bindings.secret(),
			SLACK_AMP_WORKER_SECRET: bindings.secret(),
			SLACK_SELF_USER_ID: bindings.text("U083NKXG3A7"),
		},
	},
});
