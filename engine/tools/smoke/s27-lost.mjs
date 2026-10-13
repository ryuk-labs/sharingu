// tools/smoke/s27-lost.mjs — sprint 3, G2: the auth and integrity cases the suites' cut (7fafeb61b) left with no proof anywhere
// (engine/.runs/review/agentD/LOST.md, sections 1A–1I), restored here on the door's names and the smoke's fresh org. Each case
// names the old suite ids it replaces. Self-contained: its own project (l27) and people (a member, a member seated nowhere, a
// test seat), a question and a check of its own.
//   · A  sessions and sign-in: a cookie sign-out ends the cookie (E232l); a bad bearer on POST /mcp is 401 with the OAuth
//        challenge (old AC); a removed person's key is dead (S19f); a signed-out page keeps its exact path and query in next=
//        (E232e/f)
//   · B  the read-only credential and a cross-site session on /respond and /round, each door's own guard (E258g/g2/h2/h4)
//   · C  owner-only: a member's POST /project to the org rollup (E187e); a member's form decide (E257c); a member reads
//        Control with only their own email and devices (E265b/E266c) and every admin control disabled with its reason
//        (E266b/S19g/F6)
//   · D  a reader seated nowhere naming a project on POST /grade and submit_grade is project_forbidden, nothing filed (E268b)
//   · E  no open redirect: POST /login next=/\evil.com lands on / (E232i); a decide form's next=https://evil.example stays on
//        this origin (E257a6); GET /view?src=<another site> is 400, never framed (E175b)
//   · F  write integrity: publishing a published draft is 409 already_published, nothing filed (S17k); /respond refuses typed
//        text (option_required) and an option the question lacks (unknown_option), nothing filed (S9g)
//   · G  consent: a contribution's trace is dropped at consent off and kept at traces (E194e); a wrap-up's authoredPrompts are
//        kept at traces+prompts and dropped below it (E194g)
//   · H  the ruling a decision mirrors carries the eval mark of the row it rules (E257a3)
//   · I  /profile never prints the reader's key (E246b)
import { execFileSync } from "node:child_process";
import { smoke, expect, brief, http, mcp, ownerKey, control, BASE, contribute, readOnlyOf, sessionPath, unbased, fileParts } from "./lib.mjs";

const TAG = String(process.env.S27_TAG || "").replace(/[^a-z0-9]/g, "");
const P = "l27" + TAG;
const L = {};
const keyOf = (text) => (text.match(/API key\): ([0-9a-f]{40})/) || [])[1] || null;
const invite = async (name, email, role, projects, extra = []) => {
  const r = await http("POST", "/control", { key: ownerKey, form: [["action", "add-person"], ["name", name], ["email", email], ["role", role], ["seatsChosen", "1"], ...projects.map((p) => ["projectKey", p]), ...extra] });
  const key = keyOf(r.text);
  if (!key) throw new Error(`invite ${email}: no key (HTTP ${r.status})`);
  return { key, email };
};
async function raw(method, path, headers = {}, body) {
  const r = await fetch(BASE + await sessionPath(headers.cookie, path), { method, headers: { ...(body !== undefined && typeof body !== "string" ? { "content-type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body), redirect: "manual" });
  const text = await unbased(await r.text());   // the org base off its paths (sprint 7, 7.4: lib.mjs unbased)
  let json = null; try { json = JSON.parse(text); } catch { json = null; }
  return { status: r.status, json, text, headers: r.headers };
}
const signIn = async (email, key) => {
  const r = await http("POST", "/login", { body: { email, password: key, device: "smoke-s27" } });
  if (!r.json || !r.json.token) throw new Error(`POST /login ${email}: ${r.status} ${brief(r.json)}`);
  return r.json.token;
};
const cookie = (tok) => `__Host-ar_session=${encodeURIComponent(tok)}`;
const sameSite = (tok) => ({ cookie: cookie(tok), origin: BASE, "sec-fetch-site": "same-origin" });
const crossSite = (tok) => ({ cookie: cookie(tok), origin: "https://evil.example", "sec-fetch-site": "cross-site" });
const form = (o) => new URLSearchParams(o).toString();
const FORM = { "content-type": "application/x-www-form-urlencoded" };
const ledger = async () => ((await mcp(ownerKey, "read", { project: P, kind: "contribution", limit: 100, eval: true })).out.items || []).length;
const fileVia = async (key, items, extra = {}) => {
  const pv = await mcp(key, "preview", { project: P, items, ...extra });
  expect(pv.out && pv.out.previewId, () => `preview: ${brief(pv.out)}`);
  const f = await fileParts((n, a) => mcp(key, n, a), pv.out, items, { only: "ready" });   // sprint 19: each part with its write tool
  return f.out;
};
// sql(q) -> the rows of a read on the smoke's local D1 (tools/smoke.sh sets SMOKE_D1_*; the case that needs it says so)
function sql(q) {
  const { SMOKE_D1_DB: db, SMOKE_D1_CFG: cfg, SMOKE_D1_PERSIST: persist } = process.env;
  expect(db && cfg && persist, "SMOKE_D1_* not set (tools/smoke.sh sets them)");
  const out = execFileSync("npx", ["--no-install", "wrangler", "d1", "execute", db, "--config", cfg, "--local", "--persist-to", persist, "--json", "--command", q], { encoding: "utf8" });
  return (JSON.parse(out)[0] || {}).results || [];
}

smoke("lost · setup: a project, a member, a member seated nowhere, a test seat; a check and two open questions", async () => {
  await control({ action: "add-project", key: P, name: "L27" });
  L.m = await invite("L27 Mia", `mia${TAG}@l27.local`, "member", [P]);
  L.m0 = await invite("L27 Noa", `noa${TAG}@l27.local`, "member", []);
  L.r = await invite("L27 Ray", `ray${TAG}@l27.local`, "member", [P]);   // a second member of the project: Control lists them to Mia, with no email
  await signIn(L.r.email, L.r.key);   // a device of Ray's, which Mia's Control must not list
  L.ev = await invite("L27 Test Seat", `evs${TAG}@l27.local`, "member", [P], [["eval", "1"]]);
  const f = await fileVia(ownerKey, [{ kind: "goal", op: "upsert", data: { id: "l27-root", title: "L27 root" } },
    { kind: "check", op: "upsert", data: { id: "AC.l27.1", title: "L27 check", refs: ["l27-root"] } },
    { kind: "question", op: "upsert", data: { qid: "QL271", question: "L27 left or right?", status: "open", options: [{ what: "left" }, { what: "right" }] } },
    { kind: "question", op: "upsert", data: { qid: "QL272", question: "L27 up or down?", status: "open", options: [{ what: "up" }, { what: "down" }] } }]);
  expect(f && f.complete, () => brief(f));
  return `${P}: ${L.m.email}, ${L.m0.email} (seated nowhere), ${L.ev.email} (a test seat); AC.l27.1, QL271, QL272`;
});

smoke("lost · A sessions: a cookie sign-out ends the cookie (E232l); a bad bearer on POST /mcp is 401 with the challenge (old AC); a removed person's key is dead (S19f); a signed-out page keeps its exact path and query (E232e/f)", async () => {
  const tok = await signIn(L.m.email, L.m.key);
  const w0 = (await raw("GET", "/whoami", { ...sameSite(tok), accept: "application/json" })).status;
  const so = await raw("POST", "/signout", { ...sameSite(tok), accept: "application/json" }, {});
  const w1 = (await raw("GET", "/whoami", { ...sameSite(tok), accept: "application/json" })).status;
  const bad = await raw("POST", "/mcp", { authorization: "Bearer not-a-key-anyone-holds", "content-type": "application/json", accept: "application/json, text/event-stream" }, { jsonrpc: "2.0", id: 1, method: "tools/list" });
  const challenge = bad.headers.get("www-authenticate") || "";
  const gone = await invite("L27 Gone", `gone${TAG}@l27.local`, "member", [P]);
  const before = (await http("GET", "/whoami", { key: gone.key })).status;
  const id = (((await http("GET", "/control/people?all=1", { key: ownerKey })).json || {}).people || []).find((p) => p.email === gone.email)?.id;
  const rm = await control({ action: "remove-person", personId: id });
  const after = (await http("GET", "/whoami", { key: gone.key })).status;
  const mcpAfter = (await raw("POST", "/mcp", { authorization: "Bearer " + gone.key, "content-type": "application/json", accept: "application/json" }, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } })).text;
  const nav = await raw("GET", "/audit?limit=5&kind=ruling", { accept: "text/html", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" });
  const loc = nav.headers.get("location") || "";
  expect(w0 === 200 && so.json && so.json.signedOut === true && w1 === 401 && bad.status === 401 && /Bearer/i.test(challenge) && before === 200 && rm.status === 200 && after === 401
    && !/"person"/.test(mcpAfter) && nav.status === 302 && loc === "/login?next=" + encodeURIComponent("/audit?limit=5&kind=ruling"),
    () => `cookie whoami ${w0} -> signout ${so.status} ${brief(so.json)} -> ${w1} · bad bearer /mcp ${bad.status} "${challenge}" · removed key ${before} -> ${after} (mcp ${mcpAfter.slice(0, 80)}) · signed-out ${nav.status} ${loc}`);
  return `a cookie session: ${w0}, signed out (${so.json.signedOut}), then ${w1}; a bad bearer on /mcp ${bad.status} with "${challenge.slice(0, 40)}"; a removed key ${before} -> ${after}; signed out to ${loc}`;
});

smoke("lost · B the read-only credential and a cross-site session are refused on /respond and /round, each door's own guard (E258g, E258g2, E258h2, E258h4)", async () => {
  const n0 = await ledger();
  const ro = readOnlyOf(L.m.key), tok = await signIn(L.m.email, L.m.key);
  const r = {};
  r.roRespond = await http("POST", "/respond", { key: ro, body: { qid: "QL271", option: 0, project: P } });
  r.roRound = await http("POST", "/round", { key: ro, body: { qid: "QL271", project: P } });
  r.xRespond = await raw("POST", "/respond", { ...crossSite(tok), accept: "application/json" }, { qid: "QL271", option: 0, project: P });
  r.xRound = await raw("POST", "/round", { ...crossSite(tok), accept: "application/json" }, { qid: "QL271", project: P });
  const n1 = await ledger();
  const ok = (x, code, err) => x.status === code && x.json && x.json.error === err;
  expect(ok(r.roRespond, 403, "read_only_credential") && ok(r.roRound, 403, "read_only_credential") && ok(r.xRespond, 403, "cross_origin_session_write") && ok(r.xRound, 403, "cross_origin_session_write") && n1 === n0,
    () => `${Object.entries(r).map(([k, v]) => `${k} ${v.status} ${brief(v.json)}`).join(" · ")} · ledger ${n0} -> ${n1}`);
  return `the read-only credential: /respond ${r.roRespond.status}, /round ${r.roRound.status}; a cross-site session: /respond ${r.xRespond.status}, /round ${r.xRound.status}; nothing filed`;
});

smoke("lost · C owner-only: a member's org rollup (E187e) and form decide (E257c) are refused; a member reads Control with only their own email and devices (E265b/E266c), every admin control disabled with its reason (E266b/S19g/F6)", async () => {
  const roll = await http("POST", "/project", { key: L.m.key, body: { key: "" } });
  // a contribution that waits for the owner (a vendor change), then the member's form decide
  const w = await contribute(L.m.key, { project: P, lane: "vendor", kind: "scope", what: "L27 a vendor change", why: "it waits for the owner", touches: ["vendor:l27"] });
  L.wait = w.out && w.out.id;
  const fd = await raw("POST", `/contribution/${L.wait}/decide`, { authorization: "Bearer " + L.m.key, ...FORM }, form({ verdict: "approve", note: "not mine to decide" }));
  const row = (await mcp(ownerKey, "read", { project: P, ref: L.wait })).out.item || {};
  const ppl = (await http("GET", "/control/people", { key: L.m.key })).json || {};
  const others = (ppl.people || []).filter((p) => p.id !== (ppl.reader || {}).id);
  const mine = (ppl.people || []).find((p) => p.id === (ppl.reader || {}).id) || {};
  const keys = (ppl.keys || []).map((k) => k.person);
  const page = await raw("GET", "/control", { authorization: "Bearer " + L.m.key, accept: "text/html" });
  const btns = page.text.match(/<button[^>]*data-door="POST \/control"[^>]*>/g) || [];
  const why = (/<p class="ct-why" id="ct-why">([^<]+)<\/p>/.exec(page.text) || [])[1] || "";
  expect(roll.status === 403 && roll.json.error === "owner_only" && L.wait && w.verdict === "waits_for_owner" && fd.status === 403 && !row.decision
    && mine.email === L.m.email && others.length > 0 && others.every((p) => p.email == null) && keys.every((k) => k === mine.id)
    && page.status === 200 && btns.length > 0 && btns.every((b) => /\sdisabled[\s>]/.test(b)) && /admin/i.test(why),
    () => `rollup ${roll.status} ${brief(roll.json)} · ${L.wait} ${w.verdict} · decide form ${fd.status} (row ${row.decision || "undecided"}) · others ${others.length} · own email ${mine.email} · others' emails ${others.map((p) => p.email).join(",")} · keys ${keys} · page ${page.status} ${btns.length} control(s), ${btns.filter((b) => !/\sdisabled[\s>]/.test(b)).length} enabled, why "${why}"`);
  return `rollup ${roll.status}; a member's form decide ${fd.status}, the row undecided; Control: own email only (${others.length} others, none with an email), own devices only; ${btns.length} admin control(s), all disabled ("${why.slice(0, 60)}")`;
});

smoke("lost · D a reader seated nowhere naming a project on POST /grade and submit_grade is project_forbidden, nothing filed (E268b)", async () => {
  const n0 = await ledger();
  const rest = await http("POST", "/grade", { key: L.m0.key, body: { project: P, checkId: "AC.l27.1", verdict: "proven", proof: "npm test -> exit 0" } });
  const tool = await mcp(L.m0.key, "submit_grade", { project: P, checkId: "AC.l27.1", verdict: "proven", proof: "npm test -> exit 0" });
  const n1 = await ledger();
  expect(rest.status === 403 && rest.json.error === "project_forbidden" && tool.out && tool.out.error === "project_forbidden" && n1 === n0,
    () => `REST ${rest.status} ${brief(rest.json)} · tool ${brief(tool.out)} · ledger ${n0} -> ${n1}`);
  return `POST /grade ${rest.status} project_forbidden; submit_grade project_forbidden; nothing filed`;
});

smoke("lost · E no open redirect: POST /login next=/\\evil.com lands on / (E232i); a decide form's next=https://evil.example stays here (E257a6); GET /view?src=<another site> is 400 (E175b)", async () => {
  const me = (await http("GET", "/whoami", { key: L.m.key })).json || {};
  const lg = await raw("POST", "/login", FORM, form({ email: me.email || L.m.email, password: L.m.key, web: "1", next: "/\\evil.com" }));
  const lg2 = await raw("POST", "/login", FORM, form({ email: me.email || L.m.email, password: L.m.key, web: "1", next: "//evil.com/x" }));
  const w2 = await contribute(L.m.key, { project: P, lane: "vendor", kind: "scope", what: "L27 another vendor change", why: "for the redirect case", touches: ["vendor:l27b"] });
  const dc = await raw("POST", `/contribution/${w2.out.id}/decide`, { authorization: "Bearer " + ownerKey, ...FORM }, form({ verdict: "needs-work", note: "s27", next: "https://evil.example/landing" }));
  const v1 = await raw("GET", "/view?src=" + encodeURIComponent("https://evil.example/x.html"), { authorization: "Bearer " + ownerKey, accept: "application/json" });
  const v2 = await raw("GET", "/view?src=" + encodeURIComponent("//evil.example/x.html"), { authorization: "Bearer " + ownerKey, accept: "application/json" });
  // sprint 7, 7.4: a sign-in with no safe next lands on its org's own root, /<org> (read here as "/": lib.mjs unbased)
  const l1 = await unbased(lg.headers.get("location") || ""), l2 = await unbased(lg2.headers.get("location") || ""), ld = dc.headers.get("location") || "";
  const here = (l) => l.startsWith("/") && !l.startsWith("//") && !/evil/.test(l);
  expect(lg.status === 302 && l1 === "/" && lg2.status === 302 && l2 === "/" && dc.status === 302 && here(ld) && v1.status === 400 && v1.json.error === "bad_src" && v2.status === 400,
    () => `login /\\evil.com ${lg.status} ${l1} · //evil.com ${lg2.status} ${l2} · decide ${dc.status} ${ld} · view ${v1.status} ${brief(v1.json)} / ${v2.status}`);
  return `sign-in with next=/\\evil.com -> ${l1}, //evil.com -> ${l2}; the decide form's off-site next -> ${ld}; /view of another site ${v1.status}, of //evil ${v2.status}`;
});

smoke("lost · F write integrity: a published draft published again is 409 already_published, nothing filed (S17k); /respond refuses typed text and an option the question lacks, nothing filed (S9g)", async () => {
  const draft = await contribute(L.m.key, { project: P, lane: "leader", kind: "item", what: `l27-kit${TAG}`, why: "a kit to publish", touches: "skill", gapRefs: [`item/l27-kit${TAG}`], proof: "https://src.example/l27" });
  const id = draft.out && draft.out.id;
  const p1 = await http("POST", "/broadcast/publish", { key: L.m.key, body: { id, confirm: true } });
  const n0 = await ledger();
  const p2 = await http("POST", "/broadcast/publish", { key: L.m.key, body: { id, confirm: true } });
  const text = await http("POST", "/respond", { key: L.m.key, body: { qid: "QL272", answer: "up, in my own words", project: P } });
  const nine = await http("POST", "/respond", { key: L.m.key, body: { qid: "QL272", option: 9, project: P } });
  const n1 = await ledger();
  expect(id && p1.status === 200 && p2.status === 409 && p2.json.error === "already_published" && text.status === 422 && text.json.error === "option_required"
    && nine.status === 422 && nine.json.error === "unknown_option" && n1 === n0,
    () => `draft ${id} · publish ${p1.status} ${brief(p1.json)} · again ${p2.status} ${brief(p2.json)} · typed ${text.status} ${brief(text.json)} · option 9 ${nine.status} ${brief(nine.json)} · ledger ${n0} -> ${n1}`);
  return `publish ${p1.status}, again ${p2.status} already_published; /respond typed text ${text.status} option_required, option 9 ${nine.status} unknown_option; nothing filed`;
});

smoke("lost · G consent: a trace is dropped at consent off and kept at traces (E194e); a wrap-up's authoredPrompts are kept at traces+prompts and dropped below it (E194g)", async () => {
  const art = await mcp(L.m.key, "save_file", { content: "<p>a session trace</p>", title: "l27 trace", group: "trace-notes" });
  const tid = art.out && art.out.id;
  const consent = (c) => http("POST", "/profile", { key: L.m.key, body: { consent: c } });
  const c0 = await consent("off");
  const off = await contribute(L.m.key, { project: P, lane: "leader", kind: "note", what: "L27 with a trace, consent off", why: "E194e", touches: ["decisions"], trace: tid });
  const c1 = await consent("traces");
  const on = await contribute(L.m.key, { project: P, lane: "leader", kind: "note", what: "L27 with a trace, consent traces", why: "E194e", touches: ["decisions"], trace: tid });
  const rowOf = async (id) => ((await mcp(ownerKey, "read", { project: P, ref: id })).out || {}).item || {};
  const [rOff, rOn] = [await rowOf(off.out.id), await rowOf(on.out.id)];
  // authoredPrompts is the REST door's sanctioned field (POST /wrap-up; the MCP wrap_up refuses it as transcript_rejected)
  const wrap = async () => (await http("POST", "/wrap-up", { key: L.m.key, body: { project: P, summary: "l27 wrap", authoredPrompts: ["my own prompt"] } })).json || {};
  const wLow = await wrap();
  const c2 = await consent("traces+prompts");
  const wFull = await wrap();
  await consent("off");
  expect(c0.status === 200 && c1.status === 200 && c2.status === 200 && tid && rOff.trace == null && rOn.trace === tid
    && /authoredPrompts dropped/.test(wLow.note || "") && wFull.filed === true && !/authoredPrompts dropped/.test(wFull.note || ""),
    () => `consent ${c0.status}/${c1.status}/${c2.status} · trace off ${rOff.trace} on ${rOn.trace} (want ${tid}) · wrap at traces "${wLow.note}" · at traces+prompts "${wFull.note || ""}" filed ${wFull.filed}`);
  return `a trace at consent off: dropped (the row holds none); at traces: kept; authoredPrompts at traces: dropped, said; at traces+prompts: kept`;
});

smoke("lost · H the ruling a decision mirrors carries the eval mark of the row it rules (E257a3)", async () => {
  const t = await fileVia(L.ev.key, [{ contribution: { lane: "vendor", kind: "scope", what: "L27 a test seat's vendor change", why: "E257a3", touches: ["vendor:l27e"] } }], { eval: true });
  const id = ((t.items || [])[0] || {}).filed && t.items[0].filed.id;
  const d = await http("POST", `/contribution/${id}/decide`, { key: ownerKey, body: { verdict: "approve", note: "s27 E257a3" } });
  const ev = sql(`SELECT json_extract(payload_json, '$.eval') AS ev, project FROM events WHERE kind = 'ruling' AND json_extract(payload_json, '$.transmissionId') = '${id}'`);
  const real = await contribute(L.m.key, { project: P, lane: "vendor", kind: "scope", what: "L27 a real vendor change", why: "E257a3 control", touches: ["vendor:l27r"] });
  await http("POST", `/contribution/${real.out.id}/decide`, { key: ownerKey, body: { verdict: "approve", note: "s27 real" } });
  const rv = sql(`SELECT json_extract(payload_json, '$.eval') AS ev FROM events WHERE kind = 'ruling' AND json_extract(payload_json, '$.transmissionId') = '${real.out.id}'`);
  expect(id && d.status === 200 && ev.length === 1 && (ev[0].ev === 1 || ev[0].ev === true) && rv.length === 1 && !rv[0].ev,
    () => `eval row ${id} decided ${d.status} ${brief(d.json)} · its ruling ${JSON.stringify(ev)} · a real row's ruling ${JSON.stringify(rv)}`);
  return `${id} (a test seat's, eval-marked) approved: its mirrored ruling is eval-marked; a real row's ruling is not`;
});

smoke("lost · I /profile never prints the reader's key (E246b)", async () => {
  const page = await raw("GET", "/profile", { authorization: "Bearer " + L.m.key, accept: "text/html" });
  const tok = await signIn(L.m.email, L.m.key);
  const viaCookie = await raw("GET", "/profile", { ...sameSite(tok), accept: "text/html" });
  expect(page.status === 200 && !page.text.includes(L.m.key) && viaCookie.status === 200 && !viaCookie.text.includes(L.m.key) && !viaCookie.text.includes(tok),
    () => `bearer ${page.status} key shown ${page.text.includes(L.m.key)} · cookie ${viaCookie.status} key ${viaCookie.text.includes(L.m.key)} token ${viaCookie.text.includes(tok)}`);
  return "/profile by a Bearer and by a session cookie: neither the key nor the session token in the page";
});
