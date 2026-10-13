// tools/smoke/s13-happened.mjs — sprint 3, happenedAt (the owner's MCQ 2026-10-01: "keep the filing time true, add the real
// date beside it"), through the real door. Builds on s0 (project smoke, the member seated on it).
//   · a contribution filed with happenedAt three days ago through preview -> file: the preview's line and text say when it
//     happened; read answers both times (created_at today, happened_at three days ago); its page's trail shows
//     both; Build's Newest orders it by when it happened (below a contribution filed BEFORE it today with no happenedAt);
//     Broadcast's live picture draws its dot at that day;
//   · a future happenedAt is refused at the door (preview then file, bad_field happenedAt) and needs it in a preview;
//     nothing filed.
import { smoke, expect, brief, s, http, mcp, html, contribute, readTx, contributions } from "./lib.mjs";

const P = "smoke";
const DAY = 864e5;

smoke("happenedAt: filed today through preview -> file, it reads back with both times, shows both on its page and sorts by when it happened on Build", async () => {
  const today = new Date().toISOString().slice(0, 10), d3 = new Date(Date.now() - 3 * DAY).toISOString().slice(0, 10);
  const plain = (await contribute(s.member.key, { project: P, lane: "leader", kind: "note", what: "S13 work done today", why: "filed with no happenedAt" })).out;
  expect(plain.id && !plain.error, () => brief(plain));
  const item = { contribution: { lane: "leader", kind: "note", what: "S13 work done three days ago", why: "filed today, happened earlier", happenedAt: d3 } };
  const pv = (await mcp(s.member.key, "preview", { project: P, items: [item] })).out;
  const it = (pv.items || [])[0] || {};
  expect(pv.previewId && it.verdict === "files" && it.happenedAt === d3 && it.line.endsWith(`happened ${d3}`) && (pv.text || "").includes(`happened ${d3}; filed when you file`), () => `preview: ${brief(it)}\n${pv.text}`);
  const f = (await mcp(s.member.key, "file_contribution", { previewId: pv.previewId, items: [item] })).out;
  const id = f.items && f.items[0] && f.items[0].filed && f.items[0].filed.id;
  expect(id && f.complete === true, () => `file: ${brief(f)}`);
  const r = (await readTx(s.member.key, id, P)).out;
  expect(r.happened_at === d3 && String(r.created_at).slice(0, 10) === today, () => `read back: ${brief({ happened_at: r.happened_at, created_at: r.created_at })}`);
  const page = await html(`/contribution/${id}?page=1`, s.member.key);
  expect(page.status === 200 && page.text.includes(`data-field="happened-at" data-happened="${d3}">${d3}</span>`), () => `page ${page.status}: ${(page.text.match(/data-region="trail"[\s\S]{0,400}/) || [""])[0]}`);
  const plainPage = await html(`/contribution/${plain.id}?page=1`, s.member.key);
  expect(plainPage.status === 200 && !/data-field="happened-at"/.test(plainPage.text), "the plain filing's page says Happened");
  const b = await http("GET", `/build?project=${P}&sort=newest`, { key: s.member.key });
  const rows = (b.json && b.json.rows) || [];
  const at = rows.findIndex((x) => x.id === id), ap = rows.findIndex((x) => x.id === plain.id);
  expect(b.status === 200 && at >= 0 && ap >= 0 && at > ap && rows[at].happenedAt === d3 && String(rows[at].at).slice(0, 10) === today && rows[ap].happenedAt === null,
    () => `build ${b.status}: backdated at ${at}, plain at ${ap}: ${brief(rows.slice(0, 4).map((x) => [x.id, x.at, x.happenedAt]))}`);
  const bp = await html(`/build?project=${P}&sort=newest`, s.member.key);
  // sprint 3 L2: the row carries the day it happened (data-happened) and, opened, both days as its facts
  expect(bp.status === 200 && new RegExp(`data-id="${id}"[^>]*data-happened="${d3}"[\\s\\S]*?<dt>Happened</dt><dd>${d3}</dd></div><div><dt>Filed</dt><dd>${today}</dd>`).test(bp.text), () => `build page ${bp.status}`);
  const live = await http("GET", `/broadcast/live?project=${P}`, { key: s.member.key });
  const dot = ((live.json && live.json.dots) || []).find((x) => x.id === id);
  expect(live.status === 200 && dot && dot.at === d3 && live.json.at >= `${today}T`, () => `live ${live.status}: ${brief(dot)} at ${live.json && live.json.at}`);
  return `${id} filed ${String(r.created_at).slice(0, 19)}, happened ${d3}: preview line and text say so; read back with both; its trail "Happened ${d3} · filed ${today}"; Build Newest row ${at + 1} (after ${plain.id}, filed before it, row ${ap + 1}); its Broadcast dot at ${d3}, the poll cursor still the filing time`;
});

smoke("happenedAt: a future date is refused at the door, naming the field; a preview needs it; nothing filed", async () => {
  const tomorrow = new Date(Date.now() + DAY).toISOString().slice(0, 10);
  const body = { project: P, lane: "leader", kind: "note", what: "S13 future work", why: "never filed", happenedAt: tomorrow };
  const sub = await contribute(s.member.key, body);
  // D5: the door is preview then file: the preview needs happenedAt (tool and POST /preview), and file_contribution files nothing
  const rest = await http("POST", "/preview", { key: s.member.key, body: { project: P, items: [{ contribution: { ...body, project: undefined, happenedAt: `${tomorrow}T09:00:00Z` } }] } });
  const it = (((sub.preview || {}).items || [])[0]) || {};
  const rn = (((rest.json || {}).items || [])[0] || {}).needs || {};
  expect(sub.isError && sub.out.error === "not_ready" && it.verdict === "needs" && it.needs && it.needs.field === "happenedAt" && /future/.test(it.needs.hint) && it.needs.example
    && rest.status === 200 && rn.field === "happenedAt", () => brief([sub.out, rest.json, it]));
  expect(!(await contributions(s.member.key, P, { eval: true })).some((x) => x.what === "S13 future work"), "a future happenedAt was filed");
  return `the preview needs happenedAt (${it.needs.hint.slice(0, 60)}...), on the tool and POST /preview; file_contribution answers not_ready; nothing filed`;
});
