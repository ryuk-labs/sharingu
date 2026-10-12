// tools/smoke/s48-shown.mjs — sprint 8, 8.4 (docs/plan/PLATFORM.md §4 sprint 8: "The storage limit counts files and screen
// pictures per org; Control shows the plan and the usage; `whoami` answers the plan"; src/plans.js planShownOf) on the real local
// worker, after s47. An org of its own made by SQL (as s47's: an owner, a member and a partner seated on its one project), on the
// default plan free, then on a plan row of its own (items 5 a month) to drive the warning and the limit as s47 does. Every key in
// memory, never printed.
//   · a fresh org's whoami (the tool and GET /whoami) answers plan free with the ruled numbers and its usage; a screen picture
//     filed through the door moves its storage by the body's stored bytes (pictures), its files unchanged
//   · Control, read by the admin, draws the Plan card (the six limits and the plan's name, no sentence); a member's and
//     a partner's Control draw none, and a partner's whoami carries the plan's limits, never the org's usage
//   · past 80% of a limit its tile and bar wear the warning tone, at the limit the error tone; whoami's states agree
import { randomBytes } from "node:crypto";
import { smoke, expect, brief as brief0, http, mcp, html, contribute, kwrite, d1rows, sha } from "./lib.mjs";

const TAG = randomBytes(3).toString("hex");
const brief = (v) => brief0(v === undefined ? null : v);   // a missing answer reads null, never a crash in the message
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const S = {};
const GB = 2 ** 30;
const RULED_FREE = { people: 10, projects: 3, items_month: 1500, calls_day: 1000, burst_minute: 60, storage_bytes: GB };
const LIMITS = Object.keys(RULED_FREE);
const BODY = `<div class="s48">S48 shown ${TAG}</div>`;
const allowedOf = (p) => (p && p.limits ? Object.fromEntries(LIMITS.map((k) => [k, p.limits[k] && p.limits[k].allowed])) : null);
// tileOf(page, limit) -> the Plan card's tile for that limit (its opening tag and its inner markup), or null
const tileOf = (text, limit) => {
  const i = text.indexOf(`data-metric="plan-${limit}"`);
  if (i < 0) return null;
  const start = text.lastIndexOf("<div", i), next = text.indexOf('<div class="p-tile"', i);
  const t = text.slice(start, next < 0 ? text.indexOf("</section>", i) : next);
  return { tag: t.slice(0, t.indexOf(">") + 1), body: t };
};
const toneOf = (t) => (t ? ((/data-tone="(\w+)"/.exec(t.tag) || [])[1] || "") : null);
const barToneOf = (t) => (t ? ((/p-bar-track" data-tone="(\w+)"/.exec(t.body) || [])[1] || "") : null);

smoke("shown · a fresh org's whoami answers plan free with the ruled numbers and its usage; a screen picture moves its storage", async () => {
  const at = new Date().toISOString(), n = d1rows("SELECT COALESCE(MAX(id), 1) + 1 AS n FROM org")[0].n;
  S.org = n; S.project = `o${n}--web`;
  S.key = randomBytes(20).toString("hex"); S.member = randomBytes(20).toString("hex"); S.partner = randomBytes(20).toString("hex");
  d1rows(`INSERT INTO org (id, name, created_at, updated_at) VALUES (${n}, ${q(`Shown ${TAG}`)}, ${q(at)}, ${q(at)})`);
  d1rows(`INSERT INTO projects (key, name, active, created_at) VALUES (${q(S.project)}, 'Web', 1, ${q(at)})`);
  for (const [who, role, key] of [["owner", "owner", S.key], ["member", "member", S.member], ["partner", "partner", S.partner]]) {
    d1rows(`INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('shown-${who}-${n}', 'Shown ${who}', ${q(`${who}@shown${n}.local`)}, ${q(role)}, ${q(sha(key))}, 1, ${q(at)}, ${n})`);
    d1rows(`INSERT INTO project_seats (person_id, project_key, role, created_at) VALUES ('shown-${who}-${n}', ${q(S.project)}, ${q(role)}, ${q(at)})`);
  }
  const t = await mcp(S.key, "whoami", {}), r = await http("GET", "/whoami", { key: S.key });
  const p = t.out && t.out.plan, rp = r.json && r.json.plan;
  const used = p && p.limits ? Object.fromEntries(LIMITS.map((k) => [k, p.limits[k].used])) : {};
  expect(!t.isError && p && p.plan === "free" && JSON.stringify(allowedOf(p)) === JSON.stringify(RULED_FREE)
    && used.people === 3 && used.projects === 1 && used.items_month === 0 && used.storage_bytes === 0 && used.calls_day >= 1 && used.burst_minute >= 1
    && LIMITS.every((k) => p.limits[k].state === "ok") && /operator raises/.test(p.note || "") && JSON.stringify(p.storage) === JSON.stringify({ files: 0, pictures: 0 })
    && r.status === 200 && rp && rp.plan === "free" && JSON.stringify(allowedOf(rp)) === JSON.stringify(RULED_FREE) && rp.limits.people.used === 3 && rp.limits.calls_day.used >= used.calls_day,
    () => `the tool: ${brief(p)}; GET /whoami ${r.status} ${brief(rp)}`);
  // a screen picture through the door: a screen node and its html render (one knowledge write: one item this month)
  const w = await kwrite(S.key, { project: S.project, ops: [
    { kind: "node", op: "upsert", data: { id: "screen:s48-home", type: "screen", name: "S48 Home", status: "planned", data: { surface: "s48", states: ["default"] } } },
    { kind: "render", op: "upsert", data: { screen: "screen:s48-home", state: "default", variant: "live", format: "html", body: BODY } }] });
  expect(!w.isError && w.out.byKind && w.out.byKind.render === 1, () => `the render's write: ${brief(w.out)}`);
  const stored = Number(d1rows(`SELECT COALESCE(SUM(bytes), 0) AS b FROM k_screen_takes WHERE project = ${q(S.project)}`)[0].b);
  const t2 = await mcp(S.key, "whoami", {}), p2 = t2.out && t2.out.plan;
  expect(p2 && stored > 0 && p2.storage.pictures === stored && p2.storage.files === 0 && p2.limits.storage_bytes.used === stored && p2.limits.items_month.used === 1,
    () => `after the render: stored ${stored}; whoami ${brief(p2 && { storage: p2.storage, limits: p2.limits })}`);
  return `org ${n}: whoami plan free ${brief(allowedOf(p))}; used people 3, projects 1, items 0, calls ${used.calls_day}, bytes 0 (GET /whoami the same plan); one render filed: storage ${p2.limits.storage_bytes.used} bytes = its stored body (pictures ${p2.storage.pictures}, files ${p2.storage.files}), items 1`;
});

smoke("shown · Control read by the admin draws the Plan card; a member's and a partner's draw none, and a partner's whoami carries no usage", async () => {
  expect(S.key, "the first shown case did not run");
  const a = await html("/control", S.key), m = await html("/control", S.member), pt = await html("/control", S.partner);
  const tiles = LIMITS.map((k) => tileOf(a.text, k));
  const pw = await mcp(S.partner, "whoami", {}), pp = pw.out && pw.out.plan;
  expect(a.status === 200 && /<section[^>]*data-region="plan"/.test(a.text) && tiles.every(Boolean) && /data-plan="free"/.test(a.text)
    && !/operator raises/.test(a.text) && !/class="ct-why"/.test((/<section[^>]*data-region="plan"[\s\S]*?<\/section>/.exec(a.text) || [""])[0])
    && /pictures \d/.test(tiles[5].body) && tiles.every((x) => toneOf(x) === "")
    && m.status === 200 && /data-region="people"/.test(m.text) && !/<section[^>]*data-region="plan"/.test(m.text)
    && pt.status === 200 && /data-region="people"/.test(pt.text) && !/<section[^>]*data-region="plan"/.test(pt.text)
    && !pw.isError && pp && pp.plan === "free" && JSON.stringify(allowedOf(pp)) === JSON.stringify(RULED_FREE) && !/"used"/.test(JSON.stringify(pp)) && !("storage" in pp),
    () => `admin ${a.status} plan region ${/<section[^>]*data-region="plan"/.test(a.text)}, tiles ${tiles.filter(Boolean).length}, tones ${tiles.map(toneOf).join(",")}; member ${m.status} ${/<section[^>]*data-region="plan"/.test(m.text)}; partner ${pt.status} ${/<section[^>]*data-region="plan"/.test(pt.text)}; partner whoami ${brief(pp)}`);
  return `the admin's Control: the Plan card, 6 limits, plan free, calm (no tone), no sentence on it; the member's and the partner's Control: no Plan card; the partner's whoami: the limits only`;
});

smoke("shown · past 80% of a limit its tile and bar wear the warning tone, at the limit the error tone; whoami's states agree", async () => {
  expect(S.key, "the first shown case did not run");
  S.plan = `shown-${TAG}`;
  d1rows(`INSERT INTO plan_limits (plan, people, projects, items_month, calls_day, burst_minute, storage_bytes, updated_at) VALUES (${q(S.plan)}, 10, 3, 5, 1000, 300, ${GB}, ${q(new Date().toISOString())})`);
  d1rows(`UPDATE org SET plan = ${q(S.plan)} WHERE id = ${S.org}`);
  const note = (i) => ({ project: S.project, lane: "leader", kind: "note", what: `shown note ${i} ${TAG}`, why: "the plan's items, shown" });
  const got = [];
  for (let i = 2; i <= 4; i++) got.push(await contribute(S.key, note(i)));   // the render's write was the month's 1st: 4 of 5 = 80%
  const warnPage = await html("/control", S.key), warnWho = await mcp(S.key, "whoami", {});
  const wt = tileOf(warnPage.text, "items_month"), others = LIMITS.filter((k) => k !== "items_month").map((k) => toneOf(tileOf(warnPage.text, k)));
  const w = warnWho.out && warnWho.out.plan;
  expect(got.every((g) => !g.isError && g.out.id) && got[2].out.planWarning && got[2].out.planWarning.limit === "items_month" && got[2].out.planWarning.used === 4
    && /data-plan="shown-/.test(warnPage.text) && toneOf(wt) === "warn" && barToneOf(wt) === "warn" && /data-state="warn"/.test(wt.tag) && /<b>4<\/b><small>of 5<\/small>/.test(wt.body)
    && others.every((x) => x === "") && w && w.limits.items_month.used === 4 && w.limits.items_month.state === "warn",
    () => `filings ${got.map((g) => brief(g.out).slice(0, 60)).join(" | ")}; the tile ${wt && wt.tag} bar ${barToneOf(wt)}; others ${others.join(",")}; whoami ${brief(w && w.limits.items_month)}`);
  const fifth = await contribute(S.key, note(5));
  const fullPage = await html("/control", S.key), fullWho = await mcp(S.key, "whoami", {});
  const ft = tileOf(fullPage.text, "items_month"), f = fullWho.out && fullWho.out.plan;
  expect(!fifth.isError && fifth.out.planWarning && fifth.out.planWarning.used === 5 && toneOf(ft) === "bad" && barToneOf(ft) === "bad" && /data-state="limit"/.test(ft.tag)
    && f && f.limits.items_month.used === 5 && f.limits.items_month.state === "limit",
    () => `the 5th ${brief(fifth.out).slice(0, 120)}; the tile ${ft && ft.tag} bar ${barToneOf(ft)}; whoami ${brief(f && f.limits.items_month)}`);
  return `items 4 of 5: the tile and its bar warn (whoami state warn); 5 of 5: the error tone (whoami state limit); the other limits calm`;
});
