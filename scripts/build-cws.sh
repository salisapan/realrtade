#!/usr/bin/env bash
# Chrome Web Store zip. Leaves the repo manifest (unpacked key + unpacked
# OAuth client) untouched. Default output: flow-trial-extension/dist/glance-cws.zip.
# Pass --lean to drop offscreen / wasm-unsafe-eval and stub the Drive Picker.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$here/build_cws_zip.py" "$@"
