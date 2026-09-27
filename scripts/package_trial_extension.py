#!/usr/bin/env python3
"""Build the Glance zip the confirmed-signup download function serves.

Writes flow-landing/netlify/functions/download-trial-zip/flow-trial-extension.zip
from the current flow-trial-extension/ tree. The zip is gitignored; Netlify's
build command (flow-landing/netlify.toml) runs this script before functions
are packaged. See flow-trial-extension/docs/SETUP.md.
"""

from __future__ import annotations

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

IMPORT_RE = re.compile(r"""(?:import|export)\s+(?:[^'"\n]+?\s+from\s+)?['"](\.[^'"]+)['"]""")
HTML_REF_RE = re.compile(r"""(?:src|href)\s*=\s*['"]([^'"]+)['"]""", re.I)
HARDCODED_CLIENT_ID_RE = re.compile(
    r"""(?:HUBSPOT|SALESFORCE|SLACK|MONDAY)_CLIENT_ID\s*=\s*['"]YOUR_"""
)
SECRET_ASSIGNMENT_RE = re.compile(
    r"""(?:CLIENT_SECRET|API_KEY|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY)\s*[:=]\s*['"][^'"]+['"]""",
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


def module_imports(js_path: Path) -> list[Path]:
    text = js_path.read_text(encoding="utf-8")
    return [resolve_relative(js_path, spec) for spec in IMPORT_RE.findall(text)]


def collect() -> dict[str, Path]:
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
    popup = action.get("default_popup")
    if popup:
        referenced.append(EXTENSION_ROOT / popup)
    for icon in (action.get("default_icon") or {}).values():
        referenced.append(EXTENSION_ROOT / icon)
    worker = (manifest.get("background") or {}).get("service_worker")
    if not worker:
        die("manifest.json has no background.service_worker")
    referenced.append(EXTENSION_ROOT / worker)
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
            pending.extend(module_imports(resolved))

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


def write_zip(files: dict[str, Path]) -> None:
    ZIP_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = ZIP_PATH.with_suffix(".zip.partial")
    if tmp.exists():
        tmp.unlink()
    # Fixed timestamps keep two builds of the same tree byte-identical.
    info_date = (2026, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for rel in sorted(files):
            info = zipfile.ZipInfo(filename=rel, date_time=info_date)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, files[rel].read_bytes())
    os.replace(tmp, ZIP_PATH)


def main() -> None:
    files = collect()
    write_zip(files)
    print(f"Wrote {ZIP_PATH.relative_to(REPO_ROOT)} ({ZIP_PATH.stat().st_size} bytes, {len(files)} files)")


if __name__ == "__main__":
    main()
