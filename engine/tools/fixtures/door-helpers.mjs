// tools/fixtures/door-helpers.mjs — the two writes a selftest makes through the door, as any client makes them since D5:
// preview, then file with the same items (src/preview.js). `mcp(name, args, key)` is the selftest's own door call, answering
// { status?, out, isError? }. Each helper answers the same shape, the out of `file` with the filed item's fields lifted to the
// top (id, route), so a test reads `.out.id` as it did; a refusal at either step is answered as it came, with `step`.
//   contribute(mcp, { project?, ...contribution }, key)   one contribution: { contribution: {lane, kind, what, why, …} }
//   fileItems(mcp, { project?, items, clientRef?, eval? }, key)   any items (knowledge ops, contributions, grades, answers)
export async function fileItems(mcp, { project, items, clientRef, eval: ev, only }, key) {
  const pv = await mcp("preview", { ...(project !== undefined ? { project } : {}), items, ...(clientRef ? { clientRef } : {}), ...(ev ? { eval: true } : {}) }, key);
  if (!pv || !pv.out || !pv.out.previewId) return { ...(pv || {}), step: "preview" };
  const f = await mcp("file", { previewId: pv.out.previewId, items, ...(only ? { only } : {}) }, key);
  const r = (f && f.out && Array.isArray(f.out.results) && f.out.results[0]) || {};
  const it = (f && f.out && Array.isArray(f.out.items) && f.out.items[0] && f.out.items[0].filed) || {};
  return { ...f, preview: pv.out, out: f && f.out && !f.out.error ? { ...f.out, id: r.id || it.id || null, route: it.route || null, status: r.status || null } : f && f.out, step: "file" };
}
export const contribute = (mcp, { project, clientRef, eval: ev, ...c }, key) =>
  fileItems(mcp, { project, items: [{ contribution: { ...c, ...(clientRef ? { clientRef } : {}) } }], ...(ev ? { eval: true } : {}) }, key);
