#!/usr/bin/env python3
"""Fail if a Glance store zip breaks that flavor's production rules.

With no arguments, checks every dist/glance-*-prod.zip. The file name selects
the allow-list: `-outlook-prod.zip` is the friends build, `-prod.zip` is full.
Pass a zip path to check that file. --self-test rejects deliberately broken
in-memory zips, including a full package named as the outlook zip.
"""

from __future__ import annotations

import sys

import cws_prod

if __name__ == "__main__":
    cws_prod.main_check(sys.argv[1:])
