# Glance install zip and OAuth setup

A confirmed signup downloads the extension from
`download-trial-zip`, which reads `flow-trial-extension.zip` beside the
function. That zip is build output, not source. Notion works in a fresh
build. The four OAuth connectors do not, until the owner pastes public
client IDs here and matching secrets in Netlify.

## How the zip is produced

`scripts/package_trial_extension.py` walks `flow-trial-extension/` from
`manifest.json` (icons, popup, content scripts, the service worker, and
every relative import the service worker names) and writes:

`flow-landing/netlify/functions/download-trial-zip/flow-trial-extension.zip`

The file is gitignored. Do not commit it — a checked-in copy is how this
download drifted from the extension people can load unpacked.

Netlify's site base directory is `flow-landing`.
`flow-landing/netlify.toml` runs:

```
python3 ../scripts/package_trial_extension.py
```

before functions are packaged. `download-trial-zip` sets
`node_bundler = "none"` and `included_files` to that zip. The none
bundler ships only the handler plus `included_files`, not every file
sitting in the directory, and it does not apply `.gitignore`, so the
generated zip is what gets deployed next to the handler.
`path.join(__dirname, 'flow-trial-extension.zip')` resolves there. The
handler also checks `process.cwd()` for the same filename, which is the
layout `netlify dev` uses when the base directory is `flow-landing`.

Check it locally from the repo root:

```
python3 scripts/verify_trial_install.py
```

That rebuilds the zip, refuses to package a build that still assigns
`YOUR_*` client IDs in `background.js`, refuses `picker/`, and calls the
download function with a signed token and with a bad token. The download
zip keeps the repo manifest (unpacked `key` and unpacked Google client).

The Chrome Web Store upload is a different file. From the repo root,
`bash flow-trial-extension/scripts/build-cws.sh` writes
`flow-trial-extension/dist/glance-cws.zip` with `key` removed and the
store OAuth client applied. Do not upload the signup zip to the store.

Load unpacked still uses the `flow-trial-extension/` folder directly.
The zip is only what a confirmed signup receives.

## Public client IDs (extension)

Edit `flow-trial-extension/config/oauth.public.js`. These four strings
are public. Leave the `REPLACE_WITH_*` value in place until you have the
real one — the extension treats that prefix, and a legacy `YOUR_*`
prefix, as unset.

| Field | Where the owner copies it from |
|---|---|
| `hubspotClientId` | HubSpot public app → Auth → Client ID |
| `salesforceClientId` | Salesforce Connected App → Consumer Key |
| `slackClientId` | Slack app → Basic Information → Client ID |
| `mondayClientId` | Monday.com app → OAuth → Client ID |

No Google OAuth client ID is used. `manifest.json`'s `key` is the
extension's public pinning key (already set) so the redirect URL stays
`https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/`. Register that
exact URL on each of the four apps. Do not regenerate the key.

Per-connector click paths (scopes, test accounts) stay in `README.md`.

## Secrets the owner must set in Netlify

Set these in the Netlify UI (or the team's secret store). Do not commit
them, do not paste them into `oauth.public.js`, and do not put them in
the extension zip.

| Netlify variable | Read by |
|---|---|
| `HUBSPOT_CLIENT_ID` | `hubspot-oauth-exchange`, `hubspot-oauth-refresh` |
| `HUBSPOT_CLIENT_SECRET` | same |
| `SALESFORCE_CLIENT_ID` | `salesforce-oauth-exchange`, `salesforce-oauth-refresh` |
| `SALESFORCE_CLIENT_SECRET` | same |
| `SLACK_CLIENT_ID` | `slack-oauth-exchange` |
| `SLACK_CLIENT_SECRET` | same |
| `MONDAY_CLIENT_ID` | `monday-oauth-exchange`, `monday-oauth-refresh` |
| `MONDAY_CLIENT_SECRET` | same |

Each `*_CLIENT_ID` must be the same string as the matching field in
`config/oauth.public.js`. The exchange functions compare the extension's
redirect against the app registered with that secret; a mismatch fails
the handshake after the user consents.

The signed download link also needs `EMAIL_VERIFY_SECRET` (already
required by `confirm-signup` / `download-trial-zip`). That value is not
in this repo.

Until the four pairs above exist, a confirmed signup can still install
and connect Notion. HubSpot, Salesforce, Slack, and Monday.com stay on
**Needs setup** and refuse to open an OAuth window.
