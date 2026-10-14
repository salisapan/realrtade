#!/usr/bin/env python3
"""Write dist/glance-<version>-<sha7>-prod.zip and fail if the store rules break.

Version comes from flow-trial-extension/manifest.json. The sha is the first
7 characters of HEAD. See flow-trial-extension/docs/RELEASE.md.
"""

from __future__ import annotations

import sys

import cws_prod

if __name__ == "__main__":
    cws_prod.main_build(sys.argv[1:])
