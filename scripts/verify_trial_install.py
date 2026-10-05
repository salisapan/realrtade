#!/usr/bin/env python3
"""Rebuild the Glance install zip and prove the download function can serve it."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
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
    # Registered at runtime when the person turns a site on (background.js SURFACES), so not in the manifest.
    "src/content-outlook.js",
    "core/owa-parse.js",
    "src/chip-host.js",
    "src/content-whatsapp.js",
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


RUNTIME_MARKERS = ("vendor/web-llm.js", "vendor/Phi-3-mini-4k-instruct-q4f16_1-MLC-webgpu.wasm", "src/offscreen.html", "src/offscreen.js")


def expect_die(label: str, fn) -> None:
    try:
        fn()
    except SystemExit as err:
        if err.code not in (0, None):
            return
    die(f"{label}: the packager should have refused and did not")


def check_profiles() -> None:
    """Both builds, measured. lite is what the function serves while the on-device path is off; full is the Chrome Web Store build."""
    with tempfile.TemporaryDirectory() as tmp:
        sizes = {}
        for profile in ("lite", "full"):
            out = Path(tmp) / f"{profile}.zip"
            package.main(["--profile", profile, "--out", str(out)])
            with zipfile.ZipFile(out) as archive:
                names = set(archive.namelist())
                if archive.testzip() is not None:
                    die(f"{profile} zip is corrupt")
            sizes[profile] = out.stat().st_size
            for rel in REQUIRED:
                if rel not in names:
                    die(f"{profile} zip is missing {rel}")
            have = [m for m in RUNTIME_MARKERS if m in names]
            if profile == "lite" and have:
                die(f"lite zip carries the on-device runtime: {have}")
            if profile == "full" and len(have) != len(RUNTIME_MARKERS):
                die(f"full zip is missing runtime files: {sorted(set(RUNTIME_MARKERS) - set(have))}")
            if profile == "full" and "vendor/web-llm.LICENSE" not in names:
                die("full zip ships the runtime without its licence text")
        if not sizes["lite"] < sizes["full"] / 3:
            die(f"lite ({sizes['lite']}) is not much smaller than full ({sizes['full']}); something large is still bundled")
        if package.encoded_size(sizes["lite"]) > package.FUNCTION_RESPONSE_BUDGET:
            die("the lite zip does not fit the download function's response budget")
        print(f"verify_trial_install: lite {sizes['lite']} B ({package.encoded_size(sizes['lite'])} B on the wire), full {sizes['full']} B ({package.encoded_size(sizes['full'])} B), cap {package.FUNCTION_RESPONSE_LIMIT}")

    # A build must never ship a switch that is on without the files behind it, nor binaries that are not the recorded ones.
    with tempfile.TemporaryDirectory() as tmp:
        on = Path(tmp) / "hybrid.public.js"
        on.write_text("export const HYBRID = { enabled: true };\n", encoding="utf-8")
        real = package.HYBRID_CONFIG
        package.HYBRID_CONFIG = on
        try:
            if package.resolve_profile("auto") != "full":
                die("auto must pick full when the on-device path is on")
            expect_die("lite with the path on", lambda: package.resolve_profile("lite"))
        finally:
            package.HYBRID_CONFIG = real
        if package.resolve_profile("auto") != ("full" if package.hybrid_enabled() else "lite"):
            die("auto does not follow config/hybrid.public.js")

        fake = Path(tmp) / "ext"
        (fake / "vendor").mkdir(parents=True)
        record = json.loads((package.EXTENSION_ROOT / "vendor" / "VENDOR.json").read_text(encoding="utf-8"))
        for entry in (record["webLlm"], record["modelLibrary"]):
            (fake / "vendor" / entry["file"]).write_bytes(b"tampered")
        (fake / "vendor" / "VENDOR.json").write_text(json.dumps(record), encoding="utf-8")
        real_root = package.EXTENSION_ROOT
        package.EXTENSION_ROOT = fake
        try:
            expect_die("tampered vendor binary", package.verify_vendor_integrity)
            (fake / "vendor" / "VENDOR.json").unlink()
            expect_die("missing VENDOR.json", package.verify_vendor_integrity)
        finally:
            package.EXTENSION_ROOT = real_root

    # The function-size guard: a zip over budget is refused and not left behind for the function to fail on.
    real_budget = package.FUNCTION_RESPONSE_BUDGET
    package.FUNCTION_RESPONSE_BUDGET = 1000
    try:
        expect_die("function-size guard", lambda: package.main(["--profile", "lite"]))
        if package.ZIP_PATH.exists():
            die("an over-budget zip was left in the function directory")
    finally:
        package.FUNCTION_RESPONSE_BUDGET = real_budget


def run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, cwd=REPO_ROOT)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main() -> None:
    check_profiles()
    package.main([])
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
