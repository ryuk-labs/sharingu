// src/knowledge/gtm.js — a project's GTM template (k_gtm), the one reader GTM reads it through.
import { projectOf } from "../project.js";
import { getKnowledge } from "./store.js";

// gtmTemplate(env) — the project's GTM template (k_gtm, filed with preview then save_knowledge kind "gtm"): the request's project
// (project.js projectOf), its template object, or null when none is filed (GET /gtm then answers 200 with template
// null and the sentence naming the op). One statement, memoized per request (src/knowledge/store.js getKnowledge). The
// engine names no kind: the kinds, their order and what each holds are the template's.
export async function gtmTemplate(env) {
  const project = await projectOf(env);
  if (!project) return null;
  const row = await getKnowledge(env, project, "gtm", null);
  const t = row && row.template;
  return t && typeof t === "object" && !Array.isArray(t) ? t : null;
}
