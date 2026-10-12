// src/controlread.js — Control's ONE read (UI-B12a; the screen that renders it is src/controlpage.js). Brief:
// 02_AGENT_R/next-batch-ui-b12-control.md (the brain). Owner rulings: Q925964F5 (access is managed inline in the people
// list) · QB963C7EE amended by F6 (a non-admin sees each admin control DISABLED with its reason, and the door refuses the
// same call independently) · QC5F82B90 (admin holds admin functions, not extra tabs) · QBDFA9D37 (everyone sees everything
// in their projects; only the admin has admin functions) · Q8EFBCCF8 / QD46CF220 (one key per person, handed over by the
// admin) · Q76EFC99D (admin is transferable: never zero admins) · Q93B3F368 (project, not workspace). Sprint 2 (the owner's
// MCQ, 2026-09-30 evening): the roles are Admin · Member · Partner and each person wears hats (migrate-044, src/hats.js).
//
// ONE seam, two faces (D1): readControl(env, reader, q) is the whole read. GET /control/people answers it as JSON (every
// signed-in reader, scoped by who they are; anonymous 401 at the gate); the GET /control page renders the SAME object.
// No MCP twin: whoami already carries the caller's own seats and hats (check-mcp-parity.py NOT_TOOLS).
//
//   org        {name (the org row's name), deploy (CF_VERSION_METADATA, no D1), projects (the ACTIVE project keys)}; the
//              worker's own name is the platform's, never the org's (sprint 6, 6.3), so it is not in the read
//   reader     {id, admin, readOnly?}  admin = role 'owner' (the one admin marker every door reads); readOnly:
//              true only when the credential is the read-only one (ADR-050): the door refuses its every write
//   admin      {name}                      the org's first REAL admin (tenant.js OWNER_SQL's order; never eval-fixed-*)
//   people     [{id, name, email|null, title|null, consent|null, admin, role ('admin'|'member'|'partner'), hats [<hat>] (their
//              own pick: Home), access [<hat>] (migrate-045: the hats the admin set, what they may read by: the admin's read
//              and your own row only, like email), avatar {initials, tone}, label|null (the typed role before migrate-044: the
//              admin's read only), lastFiled|null (their newest filing: the admin's read only), active, you, seats:[{project,
//              name}], can:{role, access, remove, seat, reissue, reason}}]  title: the display title (ADR-092 §2, everyone
//              listed); consent: the standing trace consent (ADR-102: read-only here, set on /profile only), the admin's and
//              your own row only, like email
//   workspaces [{key, name, seats}]        the admin: every ACTIVE project; a non-admin: their own seated ones
//   archived   [{key, name, seats}]        the admin only: the archived projects (activate brings one back)
//   keys       [{person (the id), devices:[{device, since, expires}]}]   your own; the admin's ?all=1: every listed person's
//   stamp      {people: the ACTIVE people listed, projects: workspaces.length}
//   live?      'unreachable' when a statement failed (200, empty regions; a D1 quota error propagates)
//   eval?      true when the admin asked ?eval=1 or ?all=1 (the suites' fixed people listed); all?: true on ?all=1 (the
//              archived people and every live device too)
//
// Scope (D4): a non-admin reads the people who share at least one ACTIVE project with them (and themselves), only their
// own email, only the seat chips of projects they hold, their own seated projects, their own devices; every can.* false
// with CONTROL_REASON naming the admin. A reader seated nowhere reads only themselves. A Partner reads exactly what a member
// reads here (the people of their own projects, never the org's list). The admin reads everyone active, every email, every
// project and their own devices; on every OTHER active row each can.* is true (their own row refuses remove, the door's own
// refusal). Population (D5): active rows only; the suites' `eval-fixed-*` people only with ?eval=1 (admin); archived people
// only with ?all=1 (admin), every can.* false on them.
//
// Budget (D11): THREE D1 statements beyond the sign-in, src/hotsql.js CONTROL_PEOPLE_SQL (X1) · CONTROL_PROJECTS_SQL (X2) ·
// CONTROL_DEVICES_SQL (X3), in one wave; tools/d1-hot-selftest.mjs section V EXPLAINs them and counts them through the
// real handler. The admin's X1 is one row per person (seats and newest filing ride it); X3 is the reader's own devices
// unless ?all=1. A database migrate-044 has not reached reads X1 again without the profile columns (src/core.js withProfile).

import { db } from "./data.js";
import { CONTROL_PEOPLE_SQL, CONTROL_PROJECTS_SQL, CONTROL_DEVICES_SQL, CONTROL_DEVICES_LIMIT } from "./hotsql.js";
import { wave } from "./goalsread.js";
import { getTenantConfig } from "./tenant.js";
import { noProfileCols } from "./core.js";
import { hatsOf, avatarOf, roleClassOf } from "./hats.js";
import { isEvalSeat, now } from "./util.js";

// the disabled control's reason (the versionsview.js RESTORE_REASON pattern): the verb, and who can do it
// copy: error (a refusal: the disabled controls' reason, which a person reads)
export const CONTROL_REASON = (verb, adminName) => `Only an admin can ${verb}. ${adminName || "The owner"} is this org's admin.`;
// copy: error (a refusal's words: the disabled controls' reason)
export const CONTROL_VERB = "change who holds a seat, a role or a key";
// the named EMPTY sentences (D10), so the screen types none of its own
export const EMPTY_ALONE = "Only you here";
export const EMPTY_NOSEAT = "No seat yet";
export const EMPTY_NOPROJECT = "No project yet";
export const NO_SEAT_ROW = "No project yet";   // D9: a provisioned person with no seat
// copy: error (a refusal: a row's own reason)
export const SELF_REMOVE_REASON = "You can't remove your own account here.";
// copy: error (a refusal: an archived row's reason)
export const ARCHIVED_REASON = "Removed from this org: archived, not deleted. Nothing changes on this row.";
// UI-B12b fold (B12a's adversarial review, c7ce4f0a): the read-only credential (ADR-050) reads Control and the door refuses its
// every write, so every control it is shown is disabled with this reason (F6), never enabled on a press that will be refused
// copy: error (a refusal: the disabled controls' reason)
export const READ_ONLY_REASON = "A read-only credential reads Control and changes nothing. Sign in with your full key to act as this org's admin.";
// consentOf(v) — the standing trace consent grade a row shows (ADR-102: off · traces · traces+prompts; anything else is off)
const consentOf = (v) => (v === "traces" || v === "traces+prompts" ? v : "off");
const byKey = (a, b) => (a.project < b.project ? -1 : a.project > b.project ? 1 : 0);

// readControl(env, reader, q) — q: { eval (the ?eval=1 flag), all (the ?all=1 flag; both honoured for the admin only), deploy }
export async function readControl(env, reader, q = {}) {
  const rid = String((reader && reader.id) || "");
  const admin = !!(reader && reader.role === "owner");
  const readOnly = !!(reader && reader.readOnly);
  const scoped = !admin;
  const partner = !admin && roleClassOf(reader && reader.role) === "partner";
  const all = admin && !!q.all;
  const includeEval = admin && (!!q.eval || all);
  const at = now();
  const tenantP = getTenantConfig(env).catch(() => null);
  const x1 = (profile) => db(env).prepare(CONTROL_PEOPLE_SQL(scoped, includeEval, { archived: all, profile }))
    .bind(...(scoped ? [rid, rid, rid, rid] : includeEval ? [] : [rid])).all();
  // X3: the reader's own live devices (the scoped statement), the admin's ?all=1 every active person's
  const ownDevices = scoped || !all;
  const w = await wave([
    // before migrate-045: without access_hats; before migrate-044: the columns it had
    x1(true).catch((e) => { if (noProfileCols(e)) return x1("044"); throw e; }).catch((e) => { if (noProfileCols(e)) return x1(false); throw e; }),
    db(env).prepare(CONTROL_PROJECTS_SQL).all(),
    db(env).prepare(CONTROL_DEVICES_SQL(ownDevices, includeEval)).bind(...(ownDevices ? [rid, at] : includeEval ? [at] : [at, rid])).all(),
  ]);
  const tenant = (await tenantP) || {};
  const peopleRows = (w.val(0) || {}).results || [];
  // sprint 3 S3b (migrate-062): a test run's own project (projects.eval) is listed only when the admin asks ?eval=1 or ?all=1;
  // authority: a list filter only, every door still reads the project by its own scope rule
  const projectRows = ((w.val(1) || {}).results || []).filter((r) => includeEval || !Number(r.eval));
  // X3: the admin's ?all=1 live keys come unsorted (hotsql.js CONTROL_DEVICES_SQL): the newest CONTROL_DEVICES_LIMIT, as the
  // statement itself kept before (the scoped read sorts and limits in the statement, on the reader's own keys)
  const deviceRows = ownDevices ? ((w.val(2) || {}).results || [])
    : [...((w.val(2) || {}).results || [])].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)).slice(0, CONTROL_DEVICES_LIMIT);
  // X2: every project; the ACTIVE ones by key (a seat on any other project is no chip, as the scoped X1's own join reads it)
  const activeRows = projectRows.filter((r) => Number(r.active) === 1);
  const activeName = new Map(activeRows.map((r) => [String(r.key), r.name]));
  const anyName = new Map(projectRows.map((r) => [String(r.key), r.name]));

  // X1: the admin's read is one row per person (seats: a comma list); the scoped read one row per (person, seat). The admin's
  // name rides every row. A person's chips keep the key order.
  const adminName = (peopleRows.find((r) => r.admin_name) || {}).admin_name || null;
  const byId = new Map();
  // the archived projects' seats (the admin's count on an archived project: its people come back with it)
  const dormant = new Map();
  for (const r of peopleRows) {
    let p = byId.get(r.id);
    if (!p) {
      const mineRow = admin || r.id === rid;
      p = { id: r.id, name: r.name, email: mineRow ? (r.email || null) : null, title: r.title || null,
            consent: mineRow ? consentOf(r.trace_consent) : null, admin: r.role === "owner", role: roleClassOf(r.role),
            hats: hatsOf(r.hats), avatar: avatarOf(r),
            // migrate-045: the access hats the admin set (what this person may read by), on the admin's read and your own row
            ...(mineRow ? { access: hatsOf(r.access_hats) } : {}),
            ...(admin ? { label: r.role_label || (["owner", "member", "partner"].includes(String(r.role)) ? null : r.role || null), lastFiled: r.last_filed || null } : {}),
            active: r.active == null ? true : Number(r.active) === 1, you: r.id === rid, seats: [] };
      byId.set(r.id, p);
    }
    if (!scoped) {
      for (const k of String(r.seats || "").split(",").filter(Boolean)) {
        if (activeName.has(k)) p.seats.push({ project: k, name: activeName.get(k) });
        else if (anyName.has(k) && p.active && !isEvalSeat(p.id)) dormant.set(k, (dormant.get(k) || 0) + 1);
      }
    } else if (r.project && activeName.has(String(r.project))) p.seats.push({ project: r.project, name: r.project_name });
  }
  if (!scoped) for (const p of byId.values()) p.seats.sort(byKey);
  // the scoped read never lists someone who shares no project with the reader: X1 already scopes; this is the belt
  const mine = new Set(((byId.get(rid) || {}).seats || []).map((s) => s.project));
  // who may act here: the admin on a full credential. The admin on the read-only credential reads everything the admin reads
  // (reader.admin stays true: it is the role, the door's own marker), and every can.* is false with READ_ONLY_REASON
  const reason = admin ? READ_ONLY_REASON : CONTROL_REASON(CONTROL_VERB, adminName);
  const writes = admin && !readOnly;
  const NONE = (why) => ({ role: false, access: false, remove: false, seat: false, reissue: false, reason: why });
  const people = [...byId.values()]
    .filter((p) => (admin && (includeEval || p.you || !isEvalSeat(p.id))) || p.you || (!isEvalSeat(p.id) && p.seats.some((s) => mine.has(s.project))))
    .map((p) => ({
      ...p,
      seats: admin ? p.seats : p.seats.filter((s) => mine.has(s.project)),
      can: !writes ? NONE(reason)
        : !p.active ? NONE(ARCHIVED_REASON)
        : { role: true, access: true, remove: !p.you, seat: true, reissue: true, reason: p.you ? SELF_REMOVE_REASON : null },
    }));
  const listed = new Set(people.map((p) => p.id));

  // X2: the ACTIVE projects (this-org's chips for everyone); the admin's workspaces are all of them (and the archived ones
  // apart), a non-admin's their own. A project's seats: the ACTIVE people seated there, the suites' fixed people never
  // counted, counted from X1 (every active person for the admin; everyone on the reader's own projects for a non-admin,
  // whose workspaces are those alone)
  const seatN = new Map();
  for (const p of byId.values()) {
    if (isEvalSeat(p.id) || !p.active) continue;
    for (const st of p.seats) seatN.set(st.project, (seatN.get(st.project) || 0) + 1);
  }
  const projects = activeRows.map((r) => ({ key: String(r.key), name: r.name, seats: seatN.get(String(r.key)) || 0 }));
  const workspaces = admin ? projects : projects.filter((p) => mine.has(p.key));
  const archived = admin ? projectRows.filter((r) => Number(r.active) !== 1).map((r) => ({ key: String(r.key), name: r.name, seats: dormant.get(String(r.key)) || 0 })) : [];

  // X3: devices grouped per listed person, in the people order
  const devs = new Map();
  for (const d of deviceRows) {
    if (!listed.has(d.person_id) || ((!admin || ownDevices) && d.person_id !== rid)) continue;
    if (!devs.has(d.person_id)) devs.set(d.person_id, []);
    devs.get(d.person_id).push({ device: d.device || null, since: d.created_at || null, expires: d.expires_at || null });
  }
  const keys = people.filter((p) => devs.has(p.id)).map((p) => ({ person: p.id, devices: devs.get(p.id) }));

  return {
    // review fix 2b (sprint 2): a Partner reads only the keys of the projects they are seated on, never the org's list
    org: { name: (tenant.brand && tenant.brand.org) || null, deploy: q.deploy || null,
           projects: (partner ? workspaces : projects).map((p) => p.key) },
    reader: { id: rid, admin, ...(readOnly ? { readOnly: true } : {}) },
    admin: { name: adminName },
    people,
    workspaces,
    ...(admin ? { archived } : {}),
    keys,
    stamp: { people: people.filter((p) => p.active).length, projects: workspaces.length },
    ...(w.down ? { live: "unreachable" } : {}),
    ...(includeEval ? { eval: true } : {}),
    ...(all ? { all: true } : {}),
  };
}
