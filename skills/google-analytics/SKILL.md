---
name: google-analytics
description: Queries and manages Google Analytics 4 accounts and properties through the official Google Analytics MCP server. Use for GA4 reports, realtime data, property settings, custom dimensions, key events, or annotations.
---

# Google Analytics

The `google-analytics` MCP server in this skill runs Google's official [`analytics-mcp`](https://github.com/googleanalytics/google-analytics-mcp) with `uvx` and `--allow-write`.

## Use

1. Call `get_account_summaries` to find the property ID. Do not guess it.
2. Call `get_custom_dimensions_and_metrics` before reporting on custom fields.
3. Use `run_report` for historical data and `run_realtime_report` for the last 30 minutes. Pass explicit date ranges.

Write tools change live properties. Ask Chinh before creating custom dimensions, key events or annotations, and name the property and the exact change.

## Credentials

`run-mcp.sh` starts the projected `google-analytics-mcp` launcher, which picks credentials in this order:

1. `~/.config/gcloud-analytics/application_default_credentials.json` on the MacBook, separate from the default gcloud ADC file. Set `GA_MCP_CREDENTIALS` to use another file.
2. Elsewhere, such as in orbs, `agent-secrets run --bundle google-analytics` resolves `GA_MCP_ADC_JSON` from `op://Agent Secrets/Google Analytics MCP ADC/credential`. The launcher passes it to the server through a pipe and writes no credential file. Orbs need the `OP_SERVICE_ACCOUNT_TOKEN` secret and `AGENT_SECRET_AUTH=service-account` described in `amp/agent-secrets/README.md`.

After a new login, copy the new ADC file into that 1Password field so orbs keep working.

Google blocks gcloud's built-in OAuth client for Analytics scopes ("This app is blocked"), so the login needs a Desktop OAuth client from a GCP project Chinh owns. Keep the client JSON in 1Password, write it to a temporary file only for the login, and delete it afterwards.

The client is the file attached to the 1Password item `op://Agent Secrets/GCP personal-stuff Local Macbook`, in GCP project `personal-stuff-483502`:

```bash
tmp=$(mktemp) && op read --account my.1password.com --out-file "$tmp" --force \
  "op://Agent Secrets/GCP personal-stuff Local Macbook/client_secret_649193726198-ml70h57al7pjem9vfqa5gkjsul6nne1r.apps.googleusercontent.com.json" && \
CLOUDSDK_CONFIG="$HOME/.config/gcloud-analytics" gcloud auth application-default login \
  --client-id-file="$tmp" \
  --scopes=https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/cloud-platform; \
rm -f "$tmp"
```

When the client's consent screen is External and in Testing, Google expires the refresh token after 7 days. Use an Internal consent screen, or publish the app to Production, to avoid repeating the login.

The quota project in the credential file must have the Google Analytics Admin API and Google Analytics Data API enabled:

```bash
CLOUDSDK_CONFIG="$HOME/.config/gcloud-analytics" gcloud auth application-default set-quota-project personal-stuff-483502
```

The server fails at startup with a missing-file message when the credential file is absent, and its tools return `SERVICE_DISABLED` when the quota project lacks the APIs.
