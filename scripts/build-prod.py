#!/usr/bin/env python3
"""Write the Chrome Web Store zip and fail if that flavor's rules break.

Default flavor is outlook: dist/glance-<version>-<sha7>-outlook-prod.zip.
`--flavor full` keeps today's package: dist/glance-<version>-<sha7>-prod.zip.
Version comes from flow-trial-extension/manifest.json. The sha is the first
7 characters of HEAD. See flow-trial-extension/docs/RELEASE.md.
"""

from __future__ import annotations

import sys

import cws_prod

if __name__ == "__main__":
    cws_prod.main_build(sys.argv[1:])
