// counter-door-selftest.mjs — UI-B4a C5, the parent check at the door (QC8B94276: a counter is a filing that names the
// filing it disputes by parent). Offline: the REAL core.js fileTransmission / fileTransmissionsBatch over the Home
// fixture's real SQLite D1 (tools/fixtures/home-d1.mjs: boot.sql + migrate-038, foreign keys ON like D1). Proves:
//   · a counter filed exactly as drawn (parent, no touches) by a seat on the parent's project files, routed owner
//     (counters-a-filing), and the row carries its parent
//   · an unknown parent answers {error:"unknown_parent"} with NOTHING written and no foreign-key throw (before UI-B4a
//     the insert hit transmission.parent's foreign key and the call threw)
//   · a parent in a project the filer holds no seat on answers the SAME unknown_parent (never a hint the row exists)
//   · the owner may name a parent in any project
//   · a batch naming one unknown parent is refused whole: every result unknown_parent, zero rows written; a batch of
//     good parents files
//   · a counter with no target files incomplete, missing [parent]
//   · (UI-B6a, Q48115AD1) a counter by gapRefs goal/<id> files routed owner (counters-a-goal), standing, indexed verbatim;
//     a counter whose only gapRef is screen:041 is still incomplete
//   · a seated peer reads a row without its opt-in trace id (the owner and the submitter keep it)
//   · (the sprint-6 review, finding 8) two items of ONE batch under the same clientRef file ONCE (migrate-069's unique index
//     would otherwise refuse the whole batch): the second answers as the first's replay (its id, duplicate); the same ref with
//     other content answers client_ref_taken naming the first's id; the batch's other items file; filed again, nothing new
import { homeFixtureEnv, APPROVE_ID, OWNER, SEAT } from "./fixtures/home-d1.mjs";
import { fileTransmission, fileTransmissionsBatch, transmissionOneFor } from "../src/core.js";

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const fx = homeFixtureEnv();
fx.sqlite.exec("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('p-b','Bo Beta','bo@northwind.test','internal-eng','h-b',1,'2026-09-01T00:00:00Z',1)");
fx.sqlite.exec("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ('p-b','beta','member','2026-09-01T00:00:00Z')");
const OTHER = { id: "p-b", name: "Bo Beta", role: "internal-eng" };
const rows = () => fx.sqlite.prepare("SELECT COUNT(*) AS n FROM transmission").get().n;
const tryFile = async (who, body) => { try { return await fileTransmission(who, body, fx.env); } catch (e) { return { threw: String(e && e.message || e) }; } };
const drawn = { lane: "leader", kind: "counter", what: "a seat per project is not enough", why: "the owner keeps the org view" };

const n0 = rows();
const good = await tryFile(SEAT, { ...drawn, parent: APPROVE_ID });
const stored = good.id ? fx.sqlite.prepare("SELECT parent, route, project FROM transmission WHERE id = ?").get(good.id) : null;
ok(good.route === "owner" && (good.grade.ownerReasons || []).includes("counters-a-filing") && stored && stored.parent === APPROVE_ID && stored.project === "alpha" && rows() === n0 + 1,
  `a seat on alpha files a counter as drawn on ${APPROVE_ID}: ${good.id} routed ${good.route} (${(good.grade && good.grade.ownerReasons || []).join(",")}), parent stored`);
const n1 = rows();
const nope = await tryFile(SEAT, { ...drawn, parent: "T-nope" });
ok(nope.error === "unknown_parent" && nope.parent === "T-nope" && !nope.threw && rows() === n1, `an unknown parent: ${JSON.stringify(nope.threw ? { threw: nope.threw } : { error: nope.error, parent: nope.parent })}, nothing written (${rows() - n1} rows), no throw`);
const cross = await tryFile(OTHER, { ...drawn, parent: APPROVE_ID });
ok(cross.error === "unknown_parent" && rows() === n1 && Object.keys(cross).sort().join() === Object.keys(nope).sort().join(), `a seat on beta naming an alpha parent: ${cross.error || JSON.stringify(cross)}, the same shape as an unknown id, nothing written`);
// D1b item 4: the seatless owner of a two-project org names the project it files in (an unnamed write is refused)
const own = await tryFile(OWNER, { ...drawn, parent: APPROVE_ID, project: "alpha" });
ok(own.route === "owner" && rows() === n1 + 1, `the owner may name a parent in any project: ${own.id} routed ${own.route}`);
const n2 = rows();
let batchBad; try { batchBad = await fileTransmissionsBatch(SEAT, [{ ...drawn, parent: APPROVE_ID, what: "batch good" }, { ...drawn, parent: "T-nope", what: "batch bad" }], fx.env); } catch (e) { batchBad = [{ threw: String(e && e.message || e) }]; }
ok(batchBad.length === 2 && batchBad.every((r) => r.error === "unknown_parent" && r.item === 1 && r.parent === "T-nope") && rows() === n2,
  `a batch naming one unknown parent is refused whole: ${JSON.stringify(batchBad.map((r) => r.error || r.threw || r.id))}, ${rows() - n2} rows written`);
const batchGood = await fileTransmissionsBatch(SEAT, [{ ...drawn, parent: APPROVE_ID, what: "batch one" }, { ...drawn, parent: good.id, what: "batch two" }], fx.env);
ok(batchGood.length === 2 && batchGood.every((r) => r.id && r.route === "owner") && rows() === n2 + 2, `a batch of good parents files both (${batchGood.map((r) => r.id).join(", ")})`);
const noTarget = await tryFile(SEAT, drawn);
ok(noTarget.route === "incomplete" && JSON.stringify(noTarget.grade.missing) === '["parent"]' && noTarget.example && /kind: "counter", parent:/.test(noTarget.example.call || ""), `a counter with no target files incomplete, missing ${JSON.stringify(noTarget.grade && noTarget.grade.missing)}, the example carries the drawn call`);

// UI-B6a (Q48115AD1): a counter names a goal node by gapRefs goal/<id> -> routed owner (counters-a-goal), standing, its
// gapRef indexed verbatim into transmission_refs (the one goal/ range GOALS_COUNTERS_SQL reads); a stray gapRef is no target
const n3 = rows();
const onGoal = await tryFile(SEAT, { ...drawn, gapRefs: ["goal/engine"] });
const goalRefs = onGoal.id ? fx.sqlite.prepare("SELECT ref FROM transmission_refs WHERE tid = ?").all(onGoal.id).map((r) => r.ref) : [];
const goalRow = onGoal.id ? fx.sqlite.prepare("SELECT route, decision, parent FROM transmission WHERE id = ?").get(onGoal.id) : null;
ok(onGoal.route === "owner" && (onGoal.grade.ownerReasons || []).join() === "counters-a-goal" && goalRow && goalRow.decision === null && goalRow.parent === null && goalRefs.includes("goal/engine") && rows() === n3 + 1,
  `a counter by gapRefs goal/engine files: ${onGoal.id} routed ${onGoal.route} (${(onGoal.grade && onGoal.grade.ownerReasons || []).join(",")}), standing (decision null), indexed ${JSON.stringify(goalRefs)}`);
const strayRef = await tryFile(SEAT, { ...drawn, gapRefs: ["screen:041"] });
ok(strayRef.route === "incomplete" && JSON.stringify(strayRef.grade.missing) === '["parent"]' && /goal\/<id>/.test(strayRef.note || ""), `a counter whose only gapRef is screen:041 files incomplete, missing ${JSON.stringify(strayRef.grade && strayRef.grade.missing)}, its note names the goal/<id> form`);

// the single-row read hands a peer no trace: the owner and the submitter see the row's trace id, a seated peer does not
fx.sqlite.prepare("UPDATE transmission SET trace = 'art-trace-1' WHERE id = ?").run(APPROVE_ID);
const byOwner = await transmissionOneFor(APPROVE_ID, fx.env, OWNER), bySubmitter = await transmissionOneFor(APPROVE_ID, fx.env, { id: "p-a", role: "product" }), byPeer = await transmissionOneFor(APPROVE_ID, fx.env, SEAT);
ok(byOwner.trace === "art-trace-1" && bySubmitter.trace === "art-trace-1" && byPeer.id === APPROVE_ID && !("trace" in byPeer), "a seated peer reads the row without its opt-in trace id; the owner and the submitter keep it");

// finding 8: one clientRef twice in a batch
const nb = rows();
const twice = { lane: "leader", kind: "note", what: "said twice in one batch", why: "a client retried inside its own batch", clientRef: "s6-fix8-twice" };
let dupBatch; try { dupBatch = await fileTransmissionsBatch(SEAT, [twice, { ...twice }, { lane: "leader", kind: "note", what: "the other item", why: "it files beside them" }], fx.env); } catch (e) { dupBatch = [{ threw: String(e && e.message || e) }]; }
const landedTwice = fx.sqlite.prepare("SELECT COUNT(*) AS n FROM transmission WHERE submitter = ? AND client_ref = ?").get(SEAT.id, "s6-fix8-twice").n;
ok(dupBatch.length === 3 && dupBatch[0].id && !dupBatch[0].duplicate && dupBatch[1].id === dupBatch[0].id && dupBatch[1].duplicate === true && dupBatch[1].route === dupBatch[0].route
  && dupBatch[2].id && dupBatch[2].id !== dupBatch[0].id && landedTwice === 1 && rows() === nb + 2,
  `one clientRef twice in a batch files once (${landedTwice} row under the ref, ${rows() - nb} rows written) and answers both: ${JSON.stringify(dupBatch.map((r) => r.threw || r.error || (r.duplicate ? "replay of " + r.id : r.id)))}`);
const nc = rows();
let clashBatch; try { clashBatch = await fileTransmissionsBatch(SEAT, [{ ...twice, clientRef: "s6-fix8-clash" }, { ...twice, what: "other content, same ref", clientRef: "s6-fix8-clash" }], fx.env); } catch (e) { clashBatch = [{ threw: String(e && e.message || e) }]; }
ok(clashBatch.length === 2 && clashBatch[0].id && clashBatch[1].error === "client_ref_taken" && clashBatch[1].filed === clashBatch[0].id && clashBatch[1].clientRef === "s6-fix8-clash" && rows() === nc + 1,
  `the same ref with other content in one batch: the first files (${clashBatch[0].id}), the second ${clashBatch[1].error || clashBatch[1].threw} naming it (filed ${clashBatch[1].filed})`);
const nd = rows();
const again = await fileTransmissionsBatch(SEAT, [twice, { ...twice }], fx.env);
ok(again.length === 2 && again.every((r) => r.duplicate === true && r.id === dupBatch[0].id) && rows() === nd, `the same batch filed again files nothing: ${JSON.stringify(again.map((r) => r.id))}`);

console.log(`counter-door-selftest: ${checks - failed} pass · ${failed} fail`);
process.exit(failed ? 1 : 0);
