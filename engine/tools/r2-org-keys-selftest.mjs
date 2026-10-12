// tools/r2-org-keys-selftest.mjs — the storage keys (sprint 6, 6.4; src/storage.js) and the ship's copy of org 1's objects
// (tools/ship/r2-org-keys.mjs), against a REAL local R2: a fresh miniflare state through wrangler's getPlatformProxy, the bucket a
// local worker persists to (nothing reaches Cloudflare). Cases:
//   THE KEYS  · store(env) writes o<org>/<key> for the signed-in org (org 1 too); a key outside the three roots is refused; no
//               sign-in is refused (never org 1); storeOfRow reads under the row's org
//   BARE KEYS · an object at a bare key (no o<n>/ prefix: what the code before 6.4 wrote) is read by NO org, org 1 included
//               (get and head, every root), and no org's sweep deletes it; org 2 never reads org 1's o1/ key; each org's
//               sweep takes its own prefix alone
//   THE SHIP  · on a bucket holding org 1's old keys of all three roots (one already copied, one superseded by a newer write),
//               another org's objects and a key of no root: plan counts each class; delete before a verify is REFUSED and
//               deletes nothing; verify before the copy is incomplete; copy --limit copies that many; copy is idempotent (a
//               second run copies 0); the twins hold the same bytes and content type; verify complete writes its stamp; a key
//               written to an old root after the verify makes delete REFUSE (the listing changed) until copy + verify run again;
//               delete then removes every old key, keeps every twin, another org's objects and the rootless key; org 1 reads
//               every object through o1/ after it; a second delete answers nothing to delete; the CLI's exit codes hold, and the
//               CLI's copy records each twin it wrote (its sha256 and md5) in the state file
//   CORRUPT   · (sprint 6 review, finding 12) a copy whose put writes wrong bytes (the same size, so newer and different): the
//               verify that knows which twins the tool wrote is INCOMPLETE (it differs) — the old rule, which knows none, called
//               it superseded and complete — and the delete REFUSES, every old key kept (R2 has no Time Travel); --deep agrees
// Exit 1 on any fail. Run in the gate.
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { asOrg } from "./fixtures/org.mjs";
import { store, storeOfRow, renderKey, artifactKey, handoffKey, HANDOFF_EVAL_PREFIX } from "../src/storage.js";
import { pathToFileURL } from "node:url";
// R2_ORG_KEYS_TOOL (optional) points this selftest at a MUTANT copy of tools/ship/r2-org-keys.mjs (kept beside it)
const T = await import(process.env.R2_ORG_KEYS_TOOL ? pathToFileURL(process.env.R2_ORG_KEYS_TOOL).href : "./ship/r2-org-keys.mjs");

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const sha = (s) => createHash("sha256").update(s).digest("hex");
const BUCKET = "selftest-brain";
const dir = mkdtempSync(join(tmpdir(), "r2-org-keys-selftest-"));
const text = async (o) => (o ? await o.text() : null);

try {
  let be = await T.localBackend(dir, BUCKET);
  const BRAIN = be.binding;
  const env1 = asOrg({ BRAIN }), env2 = asOrg({ BRAIN }, 2);

  // ---- THE KEYS ----
  {
    const k = renderKey("sharingu", sha("a"));
    await store(env1).put(k, "one", { httpMetadata: { contentType: "text/html" } });
    await store(env2).put(renderKey("o2--shop", sha("b")), "two");
    const keys = (await be.list()).map((o) => o.key).sort();
    ok(JSON.stringify(keys) === JSON.stringify([`o1/${k}`, `o2/renders/o2--shop/${sha("b")}`]), `a write lands under the writer's org's prefix, org 1's too (${keys.join(", ")})`);
    let r1 = null, r3 = null;
    try { await store(env1).put("lib/state.json", "x"); } catch (e) { r1 = e.code; }
    const r2 = [await store(env1).get(`o2/renders/o2--shop/${sha("b")}`), await store(env1).head(`o2/renders/o2--shop/${sha("b")}`), await store(env1).get("serve/lib/old.json")];
    try { store({ BRAIN }); } catch (e) { r3 = e.code; }
    ok(r1 === "storage_key" && r2.every((x) => x === null) && r3 === "org_unknown",
      `a write outside the three roots is refused (${r1}); a read of another org's prefixed key or an earlier era's key answers nothing; no sign-in is refused (${r3}), never org 1`);
    ok((await text(await storeOfRow(env2, { org: 1 }).get(k))) === "one" && (await storeOfRow(env1, { org: 2 }).get(k)) === null,
      "storeOfRow reads under the row's org (a file read by its exact id), whatever the reader's");
    await be.delete(`o1/${k}`); await be.delete(`o2/renders/o2--shop/${sha("b")}`);
  }

  // ---- BARE KEYS ----
  const OLD = {
    [renderKey("sharingu", sha("r1"))]: ["<p>render one</p>", "text/html; charset=utf-8"],
    [renderKey("sharingu", sha("r2"))]: ["<p>render two</p>", "text/html; charset=utf-8"],
    [artifactKey("2026-09", "p-own", sha("f1"), "png")]: ["\x89PNG fake", "image/png"],
    [artifactKey("2026-09", "agent-r", sha("rep"), "html")]: ["<p>report</p>", "text/html"],
    [handoffKey(false, "2026-09", "h-1")]: ['{"summary":"real"}', "application/json"],
    [handoffKey(true, "2026-09", "h-eval")]: ['{"summary":"suite"}', "application/json"],
    ["backups/d1/2026-10-05/0001.json"]: ['{"table":"people"}', "application/json"],
    ["backups/d1/2026-10-05/manifest.json"]: ['{"pages":1,"old":true}', "application/json"],
  };
  for (const [k, [v, ct]] of Object.entries(OLD)) await BRAIN.put(k, v, { httpMetadata: { contentType: ct } });
  {
    const shapes = Object.keys(OLD);
    for (const [env, who] of [[env1, "org 1"], [env2, "org 2"]]) {
      const leaks = [];
      for (const x of shapes) { if (await store(env).get(x)) leaks.push(x); if (await store(env).head(x)) leaks.push(`head ${x}`); }
      ok(!leaks.length, `${who} reads none of the ${shapes.length} objects at bare keys (every root; get and head)${leaks.length ? ` — read: ${leaks.join(", ")}` : ""}`);
    }
    const [k] = shapes;
    await store(env1).put(k, "<p>render one, rewritten</p>", { httpMetadata: { contentType: "text/html; charset=utf-8" } });
    ok((await text(await store(env1).get(k))) === "<p>render one, rewritten</p>" && !(await store(env2).get(k)) && (await text(await BRAIN.get(k))) === OLD[k][0],
      "org 1 reads its o1/ key alone (the bare object beside it untouched); org 2 reads neither");
    await be.delete(`o1/${k}`);
    // the sweep: each org's takes its own prefix alone; the bare handoff (no org's) stays
    await store(env2).put(handoffKey(true, "2026-09", "h-two"), "{}");
    await store(env1).put(handoffKey(true, "2026-09", "h-one"), "{}");
    const n2 = await store(env2).sweep(HANDOFF_EVAL_PREFIX);
    const after2 = (await be.list()).map((o) => o.key).filter((x) => x.includes("handoffs/eval/")).sort();
    ok(n2 === 1 && JSON.stringify(after2) === JSON.stringify([`inbox/handoffs/eval/2026-09/h-eval.json`, `o1/inbox/handoffs/eval/2026-09/h-one.json`]), `org 2's sweep deletes its own suites' handoff alone (${n2}; left ${after2.join(", ")})`);
    const n1 = await store(env1).sweep(HANDOFF_EVAL_PREFIX);
    const after1 = (await be.list()).map((o) => o.key).filter((x) => x.includes("handoffs/eval/"));
    ok(n1 === 1 && JSON.stringify(after1) === JSON.stringify([`inbox/handoffs/eval/2026-09/h-eval.json`]), `org 1's sweep deletes its own suites' handoff under o1/ alone; the bare one is no org's and stays (${n1}; left ${after1.join(", ")})`);
  }

  // ---- THE SHIP ----
  // one already copied (equal), one superseded (the new code wrote the day's manifest since), another org's objects, a rootless key
  const pre = Object.keys(OLD)[1];
  await BRAIN.put(`o1/${pre}`, OLD[pre][0], { httpMetadata: { contentType: OLD[pre][1] } });
  await new Promise((r) => setTimeout(r, 20));
  await BRAIN.put("o1/backups/d1/2026-10-05/manifest.json", '{"pages":1,"new":true}', { httpMetadata: { contentType: "application/json" } });
  await BRAIN.put(`o2/renders/o2--shop/${sha("s")}`, "<p>shop</p>"); await BRAIN.put("o2/inbox/handoffs/2026-10/x.json", "{}");
  await BRAIN.put("lib/state.json", "{}");
  await BRAIN.put(`renders/o2--shop/${sha("stray")}`, "<p>a bare org-2 render of the 6.1-6.3 code</p>");
  const n = Object.keys(OLD).length;
  const p = await T.plan(be);
  ok(p.old === n && p.copied === 2 && p.toCopy === n - 2 && p.otherOrgs === 2 && p.other === 1 && p.otherKeys[0] === "lib/state.json" && p.foreign === 1 && p.byRoot["inbox/"] === 4 && p.byRoot["renders/"] === 2 && p.byRoot["backups/"] === 2,
    `plan: ${p.old} old (inbox ${p.byRoot["inbox/"]}, renders ${p.byRoot["renders/"]}, backups ${p.byRoot["backups/"]}), ${p.copied} copied, ${p.otherOrgs} of another org, ${p.other} of no root`);
  const d0 = await T.del(be, null);
  ok(d0.refused && d0.deleted === 0 && (await T.plan(be)).old === n, `delete before any verify is refused, nothing deleted (${d0.refused})`);
  const v0 = await T.verify(be);
  ok(!v0.complete && v0.missing === n - 2 && v0.equal === 1 && v0.superseded === 1, `verify before the copy: incomplete (${v0.missing} missing, ${v0.equal} equal, ${v0.superseded} superseded)`);
  const d1 = await T.del(be, { bucket: be.name, complete: false, listing: v0.listing });
  ok(d1.refused && d1.deleted === 0, `delete after an incomplete verify is refused (${d1.refused})`);
  const c1 = await T.copy(be, { limit: 2 });
  ok(c1.copied === 2 && c1.already === 1 && c1.superseded === 1 && c1.left === n - 4 && !c1.conflicts.length, `copy --limit 2: ${c1.copied} copied, ${c1.left} left (the small batch first)`);
  const c2 = await T.copy(be);
  const c3 = await T.copy(be);
  ok(c2.copied === n - 4 && c3.copied === 0 && c3.already === n - 1 && c3.superseded === 1, `copy: the rest (${c2.copied}); a second run copies nothing (${c3.copied} copied, ${c3.already} already, ${c3.superseded} superseded): idempotent`);
  const twinsOk = [];
  for (const [k, [v, ct]] of Object.entries(OLD)) {
    if (k.endsWith("manifest.json")) continue;
    const t = await be.get(`o1/${k}`);
    if (!t || !Buffer.from(t.bytes).equals(Buffer.from(v, "utf8")) || t.contentType !== ct) twinsOk.push(k);
  }
  ok(!twinsOk.length, `every twin holds its old object's bytes and content type${twinsOk.length ? ` — off: ${twinsOk.join(", ")}` : ""}`);
  const v1 = await T.verify(be);
  const deep = await T.verify(be, { deep: true });
  ok(v1.complete && v1.old === n && v1.equal === n - 1 && v1.superseded === 1 && deep.complete && deep.listing.hash === v1.listing.hash, `verify: complete (${v1.equal} equal, ${v1.superseded} superseded; --deep agrees by sha256)`);
  const stamp = { bucket: be.name, complete: v1.complete, listing: v1.listing };
  // after the verify, an old key and its twin both appear (the copy is complete, the listing is not the verified one): refused
  for (const k of ["", "o1/"]) await BRAIN.put(`${k}${handoffKey(false, "2026-10", "twin")}`, "{}", { httpMetadata: { contentType: "application/json" } });
  const dh = await T.del(be, stamp);
  ok(dh.refused && /changed since the verify/.test(dh.refused) && dh.deleted === 0 && (await T.plan(be)).old === n + 1, `the old keys changed since the verify (complete, another listing): delete refused, nothing deleted (${dh.refused})`);
  // the old code writes once more after the verify, no twin: refused as incomplete
  await BRAIN.put(handoffKey(false, "2026-10", "late"), '{"late":true}', { httpMetadata: { contentType: "application/json" } });
  const d2 = await T.del(be, stamp);
  ok(d2.refused && /not complete/.test(d2.refused) && d2.deleted === 0 && (await T.plan(be)).old === n + 2, `a key written after the verify with no twin: delete refused, nothing deleted (${d2.refused})`);
  await T.copy(be);
  const v2 = await T.verify(be);
  const d3 = await T.del(be, { bucket: be.name, complete: v2.complete, listing: v2.listing });
  const keys = (await be.list()).map((o) => o.key);
  ok(d3.ok && d3.deleted === n + 2 && d3.left === 0 && d3.twinsKept && T.classify((await be.list())).old.size === 0 && keys.includes("lib/state.json")
    && keys.includes(`o2/renders/o2--shop/${sha("s")}`) && keys.includes("o2/inbox/handoffs/2026-10/x.json") && keys.includes(`renders/o2--shop/${sha("stray")}`) && !keys.includes(`o1/renders/o2--shop/${sha("stray")}`),
    `delete after copy + verify: ${d3.deleted} old keys gone, every twin kept; another org's objects, its bare render (never copied to o1/) and the rootless key untouched`);
  const reads = [];
  for (const k of [...Object.keys(OLD), handoffKey(false, "2026-10", "late"), handoffKey(false, "2026-10", "twin")]) { const v = await text(await store(env1).get(k)); if (v == null) reads.push(k); }
  ok(!reads.length && (await text(await store(env1).get("backups/d1/2026-10-05/manifest.json"))) === '{"pages":1,"new":true}',
    `org 1 reads every object through o1/ after the delete (the superseded manifest is the newer one)${reads.length ? ` — missing: ${reads.join(", ")}` : ""}`);
  const d4 = await T.del(be, null);
  ok(d4.deleted === 0 && /nothing to delete/.test(d4.note || ""), `a second delete: ${d4.note}`);
  await be.close();

  // ---- CORRUPT: a copy that writes the wrong bytes is never "superseded" (finding 12) ----
  {
    const dir2 = mkdtempSync(join(tmpdir(), "r2-org-keys-corrupt-"));
    try {
      const b2 = await T.localBackend(dir2, BUCKET);
      const keys = [renderKey("sharingu", sha("c1")), artifactKey("2026-09", "p-own", sha("c2"), "json"), "backups/d1/2026-10-04/manifest.json"];
      for (const k of keys) await b2.binding.put(k, `{"body":"${k.length}"}`, { httpMetadata: { contentType: "application/json" } });
      await new Promise((r) => setTimeout(r, 20));
      // the put of one key writes other bytes of the same size (a truncated stream, a wrong buffer)
      const bad = keys[1];
      const flaky = { ...b2, put: (k, bytes, o) => b2.put(k, k === `o1/${bad}` ? new TextEncoder().encode(new TextDecoder().decode(bytes).replace(/"\}$/, "!}")) : bytes, o) };
      const written = {};
      const c = await T.copy(flaky, { written });
      const twin = await b2.get(`o1/${bad}`), orig = await b2.get(bad);
      const corrupt = twin && orig && twin.bytes.length === orig.bytes.length && !Buffer.from(twin.bytes).equals(Buffer.from(orig.bytes));
      const vNew = await T.verify(b2, { claimed: written }), vDeep = await T.verify(b2, { claimed: written, deep: true }), vOld = await T.verify(b2);
      ok(c.copied === 3 && Object.keys(written).length === 3 && written[bad].sha256 === sha(orig.bytes) && /^[0-9a-f]{32}$/.test(written[bad].md5) && corrupt,
        `copy records each twin it writes (key -> sha256 and md5 of the bytes meant): ${Object.keys(written).length}; one put wrote other bytes of the same size`);
      ok(!vNew.complete && vNew.differ === 1 && vNew.differKeys[0] === bad && vNew.superseded === 0 && !vDeep.complete && vDeep.differ === 1 && vOld.complete && vOld.superseded === 1,
        `verify with the record: INCOMPLETE (${vNew.differ} differs: ${vNew.differKeys[0]}; --deep agrees) — without it (the old rule) the corrupt twin passed as superseded (complete ${vOld.complete}, ${vOld.superseded} superseded)`);
      const dc = await T.del(b2, { bucket: b2.name, complete: true, listing: vOld.listing, copied: written });
      const left = T.classify(await b2.list()).old.size;
      ok(dc.refused && /not complete/.test(dc.refused) && dc.deleted === 0 && left === 3,
        `delete with a stamp the old rule would have written (complete) but the record of what was copied: REFUSED, nothing deleted (${left} old keys kept: ${dc.refused})`);
      await b2.close();
    } finally { rmSync(dir2, { recursive: true, force: true }); }
  }

  // ---- THE CLI (exit codes; one process at a time on the state) ----
  await (async () => {
    const st = join(dir, "state.json");
    const cli = (...a) => { try { return { rc: 0, out: execFileSync("node", [join(ENGINE, "tools", "ship", "r2-org-keys.mjs"), ...a, "--bucket", BUCKET, "--local", dir, "--state", st], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; } catch (e) { return { rc: e.status, out: `${e.stdout || ""}${e.stderr || ""}` }; } };
    const u = (() => { try { execFileSync("node", [join(ENGINE, "tools", "ship", "r2-org-keys.mjs"), "delete"], { stdio: "pipe" }); return 0; } catch (e) { return e.status; } })();
    be = await T.localBackend(dir, BUCKET);
    await be.binding.put(renderKey("ryuklabs", sha("cli")), "<p>cli</p>", { httpMetadata: { contentType: "text/html" } });
    await be.close();
    const del0 = cli("delete"), ver0 = cli("verify"), del1 = cli("delete"), cp = cli("copy"), ver1 = cli("verify");
    const stampNow = JSON.parse(readFileSync(st, "utf8"));
    const del2 = cli("delete"), plan2 = cli("plan");
    const ck = renderKey("ryuklabs", sha("cli")), rec = (stampNow.copied || {})[ck] || {};
    ok(u === 2 && del0.rc === 1 && ver0.rc === 1 && del1.rc === 1 && cp.rc === 0 && ver1.rc === 0 && stampNow.complete === true && del2.rc === 0 && JSON.parse(plan2.out).old === 0
      && rec.sha256 === sha("<p>cli</p>") && rec.md5 === createHash("md5").update("<p>cli</p>").digest("hex") && JSON.parse(cp.out).recorded === 1,
      `the CLI: usage 2; delete with no stamp 1; verify incomplete 1; delete after it 1; copy 0 (its twin's sha256 and md5 in the state file); verify 0 (stamp complete); delete 0; plan after: 0 old`);

    // a killed copy keeps its claims: the journal written before each put is merged by the next run, then folded into the state
    const st2 = join(dir, "state2.json"), jk = renderKey("ryuklabs", sha("killed")), jrec = { sha256: sha("x"), md5: "m" };
    (await import("node:fs")).writeFileSync(st2 + ".journal", JSON.stringify({ k: jk, rec: jrec }) + "\n" + '{"k":"torn');
    const cli2 = (...a) => { try { return { rc: 0, out: execFileSync("node", [join(ENGINE, "tools", "ship", "r2-org-keys.mjs"), ...a, "--bucket", BUCKET, "--local", dir, "--state", st2], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; } catch (e) { return { rc: e.status, out: `${e.stdout || ""}${e.stderr || ""}` }; } };
    const v2 = cli2("verify"), s2 = JSON.parse(readFileSync(st2, "utf8")), j2 = readFileSync(st2 + ".journal", "utf8");
    ok(s2.copied && s2.copied[jk] && s2.copied[jk].sha256 === jrec.sha256 && j2 === "" && v2.rc !== undefined,
      `a copy killed mid-run keeps its claims: the journal's line is merged (a torn last line ignored), folded into the state, the journal emptied`);

    // four lanes at once: every object copied and recorded exactly once, each twin's bytes its own
    const pdir = mkdtempSync(join(tmpdir(), "r2-par-")), pb = await T.localBackend(pdir, BUCKET);
    const keys = Array.from({ length: 9 }, (_, i) => renderKey("ryuklabs", sha(`par${i}`)));
    for (let i = 0; i < keys.length; i++) await pb.binding.put(keys[i], `<p>par${i}</p>`, { httpMetadata: { contentType: "text/html" } });
    const pw = {}, seen = [];
    const pout = await T.copy(pb, { concurrency: 4, written: pw, record: (k) => seen.push(k) });
    const twinsOk = (await Promise.all(keys.map(async (k, i) => { const o = await pb.binding.get("o1/" + k); return o && (await o.text()) === `<p>par${i}</p>`; }))).every(Boolean);
    await pb.close(); rmSync(pdir, { recursive: true, force: true });
    ok(pout.copied === 9 && Object.keys(pw).length === 9 && new Set(seen).size === 9 && seen.length === 9 && twinsOk,
      `four lanes copy 9 objects, each recorded once (${seen.length} records, ${new Set(seen).size} distinct), each twin its own bytes`);

    // the content type is the LISTING's: an object stored with none keeps none (the live REST download answers a default
    // text/plain); a twin with the same bytes under that default is repaired, never a conflict
    const tdir = mkdtempSync(join(tmpdir(), "r2-ct-")), tb = await T.localBackend(tdir, BUCKET);
    const fresh = "backups/digest/2026-09-01.json", wrong = "backups/digest/2026-09-02.json";
    await tb.binding.put(fresh, "{\"a\":1}");                       // stored with no type
    await tb.binding.put(wrong, "{\"b\":2}");
    await tb.binding.put("o1/" + wrong, "{\"b\":2}", { httpMetadata: { contentType: "text/plain; charset=utf-8" } });   // the old run's default
    const tout = await T.copy(tb, {});
    const types = Object.fromEntries((await tb.list("o1/")).map((o) => [o.key, o.contentType]));
    const tver = await T.verify(tb, {});
    await tb.close(); rmSync(tdir, { recursive: true, force: true });
    // the delete in four lanes: every twinned old key removed exactly once, every twin kept, progress counted
    const ddir = mkdtempSync(join(tmpdir(), "r2-del-")), db = await T.localBackend(ddir, BUCKET);
    const dkeys = Array.from({ length: 11 }, (_, i) => renderKey("ryuklabs", sha(`del${i}`)));
    for (const k of dkeys) await db.binding.put(k, k);
    await T.copy(db, {});
    const dv = await T.verify(db, {});
    let dprog = 0;
    const dout = await T.del(db, { bucket: db.name, complete: dv.complete, listing: dv.listing, copied: {} }, { concurrency: 4, progress: () => dprog++ });
    const dafter = T.classify(await db.list());
    await db.close(); rmSync(ddir, { recursive: true, force: true });
    ok(dout.deleted === 11 && dprog === 11 && dafter.old.size === 0 && dafter.home.size === 11,
      `four lanes delete 11 old keys (deleted ${dout.deleted}, progress ${dprog}), 0 old left, 11 twins kept`);
    ok(tout.repaired === 1 && tout.conflicts.length === 0 && types["o1/" + fresh] === null && types["o1/" + wrong] === null && tver.complete === true,
      `a typeless object's twin is typeless; a same-bytes twin under the download's default type is repaired (repaired ${tout.repaired}, conflicts ${tout.conflicts.length}), and verify is complete`);
  })();

  // the live backend's requests are bounded and retried (a stalled connection once hung a live copy for two hours)
  await (async () => {
    const realFetch = globalThis.fetch, env = { CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "a", R2_TIMEOUT_MS: "200", R2_TRIES: "3" };
    const quiet = console.error; console.error = () => {};
    try {
      let n = 0;
      globalThis.fetch = async () => (++n === 1 ? new Response("<html>bad gateway</html>", { status: 502 }) : new Response("ok", { status: 200 }));
      const r1 = await T.liveBackend("b", env).get("renders/x/y");
      ok(n === 2 && r1 && new TextDecoder().decode(r1.bytes) === "ok", `a 502 is retried, then answers (${n} calls)`);
      n = 0;
      // the stall holds a live handle, as a real open socket does (AbortSignal.timeout's own timer keeps nothing alive)
      globalThis.fetch = (url, init) => (++n === 1 ? new Promise((_, no) => { const hold = setTimeout(() => {}, 5000); init.signal.addEventListener("abort", () => { clearTimeout(hold); no(Object.assign(new Error("timed out"), { name: "TimeoutError" })); }); }) : Promise.resolve(new Response("ok", { status: 200 })));
      const r2 = await T.liveBackend("b", env).get("renders/x/y");
      ok(n === 2 && r2, `a stalled request times out and is retried (${n} calls), never hangs`);
      n = 0;
      globalThis.fetch = async () => { n++; return new Response("no", { status: 503 }); };
      let threw = null; try { await T.liveBackend("b", env).get("renders/x/y"); } catch (e) { threw = e.message; }
      ok(n === 3 && /after 3 attempt/.test(threw || ""), `a request still failing after its tries throws, naming them (${n} calls)`);
      n = 0;
      globalThis.fetch = async () => { n++; return new Response("forbidden", { status: 403 }); };
      threw = null; try { await T.liveBackend("b", env).get("renders/x/y"); } catch (e) { threw = e.message; }
      ok(n === 1 && /403/.test(threw || ""), `a 403 is not retried: it throws at once (${n} call)`);
    } finally { globalThis.fetch = realFetch; console.error = quiet; }
  })();
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`${failed ? "✗" : "✓"} r2-org-keys selftest: ${checks - failed} of ${checks} checks passed`);
process.exit(failed ? 1 : 0);
