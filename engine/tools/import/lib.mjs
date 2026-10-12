// engine/tools/import/lib.mjs — the brain reader's plumbing: where the engine and the monorepo are, JSON bytes (D4: 2-space
// + "\n"), hashes, JSON pointers, the git clock (D4/D22), and a DataFault the CLI turns into exit 1.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const KIT_DIR = dirname(fileURLToPath(import.meta.url));
export const ENGINE = resolve(KIT_DIR, "..", "..");
export const MONO = resolve(ENGINE, "..");

export class DataFault extends Error {}
export const fault = (m) => { throw new DataFault(m); };

export const jsonBytes = (o) => Buffer.from(JSON.stringify(o, null, 2) + "\n");
export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// the contracts directory, by the one relocation rule (contracts/README.md): AGENT_R_CONTRACTS → ./contracts → ../contracts
export function contractsDir() {
  if (process.env.AGENT_R_CONTRACTS) return resolve(process.env.AGENT_R_CONTRACTS);
  for (const d of [join(ENGINE, "contracts"), join(MONO, "contracts")]) if (existsSync(d)) return d;
  return join(MONO, "contracts");
}

// a JSON pointer (RFC 6901) into a parsed document; "" is the document itself
export function pointerGet(doc, ptr, what) {
  if (ptr === "" || ptr === "/") return doc;
  if (!String(ptr).startsWith("/")) fault(`${what}: pointer ${JSON.stringify(ptr)} must start with /`);
  let cur = doc;
  for (const raw of String(ptr).slice(1).split("/")) {
    const k = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (cur == null || typeof cur !== "object" || !(k in cur)) fault(`${what}: pointer ${ptr} names nothing`);
    cur = cur[k];
  }
  return cur;
}

// the brain as a reader: every read is relative to the brain and recorded as a declared source (D4's clock)
export function brainReader(brain) {
  const sources = new Set();
  const abs = (rel) => {
    const p = resolve(brain, rel);
    if (p !== brain && !p.startsWith(brain + "/")) fault(`${rel}: outside the brain`);
    return p;
  };
  const r = {
    brain, sources,
    has: (rel) => existsSync(abs(rel)),
    text(rel, what) {
      const p = abs(rel);
      if (!existsSync(p) || statSync(p).isDirectory()) fault(`${what || rel}: ${rel} is not a file in the brain`);
      sources.add(rel);
      return readFileSync(p, "utf8");
    },
    bytes(rel, what) {
      const p = abs(rel);
      if (!existsSync(p) || statSync(p).isDirectory()) fault(`${what || rel}: ${rel} is not a file in the brain`);
      sources.add(rel);
      return readFileSync(p);
    },
    json(rel, what) {
      const t = r.text(rel, what);
      try { return JSON.parse(t); } catch (e) { return fault(`${what || rel}: ${rel} is not JSON (${e.message})`); }
    },
    list(rel, what) {
      const p = abs(rel);
      if (!existsSync(p) || !statSync(p).isDirectory()) fault(`${what || rel}: ${rel} is not a directory in the brain`);
      sources.add(rel);
      return readdirSync(p).sort();
    },
  };
  return r;
}

// D4/D22: the committer time (UTC, …Z) of the newest commit touching any declared source; git's rule (uncommitted edits do
// not count). null when git knows none of them.
export function gitPublishedAt(brain, sources) {
  const list = [...sources].sort();
  if (!list.length) return null;
  const r = spawnSync("git", ["-C", brain, "log", "-1", "--format=%cI", "--", ...list], { encoding: "utf8" });
  const t = (r.status === 0 ? r.stdout : "").trim();
  return t ? isoZ(t) : null;
}
export function isoZ(t) {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) fault(`--at ${JSON.stringify(t)} is not a date`);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// walk(dir) -> sorted relative file paths
export function walk(dir, pre = "") {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), pre + e.name + "/") : [pre + e.name]));
}
