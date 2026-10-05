#!/usr/bin/env python3
"""Rebuild the Glance install zip and prove the download function can serve it."""

from __future__ import annotations

import json
import subprocess
import sys
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import package_trial_extension as package  # noqa: E402
import build_cws_zip as cws  # noqa: E402

REQUIRED = [
    "manifest.json",
    "config/oauth.public.js",
    "docs/SETUP.md",
    "src/background.js",
    "src/google-web-auth.js",
    "popup/popup.html",
    "popup/popup.js",
    "popup/popup.css",
    "icons/icon16.png",
    "icons/icon48.png",
    "icons/icon128.png",
]


def die(message: str) -> None:
    print(f"verify_trial_install: {message}", file=sys.stderr)
    raise SystemExit(1)


def check_zip() -> None:
    if not package.ZIP_PATH.is_file():
        die("packager did not write a zip")
    with zipfile.ZipFile(package.ZIP_PATH) as archive:
        names = set(archive.namelist())
        for rel in REQUIRED:
            if rel not in names:
                die(f"zip is missing {rel}")
        for name in names:
            if name == "picker" or name.startswith("picker/"):
                die(f"zip contains {name}; the Drive Picker must not be in the install")
            if name.startswith(("test/", ".git")) or name.endswith(".zip"):
                die(f"zip contains {name}, which is not part of the install")
            if name.startswith("docs/") and name != "docs/SETUP.md":
                die(f"zip contains {name}; only docs/SETUP.md belongs in the install")
            if "CLIENT_SECRET" in name.upper():
                die(f"zip entry name looks secret: {name}")
            if name.endswith((".js", ".html")) and b"apis.google.com" in archive.read(name):
                die(f"zip entry {name} loads a remote Google script")
        background = archive.read("src/background.js").decode("utf-8")
        if "config/oauth.public.js" not in background:
            die("packaged background.js does not import config/oauth.public.js")
        if package.HARDCODED_CLIENT_ID_RE.search(background):
            die("packaged background.js still assigns YOUR_* client IDs")
        oauth = archive.read("config/oauth.public.js").decode("utf-8")
        for field in (
            "hubspotClientId",
            "salesforceClientId",
            "slackClientId",
            "mondayClientId",
        ):
            if field not in oauth:
                die(f"oauth.public.js is missing {field}")
        if "REPLACE_WITH_" not in oauth and "publicClientId" not in oauth:
            die("oauth.public.js has neither placeholders nor the unset-id helper")
        if cws.WEB_OAUTH_CLIENT_ID not in oauth:
            die("download zip oauth.public.js is missing the Web OAuth client")
        if "WEB_OAUTH_CLIENT_ID" not in background or "launchWebAuthFlow" not in background:
            die("download zip background.js does not wire the web auth fallback")
        web_auth = archive.read("src/google-web-auth.js").decode("utf-8")
        if "response_type" not in web_auth or "access_token" not in web_auth:
            die("google-web-auth.js is missing the implicit token grant")
        if "chrome.identity.launchWebAuthFlow(" in web_auth or "chrome.identity.getAuthToken(" in web_auth:
            die("google-web-auth.js must not call chrome.identity")
        manifest = archive.read("manifest.json")
        if b'"manifest_version": 3' not in manifest and b'"manifest_version":3' not in manifest:
            die("packaged manifest is not version 3")
        packaged = json.loads(manifest)
        source = json.loads((package.EXTENSION_ROOT / "manifest.json").read_text(encoding="utf-8"))
        if packaged.get("key") != source.get("key") or "key" not in packaged:
            die("download zip must keep the unpacked manifest key")
        if packaged.get("oauth2", {}).get("client_id") != cws.UNPACKED_CLIENT_ID:
            die("download zip must keep the unpacked Google OAuth client")
        if packaged.get("version") != source.get("version"):
            die("download zip changed the extension version")
        if packaged.get("description") != source.get("description"):
            die("download zip must keep the repo manifest description")


def run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, cwd=REPO_ROOT)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def check_cws_zip() -> None:
    cws.main()
    if not cws.CWS_ZIP_PATH.is_file():
        die("store build did not write a zip")
    if cws.CWS_ZIP_PATH.resolve() == package.ZIP_PATH.resolve():
        die("store zip must not overwrite the signup download zip")
    with zipfile.ZipFile(cws.CWS_ZIP_PATH) as archive:
        names = set(archive.namelist())
        for rel in REQUIRED:
            if rel not in names:
                die(f"store zip is missing {rel}")
        for name in names:
            if name == "picker" or name.startswith("picker/"):
                die(f"store zip contains {name}; the Drive Picker must not ship")
            if name.endswith((".js", ".html")) and b"apis.google.com" in archive.read(name):
                die(f"store zip entry {name} loads a remote Google script")
        manifest = json.loads(archive.read("manifest.json"))
        store_oauth = archive.read("config/oauth.public.js").decode("utf-8")
        store_background = archive.read("src/background.js").decode("utf-8")
        if cws.WEB_OAUTH_CLIENT_ID not in store_oauth:
            die("store zip oauth.public.js is missing the Web OAuth client")
        if "WEB_OAUTH_CLIENT_ID" not in store_background or "launchWebAuthFlow" not in store_background:
            die("store zip background.js does not wire the web auth fallback")
    if "key" in manifest:
        die("store zip manifest still has key")
    if manifest.get("oauth2", {}).get("client_id") != cws.STORE_CLIENT_ID:
        die("store zip oauth2.client_id is not the store client")
    if manifest.get("oauth2", {}).get("client_id") == cws.WEB_OAUTH_CLIENT_ID:
        die("store zip oauth2.client_id must stay the Chrome-extension client, not the Web client")
    if manifest.get("description") != cws.STORE_DESCRIPTION or len(cws.STORE_DESCRIPTION) > 132:
        die("store zip description is not the store line")
    source = json.loads((package.EXTENSION_ROOT / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("version") != "0.7.3" or source.get("version") != "0.7.3":
        die("extension version must stay 0.7.3")
    if source.get("oauth2", {}).get("client_id") != cws.UNPACKED_CLIENT_ID or "key" not in source:
        die("repo manifest must keep the unpacked key and unpacked Google client")


def main() -> None:
    package.main()
    check_zip()
    check_cws_zip()
    run(["node", "--input-type=module", "-e", NODE_PUBLIC_CLIENT_ID_CHECK])
    run(["node", str(REPO_ROOT / "scripts" / "verify_download_handler.cjs")])
    print("verify_trial_install: ok")


NODE_PUBLIC_CLIENT_ID_CHECK = r"""
import { publicClientId, OAUTH_PUBLIC, WEB_OAUTH_CLIENT_ID } from './flow-trial-extension/config/oauth.public.js';
const assert = (cond, message) => { if (!cond) { console.error(message); process.exit(1); } };
assert(publicClientId('') === '', 'empty');
assert(publicClientId('   ') === '', 'blank');
assert(publicClientId('REPLACE_WITH_HUBSPOT_CLIENT_ID') === '', 'placeholder');
assert(publicClientId('YOUR_SLACK_CLIENT_ID') === '', 'legacy placeholder');
assert(publicClientId('  real-client ') === 'real-client', 'trim real id');
for (const [key, value] of Object.entries(OAUTH_PUBLIC)) {
  assert(publicClientId(value) === '', key + ' is still a placeholder and must count as unset');
}
assert(WEB_OAUTH_CLIENT_ID === '93977330357-gstvm1m1h1iet49uhgq212jfjqu11s8n.apps.googleusercontent.com', 'web client id');
assert(publicClientId(WEB_OAUTH_CLIENT_ID) === WEB_OAUTH_CLIENT_ID, 'web client is configured');
assert(!Object.values(OAUTH_PUBLIC).includes(WEB_OAUTH_CLIENT_ID), 'web client stays outside the vendor placeholder map');
console.log('publicClientId ok');
"""


if __name__ == "__main__":
    main()
