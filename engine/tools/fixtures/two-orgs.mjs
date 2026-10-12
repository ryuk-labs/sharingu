// tools/fixtures/two-orgs.mjs — the second org everywhere (sprint 6, 6.6; docs/plan/PLATFORM.md §3: "no second org in any
// fixture, smoke, suite or the dry run"). Every world a test builds holds TWO orgs: org A, the usual org 1 (bare project keys),
// and org B, a second org with its own owner, member and projects (keys o<id>--<slug>, src/project.js), so a statement that
// forgets the org shows up as a row of the other org.
//   orgDef(id, word, o)        one org's shape: its name, its project slugs, its owner and member (ids, names and emails carry
//                              `word`, so a leak of the org's people reads as that word), their keys (random, never printed)
//   twoOrgWorker({ a, b, src }) the REAL worker (tools/fixtures/sqlite-worker.mjs: src/index.js over node:sqlite) holding both
//   orgSql(def, { at, eval, settings, data })
//                              the same org as SQL, for a database no door seeds (the dry run's copy, tools/migrate-dryrun.sh;
//                              a local D1 through wrangler): its org row (not org 1's: that row is the seed's), projects, people
//                              and seats, and with `data` a little of everything an org holds (a goal, a question, a
//                              contribution and its events row), written as the door writes them (every org column stamped)
//   node tools/fixtures/two-orgs.mjs sql <id> <word>   prints orgSql(orgDef(id, word), { data: true }) (the dry run's org B)
import { createHash, randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sha = (s) => createHash("sha256").update(s).digest("hex");
// q(v) -> a SQL literal; two dashes inside a quoted string are written char(45, 45) (wrangler's statement splitter reads
// '--' as a comment opener: the sprint-6 scar, engine/CLAUDE.md), so an o<id>--<slug> key loads through wrangler as through SQLite
const q = (v) => (v == null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''").split("--").join("' || char(45, 45) || '")}'`);
const T0 = "2026-09-01T00:00:00.000Z";
// orgKey(id, slug) -> a project's key in org `id` (org 1's bare; src/project.js projectKeyOf's form for every other org)
export const orgKey = (id, slug) => (id === 1 ? slug : `o${id}--${slug}`);

// orgDef(id, word, { name, projects }) -> { id, name, word, projects: [slug], owner, member, people: [[id, name, role, key, seats]] }
export function orgDef(id, word, o = {}) {
  const w = String(word).toLowerCase();
  const key = () => randomBytes(20).toString("hex");
  const projects = o.projects || ["shop", `${w}-desk`];
  const owner = { id: `${w}-owner-${id}`, name: `Owner ${word}`, email: `owner-${w}@org${id}.test`, role: "owner", key: key(), seats: [] };
  const member = { id: `${w}-member-${id}`, name: `Member ${word}`, email: `member-${w}@org${id}.test`, role: "member", key: key(), seats: [projects[0]] };
  return { id, name: o.name || `Org ${word}`, word: w, projects, owner, member, people: [owner, member].map((p) => [p.id, p.name, p.role, p.key, p.seats, p.email]) };
}

// twoOrgWorker({ a, b, src }) -> the worker (sqlite-worker.mjs's answer) with org A (a.id must be 1) and org B in one database;
// each person's email is the def's (the worker's own default is <id>@x.test), set at the insert (sprint 7: it names the
// seat's account, migrate-070)
export async function twoOrgWorker({ a, b, src } = {}) {
  if (!a || a.id !== 1 || !b || b.id === 1) throw new Error("twoOrgWorker: org A is org 1, org B another");
  const { sqliteWorker } = await import("./sqlite-worker.mjs");   // loaded only for a worker: the SQL needs none of it
  return sqliteWorker({ org: a.name, projects: a.projects, people: a.people, orgs: [{ id: b.id, name: b.name, projects: b.projects, people: b.people }], src });
}

// orgSql(def, { at, eval, settings, data }) -> SQL text seeding one org (never org 1's row: org 1 is the seed's own)
export function orgSql(d, { at = T0, eval: ev = false, settings = null, data = false } = {}) {
  const out = [];
  if (d.id !== 1) out.push(`INSERT INTO org (id, name, settings, created_at, updated_at) VALUES (${d.id}, ${q(d.name)}, ${q(settings ? JSON.stringify(settings) : null)}, ${q(at)}, ${q(at)});`);
  for (const slug of d.projects) out.push(`INSERT INTO projects (key, name, active, created_at, eval) VALUES (${q(orgKey(d.id, slug))}, ${q(slug)}, 1, ${q(at)}, ${ev ? 1 : 0});`);
  for (const p of [d.owner, d.member]) {
    out.push(`INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES (${q(p.id)}, ${q(p.name)}, ${q(p.email)}, ${q(p.role)}, ${q(sha(p.key))}, 1, ${q(at)}, ${d.id});`);
    for (const s of p.seats) out.push(`INSERT INTO project_seats (person_id, project_key, role, created_at) VALUES (${q(p.id)}, ${q(orgKey(d.id, s))}, 'member', ${q(at)});`);
  }
  if (data) {
    const p = orgKey(d.id, d.projects[0]), tx = `T-20260901-${d.id}${String(d.id).padStart(2, "0")}`;
    out.push(`INSERT INTO k_goals (project, id, parent, title, created_by, created_at, updated_by, updated_at) VALUES (${q(p)}, ${q(`${d.word}-root`)}, NULL, ${q(`Grow ${d.word}`)}, ${q(d.owner.id)}, ${q(at)}, ${q(d.owner.id)}, ${q(at)});`);
    out.push(`INSERT INTO k_questions (project, qid, question, status, created_by, created_at, updated_by, updated_at) VALUES (${q(p)}, ${q(`Q-${d.word}-1`)}, ${q(`Which way for ${d.word}?`)}, 'open', ${q(d.owner.id)}, ${q(at)}, ${q(d.owner.id)}, ${q(at)});`);
    out.push(`INSERT INTO transmission (id, submitter, lane, kind, what, why, route, status, eval, project, client_ref, created_at, org) VALUES (${q(tx)}, ${q(d.member.id)}, 'leader', 'note', ${q(`A note of ${d.word}`)}, 'the second org holds a filing', 'auto', 'routed', 0, ${q(p)}, ${q(`${d.word}-ref-1`)}, ${q(at)}, ${d.id});`);
    out.push(`INSERT INTO events (id, person_id, kind, payload_json, created_at, project, org) VALUES (${q(`ev-${d.word}-1`)}, ${q(d.member.id)}, 'pr', ${q(JSON.stringify({ transmissionId: tx }))}, ${q(at)}, ${q(p)}, ${d.id});`);
  }
  return out.join("\n") + "\n";
}

// run as a script (its path compared real path to real path: a temp dir behind a symlink, as macOS's /var is, still runs it)
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, id, word] = process.argv.slice(2);
  if (cmd !== "sql" || !/^[2-9][0-9]*$/.test(id || "") || !/^[a-z]{3,20}$/.test(word || "")) {
    console.error("usage: node tools/fixtures/two-orgs.mjs sql <org id ≥ 2> <word: 3-20 lowercase letters>");
    process.exit(2);
  }
  process.stdout.write(orgSql(orgDef(Number(id), word), { data: true }));
}
