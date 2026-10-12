// src/hats.js — who a person is here: their ROLE (what they may do) and their HATS (what they need first). PURE: no D1, no
// imports, so core.js, knowledge/schema.js, the pages and the selftests all read the ONE copy.
//
// The owner's ruling (MCQ, 2026-09-30, evening; docs/plan/LOOK.md): roles are Admin · Member · Partner. people.role keeps
// 'owner' for the admin (every `role === "owner"` check in the worker is the admin's, unchanged), 'member' for everyone
// inside the org and 'partner' for an outside collaborator who sees only the projects they are seated on. The typed role
// labels an org used before (economics, internal-eng, external-ai, ...) became each person's HAT (people.hats, migrate-044),
// one or more of the seven: the website's six (sharingu_website/assets/brand/teams.js) and Quality, the owner's seventh (MCQ,
// 2026-10-10: the testers — test runs, grades on checks, bugs found, release readiness).
//
// What a person may READ (the visibility rule every door applies: core.js mayRead, knowledge/schema.js rolesAdmit, the card
// SQL in knowledge/cards.js, knowledge/store.js visibleTo, knowledge/versions.js redactChanges) is readerKeys(person): a
// roleVisibility list or a capsule name admits them when it names one of
//   · their role ('owner' reads everything: that check is the callers' own, `role === "owner"`, never this set's);
//   · people.role_label: the typed role they held before migrate-044, kept verbatim so nothing they could read disappears
//     (it is set by the migration and by provisioning a typed role, never by a door a person presses);
//   · their ACCESS hats (people.access_hats, migrate-045), which only the ADMIN sets (POST /control set-access-hats, Invite).
//     A Partner's access hats count like anyone's: the admin set them.
// The owner's ruling (MCQ, 2026-10-01): "the admin sets the hats that unlock briefings and cards; a person's self-chosen hats
// only shape what Home shows them first." So the hats a person picks for themselves on /profile (people.hats) NEVER admit
// them to anything: they lead Home's For-you strip and label the rail's foot, nothing else.
// No hat and no label can ever be 'owner' (hatsOf keeps the seven; readerKeys drops an 'owner' label).

// the seven hats: the website's six in its order (teams.js, verbatim), then Quality (the owner's seventh, 2026-10-10; no typed
// label maps to it, so migrate-044/045's backfill and LABEL_HATS are unchanged): key · label · the one-line meaning · what
// the hat needs first
// copy: off-screen (each hat's line and detail ride its chip's title on Profile and Control)
export const HATS = [
  { key: "management", label: "Management", line: "Know where you're needed.",
    detail: "See the goal, its budget, the people responsible and the decisions waiting on you." },
  { key: "engineering", label: "Engineering", line: "Keep the why beside the work.",
    detail: "The brief, the design and the last decision come with the task. Your contribution carries its evidence back to the goal." },
  { key: "organization", label: "Organization", line: "See how the pieces connect.",
    detail: "Follow the knowledge across people, partner organizations and native tools. Every connection has a reason and a responsible person." },
  { key: "gtm", label: "Go-to-market", line: "Turn a decision into a launch.",
    detail: "Bring the audience, the approved promise and the creative together, with the source decision one click away." },
  { key: "finance", label: "Finance", line: "Follow the money to the goal.",
    detail: "Connect spend to the person, contribution and outcome it supports. See what is allocated, used and still needs evidence." },
  { key: "partner", label: "Partner", line: "Work together. Keep the right scope.",
    detail: "Contribute to a shared project without opening unrelated company context. The brief, review and your credit travel with the work." },
  { key: "quality", label: "Quality", line: "Know what is proven before it ships.",
    detail: "See every check beside the screens and doors it verifies, with its latest grade. Grade the test runs with their proof, file the bugs you find, and say when a release is ready." },
];
export const HAT_KEYS = HATS.map((h) => h.key);
const HAT_BY_KEY = new Map(HATS.map((h) => [h.key, h]));
export const hatOf = (key) => HAT_BY_KEY.get(String(key || "")) || null;

// the three roles and their word on glass
export const ADMIN = "owner", MEMBER = "member", PARTNER = "partner";
export const ROLE_WORDS = { admin: "Admin", member: "Member", partner: "Partner" };
// roleClassOf(role) -> "admin" | "member" | "partner": the role as the product names it. A typed label a row still carries
// (a database migrate-044 has not reached, or a script's provisioning before it) reads by the same rule the migration applies.
export function roleClassOf(role) {
  const r = String(role || "").trim().toLowerCase();
  if (r === ADMIN) return "admin";
  if (r === PARTNER || isOutsideLabel(r)) return "partner";
  return "member";
}
export const roleWordOf = (role) => ROLE_WORDS[roleClassOf(role)];
// an outside collaborator's typed label: external-*, vendor (core.js mandateFloorFor's own "never mandated" rule)
export const isOutsideLabel = (label) => { const r = String(label || "").toLowerCase(); return r.startsWith("external") || r === "vendor"; };

// THE mapping from a typed role label to its hats (migrate-044's hats backfill and migrate-045's access-hats backfill carry
// the same CASE, and tools/hats-selftest.mjs holds the three together). A label not listed maps to no hat.
export const LABEL_HATS = {
  owner: ["management"],
  leader: ["management"],
  economics: ["finance"],
  product: ["engineering"],
  design: ["engineering"],
  "internal-eng": ["engineering"],
  "ai-platform": ["engineering"],
  logistics: ["organization"],
  gtm: ["gtm"],
  "external-ai": ["partner"],
  "external-logistics": ["partner"],
  vendor: ["partner"],
};
// fromTypedRole(label) -> { role, label, hats }: what provisioning a person with a typed role (a script's add-person role=…)
// writes since migrate-044: the role class, the label kept for visibility, the label's hats (since migrate-045 both their own
// hats and, unless Invite named others, their access hats: src/admin.js add-person). member / partner (and the old "seated")
// are roles, not labels.
export function fromTypedRole(label) {
  const l = String(label || "").trim().toLowerCase().slice(0, 40);
  if (!l || l === MEMBER || l === "seated") return { role: MEMBER, label: null, hats: [] };
  if (l === PARTNER) return { role: PARTNER, label: null, hats: ["partner"] };
  return { role: isOutsideLabel(l) ? PARTNER : MEMBER, label: l, hats: [...(LABEL_HATS[l] || [])] };
}

// hatsOf(raw) -> the hat keys a stored value names: a JSON list (people.hats) or an array, the seven only, in HATS'
// order, each once. Anything else (null, junk, an unknown key) is no hat.
export function hatsOf(raw) {
  let v = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  if (!Array.isArray(v)) return [];
  const want = new Set(v.map((x) => String(x || "").trim().toLowerCase()));
  return HAT_KEYS.filter((k) => want.has(k));
}
// hatsJson(list) -> the stored value (null for none)
export const hatsJson = (list) => { const h = hatsOf(Array.isArray(list) ? list : []); return h.length ? JSON.stringify(h) : null; };
// accessJson(list) -> the stored people.access_hats (migrate-045): always a list, '[]' for none, never null, so a second run of
// the migration's backfill (WHERE access_hats IS NULL) never re-grants what the admin took away
export const accessJson = (list) => JSON.stringify(hatsOf(Array.isArray(list) ? list : []));

// readLabelOf(person) -> the typed label (people.role_label) a person reads by, or null: never 'owner', and for a Partner only an
// outside label (external-*, vendor: the label that made them one). Review fix 7 (sprint 2): a member's old typed label
// (product, design, …) kept on their row after a demotion to Partner unlocks nothing; it is still shown to the admin.
export function readLabelOf(person) {
  if (!person || typeof person !== "object") return null;
  const label = String(person.role_label || "").trim();
  if (!label || label === ADMIN) return null;
  if (roleClassOf(person.role) === PARTNER && !isOutsideLabel(label)) return null;
  return label;
}
// readerKeys(person) -> Set: the keys a roleVisibility list or a capsule name admits this person by (the rule above): role,
// typed label (readLabelOf), ACCESS hats. Never people.hats (the person's own choice).
export function readerKeys(person) {
  const keys = new Set();
  if (!person || typeof person !== "object") return keys;
  const role = String(person.role || "");
  if (role) keys.add(role);
  const label = readLabelOf(person);
  if (label) keys.add(label);
  for (const h of hatsOf(person.access_hats)) keys.add(h);
  return keys;
}
// briefKeysOf(person) -> the capsules to try, in order, when a person asks for "my brief" with no name: their typed label,
// then their ACCESS hats (the admin's), then their role. Never their own hats: a brief they may not read is no default. The
// MCP capsule tool reads the one it finds under its roleVisibility (mayReadDoc).
export function briefKeysOf(person) {
  if (!person) return [];
  const out = [];
  const add = (k) => { const s = String(k || "").trim(); if (s && s !== ADMIN && !out.includes(s)) out.push(s); };
  add(readLabelOf(person));
  for (const h of hatsOf(person.access_hats)) add(h);
  add(person.role);
  return out;
}

// ---- the avatar: initials on a presence tone (the brand's presence colours are for avatars, cursors and pins only) ----
// people.avatar holds "<tone>" or "<tone>:<initials>" (a person's own choice on /profile); null reads as their name's
// initials on a tone chosen from their id, so a long list is calm and still scannable. No photo in this slice (no uploads).
export const AVATAR_TONES = ["stone", "gold", "sky", "violet"];
export function initialsOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const two = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return two.toUpperCase();
}
const toneOfId = (id) => { let h = 0; for (const c of String(id || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVATAR_TONES[h % AVATAR_TONES.length]; };
// avatarOf(person) -> { initials, tone }
export function avatarOf(person) {
  const p = person || {};
  const [t, ini] = String(p.avatar || "").split(":");
  const tone = AVATAR_TONES.includes(t) ? t : toneOfId(p.id || p.name);
  const own = /^[A-Za-z0-9]{1,3}$/.test(ini || "") ? ini.toUpperCase() : "";
  return { initials: own || initialsOf(p.name), tone };
}
// avatarValue(tone, initials) -> the stored people.avatar, or null when the input names nothing valid
export function avatarValue(tone, initials) {
  const t = AVATAR_TONES.includes(String(tone || "")) ? String(tone) : "";
  const ini = String(initials || "").trim();
  if (!t) return null;
  return /^[A-Za-z0-9]{1,3}$/.test(ini) ? `${t}:${ini.toUpperCase()}` : t;
}
