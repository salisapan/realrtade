#!/usr/bin/env python3
"""Stamp a Glance build with the git commit it was cut from.

The committed tree cannot name its own commit, so the stamp is written when a
build is cut: into the install zip (package_trial_extension.py calls
stamped_bytes) or onto a folder (`python3 scripts/stamp_build.py --root DIR`).

  manifest.json          "version_name": "<version>+<sha7>"   (version_name only)
  core/build-stamp.js    STAMP = '<sha7>'

The service worker and every content script print `Glance build <sha7>` when
they start, and the popup shows the same value, so the code that is running
can be told from the code that was loaded earlier.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
EXTENSION_ROOT = REPO_ROOT / "flow-trial-extension"
STAMP_RE = re.compile(r"(const STAMP = ')[^']*(';)")
PICKER_BUNDLED_RE = re.compile(r"(const PICKER_BUNDLED = )(true|false)(;)")
VERSION_NAME_RE = re.compile(r'^\s*"version_name"\s*:.*\n', re.M)
VERSION_RE = re.compile(r'^(\s*)"version"\s*:\s*"([^"]+)"\s*,?\s*\n', re.M)


def git_sha7(root: Path = REPO_ROOT) -> str:
    try:
        sha = subprocess.run(["git", "rev-parse", "--short=7", "HEAD"], cwd=root, check=True,
                             capture_output=True, text=True).stdout.strip()
        dirty = subprocess.run(["git", "status", "--porcelain", "--", "flow-trial-extension"], cwd=root, check=True,
                               capture_output=True, text=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "nogit"
    return sha + ("-dirty" if dirty else "")


def valid(sha: str) -> bool:
    return bool(re.fullmatch(r"[0-9a-z]{4,12}(-dirty)?", sha or ""))


def stamp_manifest(text: str, sha: str) -> str:
    version = VERSION_RE.search(text)
    if not version:
        raise ValueError("manifest.json has no version line")
    cleaned = VERSION_NAME_RE.sub("", text)
    version = VERSION_RE.search(cleaned)
    indent, number = version.group(1), version.group(2)
    line = f'{indent}"version_name": "{number}+{sha}",\n'
    json.loads(cleaned[: version.end()] + line + cleaned[version.end():])
    return cleaned[: version.end()] + line + cleaned[version.end():]


def stamp_build_js(text: str, sha: str, picker_bundled: bool) -> str:
    if not STAMP_RE.search(text):
        raise ValueError("core/build-stamp.js has no STAMP constant")
    text = STAMP_RE.sub(lambda m: m.group(1) + sha + m.group(2), text, count=1)
    if not PICKER_BUNDLED_RE.search(text):
        raise ValueError("core/build-stamp.js has no PICKER_BUNDLED constant")
    flag = "true" if picker_bundled else "false"
    return PICKER_BUNDLED_RE.sub(lambda m: m.group(1) + flag + m.group(3), text, count=1)


def stamped_bytes(rel: str, data: bytes, sha: str, picker_bundled: bool = False) -> bytes:
    """The bytes a build ships for `rel`. Every other file is returned unchanged."""
    if not valid(sha):
        raise ValueError(f"not a usable build stamp: {sha!r}")
    if rel == "manifest.json":
        return stamp_manifest(data.decode("utf-8"), sha).encode("utf-8")
    if rel == "core/build-stamp.js":
        return stamp_build_js(data.decode("utf-8"), sha, picker_bundled).encode("utf-8")
    return data


def stamp_tree(root: Path, sha: str) -> None:
    picker_bundled = (root / "picker" / "picker.html").is_file()
    for rel in ("manifest.json", "core/build-stamp.js"):
        path = root / rel
        path.write_bytes(stamped_bytes(rel, path.read_bytes(), sha, picker_bundled=picker_bundled))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=Path, default=EXTENSION_ROOT, help="extension folder to stamp in place")
    parser.add_argument("--sha", default=None, help="stamp to write (default: short git SHA of HEAD)")
    args = parser.parse_args(argv)
    sha = args.sha or git_sha7()
    if not valid(sha):
        print(f"not a usable build stamp: {sha!r}", file=sys.stderr)
        return 1
    stamp_tree(args.root.resolve(), sha)
    print(f"stamped {args.root} with {sha}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
