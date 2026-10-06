#!/usr/bin/env python3
"""Build the Glance zip the confirmed-signup download function serves.

Writes flow-landing/netlify/functions/download-trial-zip/flow-trial-extension.zip
from the current flow-trial-extension/ tree. The zip is gitignored; Netlify's
build command (flow-landing/netlify.toml) runs this script before functions
are packaged. See flow-trial-extension/docs/SETUP.md.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
EXTENSION_ROOT = REPO_ROOT / "flow-trial-extension"
ZIP_PATH = (
    REPO_ROOT
    / "flow-landing"
    / "netlify"
    / "functions"
    / "download-trial-zip"
    / "flow-trial-extension.zip"
)

# The download function returns the zip as a base64 body, and Netlify caps a synchronous function response at 6 MiB. Base64 adds a third, so the zip itself
# has to stay under 4.5 MiB or the download breaks with a 500 nobody sees until a person tries it. The budget leaves 10% headroom under the cap.
FUNCTION_RESPONSE_LIMIT = 6 * 1024 * 1024
FUNCTION_RESPONSE_BUDGET = int(FUNCTION_RESPONSE_LIMIT * 0.9)

# Everything the on-device model needs lives behind one door: the offscreen page the service worker opens by the OFFSCREEN_URL constant. The "lite" profile
# does not follow that door, so the page, the runtime, the 6 MB library and the 5 MB WASM are simply not reachable and are not packaged.
PROFILES = ("auto", "lite", "full")
HYBRID_CONFIG = EXTENSION_ROOT / "config" / "hybrid.public.js"
HYBRID_ENABLED_RE = re.compile(r"""\benabled\s*:\s*(true|false)\b""")

IMPORT_RE = re.compile(r"""(?:import|export)\s+(?:[^'"\n]+?\s+from\s+)?['"](\.[^'"]+)['"]""")
HTML_REF_RE = re.compile(r"""(?:src|href)\s*=\s*['"]([^'"]+)['"]""", re.I)
GETURL_RE = re.compile(r"""chrome\.runtime\.getURL\(\s*['"]([^'"]+)['"]\s*\)""")
# The hybrid path opens an offscreen page by a constant, not by getURL(): src/hybrid-sw.js  const OFFSCREEN_URL = 'src/offscreen.html'.
OFFSCREEN_RE = re.compile(r"""OFFSCREEN_URL\s*=\s*['"]([^'"]+)['"]""")
HARDCODED_CLIENT_ID_RE = re.compile(
    r"""(?:HUBSPOT|SALESFORCE|SLACK|MONDAY)_CLIENT_ID\s*=\s*['"]YOUR_"""
)
# YOUR_* / REPLACE_WITH_* are named placeholders, not credentials. A real
# secret assignment still fails the build.
SECRET_ASSIGNMENT_RE = re.compile(
    r"""(?:CLIENT_SECRET|API_KEY|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY)\s*[:=]\s*['"](?!(?:YOUR_|REPLACE_WITH_))[^'"]+['"]""",
    re.I,
)


def die(message: str) -> None:
    print(f"package_trial_extension: {message}", file=sys.stderr)
    raise SystemExit(1)


def posix(path: Path) -> str:
    return path.as_posix()


def resolve_relative(from_file: Path, spec: str) -> Path:
    if spec.startswith(("http://", "https://", "chrome-extension://", "data:")):
        die(f"{from_file} references a remote URL ({spec}); the install zip must be self-contained")
    if spec.startswith("/"):
        target = EXTENSION_ROOT / spec.lstrip("/")
    else:
        target = (from_file.parent / spec).resolve()
    try:
        target.relative_to(EXTENSION_ROOT)
    except ValueError:
        die(f"{spec} (from {from_file}) escapes the extension directory")
    if target.suffix == "" and not target.exists():
        js = target.with_suffix(".js")
        if js.exists():
            target = js
    return target


def add_file(files: dict[str, Path], path: Path) -> None:
    if not path.is_file():
        die(f"missing file required by the extension: {path}")
    rel = path.relative_to(EXTENSION_ROOT)
    if any(part.startswith(".") for part in rel.parts):
        die(f"refusing to package dotfile {rel}")
    key = posix(rel)
    files[key] = path


def html_local_refs(html_path: Path) -> list[Path]:
    text = html_path.read_text(encoding="utf-8")
    out = []
    for spec in HTML_REF_RE.findall(text):
        if spec.startswith(("#", "data:", "mailto:", "http://", "https://", "chrome-extension://")):
            continue
        spec = spec.split("#", 1)[0].split("?", 1)[0]
        if not spec:
            continue
        out.append(resolve_relative(html_path, spec))
    return out


def hybrid_enabled() -> bool:
    """Whether config/hybrid.public.js switches the on-device path on. Anything that is not a plain true/false is an error, never a guess."""
    if not HYBRID_CONFIG.is_file():
        return False
    match = HYBRID_ENABLED_RE.search(HYBRID_CONFIG.read_text(encoding="utf-8"))
    if not match:
        die(f"cannot read the enabled switch in {HYBRID_CONFIG.relative_to(REPO_ROOT)}")
    return match.group(1) == "true"


def resolve_profile(requested: str) -> str:
    """lite = no on-device runtime; full = with it. A build must never ship a switch that is on without the files behind it."""
    enabled = hybrid_enabled()
    if requested == "auto":
        return "full" if enabled else "lite"
    if requested == "lite" and enabled:
        die("profile 'lite' leaves out the on-device runtime but config/hybrid.public.js has enabled: true; ship 'full' or switch the path off")
    return requested


def verify_vendor_integrity() -> None:
    """The full profile ships vendored binaries; they must be exactly the ones scripts/hybrid/vendor-runtime.cjs recorded."""
    record_path = EXTENSION_ROOT / "vendor" / "VENDOR.json"
    if not record_path.is_file():
        die("profile 'full' needs vendor/VENDOR.json; run scripts/hybrid/vendor-runtime.cjs")
    record = json.loads(record_path.read_text(encoding="utf-8"))
    for entry in (record.get("webLlm"), record.get("modelLibrary")):
        if not isinstance(entry, dict) or not entry.get("file"):
            die("vendor/VENDOR.json is missing an entry")
        path = EXTENSION_ROOT / "vendor" / entry["file"]
        if not path.is_file():
            die(f"profile 'full' needs vendor/{entry['file']}; run scripts/hybrid/vendor-runtime.cjs")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != entry.get("sha256"):
            die(f"vendor/{entry['file']} does not match the sha256 recorded in VENDOR.json")


def module_imports(js_path: Path, profile: str = "full") -> list[Path]:
    text = js_path.read_text(encoding="utf-8")
    # import specifiers are relative to the module. chrome.runtime.getURL
    # paths are relative to the extension root.
    imported = [resolve_relative(js_path, spec) for spec in IMPORT_RE.findall(text)]
    opened = [resolve_relative(EXTENSION_ROOT / "manifest.json", spec) for spec in GETURL_RE.findall(text)]
    offscreen = [resolve_relative(EXTENSION_ROOT / "manifest.json", spec) for spec in OFFSCREEN_RE.findall(text)]
    return imported + opened + (offscreen if profile == "full" else [])


def manifest_pages(manifest: dict) -> list[str]:
    """Extension pages the manifest names, besides content scripts and the worker."""
    pages: list[str] = []
    action = manifest.get("action") or {}
    if action.get("default_popup"):
        pages.append(action["default_popup"])
    side_panel = manifest.get("side_panel") or {}
    if side_panel.get("default_path"):
        pages.append(side_panel["default_path"])
    options_ui = manifest.get("options_ui") or {}
    if options_ui.get("page"):
        pages.append(options_ui["page"])
    if isinstance(manifest.get("options_page"), str):
        pages.append(manifest["options_page"])
    if isinstance(manifest.get("devtools_page"), str):
        pages.append(manifest["devtools_page"])
    overrides = manifest.get("chrome_url_overrides") or {}
    if isinstance(overrides, dict):
        pages.extend(value for value in overrides.values() if isinstance(value, str))
    sandbox = manifest.get("sandbox") or {}
    pages.extend(page for page in (sandbox.get("pages") or []) if isinstance(page, str))
    for group in manifest.get("web_accessible_resources") or []:
        resources = group.get("resources") if isinstance(group, dict) else []
        for resource in resources:
            if not isinstance(resource, str):
                continue
            if "*" in resource:
                die(f"web_accessible_resources glob {resource!r} is not expanded into the install zip")
            pages.append(resource)
    return pages


SURFACE_TABLE_RE = re.compile(r"const SURFACES = \{(.*?)\n\};", re.S)
SURFACE_FILE_RE = re.compile(r"['\"]((?:src|core)/[A-Za-z0-9_./-]+\.(?:js|css))['\"]")


def registered_surface_files(worker: Path) -> list[Path]:
    """Files named in background.js's SURFACES table (scripts registered at runtime for opt-in sites)."""
    text = worker.read_text(encoding="utf-8")
    table = SURFACE_TABLE_RE.search(text)
    if not table:
        return []
    out: list[Path] = []
    for name in SURFACE_FILE_RE.findall(table.group(1)):
        path = EXTENSION_ROOT / name
        if not path.is_file():
            die(f"background.js SURFACES names {name}, which does not exist")
        out.append(path)
    return out


def collect(profile: str = "full") -> dict[str, Path]:
    manifest_path = EXTENSION_ROOT / "manifest.json"
    if not manifest_path.is_file():
        die(f"no manifest at {manifest_path}")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as err:
        die(f"manifest.json is not valid JSON: {err}")
    if manifest.get("manifest_version") != 3:
        die("manifest.json must be Manifest V3")

    files: dict[str, Path] = {}
    add_file(files, manifest_path)
    readme = EXTENSION_ROOT / "README.md"
    if readme.is_file():
        add_file(files, readme)
    # The popup points OAuth connectors at this file. It has to be in the
    # zip or that sentence describes a document the install does not contain.
    add_file(files, EXTENSION_ROOT / "docs" / "SETUP.md")

    referenced: list[Path] = []
    for icon in (manifest.get("icons") or {}).values():
        referenced.append(EXTENSION_ROOT / icon)
    action = manifest.get("action") or {}
    for icon in (action.get("default_icon") or {}).values():
        referenced.append(EXTENSION_ROOT / icon)
    for page in manifest_pages(manifest):
        referenced.append(EXTENSION_ROOT / page)
    worker = (manifest.get("background") or {}).get("service_worker")
    if not worker:
        die("manifest.json has no background.service_worker")
    referenced.append(EXTENSION_ROOT / worker)
    # Content scripts the worker registers at runtime (chrome.scripting.registerContentScripts: WhatsApp Web, Outlook on
    # the web) are named only in background.js's SURFACES table, not in the manifest. Without this they were missing from
    # the install zip, so turning a surface on registered files the install did not contain.
    referenced.extend(registered_surface_files(EXTENSION_ROOT / worker))
    for content in manifest.get("content_scripts") or []:
        for name in (content.get("js") or []) + (content.get("css") or []):
            referenced.append(EXTENSION_ROOT / name)

    pending = list(referenced)
    seen: set[Path] = set()
    while pending:
        path = pending.pop()
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        add_file(files, resolved)
        if resolved.suffix.lower() == ".html":
            pending.extend(html_local_refs(resolved))
        if resolved.suffix.lower() == ".js":
            pending.extend(module_imports(resolved, profile))

    # Vendored third-party code travels with its licence text and the record of what it is (scripts/hybrid/vendor-runtime.cjs). Only the full profile has any.
    vendor = EXTENSION_ROOT / "vendor"
    if profile == "full":
        verify_vendor_integrity()
        if not any(key.startswith("vendor/") and key.endswith((".js", ".wasm")) for key in files):
            die("profile 'full' packaged no runtime: nothing reaches src/offscreen.html; the OFFSCREEN_URL constant moved")
    elif any(key.startswith("vendor/") or key.startswith("src/offscreen") for key in files):
        die("profile 'lite' still reaches the on-device runtime; something other than OFFSCREEN_URL pulls it in")
    if profile == "full" and vendor.is_dir():
        for extra in sorted(vendor.glob("*.LICENSE")) + [vendor / "VENDOR.json"]:
            if extra.is_file():
                add_file(files, extra)

    oauth = EXTENSION_ROOT / "config" / "oauth.public.js"
    if posix(oauth.relative_to(EXTENSION_ROOT)) not in files:
        die("service worker does not import config/oauth.public.js — OAuth client IDs would be missing from the install zip")

    background = (EXTENSION_ROOT / worker).read_text(encoding="utf-8")
    if HARDCODED_CLIENT_ID_RE.search(background):
        die("background.js still assigns a YOUR_* client ID; put public IDs in config/oauth.public.js")
    for rel, path in files.items():
        if path.suffix.lower() not in {".js", ".html", ".css", ".md", ".json"}:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if SECRET_ASSIGNMENT_RE.search(text):
            die(f"{rel} looks like it contains a secret assignment; refusing to package it")

    return files


def write_zip(
    files: dict[str, Path],
    out: Path,
    replacements: dict[str, bytes] | None = None,
) -> int:
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".zip.partial")
    if tmp.exists():
        tmp.unlink()
    replacements = replacements or {}
    # Fixed timestamps keep two builds of the same tree byte-identical.
    info_date = (2026, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for rel in sorted(files):
            info = zipfile.ZipInfo(filename=rel, date_time=info_date)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, replacements.get(rel, files[rel].read_bytes()))
    os.replace(tmp, out)
    return out.stat().st_size


def encoded_size(size: int) -> int:
    """Length of the base64 text for `size` bytes (padding included)."""
    return ((size + 2) // 3) * 4


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--profile", choices=PROFILES, default="auto",
                        help="auto: lite while config/hybrid.public.js has the on-device path off, full once it is on")
    parser.add_argument("--out", type=Path, default=None,
                        help="write somewhere else (e.g. the Chrome Web Store upload); the function-size guard applies only to the default path")
    args = parser.parse_args(argv)
    profile = resolve_profile(args.profile)
    out = args.out.resolve() if args.out else ZIP_PATH
    files = collect(profile)
    size = write_zip(files, out)
    wire = encoded_size(size)
    shown = out.relative_to(REPO_ROOT) if out.is_relative_to(REPO_ROOT) else out
    print(f"Wrote {shown} ({size} bytes, {len(files)} files, profile {profile}; as a base64 function body {wire} of {FUNCTION_RESPONSE_LIMIT})")
    if out == ZIP_PATH and wire > FUNCTION_RESPONSE_BUDGET:
        out.unlink()
        die(f"the zip would be {wire} bytes as a function response; the budget is {FUNCTION_RESPONSE_BUDGET} of the {FUNCTION_RESPONSE_LIMIT} cap. "
            "Serve the full build from storage instead of the function, or cut the zip.")


if __name__ == "__main__":
    main()
