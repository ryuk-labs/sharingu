// tools/smoke/s4a-versions.mjs — slice 4a: Versions are snapshots in D1, GTM reads the filed template, the shell reads the
// version head. Builds on s0–s3: project smoke with its goal tree (ship-the-loop > file-it, see-it, prove-it-live) and the
// member seated on it; project local holds no version. A GTM template filed with preview then file draws its lanes; the owner
// publishes v1 (a member is refused); a goal renamed and a goal filed, then v2, whose diff names both; restoring v1 brings
// the old title back and removes the new goal on the very next GET /goals, and appends a restored v3; an unknown version is
// refused; the Map's version chip and every page's stamp carry the head; a project with no version names publish_version.
import { smoke, expect, brief, s, G, http, mcp, html, goalIds, ownerKey, kwrite, readTx } from "./lib.mjs";

const P = "smoke";
const region = (page, r) => (new RegExp(`data-region="${r}"[\\s\\S]*?</(?:section|aside)>`).exec(page) || [""])[0];
const GTM = { identity: { name: "smoke gtm" }, activityKinds: ["post", "demo"], fields: [], proofRule: "a link", outcomeModel: {},
  activityTemplate: { kinds: [{ kind: "post", holds: [{ field: "url" }], proofConcrete: "the post's link" }, { kind: "demo", holds: [{ field: "who" }], proofConcrete: "the recording" }] } };

smoke("a GTM template filed with preview then file shows its lanes on GET /gtm", async () => {
  const none = await http("GET", `/gtm?project=${P}`, { key: ownerKey });
  expect(none.status === 200 && none.json.template === null && (none.json.messages || []).some((m) => /preview then file, an item of kind "gtm"/.test(m)), () => `before: ${none.status} ${brief(none.json && none.json.messages)}`);
  const w = await kwrite(ownerKey, { project: P, ops: [{ kind: "gtm", op: "upsert", data: { template: GTM } }] });
  expect(!w.isError && w.out.written === 1, () => brief(w.out));
  const j = await http("GET", `/gtm?project=${P}`, { key: ownerKey });
  const lanes = ((j.json && j.json.regions && j.json.regions.lanes) || []).map((l) => l.kind);
  expect(j.status === 200 && j.json.template && j.json.template.kinds.map((k) => k.kind).join() === "post,demo" && lanes.slice(0, 2).join() === "post,demo"
    && !(j.json.messages || []).some((m) => /gtm/.test(m) && /template/i.test(m)), () => `after: ${j.status} template ${brief(j.json && j.json.template)} lanes ${lanes}`);
  const page = await html(`/gtm?project=${P}`);
  expect(page.status === 200 && /data-lane="post"/.test(page.text) && /data-lane="demo"/.test(page.text) && /the post&#39;s link|the post's link/.test(page.text), () => `page: ${page.status} ${region(page.text, "lanes").slice(0, 300)}`);
  return `before: template null, the message names preview then file kind "gtm"; after: lanes ${lanes.join(", ")}, each with what it holds`;
});

smoke("a project with no version shows the empty sentence naming publish_version", async () => {
  const j = await http("GET", "/versions?project=local", { key: ownerKey });
  expect(j.status === 200 && j.json.empty === "no_versions" && j.json.versions.length === 0 && /publish_version/.test(j.json.note || ""), () => `${j.status} ${brief(j.json)}`);
  const p = await html("/versions?project=local");
  const tl = region(p.text, "timeline");
  expect(p.status === 200 && /data-state="empty"/.test(tl) && /publish_version/.test(tl) && /Not versioned yet/.test(p.text), () => `timeline: ${tl.slice(0, 300)}`);
  const head = await http("GET", "/versions?head=1&project=local", { key: ownerKey });
  expect(head.json.n === null && head.json.empty === "no_versions", () => brief(head.json));
  return `local: empty no_versions, "${j.json.note}"; the page's timeline is EMPTY naming publish_version`;
});

smoke("publish_version by the owner makes v1; it shows on GET /versions and the versions tool", async () => {
  const w = await mcp(ownerKey, "publish_version", { project: P, title: "The smoke's first cut" });
  expect(!w.isError && w.out.version && w.out.version.n === 1 && w.out.version.cause.kind === "published" && w.out.version.counts.goal === 4 && /^T-\d{8}-\d{3}$/.test(w.out.ledger), () => brief(w.out));
  s.v1 = w.out.version;
  const j = await http("GET", `/versions?project=${P}`, { key: ownerKey });
  expect(j.status === 200 && j.json.current.n === 1 && j.json.current.title === "The smoke's first cut" && j.json.versions.length === 1 && j.json.counts.all === 1, () => `${j.status} ${brief(j.json)}`);
  const t = await mcp(ownerKey, "versions", { project: P });
  expect(!t.isError && JSON.stringify(t.out.current) === JSON.stringify(j.json.current) && JSON.stringify(t.out.versions) === JSON.stringify(j.json.versions), () => brief(t.out));
  const tx = await readTx(ownerKey, w.out.ledger, P);
  expect(tx.out.kind === "knowledge" && tx.out.what === "Published v1: The smoke's first cut", () => brief(tx.out));
  return `v1 "${w.out.version.title}" (${w.out.version.counts.goal} goals, ${w.out.version.counts.gtm} template), the versions tool equal to GET /versions, one ledger row "${tx.out.what}"`;
});

smoke("a member is refused owner_only on publish_version and restore_version", async () => {
  const pub = await mcp(s.member.key, "publish_version", { project: P, title: "not mine to make" });
  const res = await mcp(s.member.key, "restore_version", { project: P, v: "1" });
  const rest = await http("POST", "/versions/publish", { key: s.member.key, body: { project: P, title: "x" } });
  expect(pub.isError && pub.out.error === "owner_only" && res.isError && res.out.error === "owner_only" && rest.status === 403 && rest.json.error === "owner_only", () => `${brief(pub.out)} / ${brief(res.out)} / ${rest.status}`);
  const j = await http("GET", `/versions?project=${P}`, { key: ownerKey });
  expect(j.json.counts.all === 1, "a version was made");
  return "publish_version, restore_version and POST /versions/publish: owner_only; still one version";
});

smoke("a goal renamed and a goal filed, then publish_version: v2, and the diff names both", async () => {
  const w = await kwrite(ownerKey, { project: P, ops: [{ kind: "goal", op: "upsert", data: { id: "see-it", title: "see it, live" } }, G("s4a-new-goal", "ship-the-loop")] });
  expect(!w.isError && w.out.written === 2, () => brief(w.out));
  const p = await http("POST", "/versions/publish", { key: ownerKey, body: { project: P, title: "Renamed and grown" } });
  expect(p.status === 200 && p.json.version.n === 2, () => `${p.status} ${brief(p.json)}`);
  const j = await http("GET", `/versions?project=${P}`, { key: ownerKey });
  const lines = (j.json.diff && j.json.diff.lines) || [];
  const renamed = lines.find((l) => l.op === "~" && l.what === "goal" && l.ref === "see-it"), added = lines.find((l) => l.op === "+" && l.what === "goal" && l.ref === "s4a-new-goal");
  expect(j.json.current.n === 2 && j.json.diff.from === 1 && j.json.diff.to === 2 && renamed && renamed.label === "see it, live" && added
    && j.json.diff.byKind.goal.added === 1 && j.json.diff.byKind.goal.changed === 1, () => `diff ${brief(j.json.diff)}`);
  const page = await html(`/versions?project=${P}`);
  const d = region(page.text, "diff");
  expect(/Changes v1 → v2/.test(d) && /see it, live/.test(d) && d.includes("/goals/s4a-new-goal"), () => `diff region: ${d.slice(0, 400)}`);
  return `v2 "${p.json.version.title}"; the diff v1 -> v2: ${lines.map((l) => `${l.op} ${l.what} ${l.ref}`).join(" · ")}`;
});

smoke("restore_version v1: the old title is back and the new goal gone on the next GET /goals; a restored v3 is appended", async () => {
  const r = await mcp(ownerKey, "restore_version", { project: P, v: "1" });
  expect(!r.isError && r.out.restored === 1 && r.out.version.n === 3 && r.out.version.cause.kind === "restored" && r.out.version.cause.ref === "1", () => brief(r.out));
  const g = await http("GET", `/goals?project=${P}&period=all`, { key: ownerKey });
  const seeIt = (g.json.nodes || []).find((n) => n.id === "see-it");
  expect(g.status === 200 && seeIt && seeIt.title === "see it" && !(g.json.nodes || []).some((n) => n.id === "s4a-new-goal"), () => `GET /goals nodes ${brief((g.json.nodes || []).map((n) => [n.id, n.title]))}`);
  expect((await goalIds()) === "file-it,prove-it-live,see-it,ship-the-loop", "read disagrees");
  const j = await http("GET", `/versions?project=${P}&cause=restored`, { key: ownerKey });
  expect(j.json.current.n === 3 && j.json.versions.length === 1 && j.json.versions[0].cause.ref === "1" && j.json.counts.restored === 1, () => brief(j.json));
  const tx = await readTx(ownerKey, r.out.ledger, P);
  expect(tx.out.kind === "knowledge" && tx.out.what === "Restored v1 as v3", () => brief(tx.out));
  return `v3 restored from v1: see-it reads "${seeIt.title}" again and s4a-new-goal is gone, on GET /goals and read; ledger "${tx.out.what}"`;
});

smoke("an unknown version is refused, on every door", async () => {
  const t = await mcp(ownerKey, "restore_version", { project: P, v: "99" });
  const r = await http("POST", "/versions/restore", { key: ownerKey, body: { project: P, v: "99" } });
  const g = await http("GET", `/versions/99?project=${P}`, { key: ownerKey });
  expect(t.isError && t.out.error === "unknown_version" && /v1 to v3/.test(t.out.note || "") && r.status === 404 && r.json.error === "unknown_version" && g.status === 404 && g.json.error === "unknown_version",
    () => `${brief(t.out)} / ${r.status} / ${g.status}`);
  const j = await http("GET", `/versions?project=${P}`, { key: ownerKey });
  expect(j.json.counts.all === 3, "a version was made");
  return `restore_version v99: unknown_version ("${t.out.note}"); POST /versions/restore 404; GET /versions/99 404; nothing made`;
});

smoke("the shell carries the head: the Map's version chip and every page's stamp", async () => {
  const m = await html(`/map/arch?project=${P}`);
  expect(m.status === 200 && /<a class="version-chip" href="\/versions" data-button="version-chip" data-door="GET \/versions"[^>]*><span class="state-chip" data-chip="LANDED">v3 · current<\/span>/.test(m.text), () => `Map · Arch: ${m.status} ${(/<a class="version-chip"[\s\S]*?<\/a>/.exec(m.text) || [""])[0]}`);
  const g = await html(`/goals?project=${P}`);
  const head = await http("GET", `/versions?head=1&project=${P}`, { key: ownerKey });
  const stamp = (/<meta name="sharingu-served" content="([^"]+)" data-scope="smoke">/.exec(g.text) || [])[1];
  expect(head.json.n === 3 && stamp === head.json.at && /var headUrl=orgPath\('\/versions\?head=1'\)\+\(scope\?'&project='/.test(g.text) && /fetch\(headUrl,/.test(g.text) && !/project pack/.test(g.text), () => `stamp ${stamp}, head ${brief(head.json)}`);
  const local = await html("/map/arch?project=local");
  expect(/data-chip="pending">Not versioned yet</.test(local.text) && !/<meta name="sharingu-served"/.test(local.text), "local's Map shows a head");
  return `Map · Arch: "v3 · current"; /goals stamped with v3's time (${stamp}) and polling GET /versions?head=1&project=smoke; local: Not versioned yet, no stamp`;
});
