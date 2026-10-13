// tools/smoke/s60-split-door.mjs — sprint 19, the split door (the owner's ruling, 2026-10-13: "by what the write does"), on the
// real local worker. Self-contained: its own project (s60<tag>), the owner's key.
//   · tools/list: `preview` and the three write tools (file_contribution, save_knowledge, remove_knowledge), no `file`; preview
//     takes no fileOnConfirm and is never read-only; each write tool's items are exactly its form; file_contribution destroys
//     nothing, the two knowledge tools may; `file` answers unknown tool
//   · a mixed preview (a knowledge upsert, a contribution, a knowledge remove, a grade) names each item's write tool and the
//     parts; the grade is refused, pointing at submit_grade; a wrong-operation item and a changed item are refused with nothing
//     filed; each tool files its own part (the contribution through the REST twin POST /preview/file-contribution), a repeat
//     answers the first receipt, and once every part is filed the preview reads filed; the project holds what was asked
import { randomBytes } from "node:crypto";
import { smoke, expect, brief, http, mcp, ownerKey } from "./lib.mjs";

const P = `s60${randomBytes(2).toString("hex")}`;
const goal = (id, parent, title) => ({ kind: "goal", op: "upsert", data: { id, title: title || id, parent, dimensions: [] } });
const goalIdsOf = async () => ((await mcp(ownerKey, "read", { project: P, kind: "goal", limit: 100 })).out.items || []).map((g) => g.id).sort();
const WRITERS = ["file_contribution", "save_knowledge", "remove_knowledge"];

smoke("split door: tools/list carries preview and the three write tools (no file), each write tool's items exactly its form, the ruled annotations; file is unknown", async () => {
  const tl = await http("POST", "/mcp", { key: ownerKey, body: { jsonrpc: "2.0", id: 60, method: "tools/list" } });
  const tools = (tl.json && tl.json.result && tl.json.result.tools) || [];
  const by = new Map(tools.map((t) => [t.name, t]));
  expect(!by.has("file") && ["preview", ...WRITERS].every((n) => by.has(n)), `the tools: ${tools.map((t) => t.name).join(", ")}`);
  const pv = by.get("preview");
  expect(!("fileOnConfirm" in pv.inputSchema.properties) && pv.annotations.readOnlyHint === false && pv.annotations.destructiveHint === false && pv.annotations.idempotentHint === false,
    `preview takes no fileOnConfirm and stores (never read-only): ${brief(pv.annotations)}`);
  expect((pv.inputSchema.properties.items.items.anyOf || []).length === 3, "preview's item is the anyOf of three forms");
  const op = (n) => ((by.get(n).inputSchema.properties.items.items.properties || {}).op || {}).const;
  expect(by.get("file_contribution").inputSchema.properties.items.items.required[0] === "contribution" && op("save_knowledge") === "upsert" && op("remove_knowledge") === "remove",
    "each write tool's items are exactly its form (contribution; op const upsert; op const remove)");
  const a = (n) => by.get(n).annotations;
  expect(a("file_contribution").destructiveHint === false && a("file_contribution").idempotentHint === true && a("save_knowledge").destructiveHint === true && a("remove_knowledge").destructiveHint === true
    && WRITERS.every((n) => a(n).readOnlyHint === false && a(n).idempotentHint === true && by.get(n).inputSchema.properties.fileOnConfirm), `the annotations: ${brief(WRITERS.map((n) => [n, a(n)]))}`);
  const gone = await mcp(ownerKey, "file", { previewId: "P-0000000000000000", items: [goal("x", null)] });
  expect(gone.isError && /unknown tool/.test(JSON.stringify(gone.out)), `file: ${brief(gone.out)}`);
  return "4 tools, file gone";
});

smoke("split door: preview, then each write tool files its own part (the contribution over REST); wrong tool, changed items and a grade refused; a repeat answers the first receipt", async () => {
  const cp = await mcp(ownerKey, "create_project", { key: P, name: `Split ${P}` });
  expect(cp.out && cp.out.project && cp.out.project.key, `create_project: ${brief(cp.out)}`);
  const seed = [goal(`${P}-root`, null, "Root"), goal(`${P}-old`, `${P}-root`, "To be removed")];
  const s0 = await mcp(ownerKey, "preview", { project: P, items: seed });
  const s1 = await mcp(ownerKey, "save_knowledge", { previewId: s0.out.previewId, items: seed });
  expect(!s1.isError && s1.out.complete, `the seed: ${brief(s1.out)}`);
  const UP = goal(`${P}-new`, `${P}-root`, "A new goal");
  const CO = { contribution: { lane: "leader", kind: "note", what: "The split door works", why: "Each write is its own tool." } };
  const RM = { kind: "goal", op: "remove", data: { id: `${P}-old` } };
  const GR = { grade: { checkId: "AC.none", verdict: "proven", proof: "npm test -> exit 0" } };
  const pv = await mcp(ownerKey, "preview", { project: P, items: [UP, CO, RM, GR] });
  const pid = pv.out && pv.out.previewId;
  const it = (pv.out && pv.out.items) || [];
  expect(pid && it.map((x) => x.filesWith || "-").join() === "save_knowledge,file_contribution,remove_knowledge,-"
    && it[3].verdict === "refused" && it[3].refusal.tool === "submit_grade" && (pv.out.parts || []).map((p) => `${p.tool}:${p.items.join("+")}`).join() === "file_contribution:2,save_knowledge:1,remove_knowledge:3",
    `the preview names each item's tool and the parts; the grade refused: ${brief({ items: it.map((x) => [x.filesWith, x.verdict, x.refusal && x.refusal.tool]), parts: pv.out && pv.out.parts })}`);
  const wrong = await mcp(ownerKey, "remove_knowledge", { previewId: pid, items: [UP] });
  expect(wrong.isError && wrong.out.error === "wrong_tool" && wrong.out.items[0].filesWith === "save_knowledge", `a knowledge upsert sent to remove_knowledge: ${brief(wrong.out)}`);
  const changed = await mcp(ownerKey, "save_knowledge", { previewId: pid, items: [goal(`${P}-new`, `${P}-root`, "Another title")] });
  expect(changed.isError && changed.out.error === "preview_changed", `a changed upsert: ${brief(changed.out)}`);
  expect((await goalIdsOf()).join() === [`${P}-old`, `${P}-root`].sort().join(), "nothing filed by the refusals");
  const rc = await http("POST", "/preview/file-contribution", { key: ownerKey, body: { previewId: pid, items: [CO] } });
  expect(rc.status === 200 && rc.json && rc.json.complete && rc.json.tool === "file_contribution" && /^T-\d{8}-\d+$/.test(rc.json.items[0].filed.id), `POST /preview/file-contribution: ${rc.status} ${brief(rc.json)}`);
  const again = await mcp(ownerKey, "file_contribution", { previewId: pid, items: [CO] });
  expect(again.isError && again.out.error === "preview_filed" && again.out.receipt.items[0].filed.id === rc.json.items[0].filed.id, `the repeat answers the first receipt: ${brief(again.out)}`);
  const sk = await mcp(ownerKey, "save_knowledge", { previewId: pid, items: [UP] });
  const rk = await mcp(ownerKey, "remove_knowledge", { previewId: pid, items: [RM] });
  expect(!sk.isError && sk.out.complete && !rk.isError && rk.out.complete && (rk.out.rest || []).length === 0, `the two knowledge parts: ${brief([sk.out, rk.out])}`);
  const ids = (await goalIdsOf()).join();
  expect(ids === [`${P}-new`, `${P}-root`].sort().join(), `the project holds the upsert, not the removed goal: ${ids}`);
  const page = await http("GET", `/preview/${pid}`, { key: ownerKey });
  expect(page.status === 200 && page.json && page.json.state === "filed" && (page.json.parts || []).every((p) => p.filed), `the preview reads filed: ${brief(page.json && { state: page.json.state, parts: page.json.parts })}`);
  return `${pid}: 3 parts filed by 3 tools`;
});
