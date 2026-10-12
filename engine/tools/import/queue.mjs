// engine/tools/import/queue.mjs — the build queue (the board's sources/queue.json: streams[].items[] + waiting[]) → `card`
// kind `batch` (ARCHITECTURE §9, owner F2) + its `card_kind`. A queue row has no body of its own, so the card body is its
// fields verbatim as a list (source key order), followed by the brief it names, verbatim, when that file exists.
import { result, nz, NAME_MAX } from "./common.mjs";

export const BATCH_KIND = { key: "batch", label: "Queue — batches", idPattern: "^batch:[a-z0-9-]+$", roleVisibility: null };
// op field ← queue row field (the door: schema.js KINDS.card)
export const BATCH_MAP = {
  kind: '"batch"', id: "id (batch:<slug>)", name: "title, else label", status: "status (queued · next · later · landed · standing · parked …)",
  body: "\"- **<key>:** <value>\" per row field (+ stream: \"<id> — <name>\") then \"---\" and the brief file verbatim",
  roleVisibility: "null (every seated reader)",
};

const val = (v) => (typeof v === "string" ? v : JSON.stringify(v));

export function mapQueue(src) {
  const r = result();
  r.notImported = [];
  const q = src.board && src.board.queue;
  if (!q) { r.skip("card", (src.why && src.why.queue) || (src.board ? "the board has no sources/queue.json" : "no build board — no queue"), "-"); return r; }
  const rows = [...(q.streams || []).flatMap((s) => (s.items || []).map((it) => ({ it, stream: `${s.id} — ${s.name}` }))),
    ...(q.waiting || []).map((it) => ({ it, stream: "waiting" }))];
  const re = new RegExp(BATCH_KIND.idPattern);
  const seen = new Set();
  let filed = 0;
  for (const { it, stream } of rows) {
    r.count("card");
    if (!it || !re.test(String(it.id || ""))) { r.skip("card", "batch: id does not match ^batch:[a-z0-9-]+$", it && it.id); continue; }
    if (seen.has(it.id)) { r.skip("card", "batch: a duplicate id (the first row wins)", it.id); continue; }
    seen.add(it.id);
    const lines = [`- **stream:** ${stream}`, ...Object.entries(it).map(([k, v]) => `- **${k}:** ${val(v)}`)];
    let body = lines.join("\n") + "\n";
    if (it.brief) {
      const text = src.board.briefs.get(it.brief);
      if (text != null) body += `\n---\n\n${text}`;
      else r.note("card", "batch: the brief it names is not on disk — the card carries the row only");
    }
    let name = nz(it.title) ?? it.label ?? it.id;
    if (name.length > NAME_MAX) { name = name.slice(0, NAME_MAX - 1) + "\u2026"; r.note("card", `batch: a title over the door's ${NAME_MAX}-character cap is cut (the body keeps it)`); }
    r.add("card", { kind: "batch", id: it.id, name, status: nz(it.status), body, roleVisibility: BATCH_KIND.roleVisibility });
    filed++;
  }
  r.count("card_kind");
  if (filed) r.add("card_kind", { ...BATCH_KIND });
  for (const k of Object.keys(q)) if (!["streams", "waiting"].includes(k)) r.notImported.push({ what: `sources/queue.json /${k}`, why: "queue metadata, not a queue row" });
  return r;
}
