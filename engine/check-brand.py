#!/usr/bin/env python3
"""W-F · the brand gate — no hand-typed tenant fact in engine render output
(ADR-092 §4, owner /mcq rulings 2026-09-01). Every brand/tenant string must
thread through src/tenant.js's seam; a literal SIRU (or its live domain)
anywhere else in src/*.js is drift, caught here before it ships.

src/tenant.js is exempt: DEFAULT_BRAND is the ONE in-code fallback copy the
seam itself carries (ADR-094) — that is the seam, not a violation of it.

READINESS REVIEW extension (Wave 1, #meta): a literal "SIRU" was only ONE
shape of "Theme A" drift — the fallback a not-yet-configured org hits must
carry ZERO tenant fact, and a real person's name / a dated SIRU session or
business-timeline id / a hand-typed SIRU doc reference are just as much a
tenant fact as the word "SIRU" itself. Three more checks below, same
discipline (strip comments first, scope to src/*.js only, tenant.js exempt —
never scanned against eval/test files, which live outside src/ entirely):

  PEOPLE  — a known SIRU person's name in render output. Zero exceptions: a
            real person's name has no legitimate place in engine code.
  DATAID  — an ADR/session id pattern (ADR-\\d, M-ADR-\\d, bare S-\\d\\d\\d) in a
            render string. Most of this codebase's own citations are ENGINE
            architecture history (this repo's own decision log — e.g.
            "ADR-100" for the workspace model, true and correct for every
            tenant) and are NOT themselves a violation; a plain regex can't
            tell those apart from a genuinely SIRU-business-dated citation
            like the review's own find — "ADR-059 (pilot-ready in ~1
            month)" / "S-019" in what was supposed to be generic fallback
            prose. So: DATAID_ALLOW is the reviewed baseline — every id
            present in the tree as of this fix session, confirmed to be
            engine doctrine, not tenant data. A BRAND NEW id, not yet on
            that list, fails the gate and must be reviewed (added here with
            a note, or threaded through the seam instead) before it ships.
            That's the ratchet: the allowed set doesn't grow silently.
  DOCPATH — a hand-typed `/doc/<section>/<file>.md` reference in a render
            string. Same ratchet as DATAID: DOCPATH_ALLOW is today's
            reviewed set, each one confirmed to render ONLY behind an
            existence/served check at its call site — never unconditionally
            (finding #7 was exactly an unconditional one). A new,
            unreviewed doc path fails.

Extending either ALLOW set is a deliberate, reviewed act — never a way to
silence a real finding. If check-brand.py fails on a new id/path, the fix is
either (a) it's genuinely fine, generic engine doctrine → add it here with a
note, or (b) it's tenant data → thread it through src/tenant.js's seam.
"""
import re, sys, pathlib

# Literal exemptions from BAD below. EMPTY since the P4 prune (2026-09-27): /install's env vars and token files
# and the handoff user-agent no longer carry another org's name (siru_session was
# retired earlier, M-ADR-024: __Host-ar_session). Adding one back is a reviewed act, never a way to get green.
ALLOW = []
BAD = re.compile(r"\bSIRU\b|\bsiru\b|agent\.ryuklabs\.io")

# ---- readiness-review DATA-class checks (Wave 1, #meta) ----
PEOPLE = re.compile(r"\b(Vasu|Rein|Thyagu|Thiyagu|Acie)\b")

DATAID = re.compile(r"\bM-ADR-\d+[a-z]?\b|\bADR-\d+[a-z]?\b|(?<![A-Za-z0-9-])S-\d{3}\b")
# Tenant RECORD ids (product pass 2026-09-05): a real transmission id or a real screen number
# hand-typed anywhere in src (MCP tool descriptions were the class check-brand could not see —
# "e.g. T-20260830-004", "screen:041A" — a lie to every agent on another org). Shapes (NNN,
# T-YYYYMMDD-NNN) are fine; digits are not.
RECORDID = re.compile(r"\bT-\d{8}-\d{3}\b|\bscreen:\d{3}[A-Z]?\b|\b0\d{2},0\d{2}[A-Z]?\b")
# The reviewed baseline as of the readiness-review fix session (all four waves) — every
# ADR/session id confirmed to be ENGINE architecture (this repo's own decision log),
# never SIRU business/timeline data. Sorted; add a one-line note when you extend it.
DATAID_ALLOW = {
    "ADR-002", "ADR-013", "ADR-016", "ADR-019", "ADR-055", "ADR-070", "ADR-071",
    "ADR-072", "ADR-073", "ADR-074", "ADR-081", "ADR-082", "ADR-084", "ADR-085",
    "ADR-089", "ADR-090", "ADR-091", "ADR-092", "ADR-093", "ADR-094", "ADR-100",
    "ADR-102", "M-ADR-002", "M-ADR-005", "M-ADR-006", "M-ADR-008a", "M-ADR-010",
    "M-ADR-011", "M-ADR-013", "M-ADR-014", "M-ADR-017", "M-ADR-019", "M-ADR-020",
    "ADR-078",  # THE LOOP (an answer IS a leader-lane contribution, src/qnaire.js) — reviewed door-true batch 2026-09-21, engine doctrine already cited in-tree; the `respond` MCP tool desc: names it
    "S-039", "S-040",
    # reviewed UI-B8a 2026-09-28: GET /contract serves contracts/door.json from the generated src/doorcontract.js, so the
    # ids door.json already quotes (from index.js's registries and contracts/door.declared.json) reach src/ — each is
    # engine doctrine, the same for every tenant: the owner control panel (ADR-057), the filing->ruling link (ADR-079),
    # project scoping bound in every statement (M-ADR-028)
    "ADR-057", "ADR-079", "M-ADR-028",
    # reviewed D5 2026-10-03: two CAPABILITIES rows the stripper never read before — a removed row's "mind/*" opened a
    # false block comment that hid them; both are engine doctrine, the same for every tenant: the logout (ADR-056) and
    # the storage guard (ADR-087)
    "ADR-056", "ADR-087",
}

# The ENGINE name is a seam value too (brand.engine) — M-ADR-024 Wave 3: every renderer
# receives `brand`, so a literal "Agent R" in render output is the same drift class as a
# literal "SIRU" (an org that white-labels the engine would leak it). Allowed ONLY where
# the line is clearly not user-facing render output; extend with a note, never to get green.
ENGINE = re.compile(r"\bAgent R\b")
ENGINE_ALLOW_SUBSTR = [
    "DEFAULT_BRAND",          # the seam's own fallback object / references to it
]

DOCPATH = re.compile(r"/doc/(?:canon|process|alignments|library)/[A-Za-z0-9_./-]+")
# The reviewed baseline: each of these renders ONLY behind an existence/served check at
# its call site (never unconditionally) as of the readiness-review fix session.
DOCPATH_ALLOW = set()   # D6: the three it held rendered on /understanding and /agentic, deleted with them

# THE ORG'S FACTS COME FROM ITS ROW (sprint 3, D6): the brand, the home project and the org's settings are the `org` table's
# one row (src/tenant.js ORG_SQL); nothing in src/ reads the old R2 manifest or any other served brain file. A code line
# (comments stripped) naming an R2 key under serve/ is a read of the old path coming back.
SERVED = re.compile(r"""["'`]serve/""")


def strip_comments(src):
    # block comments (/* ... */, possibly multi-line) go first, so a // inside
    # one doesn't confuse the line-comment pass below.
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.DOTALL)
    out = []
    for line in src.split("\n"):
        if line.strip().startswith("//") or line.strip().startswith("*"):
            continue
        out.append(line)
    return "\n".join(out)


problems = []
for path in sorted(pathlib.Path("src").rglob("*.js")):   # src/*.js and the folders under it (src/knowledge/)
    if path.name in ("tenant.js", "doorcontract.js"):   # the seam itself (checked below); the generated contract quotes prose
        continue
    code = strip_comments(path.read_text(encoding="utf-8"))
    for name in ALLOW:
        code = code.replace(name, "")
    for i, line in enumerate(code.split("\n"), start=1):
        stripped = line.strip()
        if BAD.search(line):
            problems.append(f"{path}:{i}: SIRU literal — {stripped}")
        if PEOPLE.search(line):
            problems.append(f"{path}:{i}: person name in render output — {stripped}")
        for m in RECORDID.finditer(line):
            problems.append(f"{path}:{i}: tenant record id hand-typed '{m.group(0)}' — {stripped}")
        if ENGINE.search(line) and not any(a in line for a in ENGINE_ALLOW_SUBSTR):
            problems.append(f"{path}:{i}: engine name hand-typed in render output (use brand.engine) — {stripped}")
        for m in DATAID.finditer(line):
            if m.group(0) not in DATAID_ALLOW:
                problems.append(f"{path}:{i}: unreviewed ADR/session id '{m.group(0)}' — {stripped}")
        if SERVED.search(line):
            problems.append(f"{path}:{i}: a served brain file named (the old R2 path; the org's facts are its row) — {stripped}")
        for m in DOCPATH.finditer(line):
            if m.group(0) not in DOCPATH_ALLOW:
                problems.append(f"{path}:{i}: unreviewed doc path '{m.group(0)}' — {stripped}")

# the seam itself: src/tenant.js answers the org's facts from its ONE row and nowhere else (sprint 6, 6.2: the request's org's
# row, the layer writing the org in: src/data.js {org}), and an org with no row reads the product's own name (never another org's)
tenant = strip_comments(pathlib.Path("src/tenant.js").read_text(encoding="utf-8"))
if 'SELECT * FROM org WHERE id = {org}' not in tenant:
    problems.append("src/tenant.js: the org's facts are not read from its row (ORG_SQL)")
if SERVED.search(tenant) or re.search(r"\bBRAIN\b", tenant):
    problems.append("src/tenant.js: reads the bucket (the org's facts are its D1 row)")
if not re.search(r'export const PRODUCT = "sharingu"', tenant) or not re.search(r"org: PRODUCT", tenant):
    problems.append("src/tenant.js: an org with no row must read the product's own name (DEFAULT_BRAND.org = PRODUCT)")

if problems:
    print("\n".join(problems))
    sys.exit(1)
sys.exit(0)
