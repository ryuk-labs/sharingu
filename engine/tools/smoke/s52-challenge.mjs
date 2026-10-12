// tools/smoke/s52-challenge.mjs — sprint 11, 11.3 (docs/plan/MARKETPLACE.md M4: OpenAI's domain verification; src/wellknown.js) on
// the real local worker. The operator's tool runs as the operator runs it (its CLI, --local on the smoke's own state: the token lies
// in the worker's own KV, OAUTH_KV, never in D1, the code or env).
//   · none stored: GET /.well-known/openai-apps-challenge is the ordinary 404 not_found
//   · after `operator.mjs set-openai-challenge --token <t>`: 200 text/plain, exactly the token (no newline, no HTML, no JSON),
//     signed out and with a bearer alike; under an org's address the one not-here 404, never the token
//   · an org cannot take the name: POST /orgs with the address ".well-known" is refused (not a path name's form), before any read
//   · after `clear-openai-challenge`: 404 again; a second clear is refused
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { smoke, expect, brief, ownerKey, orgSlug, http, patientFetch, BASE } from "./lib.mjs";

const ENGINE = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const P = "/.well-known/openai-apps-challenge";
// op(...args) -> { rc, out }: the operator's CLI on the smoke's own local state (tools/smoke.sh's SMOKE_D1_PERSIST and SMOKE_D1_CFG)
async function op(...args) {
  const { SMOKE_D1_PERSIST: persist, SMOKE_D1_CFG: cfg } = process.env;
  expect(persist && cfg, "SMOKE_D1_PERSIST and SMOKE_D1_CFG (tools/smoke.sh sets both)");
  return new Promise((done) => execFile("node", [join(ENGINE, "tools", "operator.mjs"), ...args, "--local", persist, "--config", cfg], { encoding: "utf8", maxBuffer: 1 << 24 },
    (e, stdout, stderr) => done({ rc: e ? (typeof e.code === "number" ? e.code : 1) : 0, out: `${stdout || ""}${stderr || ""}` })));
}
// get(path, key) -> { status, type, body }: the answer exactly as sent (no org base taken off, nothing parsed)
async function get(path, key) {
  const r = await patientFetch(BASE + path, { headers: { accept: "*/*", ...(key ? { authorization: `Bearer ${key}` } : {}) }, redirect: "manual" });
  return { status: r.status, type: r.headers.get("content-type") || "", body: await r.text() };
}
// until(fn, ok) -> fn's last answer, asked again every half second until ok(it) or 15 s pass (the worker's KV read of the operator's write)
async function until(fn, ok, ms = 15000) {
  const t0 = Date.now();
  let a = await fn();
  while (!ok(a) && Date.now() - t0 < ms) { await new Promise((r) => setTimeout(r, 500)); a = await fn(); }
  return a;
}

smoke("challenge · GET /.well-known/openai-apps-challenge is 404 with no token stored; the operator's set makes it answer exactly the token as text/plain (signed out or with a bearer; never under an org's address); an org cannot take the name; clear makes it 404 again", async () => {
  const token = "oai-smoke-" + randomBytes(12).toString("base64url");
  // a token left by an earlier run on this state would mislead: none is expected on a fresh smoke
  const before = await get(P);
  let j = null; try { j = JSON.parse(before.body); } catch { j = null; }
  expect(before.status === 404 && j && j.error === "not_found", () => `none stored: ${before.status} ${before.body.slice(0, 160)}`);

  const set = await op("set-openai-challenge", "--token", token);
  expect(set.rc === 0 && set.out.includes(token), () => `set-openai-challenge: rc ${set.rc} ${set.out.slice(0, 300)}`);
  const on = await until(() => get(P), (a) => a.status === 200);
  const withKey = await get(P, ownerKey);
  expect(on.status === 200 && /^text\/plain\b/.test(on.type) && on.body === token && withKey.status === 200 && withKey.body === token,
    () => `after the set: ${on.status} ${on.type} ${JSON.stringify(on.body.slice(0, 80))} (want the token exactly); with a bearer ${withKey.status}`);
  const slug = orgSlug(1);
  const atOrg = await get(`/${slug}${P}`, ownerKey);
  expect(atOrg.status === 404 && !atOrg.body.includes(token), () => `under /${slug}: ${atOrg.status} ${atOrg.type} (want the one not-here 404, never the token)`);

  const taken = await http("POST", "/orgs", { body: { email: "nobody@challenge.invalid", password: "not-read", name: "Well Known", slug: ".well-known", project: "x" }, root: true });
  expect(taken.status === 422 && taken.json && taken.json.error === "bad_org" && taken.json.field === "slug", () => `POST /orgs slug .well-known: ${taken.status} ${brief(taken.json)}`);

  const clear = await op("clear-openai-challenge"), again = await op("clear-openai-challenge");
  expect(clear.rc === 0 && again.rc === 1, () => `clear-openai-challenge: rc ${clear.rc} then ${again.rc} (${again.out.slice(0, 200)})`);
  const off = await until(() => get(P), (a) => a.status === 404);
  expect(off.status === 404 && !off.body.includes(token), () => `after the clear: ${off.status} ${off.body.slice(0, 160)}`);
  return `404 with none stored; set → 200 ${on.type}, ${on.body.length} characters exactly (a bearer alike); /${slug}${P} the not-here 404; POST /orgs .well-known 422 slug; clear → 404, a second clear refused`;
});
