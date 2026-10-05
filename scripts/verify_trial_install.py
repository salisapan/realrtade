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
    if "key" in manifest:
        die("store zip manifest still has key")
    if manifest.get("oauth2", {}).get("client_id") != cws.STORE_CLIENT_ID:
        die("store zip oauth2.client_id is not the store client")
    if manifest.get("description") != cws.STORE_DESCRIPTION or len(cws.STORE_DESCRIPTION) > 132:
        die("store zip description is not the store line")
    source = json.loads((package.EXTENSION_ROOT / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("version") != "0.7.1" or source.get("version") != "0.7.1":
        die("extension version must stay 0.7.1")
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
import { publicClientId, OAUTH_PUBLIC } from './flow-trial-extension/config/oauth.public.js';
const assert = (cond, message) => { if (!cond) { console.error(message); process.exit(1); } };
assert(publicClientId('') === '', 'empty');
assert(publicClientId('   ') === '', 'blank');
assert(publicClientId('REPLACE_WITH_HUBSPOT_CLIENT_ID') === '', 'placeholder');
assert(publicClientId('YOUR_SLACK_CLIENT_ID') === '', 'legacy placeholder');
assert(publicClientId('  real-client ') === 'real-client', 'trim real id');
for (const [key, value] of Object.entries(OAUTH_PUBLIC)) {
  assert(publicClientId(value) === '', key + ' is still a placeholder and must count as unset');
}
console.log('publicClientId ok');
"""


if __name__ == "__main__":
    main()
