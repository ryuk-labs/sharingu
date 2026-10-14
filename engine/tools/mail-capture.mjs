#!/usr/bin/env node
// tools/mail-capture.mjs — reads THE LOCAL CAPTURE (sprint 21, 21.4a; src/email.js THE MAILER): every email a local worker (its config's
// MAIL_CAPTURE var, written by tools/lib-r-local.sh) or the operator's tool --local "sent" lies in that worker's own OAUTH_KV under
// mail-capture:<when>:<id>, and nothing left the machine. Read-only.
//
//   node tools/mail-capture.mjs --local <persist dir> --config <wrangler config> [--to <email>] [--json] [--html-dir <dir>]
//     (no flag)    one line per email, oldest first: when, to, subject — never a link (a link carries a token)
//     --json       every email whole, as JSON on stdout (a smoke reads it in-process and never prints it: its links hold tokens)
//     --html-dir   each email's HTML written to <dir>/<n>-<subject>.html for a screenshot, every token in it replaced by "…"
// Exit: 0 · 2 usage.
import { mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig } from "./org-undo.mjs";
import { localKV } from "./operator.mjs";
import { MAIL_CAPTURE_PREFIX } from "../src/email.js";

// readCaptured(KV, { to }) -> [{ at, to, cc, from, subject, html, text }], in the order sent (the keys' own order)
export async function readCaptured(KV, { to = "" } = {}) {
  const out = [];
  let cursor;
  do {
    const page = await KV.list({ prefix: MAIL_CAPTURE_PREFIX, ...(cursor ? { cursor } : {}) });
    for (const k of page.keys || []) {
      const v = await KV.get(k.name);
      try { out.push(JSON.parse(v)); } catch { /* not a capture */ }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  const want = String(to || "").toLowerCase().trim();
  return out.filter((m) => !want || [].concat(m.to || []).some((t) => String(t).toLowerCase() === want));
}
// masked(html) -> the HTML with every link token (48 hex characters) replaced by "…"
export const masked = (s) => String(s || "").replace(/[0-9a-f]{48}/g, "…");

async function main(argv) {
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined; };
  const persist = flag("--local"), cfgPath = flag("--config");
  if (!persist || !cfgPath) { console.error("usage: node tools/mail-capture.mjs --local <persist dir> --config <wrangler config> [--to <email>] [--json] [--html-dir <dir>]"); return 2; }
  const cfg = readConfig(cfgPath);
  const ns = (cfg.kv_namespaces || []).find((b) => b.binding === "OAUTH_KV");
  if (!ns) { console.error(`${cfgPath}: no OAUTH_KV namespace (the local capture lies there)`); return 2; }
  const kb = await localKV(persist, ns);
  try {
    const mails = await readCaptured(kb.KV, { to: flag("--to") });
    if (argv.includes("--json")) { process.stdout.write(JSON.stringify(mails) + "\n"); return 0; }
    const dir = flag("--html-dir");
    if (dir) mkdirSync(dir, { recursive: true });
    mails.forEach((m, i) => {
      console.log(`${m.at}  ${[].concat(m.to || []).join(", ")}${m.cc ? ` (cc ${[].concat(m.cc).join(", ")})` : ""}  ${m.subject}`);
      if (dir) writeFileSync(join(dir, `${String(i + 1).padStart(2, "0")}-${String(m.subject || "mail").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.html`), masked(m.html));
    });
    if (!mails.length) console.log("no email in the local capture");
    return 0;
  } finally { await kb.close(); }
}
const runDirectly = () => { try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] || ""); } catch { return false; } };
if (runDirectly()) main(process.argv.slice(2)).then((rc) => process.exit(rc), (e) => { console.error(`✗ ${String((e && e.message) || e)}`); process.exit(1); });
