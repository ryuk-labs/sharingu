// tools/smoke/s29-regrade.mjs — sprint 4, R1: regrade from a page (the second video's seventh fault). Self-contained: its own
// project (r29), a flow of three screens with a page check each and a walk, all graded.
//   · 1  a change touching one screen stales its check and the walk; the flow's view counts 2 stale
//   · 2  regrade {flow} through the door: the plan names the page check to observe and the walk for a person and files
//        nothing; the confirm observes the page as the caller, files the grade with what came back, and the screen is fresh
//   · 3  the press on the page as a signed-in browser: a second change stales the next screen; its inspector and the flow's
//        view carry Regrade; the first press answers the plan as a page (nothing filed), the confirm files and sends the
//        browser back; the Impact view lists the walk still to redo, with the same press
//   · 4  a Partner is refused (the tool and the press); a read-only key is refused (POST /regrade 403; the MCP door takes no
//        read-only key at all: 401)
//   · 5  the cap: 12 ungraded page checks on one screen regrade 8 a call (more: true), then the 4 left
import { smoke, expect, brief, http, mcp, html, ownerKey, control, fileVia, readOnlyOf, BASE, sessionPath, unbased } from "./lib.mjs";

// S29_TAG: a second run on a kept worker takes a fresh project (r29<tag>)
const P = "r29" + String(process.env.S29_TAG || "").replace(/[^a-z0-9]/g, "");
const S = ["r29-a", "r29-b", "r29-c"];
const PAGES = { "r29-a": ["/home", 'data-screen="home" and the regions data-region="metrics"'], "r29-b": ["/goals", 'data-screen="goals"'], "r29-c": ["/map", 'data-screen="map"'] };
const R = {};
const file = (items, key = ownerKey) => fileVia(key, { project: P, items });
const staleOf = async (ref) => ((await mcp(ownerKey, "map", { project: P, ref })).out || {}).stale;
const flowZ = async () => ((((await http("GET", `/map?project=${P}`, { key: ownerKey })).json || {}).flows || []).find((f) => f.id === "r29-walk") || {}).z || 0;
const signIn = async (email, key) => {
  const r = await http("POST", "/login", { body: { email, password: key, device: "smoke-s29" } });
  if (!r.json || !r.json.token) throw new Error(`POST /login ${email}: ${r.status} ${brief(r.json)}`);
  return `__Host-ar_session=${encodeURIComponent(r.json.token)}`;
};
// a browser's request: its cookie and its own origin, a form body when given
async function browser(method, path, cookie, form) {
  const headers = { cookie, accept: "text/html", "sec-fetch-dest": "document", ...(method === "POST" ? { origin: BASE, "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" } : {}) };
  const r = await fetch(BASE + await sessionPath(cookie, path), { method, headers, body: form ? new URLSearchParams(form).toString() : undefined, redirect: "manual" });
  return { status: r.status, text: await unbased(await r.text()), location: await unbased(r.headers.get("location") || "") || null };   // the org base off (sprint 7, 7.4)
}
const change = async (what, screen) => {
  const f = await file([{ contribution: { lane: "code", kind: "pr", what, why: "It changes one screen of the walk.", touches: [`screen:${screen}`], proof: "node tools/smoke.mjs -> exit 0" } }]);
  const id = f.out && f.out.items && f.out.items[0].filed && f.out.items[0].filed.id;
  if (!id) throw new Error(`${f.step}: ${brief(f.out)}`);
  return id;
};

smoke("regrade · setup: r29 holds a flow of three screens, a page check on each and a walk, all graded with proof", async () => {
  await control({ action: "add-project", key: P, name: "R29" });
  const seed = [{ kind: "node", op: "upsert", data: { id: "surface:r29", type: "surface", name: "R29" } },
    ...S.map((x) => ({ kind: "node", op: "upsert", data: { id: `screen:${x}`, type: "screen", name: `R29 ${x}`, data: { surface: "r29" } } })),
    { kind: "node", op: "upsert", data: { id: "flow:r29-walk", type: "flow", name: "R29 walk", data: { steps: S.map((x) => ({ screen: x, actor: "Person", does: `opens ${x}` })) } } },
    ...S.map((x) => ({ kind: "check", op: "upsert", data: { id: `R29.${x}.loads`, kind: "screen", method: "observe", title: `R29 ${x} loads`,
      when: `GET ${PAGES[x][0]} with Accept: text/html`, then: `200 HTML holding ${PAGES[x][1]}`, refs: [`screen:${x}`] } })),
    { kind: "check", op: "upsert", data: { id: "R29.walk", kind: "flow", method: "walk", title: "R29 walked end to end", when: "1. Person opens r29-a; 2. Person opens r29-b", then: "every step answers as it says and the last one shows the result", refs: ["flow:r29-walk", "screen:r29-a", "screen:r29-b"] } }];
  const sf = await file(seed);
  expect(!sf.isError && sf.out.complete, () => `${sf.step}: ${brief(sf.out)}`);
  const g = await file([...S.map((x) => `R29.${x}.loads`), "R29.walk"].map((id) => ({ grade: { checkId: id, verdict: "proven", proof: "node tools/smoke.mjs -> exit 0, 4 of 4" } })));
  expect(!g.isError && g.out.complete, () => `${g.step}: ${brief(g.out)}`);
  await new Promise((r) => setTimeout(r, 20));
  return `${P}: 3 screens, flow r29-walk, 4 checks graded`;
});

smoke("regrade · 1 a change touching one screen stales its page check and the walk; the flow counts 2 stale", async () => {
  R.c1 = await change("R29 a change to a", "r29-a");
  const st = await staleOf("screen:r29-a"), z = await flowZ();
  expect(st && st.count === 2 && z === 2, () => `screen:r29-a stale ${brief(st)}, the flow ${z}`);
  return `${R.c1}: screen:r29-a 2 stale, the flow's view 2`;
});

smoke("regrade · 2 regrade {flow} through the door: the plan files nothing; the confirm observes the page as the caller and the screen is fresh", async () => {
  const plan = await mcp(ownerKey, "regrade", { project: P, flow: "r29-walk" });
  const o = plan.out || {};
  expect(!plan.isError && o.preview && (o.observe || []).map((c) => c.id).join() === "R29.r29-a.loads" && (o.needsProof || []).map((c) => c.id).join() === "R29.walk"
    && o.cap === 8 && o.more === false && /^preview /.test(o.call || "") && o.next && o.next.args.confirm === true, () => brief(o));
  expect((await staleOf("screen:r29-a")).count === 2, "the plan filed something");
  const done = await mcp(ownerKey, "regrade", { project: P, flow: "r29-walk", confirm: true });
  const ob = ((done.out || {}).observed || [])[0] || {};
  expect(!done.isError && done.out.counted === 1 && ob.verdict === "proven" && ob.status === 200 && /data-screen="home" present, regions 1 of 1/.test(ob.said), () => brief(done.out));
  const row = await mcp(ownerKey, "read", { project: P, ref: ob.filed });
  const item = (row.out && (row.out.item || row.out)) || {};
  expect(item.kind === "grade" && String(item.proof || "").startsWith(`GET /home?project=${P} (Accept: text/html, as the caller's key) -> 200, data-screen="home" present`), () => `the grade: ${brief(item)}`);
  const st = await staleOf("screen:r29-a"), z = await flowZ();
  expect(st && st.count === 1 && z === 1, () => `after: screen:r29-a ${brief(st)}, the flow ${z} (the walk stays, for a person)`);
  return `plan: 1 to observe, the walk for a person, nothing filed; confirm: ${ob.id} proven from GET /home (${ob.filed}); the walk alone stale`;
});

smoke("regrade · 3 the press as a signed-in browser: the inspector and the flow carry Regrade; the plan is a page; the confirm files and goes back", async () => {
  R.c2 = await change("R29 a change to b", "r29-b");
  const people = ((await http("GET", "/control/people", { key: ownerKey })).json || {}).people || [];
  const me = people.find((p) => p.you);
  R.cookie = await signIn(me.email, ownerKey);
  const insp = await browser("GET", `/map/node?ref=${encodeURIComponent("screen:r29-b")}&project=${P}`, R.cookie);
  expect(insp.status === 200 && /data-button="regrade"/.test(insp.text) && /name="node" value="screen:r29-b"/.test(insp.text), () => `the inspector: ${insp.status} ${insp.text.slice(0, 300)}`);
  const map = await browser("GET", `/map?flow=r29-walk&project=${P}`, R.cookie);
  expect(map.status === 200 && /"id":"r29-walk"[^}]*"z":2/.test(map.text), () => `the flow's view: ${map.status} ${(map.text.match(/"id":"r29-walk"[^}]*/) || [""])[0]}`);
  const next = `/map?flow=r29-walk&project=${P}`;
  const first = await browser("POST", "/regrade", R.cookie, { project: P, flow: "r29-walk", next });
  expect(first.status === 200 && /data-screen="regrade"/.test(first.text) && /data-button="regrade-confirm"/.test(first.text)
    && /data-region="observe"[\s\S]*data-check="R29\.r29-b\.loads"/.test(first.text) && /data-region="needs-proof"[\s\S]*data-check="R29\.walk"/.test(first.text), () => `the plan page: ${first.status} ${first.text.slice(0, 400)}`);
  expect((await staleOf("screen:r29-b")).count === 2, "the first press filed something");
  const go = await browser("POST", "/regrade", R.cookie, { project: P, flow: "r29-walk", next, confirm: "1" });
  expect(go.status === 303 && go.location === next, () => `the confirm: ${go.status} ${go.location} ${go.text.slice(0, 200)}`);
  const st = await staleOf("screen:r29-b"), z = await flowZ();
  expect(st && st.count === 1 && z === 1, () => `after the press: screen:r29-b ${brief(st)}, the flow ${z}`);
  const imp = await browser("GET", `/contribution/${R.c2}/impact?project=${P}`, R.cookie);
  expect(imp.status === 200 && /data-region="proof"[\s\S]*name="checks" value="R29\.walk"/.test(imp.text) && /data-check="R29\.walk" data-state="stale"/.test(imp.text), () => `the Impact view: ${imp.status} ${(imp.text.match(/data-region="proof"[\s\S]{0,600}/) || [""])[0]}`);
  return `the inspector and the flow's view carry Regrade (2 stale); the plan page lists R29.r29-b.loads and the walk, nothing filed; the confirm 303 back, 1 stale left (the walk), listed on the Impact view with its press`;
});

smoke("regrade · 4 a Partner is refused (tool and press); a read-only key is refused (POST /regrade 403, the MCP door 401)", async () => {
  const email = `s29partner${P.slice(3)}@smoke.local`;
  const add = await http("POST", "/control", { key: ownerKey, form: [["action", "add-person"], ["name", "Smoke S29 Partner"], ["email", email], ["role", "partner"], ["projectKey", P]] });
  const pkey = (add.text.match(/API key\): ([0-9a-f]{40})/) || [])[1];
  expect(add.status === 200 && pkey, `add a partner: ${add.status}`);
  const tool = await mcp(pkey, "regrade", { project: P, flow: "r29-walk", confirm: true });
  const pc = await signIn(email, pkey);
  const press = await browser("POST", "/regrade", pc, { project: P, flow: "r29-walk" });
  const ro = await http("POST", "/regrade", { key: readOnlyOf(ownerKey), body: { project: P, flow: "r29-walk", confirm: true } });
  const roTool = await http("POST", "/mcp", { key: readOnlyOf(ownerKey), body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "regrade", arguments: { project: P, flow: "r29-walk", confirm: true } } } });
  expect(tool.isError && tool.out.error === "partner_refused" && press.status === 403 && /partner_refused/.test(press.text)
    && ro.status === 403 && ro.json.error === "read_only_credential" && roTool.status === 401,
    () => `partner tool ${brief(tool.out)} · press ${press.status} ${press.text.slice(0, 120)} · read-only ${ro.status} ${brief(ro.json)} · read-only on /mcp ${roTool.status} ${roTool.text.slice(0, 120)}`);
  const st = await staleOf("screen:r29-b");
  expect(st && st.count === 1, () => `a refusal filed something: ${brief(st)}`);
  return "partner_refused by the tool and the press; read_only_credential on POST /regrade, 401 on /mcp; nothing filed";
});

smoke("regrade · 5 the cap: 12 ungraded page checks on one screen regrade 8 a call (more: true), then the 4 left", async () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ kind: "check", op: "upsert", data: { id: `R29.cap.${String(i).padStart(2, "0")}`, kind: "screen", method: "observe", title: `R29 cap ${i}`,
    when: "GET /map with Accept: text/html", then: '200 HTML holding data-screen="map"', refs: ["screen:r29-c"] } }));
  const f = await file(many);
  expect(!f.isError && f.out.complete, () => `${f.step}: ${brief(f.out)}`);
  const a = await mcp(ownerKey, "regrade", { project: P, node: "screen:r29-c", confirm: true });
  const b = await mcp(ownerKey, "regrade", { project: P, node: "screen:r29-c", confirm: true });
  const c = await mcp(ownerKey, "regrade", { project: P, node: "screen:r29-c" });
  expect(a.out.observed.length === 8 && a.out.counted === 8 && a.out.more === true && b.out.observed.length === 4 && b.out.counted === 4 && b.out.more === false
    && c.out.observe.length === 0, () => `first ${a.out.observed && a.out.observed.length} more ${a.out.more} · then ${b.out.observed && b.out.observed.length} · left ${brief(c.out.observe)}`);
  return "8 observed and counted, more: true; then 4; then nothing left";
});
