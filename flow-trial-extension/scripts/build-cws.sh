#!/usr/bin/env bash
# Chrome Web Store zip. Leaves the repo manifest (unpacked key + unpacked
# OAuth client) untouched. Pass --lean for the store package that drops
# offscreen / wasm-unsafe-eval and stubs the remote Drive Picker.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
exec python3 "$root/scripts/build_cws_zip.py" "$@"
