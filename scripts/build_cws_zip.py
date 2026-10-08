#!/usr/bin/env python3
"""Build the Chrome Web Store zip. Does not modify the repo manifest.

The signup download zip (scripts/package_trial_extension.py) keeps the
unpacked key and unpacked OAuth client. This zip is the one to upload.

--lean drops the offscreen permission and wasm-unsafe-eval (the lite profile
does not ship the page that needs them) and replaces picker/picker.js with a
stub that loads no remote script.
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
UNPACKED_CLIENT_ID = "93977330357-hsd2u2bjg480q135juftdpkvo5hcsn7j.apps.googleusercontent.com"
STORE_CLIENT_ID = "93977330357-aup7do27a71h8sfhq4h35pogslt92iid.apps.googleusercontent.com"
# Web application client for launchWebAuthFlow. Same string in the unpacked
# zip and this store zip (config/oauth.public.js). This script does not
# rewrite it. The swap below is only manifest oauth2.client_id, which
# getAuthToken reads.
WEB_OAUTH_CLIENT_ID = "93977330357-gstvm1m1h1iet49uhgq212jfjqu11s8n.apps.googleusercontent.com"

# --lean: the store build without what the lite profile cannot use.
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


def store_manifest(raw: bytes, lean: bool) -> bytes:
    try:
        manifest = json.loads(raw)
    except json.JSONDecodeError as err:
        die(f"manifest.json is not valid JSON: {err}")
    client = (manifest.get("oauth2") or {}).get("client_id")
    if client != UNPACKED_CLIENT_ID:
        die("repo manifest oauth2.client_id is not the unpacked client; refusing to swap it")
    if "key" not in manifest:
        die("repo manifest has no unpacked key to strip")
    description = manifest.get("description") or ""
    if len(description) > 132:
        die(f"store description is {len(description)} characters; the limit is 132")
    manifest.pop("key", None)
    manifest["oauth2"]["client_id"] = STORE_CLIENT_ID
    expected = os.environ.get("GLANCE_STORE_VERSION")
    if expected and manifest.get("version") != expected:
        die(f"refusing to package version {manifest.get('version')}; GLANCE_STORE_VERSION is {expected}")
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
    if packed.get("description") != description:
        die("store manifest description was not kept")
    if lean and ("offscreen" in packed.get("permissions", []) or "wasm-unsafe-eval" in json.dumps(packed)):
        die("lean store manifest still asks for offscreen / wasm-unsafe-eval")
    return encoded


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Build the Chrome Web Store zip.")
    parser.add_argument("--lean", action="store_true",
                        help="drop the offscreen permission and wasm-unsafe-eval, and stub the remote-loading Drive Picker page")
    parser.add_argument("--out", type=Path, default=None,
                        help="zip path (default: flow-trial-extension/dist/glance-cws.zip)")
    args = parser.parse_args(argv)
    out = args.out.resolve() if args.out else (package.EXTENSION_ROOT / "dist" / "glance-cws.zip")
    files = package.collect("lite")
    replacements = {"manifest.json": store_manifest(files["manifest.json"].read_bytes(), lean=args.lean)}
    if args.lean and "picker/picker.js" in files:
        replacements["picker/picker.js"] = PICKER_STUB.encode("utf-8")
    if args.lean:
        for rel, path in files.items():
            if rel.endswith((".js", ".html")):
                text = replacements.get(rel, path.read_bytes()).decode("utf-8", errors="replace")
                if REMOTE_SCRIPT_RE.search(text):
                    die(f"--lean refuses to package {rel}: it still loads a remote script")
    # The Web client must travel unchanged. A swap here would break launchWebAuthFlow.
    oauth = files.get("config/oauth.public.js")
    if oauth is None or WEB_OAUTH_CLIENT_ID.encode("utf-8") not in oauth.read_bytes():
        die("lite package is missing the Web OAuth client in config/oauth.public.js")
    package.write_zip(files, out, replacements)
    shown = out.relative_to(package.REPO_ROOT) if out.is_relative_to(package.REPO_ROOT) else out
    print(f"Wrote {shown} ({out.stat().st_size} bytes, {len(files)} files, profile lite, lean {args.lean})")


if __name__ == "__main__":
    main()
