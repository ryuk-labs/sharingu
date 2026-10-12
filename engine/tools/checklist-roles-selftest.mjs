// tools/checklist-roles-selftest.mjs — the checklist and the door agree, for every item and every role (sprint 3, S3b: the
// walk found the start-here item offered to a member and refused owner_only). For the owner, a member and a Partner, and
// for EVERY checklist item (src/checklist.js CHECKLIST) and every area's start call (startOf):
//   · when the item is OFFERED to the role (src/holes.js offeredTo), its call is one the role may make: a knowledge write
//     whose items the write door's own plan (src/knowledge/schema.js planKnowledge, the role's rules) refuses for no role
//     reason (owner_only, forbidden), a grade, or a tool the role is not refused (rule_question is the owner's);
//   · when it is NOT offered, the door would indeed refuse the role (the two agree both ways): its knowledge write is refused
//     owner_only, its tool is the owner's, or its press is a Partner's refusal (equip);
//   · the public shape offers nobody an owner's item.
// And computeHoles over a REAL SQLite (boot.sql) with every area open: the member's and the Partner's `holes` and
// `notApplicable` carry only offered calls, the items they may not fill come back in `others` with who fills it, and the
// meter is the same number for all three. Exit 1 on any fail. Run in the gate.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { asOrg } from "./fixtures/org.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));
const imp = (p) => import(pathToFileURL(join(ENGINE, p)).href);
const C = await imp("src/checklist.js");
const Hs = await imp("src/holes.js");
const { planKnowledge } = await imp("src/knowledge/schema.js");
const { d1Of } = await imp("tools/fixtures/home-d1.mjs");
const { installReqMemo } = await imp("src/reqmemo.js");

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const ROLES = { owner: { id: "p-o", role: "owner" }, member: { id: "p-m", role: "member" }, partner: { id: "p-p", role: "partner" } };
const OWNER_TOOLS = new Set(["rule_question", "create_project", "publish_version", "restore_version", "decide_contribution"]);
const ROLE_ERR = new Set(["owner_only", "forbidden", "partner_refused"]);

// mayMake(roleKey, fill) -> null when the role may make the call, else the door's refusal (as the door would say it)
function refusalOf(roleKey, f) {
  const who = ROLES[roleKey];
  if (!f) return "no call";
  if (f.href === "/broadcast" && !f.fillPath) return roleKey === "partner" ? "partner_refused" : null;
  const fp = f.fillPath;
  if (!fp || !fp.tool) return "no call";
  if (OWNER_TOOLS.has(fp.tool)) return who.role === "owner" ? null : "owner_only";
  if (fp.tool !== "preview") return null;
  const ops = (fp.args.items || []).filter((x) => x && x.kind);
  if (!ops.length) return null;   // a grade: every seated reader grades
  const plan = planKnowledge(ops, {}, { isOwner: who.role === "owner", role: who.role, reader: who });
  const role = (plan.errors || []).find((e) => ROLE_ERR.has(e.error));
  return role ? role.error : null;
}
const reader = (k) => ROLES[k];
for (const k of Object.keys(ROLES)) {
  const bad = [], agree = [];
  for (const it of C.CHECKLIST) {
    const f = C.fillOf({ ...it, first: null, count: 1, have: 0, want: 1, goals: {} }, "proj");
    const offered = Hs.offeredTo(reader(k), it.id);
    const r = refusalOf(k, f);
    if (offered && r && r !== "no call") bad.push(`${it.id}: offered, refused ${r}`);
    if (!offered && !(r && r !== "no call")) agree.push(`${it.id}: not offered, yet the door lets ${k} make it`);
  }
  for (const a of C.AREA_ORDER.filter((x) => x !== "core")) {
    const s = C.startOf(a, "proj");
    const r = refusalOf(k, s);
    const offered = k === "owner" || !(a === "agents" && k === "partner");
    if (offered && r && r !== "no call") bad.push(`start ${a}: offered, refused ${r}`);
  }
  ok(!bad.length, `${k}: every item and area start the checklist offers is a call the door lets ${k} make (${C.CHECKLIST.length} items, 4 starts)${bad.length ? ` — ${bad.join("; ")}` : ""}`);
  ok(!agree.length, `${k}: every item NOT offered is one the door refuses ${k} (the two agree both ways)${agree.length ? ` — ${agree.join("; ")}` : ""}`);
}
ok(!Hs.offeredTo(ROLES.member, "start-here") && refusalOf("member", C.fillOf({ id: "start-here" }, "proj")) === "owner_only", "a member is not offered start-here, and the door refuses them it owner_only (the walk's red step)");
ok(Hs.offeredTo(ROLES.owner, "start-here") && refusalOf("owner", C.fillOf({ id: "start-here" }, "proj")) === null, "the owner is offered start-here and may file it");
ok(!Hs.offeredTo(ROLES.partner, "agents-equipped") && Hs.offeredTo(ROLES.member, "agents-equipped"), "equipping is offered to a member, never to a Partner");
ok(!Hs.holesShape(null).items.some((x) => Hs.OWNER_ONLY.has(x.id)), "the public shape offers nobody an owner's item");

// computeHoles over a real database, every area open, for the three roles
{
  const db = new DatabaseSync(":memory:"); db.exec(readFileSync(join(ENGINE, "boot.sql"), "utf8"));
  const at = "2026-09-01T00:00:00.000Z";
  db.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('proj','Proj',1,'${at}')`);
  for (const [k, r] of Object.entries(ROLES)) db.exec(`INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('${r.id}','${k}','${k}@x','${r.role}','h-${k}',1,'${at}',1)`);
  db.exec(`INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ('p-m','proj','member','${at}'),('p-p','proj','member','${at}')`);
  const by = `'p-o','${at}','p-o','${at}'`;
  db.exec(`INSERT INTO k_aim (project,aim,created_by,created_at,updated_by,updated_at) VALUES ('proj','An aim',${by})`);
  db.exec(`INSERT INTO k_questions (project,qid,question,status,who_owes,created_by,created_at,updated_by,updated_at) VALUES ('proj','Q-1','Which?','open','owner',${by})`);
  db.exec(`INSERT INTO k_nodes (project,id,type,name,data,created_by,created_at,updated_by,updated_at) VALUES ('proj','surface:web','surface','Web',NULL,${by}),('proj','screen:a','screen','A','{"surface":"web"}',${by}),('proj','door:x','door','GET /x',NULL,${by}),('proj','gap:1','gap','A gap',NULL,${by})`);
  db.exec(`UPDATE k_nodes SET status = 'open' WHERE id = 'gap:1'`);
  db.exec(`INSERT INTO k_checks (project,id,title,refs,created_by,created_at,updated_by,updated_at) VALUES ('proj','AC.a.01','A works','["screen:a"]',${by})`);
  db.exec(`INSERT INTO k_gtm (project,template,created_by,created_at,updated_by,updated_at) VALUES ('proj','{"stages":["lead"]}',${by})`);
  const H = {};
  for (const k of Object.keys(ROLES)) {
    const e = asOrg(installReqMemo({ DB: d1Of(db), BRAIN: { get: async () => null } }));   // signed in to org 1 (src/data.js)
    const { READ_SCOPE } = await imp("src/core.js");
    e[READ_SCOPE] = { project: "proj" };
    H[k] = await Hs.computeHoles(e, ROLES[k], { brand: { org: "X" } });
  }
  const calls = (h) => [...(h.items || []), ...(h.notApplicable || [])];
  for (const k of ["member", "partner"]) {
    const off = calls(H[k]).filter((x) => { const r = refusalOf(k, x); return r && r !== "no call"; });
    ok(H[k].project === "proj" && !off.length, `${k}'s holes: ${H[k].items.length} open items and ${H[k].notApplicable.length} area starts, every call one the door lets them make${off.length ? ` — refused: ${off.map((x) => x.id || x.area).join(", ")}` : ""}`);
    const others = (H[k].others || []).map((x) => `${x.id}:${x.by}`).sort();
    ok(others.includes("start-here:owner") && others.includes("rulings-owed:owner"), `${k}'s others name the owner's items, with who fills them (${others.join(", ")})`);
  }
  ok(!(H.owner.others || []).length && H.owner.items.some((x) => x.id === "start-here") && H.owner.items.some((x) => x.id === "rulings-owed"), "the owner is offered start-here and the rulings owed, and has no others");
  ok(H.owner.meter.words === H.member.meter.words && H.member.meter.words === H.partner.meter.words && !!H.owner.meter.words, `the meter is the project's, the same for all three (${H.owner.meter.words})`);
}

console.log(`${failed ? "✗" : "✓"} checklist roles selftest: ${checks - failed} of ${checks} checks passed`);
process.exit(failed ? 1 : 0);
