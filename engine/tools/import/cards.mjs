// engine/tools/import/cards.mjs — the kit's card kinds (kit.cards: dir · files · kindFile · the mdSplit M-ADRs) →
// `card_kind` + `card` ops, bodies verbatim. Two kinds are NOT re-filed as cards, each named in the skips:
//   · a card whose exact bytes are already filed as a doc (the ryuklabs capsules → docs capsules/<id>.md);
//   · a card that is a generated rendering of a question row filed as `question` (the board's cards/questions/*.md,
//     written by source/board/cards.mjs) — two copies of one question would drift on the first ruling.
//   · (a board) every card of a kind the reader marks `skip` — the renderings of model rows this import files as nodes.
// A kind the reader marks `open` files roleVisibility null (every seated reader): its source declares no rule.
import { result, nz, firstH1, NAME_MAX, ID_RE } from "./common.mjs";

const STATUS_MAX = 40;   // the door's cap on a card's status (schema.js)

const DEFAULT_ID = "^[A-Za-z0-9][A-Za-z0-9._-]*$";   // gen/pack.mjs's default idPattern

// op field ← source field (the door: schema.js KINDS.card_kind / KINDS.card)
export const CARD_KIND_MAP = {
  key: "kind", label: "label", idPattern: "idPattern (the kit's default when none)",
  roleVisibility: "roleVisibility, else the kit's rule: kit.roles keys, else [\"owner\"]",
};
export const CARD_MAP = {
  kind: "the kind's key", id: "the card id (file name without .md · files{} key · M-ADR id · index row id)",
  name: "files{}.name · the M-ADR title · the index row name · a dir card's first `# ` heading, else its id (cut at the door's 400)",
  status: "the M-ADR status (decided|superseded) · the index row status · else null",
  body: "the file's bytes as UTF-8, verbatim (an M-ADR: its section of the log)",
  roleVisibility: "the kind's roleVisibility",
};

// docs: the doc ops already built (a card whose body is a filed doc's body is not filed twice); qids: the filed questions
export function mapCards(src, { docs = [], qids = new Set() } = {}) {
  const r = result();
  const docBodies = new Map(docs.map((d) => [d.data.body, d.data.path]));
  const vis = (v) => v || (src.roleDefault.length ? src.roleDefault : ["owner"]);
  for (const def of src.cardDefs) {
    const roleVisibility = def.open ? null : vis(def.roleVisibility);
    const idRe = new RegExp(def.idPattern || DEFAULT_ID);
    let filed = 0;
    for (const c of def.cards) {
      r.count("card");
      if (def.skip) { r.skip("card", def.skip, `${def.kind}/${c.id}`); continue; }
      if (docBodies.has(c.body)) { r.skip("card", `kind ${def.kind}: the same bytes are filed as a doc`, `${def.kind}/${c.id} = doc ${docBodies.get(c.body)}`); continue; }
      if (qids.has(c.id) && def.generated) { r.skip("card", `kind ${def.kind}: a generated rendering of a question row filed as \`question\` (same qid)`, `${def.kind}/${c.id}`); continue; }
      if (!idRe.test(c.id)) { r.skip("card", `kind ${def.kind}: id does not match the kind's idPattern`, `${def.kind}/${c.id}`); continue; }
      if (!ID_RE.test(c.id)) { r.skip("card", `kind ${def.kind}: an id the door's id rule refuses (a space, a leading "_", over 120 characters \u2026)`, `${def.kind}/${c.id}`); continue; }
      let name = nz(c.name) ?? firstH1(c.body) ?? c.id;
      if (name.length > NAME_MAX) { name = name.slice(0, NAME_MAX - 1) + "\u2026"; r.note("card", `a name over the door's ${NAME_MAX}-character cap is cut (the body keeps the text)`); }
      let status = nz(c.status);
      if (typeof status === "string" && status.length > STATUS_MAX) { status = null; r.note("card", `a status over the door's ${STATUS_MAX}-character cap is dropped (the body keeps it)`); }
      r.add("card", { kind: def.kind, id: c.id, name, status, body: c.body, roleVisibility });
      filed++;
    }
    r.count("card_kind");
    if (!filed) { r.skip("card_kind", "every card of the kind was skipped (see card skips)", def.kind); continue; }
    r.add("card_kind", { key: def.kind, label: def.label, idPattern: def.idPattern || DEFAULT_ID, roleVisibility });
  }
  return r;
}
