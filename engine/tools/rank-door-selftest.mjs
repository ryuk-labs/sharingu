// rank-door-selftest.mjs — UI-B4b, the rank door (QEFC716D5: a rank is a FILING, kind rank, parent <id>, lane leader,
// routed auto; any seated reader; the project's shared order is the newest press first; no table; no tool since D5).
// Offline: the REAL src/build.js fileRank and readBuild over the Home fixture's real SQLite D1 (tools/fixtures/home-d1.mjs:
// boot.sql + migrate-038, foreign keys ON like D1), then POST /rank through the REAL src/index.js handler (the
// cf-workers stub loader, as tools/d1-hot-selftest.mjs does), then the build tool through src/mcp.js callTool. Proves:
//   · a seat on alpha ranks an alpha filing: ONE row written, kind rank, lane leader, parent the ranked id, project
//     alpha, routed auto; Build's Ranked order then puts that filing first, for the owner too; no rank row on Build
//   · a reader seated only on beta, a missing id and a rank filing each answer 404 not_found, the same shape, nothing
//     written; no id answers 422 id_required; the owner may rank a filing in any project
//   · a suite row's rank is a suite row (eval inherited), so a real Build never shows a suite's press
//   · POST /rank as JSON answers the receipt with ranked: <id>; as a form it 303s to its same-origin next (an
//     off-origin next falls back to /build); a read-only key is refused 403; unauthenticated is 401; another project's
//     reader gets 404
//   · rank is no tool (D5: REST only, for Build's button) and the `build` tool answers the same read GET /build does
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { createHash } from "node:crypto";
import { asOrg } from "./fixtures/org.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));
const { homeFixtureEnv, APPROVE_ID, GRANT_ID, OWNER, SEAT } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "home-d1.mjs")).href);
const { fileRank, readBuild } = await import(pathToFileURL(join(ENGINE, "src", "build.js")).href);
const { callTool } = await import(pathToFileURL(join(ENGINE, "src", "mcp.js")).href);
const { default: handler } = await import(pathToFileURL(join(ENGINE, "src", "index.js")).href);

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const sha = (s) => createHash("sha256").update(s).digest("hex");
const fx = homeFixtureEnv();
fx.sqlite.exec("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('p-b','Bo Beta','bo@northwind.test','internal-eng','h-b',1,'2026-09-01T00:00:00Z',1)");
fx.sqlite.exec("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ('p-b','beta','member','2026-09-01T00:00:00Z')");
fx.sqlite.exec("INSERT INTO transmission (id,submitter,lane,kind,what,why,route,status,eval,project,created_at,org) VALUES ('T-20260928-701','p-b','leader','note','a beta note','why','auto','routed',0,'beta','2026-09-28T01:00:00Z',1)");
// a row p-b filed in alpha before losing (or never holding) a seat there: READER_SCOPE lets its submitter READ it, but rank
// is a seated reader's press, so p-b may not rank it
fx.sqlite.exec("INSERT INTO transmission (id,submitter,lane,kind,what,why,route,status,eval,project,created_at,org) VALUES ('T-20260928-700','p-b','leader','note','an alpha note by a beta seat','why','auto','routed',0,'alpha','2026-09-01T00:00:00Z',1)");
const OTHER = { id: "p-b", name: "Bo Beta", role: "internal-eng" };
const rows = () => fx.sqlite.prepare("SELECT COUNT(*) AS n FROM transmission").get().n;
const oldest = (await readBuild(fx.env, OWNER, { sort: "newest" })).rows.slice(-1)[0].id;

// ---- the seam ----
const n0 = rows();
const r1 = await fileRank(fx.env, SEAT, { id: oldest });
const st = r1.id ? fx.sqlite.prepare("SELECT kind, lane, parent, project, route, eval, submitter FROM transmission WHERE id = ?").get(r1.id) : null;
ok(r1.http === 200 && r1.ranked === oldest && st && st.kind === "rank" && st.lane === "leader" && st.parent === oldest && st.project === "alpha" && st.route === "auto" && st.eval === 0 && st.submitter === "p-c" && rows() === n0 + 1,
  `a seat on alpha ranks the oldest alpha filing ${oldest}: ${r1.id}, kind ${st && st.kind}, lane ${st && st.lane}, parent ${st && st.parent}, project ${st && st.project}, routed ${st && st.route}; one row written`);
const bOwner = await readBuild(fx.env, OWNER, {}), bSeat = await readBuild(fx.env, SEAT, {}), bNewest = await readBuild(fx.env, OWNER, { sort: "newest" });
ok(bOwner.rows[0].id === oldest && bSeat.rows[0].id === oldest && bOwner.rows[0].rank && bNewest.rows[0].id !== oldest && !bOwner.rows.some((r) => r.id === r1.id) && !("rank" in bOwner.counts.byKind),
  `Build's Ranked order: ${oldest} first for the seat and the owner alike (the project's shared order); Newest keeps ${bNewest.rows[0].id} first; the rank filing is no row and no kind`);
const second = bNewest.rows.slice(-2)[0].id;
const r2 = await fileRank(fx.env, OWNER, { id: second });
const b2 = await readBuild(fx.env, SEAT, {});
ok(r2.http === 200 && second !== oldest && b2.rows[0].id === second && b2.rows[1].id === oldest, `the newest press goes first: the owner ranks ${second} after it, and the order reads [${b2.rows.slice(0, 2).map((r) => r.id).join(", ")}]`);
const n1 = rows();
const other = await fileRank(fx.env, OTHER, { id: APPROVE_ID }), missing = await fileRank(fx.env, SEAT, { id: "T-19700101-999" }), rankOfRank = await fileRank(fx.env, SEAT, { id: r1.id });
const shape = (x) => `${x.http} ${x.error} [${Object.keys(x).sort().join(",")}]`;
ok(other.http === 404 && other.error === "not_found" && shape(other) === shape(missing) && shape(rankOfRank) === shape(missing) && rows() === n1,
  `a seat on beta ranking an alpha filing: ${shape(other)}; a missing id: ${shape(missing)}; a rank filing: ${shape(rankOfRank)}; nothing written`);
const ownUnseated = await fileRank(fx.env, OTHER, { id: "T-20260928-700" });
const { transmissionOneFor } = await import(pathToFileURL(join(ENGINE, "src", "core.js")).href);
const canRead = await transmissionOneFor("T-20260928-700", fx.env, OTHER);
ok(canRead.id === "T-20260928-700" && ownUnseated.http === 404 && ownUnseated.error === "not_found" && rows() === n1,
  `its submitter, seated only on beta, can read its alpha row (READER_SCOPE) but not rank it: ${ownUnseated.http} ${ownUnseated.error}, nothing written`);
const noId = await fileRank(fx.env, SEAT, {});
ok(noId.http === 422 && noId.error === "id_required" && rows() === n1, `no id: ${noId.http} ${noId.error}, nothing written`);
const ownBeta = await fileRank(fx.env, OWNER, { id: "T-20260928-701" });
const ownBetaRow = ownBeta.id ? fx.sqlite.prepare("SELECT project, parent FROM transmission WHERE id = ?").get(ownBeta.id) : null;
ok(ownBeta.http === 200 && ownBetaRow && ownBetaRow.project === "beta" && ownBetaRow.parent === "T-20260928-701", `the owner may rank a filing in any project: ${ownBeta.id} filed in ${ownBetaRow && ownBetaRow.project}`);
fx.sqlite.exec("UPDATE transmission SET eval = 1 WHERE id = '" + GRANT_ID + "'");
const evRank = await fileRank(fx.env, OWNER, { id: GRANT_ID });
const evRow = evRank.id ? fx.sqlite.prepare("SELECT eval FROM transmission WHERE id = ?").get(evRank.id) : null;
const bReal = await readBuild(fx.env, OWNER, {}), bEval = await readBuild(fx.env, OWNER, { eval: "1" });
ok(evRow && evRow.eval === 1 && !bReal.rows.some((r) => r.id === GRANT_ID) && bEval.rows[0].id === GRANT_ID,
  "a suite row's rank is a suite row (eval inherited): a real Build never shows it, the suites' view (?eval=1) puts it first");

// ---- the real handler: POST /rank ----
const keys = { "p-o": "owner-key", "p-c": "seat-key", "p-b": "beta-key" };
for (const [id, k] of Object.entries(keys)) fx.sqlite.prepare("UPDATE people SET key_hash = ? WHERE id = ?").run(sha(k), id);
const ROK = sha(sha("seat-key") + ":agent-r-read-only:v1");   // src/core.js READ_ONLY_SUFFIX: the seat's read-only key
const r2obj = (t) => ({ text: async () => t, json: async () => JSON.parse(t), arrayBuffer: async () => new TextEncoder().encode(t).buffer, size: t.length, httpMetadata: { contentType: "application/json" } });
const BRAIN = { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} };
const env = asOrg({ DB: fx.env.DB, BRAIN });   // signed in to org 1 (src/data.js)
const ctx = { waitUntil() {}, passThroughOnException() {} };
const post = async (key, body, form) => {
  const headers = { ...(key ? { authorization: `Bearer ${key}` } : {}) };
  let payload;
  if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(body).toString(); }
  else { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  const r = await handler.fetch(new Request("https://org.test/rank", { method: "POST", headers, body: payload }), env, ctx);
  let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch { j = null; }
  return { status: r.status, location: r.headers.get("location"), j };
};
const n2 = rows();
const hj = await post("seat-key", { id: "T-20260927-201" });
ok(hj.status === 200 && hj.j && hj.j.ranked === "T-20260927-201" && hj.j.route === "auto" && /^T-/.test(hj.j.id) && rows() === n2 + 1, `POST /rank (JSON, a seat): ${hj.status}, ranked ${hj.j && hj.j.ranked}, filed ${hj.j && hj.j.id} routed ${hj.j && hj.j.route}`);
const hf = await post("seat-key", { id: "T-20260927-202", next: "/build?sort=newest" }, true);
const hf2 = await post("seat-key", { id: "T-20260927-203", next: "https://evil.example/x" }, true);
ok(hf.status === 303 && hf.location === "/build?sort=newest" && hf2.status === 303 && hf2.location === "/build" && rows() === n2 + 3,
  `POST /rank (a form): ${hf.status} to ${hf.location}; an off-origin next falls back to ${hf2.location}`);
const n3 = rows();
const hOther = await post("beta-key", { id: APPROVE_ID }), hRo = await post(ROK, { id: APPROVE_ID }), hAnon = await post(null, { id: APPROVE_ID }), hNoId = await post("seat-key", {});
ok(hOther.status === 404 && hOther.j.error === "not_found" && hRo.status === 403 && hRo.j.error === "read_only_credential" && hAnon.status === 401 && hNoId.status === 422 && hNoId.j.error === "id_required" && rows() === n3,
  `refusals through the handler: another project's reader ${hOther.status} ${hOther.j && hOther.j.error}, a read-only key ${hRo.status} ${hRo.j && hRo.j.error}, no key ${hAnon.status}, no id ${hNoId.status} ${hNoId.j && hNoId.j.error}; nothing written`);

// ---- D5: rank stays REST for Build's button, with no tool (decided by the plan's laws); the build tool answers the same read ----
const { readFileSync } = await import("node:fs");
const door = JSON.parse(readFileSync(join(ENGINE, "..", "contracts", "door.json"), "utf8"));
const url = new URL("https://org.test/mcp");
const TOOLS = door.tools.map((t) => ({ name: t.name, owner: t.owner, write: t.write, project: t.project }));
const n4 = rows();
const m = await callTool("rank", { id: "T-20260927-204" }, SEAT, fx.env, url, TOOLS);
ok(!TOOLS.some((t) => t.name === "rank") && m.error && /unknown tool/.test(m.error) && rows() === n4, `rank is no tool (the door answers ${m.error}); nothing written`);
const press = await post("seat-key", { id: "T-20260927-204" });
const mb = await callTool("build", {}, SEAT, fx.env, url, TOOLS), direct = await readBuild(fx.env, SEAT, {});
ok(press.status === 200 && JSON.stringify(mb.rows.map((r) => r.id)) === JSON.stringify(direct.rows.map((r) => r.id)) && JSON.stringify(mb.counts) === JSON.stringify(direct.counts) && mb.rows[0].id === "T-20260927-204",
  `the build tool answers the same read GET /build does (${mb.rows.length} rows, the newest press first: ${mb.rows[0] && mb.rows[0].id})`);

console.log(`rank-door-selftest: ${checks - failed} pass · ${failed} fail`);
process.exit(failed ? 1 : 0);
