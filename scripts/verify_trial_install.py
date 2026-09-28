#!/usr/bin/env python3
"""Rebuild the Glance install zip and prove the download function can serve it."""

from __future__ import annotations

import subprocess
import sys
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import package_trial_extension as package  # noqa: E402

REQUIRED = [
    "manifest.json",
    "config/oauth.public.js",
    "docs/SETUP.md",
    "src/background.js",
    "popup/popup.html",
    "popup/popup.js",
    "popup/popup.css",
    "picker/picker.html",
    "picker/picker.js",
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
            if name.startswith(("test/", ".git")) or name.endswith(".zip"):
                die(f"zip contains {name}, which is not part of the install")
            if name.startswith("docs/") and name != "docs/SETUP.md":
                die(f"zip contains {name}; only docs/SETUP.md belongs in the install")
            if "CLIENT_SECRET" in name.upper():
                die(f"zip entry name looks secret: {name}")
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


def run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, cwd=REPO_ROOT)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main() -> None:
    package.main()
    check_zip()
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
