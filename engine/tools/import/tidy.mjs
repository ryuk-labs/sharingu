// engine/tools/import/tidy.mjs — the readers' shared text rules (sprint 3, "the projects' data before the video"): ONE pass
// over the ops every reader builds (import-brain.mjs runs it on the source's ops, before the overlays — an overlay is a repo
// file and is fixed in the file, the audit's text rules hold it to the same bar). Pure: ops in, ops out, notes counted.
//   · no path of this machine (noMachinePath): a home-folder or absolute machine path in ANY text loses its machine
//     prefix — the home folder and the workspace root (~/batcave_vm/, ~/Batcave/), the Desktop (a Desktop file is its name),
//     /tmp and /private/tmp (→ tmp/) — and keeps the words of the path from the project's folder on
//     ("~/batcave_vm/bunny/backend/docs/plan.md" → "bunny/backend/docs/plan.md");
//   · titles a person can read (a goal's title, a question's question, a check's title, a node's, card's or doc's name):
//       plainText — markdown is unwrapped (**b**, *i*, `code`, [[link]], [text](url), a leading "# " / "- " / "> "),
//       formatting only, no word changed;
//       noEmail — an email address is a contact detail: the address becomes its mailbox name ("ryuk@bunny.test" → "ryuk");
//       a goal's title drops a bare question id in parentheses ("… (Q21F87C63) …"): it is kept in the goal's `source`
//       ({kind: "thread", ref: <the id>, label: "the question it follows"}).
//   A key field is never touched (an op whose key would change is left whole).
import { keyString } from "../../src/knowledge/schema.js";

// ---- no machine path -----------------------------------------------------------------------------------------------------
const HOME = String.raw`(?:~|\/Users\/[A-Za-z0-9._-]+|\/home\/[a-z_][a-z0-9_-]*)`;
const MACHINE_RES = [
  // a home path, with the workspace root or the Desktop after it: from the project's folder (or the file's name) on
  [new RegExp(String.raw`(^|[^A-Za-z0-9_.\-/~])${HOME}\/(?:(?:batcave_vm|Batcave|Desktop)\/)?(?=[A-Za-z0-9._-])`, "gm"), "$1"],
  // a temp path: tmp/…
  [/(^|[^A-Za-z0-9_.\-/])(?:\/private)?\/var\/folders\/[A-Za-z0-9_+-]+\/[A-Za-z0-9_+-]+\/[A-Z]\/(?=[A-Za-z0-9._-])/gm, "$1tmp/"],
  [/(^|[^A-Za-z0-9_.\-/])(?:\/private)?\/tmp\/(?=[A-Za-z0-9._-])/gm, "$1tmp/"],
  [/(^|[^A-Za-z0-9_.\-/])\/private\/(?=[A-Za-z0-9._-])/gm, "$1"],
];
export function noMachinePath(s) {
  if (typeof s !== "string" || !/~\/|\/Users\/|\/home\/|\/tmp\/|\/private\/|\/var\/folders\//.test(s)) return s;
  let t = s;
  for (const [re, to] of MACHINE_RES) t = t.replace(re, to);
  return t;
}

// ---- titles a person can read --------------------------------------------------------------------------------------------
// plainText(t) -> the title with its markdown unwrapped (formatting only: no word is changed)
export function plainText(t) {
  if (typeof t !== "string") return t;
  let s = t;
  s = s.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1");                       // [[wiki link|alias]] → wiki link
  s = s.replace(/\[([^\]]+)\]\((?:[^()\s]|\([^()\s]*\))+\)/g, "$1");           // [text](url) → text
  s = s.replace(/`+([^`]+?)`+/g, "$1");                                         // `code` → code
  s = s.replace(/\*\*([^*]+?)\*\*/g, "$1");                                     // **bold**
  s = s.replace(/(^|[^*\w])\*([A-Za-z0-9("'\[][^*]*?[A-Za-z0-9.!?)"'\]])\*(?=[^*\w]|$)/g, "$1$2"); // *italic* (never a glob: *.dart)
  s = s.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|>\s+)/, "");                         // a leading heading, bullet or quote mark
  s = s.replace(/[ \t]{2,}/g, " ").trim();
  return s || t.trim();
}
// noEmail(t) -> the title with each email address reduced to its mailbox name (a contact detail is not a title's)
const EMAIL = /\b([A-Za-z0-9._%+-]+)@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g;
export const noEmail = (t) => (typeof t === "string" ? t.replace(EMAIL, "$1") : t);
// a bare question id in parentheses (a hash id Q + 8 hex, or a named one Q-…), alone or a list: "(Q21F87C63)", "(Q-a, Q-b)"
const QID_ONE = String.raw`Q(?:[0-9A-F]{8}|-[A-Za-z0-9][A-Za-z0-9-]*)`;
const QID_PAREN = new RegExp(String.raw`\s*\(\s*(${QID_ONE}(?:\s*[,;/]\s*${QID_ONE})*)\s*\)`, "g");
// qidsOut(title) -> { title, qids } — the title without its parenthesised question ids, and the ids
export function qidsOut(t) {
  if (typeof t !== "string") return { title: t, qids: [] };
  const qids = [];
  const title = t.replace(QID_PAREN, (_, list) => { qids.push(...list.split(/[,;/]/).map((x) => x.trim()).filter(Boolean)); return ""; })
    .replace(/\s+([;:,.])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
  return { title: title || t, qids: title ? qids : [] };
}
// the title field of each kind
export const TITLE_FIELD = { goal: "title", question: "question", check: "title", node: "name", card: "name", doc: "title" };

// ---- the pass ------------------------------------------------------------------------------------------------------------
const mapStrings = (v, f) => typeof v === "string" ? f(v) : Array.isArray(v) ? v.map((x) => mapStrings(x, f))
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, f)])) : v;

// tidyOps(ops) -> { ops, notes: [{ kind, note, n }] }
export function tidyOps(opsIn) {
  const notes = new Map();
  const note = (kind, text) => { const k = `${kind}\u0000${text}`; notes.set(k, (notes.get(k) || 0) + 1); };
  const ops = opsIn.map((o) => {
    if (o.op === "remove" || !o.data) return o;
    const key = keyString(o.kind, o.data);
    let data = mapStrings(o.data, noMachinePath);
    if (JSON.stringify(data) !== JSON.stringify(o.data)) note(o.kind, "a machine path (home folder, workspace root, Desktop, /tmp) lost its machine prefix: the path from the project's folder on is kept");
    const f = TITLE_FIELD[o.kind];
    if (f && typeof data[f] === "string") {
      let t = data[f];
      const p = plainText(t);
      if (p !== t) { note(o.kind, `${f}: markdown unwrapped (formatting only)`); t = p; }
      const e = noEmail(t);
      if (e !== t) { note(o.kind, `${f}: an email address reduced to its mailbox name (a contact detail is not a title's)`); t = e; }
      if (o.kind === "goal") {
        const q = qidsOut(t);
        if (q.qids.length) {
          note("goal", "title: a bare question id in parentheses dropped; kept in source as {kind: thread, ref: <the id>}");
          t = q.title;
          const src = Array.isArray(data.source) ? data.source : [];
          data = { ...data, source: [...src, ...q.qids.filter((id) => !src.some((s) => s && s.ref === id)).map((id) => ({ kind: "thread", ref: id, label: "the question it follows" }))].slice(0, 10) };
        }
      }
      data = { ...data, [f]: t };
    }
    if (keyString(o.kind, data) !== key) return o;   // never move a key
    return data === o.data ? o : { ...o, data };
  });
  return { ops, notes: [...notes].map(([k, n]) => { const [kind, text] = k.split("\u0000"); return { kind, note: text, n }; }) };
}
