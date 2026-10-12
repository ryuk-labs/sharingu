// tools/regrade-selftest.mjs — R1 (sprint 4): regrade from a page. Offline: the pure parts of src/regrade.js, then the real
// worker (src/index.js over node:sqlite, tools/fixtures/sqlite-worker.mjs) for what needs a database.
//   1. which checks are observable: the code model's screen grammar (with its optional regions, the page's own 302 and a link),
//      a rail check; a walk, another kind, a then that states more and a placeholder no id fills need a person;
//   2. the observation -> the verdict and the proof text: a 200 with everything proven, one region missing refused, a 302 to the
//      sign-in or a 404 nothing (a person grades it); the proof passes the door's proof rule (src/transmission.js proofKind);
//   3. the placeholders filled with an id this project holds, and the scope's refs for a flow (flowRefsOf);
//   4. through the real door: a flow of three screens graded, a change to one of them stales two checks, the plan names one
//      to observe and one walk for a person and writes nothing, the confirm observes the page as the caller and makes it
//      fresh (the flow's stale count on the Map goes to 0 for that check); a Partner is refused; a check naming /logout is
//      never fetched; the cap holds at 8 with more: true, and a second call regrades the rest.
// Exit 1 on any failure. Run: node tools/regrade-selftest.mjs
import { observationOf, fillPath, judge, proofText, previewCall, scopeOf, observeUrl, REGRADE_CAP, WHY } from "../src/regrade.js";
import { flowRefsOf } from "../src/knowledge/mapmodel.js";
import { proofKind } from "../src/transmission.js";
import { sqliteWorker } from "./fixtures/sqlite-worker.mjs";

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log("FAIL  " + msg); } };
const J = (v) => JSON.stringify(v).slice(0, 300);

// ---- 1. observable or not ----
const screen = (then, when = "GET /audit with Accept: text/html") => ({ kind: "screen", method: "observe", when, then });
const o1 = observationOf(screen('200 HTML holding data-screen="audit"; when it has them, also data-region="trail"'));
ok(o1.path === "/audit" && o1.screen === "audit" && !o1.need.length && o1.maybe.join() === "trail" && !o1.sendsOn, `audit: ${J(o1)}`);
const o2 = observationOf(screen('200 HTML holding the regions data-region="doc", data-region="doc-facts"', "GET /doc/<path> with Accept: text/html (an id this project holds)"));
ok(o2.path === "/doc/<path>" && !o2.screen && o2.need.join() === "doc,doc-facts" && o2.fills.join() === "doc", `doc: ${J(o2)}`);
const o3 = observationOf(screen('200 HTML holding data-screen="projects" and the regions data-region="projects"; a reader the page\'s own rule sends on gets that 302 instead', "GET /projects with Accept: text/html"));
ok(o3.sendsOn && o3.need.join() === "projects", `projects: ${J(o3)}`);
const o4 = observationOf(screen('200 HTML holding data-screen="s24-home" and data-region="items"'));
ok(o4.screen === "s24-home" && o4.need.join() === "items", `"and data-region": ${J(o4)}`);
const o5 = observationOf(screen('200 HTML holding data-screen="goal-node" and the regions data-region="filings"; it links /contribution/', "GET /goals/c6-video with Accept: text/html"));
ok(o5.link === "/contribution/" && o5.need.join() === "filings" && !o5.fills.length, `a link: ${J(o5)}`);
const rail = observationOf({ kind: "rail", method: "observe", when: "any signed-in page (GET /home with Accept: text/html)", then: 'the rail links /broadcast labelled "Broadcast"' });
ok(rail.path === "/home" && rail.rail && rail.rail.href === "/broadcast" && rail.rail.label === "Broadcast", `rail: ${J(rail)}`);
ok(observationOf({ kind: "flow", method: "walk", when: "1. a; 2. b", then: "every step answers as it says" }).why === "walk", "a walk needs a person");
ok(observationOf({ kind: "access", method: "observe", when: "GET /x", then: "a script gets 401" }).why === "kind", "an access check is not a page");
ok(observationOf(screen('200 HTML holding data-screen="goal-node" and the regions data-region="filings"; each filing links its contribution\'s page')).why === "more", "a then that states more needs a person");
ok(observationOf(screen('200 HTML holding data-screen="card"', "GET /read?ref=card/<kind>/<id> with Accept: text/html")).why === "id", "a card's placeholder needs a person");
ok(observationOf(screen('200 HTML holding data-screen="preview"', "GET /preview/<id> with Accept: text/html (an id this project holds)")).why === "id", "a preview's placeholder needs a person");
ok(observationOf(screen('200 HTML holding data-screen="x"', "POST /x with Accept: text/html")).why === "kind", "a POST is not a page");
ok(Object.values(WHY).every((w) => w.split(" ").length <= 3), "the needs words are labels");

// ---- 2. the verdict and the proof ----
const page = (body, status = 200, location = "") => ({ status, location, text: body });
const j1 = judge(o4, page('<section data-screen="s24-home"><ul data-region="items"></ul>'));
ok(j1.verdict === "proven" && j1.said === '200, data-screen="s24-home" present, regions 1 of 1', `proven: ${J(j1)}`);
const j2 = judge({ ...o4, need: ["items", "glance"] }, page('<section data-screen="s24-home"><ul data-region="items"></ul>'));
ok(j2.verdict === "refused" && /regions 1 of 2 \(missing glance\)/.test(j2.said), `refused: ${J(j2)}`);
ok(judge(o4, page("", 302, "http://x/login?next=/")).verdict === null, "a 302 to the sign-in files nothing");
ok(judge(o4, page("", 404)).verdict === null && judge(o4, page("", 503)).verdict === null, "a 404 or a 503 files nothing");
ok(judge(o3, page("", 302, "/home")).verdict === "proven", "the page's own 302, named by the check, is proven");
ok(judge(o4, page("", 302, "/home")).verdict === null, "a 302 the check does not name files nothing");
ok(judge(o5, page('<div data-screen="goal-node"><ul data-region="filings"><a href="/contribution/T-1">x</a></ul>')).verdict === "proven", "the link named is found");
ok(judge(o5, page('<div data-screen="goal-node"><ul data-region="filings"></ul>')).verdict === "refused", "the link named is missing");
ok(judge(rail, page('<nav><a href="/broadcast?project=a" data-tab="broadcast"><span>Broadcast</span></a></nav>')).verdict === "proven", "the rail's link is found");
const proof = proofText("/audit?project=alpha", "session", j1.said);
ok(proof === 'GET /audit?project=alpha (Accept: text/html, as the caller\'s session) -> 200, data-screen="s24-home" present, regions 1 of 1', proof);
ok(proofKind(proof) !== null && proofKind(proofText("/x", "key", j2.said)) !== null, `the door's proof rule takes it: ${proofKind(proof)}`);
const call = previewCall("alpha", [{ id: "c.1" }, { id: "c.2" }]);
ok(/^preview \{"project":"alpha","items":\[\{"grade":\{"checkId":"c\.1"/.test(call) && JSON.parse(call.slice(8)).items.length === 2, call.slice(0, 120));

// ---- 3. the placeholders and the scope ----
ok(fillPath("/goals/<ref>", { goal: "beta" }) === "/goals/beta" && fillPath("/goals/<ref>", {}) === null, "a goal fills /goals/<ref>");
ok(fillPath("/library?q=<words>", { words: "alpha" }) === "/library?q=alpha" && fillPath("/contribution/<id>/impact", { contribution: "T-20261005-001" }) === "/contribution/T-20261005-001/impact", "words and a contribution fill");
ok(observeUrl("/home", "a b") === "/home?project=a+b" && observeUrl("/library?q=x", "p") === "/library?q=x&project=p", "the project is named, the one ?project= the seam reads");
// the sprint-4 review's H1 attacks: a path carrying its own project (plain or encoded — searchParams decodes names), a
// fragment that would swallow the appended param, another origin or credentials is never observed; a dot-segment path is
// NORMALISED before anything tests or fetches it
ok(observeUrl("/goals?project=secret", "demo") === null && observeUrl("/goals?%70roject=secret", "demo") === null, "a check naming its own project= is refused, encoded too");
ok(observeUrl("/goals#x", "demo") === null && observeUrl("//evil.example/x", "demo") === null && observeUrl("https://evil.example/x", "demo") === null && observeUrl("/x@y:z", "demo") !== null && observeUrl("http://u:p@self/x", "demo") === null, "a fragment, another origin or credentials are refused");
ok(observeUrl("/goals/../logout", "p") === "/logout?project=p" && observeUrl("/goals/%2e%2e/logout", "p") === "/logout?project=p", "a dot-segment path (encoded too) normalises before the allowlist sees it");
ok(WHY.path === "Path says more", "the plan's chip for a refused path");
ok(flowRefsOf("flow:w", [{ screen: "a" }, { screen: "b", door: "GET /api/x" }, "c"]).join() === "flow:w,screen:a,screen:b,door:GET:/api/x,screen:c", J(flowRefsOf("flow:w", [{ screen: "a" }, { screen: "b", door: "GET /api/x" }, "c"])));
ok(scopeOf({}).error === "ref_required" && scopeOf({ checks: Array.from({ length: 61 }, (_, i) => `c${i}`) }).error === "too_many_items", "no scope, too many checks");
ok(scopeOf({ checks: "a, b,a" }).value.join() === "a,b" && scopeOf({ node: "goal/x" }).value === "x" && scopeOf({ flow: "w", node: "n" }).kind === "flow", "the scope parses");

// ---- 4. the real worker, offline ----
const w = await sqliteWorker({ projects: ["alpha"], people: [["p-o", "Owen", "owner", "owner-key", ["alpha"]], ["p-x", "Pia", "partner", "partner-key", ["alpha"]]] });
const call2 = async (name, args, key = "owner-key") => w.mcp(name, { project: "alpha", ...args }, key);
const file = async (items, key = "owner-key") => { const pv = await call2("preview", { items }, key); const f = await w.mcp("file", { previewId: pv.out.previewId, items }, key); return f; };
const S = ["r-a", "r-b", "r-c"];
const seed = [{ kind: "node", op: "upsert", data: { id: "surface:r", type: "surface", name: "R" } },
  ...S.map((x) => ({ kind: "node", op: "upsert", data: { id: `screen:${x}`, type: "screen", name: `R ${x}`, data: { surface: "r" } } })),
  { kind: "node", op: "upsert", data: { id: "flow:r-walk", type: "flow", name: "R walk", data: { steps: S.map((x) => ({ screen: x, actor: "Person", does: `opens ${x}` })) } } },
  ...S.map((x) => ({ kind: "check", op: "upsert", data: { id: `R.${x}.loads`, kind: "screen", method: "observe", title: `R ${x} loads`, when: "GET /home with Accept: text/html", then: '200 HTML holding data-screen="home"', refs: [`screen:${x}`] } })),
  { kind: "check", op: "upsert", data: { id: "R.walk", kind: "flow", method: "walk", title: "R walked", when: "1. Person opens r-a", then: "every step answers as it says", refs: ["flow:r-walk", "screen:r-a"] } }];
const sf = await file(seed);
ok(!sf.isError && sf.out.complete, `seed: ${J(sf.out)}`);
const grades = [...S.map((x) => `R.${x}.loads`), "R.walk"].map((id) => ({ grade: { checkId: id, verdict: "proven", proof: "sh tools/smoke.sh -> exit 0, 3 of 3" } }));
const gf = await file(grades);
ok(!gf.isError && gf.out.complete, `grades: ${J(gf.out)}`);
await new Promise((r) => setTimeout(r, 15));
const ch = await file([{ contribution: { lane: "code", kind: "pr", what: "R a change", why: "It changes R a.", touches: ["screen:r-a"], proof: "node x.mjs -> exit 0" } }]);
ok(!ch.isError && ch.out.complete, `the change: ${J(ch.out)}`);
const staleIds = () => w.db.prepare("SELECT check_id FROM k_check_stale WHERE project = 'alpha' ORDER BY check_id").all().map((r) => r.check_id).join();
ok(staleIds() === "R.r-a.loads,R.walk", `stale after the change: ${staleIds()}`);
const mapJson = async () => JSON.parse(await (await w.fetch(new Request(w.origin + "/map?project=alpha", { headers: { authorization: "Bearer owner-key", accept: "application/json" } }))).text());
const z0 = ((await mapJson()).flows || []).find((f) => f.id === "r-walk");
ok(z0 && z0.z === 2, `the Map counts the flow's stale checks: ${J(z0)}`);
// the rows the call changed OUTSIDE org_usage (8.2f, main's ruling: every call counts in its org's counter row; the pin never widens)
const changes = w.changes;
const c0 = changes();
const plan = await call2("regrade", { flow: "r-walk" });
ok(!plan.isError && plan.out.preview && plan.out.observe.map((c) => c.id).join() === "R.r-a.loads" && plan.out.needsProof.map((c) => `${c.id}:${c.why}`).join() === "R.walk:A walk"
  && plan.out.cap === REGRADE_CAP && plan.out.more === false && changes() === c0, `the plan: ${J(plan.out)}`);
const part = await call2("regrade", { flow: "r-walk", confirm: true }, "partner-key");
ok(part.isError && part.out.error === "partner_refused", `a Partner: ${J(part.out)}`);
const done = await call2("regrade", { flow: "r-walk", confirm: true });
const ob = (done.out.observed || [])[0] || {};
ok(!done.isError && done.out.counted === 1 && ob.verdict === "proven" && ob.status === 200 && /data-screen="home" present/.test(ob.said), `the confirm: ${J(done.out)}`);
const filedProof = w.db.prepare("SELECT proof, submitter, kind FROM transmission WHERE id = ?").get(ob.filed) || {};
ok(filedProof.kind === "grade" && filedProof.submitter === "p-o" && /^GET \/home\?project=alpha \(Accept: text\/html, as the caller's key\) -> 200/.test(filedProof.proof || ""), `the grade filed as the caller: ${J(filedProof)}`);
ok(staleIds() === "R.walk", `after the regrade only the walk is stale: ${staleIds()}`);
const z1 = ((await mapJson()).flows || []).find((f) => f.id === "r-walk");
ok(z1 && z1.z === 1, `the flow's stale count after: ${J(z1)}`);
const unknown = await call2("regrade", { node: "screen:nope" });
const unknownC = await call2("regrade", { checks: ["R.r-a.loads", "nope"] });
ok(unknown.out.error === "unknown_node" && unknownC.out.error === "unknown_check" && unknownC.out.checkId === "nope", `unknowns: ${J(unknown.out)} ${J(unknownC.out)}`);
// a check's path is a filer's text: a GET with an effect (/logout ends the session) is never fetched; it goes to a person
ok((await file([{ kind: "check", op: "upsert", data: { id: "R.logout", kind: "screen", method: "observe", title: "Logout", when: "GET /logout with Accept: text/html", then: '200 HTML holding data-screen="login"', refs: ["screen:r-b"] } }])).out.complete, "the /logout check filed");
const lo = await call2("regrade", { checks: ["R.logout"], confirm: true });
const lob = (lo.out.observed || [])[0] || {};
ok(lob.status === 0 && lob.verdict === null && lo.out.counted === 0 && (lo.out.needsProof || []).some((c) => c.id === "R.logout" && /^Answered/.test(c.why)), `/logout is never fetched: ${J(lo.out)}`);
// the sprint-4 review's H1/M1 attacks through the real door: a check naming another project goes to a person at PLAN time
// (nothing observed); a dot-segment path normalises to /logout and is never fetched (the presser's session survives); an
// owner-only page (/log) is not observable, whoever presses
ok((await file([
  { kind: "check", op: "upsert", data: { id: "R.proj", kind: "screen", method: "observe", title: "Another project", when: "GET /goals?project=beta with Accept: text/html", then: '200 HTML holding data-screen="goals"', refs: ["screen:r-b"] } },
  { kind: "check", op: "upsert", data: { id: "R.dots", kind: "screen", method: "observe", title: "Dots", when: "GET /goals/../logout with Accept: text/html", then: '200 HTML holding data-screen="login"', refs: ["screen:r-b"] } },
  { kind: "check", op: "upsert", data: { id: "R.ownr", kind: "screen", method: "observe", title: "The log", when: "GET /log with Accept: text/html", then: '200 HTML holding data-screen="log"', refs: ["screen:r-b"] } },
])).out.complete, "the three attack checks filed");
const atkPlan = await call2("regrade", { checks: ["R.proj"] });
ok(!atkPlan.isError && atkPlan.out.preview && (atkPlan.out.observe || []).length === 0 && (atkPlan.out.needsProof || []).some((c) => c.id === "R.proj" && c.why === WHY.path), `a check naming a project observes nothing: ${J(atkPlan.out)}`);
const atk = await call2("regrade", { checks: ["R.dots", "R.ownr"], confirm: true });
const atkBy = new Map((atk.out.observed || []).map((x) => [x.id, x]));
ok(atk.out.counted === 0 && (atkBy.get("R.dots") || {}).status === 0 && /^\/logout\?project=alpha$/.test((atkBy.get("R.dots") || {}).path || "") && (atkBy.get("R.ownr") || {}).status === 0, `a dot-segment /logout and an owner-only page answer nothing: ${J(atk.out.observed)}`);
ok(!(await call2("regrade", { checks: ["R.r-a.loads"] })).isError, "the presser's credential still works after the dot-segment press");
// the cap: 12 ungraded page checks on one node, 8 a call, then the rest
const many = Array.from({ length: 12 }, (_, i) => ({ kind: "check", op: "upsert", data: { id: `R.cap.${String(i).padStart(2, "0")}`, kind: "screen", method: "observe", title: `Cap ${i}`, when: "GET /home with Accept: text/html", then: '200 HTML holding data-screen="home"', refs: ["screen:r-c"] } }));
ok((await file(many)).out.complete, "twelve checks filed");
const cap1 = await call2("regrade", { node: "screen:r-c", confirm: true });
ok(REGRADE_CAP === 8 && cap1.out.observed.length === 8 && cap1.out.counted === 8 && cap1.out.more === true, `the cap: ${cap1.out.observed && cap1.out.observed.length} observed, more ${cap1.out.more}`);
const cap2 = await call2("regrade", { node: "screen:r-c", confirm: true });
ok(cap2.out.observed.length === 4 && cap2.out.more === false, `the rest: ${cap2.out.observed && cap2.out.observed.length}, more ${cap2.out.more}`);

console.log(`${fail ? "✗" : "✓"} regrade: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
