#!/usr/bin/env python3
"""Production Chrome Web Store package for Glance.

The unpacked tree keeps its dev key and its debug hooks. This module copies
the install set, strips the store-forbidden pieces from that copy, and writes
a zip. The default flavor is full (Gmail / Chrome Web Store v1):
dist/glance-<version>-<sha7>-prod.zip. --flavor outlook is the friends build:
dist/glance-<version>-<sha7>-outlook-prod.zip. Source files are not modified.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

import package_trial_extension as trial

REPO_ROOT = trial.REPO_ROOT
EXTENSION_ROOT = trial.EXTENSION_ROOT
DIST_DIR = REPO_ROOT / "dist"
CWS_ITEM_ID = "lbihckfmoffgjjlnneoeaehbhoonfenh"
UNPACKED_CLIENT_ID = (
    "93977330357-hsd2u2bjg480q135juftdpkvo5hcsn7j.apps.googleusercontent.com"
)
STORE_CLIENT_ID = (
    "93977330357-aup7do27a71h8sfhq4h35pogslt92iid.apps.googleusercontent.com"
)
DESCRIPTION_MAX = 132

# Permissions a store package is allowed to declare. Adding one means a
# justification in flow-trial-extension/docs/RELEASE.md in the same change.
ALLOWED_PERMISSIONS = (
    "storage",
    "identity",
    "sidePanel",
    "alarms",
    "notifications",
    "scripting",
    "contextMenus",
)
# --flavor full. Today's package: Gmail is a host, Outlook is optional.
FULL_HOSTS = (
    "https://mail.google.com/*",
    "https://tasks.googleapis.com/*",
    "https://www.googleapis.com/calendar/*",
    "https://www.googleapis.com/drive/*",
    "https://www.googleapis.com/oauth2/*",
    "https://www.googleapis.com/upload/drive/*",
    "https://gmail.googleapis.com/*",
    "https://*.googleusercontent.com/*",
    "https://theflow-ai.com/*",
)
FULL_OPTIONAL_HOSTS = (
    "https://api.dropboxapi.com/*",
    "https://content.dropboxapi.com/*",
    "https://web.whatsapp.com/*",
    "https://app.slack.com/*",
    "https://web.telegram.org/*",
    "https://graph.microsoft.com/*",
    "https://login.microsoftonline.com/*",
    "http://127.0.0.1/*",
    "http://localhost/*",
    "https://outlook.live.com/*",
    "https://outlook.office.com/*",
    "https://outlook.office365.com/*",
    "https://www.messenger.com/*",
    "https://messenger.com/*",
    "https://www.facebook.com/messages",
    "https://www.facebook.com/messages/*",
    "https://facebook.com/messages",
    "https://facebook.com/messages/*",
    "https://business.facebook.com/latest/inbox",
    "https://business.facebook.com/latest/inbox/*",
    "https://www.business.facebook.com/latest/inbox",
    "https://www.business.facebook.com/latest/inbox/*",
    "https://www.instagram.com/direct",
    "https://www.instagram.com/direct/*",
    "https://instagram.com/direct",
    "https://instagram.com/direct/*",
)
FULL_SCOPES = (
    "openid",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/tasks",
)
# Default friends build. Outlook web, Graph, and Microsoft login are required.
# theflow-ai.com is Glance's own host, not a Google host. WhatsApp, Slack, and
# Telegram stay optional. Loopback stays optional for a model on this computer.
OUTLOOK_HOSTS = (
    "https://outlook.live.com/*",
    "https://outlook.office.com/*",
    "https://outlook.office365.com/*",
    "https://graph.microsoft.com/*",
    "https://login.microsoftonline.com/*",
    "https://theflow-ai.com/*",
)
OUTLOOK_OPTIONAL_HOSTS = (
    "https://web.whatsapp.com/*",
    "https://app.slack.com/*",
    "https://web.telegram.org/*",
    "http://127.0.0.1/*",
    "http://localhost/*",
)
FLAVORS = ("outlook", "full")
DEFAULT_FLAVOR = "full"
FLAVOR_RULES = {
    "outlook": {
        "hosts": OUTLOOK_HOSTS,
        "optional_hosts": OUTLOOK_OPTIONAL_HOSTS,
        "scopes": (),
        "oauth2": False,
    },
    "full": {
        "hosts": FULL_HOSTS,
        "optional_hosts": FULL_OPTIONAL_HOSTS,
        "scopes": FULL_SCOPES,
        "oauth2": True,
    },
}

# Dropped from the store manifest. Hybrid execution is off, and the lite
# package does not ship the offscreen page, so the permission has no caller
# that can succeed.
DROPPED_PERMISSIONS = ("offscreen",)

# Developer docs. They name HubSpot and Salesforce hosts on purpose. The
# running extension does not load them.
DROPPED_FILES = ("README.md", "docs/SETUP.md")

# Strings that must not survive in the store zip. Hosts, scopes, client-id
# keys, writer entry points, and the dev hooks the build strips.
FORBIDDEN = (
    "__flowDiag",
    "__glanceE2e",
    "glanceDebug",
    "glance-debug",
    "glanceOutlookFileTrace",
    "glance-outlook-file-trace",
    "hubspotClientId",
    "salesforceClientId",
    "app.hubspot.com",
    "api.hubapi.com",
    "hubspot.com",
    "login.salesforce.com",
    "salesforce.com",
    "crm.objects.contacts.read",
    "crm.objects.contacts.write",
    "hubspot-oauth-exchange",
    "hubspot-oauth-refresh",
    "salesforce-oauth-exchange",
    "salesforce-oauth-refresh",
    "getHubspotAuth",
    "connectHubspot",
    "hubspotWrite",
    "hubspotUndo",
    "getSalesforceAuth",
    "connectSalesforce",
    "salesforceWrite",
    "salesforceUndo",
    "HUBSPOT_CLIENT_ID",
    "SALESFORCE_CLIENT_ID",
    "HUBSPOT_API",
    "SALESFORCE_AUTH_BASE",
    "REPLACE_WITH_HUBSPOT_CLIENT_ID",
    "REPLACE_WITH_SALESFORCE_CLIENT_ID",
)

# Outlook flavor only. Slack and Monday OAuth placeholders, and the Notion
# token writer. Outlook sign-in is FlowOutlookAuth, not runOAuthFlow.
# app.slack.com stays: that host is the optional read-only Slack surface.
OUTLOOK_FORBIDDEN = FORBIDDEN + (
    "slackClientId",
    "mondayClientId",
    "REPLACE_WITH_SLACK_CLIENT_ID",
    "REPLACE_WITH_MONDAY_CLIENT_ID",
    "SLACK_CLIENT_ID",
    "SLACK_API",
    "MONDAY_CLIENT_ID",
    "MONDAY_API",
    "NOTION_API",
    "api.notion.com",
    "slack.com/oauth",
    "slack.com/api",
    "auth.monday.com",
    "api.monday.com",
    "getSlackAuth",
    "connectSlack",
    "slackWrite",
    "slackUndo",
    "getMondayAuth",
    "connectMonday",
    "mondayWrite",
    "mondayUndo",
    "getNotionAuth",
    "connectNotion",
    "notionWrite",
    "notionUndo",
    "runOAuthFlow",
)

GMAIL_ONLY_SCRIPTS = (
    "src/content-gmail.js",
    "src/sidebar.js",
    "src/brief.js",
    "src/weekly.js",
)

TEXT_SUFFIXES = {".js", ".json", ".html", ".css", ".md", ".svg", ".txt"}


def die(message: str) -> None:
    print(f"cws prod: {message}", file=sys.stderr)
    raise SystemExit(1)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        die(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


def cut_until(text: str, start: str, end: str, label: str) -> str:
    """Delete from the first `start` up to, but not including, the first later `end`."""
    a = text.find(start)
    if a < 0:
        die(f"{label}: start marker missing")
    if text.find(start, a + len(start)) != -1:
        die(f"{label}: start marker repeated")
    b = text.find(end, a + len(start))
    if b < 0:
        die(f"{label}: end marker missing")
    return text[:a] + text[b:]


def remove_brace_statement(text: str, needle: str, label: str) -> str:
    """Delete one statement that opens an object literal, including the trailing newline."""
    i = text.find(needle)
    if i < 0:
        die(f"{label}: not found")
    if text.find(needle, i + len(needle)) != -1:
        die(f"{label}: repeated")
    line_start = text.rfind("\n", 0, i) + 1
    brace = text.find("{", i)
    if brace < 0:
        die(f"{label}: no object literal")
    depth = 0
    j = brace
    while j < len(text):
        c = text[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                break
        j += 1
    else:
        die(f"{label}: object literal did not close")
    k = j + 1
    if not text.startswith(");", k):
        die(f"{label}: expected ');' after the object, got {text[k:k + 12]!r}")
    k += 2
    if text.startswith("\n", k):
        k += 1
    return text[:line_start] + text[k:]


def git_sha7() -> str:
    try:
        full = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, text=True
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError) as err:
        die(f"cannot read the git sha: {err}")
    if not re.fullmatch(r"[0-9a-f]{40}", full):
        die(f"HEAD is not a 40-character sha: {full!r}")
    return full[:7]


def worktree_dirty() -> bool:
    out = subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=REPO_ROOT, text=True
    )
    return bool(out.strip())


def parse_flavor(argv: list[str]) -> str:
    if not argv:
        return DEFAULT_FLAVOR
    if len(argv) == 2 and argv[0] == "--flavor" and argv[1] in FLAVORS:
        return argv[1]
    if len(argv) == 1 and argv[0].startswith("--flavor="):
        flavor = argv[0].split("=", 1)[1]
        if flavor in FLAVORS:
            return flavor
    die("build-prod.py accepts no arguments, or --flavor outlook (default), or --flavor full")
    return DEFAULT_FLAVOR


def flavor_from_name(name: str) -> str | None:
    if re.fullmatch(r"glance-\d+\.\d+\.\d+-[0-9a-f]{7}-outlook-prod\.zip", name):
        return "outlook"
    if re.fullmatch(r"glance-\d+\.\d+\.\d+-[0-9a-f]{7}-prod\.zip", name):
        return "full"
    return None


def google_match(match: str) -> bool:
    text = match.lower()
    return "google" in text or "gmail" in text


def outlook_engine_scripts() -> list[str]:
    """Shared engine files the Gmail content script lists, without the Gmail page."""
    manifest = json.loads((EXTENSION_ROOT / "manifest.json").read_text(encoding="utf-8"))
    scripts = manifest.get("content_scripts") or []
    js = (scripts[0].get("js") if scripts else None) or []
    kept = [name for name in js if name not in GMAIL_ONLY_SCRIPTS]
    if not kept:
        die("outlook engine script list is empty")
    return kept


def assert_dev_oauth_manifest() -> None:
    """The repo tree must stay on unpacked key + dev Chrome-extension client."""
    manifest = json.loads((EXTENSION_ROOT / "manifest.json").read_text(encoding="utf-8"))
    if "key" not in manifest:
        die("dev manifest.json must keep a key field (unpacked extension id)")
    cid = str((manifest.get("oauth2") or {}).get("client_id") or "")
    if cid != UNPACKED_CLIENT_ID:
        die(f"dev manifest oauth2.client_id must be {UNPACKED_CLIENT_ID}, got {cid!r}")


def transform_manifest(raw: str, flavor: str) -> str:
    try:
        manifest = json.loads(raw)
    except json.JSONDecodeError as err:
        die(f"manifest.json is not valid JSON: {err}")
    manifest.pop("key", None)
    permissions = [p for p in (manifest.get("permissions") or []) if p not in DROPPED_PERMISSIONS]
    manifest["permissions"] = permissions
    if flavor == "full":
        oauth = manifest.get("oauth2")
        if not oauth or not isinstance(oauth, dict):
            die("full flavor manifest is missing oauth2")
        cid = str(oauth.get("client_id") or "")
        if cid != UNPACKED_CLIENT_ID:
            die(
                f"full flavor store build expects unpacked client {UNPACKED_CLIENT_ID}, got {cid!r}"
            )
        oauth["client_id"] = STORE_CLIENT_ID
        oauth["scopes"] = list(FULL_SCOPES)
        manifest["oauth2"] = oauth
    if flavor == "outlook":
        rules = FLAVOR_RULES["outlook"]
        manifest["host_permissions"] = list(rules["hosts"])
        manifest["optional_host_permissions"] = list(rules["optional_hosts"])
        manifest.pop("oauth2", None)
        # A content_scripts match is a host grant. The friends build does not
        # inject on Gmail. Outlook registers from background.js SURFACES.
        manifest.pop("content_scripts", None)
        for entry in manifest.get("web_accessible_resources") or []:
            entry["matches"] = [m for m in (entry.get("matches") or []) if not google_match(m)]
    description = manifest.get("description") or ""
    if len(description) > DESCRIPTION_MAX:
        die(f"description is {len(description)} characters; the store limit is {DESCRIPTION_MAX}")
    if not re.fullmatch(r"\d+\.\d+\.\d+", str(manifest.get("version") or "")):
        die(f"manifest version is not a Chrome version: {manifest.get('version')!r}")
    return json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"


def transform_oauth(raw: str, flavor: str) -> str:
    raw = replace_once(
        raw,
        "  hubspotClientId: 'REPLACE_WITH_HUBSPOT_CLIENT_ID',\n",
        "",
        "oauth hubspot client id",
    )
    raw = replace_once(
        raw,
        "  salesforceClientId: 'REPLACE_WITH_SALESFORCE_CLIENT_ID',\n",
        "",
        "oauth salesforce client id",
    )
    if flavor == "outlook":
        raw = replace_once(
            raw,
            "  slackClientId: 'REPLACE_WITH_SLACK_CLIENT_ID',\n",
            "",
            "oauth slack client id",
        )
        raw = replace_once(
            raw,
            "  mondayClientId: 'REPLACE_WITH_MONDAY_CLIENT_ID'\n",
            "",
            "oauth monday client id",
        )
    return raw


def transform_background(raw: str, flavor: str) -> str:
    raw = cut_until(raw, "const HUBSPOT_CLIENT_ID", "const SLACK_CLIENT_ID", "hubspot and salesforce constants")
    raw = cut_until(
        raw,
        "// HubSpot's documented default association type ID",
        "// TODO(owner): create an OAuth Client ID",
        "hubspot note association id",
    )
    hub = None
    slack = None
    for line in raw.splitlines(keepends=True):
        if hub is None and line.startswith("/* ") and "HubSpot" in line:
            hub = line
        elif hub is not None and slack is None and line.startswith("/* ") and "Slack" in line:
            slack = line
            break
    if not hub or not slack:
        die("hubspot/salesforce function banners were not found")
    raw = cut_until(raw, hub, slack, "hubspot and salesforce functions")
    raw = replace_once(
        raw,
        """// Headless regression only. The suite sets globalThis.__glanceE2e.googleAuthToken
// inside this worker because chrome.identity cannot be replaced there.
// Production never sets __glanceE2e, so the Chrome call below is unchanged.
function glanceE2eGoogleAuth(interactive) {
  const e2e = globalThis.__glanceE2e;
  if (!e2e || typeof e2e.googleAuthToken !== 'function') return null;
  return e2e.googleAuthToken(Boolean(interactive));
}

function getGoogleAuthToken(interactive) {
  const hooked = glanceE2eGoogleAuth(interactive);
  if (hooked && typeof hooked.then === 'function') return hooked;
  return new Promise((resolve, reject) => {
""",
        """function getGoogleAuthToken(interactive) {
  return new Promise((resolve, reject) => {
""",
        "e2e google auth hook",
    )
    raw = replace_once(
        raw,
        """function removeCachedGoogleAuthToken(token) {
  const e2e = globalThis.__glanceE2e;
  if (e2e && e2e.installed === true) {
    e2e.authCalls = e2e.authCalls || [];
    e2e.authCalls.push({ removeCached: true, at: Date.now() });
    return Promise.resolve();
  }
  return new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
}
""",
        """function removeCachedGoogleAuthToken(token) {
  return new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
}
""",
        "e2e cached-token hook",
    )
    raw = replace_once(
        raw,
        """// Headless regression only. A local mock server sets httpOrigin. Production
// never sets __glanceE2e, so the URL below is unchanged.
function glanceE2eRewrite(url) {
  const e2e = globalThis.__glanceE2e;
  const origin = e2e && typeof e2e.httpOrigin === 'string' ? e2e.httpOrigin : '';
  if (!origin || !url) return url;
  try {
    const u = new URL(url);
    const base = new URL(origin);
    return base.origin + u.pathname + u.search;
  } catch (e) {
    return url;
  }
}

""",
        """function glanceE2eRewrite(url) {
  return url;
}

""",
        "e2e http rewrite hook",
    )
    raw = replace_once(
        raw,
        """// Headless regression only. chrome.identity.launchWebAuthFlow cannot be
// replaced inside the service worker, the same reason getAuthToken goes
// through glanceE2eGoogleAuth. Production never sets __glanceE2e.
function glanceE2eWebAuthFlow(details) {
  const e2e = globalThis.__glanceE2e;
  if (!e2e || typeof e2e.launchWebAuthFlow !== 'function') return null;
  return e2e.launchWebAuthFlow(details);
}

function launchGoogleWebAuthFlow(details) {
  const hooked = glanceE2eWebAuthFlow(details);
  if (hooked && typeof hooked.then === 'function') return hooked;
  return new Promise((resolve, reject) => {
""",
        """function launchGoogleWebAuthFlow(details) {
  return new Promise((resolve, reject) => {
""",
        "e2e web auth hook",
    )
    raw = replace_once(
        raw,
        "    hubspot: 'hubspotAuth', notion: 'notionAuth', salesforce: 'salesforceAuth', slack: 'slackAuth', monday: 'mondayAuth', asana: 'asanaAuth', jira: 'jiraAuth', linear: 'linearAuth', docusign: 'docusignAuth', dropbox: 'dropboxAuth',\n",
        "    notion: 'notionAuth', slack: 'slackAuth', monday: 'mondayAuth', asana: 'asanaAuth', jira: 'jiraAuth', linear: 'linearAuth', docusign: 'docusignAuth', dropbox: 'dropboxAuth',\n",
        "disconnect storage keys",
    )
    raw = replace_once(
        raw,
        """  const hs = await getHubspotAuth();
  const nt = await getNotionAuth();
  const sf = await getSalesforceAuth();
  const sl = await getSlackAuth();
""",
        """  const nt = await getNotionAuth();
  const sl = await getSlackAuth();
""",
        "connector status auth fetches",
    )
    raw = replace_once(
        raw,
        """    hubspot: {
      connected: Boolean(hs),
      configured: Boolean(HUBSPOT_CLIENT_ID)
    },
    notion: { connected:""",
        """    notion: { connected:""",
        "connector status hubspot",
    )
    raw = replace_once(
        raw,
        """    salesforce: {
      connected: Boolean(sf),
      configured: Boolean(SALESFORCE_CLIENT_ID)
    },
    slack: {""",
        """    slack: {""",
        "connector status salesforce",
    )
    raw = replace_once(
        raw,
        "  hubspot: hubspotWrite, notion: CONNECTORS.notionReadBack ? notionReadBackWrite : notionWrite, salesforce: salesforceWrite, slack: slackWrite, monday: mondayWrite,\n",
        "  notion: CONNECTORS.notionReadBack ? notionReadBackWrite : notionWrite, slack: slackWrite, monday: mondayWrite,\n",
        "writers",
    )
    raw = replace_once(
        raw,
        "  hubspot: hubspotUndo, notion: CONNECTORS.notionReadBack ? notionReadBackUndo : notionUndo, salesforce: salesforceUndo, slack: slackUndo, monday: mondayUndo,\n",
        "  notion: CONNECTORS.notionReadBack ? notionReadBackUndo : notionUndo, slack: slackUndo, monday: mondayUndo,\n",
        "undoers",
    )
    raw = replace_once(
        raw,
        "    if (msg.connectorId === 'hubspot') return reply(sendResponse, connectHubspot().then(() => ({ ok: true })));\n",
        "",
        "connect handler hubspot",
    )
    raw = replace_once(
        raw,
        "    if (msg.connectorId === 'salesforce') return reply(sendResponse, connectSalesforce().then(() => ({ ok: true })));\n",
        "",
        "connect handler salesforce",
    )
    raw = replace_once(
        raw,
        "  // would hold every 401 retry for the full 30s. Production never sets __glanceE2e.\n",
        "  // would hold every 401 retry for the full 30s. Production never sets a test hook.\n",
        "e2e comment scrub",
    )
    if flavor == "outlook":
        raw = strip_outlook_dead_connectors(raw)
    return raw


def strip_outlook_dead_connectors(raw: str) -> str:
    """Slack, Monday, and Notion writers. Outlook auth does not call them.

    runOAuthFlow is only those handshakes once HubSpot and Salesforce are gone.
    randomOAuthState stays: the Google web-flow fallback still calls it, and
    this flavor does not delete the Google writers.
    """
    raw = cut_until(
        raw,
        "const SLACK_CLIENT_ID",
        "// TODO(owner): create an OAuth Client ID",
        "slack and monday constants",
    )
    raw = cut_until(
        raw,
        "/* ------------------------------------------------------------------- Slack */\n",
        "/* ------------------------------------------------------------ Google Tasks */\n",
        "slack and monday functions",
    )
    raw = cut_until(
        raw,
        "/* ------------------------------------------------------------------ Notion */\n",
        "/* ------------------------------------------------------------- glance-assist */\n",
        "notion writer",
    )
    raw = replace_once(
        raw,
        "const NOTION_API = 'https://api.notion.com/v1';\nconst NOTION_VERSION = '2022-06-28';\n\n",
        "",
        "notion constants",
    )
    raw = replace_once(
        raw,
        """async function runOAuthFlow(authUrlBase, providerName) {
  const state = randomOAuthState();
  const resultUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrlBase + '&state=' + encodeURIComponent(state),
    interactive: true
  });
  const params = new URL(resultUrl).searchParams;
  if (params.get('state') !== state) {
    throw new Error(providerName + ' authorization could not be verified. Please try connecting again.');
  }
  const code = params.get('code');
  if (!code) throw new Error(providerName + ' did not return an authorization code.');
  return code;
}

""",
        "",
        "shared oauth handshake",
    )
    raw = replace_once(
        raw,
        "    notion: 'notionAuth', slack: 'slackAuth', monday: 'mondayAuth',\n",
        "",
        "outlook disconnect storage keys",
    )
    raw = replace_once(
        raw,
        """async function connectorStatus() {
  const nt = await getNotionAuth();
  const sl = await getSlackAuth();
  const md = await getMondayAuth();
  const gt = await getGoogleTasksAuth();
  return {
    googleTasks: {
      connected: Boolean(gt),
      configured: googleTasksConfigured(),
      detail: gt ? GLANCE_TASK_LIST_TITLE + ' list' : null
    },
    notion: { connected: Boolean(nt), configured: true, detail: nt ? nt.dbTitle : null },
    slack: {
      connected: Boolean(sl),
      configured: Boolean(SLACK_CLIENT_ID),
      detail: sl ? '#' + sl.channelId : null
    },
    monday: {
      connected: Boolean(md),
      configured: Boolean(MONDAY_CLIENT_ID),
      detail: md ? 'Board ' + md.boardId : null
    }
  };
}
""",
        """async function connectorStatus() {
  const gt = await getGoogleTasksAuth();
  return {
    googleTasks: {
      connected: Boolean(gt),
      configured: googleTasksConfigured(),
      detail: gt ? GLANCE_TASK_LIST_TITLE + ' list' : null
    }
  };
}
""",
        "outlook connector status",
    )
    raw = replace_once(
        raw,
        "  notion: notionWrite, slack: slackWrite, monday: mondayWrite,\n",
        "",
        "outlook writers",
    )
    raw = replace_once(
        raw,
        "  notion: notionUndo, slack: slackUndo, monday: mondayUndo,\n",
        "",
        "outlook undoers",
    )
    raw = replace_once(
        raw,
        """    if (msg.connectorId === 'notion') return reply(sendResponse, connectNotion(msg.token, msg.database).then((r) => ({ ok: true, detail: r.title })));
    if (msg.connectorId === 'slack') return reply(sendResponse, connectSlack(msg.channel).then((r) => ({ ok: true, detail: r.title })));
    if (msg.connectorId === 'monday') return reply(sendResponse, connectMonday(msg.board).then(() => ({ ok: true })));
""",
        "",
        "outlook connect handlers",
    )
    baked = ",\n    ".join(json.dumps(name) for name in outlook_engine_scripts())
    raw = replace_once(
        raw,
        """function surfaceScripts(id) {
  const base = (chrome.runtime.getManifest().content_scripts[0].js || []).filter((f) => GMAIL_ONLY_SCRIPTS.indexOf(f) < 0);
  return base.concat(SURFACES[id].extra);
}
""",
        f"""function surfaceScripts(id) {{
  const declared = chrome.runtime.getManifest().content_scripts;
  const fromManifest = declared && declared[0] && declared[0].js;
  const baked = [
    {baked}
  ];
  const base = (fromManifest || baked).filter((f) => GMAIL_ONLY_SCRIPTS.indexOf(f) < 0);
  return base.concat(SURFACES[id].extra);
}}
""",
        "outlook surface script list",
    )
    return raw


def transform_google_lane_host(raw: str) -> str:
    return replace_once(
        raw,
        """function laneUrl(url) {
  const e2e = typeof globalThis !== 'undefined' ? globalThis.__glanceE2e : null;
  const origin = e2e && typeof e2e.httpOrigin === 'string' ? e2e.httpOrigin : '';
  if (!origin || !url) return url;
  try {
    const u = new URL(url);
    const base = new URL(origin);
    return base.origin + u.pathname + u.search;
  } catch (e) {
    return url;
  }
}
""",
        """function laneUrl(url) {
  return url;
}
""",
        "lane host e2e url rewrite",
    )


def transform_lane_chat_worker(raw: str) -> str:
    raw = replace_once(
        raw,
        """  // The headless copy sets __glanceE2e.installed. A store build has update_url
  // and never takes this path, even if that global is present.
  function e2eToken() {
    const e2e = typeof globalThis !== 'undefined' ? globalThis.__glanceE2e : null;
    if (!e2e || e2e.installed !== true || typeof e2e.googleAuthToken !== 'function') return null;
    try {
      const manifest = typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getManifest === 'function'
        ? chrome.runtime.getManifest()
        : null;
      if (manifest && manifest.update_url) return null;
    } catch (e) { return null; }
    return e2e;
  }

  // chrome.identity cannot be replaced inside the service worker. The headless
  // suite sets __glanceE2e.googleAuthToken, the same seam getGoogleAuthToken
  // uses. Production never sets it, so the Chrome call below is unchanged.
  function silentToken() {
    return new Promise((resolve) => {
      const e2e = e2eToken();
      if (e2e) {
        Promise.resolve().then(() => e2e.googleAuthToken(false)).then((token) => resolve(token || null)).catch(() => resolve(null));
        return;
      }
      const identity = typeof chrome !== 'undefined' && chrome.identity;
""",
        """  function silentToken() {
    return new Promise((resolve) => {
      const identity = typeof chrome !== 'undefined' && chrome.identity;
""",
        "lane chat worker e2e token hook",
    )
    return raw


def transform_outlook(raw: str) -> str:
    raw = cut_until(
        raw,
        "// Debug: chrome.storage.local.glanceDebug",
        "(() => {\n",
        "outlook debug comment",
    )
    raw = replace_once(
        raw,
        "  try { debug = window.localStorage && window.localStorage.getItem('glance-debug') === '1'; } catch (e) { /* storage blocked */ }\n",
        "",
        "outlook local debug flag",
    )
    raw = remove_brace_statement(raw, "globalThis.__flowDiag = Object.freeze(", "__flowDiag")
    raw = replace_once(
        raw,
        """  try {
    storageGet({ glanceDebug: false, glanceOutlookFileTrace: 0, glanceUiLanguage: null }, (r) => {
      rememberUi(r);
      if (r && r.glanceDebug) debug = true;
      traceArmed = (Number(r && r.glanceOutlookFileTrace) || 0) > 0;
      dbg('injected', { version: VERSION, href: location.href });
      if (traceArmed) { lastSig = ''; schedule(); }
    });
  } catch (e) { /* no storage */ }
""",
        """  try { dbg('injected', { version: VERSION, href: location.href }); } catch (e) { /* no log */ }
""",
        "outlook debug arm",
    )
    raw = replace_once(
        raw,
        """  function localFileTrace() {
    try { return window.localStorage && window.localStorage.getItem('glance-outlook-file-trace') === '1'; }
    catch (e) { return false; }
  }
""",
        """  function localFileTrace() {
    return false;
  }
""",
        "outlook file-trace arm",
    )
    raw = replace_once(
        raw,
        """    // A click rewrites the chip. That must not re-enter the file chain: re-entry was what
    // set glanceOutlookFileTrace back to 0 on Do It. One trace per open message while armed.
""",
        """    // A click rewrites the chip. That must not re-enter the file chain. One trace per open message while armed.
""",
        "outlook trace comment",
    )
    raw = replace_once(
        raw,
        """        if (area === 'local' && changes.glanceDebug) debug = Boolean(changes.glanceDebug.newValue);
        if (area === 'local' && changes.glanceOutlookFileTrace) {
          const n = Number(changes.glanceOutlookFileTrace.newValue) || 0;
          traceArmed = n > 0;
          if (n > 0) { lastSig = ''; schedule(); }
        }
""",
        "",
        "outlook debug listener",
    )
    # The page must not read or write the silence log. The panel and the worker
    # still can. __glanceOutlookPage stays: that is the rescan handshake.
    raw = replace_once(raw, "  const PAGE_DIAG_KEY = 'outlookPageDiag';\n", "", "page diag key")
    raw = replace_once(
        raw,
        """    try {
      const bag = await new Promise((resolve) => storageGet({
        [PAGE_DIAG_KEY]: [],
        outlookSync: {},
        glanceWhyCurrent: null,
        glanceWhyByConv: {}
      }, resolve));
      if (stored.epoch !== mailEpoch) return;
      const ids = recordIds(stored);
      let list = (Array.isArray(bag[PAGE_DIAG_KEY]) ? bag[PAGE_DIAG_KEY] : []).filter((d) => {
        if (!d) return false;
        if (sameRecordId(d.id, ids) || sameRecordId(d.messageId, ids) || sameRecordId(d.conversationId, ids)) return false;
        if (stored.verdict === 'show' && d.verdict === 'quiet' && sameRecordId(d.priorConversationId, ids)) return false;
        return true;
      });
      list.unshift(stored);
      const patch = { [PAGE_DIAG_KEY]: list.slice(0, 40) };
      const whyKey = String(stored.conversationId || stored.messageId || '');
      const map = Object.assign({}, bag.glanceWhyByConv || {});
      const entry = {
        reason: stored.reason,
        subject: stored.subject || '',
        messageId: stored.messageId || null,
        conversationId: stored.conversationId || stored.messageId || null,
        at: stored.at
      };
      if (stored.verdict === 'show') {
        if (whyKey && map[whyKey]) delete map[whyKey];
      } else if (whyKey && stored.reason) {
        map[whyKey] = entry;
      }
      patch.glanceWhyByConv = map;
      const current = bag.glanceWhyCurrent;
      const currentKey = current && String(current.conversationId || current.messageId || '');
      if (stored.verdict === 'show') {
        if (!current || !currentKey || currentKey === whyKey) patch.glanceWhyCurrent = null;
      } else if (whyKey && stored.reason) {
        patch.glanceWhyCurrent = entry;
      }
      const sync = bag.outlookSync || {};
      if (Array.isArray(sync.diagnostics)) {
        const diagnostics = sync.diagnostics.filter((d) => {
          if (!d) return false;
          if (sameRecordId(d.conversationId, ids) || sameRecordId(d.messageId, ids) || sameRecordId(d.id, ids)) return false;
          return true;
        });
        if (diagnostics.length !== sync.diagnostics.length) patch.outlookSync = Object.assign({}, sync, { diagnostics: diagnostics });
      }
      if (!guardContext()) return;
      await new Promise((resolve) => {
        try { chrome.storage.local.set(patch, resolve); }
        catch (e) { stopQuietly(); resolve(); }
      });
      lastReasonKey = stored.key;
      lastReasonStored = true;
    } catch (e) {
      lastReasonStored = false;
    }
""",
        """    lastReasonKey = stored.key;
    lastReasonStored = true;
""",
        "page diag write",
    )
    return raw


def transform_gmail(raw: str) -> str:
    return replace_once(
        raw,
        """    // Opt-in local trace. chrome.storage.local.glanceDebug === true, unset
    // by default. One read per scan. Never sent off-device. A storage miss
    // leaves the trace off and does not stop the scan.
    let debug = false;
    try {
      const debugBag = await chrome.storage.local.get('glanceDebug');
      debug = !!(debugBag && debugBag.glanceDebug === true);
    } catch (e) {
      debug = false;
    }
""",
        """    let debug = false;
""",
        "gmail debug read",
    )


def transform_release(raw: str, sha: str, flavor: str) -> str:
    raw = replace_once(
        raw,
        "export const BUILD_SHA = 'dev';",
        f"export const BUILD_SHA = '{sha}';",
        "build sha",
    )
    return replace_once(
        raw,
        "export const BUILD_FLAVOR = 'dev';",
        f"export const BUILD_FLAVOR = '{flavor}';",
        "build flavor",
    )


TRANSFORM_FILES = {
    "manifest.json",
    "config/oauth.public.js",
    "src/background.js",
    "src/content-outlook.js",
    "src/content-gmail.js",
    "src/google-lane-host.js",
    "src/lane-chat-worker.js",
    "config/release.public.js",
}


def transform_file(rel: str, text: str, sha: str, flavor: str) -> str:
    if rel == "manifest.json":
        return transform_manifest(text, flavor)
    if rel == "config/oauth.public.js":
        return transform_oauth(text, flavor)
    if rel == "src/background.js":
        return transform_background(text, flavor)
    if rel == "src/content-outlook.js":
        return transform_outlook(text)
    if rel == "src/content-gmail.js":
        return transform_gmail(text)
    if rel == "src/google-lane-host.js":
        return transform_google_lane_host(text)
    if rel == "src/lane-chat-worker.js":
        return transform_lane_chat_worker(text)
    if rel == "config/release.public.js":
        return transform_release(text, sha, flavor)
    return text


def syntax_check(rel: str, data: bytes) -> None:
    if not rel.endswith(".js"):
        return
    # .mjs accepts import/export. Classic scripts in this tree parse as modules.
    with tempfile.NamedTemporaryFile(suffix=".mjs", delete=False) as handle:
        handle.write(data)
        name = handle.name
    try:
        result = subprocess.run(
            ["node", "--check", name], capture_output=True, text=True
        )
    finally:
        os.unlink(name)
    if result.returncode != 0:
        die(f"{rel} is not valid JavaScript after the store transform:\n{result.stderr}")


def build_bytes(sha: str, flavor: str) -> dict[str, bytes]:
    if trial.hybrid_enabled():
        die(
            "config/hybrid.public.js has enabled: true. The store zip drops the "
            "offscreen permission and does not ship the on-device runtime. Turn "
            "the switch off, or change the store permission list in the same commit."
        )
    files = trial.collect(trial.resolve_profile("lite"))
    for rel in DROPPED_FILES:
        files.pop(rel, None)
    out: dict[str, bytes] = {}
    for rel in sorted(files):
        raw = files[rel].read_bytes()
        if rel in TRANSFORM_FILES:
            text = transform_file(rel, raw.decode("utf-8"), sha, flavor)
            raw = text.encode("utf-8")
        if rel.endswith(".js"):
            syntax_check(rel, raw)
        out[rel] = raw
    release_rel = "config/release.public.js"
    if release_rel not in out:
        release_path = EXTENSION_ROOT / release_rel
        if not release_path.is_file():
            die(f"missing {release_rel}")
        release_text = transform_file(
            release_rel, release_path.read_text(encoding="utf-8"), sha, flavor
        )
        syntax_check(release_rel, release_text.encode("utf-8"))
        out[release_rel] = release_text.encode("utf-8")
    if release_rel not in out:
        die("the store zip did not pick up config/release.public.js")
    report_rel = "popup/report-problem.js"
    if report_rel not in out:
        report_path = EXTENSION_ROOT / report_rel
        if not report_path.is_file():
            die(f"missing {report_rel}")
        report_raw = report_path.read_bytes()
        syntax_check(report_rel, report_raw)
        out[report_rel] = report_raw
    if report_rel not in out:
        die("the store zip did not pick up popup/report-problem.js")
    return out


def write_zip(files: dict[str, bytes], out: Path) -> int:
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".zip.partial")
    if tmp.exists():
        tmp.unlink()
    info_date = (2026, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for rel in sorted(files):
            info = zipfile.ZipInfo(filename=rel, date_time=info_date)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, files[rel])
    os.replace(tmp, out)
    return out.stat().st_size


def zip_name(version: str, sha: str, flavor: str) -> str:
    if flavor == "outlook":
        return f"glance-{version}-{sha}-outlook-prod.zip"
    if flavor == "full":
        return f"glance-{version}-{sha}-prod.zip"
    die(f"unknown flavor {flavor!r}")
    return ""


def read_zip(path: Path) -> dict[str, bytes]:
    if not path.is_file():
        die(f"no zip at {path}")
    try:
        archive = zipfile.ZipFile(path)
    except zipfile.BadZipFile as err:
        die(f"{path} is not a zip: {err}")
    files: dict[str, bytes] = {}
    with archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            files[info.filename] = archive.read(info)
    return files


def resolve_flavor(files: dict[str, bytes], zip_path: Path | None, failures: list[str]) -> str:
    release = files.get("config/release.public.js", b"").decode("utf-8", errors="replace")
    stamped = re.search(r"export const BUILD_FLAVOR = '(outlook|full)';", release)
    flavor = stamped.group(1) if stamped else ""
    named = flavor_from_name(zip_path.name) if zip_path is not None else None
    if zip_path is not None and named is None:
        failures.append(f"zip name {zip_path.name} is not glance-<version>-<sha7>-prod.zip or glance-<version>-<sha7>-outlook-prod.zip")
    if not flavor:
        failures.append("config/release.public.js has no BUILD_FLAVOR of outlook or full")
    if flavor and named and flavor != named:
        failures.append(f"BUILD_FLAVOR is {flavor} but the zip name is the {named} package")
    return flavor or named or ""


def check_files(files: dict[str, bytes], zip_path: Path | None = None) -> dict:
    if "manifest.json" not in files:
        die("the zip has no manifest.json")
    try:
        manifest = json.loads(files["manifest.json"].decode("utf-8"))
    except json.JSONDecodeError as err:
        die(f"packaged manifest.json is not valid JSON: {err}")
    failures: list[str] = []
    flavor = resolve_flavor(files, zip_path, failures)
    rules = FLAVOR_RULES.get(flavor)
    if "key" in manifest:
        failures.append("manifest.json still has a key field")
    description = manifest.get("description") or ""
    if len(description) > DESCRIPTION_MAX:
        failures.append(f"description is {len(description)} characters (limit {DESCRIPTION_MAX})")
    if not description:
        failures.append("description is empty")
    version = str(manifest.get("version") or "")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        failures.append(f"version {version!r} is not a Chrome version")

    def same(label: str, got, allowed) -> None:
        got_list = list(got or [])
        if got_list != list(allowed):
            extra = [x for x in got_list if x not in allowed]
            missing = [x for x in allowed if x not in got_list]
            failures.append(f"{label} mismatch; extra={extra or '-'} missing={missing or '-'}")

    if rules:
        same("permissions", manifest.get("permissions"), ALLOWED_PERMISSIONS)
        same("host_permissions", manifest.get("host_permissions"), rules["hosts"])
        same("optional_host_permissions", manifest.get("optional_host_permissions"), rules["optional_hosts"])
        if rules["oauth2"]:
            oauth = manifest.get("oauth2") or {}
            scopes = oauth.get("scopes") or []
            same("oauth2.scopes", scopes, rules["scopes"])
            cid = str(oauth.get("client_id") or "")
            if cid != STORE_CLIENT_ID:
                failures.append(f"oauth2.client_id is {cid!r}; expected store client {STORE_CLIENT_ID}")
            scopes_blob = json.dumps(scopes)
            if "gmail." in scopes_blob or "drive.readonly" in scopes_blob:
                failures.append("store oauth2.scopes must not include gmail.* or drive.readonly")
        else:
            scopes = []
            if "oauth2" in manifest:
                failures.append("outlook flavor still has an oauth2 block")
            for host in list(manifest.get("host_permissions") or []) + list(manifest.get("optional_host_permissions") or []):
                if google_match(host):
                    failures.append(f"outlook flavor still grants a Google host: {host}")
            for script in manifest.get("content_scripts") or []:
                for match in script.get("matches") or []:
                    if google_match(match):
                        failures.append(f"outlook flavor content script still matches {match}")
            for entry in manifest.get("web_accessible_resources") or []:
                for match in entry.get("matches") or []:
                    if google_match(match):
                        failures.append(f"outlook flavor exposes a resource to {match}")
    else:
        scopes = ((manifest.get("oauth2") or {}).get("scopes")) or []

    needles = OUTLOOK_FORBIDDEN if flavor == "outlook" else FORBIDDEN
    hits: list[str] = []
    for rel, data in sorted(files.items()):
        suffix = Path(rel).suffix.lower()
        if suffix and suffix not in TEXT_SUFFIXES:
            continue
        text = data.decode("utf-8", errors="replace")
        for needle in needles:
            if needle in text:
                hits.append(f"{rel}: {needle}")
    if hits:
        failures.append("forbidden strings in the zip:\n  " + "\n  ".join(hits))

    page = files.get("src/content-outlook.js", b"").decode("utf-8", errors="replace")
    if "outlookPageDiag" in page or "PAGE_DIAG_KEY" in page:
        failures.append("outlookPageDiag is reachable from the Outlook page script")
    if "__glanceOutlookPage" not in page:
        failures.append("the Outlook page is missing __glanceOutlookPage")

    release = files.get("config/release.public.js", b"").decode("utf-8", errors="replace")
    sha_match = re.search(r"export const BUILD_SHA = '([0-9a-f]{7})';", release)
    sha = sha_match.group(1) if sha_match else ""
    if not sha:
        failures.append("config/release.public.js has no 7-character BUILD_SHA")
    if "export const PRIVACY_URL = 'https://" not in release:
        failures.append("PRIVACY_URL is not an https constant")
    report = files.get("popup/report-problem.js", b"").decode("utf-8", errors="replace")
    if "ai.local.flow@gmail.com" not in report and "REPORT_EMAIL" not in report:
        failures.append("report-problem.js does not address ai.local.flow@gmail.com")
    if "REPORT_EMAIL" not in report:
        failures.append("report-problem.js does not read REPORT_EMAIL")
    if re.search(r"[?&]body=", report):
        failures.append("report-problem.js puts a body on the mailto")
    if "reportMailto" not in report:
        failures.append("report-problem.js has no reportMailto")

    if zip_path is not None and flavor in FLAVOR_RULES:
        expected = zip_name(version, sha, flavor) if version and sha else ""
        if expected and zip_path.name != expected:
            failures.append(f"zip name is {zip_path.name}; expected {expected}")

    if failures:
        die("store check failed:\n- " + "\n- ".join(failures))

    return {
        "flavor": flavor,
        "version": version,
        "sha": sha,
        "description_chars": len(description),
        "permissions": list(manifest.get("permissions") or []),
        "host_permissions": list(manifest.get("host_permissions") or []),
        "optional_host_permissions": list(manifest.get("optional_host_permissions") or []),
        "scopes": list(scopes),
        "oauth2": "oauth2" in manifest,
        "files": len(files),
    }


def prod_zips() -> list[Path]:
    found = []
    for path in sorted(DIST_DIR.glob("glance-*-prod.zip")):
        if flavor_from_name(path.name):
            found.append(path)
    return found


def main_build(argv: list[str]) -> None:
    flavor = parse_flavor(argv)
    assert_dev_oauth_manifest()
    sha = git_sha7()
    if worktree_dirty():
        print(
            "cws prod: warning: the worktree has uncommitted edits. The sha is HEAD "
            "and does not cover those edits.",
            file=sys.stderr,
        )
    files = build_bytes(sha, flavor)
    manifest = json.loads(files["manifest.json"].decode("utf-8"))
    version = manifest["version"]
    out = DIST_DIR / zip_name(version, sha, flavor)
    size = write_zip(files, out)
    for old in prod_zips():
        if flavor_from_name(old.name) == flavor and old.resolve() != out.resolve():
            old.unlink()
    report = check_files(files, out)
    shown = out.relative_to(REPO_ROOT) if out.is_relative_to(REPO_ROOT) else out
    print(f"Wrote {shown} ({size} bytes, {report['files']} files)")
    print_report(shown, report)


def main_check(argv: list[str]) -> None:
    if argv == ["--self-test"]:
        self_test()
        return
    if len(argv) > 1:
        die("check-prod.py takes one zip path, or none to read dist/glance-*-prod.zip")
    paths = [Path(argv[0]).resolve()] if argv else prod_zips()
    if not paths:
        die("expected at least one dist/glance-*-prod.zip, found 0")
    for path in paths:
        files = read_zip(path)
        report = check_files(files, path)
        shown = path.relative_to(REPO_ROOT) if path.is_relative_to(REPO_ROOT) else path
        print(f"PASS {shown}")
        print_report(shown, report)


def print_report(shown, report: dict) -> None:
    print(f"flavor {report.get('flavor', '')}")
    print(f"version {report['version']}")
    print(f"sha {report['sha']}")
    print(f"description {report['description_chars']} chars (limit {DESCRIPTION_MAX})")
    print("permissions:")
    for name in report["permissions"]:
        print(f"  {name}")
    print("host_permissions:")
    for name in report["host_permissions"]:
        print(f"  {name}")
    print("optional_host_permissions:")
    for name in report["optional_host_permissions"]:
        print(f"  {name}")
    if report.get("oauth2"):
        print("oauth2.scopes:")
        for name in report["scopes"]:
            print(f"  {name}")
    else:
        print("oauth2: absent")
    print(f"store item {CWS_ITEM_ID}")


def _expect_fail(files: dict[str, bytes], name: str, label: str) -> None:
    try:
        check_files(files, Path(name))
    except SystemExit as err:
        if err.code in (None, 0):
            die(f"self-test: {label} was accepted")
    else:
        die(f"self-test: {label} did not fail")


def _manifest_bytes(manifest: dict) -> bytes:
    return json.dumps(manifest).encode()


def self_test() -> None:
    """A zip that breaks a flavor's rules must fail."""
    bad = {
        "manifest.json": _manifest_bytes({
            "manifest_version": 3,
            "name": "Glance",
            "version": "0.0.1",
            "description": "x" * (DESCRIPTION_MAX + 1),
            "key": "SHOULD_NOT_SHIP",
            "permissions": ["storage", "offscreen"],
            "host_permissions": ["https://mail.google.com/*", "https://app.hubspot.com/*"],
            "optional_host_permissions": [],
            "oauth2": {"client_id": "x", "scopes": ["https://www.googleapis.com/auth/tasks"]},
        }),
        "src/content-outlook.js": b"globalThis.__flowDiag = {};\n",
        "config/release.public.js": b"export const BUILD_SHA = 'dev';\nexport const BUILD_FLAVOR = 'full';\nexport const PRIVACY_URL = 'http://insecure.example/';\n",
        "popup/report-problem.js": b"const href = 'mailto:someone@example.com?body=the%20mail';\n",
    }
    _expect_fail(bad, "glance-0.0.1-0000000-prod.zip", "a broken full zip")

    # Today's full allow-list, named as the friends zip. Outlook must reject it.
    full_shaped = {
        "manifest.json": _manifest_bytes({
            "manifest_version": 3,
            "name": "Glance",
            "version": "0.0.1",
            "description": "Glance stays on what you are waiting on.",
            "permissions": list(ALLOWED_PERMISSIONS),
            "host_permissions": list(FULL_HOSTS),
            "optional_host_permissions": list(FULL_OPTIONAL_HOSTS),
            "oauth2": {"client_id": "x", "scopes": list(FULL_SCOPES)},
            "content_scripts": [{"matches": ["https://mail.google.com/*"], "js": ["src/content-gmail.js"]}],
        }),
        "src/content-outlook.js": b"globalThis.__glanceOutlookPage = {};\nconst PAGE_DIAG_KEY = 'outlookPageDiag';\n",
        "src/background.js": b"const SLACK_CLIENT_ID = '';\nasync function runOAuthFlow() {}\nconst NOTION_API = 'https://api.notion.com/v1';\n",
        "config/oauth.public.js": b"export const OAUTH_PUBLIC = { slackClientId: 'REPLACE_WITH_SLACK_CLIENT_ID' };\n",
        "config/release.public.js": b"export const BUILD_SHA = 'abcdef0';\nexport const BUILD_FLAVOR = 'outlook';\nexport const PRIVACY_URL = 'https://theflow-ai.com/privacy';\n",
        "popup/report-problem.js": b"export const REPORT_EMAIL = 'ai.local.flow@gmail.com';\nexport function reportMailto() { return 'mailto:' + REPORT_EMAIL + '?subject=Glance'; }\n",
    }
    _expect_fail(full_shaped, "glance-0.0.1-abcdef0-outlook-prod.zip", "a full package labeled as the outlook friends zip")

    outlook_shaped = {
        "manifest.json": _manifest_bytes({
            "manifest_version": 3,
            "name": "Glance",
            "version": "0.0.1",
            "description": "Glance stays on what you are waiting on.",
            "permissions": list(ALLOWED_PERMISSIONS),
            "host_permissions": list(OUTLOOK_HOSTS),
            "optional_host_permissions": list(OUTLOOK_OPTIONAL_HOSTS),
        }),
        "src/content-outlook.js": b"globalThis.__glanceOutlookPage = { rescan() {} };\n",
        "config/release.public.js": b"export const BUILD_SHA = 'abcdef0';\nexport const BUILD_FLAVOR = 'outlook';\nexport const PRIVACY_URL = 'https://theflow-ai.com/privacy';\n",
        "popup/report-problem.js": full_shaped["popup/report-problem.js"],
    }
    _expect_fail(outlook_shaped, "glance-0.0.1-abcdef0-prod.zip", "an outlook package labeled as the full zip")
    print("PASS self-test: a broken zip is rejected")


if __name__ == "__main__":
    main_build(sys.argv[1:])
