# Agent secrets

`bundles.json` is the source of truth for secret capability bundles and approved browser logins. Private files contain only 1Password references and stay outside this repository.

## Register a browser login profile

A browser login profile is an `agent` bundle with `browserLogin` policy. Its bundle name is the profile name used by `agent-browser`. Create a separate bundle when you need another account or login policy.

1. Add the bundle to `bundles.json`. Declare its credential variables, allow `agent-browser-credential-handler`, and add the destination and identity policy:

   ```json
   "example-login": {
     "audience": "agent",
     "owner": "example/project",
     "variables": [
       "EXAMPLE_USERNAME",
       "EXAMPLE_PASSWORD",
       "EXAMPLE_OTP"
     ],
     "compatibleBundles": [],
     "allowedCommandClasses": [
       "agent-browser-credential-handler"
     ],
     "browserLogin": {
       "usernameVariable": "EXAMPLE_USERNAME",
       "passwordVariable": "EXAMPLE_PASSWORD",
       "loginUrl": "https://example.com/login",
       "credentialOrigin": "https://example.com",
       "usernameSelector": "#username",
       "passwordSelector": "#password",
       "submitSelector": "button[type=\"submit\"]",
       "otpVariable": "EXAMPLE_OTP",
       "otpSelector": "#otp",
       "otpSubmitSelector": "button[type=\"submit\"]",
       "expectedPostLoginUrl": "https://example.com/account",
       "accountMarkerSelector": "#account-menu",
       "accountMarkerVariable": "EXAMPLE_USERNAME"
     }
   }
   ```

   Omit all 3 OTP entries when the site does not use OTP. Choose an account marker whose text contains the intended account value after login.

2. Create `~/.credentials/agent-secrets/example-login.env` with mode `0600`:

   ```dotenv
   EXAMPLE_USERNAME=op://Agent Secrets/example-login/username
   EXAMPLE_PASSWORD=op://Agent Secrets/example-login/password
   EXAMPLE_OTP=op://Agent Secrets/example-login/one-time password?attribute=otp
   ```

   Use the real item and field names from the `Agent Secrets` vault. Store references only, never resolved values.

3. Validate and project the registration:

   ```bash
   uvx --with jsonschema==4.25.1 python amp/scripts/validate-agent-secrets.py
   agent-secrets doctor
   ./sync-skills.sh
   ```

4. Claim a fresh browser session through the [Agent Browser convention](../conventions/agent-browser.md). Authenticate through its explicit browser identity:

   ```bash
   "$HOME/.local/bin/agent-browser" \
     --config "$HOME/.agent-browser/config.json" \
     --namespace "$namespace" \
     --session "$daemon" \
     --cdp "http://127.0.0.1:$port" \
     auth login example-login --credential-provider onepassword
   ```

Registration is complete when policy validation and `agent-secrets doctor` pass, projection preserves the plugin registration, and a fresh-session login verifies the expected destination and account.

Runtime Chrome profiles do not need registration. `agent-browser-lifecycle claim` creates a fresh exclusive profile for each browser session.
