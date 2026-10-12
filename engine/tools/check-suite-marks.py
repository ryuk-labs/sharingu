#!/usr/bin/env python3
"""check-suite-marks.py — the gate's static net for M-ADR-036: every row a suite FILES carries the eval mark.
A heuristic over the four suites (evals.sh, sims.sh, tools/tabs-verify.sh, tools/verify-live.sh; backslash continuations
joined). A call that files must carry the mark — "eval":true (escaped or not), 'eval':True, eval=1 or group=eval — on its
own logical line, or in the body it sends:
  · the MCP door through tools/suites/door.py: `pf <key> <args>` (preview then file: the preview carries the mark) and
    `tc <key> <tool> <args>` for every filing tool (FILING_TOOLS below: preview and each tool contracts/door.json marks
    write: true that files a row, never one that only decides or closes what is filed);
  · a JSON-RPC tools/call naming a filing tool in a curl;
  · a curl POST to a filing REST door (FILING_DOORS).
The body may be a variable: `-d "$B12"` (or `tc … "$B"`) is checked at that variable's latest assignment above the line;
`-d "$1"` inside a one-line function is checked at every call of the function; `@$F` (a file of arguments) at the line
that writes "$F". It cannot see a filing hidden in a python block — tools/residue-audit.sh (verify-live) is the real net;
this one stops the common case at edit time. Exit 1 with the offending lines."""
import re, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUITES = ("evals.sh", "sims.sh", "tools/tabs-verify.sh", "tools/verify-live.sh")
# the tools whose call files a row a person could see (contracts/door.json write: true, plus preview, which stores the
# plan the file step files); decide_contribution, open_items, pick_up, publish_version and restore_version write no row of
# their own a suite marks (a decision on a filed row, an open item, a hand-over, a version: none carries an eval mark)
FILING_TOOLS = ("preview", "ask", "respond", "wrap_up", "save_file", "submit_grade", "rule_question", "create_project",
                "publish", "equip")
FILING_DOORS = ("wrap-up", "artifact?", "preview", "respond", "round", "rank", "ask", "grade", "profile", "questions/")
MARK = re.compile(r'"eval"\s*:\s*true|\\"eval\\"\s*:\s*true|\'eval\'\s*:\s*True|\[\'eval\'\]\s*=\s*True|\beval=1\b|\bgroup=eval\b')
TC = re.compile(r'\btc\s+"?\$?\w+"?\s+(' + "|".join(FILING_TOOLS) + r')\b(.*)')
PF = re.compile(r'\bpf\s+"?\$?\w+"?\s+(.*)')
RPC = re.compile(r'"name"\s*:\s*"(' + "|".join(FILING_TOOLS) + r')"|\\"name\\"\s*:\s*\\"(' + "|".join(FILING_TOOLS) + r')\\"')
DOOR = re.compile(r'\$U/(' + "|".join(re.escape(d) for d in FILING_DOORS) + r')')
VAR = re.compile(r'"\$\{?(\w+)\}?"')


def logical(path):
    lines = open(path, encoding="utf-8").read().split("\n")
    out, buf, start = [], "", 0
    for i, l in enumerate(lines, 1):
        if not buf: start = i
        if l.rstrip().endswith("\\"): buf += l.rstrip()[:-1] + " "; continue
        out.append((start, buf + l)); buf = ""
    return out


def check_file(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p): return []
    rows = logical(p)
    bad = []

    def assigned(name, before):
        # the latest assignment NAME=… above `before` (a line start, or after ; or a space-led `local`)
        # (with the 6 lines after it: a multi-line $(python3 -c "…") assignment sets the mark inside its body)
        prior = [r for r in rows if r[0] < before]
        for k in range(len(prior) - 1, -1, -1):
            if re.search(r'(^|[\s;])' + re.escape(name) + r'=', prior[k][1]): return "\n".join(l for _, l in prior[k:k + 7])
        return None

    def written(name, before):
        for n, l in reversed([r for r in rows if r[0] < before]):
            if re.search(r'>\s*"\$\{?' + re.escape(name) + r'\}?"', l): return l
        return None

    def marked(text, n, depth=0):
        if MARK.search(text): return True
        if depth > 3: return False
        refs = VAR.findall(text)
        m_at = re.search(r'"@\$\{?(\w+)\}?"', text)
        if m_at:
            w = written(m_at.group(1), n)
            return bool(w and MARK.search(w))
        for name in refs:
            if name in ("U", "K", "EVALKEY", "VASUKEY", "TESTKEY", "SP", "REIN", "VASU", "R", "RL", "DOORPY"): continue
            if name.isdigit():
                # a function's positional argument: every call of the one-line function that holds this line
                fn = re.match(r'\s*(\w+)\(\)\s*\{', text)
                if not fn: return False
                calls = [(cn, cl) for cn, cl in rows if re.search(r'\b' + fn.group(1) + r'\s+"', cl) and not cl.lstrip().startswith(fn.group(1) + "()")]
                if not calls: return False
                for cn, cl in calls:
                    args = re.findall(r'\b' + fn.group(1) + r'\s+("(?:[^"\\]|\\.)*")', cl)
                    if not args or not all(marked(a, cn, depth + 1) for a in args): return False
                return True
            a = assigned(name, n)
            if a and marked(a, n, depth + 1): return True
        return False

    for n, l in rows:
        s = l.lstrip()
        if s.startswith("#"): continue
        m = TC.search(l)
        if m and not marked(m.group(2), n):
            bad.append(f"{rel}:{n}: tc {m.group(1)} without the eval mark: {s[:140]}")
        m = PF.search(l)
        if m and not re.match(r'\s*pf\(\)', l) and not marked(m.group(1), n):
            bad.append(f"{rel}:{n}: pf (preview then file) without the eval mark: {s[:140]}")
        if "curl" in l and RPC.search(l) and not marked(l, n):
            bad.append(f"{rel}:{n}: a tools/call of a filing tool without the eval mark: {s[:140]}")
        if "curl" in l and DOOR.search(l) and re.search(r'-X\s+POST|--data|-d\s', l) and not marked(l, n):
            bad.append(f"{rel}:{n}: a POST to a filing door without the eval mark: {s[:140]}")
    return bad


bad = [b for f in SUITES for b in check_file(f)]
if bad:
    print("✗ a suite files a row without the eval mark (M-ADR-036):"); [print("   " + b) for b in bad]; sys.exit(1)
print("✓ every suite filing carries the eval mark")
