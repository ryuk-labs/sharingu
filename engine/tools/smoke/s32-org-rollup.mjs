// tools/smoke/s32-org-rollup.mjs — sprint 5, R2: `changes {org: true}` answers the whole org in ONE call — the
// window's filings counted by project, only the projects the caller may read; the GET twin takes ?org=1. (R2's other
// half, the defaulted read's projectNote, is the seam's own helper — proven live and pinned by the door contract.)
import { smoke, expect, brief, s, http, mcp, ownerKey } from "./lib.mjs";

smoke("R2: the org roll-up — one call, the caller's readable projects only, counts split; the GET twin agrees", async () => {
  const o = await mcp(ownerKey, "changes", { org: true });
  const out = o.out || {};
  const keys = (out.byProject || []).map((r) => r.project);
  expect(!o.isError && out.org === true && keys.length >= 2 && out.byProject.every((r) => Number.isInteger(r.filings) && Number.isInteger(r.contributions))
    && /last 30 days/.test((out.since || {}).label || "") && out.projectNote == null, () => `the owner's roll-up (no one-project note on an org answer): ${brief(out)}`);
  const m = await mcp(s.member.key, "changes", { org: true });
  const mkeys = ((m.out || {}).byProject || []).map((r) => r.project);
  expect(!m.isError && mkeys.length >= 1 && mkeys.length <= keys.length && mkeys.every((k) => keys.includes(k)) && m.out.byProject.every((r) => !("knowledge" in r)),
    () => `the member's roll-up stays inside their seats and carries no knowledge column (the review's H1): ${brief(m.out && m.out.byProject)}`);
  const rest = await http("GET", "/changes?org=1", { key: ownerKey });
  expect(rest.status === 200 && rest.json && rest.json.org === true && (rest.json.byProject || []).length === keys.length,
    () => `the GET twin ?org=1 agrees (${rest.status})`);
  const bad = await mcp(ownerKey, "changes", { org: true, since: "v3" });
  expect((bad.out || {}).error === "bad_since", () => `a version as org's since is refused: ${brief(bad.out)}`);
  return `org roll-up: owner ${keys.length} project(s), member ${mkeys.length}, twin agrees, v-since refused`;
});
