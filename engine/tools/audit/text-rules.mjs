// engine/tools/audit/text-rules.mjs — the text rules every stored string must pass (sprint 3, "the projects' data before
// the video"): no path of this machine, no credential-shaped text. ONE module, used by the importer (import-brain.mjs: a hit
// in the built ops fails the run, as a validation error does) and by the audit (project-audit.mjs: a hit in the stored data
// is a [high] finding). A hit is reported by WHERE and by RULE only — never by the matched value.
//
//   node tools/audit/text-rules.mjs <ops.json> …   scan importer --out files (or overlay files): exit 1 on any hit
//
// machine path: a home-folder or absolute path of a machine — `~/…`, `/Users/…`, `/home/<name>/…`, `/private/…`, `/tmp/…`,
//   `/var/folders/…`. A source's ref names the document ("siru knowledge bank: 50_OPERATIONS/x.md"), a repo file keeps its
//   repo-relative path. NOT caught: a relative path that still names a person's folder ("Desktop/x.md"), a Windows path.
// credential-shaped text: a password or passphrase quoted in prose ("password `…`", "passphrase: …", "rotated off `…`"),
//   a key/token/secret word followed by a long opaque value, a known key prefix (sk-, sk_live_, pk_live_, rk_live_, ghp_,
//   gho_, github_pat_, xox?-, AKIA…, AIza…, a JWT eyJ….….), a private key block, a connection string or URL carrying a
//   user:password@. NOT caught: a value with no cue word beside it ("signed in as Rein with `x`", "accounts still `x`"), a
//   value of letters only ("password 'hunter'": UI labels look the same), a value under 3 characters or holding a "/",
//   a cue more than 24 characters before the value or across a sentence end, a value split across lines or described in
//   words, a secret in an image or a binary, a key with no known prefix and under 32 characters, an HTML attribute.

// the rules: [id, label, regex]; every regex is global-free (test only) and tolerant of markdown backticks
const Q = "[`\"'‘’“”]";
export const MACHINE_PATH = [
  ["home-tilde", "a home-folder path (~/…)", /(^|[\s(`"'\[<=:])~\/[A-Za-z0-9._-]/m],
  ["users", "a macOS user path (/Users/…)", /(^|[^A-Za-z0-9_.-])\/Users\/[A-Za-z0-9._-]+/],
  ["home", "a Linux home path (/home/<name>/…)", /(^|[^A-Za-z0-9_.-])\/home\/[a-z_][a-z0-9_-]*\//],
  ["private", "a /private/… path", /(^|[^A-Za-z0-9_.-])\/private\/[A-Za-z0-9._-]/],
  ["tmp", "a /tmp/… path", /(^|[^A-Za-z0-9_.-])\/tmp\/[A-Za-z0-9._-]/],
  ["var-folders", "a /var/folders/… path", /(^|[^A-Za-z0-9_.-])\/var\/folders\//],
];
// a value a cue word points at: 3+ characters of no space and no quote, with at least one character that is not a letter
// (a UI label such as 'Show' or 'Required' is all letters), and no "/" (a file path)
const V = "(?=[^\\s`\"'<>‘’“”]*[^A-Za-z\\s`\"'<>‘’“”])(?![^\\s`\"'<>]*\\/)[^\\s`\"'<>‘’“”]{3,}";
const PW = "(password|passphrase|passwd|pwd)";
export const CREDENTIAL = [
  ["quoted-password", "a password or passphrase quoted after its word (password … `x`)",
    new RegExp(`\\b${PW}s?\\b[^\\n\`"'.;|<>]{0,24}?\\**${Q}${V}${Q}`, "i")],
  ["password-before", "a quoted value named a password right after it (`x`-password, `x` password)",
    new RegExp(`${Q}${V}${Q}\\**-?\\s?${PW}\\b`, "i")],
  ["password-colon", "a password or passphrase given after a colon or equals",
    new RegExp(`\\b${PW}\\s*[:=]\\s*(?![-*_]{0,2}\\s*(none|null|n\\/a|tbd|redacted|\\[redacted\\]|<[^>]*>|\\$\\{|\\{\\{|your\\b|the\\b|a\\b|an\\b|set\\b|required\\b|optional\\b|hashed\\b|string\\b|text\\b))${V}`, "i")],
  ["rotated-off", "a value a secret was rotated off or from (rotated off `x`)", new RegExp(`\\brotated\\s+(off|from|away from)\\s+\\**${Q}[^\`"']{2,}${Q}`, "i")],
  ["key-value", "a key, token or secret word followed by a long opaque value",
    /\b(api[_ -]?key|secret|token|access[_ -]?key|private[_ -]?key|client[_ -]?secret|bearer)\b\s*[:=]?\s*[`"']?(?=[A-Za-z0-9+/_.=-]*\d)(?=[A-Za-z0-9+/_.=-]*[A-Za-z])[A-Za-z0-9+/_.=-]{32,}/i],
  ["key-prefix", "a key with a provider's prefix",
    /(^|[^A-Za-z0-9])(sk-(proj-|ant-)?[A-Za-z0-9_-]{20,}|sk_(live|test)_[A-Za-z0-9]{16,}|pk_live_[A-Za-z0-9]{16,}|rk_(live|test)_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/],
  ["private-key", "a private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["url-userinfo", "a connection string or URL with user:password@",
    /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:@\/`"'<>]+:(?!\/\/)[^\s@\/`"'<>]{3,}@[^\s`"'<>]/i],
];

// hits(text) -> [{ rule, label, group }] — group "machine-path" or "credential"; the matched value is never returned
export function textHits(text) {
  const s = typeof text === "string" ? text : text == null ? "" : JSON.stringify(text);
  if (!s) return [];
  const out = [];
  for (const [rule, label, re] of MACHINE_PATH) if (re.test(s)) out.push({ group: "machine-path", rule, label });
  for (const [rule, label, re] of CREDENTIAL) if (re.test(s)) out.push({ group: "credential", rule, label });
  return out;
}

// the ref an op is reported by: kind + its key (never a value)
export function opRef(o) {
  const d = o.data || {};
  const k = o.kind === "question" ? d.qid : o.kind === "card" ? `${d.kind}/${d.id}` : o.kind === "doc" ? d.path
    : o.kind === "edge" ? `${d.from}>${d.to}` : o.kind === "render" ? `${d.screen}|${d.state ?? ""}|${d.variant ?? ""}`
    : o.kind === "card_kind" ? d.key : o.kind === "aim" ? "aim" : o.kind === "gtm" ? "gtm" : d.id ?? d.ref ?? "?";
  return `${o.kind} ${k}`;
}
// fieldsOf(value, path) -> [[path, string]] every string inside an op's data, with its field path
function fieldsOf(v, path, out) {
  if (typeof v === "string") out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => fieldsOf(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) fieldsOf(x, path ? `${path}.${k}` : k, out);
  return out;
}
// scanOps(ops) -> [{ ref, field, group, rule, label }] — every hit in every string of every op (renders' bodies included)
export function scanOps(ops) {
  const out = [];
  for (const o of ops) {
    if (o.op === "remove") continue;
    for (const [field, s] of fieldsOf(o.data, "", [])) for (const h of textHits(s)) out.push({ ref: opRef(o), field, ...h });
  }
  return out;
}

// the CLI: scan --out files (or overlay files) and print where, never what
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import("node:fs");
  const files = process.argv.slice(2);
  if (!files.length) { console.error("usage: node tools/audit/text-rules.mjs <ops.json> …"); process.exit(2); }
  let n = 0;
  for (const f of files) {
    const j = JSON.parse(readFileSync(f, "utf8"));
    const ops = Array.isArray(j) ? j : Array.isArray(j.batches) ? j.batches.flatMap((b) => b.ops) : Array.isArray(j.ops) ? j.ops : Array.isArray(j.items) ? j.items : [];
    const hits = scanOps(ops);
    n += hits.length;
    const by = new Map();
    for (const h of hits) { const k = `${h.group} · ${h.rule}`; (by.get(k) || by.set(k, []).get(k)).push(`${h.ref} (${h.field})`); }
    console.log(`${f}: ${ops.length} ops · ${hits.length ? `${hits.length} hit(s)` : "clean (no machine path, no credential-shaped text)"}`);
    for (const [k, refs] of by) console.log(`  ${k}: ${refs.length} — ${[...new Set(refs)].slice(0, 40).join("; ")}`);
  }
  process.exit(n ? 1 : 0);
}
