// tools/smoke/s6-control.mjs — Control, simple, and profiles with hats (sprint 2; the owner's MCQ of 2026-09-30 evening:
// roles Admin · Member · Partner and a person's hats; the owner's MCQ of 2026-10-01, migrate-045: the ADMIN sets the hats that
// unlock briefings and cards, a person's own hats only shape their Home), through the real door. Builds on s0: project
// smoke, the owner and the member.
//   C1 · Invite through POST /control: a partner and a member, each with the seats Invite named (the partner's access hat
//        their role's); the one-time secret rides that answer only
//   C2 · POST /profile set-profile saves a person's OWN hats; a read-only credential, a key in the URL and a hat outside
//        the seven are refused, nothing saved
//   C3 · a hat a member picks on their profile never opens a briefing (a capsule, a doc, a card kind); the admin's access
//        hat does, both ways, and the default capsule follows it; a Partner likewise
//   C6 · set-access-hats is the admin's alone: a member, a read-only credential and a key in the URL are refused, a hat
//        outside the seven is "Nothing done", nothing changes
//   C4 · a Partner sees only the projects they are seated on: another project is project_forbidden, Control lists only the
//        people of their projects, Home names only themselves when no project is in scope, and Broadcast publish is refused
//   C5 · set-role moves a person between member and partner and back
//   C1 also walks Connect (sprint 9, 9.2): its FIRST client row is the Claude Code plugin — the two commands with the install
//        id the repo's own files make (plugin.json's name @ marketplace.json's name), no address (the plugin carries its own,
//        plugin/.mcp.json) and no key; the key-based `claude mcp add` row stays after it
//   C1 also pins Connect's two app ways in (sprint 12, 12.1), exactly: the rows in order plugin · Claude · ChatGPT · key · Codex;
//        Claude's row an "Add to Claude" link button to Claude's documented prefilled install link (this connector's name and
//        this worker's /mcp), ChatGPT's an "Add to ChatGPT" link button to its plugins page and the three steps beside it; both
//        open in a new tab
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { smoke, expect, brief, s, http, mcp, html, control, readOnlyOf, ownerKey, BASE, kwrite, kread, sessionPath, unbased } from "./lib.mjs";
import { REPO, PLUGIN_DIR, DIST_REPO } from "../make-plugin-skills.mjs";

const P = "smoke", Q = "smoke-b";
const people = async (key = ownerKey) => ((await http("GET", "/control/people", { key })).json || {});
const who = (j, email) => ((j.people || []).find((p) => p.email === email) || null);
const keyOf = (text) => (text.match(/API key\): ([0-9a-f]{40})/) || [])[1] || null;
const invite = async (fields) => {
  const r = await http("POST", "/control", { key: ownerKey, form: fields });
  return { r, key: keyOf(r.text) };
};
// raw(method, path, headers, body) — a request with exactly these headers (a browser's cookie and origin, no bearer)
async function raw(method, path, headers = {}, body) {
  const r = await fetch(BASE + await sessionPath(headers.cookie, path), { method, headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
  const text = await unbased(await r.text());   // the org base off its paths (sprint 7, 7.4: lib.mjs unbased)
  let json = null; try { json = JSON.parse(text); } catch { json = null; }
  return { status: r.status, json, text };
}
const setHats = (key, hats) => http("POST", "/profile", { key, body: { action: "set-profile", hats } });

smoke("C1: Invite through POST /control seats a partner and a member on the projects named; the secret rides that answer once", async () => {
  const add = await control({ action: "add-project", key: Q, name: "Smoke B" });
  expect(add.status === 200, `add-project ${Q}: ${add.status}`);
  const pa = await invite([["action", "add-person"], ["name", "Smoke Partner"], ["email", "partner@smoke.local"], ["role", "partner"], ["projectKey", P]]);
  const hm = await invite([["action", "add-person"], ["name", "Smoke Hat"], ["email", "hat@smoke.local"], ["role", "member"], ["projectKey", P], ["projectKey", Q]]);
  const ob = await invite([["action", "add-person"], ["name", "Smoke OnlyB"], ["email", "onlyb@smoke.local"], ["role", "member"], ["projectKey", Q]]);
  const lo = await invite([["action", "add-person"], ["name", "Smoke Loner"], ["email", "loner@smoke.local"], ["role", "partner"]]);
  expect(pa.r.status === 200 && pa.key && /as a partner, seated on Smoke, access hats Partner /.test(pa.r.text) && hm.key && /as a member, seated on Smoke, Smoke B \(smoke-b\) /.test(hm.r.text) && ob.key && lo.key && /seated nowhere yet/.test(lo.r.text),
    () => `invite answers: ${pa.r.status} ${brief((pa.r.text.match(/Created[^<]*/) || [""])[0].replace(/[0-9a-f]{40}/g, "<key>"))}`);
  const j = await people();
  const p = who(j, "partner@smoke.local"), m = who(j, "hat@smoke.local"), b = who(j, "onlyb@smoke.local");
  expect(p && p.role === "partner" && JSON.stringify(p.hats) === '["partner"]' && JSON.stringify(p.access) === '["partner"]' && JSON.stringify(p.seats.map((x) => x.project)) === '["smoke"]'
    && m && m.role === "member" && JSON.stringify(m.hats) === "[]" && JSON.stringify(m.access) === "[]" && JSON.stringify(m.seats.map((x) => x.project)) === '["smoke","smoke-b"]' && b && JSON.stringify(b.seats.map((x) => x.project)) === '["smoke-b"]',
    () => `GET /control/people: ${brief([p, m, b].map((x) => x && { role: x.role, hats: x.hats, access: x.access, seats: x.seats }))}`);
  // the secret is the answer's alone: the page read after it never carries it
  const later = (await html("/control")).text + JSON.stringify(j);
  expect(![pa.key, hm.key, ob.key, lo.key].some((k) => later.includes(k)), "a one-time secret shows again on a later read");
  const page = await html("/control");
  expect(page.status === 200 && /data-button="provision-person-key"/.test(page.text) && [p.id, m.id].every((id) => page.text.includes(`data-person="${id}"`)) && /data-region="connect"/.test(page.text),
    `GET /control: ${page.status}`);
  s.partner = { id: p.id, key: pa.key }; s.hat = { id: m.id, key: hm.key }; s.onlyB = { id: b.id, key: ob.key }; s.loner = { id: who(j, "loner@smoke.local").id, key: lo.key };
  // Connect offers the plugin after the two apps (9.2; 21.P E22): the row's values are the repo's own, never retyped; the add line
  // names the plugin's public distribution repo exactly (10.1: the engine's repo is private, and its name is a prefix of the dist repo's)
  const rd = (...p) => JSON.parse(readFileSync(join(...p), "utf8"));
  const installId = `${rd(PLUGIN_DIR, ".claude-plugin", "plugin.json").name}@${rd(REPO, ".claude-plugin", "marketplace.json").name}`;
  const conn = page.text.slice(page.text.indexOf('data-region="connect"'));
  const blocks = [...conn.matchAll(/data-client-block="([a-z-]+)"/g)].map((x) => x[1]);
  const row = (k) => { const at = conn.indexOf(`data-client-block="${k}"`), nx = conn.slice(at + 1).search(/data-client-block="/); return at < 0 ? "" : conn.slice(at, nx < 0 ? undefined : at + 1 + nx); };
  const plug = row("claude-plugin");
  expect(blocks.includes("claude-plugin") && blocks.includes("claude-code") && plug.includes(`<code>claude plugin marketplace add ${DIST_REPO}</code>`) && plug.includes(`claude plugin install ${installId}`)
    && !plug.includes("/mcp") && !/Authorization|your-key|--header/.test(plug) && /claude mcp add \S+ --transport http/.test(conn)
    && /Connects to[\s\S]*The hosted platform only/.test(plug) && /With a key · any install/.test(conn.slice(conn.indexOf('data-client-block="claude-code"'))),
    () => `Connect: blocks [${blocks.join(", ")}] (want claude-plugin and claude-code); plugin row ${brief(plug.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 280))} (want both commands, add ${DIST_REPO}, ${installId}, no address, no key, \"Connects to: The hosted platform only\"; the key row \"With a key · any install\")`);
  // 12.1: the app ways in, pinned exactly (the name is the key row's own: one connector name on every row of this org)
  const name = (/claude mcp add (\S+) --transport http/.exec(conn) || [])[1] || "";
  const org = ((/<dt>Sign in<\/dt><dd>([^<]*): email and passphrase<\/dd>/.exec(row("claude-connector")) || [])[1]) || "";
  const claudeAdd = `https://claude.ai/customize/connectors?modal=add-custom-connector&amp;connectorName=${encodeURIComponent(name)}&amp;connectorUrl=${encodeURIComponent(`${BASE}/mcp`)}`;
  const away = (href, button, label) => new RegExp(`<a class="u-btn small" href="${href.replace(/[.?*+^$()[\]{}|\\]/g, "\\$&")}" target="_blank" rel="noopener noreferrer" data-button="${button}" data-client="[^"]+">${label}</a>`);
  const steps = `<dt>Steps</dt><dd><ol class="ct-steps"><li>Add custom MCP server</li><li>Paste the MCP URL</li><li>Sign in to ${org}</li></ol></dd>`;
  // 21.P E22: Claude and ChatGPT lead, open, each beside its logo (the worker's own file); the plugin, the key and Codex after, closed
  const opened = (k) => new RegExp(`data-client-block="${k}"><details class="p-x" open>`).test(conn);
  expect(JSON.stringify(blocks) === JSON.stringify(["claude-connector", "chatgpt", "claude-plugin", "claude-code", "codex"]) && opened("claude-connector") && opened("chatgpt")
    && !["claude-plugin", "claude-code", "codex"].some(opened) && /data-mark="claude"[^>]*><img src="\/assets\/clients\/claude\.png\?v=/.test(row("claude-connector")) && /data-mark="chatgpt"[^>]*><img src="\/assets\/clients\/chatgpt\.png\?v=/.test(row("chatgpt"))
    && !/First calls/.test(conn) && name === "sharingu" && org
    && away(claudeAdd, "add-to-claude", "Add to Claude").test(row("claude-connector")) && row("claude-connector").includes(`<code>${BASE}/mcp</code>`)
    && away("https://chatgpt.com/plugins", "add-to-chatgpt", "Add to ChatGPT").test(row("chatgpt")) && row("chatgpt").includes(steps) && row("chatgpt").includes(`<code>${BASE}/mcp</code>`),
    () => `Connect's app rows: blocks [${blocks.join(", ")}] (want claude-connector, chatgpt open with their logos, then claude-plugin, claude-code, codex; no "First calls"); Claude ${brief(row("claude-connector").replace(/<svg[\s\S]*?<\/svg>/g, "").slice(0, 600))} (want Add to Claude -> ${claudeAdd}); ChatGPT ${brief(row("chatgpt").replace(/<svg[\s\S]*?<\/svg>/g, "").slice(0, 700))} (want Add to ChatGPT -> https://chatgpt.com/plugins and ${steps})`);
  return `partner (seat smoke, hat and access hat partner), member (seats smoke, smoke-b, no access hat), only-b and a seatless partner; each secret once, in its own answer; Connect leads with Claude and ChatGPT, open, beside their logos; the plugin row (add ${DIST_REPO}, ${installId}, no address, no key, the hosted platform only), claude mcp add after (any install); Add to Claude (the prefilled install link, ${name}), Add to ChatGPT (its plugins page) and its three steps`;
});

smoke("C2: POST /profile saves your own hats; the read-only credential, a key in the URL and a hat outside the seven are refused", async () => {
  const ok = await setHats(s.hat.key, ["engineering"]);
  const w = await mcp(s.hat.key, "whoami");
  expect(ok.status === 200 && JSON.stringify(ok.json.hats) === '["engineering"]' && JSON.stringify(w.out.hats) === '["engineering"]' && w.out.roleClass === "member",
    () => `set-profile ${ok.status} ${brief(ok.json)} · whoami ${brief({ hats: w.out.hats, roleClass: w.out.roleClass })}`);
  const ro = await http("POST", "/profile", { key: readOnlyOf(s.hat.key), body: { action: "set-profile", hats: ["finance"] } });
  const inUrl = await http("POST", `/profile?k=${encodeURIComponent(s.hat.key)}`, { body: { action: "set-profile", hats: ["finance"] } });
  const bad = await setHats(s.hat.key, ["engineering", "wizard"]);
  const after = await mcp(s.hat.key, "whoami");
  expect(ro.status === 401 && inUrl.status === 401 && bad.status === 422 && bad.json.error === "bad_hat" && JSON.stringify(after.out.hats) === '["engineering"]',
    () => `read-only ${ro.status} · ?k= ${inUrl.status} · bad ${bad.status} ${brief(bad.json)} · hats now ${brief(after.out.hats)}`);
  const pg = await html("/profile", s.hat.key);
  expect(pg.status === 200 && /name="hat" value="engineering" checked/.test(pg.text) && /name="hat" value="finance">/.test(pg.text) && /Rotate my key/.test(pg.text),
    `GET /profile: ${pg.status}`);
  return "saved [engineering] (whoami agrees); read-only 401, ?k= 401, bad_hat 422, nothing else saved; the profile draws the seven with engineering checked";
});

// the admin's set-access-hats (the whole list: no hat named clears them)
const access = (personId, hats) => control([["action", "set-access-hats"], ["personId", personId], ...hats.map((h) => ["accessHat", h])]);
const flashOf = (t) => ((/<div class="ct-flash-plain"[^>]*><p class="flash-value">([^<]*)</.exec(t || "") || [])[1] || "").replace(/&#39;/g, "'");

smoke("C3: a hat a member picks never opens a briefing; the admin's access hat does, both ways, and the default brief follows it; a Partner likewise", async () => {
  const w = await kwrite(ownerKey, { project: P, ops: [
    { kind: "doc", op: "upsert", data: { path: "capsules/finance.md", title: "Finance brief", body: "# finance brief s6", roleVisibility: ["finance"] } },
    { kind: "card_kind", op: "upsert", data: { key: "s6fin", label: "S6 finance", roleVisibility: ["finance"] } },
    { kind: "card", op: "upsert", data: { kind: "s6fin", id: "f-1", name: "Budget line", body: "BUDGET s6" } },
  ] });
  expect(!w.isError && w.out.written === 3, () => brief(w.out));
  // D5: a role's brief is brief {role} (no `for`: your own), GET /brief?role= its twin; the kinds are read {kind: "card_kind"}
  const bodyOf = (o) => (o && o.brief ? o.brief.body : o);
  const look = async (key) => ({
    cap: (await mcp(key, "brief", { project: P, role: "finance" })).out,
    mine: (await mcp(key, "brief", { project: P })).out,
    doc: (await kread(key, { project: P, kind: "doc", id: "capsules/finance.md" })).out,
    kinds: ((await kread(key, { project: P, kind: "card_kind" })).out.items || []).map((k) => k.key),
    rest: (await http("GET", `/brief?project=${P}&role=finance`, { key })).status,
  });
  // D1b item 2: a brief the reader may not read answers unknown_brief / 404, as one that is not filed (never forbidden / 403)
  const hidden = (x) => x.cap.error === "unknown_brief" && x.doc.error === "not_found" && !x.kinds.includes("s6fin") && x.rest === 404;
  const open = (x) => bodyOf(x.cap) === "# finance brief s6" && bodyOf(x.mine) === "# finance brief s6" && x.doc.item && x.doc.item.path === "capsules/finance.md" && x.kinds.includes("s6fin") && x.rest === 200;
  const before = await look(s.hat.key);
  expect(hidden(before), () => `no finance hat at all: ${brief(before)}`);
  // the member picks Finance on their own profile: nothing opens
  const pick = await setHats(s.hat.key, ["engineering", "finance"]);
  const picked = await look(s.hat.key);
  expect(pick.status === 200 && JSON.stringify(pick.json.hats) === '["engineering","finance"]' && hidden(picked), () => `picked finance on /profile: ${pick.status} ${brief(picked)}`);
  // the admin gives them Finance on Control: it opens, and the default brief is finance's
  const g = await access(s.hat.id, ["finance"]);
  const given = await look(s.hat.key);
  const wm = (await mcp(s.hat.key, "whoami")).out;
  expect(g.status === 200 && /Smoke Hat's access hats: Finance\./.test(flashOf(g.text)) && open(given) && JSON.stringify(wm.accessHats) === '["finance"]',
    () => `the admin gives finance (${g.status} "${flashOf(g.text)}"): ${brief(given)} · whoami accessHats ${brief(wm.accessHats)}`);
  // the admin takes it away (no hat named): hidden again, though the member still wears it
  const c = await access(s.hat.id, []);
  const off = await look(s.hat.key);
  expect(c.status === 200 && /Smoke Hat holds no access hat now/.test(flashOf(c.text)) && hidden(off), () => `the admin clears it: ${brief(off)}`);
  // a Partner: picking Finance opens nothing; the admin giving it opens it (the admin set it); back to their role's hat
  const ph = await setHats(s.partner.key, ["partner", "finance"]);
  const pPicked = await look(s.partner.key);
  await access(s.partner.id, ["partner", "finance"]);
  const pGiven = await look(s.partner.key);
  await access(s.partner.id, ["partner"]);
  const pBack = await look(s.partner.key);
  expect(ph.status === 200 && hidden(pPicked) && open(pGiven) && hidden(pBack), () => `a partner: picked ${brief(pPicked)} · given ${brief(pGiven)} · back ${brief(pBack)}`);
  return "a member picking finance: the role's brief unknown_brief, the doc not_found, the kind absent, GET /brief?role= 404; the admin giving it: all readable and the default brief is finance's; taken away: hidden again; a partner: the same both ways";
});

smoke("C4: a Partner sees only their projects: another is project_forbidden, Control lists their projects' people, Home no roster, no Broadcast publish", async () => {
  const other = await kread(s.partner.key, { project: Q, kind: "goal" });
  const mine = await kread(s.partner.key, { project: P, kind: "goal" });
  expect(other.isError && other.out.error === "project_forbidden" && !mine.isError, () => `${Q}: ${brief(other.out)} · ${P}: ${brief(mine.out).slice(0, 80)}`);
  const j = await people(s.partner.key);
  const ids = (j.people || []).map((p) => p.id);
  expect(ids.includes(s.partner.id) && ids.includes(s.hat.id) && !ids.includes(s.onlyB.id) && JSON.stringify((j.workspaces || []).map((x) => x.key)) === '["smoke"]'
    && (j.people || []).every((p) => p.id === s.partner.id || p.email === null) && !("archived" in j), () => `Control as the partner: ${brief({ ids, ws: j.workspaces })}`);
  // Home with no project in scope: a seatless member reads the org's active roster, a seatless partner only themselves
  const lonely = (await http("GET", "/home/summary", { key: s.loner.key })).json || {};
  const names = ((lonely.whoIsHere || {}).people || []).map((p) => p.name);
  expect(JSON.stringify(names) === '["Smoke Loner"]', () => `a seatless partner's Home: ${brief(names)}`);
  // Broadcast publish is a person's press in a signed-in browser: the partner's own session is refused partner_refused
  const login = async (email, key) => (await http("POST", "/login", { body: { email, password: key, device: "smoke-s6" } })).json.token;
  const press = async (tok) => raw("POST", "/broadcast/publish", { cookie: `__Host-ar_session=${encodeURIComponent(tok)}`, origin: BASE, "sec-fetch-site": "same-origin" }, { id: "T-00000000-000", eval: true });
  const pp = await press(await login("partner@smoke.local", s.partner.key));
  const mp = await press(await login("hat@smoke.local", s.hat.key));
  expect(pp.status === 403 && pp.json && pp.json.error === "partner_refused" && mp.json && mp.json.error !== "partner_refused",
    () => `publish: partner ${pp.status} ${brief(pp.json)} · member ${mp.status} ${brief(mp.json)}`);
  return `${Q}: project_forbidden; Control: [${ids.length} people of smoke] and no one's email but theirs; Home seatless: themselves only; publish: partner_refused (a member's press gets ${mp.json && mp.json.error})`;
});

smoke("C5: set-role moves a person between member and partner and back", async () => {
  const toP = await control({ action: "set-role", personId: s.onlyB.id, role: "partner" });
  const r1 = who(await people(), "onlyb@smoke.local");
  const again = await control({ action: "set-role", personId: s.onlyB.id, role: "partner" });
  const toM = await control({ action: "set-role", personId: s.onlyB.id, role: "member" });
  const r2 = who(await people(), "onlyb@smoke.local");
  expect(/is now a partner/.test(toP.text) && r1.role === "partner" && /Nothing done\s*[—-]\s*Smoke OnlyB is already a partner/.test(again.text) && /is now a member/.test(toM.text) && r2.role === "member",
    () => `${r1 && r1.role} then ${r2 && r2.role}`);
  return "member -> partner (a second press: already a partner) -> member";
});

smoke("C6: set-access-hats is the admin's alone: a member, a read-only credential and a key in the URL are refused; a hat outside the seven is Nothing done", async () => {
  const form = [["action", "set-access-hats"], ["personId", s.hat.id], ["accessHat", "finance"]];
  const accessNow = async () => JSON.stringify(((((await http("GET", "/control/people", { key: ownerKey })).json || {}).people || []).find((p) => p.id === s.hat.id) || {}).access);
  const was = await accessNow();
  const member = await http("POST", "/control", { key: s.hat.key, form });
  const ro = await http("POST", "/control", { key: readOnlyOf(ownerKey), form });
  const inUrl = await http("POST", `/control?k=${encodeURIComponent(ownerKey)}`, { form });
  const bad = await control([["action", "set-access-hats"], ["personId", s.hat.id], ["accessHat", "wizard"]]);
  const now = await accessNow();
  expect(member.status === 403 && ro.status === 403 && /read-only credential/.test(ro.text) && inUrl.status === 401
    && bad.status === 200 && /Nothing done - wizard is not a hat/.test(flashOf(bad.text)) && now === was && was === "[]",
    () => `member ${member.status} · read-only ${ro.status} · ?k= ${inUrl.status} · bad "${flashOf(bad.text)}" · access ${was} -> ${now}`);
  return `a member 403, the read-only credential 403, the admin's key in ?k= 401 (a key in an address signs no one in), a hat outside the seven "Nothing done"; the access hats stay ${now}`;
});
