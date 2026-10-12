// u5-leftovers-selftest.mjs — the ratchet for batch U5 (the engine leftovers the two-project work found). Offline,
// exit 1 on any failure. Locks, per item:
//   1  `brief` with no `for` (D5) reads the project's role briefs in D1 (the docs capsules/<role>.md):
//      a project whose one brief is platform's gives the owner the platform brief, never unknown_brief. The MCP
//      resources/list names are plain.
//   2  evals.sh probes no brain file: the suites start like the smoke (D5), so no HAS_* switch turns cases on or off.
// Run in the gate.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { callTool } from "../src/mcp.js";
import { DatabaseSync } from "node:sqlite";
import { d1Of } from "./fixtures/home-d1.mjs";

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..");
let bad = 0, n = 0;
const ok = (cond, label) => { n++; if (cond) console.log("  ✓ " + label); else { bad++; console.log("  ✗ " + label); } };

const OWNER = { id: "p-owner", name: "Olive Owner", role: "owner" };
// brief through the real callTool on a real schema (boot.sql): one project, its role briefs in k_docs
function capsuleEnv(docs) {
  const d = new DatabaseSync(":memory:");
  d.exec(readFileSync(join(ENGINE, "boot.sql"), "utf8"));
  const at = "2026-09-30T00:00:00Z";
  d.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('p-owner','Olive Owner','o@x.test','owner','h',1,?,1)").run(at);
  d.prepare("INSERT INTO projects (key,name,active,created_at) VALUES ('demo','Demo',1,?)").run(at);
  for (const [path, body] of Object.entries(docs)) d.prepare("INSERT INTO k_docs (project,path,title,body_md,role_visibility,created_by,created_at,updated_by,updated_at) VALUES ('demo',?,NULL,?,NULL,'p-owner',?,'p-owner',?)").run(path, body, at, at);
  return { BRAIN: { get: async () => null }, DB: d1Of(d), [Symbol.for("sharingu.project")]: "demo" };
}
const capsuleCall = async (docs, args = {}) => callTool("brief", args, OWNER, capsuleEnv(docs), new URL("https://x/mcp"), [{ name: "brief" }]);
const body = (r) => (r && r.brief ? r.brief.body : r);

// ---- 1 · the role's brief and the resource names ----
{ // brief with no `for` through the real callTool, on a project whose one role brief is platform's (no economics, no owner)
  const r = await capsuleCall({ "capsules/platform.md": "# platform brief" });
  ok(body(r) === "# platform brief", "1f brief, the project's one role brief platform's: the owner gets the platform brief, not unknown_brief (got " + JSON.stringify(r).slice(0, 80) + ")");
  const o = await capsuleCall({ "capsules/platform.md": "# platform brief", "capsules/owner.md": "# owner brief" });
  ok(body(o) === "# owner brief", "1g brief: the owner's own brief (capsules/owner.md) wins when the project files one");
  const u = await capsuleCall({ "capsules/platform.md": "# platform brief" }, { role: "nope" });
  ok(u && u.error === "unknown_brief" && JSON.stringify(u.briefs) === '["platform"]', "1h an explicit unknown role answers unknown_brief, naming the briefs there are");
}
{ // the resources/list names, read from the one block that builds them
  const src = readFileSync(join(ENGINE, "src/mcp.js"), "utf8");
  const i = src.indexOf('rq.method === "resources/list"'), j = src.indexOf("return resOk({ resources })", i);
  const block = i >= 0 && j > i ? src.slice(i, j) : "";
  const names = [...block.matchAll(/name: "([^"]*)"/g)].map((m) => m[1]);
  ok(names.length >= 3, "1i resources/list block found (" + names.length + " names)");
  ok(names.length >= 3 && !names.some((s) => /Venture|M-ADR/.test(s)), "1j resources/list names are plain: no 'Venture', no 'M-ADR' (" + names.join(" | ") + ")");
  ok(/uri: "brain:\/\/updates"/.test(block) && /uri: "brain:\/\/goals"/.test(block), "1k the resource URIs are D5's (brain://updates, brain://goals)");
}

// ---- 2 · the suites probe no brain (D5: they start like the smoke, their fixtures filed through preview then file) ----
{
  const ev = readFileSync(join(ENGINE, "evals.sh"), "utf8");
  ok(!/^HAS_(SCREENS|CANVAS|PACK|CONSTITUTION|PERSONA)=/m.test(ev) && !/canon\/screens\.json/.test(ev), "2 evals.sh probes no brain file (no HAS_* switch, no canon/screens.json)");
}


console.log(bad ? `✗ u5-leftovers selftest: ${bad}/${n} failed` : `✓ u5-leftovers selftest: ${n}/${n}`);
process.exit(bad ? 1 : 0);
