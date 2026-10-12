#!/usr/bin/env python3
"""Staleness guard: every route in the Worker must be declared in CAPABILITIES.
An undeclared route is an orphan — R cannot discover it, so it does not exist."""
import re, sys
src = open("src/index.js", encoding="utf-8").read()
# [a-z-] (not just [a-z]): PRD B1/A3 (2026-08-31) added the worker's first hyphenated
# route, /backup-dump — without the hyphen in the class, both extraction regexes below
# silently fail to match a hyphenated `path === "..."` line at all (no partial match
# without the closing quote), so the route would be invisible to this guard on BOTH
# sides of the diff and never get flagged either way. Purely additive: every existing
# (all-lowercase, no-hyphen) route still matches identically.
exact = set(re.findall(r'path === "(/[a-z-]+)"', src))
prefix = {p.rstrip("/") for p in re.findall(r'path\.startsWith\("(/[a-z-]+/)"', src)}
declared = {d.split("/:")[0] for d in re.findall(r'p:"(/[a-z/:-]+)"', src)}
missing = sorted((exact | prefix) - declared)
print(",".join(missing))
sys.exit(1 if missing else 0)
