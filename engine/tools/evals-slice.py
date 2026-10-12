#!/usr/bin/env python3
"""evals-slice.py (ADR-098 §4) — `sh evals.sh --only <regex>` lands here.

evals.sh runs ~213 evals in sequential blocks, each opening with a
`# --- E<ids>: <title> ---` marker (a marker's title may wrap onto more than
one `#` line before the closing ` ---`). This tool extracts:
  - the HEADER (everything before the first marker — credential sourcing,
    pass()/fail() plumbing, chk()/code() helpers, and ~26 unmarked E1-E26-ish
    evals that predate the marker convention),
  - every SECTION whose marker text matches <regex>,
  - the FOOTER (the "$pass passed, $fail failed" summary + the self-clean block),
into one temp script and runs THAT — the ~750 lines of eval bodies in
evals.sh are never rewritten, only sliced by whole section.

WHY NOT JUST GREP THE MARKERS AND RUN THOSE LINES DIRECTLY: two known pairs of
sections share shell state across the marker boundary — a section reads a
variable a DIFFERENT, earlier section set, and running the reader without the
setter does not error, it silently asserts against an empty string, which can
produce a false PASS (a `! echo "$VAR" | grep -q X` on an unset $VAR is true)
as easily as a false FAIL. Found by a static set-before-read scan across
section boundaries (see the analysis this header describes below) and
confirmed by reading both sites:
  - E150 reads $TP, set by E137-E140 (E150's own comment even says so: "Reuses
    $TP, the same eval:true ?page=1 probe row E141 already fetched").
  - E172b and E173b read $NP, set by E171 (the non-owner /home fetch).
DEPENDENCIES below force-includes the producer section whenever a consumer is
selected, and prints a note when it does — rather than silently returning a
wrong pass/fail, or silently widening the slice with no explanation, it stays
a slice AND says exactly why it grew. THIS IS A STATIC HEURISTIC (a one-time
regex scan over evals.sh's plain text, not a shell parser) that found these
two cases; it is not re-derived on every invocation — if a future section adds
a new cross-section read, this table needs a new manual entry, or `sh
evals.sh` with no arguments (the full, unsliced run) stays correct regardless.

Never mistake a slice run for the close gate: only `sh evals.sh` with no
arguments — the full ~213-eval run — is that signal. This prints "SLICE RUN
— not the close gate" before AND after the run, and never touches evals.sh's
own footer text (self-clean still fires exactly as it does in a full run,
guarded by the same CF_TOKEN/CF_ACCOUNT check tools/lib.sh's own self_clean()
uses — sharingu's three-line env, Q65300E50, never an org-prefixed pool var).
"""
import os
import re
import subprocess
import sys
import tempfile

MARKER_RE = re.compile(r'^# --- ')
DISPATCH_START = "# >>> ADR-098 §4 slice dispatch"
DISPATCH_END = "# <<< end slice dispatch >>>"

# (consumer marker-id regex, producer marker-id regex, shared var, why)
# — see the module docstring. Matched against the START of each section's
# marker-id text (the token right after "# --- "), anchored, so "E150" matches
# "E150: rt.js Pass A ..." but not "E1500" or "E15".
DEPENDENCIES = [
    # D5 Part 5 (sprint 3): the suite was cut to a keep set whose every section is self-contained — the shared helpers
    # (tc, pf, jf, ro, has_fixture, SP, CONTRACT) live in the header, which every slice carries. A section that starts
    # reading a variable another section sets adds its (consumer, producer, var, why) row here.
]


def marker_id_text(lines, start):
    """The contiguous '#'-prefixed comment block starting at `start` — this is
    what both the user's --only regex and DEPENDENCIES match against, never the
    curl/assertion body, so a broad regex like 'eval' can't accidentally select
    every section just because that word appears in a payload somewhere."""
    j = start
    buf = []
    while j < len(lines) and lines[j].lstrip().startswith("#"):
        buf.append(lines[j])
        j += 1
    return "".join(buf)


def load_sections(path):
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()
    footer_start = None
    for i, l in enumerate(lines):
        if "passed, $fail failed" in l:
            footer_start = i
            break
    if footer_start is None:
        print("evals-slice: could not find the pass/fail summary line — refusing to slice "
              "(the footer boundary is unknown, so header/footer can't be separated safely)",
              file=sys.stderr)
        sys.exit(2)
    # Only markers BEFORE the summary line are real eval-section markers. The
    # footer's own "# --- self-clean: ... ---" comment uses the exact same
    # "# --- ... ---" convention and would otherwise be mistaken for one more
    # section, corrupting the true last section's end boundary (it would stop
    # at the self-clean comment instead of at footer_start, swallowing the
    # summary line into the last section's body — a real bug caught by the
    # end-to-end test below).
    marker_starts = [i for i, l in enumerate(lines) if i < footer_start and MARKER_RE.match(l)]
    if not marker_starts:
        print("evals-slice: no '# --- E...' markers found in " + path, file=sys.stderr)
        sys.exit(2)

    header_lines = lines[: marker_starts[0]]
    # strip the slice-dispatch block itself out of the extracted header — the
    # temp script runs with no args, so it's a harmless no-op left in, but a
    # human reading the temp script for debugging shouldn't have to wonder.
    cleaned = []
    skipping = False
    for l in header_lines:
        if l.startswith(DISPATCH_START):
            skipping = True
            continue
        if skipping:
            if l.startswith(DISPATCH_END):
                skipping = False
            continue
        cleaned.append(l)
    header_lines = cleaned
    # The harness is sourced by path relative to the SUITE file (`$(dirname "$0")/tools/lib.sh`,
    # tools/lib.sh, M-ADR-024 Wave 5), and ENGINE_DIR (used by body sections, e.g. E251b, that need
    # the real engine directory) is captured the same way. A composed slice runs from /tmp, where
    # `$(dirname "$0")` resolves to /tmp itself and every such reference silently breaks — so EVERY
    # occurrence of the literal `$(dirname "$0")` in the header is rewritten to the absolute path of
    # the real suite's directory before it is copied into the slice (generalized past just the lib.sh
    # line so a header line added later gets the same fix for free).
    engine_abs = os.path.dirname(os.path.abspath(path))
    header_lines = [l.replace('$(dirname "$0")', engine_abs) for l in header_lines]

    sections = []
    for k, s in enumerate(marker_starts):
        e = marker_starts[k + 1] if k + 1 < len(marker_starts) else footer_start
        sections.append({"start": s, "end": e, "id_text": marker_id_text(lines, s)})

    footer_lines = lines[footer_start:]
    return lines, header_lines, sections, footer_lines


def marker_id_token(section):
    """The first marker line with the '# --- ' prefix (and a same-line trailing
    ' ---' close, for single-line markers) stripped, e.g. 'E150: rt.js Pass A
    ...' — what DEPENDENCIES regexes match against, and what gets echoed back
    to the user, so it should never carry the raw comment punctuation."""
    first_line = section["id_text"].splitlines()[0]
    t = re.sub(r'^# --- ', '', first_line)
    t = re.sub(r'\s*---\s*$', '', t)
    return t


def full_marker_text(section):
    """Every line of the marker's comment block, '#'/'---' punctuation stripped
    and joined with a space — a multi-line title (several sections wrap onto 2-4
    '#' lines before the closing ' ---') reads as one string, so --only can match
    a word that only appears on the SECOND line of a wrapped title."""
    parts = []
    for line in section["id_text"].splitlines():
        t = re.sub(r'^#\s*', '', line)          # strip leading '# '
        t = re.sub(r'^---\s*', '', t)           # strip leading '--- ' (first line)
        t = re.sub(r'\s*---\s*$', '', t)        # strip trailing ' ---' (closing line)
        parts.append(t.strip())
    return " ".join(p for p in parts if p)


def select(sections, pattern):
    try:
        rx = re.compile(pattern)
    except re.error as e:
        print(f"evals-slice: bad regex {pattern!r}: {e}", file=sys.stderr)
        sys.exit(2)
    selected = [s for s in sections if rx.search(full_marker_text(s))]
    return selected


def section_matches(section, id_regex):
    return re.match(id_regex, marker_id_token(section)) is not None


def augment_with_dependencies(sections, selected):
    selected_set = {s["start"] for s in selected}
    notes = []
    added = True
    while added:
        added = False
        for consumer_rx, producer_rx, var, why in DEPENDENCIES:
            consumer_selected = any(
                section_matches(s, consumer_rx)
                for s in sections if s["start"] in selected_set
            )
            if not consumer_selected:
                continue
            producer = next((s for s in sections if section_matches(s, producer_rx)), None)
            if producer is None or producer["start"] in selected_set:
                continue
            selected_set.add(producer["start"])
            notes.append(f"also including {marker_id_token(producer)!r} "
                         f"(sets ${var} — {why})")
            added = True
    selected = [s for s in sections if s["start"] in selected_set]
    selected.sort(key=lambda s: s["start"])
    return selected, notes


def main():
    if len(sys.argv) != 3:
        print("usage: evals-slice.py <path-to-evals.sh> <regex>", file=sys.stderr)
        sys.exit(2)
    evals_path, pattern = sys.argv[1], sys.argv[2]
    lines, header_lines, sections, footer_lines = load_sections(evals_path)
    selected = select(sections, pattern)
    if not selected:
        print(f"evals-slice: no section markers matched {pattern!r} — nothing to run.",
              file=sys.stderr)
        sys.exit(2)
    selected, dep_notes = augment_with_dependencies(sections, selected)

    body = []
    for s in selected:
        body.extend(lines[s["start"]: s["end"]])

    def shq(s):
        """Escape for safe embedding inside a double-quoted POSIX sh string —
        backslash first, then the three characters double-quotes still treat
        specially (", $, `). Without this, a note like 'sets $TP' is not
        printed literally: the generated echo's double quotes let the shell
        try to expand $TP (to empty, since nothing set it in THIS script) —
        a real bug caught by the end-to-end test below."""
        return (s.replace("\\", "\\\\").replace('"', '\\"')
                 .replace("$", "\\$").replace("`", "\\`"))

    banner_top = [
        'echo "SLICE RUN — not the close gate — {} of {} sections selected '
        '(pattern: {})"\n'.format(len(selected), len(sections), shq(pattern)),
    ]
    for note in dep_notes:
        banner_top.append('echo "  note: {}"\n'.format(shq(note)))
    banner_top.append('echo "  sections: {}"\n'.format(
        shq(", ".join(marker_id_token(s).rstrip(" -") for s in selected))
    ))
    banner_top.append('echo ""\n')

    banner_bottom = [
        'echo ""\n',
        'echo "SLICE RUN — not the close gate. Only \\`sh evals.sh\\` with no '
        'arguments (the full suite) counts as the acceptance signal."\n',
    ]

    composed = (
        header_lines
        + banner_top
        + body
        + footer_lines[:1]  # the "$pass passed, $fail failed" line itself
        + banner_bottom
        + footer_lines[1:]  # self-clean, unchanged
    )

    fd, tmp_path = tempfile.mkstemp(prefix=".evals-slice-", suffix=".sh", dir="/tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.writelines(composed)
    os.chmod(tmp_path, 0o755)

    print(f"evals-slice: composed {tmp_path} ({len(selected)} section(s)) — running it now",
          file=sys.stderr)
    # The slice's own printed lines are its per-test verdicts: stream them AND keep them, then MERGE them into the
    # engine's per-test ledger (.runs/evals-<tenant>-tests.json) — a test's latest verdict wins, so a re-slice that
    # re-proves a transport drop green turns that id green on the platform's readiness face (M-ADR-043 gap 1).
    # The ledger, not the slice, is what make-state and the canvas read; a slice never touches the last-full-run totals.
    engine = os.path.dirname(os.path.abspath(evals_path))
    tenant = (os.environ.get("AGENT_R_ENV_PREFIX") or "SIRU").lower().replace("_", "-")
    os.makedirs(os.path.join(engine, ".runs"), exist_ok=True)
    log_path = os.path.join(engine, ".runs", f"evals-{tenant}-slice.log")
    with open(log_path, "w", encoding="utf-8") as log:
        proc = subprocess.Popen(["sh", tmp_path], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in proc.stdout:
            sys.stdout.write(line); sys.stdout.flush(); log.write(line)
        rc = proc.wait()
    merged = subprocess.run([sys.executable, os.path.join(engine, "tools", "run-results.py"), "--merge", log_path,
                             os.path.join(engine, ".runs", f"evals-{tenant}-tests.json")], capture_output=True, text=True)
    print((merged.stdout or merged.stderr).strip().replace(engine + "/", ""), file=sys.stderr)
    sys.exit(rc)


if __name__ == "__main__":
    main()
