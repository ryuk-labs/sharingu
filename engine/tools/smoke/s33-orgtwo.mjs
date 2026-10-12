// tools/smoke/s33-orgtwo.mjs — sprint 6, 6.1 (the tables): the second org enters the smoke the moment the tables allow it
// (migrate-067: org holds many rows; migrate-068: a row of the nine org-wide tables written without its org is refused).
// Runs after every org-1 case; s34-scoped (6.2) runs after it, on the second org it leaves (s.org2).
//   · the six live projects' keys (sharingu, ryuklabs, siru, saruspay, bunny, demo), made by org 1's admin through the door,
//     are org 1's under their bare keys (projects.org = 1, projects.slug = the key) and read as they always did; a slug with
//     "--" (the form another org's key takes) is refused
//   · a second org is seeded (its row, its owner) in the local D1; its owner's create_project lands in org 2 under the key
//     o2--<slug>, and the rows its writes leave (a person it adds, a contribution and its events row) carry org 2
//   · a row written without its org is refused loudly (org_required), on each of the nine tables' triggers; with the org it lands
import { randomBytes } from "node:crypto";
import { smoke, expect, brief, s, http, mcp, control, ownerKey, sha, contribute, d1, d1rows as rows } from "./lib.mjs";

const LIVE_SIX = ["sharingu", "ryuklabs", "siru", "saruspay", "bunny", "demo"];
const NINE = ["people", "tokens", "invites", "events", "artifacts", "loops", "approval_audit", "login_attempts", "transmission"];
const T = () => new Date().toISOString();

smoke("orgtwo · the six live projects' keys are org 1's, bare, and read as before; a slug with -- is refused", async () => {
  for (const k of LIVE_SIX) await control({ action: "add-project", key: k, name: k[0].toUpperCase() + k.slice(1) });
  const got = rows(`SELECT key, org, slug FROM projects WHERE key IN (${LIVE_SIX.map((k) => `'${k}'`).join(",")}) ORDER BY key`);
  expect(got.length === 6 && got.every((r) => r.org === 1 && r.slug === r.key), () => `projects: ${brief(got)}`);
  const fixtures = rows("SELECT key, org, slug FROM projects WHERE key IN ('local', 'smoke')");
  expect(fixtures.length === 2 && fixtures.every((r) => r.org === 1 && r.slug === r.key), () => `the smoke's own projects: ${brief(fixtures)}`);
  const read = await http("GET", "/read?project=siru&kind=goal", { key: ownerKey });
  expect(read.status === 200 && read.json.project === "siru", () => `GET /read?project=siru: ${read.status} ${brief(read.json)}`);
  const bad = await mcp(ownerKey, "create_project", { key: "o2--web", name: "Not org 2's" });
  expect(bad.out && bad.out.error === "bad_project" && !rows("SELECT key FROM projects WHERE key = 'o2--web'").length, () => `a slug with --: ${brief(bad.out)}`);
  return `${got.length} live keys org 1 with slug = key (and local, smoke); siru reads by its bare key; o2--web refused to org 1's admin`;
});

smoke("orgtwo · a second org: its row and owner; its owner's project is o2--<slug>, and its writes carry org 2", async () => {
  const at = T();
  rows(`INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (2, 'Second org', '${at}', '${at}', 'local')`);
  s.org2 = { key: randomBytes(20).toString("hex"), id: "org2-owner-0001" };
  rows(`INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('${s.org2.id}', 'Second Owner', 'owner@org2.local', 'owner', '${sha(s.org2.key)}', 1, '${at}', 2)`);
  const orgs = rows("SELECT id, name FROM org ORDER BY id");
  expect(orgs.length === 2 && orgs[0].id === 1 && orgs[1].name === "Second org", () => `org rows: ${brief(orgs)}`);
  const who = await mcp(s.org2.key, "whoami");
  expect(!who.isError && who.out && who.out.id === s.org2.id, () => `org 2's owner signs in: ${brief(who.out)}`);
  const cp = await mcp(s.org2.key, "create_project", { key: "shop", name: "Shop" });
  expect(!cp.isError && cp.out.project && cp.out.project.key === "o2--shop", () => `create_project as org 2: ${brief(cp.out)}`);
  const pr = rows("SELECT key, org, slug FROM projects WHERE key = 'o2--shop'");
  expect(pr.length === 1 && pr[0].org === 2 && pr[0].slug === "shop", () => `o2--shop: ${brief(pr)}`);
  const add = await http("POST", "/control", { key: s.org2.key, form: { action: "add-person", name: "Org2 Member", email: "member@org2.local", projectKey: "o2--shop", seatsChosen: "1" } });
  const added = rows("SELECT org FROM people WHERE email = 'member@org2.local'");
  expect(add.status < 500 && added.length === 1 && added[0].org === 2, () => `add-person by org 2's admin (${add.status}): ${brief(added)}`);
  const c = await contribute(s.org2.key, { project: "o2--shop", lane: "leader", kind: "note", what: "orgtwo: the first filing of org 2", why: "its rows carry org 2" });
  expect(!c.isError && c.out.id, () => `org 2 files: ${brief(c.out)}`);
  const tx = rows(`SELECT org, project FROM transmission WHERE id = '${c.out.id}'`);
  const ev = rows(`SELECT org FROM events WHERE person_id = '${s.org2.id}'`);
  expect(tx.length === 1 && tx[0].org === 2 && tx[0].project === "o2--shop" && ev.length >= 1 && ev.every((e) => e.org === 2), () => `org 2's ledger row ${brief(tx)}, events ${brief(ev)}`);
  const one = rows("SELECT COUNT(*) AS n FROM transmission WHERE org IS NOT 1 AND submitter <> 'org2-owner-0001'");
  expect(one[0].n === 0, () => `org 1's rows stay org 1's: ${brief(one)}`);
  return `org 2 seeded; its owner made o2--shop (org 2, slug shop), added a person into org 2, filed ${c.out.id} (transmission and events org 2)`;
});

smoke("orgtwo · a row written without its org is refused loudly, on each of the nine tables; with its org it lands", async () => {
  const trig = rows("SELECT tbl_name FROM sqlite_master WHERE type = 'trigger' AND name LIKE '%\\_org\\_required' ESCAPE '\\' ORDER BY tbl_name").map((r) => r.tbl_name);
  expect(trig.length === 9 && NINE.every((t) => trig.includes(t)), () => `the refusing triggers: ${trig.join(", ")}`);
  const at = T(), later = new Date(Date.now() + 864e5).toISOString();
  const anyTx = rows(`SELECT id FROM transmission WHERE submitter = '${s.org2.id}' LIMIT 1`)[0].id;
  // one insert per table, every NOT NULL column filled and every reference real, so the ONLY thing wrong is the missing org
  // (the sprint-6 review, finding 9: the title says nine, so the case inserts into all nine)
  const tries = [
    ["people", "orgtwo-p-1", `INSERT INTO people (id, name, role, key_hash, created_at) VALUES ('orgtwo-p-1', 'No Org', 'member', 'orgtwo-${randomBytes(8).toString("hex")}', '${at}')`],
    ["tokens", "orgtwo-t-1", `INSERT INTO tokens (token_hash, person_id, device, created_at, expires_at) VALUES ('orgtwo-t-1', '${s.org2.id}', 'smoke', '${at}', '${later}')`],
    ["invites", "orgtwo-i-1", `INSERT INTO invites (id, code_hash, project_key, role, created_by, created_at, expires_at) VALUES ('orgtwo-i-1', 'orgtwo-${randomBytes(8).toString("hex")}', 'o2--shop', 'member', '${s.org2.id}', '${at}', '${later}')`],
    ["events", "orgtwo-ev-1", `INSERT INTO events (id, person_id, kind, created_at) VALUES ('orgtwo-ev-1', '${s.org2.id}', 'fragment', '${at}')`],
    ["artifacts", "orgtwo-a-1", `INSERT INTO artifacts (id, person_id, kind, title, r2_key, sha256, bytes, group_tag, created_at) VALUES ('orgtwo-a-1', '${s.org2.id}', 'other', 'no org', 'orgtwo/x', '${"0".repeat(64)}', 1, 'smoke', '${at}')`],
    ["loops", "orgtwo-lo-1", `INSERT INTO loops (id, person_id, title, opened_at) VALUES ('orgtwo-lo-1', '${s.org2.id}', 'no org', '${at}')`],
    ["approval_audit", "orgtwo-aa-1", `INSERT INTO approval_audit (id, transmission_id, verdict, decided_by, created_at) VALUES ('orgtwo-aa-1', '${anyTx}', 'approve', '${s.org2.id}', '${at}')`],
    ["login_attempts", "orgtwo-l-1", `INSERT INTO login_attempts (id, email, ok, at) VALUES ('orgtwo-l-1', 'x@org2.local', 0, '${at}')`],
    ["transmission", "T-orgtwo-1", `INSERT INTO transmission (id, submitter, lane, route, status, created_at) VALUES ('T-orgtwo-1', '${s.org2.id}', 'leader', 'auto', 'routed', '${at}')`],
  ];
  expect(tries.length === 9 && NINE.every((t) => tries.some(([x]) => x === t)), "the case does not try each of the nine tables");
  for (const [what, , q] of tries) {
    const r = d1(q);
    expect(r.error && /org_required/.test(r.error), () => `${what} without an org: ${r.error ? String(r.error).slice(0, 200) : "LANDED"}`);
  }
  const keyCol = { tokens: "token_hash" };
  const gone = rows("SELECT " + tries.map(([t, id]) => `(SELECT COUNT(*) FROM ${t} WHERE ${keyCol[t] || "id"} = '${id}')`).join(" + ") + " AS n");
  expect(gone[0].n === 0, () => `a refused row landed: ${brief(gone)}`);
  rows(`INSERT INTO events (id, person_id, kind, created_at, org) VALUES ('orgtwo-ev-2', '${s.org2.id}', 'fragment', '${at}', 2)`);
  expect(rows("SELECT org FROM events WHERE id = 'orgtwo-ev-2'")[0].org === 2, "the same row with its org did not land");
  return `9 refusing triggers; a row without its org refused (org_required) on each of the nine (${tries.map(([t]) => t).join(", ")}), nothing landed; with org 2 it lands`;
});
