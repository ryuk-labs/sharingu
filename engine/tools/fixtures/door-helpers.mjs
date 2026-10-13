// tools/fixtures/door-helpers.mjs — the two writes a selftest makes through the door, as any client makes them since D5 (split
// in sprint 19): preview, then each part with the write tool its items name (src/preview.js: file_contribution, save_knowledge,
// remove_knowledge, each with the previewId and its items as previewed). `mcp(name, args, key)` is the selftest's own door call,
// answering { status?, out, isError? }. Each helper answers the same shape: the parts' receipts as one (their items and results
// together, complete when every part is), the first filed item's fields lifted to the top (id, route), so a test reads `.out.id`
// as it did; a refusal at any step is answered as it came, with `step` (preview, or the tool that refused).
//   contribute(mcp, { project?, ...contribution }, key)   one contribution: { contribution: {lane, kind, what, why, …} }
//   fileItems(mcp, { project?, items, clientRef?, eval? }, key)   any items a preview takes (contributions, knowledge upserts and removes)
export async function fileItems(mcp, { project, items, clientRef, eval: ev, only }, key) {
  const pv = await mcp("preview", { ...(project !== undefined ? { project } : {}), items, ...(clientRef ? { clientRef } : {}), ...(ev ? { eval: true } : {}) }, key);
  if (!pv || !pv.out || !pv.out.previewId) return { ...(pv || {}), step: "preview" };
  let last = null;
  const all = { items: [], results: [] };
  for (const p of pv.out.parts || []) {
    const f = await mcp(p.tool, { previewId: pv.out.previewId, items: p.items.map((n) => items[n - 1]), ...(only ? { only } : {}) }, key);
    if (!f || !f.out || f.out.error) return { ...(f || {}), preview: pv.out, step: p.tool };
    last = f;
    all.items.push(...(f.out.items || []));
    all.results.push(...(f.out.results || []));
  }
  if (!last) return { ...pv, step: "preview" };
  const items0 = all.items.sort((x, y) => x.i - y.i), results = all.results.sort((x, y) => x.i - y.i);
  const r = results[0] || {};
  const it = (items0[0] && items0[0].filed) || {};
  const st = (s) => results.filter((x) => x.status === s).length;
  return { ...last, preview: pv.out, step: "file",
    out: { ...last.out, items: items0, results, complete: results.every((x) => x.status !== "not_filed"), counts: { filed: st("filed"), unchanged: st("unchanged"), left: st("left"), notFiled: st("not_filed") },
      id: r.id || it.id || null, route: it.route || null, status: r.status || null } };
}
export const contribute = (mcp, { project, clientRef, eval: ev, ...c }, key) =>
  fileItems(mcp, { project, items: [{ contribution: { ...c, ...(clientRef ? { clientRef } : {}) } }], ...(ev ? { eval: true } : {}) }, key);
