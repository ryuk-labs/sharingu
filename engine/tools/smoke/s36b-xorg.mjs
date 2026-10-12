// tools/smoke/s36b-xorg.mjs — sprint 6, 6.6 (the second org everywhere): the cross-org attack suite, tools/attack-xorg.mjs — the
// gate runs it on the REAL worker in-process over node:sqlite; this case runs the SAME attack() on the smoke's real local worker
// (wrangler dev: its own D1, R2 and KV), between org 1 (the smoke's org: its owner, a member added here) and the second org s33
// seeded (s.org2: its owner, its member), each on a fresh project of its own (the same slug in both). Both orgs are seeded through the
// door with fresh canary words; then each org's owner and member walk every tool, brain:// resource, GET and POST route aimed
// at the other: 0 rows of the other org read, 0 written (every table of the victim counted and hashed before and after), 0 5xx;
// the public file by its exact id served across the wall, the one ruled exception (PLATFORM §2.7). Runs after s36-orgr2 and
// before s37-orgundo (which deletes org 2).
import { execFile } from "node:child_process";
import { smoke, expect, brief, s, http, ownerKey, BASE } from "./lib.mjs";
import { attack, canary } from "../attack-xorg.mjs";

// query(sql) -> rows: one statement on the smoke's local D1 (wrangler, ASYNC: a synchronous wait holds the event loop while the
// worker closes this process's idle keep-alive socket — the s37 scar), with room for a whole org's rows
function query(sql) {
  const { SMOKE_D1_DB: db, SMOKE_D1_CFG: cfg, SMOKE_D1_PERSIST: persist } = process.env;
  expect(db && cfg && persist, "SMOKE_D1_* not set (tools/smoke.sh sets them)");
  return new Promise((done, fail) => execFile("npx", ["--no-install", "wrangler", "d1", "execute", db, "--config", cfg, "--local", "--persist-to", persist, "--json", "--command", sql],
    { encoding: "utf8", maxBuffer: 1 << 28 }, (e, out, err) => {
      if (e) return fail(new Error(`D1: ${sql.slice(0, 100)} — ${String(err || out || e).slice(0, 300)}`));
      try { done((JSON.parse(out)[0] || {}).results || []); } catch (x) { fail(new Error(`D1 answer: ${String(out).slice(0, 200)}`)); }
    }));
}
// call(method, path, init) -> { status, text, location }: the real worker; a socket the worker closed while a D1 call ran is retried once
async function call(method, path, { headers = {}, body } = {}) {
  const go = async () => { const r = await fetch(BASE + path, { method, headers, body, redirect: "manual" }); return { status: r.status, text: method === "HEAD" ? "" : await r.text(), location: r.headers.get("location") || "" }; };
  try { return await go(); } catch { await new Promise((r) => setTimeout(r, 50)); return go(); }
}
async function facts(org) {
  const r = (await query(`SELECT (SELECT json_group_array(id) FROM transmission WHERE org = ${org}) AS tx, (SELECT json_group_array(id) FROM artifacts WHERE org = ${org}) AS files, ` +
    `(SELECT json_group_array(id) FROM people WHERE org = ${org}) AS people, (SELECT json_group_array(key) FROM projects WHERE org = ${org}) AS keys, ` +
    `(SELECT json_group_array(hash) FROM k_renders WHERE project IN (SELECT key FROM projects WHERE org = ${org})) AS hashes, ` +
    `(SELECT json_group_array(id) FROM previews WHERE project IN (SELECT key FROM projects WHERE org = ${org})) AS previews`))[0] || {};
  const J = (x) => JSON.parse(x || "[]");
  return { tx: J(r.tx), files: J(r.files), people: J(r.people), keys: J(r.keys), hashes: J(r.hashes), previews: J(r.previews) };
}

smoke("xorg · the cross-org attack on the real worker: org 2's owner and member against org 1, then org 1's against org 2 — 0 rows read or written, 0 5xx; the public file by its exact id the one ruled exception", async () => {
  expect(s.org2 && s.org2.key && s.org2.member, "s33/s34 did not leave the second org (s.org2 with its member)");
  // each org seeds on a fresh project of its own (the slug both hold, shop, is s34's case), its member seated there
  const tag = String(Date.now()).slice(-6), p1 = `xorg-${tag}`;
  const c1 = await http("POST", "/control", { key: ownerKey, form: { action: "add-project", key: p1, name: `Xorg ${tag}` } });
  const c2 = await http("POST", "/control", { key: s.org2.key, form: { action: "add-project", key: p1, name: `Xorg ${tag}` } });
  expect(c1.status < 500 && c2.status < 500, () => `the fresh projects: org 1 ${c1.status}, org 2 ${c2.status}`);
  const add = await http("POST", "/control", { key: ownerKey, form: { action: "add-person", name: `Xorg Member ${tag}`, email: `xorg-member-${tag}@smoke.local`, projectKey: p1, seatsChosen: "1" } });
  const member1 = (add.text.match(/API key\): ([0-9a-f]{40})/) || [])[1];
  expect(add.status < 500 && member1, () => `org 1's member (${add.status}): no secret in the answer`);
  const m2 = ((await http("GET", "/whoami", { key: s.org2.member })).json || {}).id;   // s34's member of org 2, the key the attack walks with
  const seat = await call("POST", "/control", { headers: { authorization: "Bearer " + s.org2.key, "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ action: "grant-seat", personId: String(m2), projectKey: `o2--${p1}`, role: "member" }).toString() });
  const seated = await query(`SELECT 1 AS x FROM project_seats WHERE person_id = '${m2}' AND project_key = 'o2--${p1}'`);
  expect(m2 && seat.status < 500 && seated.length === 1, () => `org 2's member seated on o2--${p1}: ${seat.status} ${brief(seated)}`);
  const target = { call, query, facts };
  const r = await attack(target, { a: { org: 1, word: canary("xorga"), owner: ownerKey, member: member1, project: p1 }, b: { org: 2, word: canary("xorgb"), owner: s.org2.key, member: s.org2.member, project: `o2--${p1}` }, orgs: false });   // the org moves leave new orgs: s40-neworg runs them, last
  const bad = [...r.findings, ...r.fivexx];
  expect(!bad.length, () => `${bad.length} finding(s) in ${r.calls} calls: ${bad.slice(0, 8).join(" | ")}`);
  const served = r.exceptions.filter((x) => /\(its body\)/.test(x)).length;
  return `${r.calls} calls (${r.answered} answered 2xx) — ${r.cover.tools} tools, ${r.cover.resources} resources, ${r.cover.gets} GET and ${r.cover.posts} POST routes — each direction's victim unchanged (${r.directions.map((d) => `org ${d.victim}: ${d.rows} rows in ${d.tables} tables`).join(", ")}); 0 rows read, 0 written, 0 5xx; the public file by its exact id served ${served} times (the ruled exception) [${brief(r.ms)} ms]`;
});
