#!/usr/bin/env node
// tools/walkthrough/grade.mjs — grade a project's SCREEN checks by observing them on a LOCAL org, then file the grades
// through the door (preview, then file). The walkthrough's terminal runs it for real (beat 6: one check; beat 7: every check
// a change put in question); it works on any local org.
//
//   SHARINGU_URL=<local org> SHARINGU_KEY=<a seat's key, env only> node tools/walkthrough/grade.mjs <checkId>... [options]
//   ... grade.mjs --redo <contribution id> [options]     every check that contribution's Impact asks to redo
//   options: --project <key> (default sharingu) · --goal <id> --preview <P-id> --contribution <T-id> (what a check's
//            <ref>, <id> placeholder names; defaults: the goal its refs name, else the tree's top; the newest contribution)
//            · --link <path> (the page must also link that path) · --dry (observe only, file nothing) · --json
//
// A screen check reads "GET <path> with Accept: text/html" / "200 HTML holding data-screen=\"x\" and the regions
// data-region=\"a\", …; when it has them, …" (the code model's grammar, tools/import/read-code.mjs): the page is fetched as
// a signed-in browser fetches it (a session cookie from the app's own POST /login with this seat's key, never printed), and
// the check is proven when the page answers 200 with that data-screen and every region named before "when it has them".
// The proof filed is the exact command (the cookie as $COOKIE) and what came back. A check of any other kind is said and
// left ungraded. Prints one line per check, then the door's receipt. Exit 0 when every check was observed and filed; 1 when
// one was refused, left or not a screen check; 2 on a usage error.
import { call, show, isLocal } from "./mcp-call.mjs";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";

// sessionCookie(base, key) -> { cookie, address }: the session the app's own sign-in answers, and the org's address it lands on
// (sprint 7, 7.4: a session signs in only under its org's address, /<org>/…; the probes open the pages there)
export async function sessionCookie(base, key) {
  const w = await (await fetch(base + "/whoami", { headers: { authorization: "Bearer " + key, accept: "application/json" } })).json();
  const r = await fetch(base + "/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: base }, body: new URLSearchParams({ email: w.email, password: key, web: "1" }), redirect: "manual" });
  const cookie = (/(__Host-ar_session=[^;]+)/.exec(r.headers.get("set-cookie") || "") || [])[1] || null;
  const address = (/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.exec((r.headers.get("location") || "").replace(base, "")) || [])[0] || "";
  return { cookie, address };
}

// probe(check, ctx) -> {verdict: proven|refused|null, line (short, for a terminal), proof (the full record)}
export async function probe(c, ctx) {
  const m = /^GET (\S+) with Accept: text\/html/.exec(c.when || "");
  if (c.kind !== "screen" || !m) return { verdict: null, line: `${c.id}: not a screen check (${c.kind}), left`, proof: "" };
  const P = ctx.project;
  const fill = (p) => p.replace(/<([a-z ]+)>/gi, (_, k) => {
    if (k === "ref" && /^\/goals\//.test(p)) return ctx.goalFor(c);
    if (k === "id" && /^\/contribution\//.test(p)) return ctx.contribution;
    if (k === "id" && /^\/preview\//.test(p)) return ctx.preview || "none";
    if (k === "qid") return ctx.qid;
    if (k === "path") return "start-here.md";
    if (k === "slug") return ctx.slug || "x";
    if (k === "kind" && /card\//.test(p)) return ctx.card ? ctx.card.kind : "x";
    if (k === "id" && /card\//.test(p)) return ctx.card ? ctx.card.id : "x";
    if (k === "words") return "preview";
    return "x";
  });
  const path = fill(m[1]);
  const url = ctx.base + (ctx.address || "") + path + (path.includes("?") ? "&" : "?") + "project=" + encodeURIComponent(P);
  const r = await fetch(url, { headers: { accept: "text/html", "sec-fetch-dest": "document", cookie: ctx.cookie }, redirect: "manual" });
  const t = await r.text();
  const head = String(c.then || "").split("; when it has them")[0];
  const ds = /data-screen="([^"]+)"/.exec(head);
  const regions = [...head.matchAll(/data-region="([^"]+)"/g)].map((x) => x[1]);
  const missing = regions.filter((x) => !t.includes(`data-region="${x}"`));
  const dsOk = !ds || t.includes(`data-screen="${ds[1]}"`);
  const link = ctx.link && c.id === ctx.linkFor ? ctx.link : null;
  const linkOk = !link || t.includes(`href="${link}"`);
  const loc = (r.headers.get("location") || "").replace(ctx.base, "");
  const sendsOn = r.status === 302 && loc && !/\/login/.test(loc) && /sends on gets that 302/.test(c.then || "");
  const ok = sendsOn || (r.status === 200 && dsOk && !missing.length && linkOk);
  const curl = `curl -s -H 'cookie: $COOKIE' -H 'accept: text/html' -H 'sec-fetch-dest: document' '${url}'`;
  const said = sendsOn ? `302 → ${loc} (the page's own rule, as the check says)`
    : `${r.status}${ds ? `, data-screen="${ds[1]}" ${dsOk ? "present" : "MISSING"}` : ""}, regions ${regions.length - missing.length} of ${regions.length}${missing.length ? ` (missing ${missing.join(", ")})` : ""}${link ? `, a link to ${link} ${linkOk ? "present" : "MISSING"}` : ""}`;
  const short = sendsOn ? `302, its own rule` : `${r.status}${regions.length ? `, ${regions.length - missing.length} of ${regions.length} regions` : ""}${ds && !dsOk ? ", its screen MISSING" : ""}${link ? `, the link ${linkOk ? "there" : "MISSING"}` : ""}`;
  return { verdict: ok ? "proven" : "refused", line: `GET ${path.length > 34 ? path.slice(0, 31) + "..." : path}`.padEnd(40) + ` -> ${short}`, proof: `${curl} -> ${said}` };
}

// context(base, key, o) -> what the placeholders name on this org
export async function context(base, key, o = {}) {
  const P = o.project || "sharingu";
  const { cookie, address } = await sessionCookie(base, key);
  if (!cookie) throw new Error("no session: the app's POST /login refused this key");
  const get = async (p) => (await fetch(base + p + (p.includes("?") ? "&" : "?") + "project=" + P, { headers: { authorization: "Bearer " + key, accept: "application/json" } })).json().catch(() => ({}));
  const goals = o.goal ? null : await get("/goals?period=all");
  const goalIds = new Set(((goals && goals.nodes) || []).map((n) => n.id));
  const top = o.goal || (goals && goals.globalId) || "x";
  const build = o.contribution ? null : await get("/build");
  const dec = await get("/decisions");
  const bc = await get("/broadcast");
  const cards = await call(base, key, "read", { project: P, kind: "card", limit: 1 });
  return {
    base, address, project: P, cookie, preview: o.preview || null, link: o.link || null, linkFor: o.linkFor || null,
    contribution: o.contribution || ((build && build.rows) || [])[0]?.id || "x",
    qid: ((dec.rows || [])[0] || {}).qid || "x",
    slug: (((bc.regions || {})["starter-shelf"] || [])[0] || {}).slug || null,
    card: ((cards.out && cards.out.items) || [])[0] ? { kind: cards.out.items[0].kind, id: cards.out.items[0].id } : null,
    goalFor: (c) => (c.refs || []).find((r) => goalIds.has(r) || r === o.goal) || top,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const BASE = String(process.env.SHARINGU_URL || "").replace(/\/+$/, ""), KEY = process.env.SHARINGU_KEY || "";
  const takes = new Set(["--redo", "--project", "--goal", "--preview", "--contribution", "--link"]);
  const ids = argv.filter((a, i) => !a.startsWith("--") && !takes.has(argv[i - 1]));
  const redo = flag("--redo");
  if (!BASE || !KEY || (!ids.length && !redo)) { console.error("usage: SHARINGU_URL=<local org> SHARINGU_KEY=<key> node tools/walkthrough/grade.mjs <checkId>... | --redo <T-id>  [--project p] [--goal g] [--preview P-id] [--contribution T-id] [--link /path] [--dry]"); process.exit(2); }
  if (!isLocal(BASE)) { console.error("grade: the url must be a local org (http://127.0.0.1:<port>)"); process.exit(2); }
  const P = flag("--project") || "sharingu";
  let list = ids;
  if (redo) {
    const r = await fetch(`${BASE}/contribution/${encodeURIComponent(redo)}/impact?project=${P}`, { headers: { authorization: "Bearer " + KEY, accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    list = ((j.proof && j.proof.toRedo) || []).map((x) => x.id);
    console.log(`${redo}: ${list.length} check${list.length === 1 ? "" : "s"} to redo`);
  }
  const ctx = await context(BASE, KEY, { project: P, goal: flag("--goal"), preview: flag("--preview"), contribution: flag("--contribution"), link: flag("--link"), linkFor: ids[0] });
  const items = [], left = []; let rc = 0;
  for (const id of list) {
    const got = await call(BASE, KEY, "read", { project: P, ref: `check/${id}` });
    const c = got.out && (got.out.item || got.out);
    if (!c || !c.id) { console.log(`${id}: no such check`); rc = 1; continue; }
    const o = await probe(c, ctx);
    // a check this tool cannot observe from a page (a walked flow, say) is said LAST, after the receipt, so a terminal
    // that keeps only its last lines still shows what was left and why (the take's terminal holds 24 lines)
    if (!o.verdict) { rc = 1; left.push(c); continue; }
    console.log(o.line);
    if (o.verdict !== "proven") rc = 1;
    items.push({ grade: { checkId: c.id, verdict: o.verdict, proof: o.proof } });
  }
  const sayLeft = () => {
    if (!left.length) return;
    const walks = left.filter((c) => c.method === "walk").length;
    console.log("");
    console.log(`${list.length} to redo: ${items.length} regraded from the pages, ${left.length} left (${walks === left.length ? `walked flow${left.length === 1 ? "" : "s"}: walk ${left.length === 1 ? "it" : "them"} again` : "not screen checks"})`);
    for (const c of left) console.log(`  · ${String(c.title || c.id).slice(0, 66)}`);
  };
  if (!items.length || argv.includes("--dry")) { sayLeft(); process.exit(items.length ? rc : 1); }
  const pv = await call(BASE, KEY, "preview", { project: P, clientRef: `walkthrough-grade-${Date.now()}`, items });
  if (pv.error || pv.isError || !pv.out.previewId) { console.log(show("preview", pv)); process.exit(1); }
  const f = await call(BASE, KEY, "file", { previewId: pv.out.previewId, items });
  console.log("");
  console.log(argv.includes("--json") ? JSON.stringify(f.out) : show("file", f));
  sayLeft();
  process.exit(f.error || f.isError ? 1 : rc);
}
