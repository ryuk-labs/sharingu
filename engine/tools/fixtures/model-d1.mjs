// tools/fixtures/model-d1.mjs — a project's model filed into a SQLite D1 (boot.sql's k_nodes, k_edges, k_checks) the way
// the importer files it: a canvas-shaped fixture (tools/fixtures/*-canvas.json, the brain's published model trimmed) goes
// through the importer's OWN mappers (tools/import/model.mjs + flows.mjs) and each op lands as the write door would store
// it. The Map then reads it back through src/knowledge/canvas.js: a round trip, no hand-typed rows.
import { mapModel } from "../import/model.mjs";
import { mapFlows } from "../import/flows.mjs";

const AT = "2026-09-30T00:00:00.000Z";
const js = (v) => (v == null ? null : JSON.stringify(v));

// modelOps(canvas) -> { nodes, edges }: the node and edge ops the importer builds from a canvas (its flows included)
export function modelOps(canvas) {
  const m = mapModel({ board: { model: canvas } });
  const known = new Set(m.ops.filter((o) => o.kind === "node").map((o) => o.data.id));
  const f = mapFlows({ flows: canvas.flows || [] }, known);
  const ops = [...m.ops, ...f.ops];
  return { nodes: ops.filter((o) => o.kind === "node").map((o) => o.data), edges: ops.filter((o) => o.kind === "edge").map((o) => o.data) };
}

// seedModel(sqlite, project, canvas, { by, entities }) -> { nodes, edges } — files the canvas's model into `project`.
// entities: true adds one entity per table (a fixture trimmed to tables and relations carries none, and a relation joins
// two entities), as the brain's model has one per table.
export function seedModel(sqlite, project, canvas, { by = "p-owner", entities = false } = {}) {
  const cv = entities && !(canvas.entities || []).length
    ? { ...canvas, entities: (canvas.tables || []).map((t) => ({ id: t.name, label: t.name.replace(/_/g, " "), table: t.name })) } : canvas;
  const { nodes, edges } = modelOps(cv);
  const N = sqlite.prepare("INSERT INTO k_nodes (project,id,type,name,status,data,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
  for (const n of nodes) N.run(project, n.id, n.type, n.name, n.status ?? null, js(n.data), by, AT, by, AT);
  const E = sqlite.prepare("INSERT INTO k_edges (project,from_id,to_id,kind,label,data,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
  for (const e of edges) E.run(project, e.from, e.to, e.kind, e.label ?? null, js(e.data), by, AT, by, AT);
  return { nodes, edges };
}

// seedChecks(sqlite, project, checks, { by }) — k_checks rows (the triggers fill k_check_refs): [{ id, title, refs }]
export function seedChecks(sqlite, project, checks, { by = "p-owner" } = {}) {
  const C = sqlite.prepare("INSERT INTO k_checks (project,id,title,then_,refs,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?)");
  for (const c of checks) C.run(project, c.id, c.title || c.id, c.then ?? null, js(c.refs || []), by, AT, by, AT);
}

// seedGrade(sqlite, project, checkId, verdict, { by, at }) — one check_results row (the grade as submit_grade records it)
export function seedGrade(sqlite, project, checkId, verdict, { by = "p-owner", at = AT } = {}) {
  sqlite.prepare("INSERT INTO check_results (project,pack_version,check_id,status,transmission_id,graded_by,graded_at) VALUES (?,?,?,?,?,?,?)").run(project, "live", checkId, verdict, null, by, at);
}
