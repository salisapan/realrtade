#!/usr/bin/env python3
"""Build the Chrome Web Store zip. Does not modify the repo manifest.

The signup download zip (scripts/package_trial_extension.py) keeps the
unpacked key and unpacked OAuth client. This zip is the one to upload.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import package_trial_extension as package  # noqa: E402

# Public Chrome-extension OAuth client IDs. Not secrets.
UNPACKED_EXTENSION_ID = "dnjhplgmnkabbjogfpbhofjedlkehkai"
UNPACKED_CLIENT_ID = "93977330357-hsd2u2bjg480q135juftdpkvo5hcsn7j.apps.googleusercontent.com"
STORE_EXTENSION_ID = "lbihckfmoffgjjlnneoeaehbhoonfenh"
STORE_CLIENT_ID = "93977330357-aup7do27a71h8sfhq4h35pogslt92iid.apps.googleusercontent.com"
# Web application client for launchWebAuthFlow. Same string in the unpacked
# zip and this store zip (config/oauth.public.js). This script does not
# rewrite it. The swap below is only manifest oauth2.client_id, which
# getAuthToken reads.
WEB_OAUTH_CLIENT_ID = "93977330357-gstvm1m1h1iet49uhgq212jfjqu11s8n.apps.googleusercontent.com"
STORE_DESCRIPTION = (
    "Glance closes open loops in Gmail: what you asked, what you promised, "
    "what others asked of you. One click to close."
)
CWS_ZIP_PATH = package.EXTENSION_ROOT / "dist" / "glance-cws.zip"


def die(message: str) -> None:
    package.die(message)


def store_manifest(raw: bytes) -> bytes:
    if len(STORE_DESCRIPTION) > 132:
        die(f"store description is {len(STORE_DESCRIPTION)} characters; the limit is 132")
    try:
        manifest = json.loads(raw)
    except json.JSONDecodeError as err:
        die(f"manifest.json is not valid JSON: {err}")
    client = (manifest.get("oauth2") or {}).get("client_id")
    if client != UNPACKED_CLIENT_ID:
        die("repo manifest oauth2.client_id is not the unpacked client; refusing to swap it")
    if "key" not in manifest:
        die("repo manifest has no unpacked key to strip")
    manifest.pop("key", None)
    manifest["description"] = STORE_DESCRIPTION
    manifest["oauth2"]["client_id"] = STORE_CLIENT_ID
    if manifest.get("version") != "0.7.4":
        die(f"refusing to package version {manifest.get('version')}; this store build is 0.7.4")
    encoded = (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    packed = json.loads(encoded)
    if "key" in packed:
        die("store manifest still contains key")
    if packed["oauth2"]["client_id"] != STORE_CLIENT_ID:
        die("store manifest did not receive the store OAuth client")
    if packed["description"] != STORE_DESCRIPTION:
        die("store manifest description was not rewritten")
    return encoded


def main() -> None:
    files = package.collect()
    for rel in files:
        if rel == "picker" or rel.startswith("picker/"):
            die(f"refusing to put {rel} in the store zip")
    manifest_bytes = store_manifest(files["manifest.json"].read_bytes())
    package.write_zip(files, CWS_ZIP_PATH, {"manifest.json": manifest_bytes})
    print(
        f"Wrote {CWS_ZIP_PATH.relative_to(package.REPO_ROOT)} "
        f"({CWS_ZIP_PATH.stat().st_size} bytes, {len(files)} files)"
    )


if __name__ == "__main__":
    main()
