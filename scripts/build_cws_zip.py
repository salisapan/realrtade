#!/usr/bin/env python3
"""Build the Chrome Web Store zip. Does not modify the repo manifest.

The signup download zip (scripts/package_trial_extension.py) keeps the
unpacked key and unpacked OAuth client. This zip is the one to upload.

--lean drops the offscreen permission and wasm-unsafe-eval (the lite
profile does not ship the on-device page that needs them) and replaces
picker/picker.js with a stub that loads nothing remote.
"""

from __future__ import annotations

import argparse
import json
import os
import re
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
# zip and this store zip once config/oauth.public.js carries it. This script
# does not rewrite it. The swap below is only manifest oauth2.client_id,
# which getAuthToken reads. This 0.9.37 tree does not ship that fallback;
# see patch-D-google-web-auth-fallback.patch (not applied).
WEB_OAUTH_CLIENT_ID = "93977330357-gstvm1m1h1iet49uhgq212jfjqu11s8n.apps.googleusercontent.com"
STORE_DESCRIPTION = (
    "Glance closes open loops in Gmail: what you asked, what you promised, "
    "what others asked of you. One click to close."
)
# Must match flow-trial-extension/manifest.json version on this branch.
# GLANCE_STORE_VERSION overrides it for a one-off build of another tip (the
# manifest must still say the same version, or the build stops).
STORE_VERSION = os.environ.get("GLANCE_STORE_VERSION") or "0.9.37"
CWS_ZIP_PATH = package.EXTENSION_ROOT / "dist" / "glance-cws.zip"

# --lean: the store build without what the lite profile cannot use.
#  - "offscreen" permission and 'wasm-unsafe-eval': only the on-device model
#    (src/offscreen.html + vendor WASM) needs them, and the lite profile does
#    not package that page. src/hybrid-sw.js already returns
#    "offscreen-unavailable" when chrome.offscreen is missing, and the path is
#    off (config/hybrid.public.js enabled: false). Neither carries a Chrome
#    permission warning, so adding them back later does not disable anyone.
#  - picker/picker.js loads https://apis.google.com/js/api.js, which store
#    review treats as remotely hosted code (the reason 0.7.1 dropped the
#    Picker). Its API key is a placeholder, so the page only ever shows "not
#    set up yet". The store copy gets a stub that shows that same message and
#    loads nothing remote. The repo file is untouched.
LEAN_CSP = "script-src 'self'; object-src 'self'"
PICKER_STUB = """// Store build stub (scripts/build_cws_zip.py --lean). The Drive Picker needs
// Google's remote gapi loader, which a Chrome Web Store package may not
// load, so this copy only explains that it is not available.
const statusEl = document.getElementById('status');
if (statusEl) {
  statusEl.textContent = 'The Drive picker is not available in this version. Close this window and attach the file in Gmail.';
  statusEl.className = 'state err';
}
"""
REMOTE_SCRIPT_RE = re.compile(
    r"""\.src\s*=\s*['"]https?://|import\(\s*['"]https?://|importScripts\(\s*['"]https?://"""
)


def die(message: str) -> None:
    package.die(message)


def store_manifest(raw: bytes, lean: bool = False) -> bytes:
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
    if manifest.get("version") != STORE_VERSION:
        die(f"refusing to package version {manifest.get('version')}; this store build is {STORE_VERSION}")
    if lean:
        if package.hybrid_enabled():
            die("--lean drops the offscreen permission, but config/hybrid.public.js has the on-device path on")
        manifest["permissions"] = [p for p in manifest.get("permissions", []) if p != "offscreen"]
        csp = manifest.get("content_security_policy") or {}
        if "extension_pages" in csp:
            csp["extension_pages"] = LEAN_CSP
    encoded = (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    packed = json.loads(encoded)
    if "key" in packed:
        die("store manifest still contains key")
    if packed["oauth2"]["client_id"] != STORE_CLIENT_ID:
        die("store manifest did not receive the store OAuth client")
    if packed["description"] != STORE_DESCRIPTION:
        die("store manifest description was not rewritten")
    if lean and ("offscreen" in packed.get("permissions", []) or "wasm-unsafe-eval" in json.dumps(packed)):
        die("lean store manifest still asks for offscreen / wasm-unsafe-eval")
    return encoded


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Build the Chrome Web Store zip.")
    parser.add_argument(
        "--lean",
        action="store_true",
        help="drop the offscreen permission and wasm-unsafe-eval, and stub the remote-loading Drive Picker page",
    )
    parser.add_argument("--out", type=Path, default=None, help="write somewhere other than flow-trial-extension/dist/glance-cws.zip")
    args = parser.parse_args(argv)
    # lite: no hybrid WASM in the Store upload (hybrid is off; keeps the zip small).
    files = package.collect("lite")
    replacements = {"manifest.json": store_manifest(files["manifest.json"].read_bytes(), lean=args.lean)}
    if args.lean and "picker/picker.js" in files:
        replacements["picker/picker.js"] = PICKER_STUB.encode("utf-8")
    if args.lean:
        for rel, path in files.items():
            if rel.endswith((".js", ".html")):
                text = replacements.get(rel, path.read_bytes()).decode("utf-8", errors="replace")
                if REMOTE_SCRIPT_RE.search(text):
                    die(f"{rel} still loads a remote script; the lean store build must not")
    out = args.out.resolve() if args.out else CWS_ZIP_PATH
    package.write_zip(files, out, replacements)
    shown = out.relative_to(package.REPO_ROOT) if out.is_relative_to(package.REPO_ROOT) else out
    print(
        f"Wrote {shown} "
        f"({out.stat().st_size} bytes, {len(files)} files, profile lite{', lean' if args.lean else ''})"
    )


if __name__ == "__main__":
    main()
