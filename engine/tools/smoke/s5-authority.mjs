// tools/smoke/s5-authority.mjs — the sprint-end review's authority findings, through the real door. Builds on s0: project
// smoke, the owner, and the member (role member since migrate-044: the lists below name "member", its role) seated on it.
//   F1 · a member cannot reveal, overwrite or remove a doc, card or card kind their role may not read, set who may read one,
//        or write a capsule; they still write an open doc and a doc open to their own role
//   F2 · read (a card, a kind's page, the kinds), GET /read (JSON and the card's page) and search hide what the role may not read
//        (D5: read and search)
//   F4 · /mcp refuses a web session cookie from another origin; the same origin and a Bearer still work
//   F5 · a key in the URL signs no one in (G2 M2): every write door answers ?k= 401, nothing written; the Bearer header still writes
import { smoke, expect, brief, s, http, mcp, html, ownerKey, BASE, kwrite, kread, sessionPath, unbased } from "./lib.mjs";

const P = "smoke";
const doc = (path, extra = {}) => ({ kind: "doc", op: "upsert", data: { path, ...extra } });
const card = (kind, id, extra = {}) => ({ kind: "card", op: "upsert", data: { kind, id, ...extra } });
// write(key, ops) -> the preview-then-file answer (kwrite); rest(key, ops) -> POST /preview, the preview's REST twin
const write = async (key, ops) => (await kwrite(key, { project: P, ops })).out;
const rest = (key, ops) => http("POST", "/preview", { key, body: { project: P, items: ops } });
const restRefusedAs = (r, code) => r.status === 200 && r.json && (r.json.items || [])[0] && r.json.items[0].verdict === "refused" && r.json.items[0].refusal && r.json.items[0].refusal.error === code;
const firstError = (out) => ((out && out.errors) || [])[0] || {};
const refusedAs = (out, code) => out && out.error === "invalid_ops" && firstError(out).error === code && firstError(out).index === 0 && /\w/.test(firstError(out).note || "");
const readDoc = async (key, path) => (await kread(key, { project: P, kind: "doc", id: path })).out;
// raw(method, path, headers, body) — a request with exactly these headers (a browser's cookie and origin, no bearer)
async function raw(method, path, headers = {}, body) {
  const r = await fetch(BASE + await sessionPath(headers.cookie, path), { method, headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
  const text = await unbased(await r.text());   // the org base off its paths (sprint 7, 7.4: lib.mjs unbased)
  let json = null; try { json = JSON.parse(text); } catch { json = null; }
  return { status: r.status, json, text };
}

smoke("F1: a member cannot reveal, overwrite or remove an owner-only doc, set who reads a doc, or write a capsule", async () => {
  const seed = await write(ownerKey, [
    doc("s5/owner-only.md", { title: "Owner only", body: "OWNER SECRET s5", roleVisibility: ["owner"] }),
    doc("s5/open.md", { title: "Open", body: "open s5" }),
    doc("s5/leaders.md", { title: "Leaders", body: "leaders s5", roleVisibility: ["member"] }),
    doc("capsules/owner.md", { title: "Owner capsule", body: "# owner capsule s5", roleVisibility: ["owner"] }),
    doc("capsules/member.md", { title: "Leader capsule", body: "# leader capsule s5" }),
  ]);
  expect(seed.written === 5, () => `seed: ${brief(seed)}`);
  const tries = {
    reveal: await write(s.member.key, [doc("s5/owner-only.md", { roleVisibility: null })]),
    overwrite: await write(s.member.key, [doc("s5/owner-only.md", { body: "planted" })]),
    overwriteRest: await rest(s.member.key, [doc("s5/owner-only.md", { body: "planted" })]),
    remove: await write(s.member.key, [{ kind: "doc", op: "remove", data: { path: "s5/owner-only.md" } }]),
    ownerCapsule: await write(s.member.key, [doc("capsules/owner.md", { body: "# planted" })]),
    openCapsule: await write(s.member.key, [doc("capsules/member.md", { body: "# planted" })]),
    newCapsule: await write(s.member.key, [doc("capsules/zz.md", { body: "# planted" })]),
    widen: await write(s.member.key, [doc("s5/leaders.md", { roleVisibility: null })]),
    narrow: await write(s.member.key, [doc("s5/open.md", { roleVisibility: ["member"] })]),
    newHidden: await write(s.member.key, [doc("s5/member-hidden.md", { body: "x", roleVisibility: ["owner"] })]),
  };
  const want = { reveal: "forbidden", overwrite: "forbidden", remove: "forbidden", ownerCapsule: "owner_only", openCapsule: "owner_only", newCapsule: "owner_only",
    widen: "owner_only", narrow: "owner_only", newHidden: "owner_only" };
  for (const [k, code] of Object.entries(want)) expect(refusedAs(tries[k], code), () => `${k}: want ${code}, got ${brief(tries[k])}`);
  expect(restRefusedAs(tries.overwriteRest, "forbidden"), () => `POST /preview: ${tries.overwriteRest.status} ${brief(tries.overwriteRest.json)}`);
  // nothing changed: the owner reads every doc back as filed; the member still cannot read the owner's
  const o = await readDoc(ownerKey, "s5/owner-only.md"), cap = await readDoc(ownerKey, "capsules/owner.md"), lcap = await readDoc(ownerKey, "capsules/member.md");
  const m = await readDoc(s.member.key, "s5/owner-only.md");
  expect(o.item && o.item.body === "OWNER SECRET s5" && JSON.stringify(o.item.roleVisibility) === '["owner"]' && cap.item.body === "# owner capsule s5" && lcap.item.body === "# leader capsule s5"
    && m.error === "not_found" && (await readDoc(ownerKey, "capsules/zz.md")).error === "not_found" && (await readDoc(ownerKey, "s5/member-hidden.md")).error === "not_found",
    () => `owner reads ${brief(o)} · capsule ${brief(cap.item)} · member ${brief(m)}`);
  const lv = await readDoc(ownerKey, "s5/leaders.md"), ov = await readDoc(ownerKey, "s5/open.md");
  expect(JSON.stringify(lv.item.roleVisibility) === '["member"]' && ov.item.roleVisibility === null, () => `lists: ${brief(lv.item)} · ${brief(ov.item)}`);
  // what a member may still do: edit an open doc and a doc open to their role (its list kept, or sent back unchanged), file a new open doc
  const ok = await write(s.member.key, [doc("s5/open.md", { body: "member edit" }), doc("s5/leaders.md", { body: "leader edit" }),
    doc("s5/leaders.md", { title: "Leaders, again", roleVisibility: ["member"] }), doc("s5/member-new.md", { body: "a member's new doc" })]);
  expect(!ok.error && ok.written === 4, () => `member's allowed writes: ${brief(ok)}`);
  const lv2 = await readDoc(ownerKey, "s5/leaders.md"), ov2 = await readDoc(ownerKey, "s5/open.md"), nv = await readDoc(s.member.key, "s5/member-new.md");
  expect(lv2.item.body === "leader edit" && lv2.item.title === "Leaders, again" && JSON.stringify(lv2.item.roleVisibility) === '["member"]' && ov2.item.body === "member edit" && nv.item && nv.item.roleVisibility === null,
    () => `after: ${brief(lv2.item)} · ${brief(ov2.item)} · ${brief(nv)}`);
  return "reveal/overwrite (MCP and POST /preview)/remove: forbidden; capsule writes and roleVisibility changes: owner_only; the owner's docs unchanged; the member edits an open doc and a leaders' doc (list kept) and files a new one";
});

smoke("F1: a member cannot reveal, overwrite or remove an owner-only card or card kind, or file into a hidden kind", async () => {
  const seed = await write(ownerKey, [
    { kind: "card_kind", op: "upsert", data: { key: "s5secret", label: "S5 secret", roleVisibility: ["owner"] } },
    card("s5secret", "c-1", { name: "Secret card", body: "OWNER CARD s5", roleVisibility: ["owner"] }),
    card("s5secret", "c-2", { name: "Secret by kind", body: "OWNER KIND CARD s5" }),   // no list of its own: its kind's hides it
    { kind: "card_kind", op: "upsert", data: { key: "s5open", label: "S5 open" } },
    card("s5open", "o-1", { name: "Open card", body: "open card s5" }),
    card("s5open", "h-1", { name: "Hidden card", body: "OWNER HIDDEN s5", roleVisibility: ["owner"] }),
  ]);
  expect(seed.written === 6, () => `seed: ${brief(seed)}`);
  const tries = {
    reveal: await write(s.member.key, [card("s5secret", "c-1", { roleVisibility: null })]),
    overwrite: await write(s.member.key, [card("s5secret", "c-1", { body: "planted" })]),
    remove: await write(s.member.key, [{ kind: "card", op: "remove", data: { kind: "s5secret", id: "c-1" } }]),
    byKind: await write(s.member.key, [card("s5secret", "c-2", { body: "planted" })]),
    intoKind: await write(s.member.key, [card("s5secret", "c-9", { name: "planted", body: "planted" })]),
    kindReveal: await write(s.member.key, [{ kind: "card_kind", op: "upsert", data: { key: "s5secret", label: "S5 secret", roleVisibility: null } }]),
    kindRemove: await write(s.member.key, [{ kind: "card_kind", op: "remove", data: { key: "s5secret" } }]),
    hidden: await write(s.member.key, [card("s5open", "h-1", { body: "planted" })]),
    widenOpen: await write(s.member.key, [card("s5open", "o-1", { roleVisibility: ["member"] })]),
  };
  const want = { reveal: "forbidden", overwrite: "forbidden", remove: "forbidden", byKind: "forbidden", intoKind: "forbidden", kindReveal: "forbidden", kindRemove: "forbidden", hidden: "forbidden", widenOpen: "owner_only" };
  for (const [k, code] of Object.entries(want)) expect(refusedAs(tries[k], code), () => `${k}: want ${code}, got ${brief(tries[k])}`);
  const cardBody = async (key, kind, id) => { const r = await kread(key, { project: P, ref: `card/${kind}/${id}` }); return r.out && r.out.item ? { text: r.out.item.body } : r.out; };
  const c1 = { out: await cardBody(ownerKey, "s5secret", "c-1") }, c2 = { out: await cardBody(ownerKey, "s5secret", "c-2") };
  const h1 = { out: await cardBody(ownerKey, "s5open", "h-1") };
  const k = (await kread(ownerKey, { project: P, kind: "card_kind", id: "s5secret" })).out;
  const c9 = (await kread(ownerKey, { project: P, kind: "card", id: "s5secret|c-9" })).out;
  const rv = (await kread(ownerKey, { project: P, kind: "card", id: "s5secret|c-1" })).out;
  expect(c1.out.text === "OWNER CARD s5" && c2.out.text === "OWNER KIND CARD s5" && h1.out.text === "OWNER HIDDEN s5" && k.item && JSON.stringify(k.item.roleVisibility) === '["owner"]'
    && c9.error === "not_found" && JSON.stringify(rv.item.roleVisibility) === '["owner"]', () => `owner reads: ${brief([c1.out, c2.out, h1.out, k, c9])}`);
  const ok = await write(s.member.key, [card("s5open", "o-1", { body: "member edit" }), card("s5open", "o-2", { name: "Member card", body: "a member's card" })]);
  expect(!ok.error && ok.written === 2, () => `member's allowed card writes: ${brief(ok)}`);
  return "reveal, overwrite, remove, a card hidden by its kind, a new card in a hidden kind, the kind's reveal and removal, a hidden card in an open kind: forbidden; a list change: owner_only; the owner reads all of it unchanged; the member edits and files open cards";
});

smoke("F2: read, GET /read and search hide a card or kind the role may not read; the owner's show it", async () => {
  const hiddenIds = ["c-1", "c-2", "h-1", "c-9"];
  const mc = {};
  for (const [kind, id] of [["s5secret", "c-1"], ["s5secret", "c-2"], ["s5open", "h-1"]]) mc[`${kind}/${id}`] = (await kread(s.member.key, { project: P, ref: `card/${kind}/${id}` })).out;
  expect(Object.values(mc).every((o) => o.error === "not_found" && !JSON.stringify(o).includes("OWNER")), () => `member read: ${brief(mc)}`);
  const gj = await http("GET", `/read?project=${P}&ref=card/s5secret/c-1`, { key: s.member.key });
  // sprint 3 D2: the card's page is on the new path (GET /read?ref=card/...); a hidden card is the usual 404 there
  const gh = await html(`/read?ref=card/s5secret/c-1&project=${P}`, s.member.key);
  const gh2 = await html(`/read?ref=card/s5open/h-1&project=${P}`, s.member.key);
  expect(gj.status === 404 && gj.json.error === "not_found" && !gj.text.includes("OWNER") && gh.status === 404 && !gh.text.includes("OWNER") && !gh.text.includes("Secret card")
    && gh2.status === 404 && !gh2.text.includes("OWNER"), () => `GET /read json ${gj.status} ${brief(gj.json)} · the card page ${gh.status} · ${gh2.status}`);
  const refsOf = (o) => ((o && o.groups) || []).flatMap((g) => g.hits || []).map((h) => h.ref);
  const f = (await mcp(s.member.key, "search", { project: P, q: "card", kinds: ["card"], limit: 25 })).out;
  const fg = await http("GET", `/search?project=${P}&q=card&kinds=card&limit=25`, { key: s.member.key });
  const fIds = refsOf(f);
  const fs = (await mcp(s.member.key, "search", { project: P, q: "secret", kinds: ["card"] })).out, fh = (await mcp(s.member.key, "search", { project: P, q: "hidden", kinds: ["card"] })).out;
  expect(fIds.includes("card/s5open/o-1") && fIds.includes("card/s5open/o-2") && !fIds.some((x) => x.startsWith("card/s5secret/") || x === "card/s5open/h-1") && JSON.stringify(refsOf(fg.json)) === JSON.stringify(fIds)
    && !refsOf(fs).length && !refsOf(fh).length && !JSON.stringify(fs).includes("OWNER"), () => `member search: ${brief(fIds)} · GET ${brief(refsOf(fg.json))} · "secret" ${brief(fs)} · "hidden" ${brief(fh)}`);
  const kinds = (await kread(s.member.key, { project: P, kind: "card_kind" })).out;
  const page = (await kread(s.member.key, { project: P, kind: "card", cardKind: "s5open" })).out;
  const secretPage = (await kread(s.member.key, { project: P, kind: "card", cardKind: "s5secret" })).out;
  const kg = await http("GET", `/read?project=${P}&kind=card_kind`, { key: s.member.key });
  expect(!(kinds.items || []).some((x) => x.key === "s5secret") && (kinds.items || []).some((x) => x.key === "s5open") && JSON.stringify(kg.json.items) === JSON.stringify(kinds.items)
    && (page.items || []).map((x) => x.id).sort().join() === "o-1,o-2" && !(secretPage.items || []).length,
    () => `member kinds: ${brief(kinds.items)} · page ${brief(page)} · secret ${brief(secretPage)}`);
  const rkCards = (await kread(s.member.key, { project: P, kind: "card", limit: 100 })).out;
  const rkOne = (await kread(s.member.key, { project: P, kind: "card", id: "s5secret|c-2" })).out;
  const rkKind = (await kread(s.member.key, { project: P, kind: "card_kind", id: "s5secret" })).out;
  const rkGet = await http("GET", `/read?project=${P}&ref=${encodeURIComponent("card/s5open/h-1")}`, { key: s.member.key });
  const cIds = (rkCards.items || []).map((c) => `${c.kind}/${c.id}`);
  expect(cIds.includes("s5open/o-1") && !cIds.some((x) => hiddenIds.some((h) => x.endsWith("/" + h))) && rkOne.error === "not_found" && rkKind.error === "not_found" && rkGet.status === 404,
    () => `member read: ${brief(cIds)} · ${brief(rkOne)} · ${brief(rkKind)} · ${rkGet.status}`);
  // the owner's doors show all of it
  const oc = (await kread(ownerKey, { project: P, ref: "card/s5secret/c-1" })).out;
  const ok = (await kread(ownerKey, { project: P, kind: "card_kind" })).out;
  const of = (await mcp(ownerKey, "search", { project: P, q: "card", kinds: ["card"], limit: 25 })).out;
  const oh = await html(`/read?ref=card/s5secret/c-1&project=${P}`);
  const ofIds = refsOf(of);
  expect(oc.item && oc.item.body === "OWNER CARD s5" && (ok.items || []).some((x) => x.key === "s5secret") && (ok.items || []).some((x) => x.key === "s5open")
    && ["card/s5secret/c-1", "card/s5open/h-1", "card/s5open/o-1"].every((x) => ofIds.includes(x)) && oh.status === 200 && oh.text.includes("OWNER CARD s5"),
    () => `owner: ${brief(oc)} · kinds ${brief(ok.items)} · search ${brief(ofIds)} · page ${oh.status}`);
  return "member: read and GET /read (JSON 404) and the card page (404) not_found; search, the kinds and a kind's page list none of it (s5secret absent, its page empty); owner: all of it";
});

smoke("F4: /mcp takes no cookie: a cookie alone and a dead bearer beside a live cookie are unauthorized, from any origin; a Bearer still works", async () => {
  // sprint 7's review (C5): the /mcp cookie anchor is gone — a bearer of our own that no longer authenticates (a signed-out session)
  // is a 401 at the door, never the seat of a cookie riding beside it (before, it fell through to the cookie: the same origin
  // answered as the cookie's seat, another origin cross_origin_session_write)
  const login = async () => {
    const r = await http("POST", "/login", { body: { email: "member@smoke.local", password: s.member.key, device: "smoke-s5" } });
    if (!r.json || !r.json.token) throw new Error(`POST /login: ${r.status} ${brief(r.json)}`);
    return r.json.token;
  };
  const live = await login(), dead = await login();
  const so = await http("POST", "/signout", { key: dead });
  expect(so.status === 200 && so.json.signedOut === true, () => `signout: ${so.status} ${brief(so.json)}`);
  const cookie = { cookie: `__Host-ar_session=${encodeURIComponent(live)}` };
  const call = (headers, method = "tools/call") => raw("POST", "/mcp", headers, method === "tools/call"
    ? { jsonrpc: "2.0", id: 1, method, params: { name: "whoami", arguments: {} } } : { jsonrpc: "2.0", id: 1, method });
  const foreign = { origin: "https://evil.example", "sec-fetch-site": "same-site" };
  const same = { origin: BASE, "sec-fetch-site": "same-origin" };
  // a cookie alone never reaches the door (the OAuth provider owns a request with no bearer): 401
  const bare = await call({ ...cookie, ...foreign });
  const unauthorized = (r) => r.json && r.json.error && r.json.error.code === -32001 && /unauthorized/.test(r.json.error.message || "") && !r.json.result;
  const viaCookieForeign = await call({ authorization: "Bearer " + dead, ...cookie, ...foreign });
  const viaCookieSame = await call({ authorization: "Bearer " + dead, ...cookie, ...same });
  const listSame = await call({ authorization: "Bearer " + dead, ...cookie, ...same }, "tools/list");
  expect(bare.status === 401 && unauthorized(viaCookieForeign) && unauthorized(viaCookieSame) && unauthorized(listSame),
    () => `cookie only ${bare.status}; a dead bearer + the cookie, foreign ${brief(viaCookieForeign.json)} · same origin ${brief(viaCookieSame.json)} · tools/list ${brief(listSame.json)}`);
  const whoOf = (r) => { try { return JSON.parse(r.json.result.content[0].text); } catch { return null; } };
  const bearerForeign = await call({ authorization: "Bearer " + s.member.key, ...foreign });
  const w2 = whoOf(bearerForeign);
  expect(w2 && w2.email === "member@smoke.local", () => `bearer ${brief(bearerForeign.json)}`);
  return "a cookie alone: 401 (the OAuth provider); a dead bearer beside a live cookie: unauthorized from any origin (tools/call and tools/list); a Bearer from anywhere: whoami answers the member";
});

smoke("F5: a key in the URL signs no one in: every write door answers ?k= 401, nothing written; the Bearer header still writes", async () => {
  const versions = async () => (await http("GET", `/versions?project=${P}`, { key: ownerKey })).json.counts.all;
  const before = await versions();
  const k = `?k=${encodeURIComponent(ownerKey)}`;
  const doors = [
    ["/versions/publish", { project: P, title: "s5 via a key in the URL", eval: true }],
    ["/versions/restore", { project: P, v: "99", eval: true }],
    ["/rank", { id: "T-00000000-000", eval: true }],
    ["/round", { qid: "Q-smoke-1", eval: true }],
    ["/respond", { eval: true }],
  ];
  const byKey = {};
  for (const [path, body] of doors) byKey[path] = await http("POST", path + k, { body });
  const bad = Object.entries(byKey).filter(([, r]) => r.status !== 401);
  expect(!bad.length, () => `a key in the URL was taken: ${bad.map(([p, r]) => `${p} ${r.status} ${brief(r.json)}`).join(" · ")}`);
  expect((await versions()) === before, "a version was made through ?k=");
  // below the gate too: 401, nothing written
  const below = [["/preview", { project: P, items: [doc("s5/by-url.md", { body: "x" })] }], ["/preview/save-knowledge", { previewId: "P-0000000000000000", items: [doc("s5/by-url.md", { body: "x" })] }],
    ["/preview/remove-knowledge", { previewId: "P-0000000000000000", items: [{ kind: "doc", op: "remove", data: { path: "s5/by-url.md" } }] }],
    ["/preview/file-contribution", { previewId: "P-0000000000000000", items: [{ contribution: { lane: "leader", kind: "note", what: "s5 by url", why: "x" } }] }], ["/grade", { project: P, checkId: "AC.none", verdict: "proven", proof: "x" }],
    ["/questions/Q-smoke-1/rule", { project: P, choice: 0 }]];
  const belowR = [];
  for (const [path, body] of below) belowR.push([path, await http("POST", path + k, { body })]);
  expect(belowR.every(([, r]) => r.status === 401) && (await readDoc(ownerKey, "s5/by-url.md")).error === "not_found", () => `below the gate: ${belowR.map(([p, r]) => `${p} ${r.status}`).join(" · ")}`);
  // the Bearer header still writes: a real publish, and every other door past its auth (its own answer, never key_in_url or 401)
  const pub = await http("POST", "/versions/publish", { key: ownerKey, body: { project: P, title: "s5 by the Bearer header" } });
  expect(pub.status === 200 && pub.json.version && pub.json.version.n === before + 1, () => `Bearer publish: ${pub.status} ${brief(pub.json)}`);
  const res = await http("POST", "/versions/restore", { key: ownerKey, body: { project: P, v: "99" } });
  expect(res.status === 404 && res.json.error === "unknown_version", () => `Bearer restore: ${res.status} ${brief(res.json)}`);
  const rest2 = [];
  for (const [path, body] of doors.slice(2)) rest2.push([path, await http("POST", path, { key: ownerKey, body })]);
  expect(rest2.every(([, r]) => r.status !== 401 && !(r.json && ["auth_required", "read_only_credential"].includes(r.json.error))), () => `Bearer: ${rest2.map(([p, r]) => `${p} ${r.status} ${brief(r.json)}`).join(" · ")}`);
  // a signed-in browser with a stray ?k= still writes (the cookie signs in; the stray key is ignored): the owner's session publishes
  const me = await http("GET", "/whoami", { key: ownerKey });
  const login = await http("POST", "/login", { body: { email: me.json.email, password: ownerKey, device: "smoke-s5b" } });
  expect(login.json && login.json.token, () => `owner sign-in: ${login.status} ${brief(login.json)}`);
  const r = await raw("POST", "/versions/publish" + k, { cookie: `__Host-ar_session=${encodeURIComponent(login.json.token)}`, origin: BASE, "sec-fetch-site": "same-origin" },
    { project: P, title: "s5 by a signed-in session" });
  expect(r.status === 200 && r.json.version && r.json.version.n === before + 2, () => `cookie + stray ?k= on /versions/publish: ${r.status} ${brief(r.json)}`);
  return `?k=: ${doors.map(([p]) => p).join(", ")} all 401, no version made; /preview, /file, /grade, /questions/:qid/rule 401; the Bearer publishes v${pub.json.version.n} and reaches every door; the owner's session with a stray ?k= publishes v${r.json.version.n}`;
});
