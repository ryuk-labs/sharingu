// tools/smoke/s47-limits.mjs — sprint 8, 8.2 (docs/plan/PLATFORM.md §4 sprint 8: "every write checks the plan: a warning at 80%, a
// clear refusal at 100% with its error code; reads are never refused; the per-minute burst limit per org"; migrate-076;
// src/plans.js) on the real local worker, after s46. A tiny org of its own (made by SQL, as s45's is: no door makes a plan smaller
// than free), on a plan row of its own (people 3, projects 2, items 4 a month, 1,000 calls a day, 300 a minute, 1,000 bytes), so
// no other org's numbers move. Every key in memory, never printed.
//   · projects: create_project warns at 2 of 2, then the one refusal plan_limit; a read still answers
//   · items: the month's 4th filing warns, the 5th is not filed (plan_limit in the receipt); search, whoami and GET /updates answer
//   · the burst: its writes past the minute's limit are 429 with Retry-After (MCP and REST); its reads answer; org 1's write lands
//   · the operator raises it (its plan row by SQL: 8.5's tool does this): the refused project and filing land
import { randomBytes } from "node:crypto";
import { smoke, expect, brief, http, mcp, contribute, d1rows, sha, ownerKey } from "./lib.mjs";

const TAG = randomBytes(3).toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const S = {};
const T = () => new Date().toISOString();
const note = (n) => ({ project: S.project, lane: "leader", kind: "note", what: `limits note ${n} ${TAG}`, why: "the plan's items" });
const preview = (key, project, n) => http("POST", "/mcp", { key, body: { jsonrpc: "2.0", id: 4700 + n, method: "tools/call", params: { name: "preview", arguments: { project, items: [{ contribution: { lane: "leader", kind: "note", what: `burst ${n} ${TAG}`, why: "the burst" } }] } } } });
const toolOut = (r) => { try { return JSON.parse(r.json.result.content[0].text); } catch { return null; } };
// the minute's last seconds pass first, so a burst's calls fall in one minute
const oneMinute = async () => { while (new Date().getUTCSeconds() >= 45) await new Promise((r) => setTimeout(r, 500)); };

smoke("limits · a tiny org's 2nd project warns (2 of 2), the 3rd is the one refusal plan_limit, and its reads still answer", async () => {
  const at = T(), n = d1rows("SELECT COALESCE(MAX(id), 1) + 1 AS n FROM org")[0].n;
  S.org = n; S.plan = `tiny-${TAG}`; S.key = randomBytes(20).toString("hex"); S.project = `o${n}--web`;
  d1rows(`INSERT INTO plan_limits (plan, people, projects, items_month, calls_day, burst_minute, storage_bytes, updated_at) VALUES (${q(S.plan)}, 3, 2, 4, 1000, 300, 1000, ${q(at)})`);
  d1rows(`INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (${n}, ${q(`Limits ${TAG}`)}, ${q(at)}, ${q(at)}, ${q(S.plan)})`);
  d1rows(`INSERT INTO projects (key, name, active, created_at) VALUES (${q(S.project)}, 'Web', 1, ${q(at)})`);
  d1rows(`INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('limits-owner-${n}', 'Limits Owner', ${q(`owner@limits${n}.local`)}, 'owner', ${q(sha(S.key))}, 1, ${q(at)}, ${n})`);
  d1rows(`INSERT INTO project_seats (person_id, project_key, role, created_at) VALUES ('limits-owner-${n}', ${q(S.project)}, 'owner', ${q(at)})`);
  const a = await mcp(S.key, "create_project", { key: "two", name: "Two" });
  const b = await mcp(S.key, "create_project", { key: "three", name: "Three" });
  const read = await mcp(S.key, "whoami", {});
  const active = d1rows(`SELECT COUNT(*) AS n FROM projects WHERE org = ${n} AND active = 1`)[0].n;
  expect(!a.isError && a.out.planWarning && a.out.planWarning.limit === "projects" && a.out.planWarning.used === 2 && a.out.planWarning.allowed === 2
    && b.isError && b.out.error === "plan_limit" && b.out.limit === "projects" && b.out.used === 2 && b.out.allowed === 2 && b.out.plan === S.plan && /operator/.test(b.out.note)
    && !/Northwind|ryuklabs|smoke-local/i.test(JSON.stringify(b.out)) && !read.isError && read.out.id === `limits-owner-${n}` && active === 2,
    () => `the 2nd: ${brief(a.out)}; the 3rd: ${brief(b.out)}; whoami ${brief(read.out)}; active ${active}`);
  return `org ${n} on ${S.plan}: the 2nd project warns (${a.out.planWarning.used}/${a.out.planWarning.allowed}); the 3rd ${b.out.error} {limit ${b.out.limit}, used ${b.out.used}, allowed ${b.out.allowed}}; whoami answers`;
});

smoke("limits · items: the month's 4th filing warns, the 5th is not filed (plan_limit); search, whoami and GET /updates still answer", async () => {
  expect(S.key, "the first limits case did not run");
  const got = [];
  for (let i = 1; i <= 5; i++) got.push(await contribute(S.key, note(i)));
  const fifth = (got[4].out && got[4].out.items && got[4].out.items[0] && got[4].out.items[0].filed) || {};
  const ledger = d1rows(`SELECT COUNT(*) AS n FROM transmission WHERE org = ${S.org}`)[0].n, tally = (d1rows(`SELECT items_month AS n FROM org_usage WHERE org = ${S.org}`)[0] || {}).n;
  const search = await mcp(S.key, "search", { project: S.project, q: "limits" }), who = await mcp(S.key, "whoami", {}), upd = await http("GET", "/updates", { key: S.key });
  expect(got.slice(0, 4).every((g) => !g.isError && g.out.id) && !got[2].out.planWarning && got[3].out.planWarning && got[3].out.planWarning.limit === "items_month" && got[3].out.planWarning.used === 4
    && fifth.status === "not_filed" && /plan's limit of 4 items filed this month/.test(fifth.note || "") && ledger === 4 && tally === 4
    && !search.isError && !who.isError && upd.status === 200,
    () => `filings ${got.map((g) => brief(g.out).slice(0, 80)).join(" | ")}; the 5th ${brief(fifth)}; ledger ${ledger}, tally ${tally}; search ${search.isError}, whoami ${who.isError}, /updates ${upd.status}`);
  S.fifth = note(5);
  return `4 filed (the 4th warns ${got[3].out.planWarning.used}/${got[3].out.planWarning.allowed}), the 5th not_filed: ${fifth.note.slice(0, 90)}…; ledger ${ledger} = tally ${tally}; reads answer`;
});

smoke("limits · the burst: past the minute's limit its writes are 429 with Retry-After (MCP and REST), its reads answer, org 1's write lands", async () => {
  expect(S.key, "the first limits case did not run");
  await oneMinute();
  // the minute's count so far, then a limit 3 above it: 3 more writes land, the next is refused
  const minute = new Date().toISOString().slice(0, 16);
  const used = (d1rows(`SELECT iif(minute = ${q(minute)}, calls_minute, 0) AS n FROM org_usage WHERE org = ${S.org}`)[0] || {}).n || 0;
  d1rows(`UPDATE plan_limits SET burst_minute = ${used + 3} WHERE plan = ${q(S.plan)}`);
  const w = []; for (let i = 0; i < 4; i++) w.push(await preview(S.key, S.project, i));
  const restW = await http("POST", "/preview", { key: S.key, body: { project: S.project, items: [{ contribution: { lane: "leader", kind: "note", what: `burst rest ${TAG}`, why: "the burst" } }] } });
  const read = await mcp(S.key, "whoami", {}), page = await http("GET", "/updates", { key: S.key });
  const other = await preview(ownerKey, "smoke", 9);
  const fourth = toolOut(w[3]);
  expect(w.slice(0, 3).every((r) => r.status === 200 && !r.json.result.isError) && w[3].status === 429 && fourth && fourth.error === "plan_limit" && fourth.limit === "burst_minute"
    && fourth.used === used + 3 && fourth.retryAfter >= 1 && restW.status === 429 && restW.json && restW.json.error === "plan_limit" && restW.json.limit === "burst_minute"
    && !read.isError && page.status === 200 && other.status === 200 && !other.json.result.isError,
    () => `writes ${w.map((r) => r.status).join(",")} (the 4th ${brief(fourth)}); REST ${restW.status} ${brief(restW.json)}; whoami ${read.isError}; /updates ${page.status}; org 1 ${other.status}`);
  return `limit ${used + 3}/minute: 3 writes land, the 4th 429 (retryAfter ${fourth.retryAfter}s), REST ${restW.status}; whoami and /updates answer; org 1's write ${other.status}`;
});

smoke("limits · the operator raises the org (its plan row): the refused project and the refused filing land", async () => {
  expect(S.key && S.fifth, "the earlier limits cases did not run");
  d1rows(`UPDATE org SET plan = 'team' WHERE id = ${S.org}`);
  const p = await mcp(S.key, "create_project", { key: "three", name: "Three" });
  const f = await contribute(S.key, S.fifth);
  const ok = f.out && f.out.items && f.out.items[0] && f.out.items[0].filed;
  expect(!p.isError && p.out.created === true && !f.isError && ok && ok.status === "filed", () => `create_project ${brief(p.out)}; the filing ${brief(f.out)}`);
  return `on team: the 3rd project created, the 5th filing ${ok.status} (${ok.id})`;
});
