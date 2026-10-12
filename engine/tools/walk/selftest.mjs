// tools/walk/selftest.mjs — the live walk's own logic, offline (no worker, no network, under a second):
//   · the name table: every tool the walk calls resolves from a tools/list fixture (fixtures/tools-list.json, the door's
//     answer to the admin and to a seated member); a missing tool, or one only on the wrong person's list, fails WITH ITS NAME;
//     every tool name and REST path the walk uses is in the generated contract (contracts/door.json);
//   · redaction: no key, read-only credential, session token, bearer header or cookie survives into a transcript, plain,
//     URL-encoded or nested; an allowed commit sha does;
//   · the input: the sample repo, brief, screenshot and discussion read into the items the walk files;
//   · --preview: only a worker's version preview URL is walked (ship.sh's walk before any traffic moves);
//   · --operator-config (the sprint-7 review, D6): the throwaway accounts are removed only on --live and only when --confirm-live
//     names the config's own D1; the clean-up calls tools/operator.mjs removeAccount for each of its two people and its verdict
//     holds it (the source read: an account NOT removed fails the clean-up).
//   node tools/walk/selftest.mjs   (exit 0 when every case holds)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS, ROUTES, resolveTools, missingLine, redact, readOnlyOf, isLocalUrl, isPreviewUrl, keyFromFile, rowsOf, pageOf, pngSize, operatorRefusal,
  readRepo, readBrief, readDiscussion, readPatch, inputItems, FIXTURES } from "../live-walk.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { const d = await fn(); pass++; console.log(`  ✓ ${name}${d ? ` — ${d}` : ""}`); }
  catch (e) { fail++; console.log(`  ✗ ${name} — ${e.message}`); }
};
const ok = (c, m) => { if (!c) throw new Error(m); };

const lists = JSON.parse(readFileSync(join(FIXTURES, "tools-list.json"), "utf8"));
const contract = JSON.parse(readFileSync(join(REPO, "contracts", "door.json"), "utf8"));

console.log("live-walk selftest");
await t("the name table resolves every tool the walk calls from the tools/list fixture", () => {
  const { names, missing } = resolveTools(lists);
  ok(!missing.length, `missing: ${missingLine(missing)}`);
  ok(Object.keys(names).length === Object.keys(TOOLS).length, "a role resolved to nothing");
  return `${Object.keys(names).length} roles resolved (admin list ${lists.admin.length}, member list ${lists.member.length})`;
});
await t("a tool missing from tools/list fails with its name", () => {
  const cut = { admin: lists.admin.filter((n) => n !== "pick_up"), member: lists.member.filter((n) => n !== "search") };
  const { missing } = resolveTools(cut);
  const line = missingLine(missing);
  ok(missing.length === 2 && /pick_up/.test(line) && /search/.test(line) && /admin/.test(line) && /member/.test(line), `got: ${line}`);
  return line;
});
await t("a tool only on the wrong person's list is missing (create_project must be on the admin's)", () => {
  const { missing } = resolveTools({ admin: lists.admin.filter((n) => n !== "create_project"), member: [...lists.member, "create_project"] });
  ok(missing.length === 1 && missing[0].name === "create_project" && missing[0].holder === "admin", JSON.stringify(missing));
});
await t("a renamed tool (the D5 case) fails until the table says the new name", () => {
  const renamed = { admin: lists.admin.map((n) => (n === "missing" ? "checklist_next" : n)), member: lists.member.map((n) => (n === "missing" ? "checklist_next" : n)) };
  const before = resolveTools(renamed).missing.map((m) => m.name);
  const table = { ...TOOLS, checklist: { ...TOOLS.checklist, name: "checklist_next" } };
  const after = resolveTools(renamed, table).missing;
  ok(before.join() === "missing" && !after.length, `before ${before} after ${JSON.stringify(after)}`);
});
await t("every tool name and REST path the walk uses is in the generated contract", () => {
  const tools = new Set(contract.tools.map((x) => x.name));
  const paths = new Set(contract.rest.map((r) => r.path));
  const badT = Object.values(TOOLS).map((x) => x.name).filter((n) => !tools.has(n));
  const badR = Object.values(ROUTES).map((p) => p.replace(/\{(\w+)\}/g, ":$1")).filter((p) => !paths.has(p));
  ok(!badT.length && !badR.length && paths.has("/mcp"), `not in contracts/door.json: tools ${badT.join(", ") || "none"}, paths ${badR.join(", ") || "none"}`);
  return `${Object.keys(TOOLS).length} tools, ${Object.keys(ROUTES).length} paths`;
});

const KEY = "0123456789abcdef0123456789abcdef01234567", OTHER = "fedcba9876543210fedcba9876543210fedcba98", SHA = "3f9c2a7e1b0d4c55aa21e8f0c6b7d9e2a1f30b44";
await t("redaction: no key, read-only credential, session, bearer or cookie leaks, plain, encoded or nested; an allowed sha stays", () => {
  const ro = readOnlyOf(KEY), session = "sess_" + "x".repeat(30);
  const v = { flash: `their ONE secret (web login password AND API key): ${KEY} — copy it now`, url: `/setup?k=${encodeURIComponent(KEY)}`,
    headers: { authorization: `Bearer ${KEY}`, cookie: `__Host-ar_session=${session}; other=1` }, ro, deep: [[{ again: `key ${OTHER} and ro ${ro}` }]],
    token: session, html: `<code>Bearer abc.def-ghi</code>`, commit: SHA, plain: "nothing secret here" };
  const out = JSON.stringify(redact(v, [KEY, ro, session], [SHA]));
  for (const s of [KEY, ro, session, OTHER, "abc.def-ghi"]) ok(!out.includes(s), `leaked ${s.slice(0, 8)}…: ${out.slice(0, 300)}`);
  ok(out.includes(SHA) && out.includes("nothing secret here") && /<redacted>/.test(out) && /<key>/.test(out), out.slice(0, 300));
  ok(!JSON.stringify(redact({ c: SHA })).includes(SHA), "an unallowed 40-hex value is kept");
  return "4 secrets and a stray 40-hex key replaced; the commit sha and plain text kept";
});
await t("the small helpers: a local URL, a key from a creds file or a bare key file, the d1-rows header, a page's flash", () => {
  ok(isLocalUrl("http://127.0.0.1:8870") && isLocalUrl("http://localhost:1") && !isLocalUrl("https://agent.ryuklabs.io") && !isLocalUrl("http://100.123.204.41:8870"), "isLocalUrl");
  ok(keyFromFile(`X=1\nWALK_ORG_AGENT_R_OWNER_KEY=${KEY}\n`) === KEY && keyFromFile(`${KEY}\n`) === KEY && keyFromFile("nope") === null, "keyFromFile");
  const r = rowsOf('d1;dur=1, d1-rows;dur=0;desc="read=12 written=3 stmts=4 unknown=1", total;dur=3');
  ok(r && r.read === 12 && r.written === 3 && r.stmts === 4 && r.unknown === 1 && rowsOf("total;dur=1") === null, JSON.stringify(r));
  const p = pageOf(`<!doctype html><html><head><title>x</title></head><body><script>var k=1</script><p class="flash-value">Seat granted.</p><main>hi</main></body></html>`);
  ok(p.flash === "Seat granted." && !/var k/.test(p.body) && /<main>hi<\/main>/.test(p.body), JSON.stringify(p));
});
await t("the input: the repo's routes and tests, the brief, the discussion and the patch read as the walk files them", async () => {
  const repo = await readRepo(), brief = readBrief(), talk = readDiscussion(), patch = readPatch();
  ok(repo.screens.map((s) => s.id).join() === "screen:home,screen:pricing,screen:checkout" && repo.doors.map((d) => d.id).join() === "door:get-api-prices,door:post-api-orders"
    && repo.tables.map((x) => x.id).join() === "table:prices,table:orders" && repo.checks.length === 3 && repo.checks[0].refs.join() === "screen:pricing,annual-plan"
    && repo.edges.some((e) => e.from === "screen:pricing" && e.to === "door:get-api-prices" && e.kind === "depends") && repo.edges.filter((e) => e.kind === "nav").length === 2, JSON.stringify(repo).slice(0, 300));
  ok(brief.aim && brief.measure && brief.measure.value === 40 && brief.goals.map((g) => `${g.id}<${g.parent}`).join() === "tea-shop-live<null,annual-plan<tea-shop-live,fast-checkout<tea-shop-live"
    && brief.startHere.path === "start-here.md" && /Home, Pricing and Checkout/.test(brief.startHere.body), JSON.stringify(brief).slice(0, 300));
  ok(talk.length === 3 && talk[0].choice === null && talk[0].options.length === 2 && talk[1].choice === 0 && talk[2].choice === null, JSON.stringify(talk));
  ok(patch.commit === SHA && /annual plan first/.test(patch.what) && /->\s*2 passing/.test(patch.proof) && /Review the annual plan copy/.test(patch.next) && repo.fileToScreen[patch.files[0]] === "screen:pricing", JSON.stringify(patch));
  const { all, items } = await inputItems({ imageItem: { kind: "render", op: "upsert", data: { screen: "screen:x", variant: "screenshot", format: "image", body: "", width: 1, height: 1 } } });
  const png = readFileSync(join(FIXTURES, "screenshot-pricing.png"));
  const pic = items.screenshot[0].data;
  ok(all.every((x) => x.kind && x.op === "upsert" && x.data) && pic.screen === "screen:pricing" && Buffer.from(pic.body, "base64").equals(png) && pic.width === 240 && pic.height === 150 && pngSize(png).width === 240,
    JSON.stringify({ ...pic, body: pic.body.length }));
  ok(items.discussion[1].data.status === "decided" && items.discussion[1].data.choice === 0 && items.discussion[0].data.affects.join() === "screen:pricing", JSON.stringify(items.discussion));
  return `${all.length} items: repo ${items.repo.length}, brief ${items.doc.length}, screenshot 1 (${png.length} bytes, 240x150), discussion ${items.discussion.length}`;
});

await t("--preview takes a worker's version preview URL only (ship.sh's walk before any traffic moves)", () => {
  const yes = ["https://bbbbbbbb-ryuklabs-agent-r.stubsub.workers.dev", "https://0a1b2c3d-ryuklabs-agent-r.ryuk.workers.dev/"];
  const no = ["https://agent.ryuklabs.io", "https://ryuklabs-agent-r.ryuk.workers.dev", "http://bbbbbbbb-ryuklabs-agent-r.stubsub.workers.dev", "https://bbbbbbbz-ryuklabs-agent-r.stubsub.workers.dev",
    "https://bbbbbbbb-ryuklabs-agent-r.stubsub.workers.dev/home", "https://bbbbbbbb-ryuklabs-agent-r.stubsub.workers.dev.evil.io", "http://127.0.0.1:8870", "not a url"];
  const bad = [...yes.filter((u) => !isPreviewUrl(u)), ...no.filter((u) => isPreviewUrl(u))];
  ok(!bad.length, `misjudged: ${bad.join(", ")}`);
  return `${yes.length} preview URLs taken, ${no.length} refused (the production route, workers.dev without the version, http, a path, a lookalike host, local)`;
});

await t("--operator-config removes the throwaway accounts on --live only, with --confirm-live naming the config's D1 (D6)", () => {
  const cfg = { d1_databases: [{ database_name: "ryuklabs-agent-r", database_id: "00000000-0000-0000-0000-000000000000" }] };
  const cases = [
    [{ live: true, config: "wrangler.jsonc", confirm: "ryuklabs-agent-r" }, cfg, ""],
    [{ live: false, config: "wrangler.jsonc", confirm: "ryuklabs-agent-r" }, cfg, "needs --live"],
    [{ live: true, config: "wrangler.jsonc", confirm: "prod" }, cfg, "must name the D1 database"],
    [{ live: true, config: "wrangler.jsonc" }, cfg, "must name the D1 database"],
    [{ live: true, confirm: "ryuklabs-agent-r" }, null, "without --operator-config"],
    [{ live: true, config: "x.jsonc", confirm: "x" }, {}, "no D1 database"],
    [{ live: true }, null, ""],
  ];
  const bad = cases.filter(([o, c, want]) => (want ? !operatorRefusal(o, c).includes(want) : operatorRefusal(o, c) !== ""));
  ok(!bad.length, `misjudged: ${bad.map(([o]) => JSON.stringify(o)).join(" · ")}`);
  const src = readFileSync(join(HERE, "..", "live-walk.mjs"), "utf8");
  ok(/await OPS\.removeAccount\(OPS\.DB, p\.email\)/.test(src) && /if \(r\.refused\) \{ accountsGone = false;/.test(src) && /const same = swept && measuresSame && accountsGone &&/.test(src),
    "the clean-up does not call removeAccount for each person, or its verdict ignores a refusal");
  return `${cases.length} flag sets judged; the clean-up removes each person's account and fails on a refusal`;
});

console.log(`${fail ? "✗" : "✓"} live-walk selftest: ${pass} of ${pass + fail}`);
process.exit(fail ? 1 : 0);
