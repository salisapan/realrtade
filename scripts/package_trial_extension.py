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
GETURL_RE = re.compile(r"""chrome\.runtime\.getURL\(\s*['"]([^'"]+)['"]\s*\)""")
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
    if rel.parts and rel.parts[0] == "picker":
        die(f"refusing to package {posix(rel)}; the Drive Picker is not part of Glance")
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
    # import specifiers are relative to the module. chrome.runtime.getURL
    # paths are relative to the extension root.
    imported = [resolve_relative(js_path, spec) for spec in IMPORT_RE.findall(text)]
    opened = [resolve_relative(EXTENSION_ROOT / "manifest.json", spec) for spec in GETURL_RE.findall(text)]
    return imported + opened


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
    for icon in (action.get("default_icon") or {}).values():
        referenced.append(EXTENSION_ROOT / icon)
    for page in manifest_pages(manifest):
        referenced.append(EXTENSION_ROOT / page)
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
        if path.suffix.lower() in {".js", ".html"} and "apis.google.com" in text:
            die(f"{rel} loads a remote Google script; the package must stay self-contained")

    return files


def write_zip(
    files: dict[str, Path],
    dest: Path | None = None,
    replacements: dict[str, bytes] | None = None,
) -> None:
    dest = ZIP_PATH if dest is None else dest
    replacements = replacements or {}
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".zip.partial")
    if tmp.exists():
        tmp.unlink()
    # Fixed timestamps keep two builds of the same tree byte-identical.
    info_date = (2026, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for rel in sorted(files):
            info = zipfile.ZipInfo(filename=rel, date_time=info_date)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, replacements.get(rel, files[rel].read_bytes()))
    os.replace(tmp, dest)


def main() -> None:
    files = collect()
    write_zip(files)
    print(f"Wrote {ZIP_PATH.relative_to(REPO_ROOT)} ({ZIP_PATH.stat().st_size} bytes, {len(files)} files)")


if __name__ == "__main__":
    main()
