#!/usr/bin/env node
// tools/ship/oauth-grants-check.mjs — READ-ONLY: which OAuth grants the deployment's grant store (OAUTH_KV) holds that were
// minted BEFORE connections carried their credentials' stamp (sprint 3's G2, e632fd8bc; on live from the sprint-3 ship,
// f78b12a8 at 100% on 2026-10-04 at about 00:30 UTC). Sprint 7, 7.5b refuses such a grant at the door (src/core.js
// resolveReader: no stamp, no reader; src/mcp.js callerOf: 401 invalid_token with src/oauthgrants.js STAMPLESS_WORDS), so each
// one listed here is a connection whose holder must connect again once 7.5b's code is live. Run it before the code ships, and
// tell those people (or accept the re-connect).
//
// WHY THE AGE DECIDES IT: a grant's props are encrypted with a key wrapped by its own tokens, so the store cannot be read for
// the stamp itself; its record's plaintext createdAt can. Every grant minted by the code since G2 carries the stamp (a seat
// grant credEpoch: never null, people.key_hash is NOT NULL; an account grant accountCred, 7.5a), and none minted before does
// ({personId, scope}; {personId} before 2026-08-28). The ship's canary ran both versions for a few minutes before 100%, so a
// grant created before STAMP_SINCE is counted as possibly stamp-less (the count errs towards more re-connects, never fewer).
// A grant lives 30 days from its creation (src/oauthgrants.js REFRESH_TOKEN_TTL_S: the provider caps every refresh at the
// grant's expiry and stores the record with that TTL), so after 2026-11-03 01:00 UTC none can remain — unless a grant was
// stored with no expiry at all, which this check lists too.
//
//   node tools/ship/oauth-grants-check.mjs [--config wrangler.jsonc]   lists the store (wrangler kv key list --remote, then
//                                                                     kv key get --remote for each grant: reads only)
//   node tools/ship/oauth-grants-check.mjs --selftest                   the classification on fixtures (no network)
// Prints counts and, per possibly stamp-less grant, its person id, created and expiry times and the app's name (never a token,
// never the encrypted props). Exit 0: none; 3: some listed (the ship goes on, the people are told); 1: the store could not be read.
import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const STAMP_SINCE = "2026-10-04T01:00:00Z";   // after the sprint-3 code (f78b12a8) took 100%
export const STAMP_SINCE_S = Math.floor(Date.parse(STAMP_SINCE) / 1000);

// classifyGrants(records, { now }) -> { total, live, stamped, stampless: [{ userId, createdAt, expiresAt, name }], noExpiry }
//   records: the grant store's records as stored (JSON: { id, userId, createdAt (s), expiresAt? (s), metadata? })
export function classifyGrants(records, { now = Math.floor(Date.now() / 1000) } = {}) {
  const out = { total: 0, live: 0, stamped: 0, stampless: [], noExpiry: 0 };
  for (const g of Array.isArray(records) ? records : []) {
    if (!g || typeof g !== "object") continue;
    out.total++;
    const exp = Number.isFinite(Number(g.expiresAt)) ? Number(g.expiresAt) : null;
    if (exp != null && exp <= now) continue;   // ended (the store drops it with its TTL)
    out.live++;
    if (exp == null) out.noExpiry++;
    const at = Number(g.createdAt);
    // a 7.5a grant names its kind in its plaintext metadata (src/oauth.js): stamped whatever its age
    const kindNamed = g.metadata && typeof g.metadata === "object" && typeof g.metadata.grant === "string";
    if (!kindNamed && (!Number.isFinite(at) || at < STAMP_SINCE_S)) {
      out.stampless.push({ userId: String(g.userId || "?"), createdAt: Number.isFinite(at) ? new Date(at * 1000).toISOString() : "?",
        expiresAt: exp != null ? new Date(exp * 1000).toISOString() : "never", name: String((g.metadata && g.metadata.name) || "").slice(0, 60) });
    } else out.stamped++;
  }
  return out;
}

const run = (args) => new Promise((done) => execFile("npx", ["wrangler", ...args], { cwd: ENGINE, maxBuffer: 1 << 26, env: process.env },
  (e, stdout, stderr) => done({ rc: e ? (typeof e.code === "number" ? e.code : 1) : 0, out: String(stdout || ""), err: String(stderr || "") })));

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) return selftest();
  const i = argv.indexOf("--config"), config = i >= 0 ? argv[i + 1] : "wrangler.jsonc";
  const base = ["--binding", "OAUTH_KV", "--remote", "--config", config];
  const l = await run(["kv", "key", "list", "--prefix", "grant:", ...base]);
  let keys; try { keys = JSON.parse(l.out); } catch { keys = null; }
  if (l.rc || !Array.isArray(keys)) { console.log(`✗ the grant store could not be listed (rc ${l.rc}): ${(l.err || l.out).slice(0, 300)}`); process.exit(1); }
  const records = [];
  for (const k of keys) {
    const g = await run(["kv", "key", "get", String(k.name), ...base]);
    let rec; try { rec = JSON.parse(g.out); } catch { rec = null; }
    if (g.rc || !rec) { console.log(`✗ the grant ${String(k.name).split(":").slice(0, 2).join(":")}:… could not be read (rc ${g.rc})`); process.exit(1); }
    records.push(rec);
  }
  const c = classifyGrants(records);
  console.log(`OAuth grants in the store: ${c.total} (${c.live} live: ${c.stamped} carry the stamp, ${c.stampless.length} were minted before it${c.noExpiry ? `, ${c.noExpiry} with no expiry` : ""})`);
  for (const g of c.stampless) console.log(`  · ${g.userId} — created ${g.createdAt}, ends ${g.expiresAt}${g.name ? `, ${g.name}` : ""}: refused once 7.5b is live (its holder connects again)`);
  process.exit(c.stampless.length ? 3 : 0);
}

function selftest() {
  let fail = 0;
  const eq = (got, want, label) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`); };
  const now = Date.parse("2026-10-10T00:00:00Z") / 1000, d = 86400;
  const g = (created, o = {}) => ({ id: "g", userId: "p-1", createdAt: Date.parse(created) / 1000, expiresAt: Date.parse(created) / 1000 + 30 * d, ...o });
  const c = classifyGrants([
    g("2026-09-20T10:00:00Z"),                                   // before the stamp, live
    g("2026-10-04T00:10:00Z"),                                   // during the canary: counted possibly stamp-less
    g("2026-10-05T09:00:00Z", { metadata: { name: "claude.ai" } }),  // after: stamped
    g("2026-10-08T09:00:00Z", { metadata: { grant: "account" } }),   // 7.5a: names its kind
    g("2026-08-30T10:00:00Z"),                                   // before the stamp, ended 2026-09-29
    { id: "g", userId: "p-2", createdAt: Date.parse("2026-09-01T00:00:00Z") / 1000 },   // no expiry: listed
  ], { now });
  eq([c.total, c.live, c.stamped, c.stampless.length, c.noExpiry], [6, 5, 2, 3, 1], "the counts: 6 stored, 5 live, 2 stamped, 3 minted before the stamp (one with no expiry)");
  eq(c.stampless.map((x) => x.createdAt.slice(0, 10)), ["2026-09-20", "2026-10-04", "2026-09-01"], "the stamp-less ones, by their creation");
  eq(classifyGrants([g("2026-10-04T00:10:00Z", { metadata: { grant: "seat" } })], { now }).stamped, 1, "a grant naming its kind (7.5a) is stamped whatever its age");
  console.log(`${fail ? "✗" : "✓"} oauth-grants-check selftest: ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
