#!/usr/bin/env python3
"""Fail if a Glance store zip breaks the production rules.

With no arguments, checks the single dist/glance-*-prod.zip. Pass a zip path
to check that file. --self-test rejects a deliberately broken in-memory zip.
"""

from __future__ import annotations

import sys

import cws_prod

if __name__ == "__main__":
    cws_prod.main_check(sys.argv[1:])
