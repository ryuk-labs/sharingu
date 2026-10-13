// tools/smoke/s61-plain-note-default.mjs — sprint 21, the plain note's default kind (the owner's ruling, 2026-10-13: in lane
// leader a contribution with no kind IS a plain note), on the real local worker. Self-contained: its own project (s61<tag>), a
// member seated on it. The bug it pins: a client sent lane leader, what and why (no kind, no touches), the preview answered
// "needs touches" and file_contribution refused not_ready, though the door's hints say touches may be left out of a plain note.
//   · as the member: preview {contribution: {lane: "leader", what, why}} files (not needs); file_contribution files it; read
//     answers kind "note"
//   · the rule is unchanged elsewhere: a code-lane contribution with no kind and no touches still needs touches (the preview),
//     and file_contribution answers not_ready, nothing filed
import { randomBytes } from "node:crypto";
import { smoke, expect, brief, http, mcp, ownerKey, readTx, contributions } from "./lib.mjs";

const TAG = randomBytes(2).toString("hex");
const P = `s61${TAG}`;
const q = {};
const invite = async (name, email, role, projects) => {
  const r = await http("POST", "/control", { key: ownerKey, form: [["action", "add-person"], ["name", name], ["email", email], ["role", role], ...projects.map((p) => ["projectKey", p])] });
  const key = (r.text.match(/API key\): ([0-9a-f]{40})/) || [])[1];
  if (!key) throw new Error(`invite ${email}: no key (HTTP ${r.status})`);
  return key;
};

smoke("plain note default: a member's leader contribution with no kind and no touches previews files, files, and reads kind note", async () => {
  const cp = await mcp(ownerKey, "create_project", { key: P, name: `Plain ${P}` });
  expect(cp.out && cp.out.project && cp.out.project.key, `create_project: ${brief(cp.out)}`);
  q.member = await invite("S61 Mo", `mo${TAG}@s61.local`, "member", [P]);
  const items = [{ contribution: { lane: "leader", what: "S61 we sell per project", why: "Teams share seats; a project is what they buy." } }];
  const pv = await mcp(q.member, "preview", { project: P, items });
  const it = ((pv.out && pv.out.items) || [])[0] || {};
  expect(!pv.isError && pv.out.previewId && it.verdict === "files" && it.filesWith === "file_contribution", `the preview: ${brief(pv.out)}`);
  const f = await mcp(q.member, "file_contribution", { previewId: pv.out.previewId, items });
  const filed = ((f.out && f.out.items) || [])[0] || {};
  const id = filed.filed && filed.filed.id;
  expect(!f.isError && f.out.complete && /^T-\d{8}-\d+$/.test(id || ""), `file_contribution: ${brief(f.out)}`);
  const r = (await readTx(q.member, id, P)).out;
  expect(r && r.kind === "note" && r.lane === "leader", `read ${id}: ${brief(r)}`);
  return `${id}: preview files, filed, read kind note`;
});

smoke("plain note default: a code contribution with no kind and no touches still needs touches; file_contribution answers not_ready, nothing filed", async () => {
  const what = "S61 code with nothing it touches";
  const items = [{ contribution: { lane: "code", what, why: "The rule outside lane leader is unchanged." } }];
  const pv = await mcp(q.member, "preview", { project: P, items });
  const it = ((pv.out && pv.out.items) || [])[0] || {};
  expect(!pv.isError && it.verdict === "needs" && it.needs && (it.needs.fields || [it.needs.field]).includes("touches"), `the preview: ${brief(pv.out)}`);
  const f = await mcp(q.member, "file_contribution", { previewId: pv.out.previewId, items });
  expect(f.isError && f.out.error === "not_ready", `file_contribution: ${brief(f.out)}`);
  expect(!(await contributions(q.member, P)).some((x) => x.what === what), "a code contribution with no touches was filed");
  return `needs ${(it.needs.fields || [it.needs.field]).join("+")}; not_ready, nothing filed`;
});
