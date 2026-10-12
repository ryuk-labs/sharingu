// tools/smoke/s36-orgr2.mjs — sprint 6, 6.4 (storage carries the org; PLATFORM.md §2 item 5): every R2 object lies under its org's
// prefix (src/storage.js, o<org>/<key>), and org 2 never reads an object of org 1. Runs after s35-ownorg, on the second org s33
// seeded (s.org2). The bucket is the smoke's own local R2, read beside the running worker through wrangler's getPlatformProxy
// (tools/ship/r2-org-keys.mjs localBackend; nothing reaches Cloudflare).
//   · org 2's render, files (a page and a picture), its session report and its backup (and the suites' window) land under o2/;
//     org 1's under o1/; the bucket holds no bare key at all (every write of this run carried its org); org 2's backup pages
//     hold org 2's rows alone, beside org 1's backup of the same day
//   · org 2 reads no org-1 object by any key shape, through every route that serves a body: GET/HEAD /render/:hash under every
//     project spelling (bare, o1--, o2--, its own, none), GET /artifact/:id (and ?meta, ?download), R2 key shapes as an id,
//     read_file by id and by key, an image render naming org 1's picture, a take restored by org 1's hash — each a refusal, no
//     byte of the body. The ruled exception (PLATFORM §2.7, ADR-055, owner 2026-10-06): org 1's PUBLIC file by its exact id is
//     served to anyone with the link, from org 1's own prefix
//   · an object at a bare key (no o<n>/ prefix, as the code before 6.4 wrote) is no org's: org 1's render, style, files and
//     picture moved there are served to NO org, org 1 included, by every serving route (the public link too, signed out or as
//     org 2); the ship's tool (copy, verify, delete) on this bucket then puts them back under o1/, and org 1 reads them there
import { readFileSync } from "node:fs";
import { smoke, expect, brief, s, http, mcp, kwrite, ownerKey, BASE, d1rows } from "./lib.mjs";
import * as R2 from "../ship/r2-org-keys.mjs";

const TAG = String(Date.now()).slice(-7);
const SCREEN = "screen:orgr2";
// a 2x2 PNG (valid, 75 bytes)
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DwHwyBNAMDAGX8C/V8+/0LAAAAAElFTkSuQmCC"), (c) => c.charCodeAt(0));
const raw = async (path, key, method = "GET") => {
  const r = await fetch(BASE + path, { method, headers: { accept: "application/json", authorization: "Bearer " + key }, redirect: "manual" });
  const buf = new Uint8Array(await r.arrayBuffer());
  return { status: r.status, text: new TextDecoder().decode(buf), bytes: buf.length };
};
async function bucket() {
  const cfg = readFileSync(String(process.env.SMOKE_D1_CFG || ""), "utf8");
  const name = (cfg.match(/"bucket_name"\s*:\s*"([^"]+)"/) || [])[1];
  expect(name && process.env.SMOKE_D1_PERSIST, "the smoke's bucket (SMOKE_D1_CFG's r2_buckets, SMOKE_D1_PERSIST)");
  return R2.localBackend(process.env.SMOKE_D1_PERSIST, name);
}
const bankPng = async (key, title, group) => {
  const r = await fetch(`${BASE}/artifact?title=${encodeURIComponent(title)}&group=${group}`, { method: "POST", headers: { authorization: "Bearer " + key, "content-type": "image/png" }, body: PNG });
  const j = await r.json();
  expect(r.status === 200 && j.id, () => `POST /artifact ${title}: ${r.status} ${brief(j)}`);
  return j.id;
};
const keyOf = (id) => (d1rows(`SELECT r2_key FROM artifacts WHERE id = '${id}'`)[0] || {}).r2_key;

smoke("orgr2 · org 2's render, files, report and backup land under o2/, org 1's under o1/; no bare key; each org's backup its own", async () => {
  expect(s.org2 && s.org2.key && s.s8 && s.s8.hash, "s33 (the second org) and s8 (org 1's render) must run first");
  const be = await bucket();
  try {
    const w = await kwrite(s.org2.key, { project: "o2--shop", ops: [
      { kind: "node", op: "upsert", data: { id: SCREEN, type: "screen", name: "Orgr2", status: "planned", data: { surface: "shop-app", lane: "buy", step: 1 } } },
      { kind: "render", op: "upsert", data: { screen: SCREEN, state: "default", variant: "live", format: "html", body: `<p>ORG2-RENDER-${TAG}</p>` } }] });
    expect(!w.isError && w.out.written === 2, () => `org 2's render: ${brief(w.out)}`);
    const hash2 = (d1rows(`SELECT hash FROM k_renders WHERE project = 'o2--shop' AND screen = '${SCREEN}'`)[0] || {}).hash;
    const page = await mcp(s.org2.key, "save_file", { content: `<p>ORG2-FILE-${TAG}</p>`, title: "orgr2 page", group: "smoke" });
    expect(page.out && page.out.id, () => `org 2's save_file: ${brief(page.out)}`);
    const pic = await bankPng(s.org2.key, "orgr2 picture", "smoke");
    const wr = await mcp(s.org2.key, "wrap_up", { project: "o2--shop", summary: `orgr2 report ${TAG}` });
    expect(!wr.isError, () => `org 2's wrap_up: ${brief(wr.out)}`);
    const b2 = await http("POST", "/backup-dump", { key: s.org2.key });
    const e2 = await http("POST", "/backup-dump?eval=1", { key: s.org2.key });
    const b1 = await http("POST", "/backup-dump", { key: ownerKey });
    const day = new Date().toISOString().slice(0, 10);
    expect(b2.status === 200 && b2.json.complete && b2.json.key === `o2/backups/d1/${day}/manifest.json` && e2.status === 200 && e2.json.key === `o2/backups/d1/${day}.eval.json`
      && b1.status === 200 && b1.json.key === `o1/backups/d1/${day}/manifest.json`, () => `backups: org 2 ${b2.status} ${brief(b2.json)} · eval ${e2.status} ${brief(e2.json)} · org 1 ${b1.status} ${brief(b1.json && b1.json.key)}`);
    const all = await be.list();
    const keys = new Set(all.map((o) => o.key));
    const want2 = [`o2/renders/o2--shop/${hash2}`, `o2/${keyOf(page.out.id)}`, `o2/${keyOf(pic)}`, b2.json.key, e2.json.key];
    const missing = want2.filter((k) => !keys.has(k));
    const reports2 = all.filter((o) => o.key.startsWith("o2/inbox/handoffs/"));
    const bare = all.filter((o) => R2.OLD_RE.test(o.key)).map((o) => o.key);
    const odd = all.filter((o) => !/^o[12]\//.test(o.key)).map((o) => o.key);
    const of1 = all.filter((o) => o.key.startsWith("o1/")).length, of2 = all.filter((o) => o.key.startsWith("o2/")).length;
    expect(!missing.length && reports2.length >= 1 && !bare.length && !odd.length && keys.has(`o1/renders/smoke/${s.s8.hash}`),
      () => `missing under o2/: ${missing.join(", ")}; org 2's reports ${reports2.length}; bare keys ${bare.slice(0, 5).join(", ")}; neither org's ${odd.slice(0, 5).join(", ")}`);
    // org 2's backup pages hold org 2's rows alone; org 1's manifest of the same day is its own
    const pages2 = all.filter((o) => o.key.startsWith(`o2/backups/d1/${day}/`) && !o.key.endsWith("manifest.json"));
    const foreign = [];
    let rows2 = 0;
    for (const o of pages2) {
      const p = JSON.parse(new TextDecoder().decode((await be.get(o.key)).bytes));
      for (const r of p.rows) { rows2++; if ("org" in r && p.table !== "org" && r.org !== 2) foreign.push(`${p.table} ${brief(r).slice(0, 60)}`); if (p.table === "org" && r.id !== 2) foreign.push(`org ${r.id}`); }
    }
    const m1 = JSON.parse(new TextDecoder().decode((await be.get(b1.json.key)).bytes)), m2 = JSON.parse(new TextDecoder().decode((await be.get(b2.json.key)).bytes));
    const n2 = Object.values(m2.counts).reduce((a, b) => a + b, 0), n1 = Object.values(m1.counts).reduce((a, b) => a + b, 0);
    expect(!foreign.length && rows2 === n2 && m2.counts.people === d1rows("SELECT COUNT(*) AS n FROM people WHERE org = 2")[0].n && m1.counts.people === d1rows("SELECT COUNT(*) AS n FROM people WHERE org = 1")[0].n,
      () => `org 2's backup pages: ${rows2} rows (manifest ${n2}), foreign ${foreign.slice(0, 4).join(" | ")}; people org 2 ${m2.counts.people}, org 1 ${m1.counts.people}`);
    s.orgr2 = { hash2, pic2: pic };
    return `org 2: its render, page, picture, ${reports2.length} report(s) and backup (${pages2.length} pages, ${n2} rows, all org 2's) + eval under o2/; org 1's backup ${n1} rows under o1/; the bucket: ${of1} objects o1/, ${of2} o2/, 0 bare`;
  } finally { await be.close(); }
});

// probes(key, o) -> every way org 2 (key) might ask for org 1's objects o: { render, style, file, filekey, pic } -> [what, refused?, leaked?]
async function probes(key, o) {
  const out = [];
  const mark = (what, status, text, err) => out.push({ what, status, refused: status >= 400 || !!err, leaked: o.marks.some((m) => text.includes(m)) });
  for (const proj of ["smoke", "o1--smoke", "o2--smoke", "o2--shop", null]) {
    for (const extra of ["", `&style=${o.style}`]) {
      const path = `/render/${o.render}${proj ? `?project=${encodeURIComponent(proj)}${extra}` : (extra ? `?${extra.slice(1)}` : "")}`;
      for (const m of ["GET", "HEAD"]) { const r = await raw(path, key, m); mark(`${m} ${path}`, r.status, r.text); }
    }
  }
  for (const q of ["", "?meta=1", "?download=1"]) { const r = await raw(`/artifact/${o.file}${q}`, key); mark(`GET /artifact/<org 1's file>${q}`, r.status, r.text); }
  for (const shape of [o.filekey, `o1/${o.filekey}`, encodeURIComponent(`o1/${o.filekey}`), encodeURIComponent(o.filekey)]) {
    const r = await raw(`/artifact/${shape}`, key); mark(`GET /artifact/${shape.slice(0, 40)}…`, r.status, r.text);
  }
  for (const id of [o.file, o.filekey, `o1/${o.filekey}`]) {
    const t = await mcp(key, "read_file", { id });
    const text = JSON.stringify(t.out);
    mark(`read_file ${String(id).slice(0, 40)}`, t.isError || (t.out && t.out.error) ? 404 : 200, text, t.out && t.out.error);
  }
  const img = await kwrite(key, { project: "o2--shop", ops: [{ kind: "render", op: "upsert", data: { screen: SCREEN, state: "default", variant: "stolen", format: "image", artifact: o.pic } }] });
  mark("an image render naming org 1's public picture", img.isError ? 404 : 200, JSON.stringify(img.out), img.out && (img.out.error || (img.out.errors || []).length));
  const rs = await http("POST", "/render/restore", { key, body: { project: "o2--shop", screen: SCREEN, hash: o.render, confirm: true } });
  mark("POST /render/restore with org 1's hash", rs.status, rs.text);
  return out;
}

smoke("orgr2 · org 2 reads no org-1 object by any key shape through every serving route (zero bytes); org 1's public link is the ruled exception", async () => {
  // org 1's own: a private page, a public page and a public picture (its render: s8's, with its style)
  const priv = await mcp(ownerKey, "save_file", { content: `<p>ORG1-PRIVATE-${TAG}</p>`, title: "orgr2 org 1 private", group: "smoke" });
  const pub = await mcp(ownerKey, "save_file", { content: `<p>ORG1-PUBLIC-${TAG}</p>`, title: "orgr2 org 1 public", group: "smoke", public: true });
  expect(priv.out && priv.out.id && pub.out && pub.out.id, () => `org 1's files: ${brief(priv.out)} · ${brief(pub.out)}`);
  const pic = await bankPng(ownerKey, "orgr2 org 1 picture", "public");
  const o = { render: s.s8.hash, style: s.s8.style, file: priv.out.id, filekey: keyOf(priv.out.id), pic, marks: ["S8 Home", `ORG1-PRIVATE-${TAG}`] };
  const own = await raw(`/render/${o.render}?project=smoke&style=${o.style}`, ownerKey);
  const ownFile = await raw(`/artifact/${o.file}`, ownerKey);
  expect(own.status === 200 && own.text.includes("S8 Home") && ownFile.status === 200 && ownFile.text.includes(`ORG1-PRIVATE-${TAG}`), () => `org 1 reads its own: render ${own.status}, file ${ownFile.status}`);
  const got = await probes(s.org2.key, o);
  const bad = got.filter((p) => !p.refused || p.leaked);
  expect(!bad.length, () => `org 2 reached org 1's objects: ${bad.slice(0, 6).map((p) => `${p.what} ${p.status}${p.leaked ? " LEAKED" : ""}`).join(" | ")}`);
  // the ruled exception: a public file's link answers from any org (read under ITS org's prefix)
  const link = await raw(`/artifact/${pub.out.id}`, s.org2.key);
  expect(link.status === 200 && link.text.includes(`ORG1-PUBLIC-${TAG}`), () => `org 1's public file by its link, as org 2: ${link.status}`);
  s.orgr2 = { ...s.orgr2, o: { ...o, pub: pub.out.id } };
  return `${got.length} probes as org 2 (render ×20 by every project spelling and HEAD, artifact by id ×3, by R2 key shape ×4, read_file ×3, an image render, a restore): every one refused, 0 bytes of org 1's; org 1's public file by its exact id served (the ruled exception, PLATFORM §2.7)`;
});

smoke("orgr2 · an object at a bare key (no o<n>/ prefix) is no org's: every serving route refuses it to org 2 AND org 1; the ship's copy puts it back under o1/", async () => {
  const o = s.orgr2 && s.orgr2.o;
  expect(o && o.pub, "the case before must leave org 1's objects");
  const be = await bucket();
  try {
    // org 1's render, its style, its private and public files and its picture, moved to their bare keys (as the code before 6.4
    // wrote them): the worker reads o<org>/ alone, for every org, so none of them is any org's now
    const styleHash = (d1rows("SELECT hash FROM k_styles WHERE project = 'smoke' AND id = 's8-style'")[0] || {}).hash;
    const moved = [`renders/smoke/${o.render}`, `renders/smoke/${styleHash}`, o.filekey, keyOf(o.pub), keyOf(o.pic)];
    for (const k of moved) {
      const b = await be.get(`o1/${k}`);
      expect(b, () => `o1/${k} is not in the bucket`);
      await be.put(k, b.bytes, { contentType: b.contentType });
      await be.delete(`o1/${k}`);
    }
    const marks = [...o.marks, `ORG1-PUBLIC-${TAG}`];
    const leak = (t) => marks.some((m) => t.includes(m));
    // org 1, its own objects by every serving route: each answers no body (a render, a file, its download, read_file, the public link)
    const mine = [];
    for (const extra of ["", `&style=${o.style}`]) for (const m of ["GET", "HEAD"]) {
      const r = await raw(`/render/${o.render}?project=smoke${extra}`, ownerKey, m); mine.push({ what: `${m} /render?project=smoke${extra ? "&style" : ""}`, status: r.status, text: r.text });
    }
    for (const id of [o.file, o.pub]) for (const q of ["", "?download=1"]) {
      const r = await raw(`/artifact/${id}${q}`, ownerKey); mine.push({ what: `GET /artifact/${id === o.pub ? "<public>" : "<private>"}${q}`, status: r.status, text: r.text });
    }
    for (const id of [o.file, o.pub]) {
      const t = await mcp(ownerKey, "read_file", { id });
      mine.push({ what: `read_file ${id === o.pub ? "<public>" : "<private>"}`, status: t.isError || (t.out && t.out.error) ? 410 : 200, text: JSON.stringify(t.out) });
    }
    const img = await kwrite(ownerKey, { project: "smoke", ops: [{ kind: "render", op: "upsert", data: { screen: "screen:s8-home", state: "default", variant: "bare", format: "image", artifact: o.pic } }] });
    mine.push({ what: "an image render naming org 1's own picture", status: img.isError || (img.out && (img.out.error || (img.out.errors || []).length)) ? 422 : 200, text: JSON.stringify(img.out) });
    const anon = await fetch(`${BASE}/artifact/${o.pub}`, { redirect: "manual" });
    const anonText = await anon.text();
    mine.push({ what: "the public link, signed out", status: anon.status, text: anonText });
    const open1 = mine.filter((p) => p.status < 400 || leak(p.text));
    expect(!open1.length, () => `org 1 was served an object at a bare key: ${open1.slice(0, 6).map((p) => `${p.what} ${p.status}${leak(p.text) ? " LEAKED" : ""}`).join(" | ")}`);
    // org 2, every probe (and org 1's public link): refused, no byte
    const got = await probes(s.org2.key, o);
    const link2 = await raw(`/artifact/${o.pub}`, s.org2.key);
    got.push({ what: "the public link as org 2", status: link2.status, refused: link2.status >= 400, leaked: leak(link2.text) });
    const bad = got.filter((p) => !p.refused || p.leaked);
    expect(!bad.length, () => `org 2 reached an object at a bare key: ${bad.slice(0, 6).map((p) => `${p.what} ${p.status}${p.leaked ? " LEAKED" : ""}`).join(" | ")}`);
    // the ship's tool (kept for a self-hosted install's move) on this bucket: plan, copy, verify, delete — the objects back under o1/
    const p = await R2.plan(be);
    const c = await R2.copy(be);
    const v = await R2.verify(be);
    const d = await R2.del(be, { bucket: be.name, complete: v.complete, listing: v.listing });
    const after = await be.list();
    expect(p.old === moved.length && c.copied === moved.length && v.complete && d.ok && d.deleted === moved.length && !after.some((x) => R2.OLD_RE.test(x.key)) && moved.every((k) => after.some((x) => x.key === `o1/${k}`)),
      () => `the ship's copy: plan ${brief(p)} · copy ${brief(c)} · verify ${v.complete} · delete ${brief(d)}`);
    const r2 = await raw(`/render/${o.render}?project=smoke&style=${o.style}`, ownerKey);
    const f2 = await raw(`/artifact/${o.file}`, ownerKey);
    const l2 = await raw(`/artifact/${o.pub}`, s.org2.key);
    expect(r2.status === 200 && r2.text.includes("S8 Home") && /\.s8\{/.test(r2.text) && f2.status === 200 && l2.status === 200 && l2.text.includes(`ORG1-PUBLIC-${TAG}`),
      () => `org 1 after the copy: render ${r2.status}, file ${f2.status}; the public link as org 2 ${l2.status}`);
    return `${moved.length} org-1 objects moved to bare keys: org 1 served none (${mine.length} routes: render GET/HEAD ±style, file ±download, read_file, its image render, the public link signed out); ${got.length} probes as org 2 refused, 0 bytes; the ship's tool: ${c.copied} copied, verify complete, ${d.deleted} bare keys deleted; org 1 reads them under o1/ again`;
  } finally { await be.close(); }
});
