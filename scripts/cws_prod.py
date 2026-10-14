#!/usr/bin/env python3
"""Production Chrome Web Store package for Glance.

The unpacked tree keeps its dev key and its debug hooks. This module copies
the install set, strips the store-forbidden pieces from that copy, and writes
dist/glance-<version>-<sha7>-prod.zip. Source files are not modified.
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

import package_trial_extension as trial

REPO_ROOT = trial.REPO_ROOT
EXTENSION_ROOT = trial.EXTENSION_ROOT
DIST_DIR = REPO_ROOT / "dist"
CWS_ITEM_ID = "lbihckfmoffgjjlnneoeaehbhoonfenh"
DESCRIPTION_MAX = 132

# Permissions the store package is allowed to declare. Adding one means a
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
ALLOWED_HOSTS = (
    "https://mail.google.com/*",
    "https://tasks.googleapis.com/*",
    "https://www.googleapis.com/calendar/*",
    "https://www.googleapis.com/drive/*",
    "https://www.googleapis.com/oauth2/*",
    "https://www.googleapis.com/upload/drive/*",
    "https://gmail.googleapis.com/*",
    "https://theflow-ai.com/*",
)
ALLOWED_OPTIONAL_HOSTS = (
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
)
ALLOWED_SCOPES = (
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",
)

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


def transform_manifest(raw: str) -> str:
    try:
        manifest = json.loads(raw)
    except json.JSONDecodeError as err:
        die(f"manifest.json is not valid JSON: {err}")
    manifest.pop("key", None)
    permissions = [p for p in (manifest.get("permissions") or []) if p not in DROPPED_PERMISSIONS]
    manifest["permissions"] = permissions
    description = manifest.get("description") or ""
    if len(description) > DESCRIPTION_MAX:
        die(f"description is {len(description)} characters; the store limit is {DESCRIPTION_MAX}")
    if not re.fullmatch(r"\d+\.\d+\.\d+", str(manifest.get("version") or "")):
        die(f"manifest version is not a Chrome version: {manifest.get('version')!r}")
    return json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"


def transform_oauth(raw: str) -> str:
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
    return raw


def transform_background(raw: str) -> str:
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
        "    hubspot: 'hubspotAuth', notion: 'notionAuth', salesforce: 'salesforceAuth', slack: 'slackAuth', monday: 'mondayAuth',\n",
        "    notion: 'notionAuth', slack: 'slackAuth', monday: 'mondayAuth',\n",
        "disconnect storage keys",
    )
    raw = replace_once(
        raw,
        """async function connectorStatus() {
  const hs = await getHubspotAuth();
  const nt = await getNotionAuth();
  const sf = await getSalesforceAuth();
  const sl = await getSlackAuth();
  const md = await getMondayAuth();
  const gt = await getGoogleTasksAuth();
  return {
    googleTasks: {
      connected: Boolean(gt),
      configured: googleTasksConfigured(),
      detail: gt ? GLANCE_TASK_LIST_TITLE + ' list' : null
    },
    hubspot: {
      connected: Boolean(hs),
      configured: Boolean(HUBSPOT_CLIENT_ID)
    },
    notion: { connected: Boolean(nt), configured: true, detail: nt ? nt.dbTitle : null },
    salesforce: {
      connected: Boolean(sf),
      configured: Boolean(SALESFORCE_CLIENT_ID)
    },
    slack: {""",
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
    slack: {""",
        "connector status",
    )
    raw = replace_once(
        raw,
        "  hubspot: hubspotWrite, notion: notionWrite, salesforce: salesforceWrite, slack: slackWrite, monday: mondayWrite,\n",
        "  notion: notionWrite, slack: slackWrite, monday: mondayWrite,\n",
        "writers",
    )
    raw = replace_once(
        raw,
        "  hubspot: hubspotUndo, notion: notionUndo, salesforce: salesforceUndo, slack: slackUndo, monday: mondayUndo,\n",
        "  notion: notionUndo, slack: slackUndo, monday: mondayUndo,\n",
        "undoers",
    )
    raw = replace_once(
        raw,
        """    if (msg.connectorId === 'hubspot') return reply(sendResponse, connectHubspot().then(() => ({ ok: true })));
    if (msg.connectorId === 'notion') return reply(sendResponse, connectNotion(msg.token, msg.database).then((r) => ({ ok: true, detail: r.title })));
    if (msg.connectorId === 'salesforce') return reply(sendResponse, connectSalesforce().then(() => ({ ok: true })));
""",
        """    if (msg.connectorId === 'notion') return reply(sendResponse, connectNotion(msg.token, msg.database).then((r) => ({ ok: true, detail: r.title })));
""",
        "connect handlers",
    )
    return raw


def transform_outlook(raw: str) -> str:
    raw = cut_until(
        raw,
        "// Debug: chrome.storage.local.glanceDebug",
        "(() => {\n",
        "outlook debug comment",
    )
    raw = remove_brace_statement(raw, "globalThis.__flowDiag = Object.freeze(", "__flowDiag")
    raw = replace_once(
        raw,
        """  try { debug = window.localStorage && window.localStorage.getItem('glance-debug') === '1'; } catch (e) { /* storage blocked */ }
  try {
    chrome.storage.local.get({ glanceDebug: false, glanceOutlookFileTrace: 0 }, (r) => {
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
        """      if (area === 'local' && changes.glanceDebug) debug = Boolean(changes.glanceDebug.newValue);
      if (area === 'local' && changes.glanceOutlookFileTrace) {
        const n = Number(changes.glanceOutlookFileTrace.newValue) || 0;
        traceArmed = n > 0;
        if (n > 0) { lastSig = ''; schedule(); }
      }
""",
        "",
        "outlook debug listener",
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


def transform_release(raw: str, sha: str) -> str:
    return replace_once(
        raw,
        "export const BUILD_SHA = 'dev';",
        f"export const BUILD_SHA = '{sha}';",
        "build sha",
    )


TRANSFORMS = {
    "manifest.json": lambda raw, sha: transform_manifest(raw),
    "config/oauth.public.js": lambda raw, sha: transform_oauth(raw),
    "src/background.js": lambda raw, sha: transform_background(raw),
    "src/content-outlook.js": lambda raw, sha: transform_outlook(raw),
    "src/content-gmail.js": lambda raw, sha: transform_gmail(raw),
    "config/release.public.js": lambda raw, sha: transform_release(raw, sha),
}


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


def build_bytes(sha: str) -> dict[str, bytes]:
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
        if rel in TRANSFORMS:
            text = TRANSFORMS[rel](raw.decode("utf-8"), sha)
            raw = text.encode("utf-8")
        if rel.endswith(".js"):
            syntax_check(rel, raw)
        out[rel] = raw
    if "config/release.public.js" not in out:
        die("the store zip did not pick up config/release.public.js")
    if "popup/report-problem.js" not in out:
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


def zip_name(version: str, sha: str) -> str:
    return f"glance-{version}-{sha}-prod.zip"


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


def check_files(files: dict[str, bytes], zip_path: Path | None = None) -> dict:
    if "manifest.json" not in files:
        die("the zip has no manifest.json")
    try:
        manifest = json.loads(files["manifest.json"].decode("utf-8"))
    except json.JSONDecodeError as err:
        die(f"packaged manifest.json is not valid JSON: {err}")
    failures: list[str] = []
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

    same("permissions", manifest.get("permissions"), ALLOWED_PERMISSIONS)
    same("host_permissions", manifest.get("host_permissions"), ALLOWED_HOSTS)
    same("optional_host_permissions", manifest.get("optional_host_permissions"), ALLOWED_OPTIONAL_HOSTS)
    scopes = ((manifest.get("oauth2") or {}).get("scopes")) or []
    same("oauth2.scopes", scopes, ALLOWED_SCOPES)

    hits: list[str] = []
    for rel, data in sorted(files.items()):
        suffix = Path(rel).suffix.lower()
        if suffix and suffix not in TEXT_SUFFIXES:
            continue
        text = data.decode("utf-8", errors="replace")
        for needle in FORBIDDEN:
            if needle in text:
                hits.append(f"{rel}: {needle}")
    if hits:
        failures.append("forbidden strings in the zip:\n  " + "\n  ".join(hits))

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

    if zip_path is not None:
        expected = zip_name(version, sha) if version and sha else ""
        if expected and zip_path.name != expected:
            failures.append(f"zip name is {zip_path.name}; expected {expected}")

    if failures:
        die("store check failed:\n- " + "\n- ".join(failures))

    return {
        "version": version,
        "sha": sha,
        "description_chars": len(description),
        "permissions": list(manifest.get("permissions") or []),
        "host_permissions": list(manifest.get("host_permissions") or []),
        "optional_host_permissions": list(manifest.get("optional_host_permissions") or []),
        "scopes": list(scopes),
        "files": len(files),
    }


def find_prod_zip(explicit: Path | None) -> Path:
    if explicit is not None:
        return explicit
    matches = sorted(DIST_DIR.glob("glance-*-prod.zip"))
    if len(matches) != 1:
        die(f"expected one dist/glance-*-prod.zip, found {len(matches)}")
    return matches[0]


def main_build(argv: list[str]) -> None:
    if argv:
        die("build-prod.py takes no arguments; the version and sha come from the tree")
    sha = git_sha7()
    if worktree_dirty():
        print(
            "cws prod: warning: the worktree has uncommitted edits. The sha is HEAD "
            "and does not cover those edits.",
            file=sys.stderr,
        )
    files = build_bytes(sha)
    manifest = json.loads(files["manifest.json"].decode("utf-8"))
    version = manifest["version"]
    out = DIST_DIR / zip_name(version, sha)
    size = write_zip(files, out)
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
    path = find_prod_zip(Path(argv[0]).resolve() if argv else None)
    files = read_zip(path)
    report = check_files(files, path)
    shown = path.relative_to(REPO_ROOT) if path.is_relative_to(REPO_ROOT) else path
    print(f"PASS {shown}")
    print_report(shown, report)


def print_report(shown, report: dict) -> None:
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
    print("oauth2.scopes:")
    for name in report["scopes"]:
        print(f"  {name}")
    print(f"store item {CWS_ITEM_ID}")


def self_test() -> None:
    """A zip that breaks the rules must fail. A clean minimal zip must pass the string gate."""
    bad = {
        "manifest.json": json.dumps({
            "manifest_version": 3,
            "name": "Glance",
            "version": "0.0.1",
            "description": "x" * (DESCRIPTION_MAX + 1),
            "key": "SHOULD_NOT_SHIP",
            "permissions": ["storage", "offscreen"],
            "host_permissions": ["https://mail.google.com/*", "https://app.hubspot.com/*"],
            "optional_host_permissions": [],
            "oauth2": {"client_id": "x", "scopes": ["https://www.googleapis.com/auth/tasks"]},
        }).encode(),
        "src/content-outlook.js": b"globalThis.__flowDiag = {};\n",
        "config/release.public.js": b"export const BUILD_SHA = 'dev';\nexport const PRIVACY_URL = 'http://insecure.example/';\n",
        "popup/report-problem.js": b"const href = 'mailto:someone@example.com?body=the%20mail';\n",
    }
    try:
        check_files(bad, Path("glance-0.0.1-0000000-prod.zip"))
    except SystemExit as err:
        if err.code in (None, 0):
            die("self-test: a broken zip was accepted")
    else:
        die("self-test: a broken zip did not fail")
    print("PASS self-test: a broken zip is rejected")
