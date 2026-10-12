// engine/tools/import/docs.mjs — the served docs → `doc` ops, bodies verbatim. The path is the served path without its
// `serve/` prefix: every serve/capsules/*.md → capsules/<name>.md; every kit.copies target (e.g.
// lib/docs/leader-questionnaire.md); serve/lib/understanding.json → lib/understanding.json (a JSON body, kept as text).
import { result, firstH1 } from "./common.mjs";

// op field ← source (the door: schema.js KINDS.doc)
export const DOC_MAP = {
  path: "the served path minus `serve/`",
  title: "the body's first `# ` heading, verbatim; else the path",
  body: "the file's text, verbatim",
  roleVisibility: "capsules: the kit's capsule card kind roleVisibility when it declares one; else null (every seated reader)",
};

export function mapDocs(src) {
  const r = result();
  for (const d of src.docs) {
    r.count("doc");
    const isCapsule = d.path.startsWith("capsules/");
    const title = firstH1(d.body) ?? d.path;
    r.add("doc", { path: d.path, title, body: d.body, roleVisibility: isCapsule ? src.capsuleRoles || null : null });
    if (d.path.endsWith(".json")) r.note("doc", `${d.path}: a JSON file filed as a doc body (text, verbatim)`);
  }
  if (!src.docs.length) r.skip("doc", "the brain serves no capsules, copies or understanding", "-");
  return r;
}
