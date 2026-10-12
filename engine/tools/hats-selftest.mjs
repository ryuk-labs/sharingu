// tools/hats-selftest.mjs — roles, simply, and hats (sprint 2: migrate-044, the owner's MCQ of 2026-09-30 evening; migrate-045,
// the owner's MCQ of 2026-10-01: "the admin sets the hats that unlock briefings and cards; a person's self-chosen hats only
// shape what Home shows them first"). Offline: src/hats.js, both migrations applied to a REAL SQLite people table, the
// visibility rule every door applies before and after, over every list an org could hold, and the admin's door through the
// REAL default export of src/index.js over the Home fixture's SQLite D1.
//   1 · hats.js: hatsOf keeps the seven in HATS' order; readerKeys is role + typed label + ACCESS hats (never the
//       person's own hats; a Partner's access hats count; never 'owner' but for the admin's role); fromTypedRole; the
//       avatar; the brief keys (label, access hats, role); accessJson stores '[]' for none, never null
//   2 · migrate-044's hats CASE and migrate-045's access-hats CASE are src/hats.js LABEL_HATS, label for label
//   3 · the migrations on a pre-044 people table: 044 as ruled; 045 gives every row its typed role's hats as access hats
//       (never null); a second run of either backfill changes nothing, and an access list the admin cleared stays cleared
//   4 · THE INVARIANTS, for every migrated person:
//       a · pre-044 typed role -> after 044 + 045: admitted exactly where their typed role was, over every list of typed
//           labels (rolesAdmit, mayRead, the served capsules, the default brief, a trace mandate)
//       b · after 044 under ITS rule (role + label + own hats unless a Partner) -> after 045 under today's: admitted exactly
//           where they were, over every list of typed labels, hats, member and partner, in JS and in the card SQL
//       c · after 045, every person picking ALL SIX hats for themselves changes nothing they read (JS and SQL)
//   5 · both ways: a list that names a hat opens to the people the admin gave it (a Partner too), never to a person who only
//       picked it; a served capsule (R2, no list) never opens to any hat; the instruments: 045 without its backfill breaks
//       4b, and the old rule (own hats admit) breaks 4c
//   6 · the door (POST /control set-access-hats, the real handler): a seat, the admin's read-only credential and a
//       cross-origin cookie are refused (403), and the admin's key in ?k= signs no one in (G2 M2), each with D1 unchanged; a hat outside the seven and an unknown person are
//       "Nothing done"; the admin grants, the person then reads the hat's capsule (and a Partner likewise), the admin clears,
//       they no longer do; a hat the person picks on /profile never opens it; the change is an events row; Invite sets
//       access hats at once; GET /control/people and whoami carry them (the admin's read and your own row only)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { createHash } from "node:crypto";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));
const H = await import(pathToFileURL(join(ENGINE, "src", "hats.js")).href);
const { rolesAdmit } = await import(pathToFileURL(join(ENGINE, "src", "knowledge", "schema.js")).href);
const { mayRead, mandateFloorFor } = await import(pathToFileURL(join(ENGINE, "src", "core.js")).href);
const { CARD_KINDS_SQL, filterRole } = await import(pathToFileURL(join(ENGINE, "src", "knowledge", "cards.js")).href);
const { homeFixtureEnv, orgAddress } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "home-d1.mjs")).href);
const { default: handler } = await import(pathToFileURL(join(ENGINE, "src", "index.js")).href);
const { HAT_LANES } = await import(pathToFileURL(join(ENGINE, "src", "extract.js")).href);
const { LANE_KEYS } = await import(pathToFileURL(join(ENGINE, "src", "lanes.js")).href);
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
const M044 = readFileSync(join(ENGINE, "migrate-044.sql"), "utf8");
const M045 = readFileSync(join(ENGINE, "migrate-045.sql"), "utf8");

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const J = (x) => JSON.stringify(x);
const sha = (s) => createHash("sha256").update(s).digest("hex");

// ---- 1 · hats.js ----
ok(J(H.HAT_KEYS) === '["management","engineering","organization","gtm","finance","partner","quality"]' && H.HATS.every((h) => h.label && h.line && h.detail),
  `the seven hats: the website's six in its order, then Quality (the owner's seventh, 2026-10-10), each with its label, one line and detail: ${H.HAT_KEYS.join(" · ")}`);
// the seventh hat: every hat names its brief's lanes (management: the top of the tree, null), each a real lane; quality leans on
// code (what a tester verifies) and ba (the lane every grade files in); no typed label maps to it (the migrations' CASE is unchanged)
ok(J(Object.keys(HAT_LANES).sort()) === J([...H.HAT_KEYS].sort()) && Object.values(HAT_LANES).every((l) => l === null || (l.length && l.every((x) => LANE_KEYS.includes(x))))
  && J(HAT_LANES.quality) === '["code","ba"]' && !Object.values(H.LABEL_HATS).some((h) => h.includes("quality")) && J(H.hatsOf('["quality","finance"]')) === '["finance","quality"]',
  `every hat names its brief's lanes, each a real lane (quality: ${J(HAT_LANES.quality)}); no typed label maps to Quality; hatsOf keeps it, in order`);
ok(J(H.hatsOf('["finance","wizard","engineering","finance"]')) === '["engineering","finance"]' && J(H.hatsOf("junk")) === "[]" && J(H.hatsOf(null)) === "[]" && H.hatsJson([]) === null
  && H.accessJson([]) === "[]" && H.accessJson(["finance", "wizard", "management"]) === '["management","finance"]' && H.accessJson(null) === "[]",
  "hatsOf keeps the seven only, in order, once each; junk and null are no hat; own hats store none as null, access hats as '[]' (never null)");
const keys = (p) => [...H.readerKeys(p)].sort().join(",");
ok(keys({ role: "member", hats: '["finance"]', role_label: "economics" }) === "economics,member"
  && keys({ role: "member", hats: '["finance"]', access_hats: '["gtm"]', role_label: "economics" }) === "economics,gtm,member"
  && keys({ role: "partner", hats: '["finance","partner"]', role_label: "external-ai" }) === "external-ai,partner"
  && keys({ role: "partner", hats: '["gtm"]', access_hats: '["finance"]', role_label: "external-ai" }) === "external-ai,finance,partner"
  && keys({ role: "member", role_label: "owner", hats: '["owner"]', access_hats: '["owner"]' }) === "member" && keys({ role: "owner" }) === "owner" && keys(null) === "",
  "readerKeys: role + typed label + ACCESS hats; a person's own hats never count (a member's or a Partner's); a Partner's access hats count; 'owner' never becomes a key but for the admin's own role");
// review fix 7 (sprint 2): a member's typed label kept on their row after a demotion to Partner unlocks nothing (readerKeys,
// briefKeysOf); an outside label (the one that makes a Partner) still counts; a member's label is unchanged
ok(keys({ role: "partner", role_label: "product", access_hats: "[]" }) === "partner" && keys({ role: "partner", role_label: "vendor" }) === "partner,vendor"
  && keys({ role: "member", role_label: "product" }) === "member,product" && keys({ role: "external-ai", role_label: "design" }) === "external-ai"
  && J(H.briefKeysOf({ role: "partner", role_label: "product" })) === '["partner"]' && H.readLabelOf({ role: "partner", role_label: "product" }) === null,
  "a Partner's typed label counts only when it is an outside label (external-*, vendor): a demoted member's old label opens no doc or card; a member's still does");
const T = (l) => J(H.fromTypedRole(l));
ok(T("internal-eng") === '{"role":"member","label":"internal-eng","hats":["engineering"]}' && T("external-ai") === '{"role":"partner","label":"external-ai","hats":["partner"]}'
  && T("vendor") === '{"role":"partner","label":"vendor","hats":["partner"]}' && T("member") === '{"role":"member","label":null,"hats":[]}' && T("seated") === '{"role":"member","label":null,"hats":[]}'
  && T("partner") === '{"role":"partner","label":null,"hats":["partner"]}' && T("custom-desk") === '{"role":"member","label":"custom-desk","hats":[]}' && T("") === '{"role":"member","label":null,"hats":[]}',
  "fromTypedRole: a typed label keeps its label, its role class and its hats; member, seated and partner are roles; an unknown label is a member with no hat");
ok(H.avatarValue("sky", "rk") === "sky:RK" && H.avatarValue("sky", "") === "sky" && H.avatarValue("neon", "RK") === null && J(H.avatarOf({ id: "x", name: "Rae Kim", avatar: "violet:RQ" })) === '{"initials":"RQ","tone":"violet"}'
  && H.avatarOf({ id: "x", name: "Rae Kim" }).initials === "RK" && H.AVATAR_TONES.includes(H.avatarOf({ id: "x", name: "Rae Kim" }).tone),
  "the avatar: a tone and up to three initials stored as tone:INI; a bad tone stores nothing; no choice reads as the name's initials on a tone from the id");
ok(J(H.briefKeysOf({ role: "member", role_label: "economics", hats: '["finance","management"]', access_hats: '["finance","management"]' })) === '["economics","management","finance","member"]'
  && J(H.briefKeysOf({ role: "member", role_label: "economics", hats: '["gtm"]' })) === '["economics","member"]'
  && J(H.briefKeysOf({ role: "owner", access_hats: '["finance"]' })) === '["finance"]'
  && J(H.briefKeysOf({ role: "partner", role_label: "external-ai", hats: '["gtm"]', access_hats: '["finance"]' })) === '["external-ai","finance","partner"]',
  "briefKeysOf: the label first, then the ACCESS hats in the website's order (a Partner's too), then the role; never the person's own hats; never 'owner'");
ok(H.roleClassOf("owner") === "admin" && H.roleClassOf("external-logistics") === "partner" && H.roleClassOf("leader") === "member" && H.roleWordOf("partner") === "Partner",
  "roleClassOf: owner is Admin, an outside label is Partner, any other label is Member");

// ---- 2 · the migrations' CASEs are LABEL_HATS ----
const caseOf = (sql) => { const m = {}; for (const x of sql.matchAll(/WHEN '([a-z-]+)' THEN '(\[[^']*\])'/g)) m[x[1]] = JSON.parse(x[2]); return m; };
const codeMap = { ...H.LABEL_HATS, partner: ["partner"] };
const sameMap = (m) => J(Object.keys(m).sort()) === J(Object.keys(codeMap).sort()) && Object.keys(codeMap).every((k) => J(m[k]) === J(codeMap[k]));
ok(sameMap(caseOf(M044)), `migrate-044's hats CASE equals src/hats.js LABEL_HATS label for label (${Object.keys(caseOf(M044)).length} labels)`);
ok(sameMap(caseOf(M045)) && /ELSE '\[\]' END\s+WHERE access_hats IS NULL;/.test(M045) && /CASE lower\(COALESCE\(role_label, role\)\)/.test(M045),
  `migrate-045's access-hats CASE equals src/hats.js LABEL_HATS label for label (${Object.keys(caseOf(M045)).length} labels), over the typed label migrate-044 kept (else the role), '[]' for any other, only where access_hats IS NULL`);

// ---- 3 · the migrations on a pre-044 people table ----
const LABELS = ["leader", "economics", "product", "design", "internal-eng", "ai-platform", "logistics", "gtm", "external-ai", "external-logistics", "vendor", "custom-desk"];
const pre044 = () => {
  const d = new DatabaseSync(":memory:");
  // boot.sql's people as it stood before migrate-044: the four profile columns (044's three, 045's one) taken out, and
  // migrate-070's account_id (a later column, whose key names a table this database does not hold)
  const people = /CREATE TABLE IF NOT EXISTS people \([\s\S]*?\);\n/.exec(BOOT)[0].replace(", hats TEXT, avatar TEXT, role_label TEXT, access_hats TEXT", "").replace(", account_id TEXT REFERENCES accounts(id)", "");
  if (/\b(hats|avatar|role_label|access_hats)\s+TEXT/.test(people)) throw new Error("pre044: boot.sql's people still names a profile column after the strip: " + people);
  d.exec(people);
  const P = d.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,1,'2026-09-01',1)");
  P.run("p-owner", "Owner", "o@x.test", "owner", "h-owner");
  LABELS.forEach((l, i) => P.run(`p-${l}`, `P ${l}`, `${l}@x.test`, l, `h-${i}`));
  P.run("p-member", "Already Member", "m@x.test", "member", "h-m");
  P.run("p-partner", "Already Partner", "pa@x.test", "partner", "h-pa");
  P.run("p-Owner", "Capital Owner", "co@x.test", "Owner", "h-co");
  return d;
};
const migrated = pre044();
const before = migrated.prepare("SELECT id, role FROM people ORDER BY id").all();
migrated.exec(M044);
const after44 = migrated.prepare("SELECT id, role, hats, role_label FROM people ORDER BY id").all();
const byId44 = new Map(after44.map((r) => [r.id, r]));
const bad = before.filter((b) => {
  const a = byId44.get(b.id);
  if (b.role === "owner") return a.role !== "owner" || a.role_label !== null || J(H.hatsOf(a.hats)) !== '["management"]';
  if (b.role === "Owner") return a.role !== "Owner" || a.role_label !== null;
  if (b.role === "member") return a.role !== "member" || a.role_label !== null;
  if (b.role === "partner") return a.role !== "partner" || a.role_label !== null || J(H.hatsOf(a.hats)) !== '["partner"]';
  const want = H.fromTypedRole(b.role);
  return a.role !== want.role || a.role_label !== b.role || J(H.hatsOf(a.hats)) !== J(want.hats);
});
ok(!bad.length && after44.length === before.length, `migrate-044 on a pre-044 people table: every typed label -> its role class, kept as role_label, wearing its hats; the admin keeps 'owner' (hats Management); 'member', 'partner' and a capitalised 'Owner' as ruled${bad.length ? ` — wrong: ${J(bad)}` : ""}`);
migrated.exec(M045);
const after45 = migrated.prepare("SELECT id, role, hats, role_label, access_hats FROM people ORDER BY id").all();
const byId = new Map(after45.map((r) => [r.id, r]));
const bad45 = after45.filter((a) => a.access_hats == null || J(H.hatsOf(a.access_hats)) !== J(H.hatsOf(byId44.get(a.id).hats)) || a.hats !== byId44.get(a.id).hats || a.role !== byId44.get(a.id).role);
ok(!bad45.length, `migrate-045 after migrate-044: every person's access hats are exactly the hats migrate-044 gave their typed role (never null: '[]' for none), their own hats and role untouched (${after45.map((a) => `${a.id.slice(2)} ${H.hatsOf(a.access_hats).join("+") || "-"}`).join(", ")})${bad45.length ? ` — wrong: ${J(bad45)}` : ""}`);
const snap = J(migrated.prepare("SELECT * FROM people ORDER BY id").all());
migrated.exec(M044.replace(/^ALTER TABLE[^\n]*\n/gm, ""));   // the backfills again (the columns exist now)
migrated.exec(M045.replace(/^ALTER TABLE[^\n]*\n/gm, ""));
ok(J(migrated.prepare("SELECT * FROM people ORDER BY id").all()) === snap, "both backfills run a second time change nothing");
{
  // the admin clears a person's access hats ('[]', what the door writes); a replay of 045 never re-grants them
  const d = pre044(); d.exec(M044); d.exec(M045);
  d.prepare("UPDATE people SET access_hats = ? WHERE id = 'p-economics'").run(H.accessJson([]));
  d.exec(M045.replace(/^ALTER TABLE[^\n]*\n/gm, ""));
  ok(d.prepare("SELECT access_hats FROM people WHERE id = 'p-economics'").get().access_hats === "[]", "an access list the admin cleared ('[]') stays cleared through a replay of migrate-045's backfill");
}

// ---- 4 · THE INVARIANTS ----
const UNIVERSE = ["owner", ...LABELS];
const listsOver = (u) => [null, [], ...u.map((x) => [x]), ...u.flatMap((a, i) => u.slice(i + 1).map((b) => [a, b])), u];
const lists = listsOver(UNIVERSE);
const HAT_ONLY = H.HAT_KEYS.filter((h) => !UNIVERSE.includes(h));
const WIDE = [...UNIVERSE, ...HAT_ONLY, "member"];   // every typed label, every hat, member and partner (a hat key too)
const wideLists = listsOver(WIDE);
const personOf = (a) => ({ id: a.id, role: a.role, hats: a.hats, role_label: a.role_label, access_hats: a.access_hats });
// 4a · pre-044 typed role -> after both migrations, over the typed labels
function invariant(rows) {
  const out = [];
  for (const b of before) {
    const a = rows.get(b.id);
    const oldP = { id: b.id, role: b.role }, newP = personOf(a);
    for (const l of lists) if (rolesAdmit(b.role, l) !== rolesAdmit(newP, l)) out.push(`${b.id} ${J(l)}: before ${rolesAdmit(b.role, l)}, after ${rolesAdmit(newP, l)}`);
    for (const c of UNIVERSE) if (mayRead(oldP, c) !== mayRead(newP, c)) out.push(`${b.id} capsule ${c}: before ${mayRead(oldP, c)}, after ${mayRead(newP, c)}`);
    if (!["owner", "Owner", "member", "partner"].includes(b.role) && H.briefKeysOf(newP)[0] !== b.role) out.push(`${b.id}: the default brief is ${H.briefKeysOf(newP)[0]}, their role named ${b.role}`);
    for (const r of UNIVERSE) { const mandate = { traceMandate: { floor: "traces", roles: [r] } }; if (mandateFloorFor(b.role, mandate) !== mandateFloorFor(newP, mandate)) out.push(`${b.id} mandate on ${r}: before ${mandateFloorFor(b.role, mandate)}, after ${mandateFloorFor(newP, mandate)}`); }
  }
  return out;
}
const inv = invariant(byId);
ok(!inv.length, `4a · after migrate-044 AND migrate-045, the visibility rule admits every migrated person exactly where it admitted their typed role before: ${before.length} people × ${lists.length} lists (rolesAdmit), ${UNIVERSE.length} capsules (mayRead), the served capsules, the default brief, a trace mandate on each label${inv.length ? ` — ${inv.slice(0, 4).join(" · ")}` : ""}`);
// 4b · the migrate-044 rule (frozen here: role + label + their OWN hats unless a Partner) on the 044 rows, today's rule on the
// 045 rows: the same answer over every list of typed labels, hats, member and partner
const keys044 = (p) => {
  const k = new Set(); const role = String(p.role || ""); if (role) k.add(role);
  const label = String(p.role_label || "").trim(); if (label && label !== "owner") k.add(label);
  if (H.roleClassOf(role) !== "partner") for (const h of H.hatsOf(p.hats)) k.add(h);
  return k;
};
const admit044 = (p, l) => p.role === "owner" || !Array.isArray(l) || !l.length || l.some((x) => keys044(p).has(x));
function invariant45(rows44, rows45, rule = (p, l) => rolesAdmit(p, l)) {
  const out = [];
  for (const [id, a44] of rows44) {
    const a45 = rows45.get(id), p45 = personOf(a45);
    for (const l of wideLists) if (admit044(a44, l) !== rule(p45, l)) out.push(`${id} ${J(l)}: 044 ${admit044(a44, l)}, 045 ${rule(p45, l)}`);
    for (const c of WIDE) if ((a44.role === "owner" || keys044(a44).has(c)) !== mayRead(p45, c)) out.push(`${id} capsule ${c}: 044 ${a44.role === "owner" || keys044(a44).has(c)}, 045 ${mayRead(p45, c)}`);
  }
  return out;
}
const inv45 = invariant45(byId44, byId);
ok(!inv45.length, `4b · migrate-045 keeps what every migrated person read under migrate-044's rule: ${byId44.size} people × ${wideLists.length} lists over typed labels, hats, member and partner (rolesAdmit) and ${WIDE.length} capsules (mayRead)${inv45.length ? ` — ${inv45.slice(0, 4).join(" · ")}` : ""}`);
// the SQL twin (knowledge/cards.js): a card kind per list, on a boot.sql database; the kinds each person's filter admits
const kindsDb = (ls) => {
  const d = new DatabaseSync(":memory:");
  d.exec(BOOT);
  d.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01'); INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('p-owner','Owner','o@x.test','owner','h-o',1,'2026-09-01',1)");
  const K = d.prepare("INSERT INTO k_card_kinds (project,key,label,role_visibility,created_by,created_at,updated_by,updated_at) VALUES ('alpha',?,?,?,'p-owner','2026-09-01','p-owner','2026-09-01')");
  ls.forEach((l, i) => K.run(`k${i}`, `kind ${i}`, l == null ? null : J(l)));
  return (role) => d.prepare(CARD_KINDS_SQL(role != null)).all(...["alpha", ...(role != null ? [role] : [])]).map((r) => r.key).sort().join(",");
};
{
  const kindsOf = kindsDb(lists);
  const sqlBad = [];
  for (const b of before) {
    const a = byId.get(b.id);
    const oldF = b.role === "owner" ? null : String(b.role), newF = filterRole(personOf(a));
    // the old statement bound the bare role; the new one binds the reader's keys as a JSON list: both through today's SQL
    const oldKinds = oldF == null ? kindsOf(null) : kindsOf(J([oldF])), newKinds = kindsOf(newF);
    if (oldKinds !== newKinds) sqlBad.push(`${b.id}: before [${oldKinds}] after [${newKinds}]`);
  }
  const ownerAll = kindsOf(null).split(",").length === lists.length;
  ok(!sqlBad.length && ownerAll, `4a · the SQL twin (cards.js, the card kinds a reader sees) agrees, pre-044 typed role vs after both migrations, for every migrated person over ${lists.length} kinds; the owner sees all${sqlBad.length ? ` — ${sqlBad.slice(0, 3).join(" · ")}` : ""}`);
}
const wideKinds = kindsDb(wideLists);
const sqlOf = (filter) => (filter == null ? wideKinds(null) : wideKinds(filter));
{
  const sqlBad = [];
  for (const [id, a44] of byId44) {
    const oldF = a44.role === "owner" ? null : J([...keys044(a44)]), newF = filterRole(personOf(byId.get(id)));
    if (sqlOf(oldF) !== sqlOf(newF)) sqlBad.push(`${id}: 044 [${sqlOf(oldF)}] 045 [${sqlOf(newF)}]`);
  }
  ok(!sqlBad.length, `4b · the SQL twin agrees, migrate-044's rule vs today's after migrate-045, for every migrated person over ${wideLists.length} kinds of typed labels, hats, member and partner${sqlBad.length ? ` — ${sqlBad.slice(0, 3).join(" · ")}` : ""}`);
}
// 4c · after 045, every person picks ALL SIX hats for themselves: nothing they read changes (JS and SQL)
const allSeven = (rows) => new Map([...rows].map(([id, a]) => [id, { ...a, hats: J(H.HAT_KEYS) }]));
function selfPick(rows, picked, admit = (p, l) => rolesAdmit(p, l), filter = filterRole) {
  const out = [];
  for (const [id, a] of rows) {
    const p0 = personOf(a), p1 = personOf(picked.get(id));
    for (const l of wideLists) if (admit(p0, l) !== admit(p1, l)) out.push(`${id} ${J(l)}: ${admit(p0, l)} -> ${admit(p1, l)}`);
    if (sqlOf(filter(p0)) !== sqlOf(filter(p1))) out.push(`${id} SQL: [${sqlOf(filter(p0))}] -> [${sqlOf(filter(p1))}]`);
    for (const c of WIDE) if (mayRead(p0, c) !== mayRead(p1, c) && admit === rolesAdmit) out.push(`${id} capsule ${c}`);
  }
  return out;
}
const picked = allSeven(byId);
const self = selfPick(byId, picked);
ok(!self.length, `4c · after migrate-045, every migrated person picking all seven hats on /profile reads exactly what they read before: ${byId.size} people × ${wideLists.length} lists (rolesAdmit), the card SQL, ${WIDE.length} capsules (mayRead)${self.length ? ` — ${self.slice(0, 4).join(" · ")}` : ""}`);

// ---- 5 · both ways, and the instruments ----
const hatList = ["finance"];
const own = { role: "member", hats: '["finance"]' }, given = { role: "member", access_hats: '["finance"]' }, none = { role: "member" };
const pOwn = { role: "partner", hats: '["finance"]' }, pGiven = { role: "partner", access_hats: '["finance"]' };
ok(!rolesAdmit(own, hatList) && rolesAdmit(given, hatList) && !rolesAdmit(none, hatList) && !rolesAdmit(pOwn, hatList) && rolesAdmit(pGiven, hatList)
  && !mayRead(own, "finance") && mayRead(given, "finance") && !mayRead(pOwn, "finance") && mayRead(pGiven, "finance"),
  "a list or a k_docs capsule that names a HAT opens to a member or a Partner the admin gave it, never to one who only picked it, never to one without it");
ok(sqlOf(filterRole(own)) === sqlOf(filterRole(none)) && sqlOf(filterRole(given)) !== sqlOf(filterRole(none)) && sqlOf(filterRole(given)).split(",").length > sqlOf(filterRole(none)).split(",").length,
  "the card SQL likewise: a picked hat adds no kind; a given one adds the kinds whose list names it");
{
  // the instrument: migrate-045 without its backfill (the column, nothing in it) breaks 4b
  const d = pre044(); d.exec(M044);
  const rows44 = new Map(d.prepare("SELECT id, role, hats, role_label FROM people").all().map((r) => [r.id, r]));
  d.exec(M045.replace(/UPDATE people SET access_hats[\s\S]*?;\n/, ""));
  const rows = new Map(d.prepare("SELECT id, role, hats, role_label, access_hats FROM people").all().map((r) => [r.id, r]));
  const lost = invariant45(rows44, rows);
  ok(lost.length > 0, `the instrument: migrate-045 without its backfill breaks 4b (${lost.length} findings, e.g. ${lost[0]})`);
  // and the old rule (a person's own hats admit them) breaks 4c
  const old = selfPick(byId, picked, (p, l) => admit044(p, l), (p) => (p.role === "owner" ? null : J([...keys044(p)])));
  ok(old.length > 0, `the instrument: migrate-044's rule (own hats admit) breaks 4c (${old.length} findings, e.g. ${old[0]})`);
}

// ---- 6 · the door, through the real handler over the Home fixture ----
const ORIGIN = "https://org.test", COOKIE = "__Host-ar_session", RO_SUFFIX = ":agent-r-read-only:v1";
const KEY = { O: "hats-owner-key", C: "hats-seat-key", A: "hats-partner-key" }, TOK = { O: "hats-owner-session" };
const ctx = { waitUntil() {}, passThroughOnException() {} };
function world() {
  const fx = homeFixtureEnv();
  const q = fx.sqlite;
  const get0 = fx.env.BRAIN.get;   // a BRAIN object answers arrayBuffer() like R2's
  fx.env.BRAIN.get = async (k) => { const o = await get0(k); if (!o) return o; const t = await o.text();
    return { ...o, size: t.length, arrayBuffer: async () => new TextEncoder().encode(t).buffer, httpMetadata: { contentType: "application/json" } }; };
  q.prepare("UPDATE people SET key_hash = ? WHERE id = 'p-o'").run(sha(KEY.O));
  // the migrate-045 shape: Rae a member (she was internal-eng) with Engineering as her access hat and her own; Amir a partner
  q.prepare("UPDATE people SET key_hash = ?, role = 'member', role_label = 'internal-eng', hats = '[\"engineering\"]', access_hats = '[\"engineering\"]' WHERE id = 'p-c'").run(sha(KEY.C));
  q.prepare("UPDATE people SET key_hash = ?, role = 'partner', role_label = NULL, hats = '[\"partner\"]', access_hats = '[\"partner\"]' WHERE id = 'p-a'").run(sha(KEY.A));
  const at = new Date().toISOString(), exp = new Date(Date.now() + 86400000).toISOString();
  q.prepare("INSERT INTO tokens (token_hash, person_id, device, created_at, expires_at, revoked, org) VALUES (?,?,?,?,?,0,1)").run(sha(TOK.O), "p-o", "selftest", at, exp);
  // a briefing opened to the finance hat, in alpha (where Rae and Amir are seated)
  q.prepare("INSERT INTO k_docs (project,path,title,body_md,role_visibility,created_by,created_at,updated_by,updated_at) VALUES ('alpha','capsules/finance.md','Finance brief','# finance brief',?,'p-o',?,'p-o',?)").run(J(["finance"]), at, at);
  const snap = () => J(q.prepare("SELECT * FROM people ORDER BY id").all()) + "|" + q.prepare("SELECT COUNT(*) AS n FROM events").get().n;
  const accessOf = (id) => (q.prepare("SELECT access_hats FROM people WHERE id = ?").get(id) || {}).access_hats;
  return { env: fx.env, q, snap, accessOf };
}
async function call(w, path, { bearer = null, cookie = null, site = "same-origin", qk = null, method = "GET", form = null, body = null, accept = "text/html" } = {}) {
  const headers = { accept };
  if (bearer) headers.authorization = "Bearer " + bearer;
  if (cookie) { headers.cookie = `${COOKIE}=${cookie}`; if (site) headers["sec-fetch-site"] = site; if (site === "cross-site") headers.origin = "https://evil.example"; }
  let b;
  if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; b = new URLSearchParams(form).toString(); }
  else if (body) { headers["content-type"] = "application/json"; b = J(body); }
  // sprint 7, 7.4: a browser's session signs in only under its org's address (/<org>/…); a bearer answers at the root too
  const u = ORIGIN + (cookie ? orgAddress(w.sqlite || w.q) : "") + path + (qk ? (path.includes("?") ? "&" : "?") + "k=" + encodeURIComponent(qk) : "");
  const r = await handler.fetch(new Request(u, { method, headers, body: b, redirect: "manual" }), w.env, ctx);
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { j = null; }
  return { status: r.status, text, j };
}
const grant = (w, personId, hats, cred = { bearer: KEY.O }) => call(w, "/control", { ...cred, method: "POST", form: [["action", "set-access-hats"], ["personId", personId], ...hats.map((h) => ["accessHat", h])] });
const brief = (w, key) => call(w, "/brief?project=alpha&role=finance", { bearer: key, accept: "application/json" }).then((r) => r.status);   // D5: a role's brief is GET /brief?role=
const flashOf = (t) => ((/<div class="ct-flash-plain"[^>]*><p class="flash-value">([^<]*)</.exec(t || "") || [])[1] || "").replace(/&#39;/g, "'");
{
  const w = world();
  // a hat Rae picks for herself on /profile never opens the finance brief
  const b0 = await brief(w, KEY.C);
  const pick = await call(w, "/profile", { bearer: KEY.C, method: "POST", body: { action: "set-profile", hats: ["engineering", "finance"] } });
  const b1 = await brief(w, KEY.C);
  // D1b item 2: a role's brief the reader may not read answers 404 unknown_brief, as one that is not filed (never a 403 that says it exists)
  ok(b0 === 404 && pick.status === 200 && J(pick.j && pick.j.hats) === '["engineering","finance"]' && b1 === 404 && w.accessOf("p-c") === '["engineering"]',
    `a member picks Finance on /profile (${pick.status}, hats ${J(pick.j && pick.j.hats)}): GET /brief?role=finance ${b0} before and ${b1} after; her access hats stay ${w.accessOf("p-c")}`);
  // the refusals: D1 unchanged on each
  const roK = sha(sha(KEY.O) + RO_SUFFIX);
  const refusals = {};
  for (const [k, cred] of Object.entries({ seat: { bearer: KEY.C }, partner: { bearer: KEY.A }, readOnlyBearer: { bearer: roK }, readOnlyK: { qk: roK }, keyInUrl: { qk: KEY.O }, crossOrigin: { cookie: TOK.O, site: "cross-site" } })) {
    const s0 = w.snap();
    const r = await grant(w, "p-c", ["finance"], cred);
    refusals[k] = { status: r.status, same: w.snap() === s0 };
  }
  // G2 M2: a key in the address signs no one in (the sign-in: 302 for this browser-shaped POST), never a write
  ok(Object.entries(refusals).every(([k, r]) => (k === "readOnlyK" || k === "keyInUrl" ? [302, 401].includes(r.status) : r.status === 403) && r.same),
    `set-access-hats refused with D1 unchanged: ${Object.entries(refusals).map(([k, r]) => `${k} ${r.status}${r.same ? "" : " CHANGED"}`).join(" · ")}`);
  const s1 = w.snap();
  const badHat = await grant(w, "p-c", ["finance", "wizard"]);
  const nobody = await grant(w, "p-nobody", ["finance"]);
  const noPerson = await call(w, "/control", { bearer: KEY.O, method: "POST", form: { action: "set-access-hats", accessHat: "finance" } });
  ok(badHat.status === 200 && /Nothing done - wizard is not a hat/.test(flashOf(badHat.text)) && /Nothing done - that person is not known or not active/.test(flashOf(nobody.text))
    && /Nothing done - set-access-hats needs a person/.test(flashOf(noPerson.text)) && w.snap() === s1,
    `"Nothing done", D1 unchanged: a hat outside the seven ("${flashOf(badHat.text)}") · an unknown person · no person`);
  // the admin grants Finance: Rae reads the brief; the change is an events row (kind access)
  const ev0 = w.q.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'access'").get().n;
  const g = await grant(w, "p-c", ["finance", "engineering"]);
  const b2 = await brief(w, KEY.C);
  const ev = w.q.prepare("SELECT person_id, payload_json FROM events WHERE kind = 'access' ORDER BY rowid DESC LIMIT 1").get();
  ok(g.status === 200 && w.accessOf("p-c") === '["engineering","finance"]' && b2 === 200 && /Rae Kim's access hats: Engineering, Finance\./.test(flashOf(g.text))
    && w.q.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'access'").get().n === ev0 + 1 && ev.person_id === "p-o" && J(JSON.parse(ev.payload_json).accessHats) === '["engineering","finance"]',
    `the admin grants Engineering + Finance (${g.status}, "${flashOf(g.text)}"): stored ${w.accessOf("p-c")}, GET /brief?role=finance ${b2}, an events row kind access by the admin`);
  // the read: GET /control/people carries access on the admin's read and on your own row only; whoami carries accessHats
  const asAdmin = (await call(w, "/control/people", { bearer: KEY.O, accept: "application/json" })).j || {};
  const asRae = (await call(w, "/control/people", { bearer: KEY.C, accept: "application/json" })).j || {};
  const who = (await call(w, "/whoami", { bearer: KEY.C, accept: "application/json" })).j || {};
  const rowOf = (j, id) => (j.people || []).find((p) => p.id === id) || {};
  ok(J(rowOf(asAdmin, "p-c").access) === '["engineering","finance"]' && J(rowOf(asAdmin, "p-a").access) === '["partner"]' && rowOf(asAdmin, "p-c").can.access === true
    && J(rowOf(asRae, "p-c").access) === '["engineering","finance"]' && !("access" in rowOf(asRae, "p-a")) && rowOf(asRae, "p-c").can.access === false
    && J(who.accessHats) === '["engineering","finance"]' && J(who.hats) === '["engineering","finance"]',
    `GET /control/people: the admin reads everyone's access (Rae ${J(rowOf(asAdmin, "p-c").access)}, Amir ${J(rowOf(asAdmin, "p-a").access)}); Rae her own only; whoami accessHats ${J(who.accessHats)}`);
  // the page: the admin's Members row draws the access hats solid and the own picks outlined; the menu's checkboxes are checked
  const page = (await call(w, "/control", { bearer: KEY.O })).text;
  // sprint 3 L3: a member is one line (<li class="p-li" data-person=…>, the u-table gone): the row runs to the next member's line
  const row = (page.split('<li class="p-li" data-person="p-c"')[1] || "").split('<li class="p-li"')[0];
  ok(/data-hat="access"[^>]*>Engineering</.test(row) && /data-hat="access"[^>]*>Finance</.test(row) && /data-button="access-hats"[^>]*data-action="set-access-hats"/.test(row)
    && /name="accessHat" value="finance" checked/.test(row) && /name="accessHat" value="gtm">/.test(row) && /name="accessHat"/.test(page.slice(page.indexOf('data-button="invite"'))),
    "GET /control (the admin): Rae's row draws her access hats, the ⋯ menu's Access hats checks the ones she holds, Invite offers them");
  // the admin clears (no box ticked): Rae no longer reads it
  const c = await grant(w, "p-c", []);
  const b3 = await brief(w, KEY.C);
  ok(c.status === 200 && w.accessOf("p-c") === "[]" && b3 === 404 && /Rae Kim holds no access hat now/.test(flashOf(c.text)),
    `the admin clears them (no box ticked: "${flashOf(c.text)}"): stored ${w.accessOf("p-c")}, GET /brief?role=finance ${b3}`);
  // a Partner the admin gives Finance reads it too (the admin set it); a Partner who only picks it does not
  await call(w, "/profile", { bearer: KEY.A, method: "POST", body: { action: "set-profile", hats: ["partner", "finance"] } });
  const p0 = await brief(w, KEY.A);
  await grant(w, "p-a", ["partner", "finance"]);
  const p1 = await brief(w, KEY.A);
  ok(p0 === 404 && p1 === 200, `a Partner: picking Finance on /profile -> GET /brief?role=finance ${p0}; the admin giving it -> ${p1}`);
  // the profile shows the access hats read-only and says what the picker does
  const prof = (await call(w, "/profile", { bearer: KEY.A })).text;
  ok(/data-region="access-hats"/.test(prof) && /<li data-hat="finance"[^>]*>Finance<\/li>/.test(prof) && /they set what Home shows you first/.test(prof) && !/name="accessHat"/.test(prof),
    "GET /profile: the access hats the admin gave are listed read-only (no input), and the hat picker says it sets what Home shows first");
  // Invite sets access hats at once; a hat outside the seven creates nobody
  const n0 = w.q.prepare("SELECT COUNT(*) AS n FROM people").get().n;
  const inv1 = await call(w, "/control", { bearer: KEY.O, method: "POST", form: [["action", "add-person"], ["name", "Fin Hire"], ["email", "fin@northwind.test"], ["role", "member"], ["projectKey", "alpha"], ["accessHat", "finance"]] });
  const hire = w.q.prepare("SELECT role, hats, access_hats FROM people WHERE email = 'fin@northwind.test'").get() || {};
  const inv2 = await call(w, "/control", { bearer: KEY.O, method: "POST", form: [["action", "add-person"], ["name", "Bad Hat"], ["email", "bad@northwind.test"], ["role", "member"], ["accessHat", "wizard"]] });
  const inv3 = await call(w, "/control", { bearer: KEY.O, method: "POST", form: [["action", "add-person"], ["name", "Plain Hire"], ["email", "plain@northwind.test"], ["role", "partner"]] });
  const plain = w.q.prepare("SELECT role, access_hats FROM people WHERE email = 'plain@northwind.test'").get() || {};
  ok(inv1.status === 200 && hire.role === "member" && hire.access_hats === '["finance"]' && hire.hats === '["finance"]' && /access hats Finance/.test(inv1.text)
    && /Nothing done - wizard is not a hat/.test(flashOf(inv2.text)) && !w.q.prepare("SELECT 1 FROM people WHERE email = 'bad@northwind.test'").get()
    && plain.role === "partner" && plain.access_hats === '["partner"]' && w.q.prepare("SELECT COUNT(*) AS n FROM people").get().n === n0 + 2,
    `Invite: access hats named -> stored (${hire.access_hats}, their own hats start the same); a hat outside the seven -> nobody created; none named -> the role's (a partner: ${plain.access_hats})`);
}

console.log(`hats-selftest: ${checks - failed} pass · ${failed} fail`);
process.exit(failed ? 1 : 0);
