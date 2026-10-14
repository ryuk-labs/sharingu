#!/usr/bin/env python3
"""tools/migrate-dryrun-selftest.py — B3-heal (2026-09-22): the SMALL, OFFLINE half of
tools/migrate-dryrun.sh's own proof — no network, no wrangler, no Cloudflare account, so the gate can
run it on every commit (`sh gate.sh`) the way tools/fk-enforce-selftest.py already proves boot.sql's
own FK/CHECK/trigger set with a real, local sqlite3 connection. That file proves a FRESH day-0 tenant;
this one proves the OPPOSITE shape — an OLD tenant's own accumulated data surviving the incremental
migrate-030.sql..migrate-035.sql replay — with a tiny, hand-built fixture covering exactly the four
named scenarios (Q974E7924 / Q1A82FA6F, round r83):
  - a transmission_refs ROW (proves the FK re-pin: migrate-031.sql's own rename of `transmission`
    used to leave transmission_refs referencing the dropped "transmission_old" — SQLite's documented
    ALTER TABLE RENAME behavior — this fixture would otherwise take that dangling reference straight
    into a real assertion failure below)
  - an ORPHAN TOKEN (person_id names nobody in `people`)
  - an ORPHAN EVENT (person_id names nobody in `people`)
  - an UNTAGGED ARTIFACT (group_tag NULL — must land on 'legacy-ungrouped', never bare 'ungrouped')
  - (one more, free: a token whose `project` names no real project — migrate-030a.sql's other duty)

Exit 0 every assertion holds; exit 1 with the first miss. `--inject` re-runs the exact same fixture
against the ORIGINAL (unfixed) migrate-031.sql/033.sql/035.sql this batch replaces — fetched LIVE via
`git show origin/main:engine/migrate-0NN.sql` into a throwaway temp dir, never a cached or hand-typed
copy — and is expected to FAIL: the injection test the acceptance list asks for, a selftest that
cannot fail is not a check (ABSENCE IS NOT EVIDENCE, docs/GUARDRAILS.md). HEAL 2026-09-22 (round 1,
verifier-refused on 3c0a214c): the first cut of this fixture's own PRE030_SCHEMA (below) omitted the
one line — `tid TEXT NOT NULL REFERENCES transmission(id)` on transmission_refs — that makes the
migrate-031.sql regression this whole file exists to catch reproducible at all; without it, `--inject`
against origin/main's real migrate-031.sql silently PASSED (the exact "a check that cannot fail is not
a check" failure mode this doctrine warns about), and the flag itself did not even exist yet — this
heal adds both the missing FK clause and the real `--inject` implementation in the same pass, and the
PR body's own claimed output is replaced with a fresh, real run against this fixed file.
"""
import os, re, shutil, sqlite3, subprocess, sys, tempfile, uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The pre-030 shape, by hand: every column migrate-030.sql..migrate-035.sql touch or read, on every
# table they touch — NO constraint beyond what a pre-030 org actually carries (no FK, no CHECK, no
# NOT NULL beyond what already existed) — QD1A9E7EB's own finding: 22 of 24 relations were naming
# convention only, never enforced, before this batch. Column NAMES and their ORDER here are cosmetic
# (every migration this batch touches now uses an explicit column list, never `SELECT *` — this
# fixture's own injection mode is what proves that still matters).
PRE030_SCHEMA = """
CREATE TABLE people (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, role TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
  pass_hash TEXT, pass_salt TEXT, title TEXT, capture_mode TEXT NOT NULL DEFAULT 'yield', lane TEXT, trace_consent TEXT
);
CREATE TABLE projects (
  key TEXT PRIMARY KEY, name TEXT NOT NULL, registry_ptr TEXT, atlas_map TEXT,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, person_id TEXT NOT NULL, surface TEXT, capsule_id TEXT, capsule_seq INTEGER
);
CREATE TABLE tokens (
  token_hash TEXT PRIMARY KEY, person_id TEXT NOT NULL, device TEXT, created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, project TEXT
);
CREATE TABLE loops (
  id TEXT PRIMARY KEY, person_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  opened_at TEXT NOT NULL, closed_at TEXT, ref TEXT
);
CREATE TABLE events (
  id TEXT PRIMARY KEY, session_id TEXT, person_id TEXT NOT NULL, kind TEXT NOT NULL, payload_json TEXT,
  created_at TEXT NOT NULL, touches TEXT, basis TEXT, stamped INTEGER NOT NULL DEFAULT 0, lane TEXT, project TEXT
);
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY, person_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT, r2_key TEXT NOT NULL,
  sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, group_tag TEXT, created_at TEXT NOT NULL,
  screens TEXT, states TEXT, project TEXT
);
CREATE TABLE transmission (
  id TEXT PRIMARY KEY, submitter TEXT NOT NULL, lane TEXT NOT NULL, kind TEXT, what TEXT, why TEXT,
  touches TEXT, screens TEXT, proof TEXT, parent TEXT, grade TEXT, route TEXT NOT NULL, status TEXT NOT NULL,
  eval INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, components TEXT, decision TEXT, decided_by TEXT,
  decided_at TEXT, decision_note TEXT, gaprefs TEXT, report TEXT, digest TEXT, trace TEXT, about TEXT,
  project TEXT, via TEXT, client_ref TEXT, goal_ref TEXT, expected TEXT, actual TEXT, outcome REAL
);
-- tid REFERENCES transmission(id) matches migrate-018.sql:35 exactly — WITHOUT this clause, migrate-
-- 031.sql's rename of `transmission` never triggers SQLite's own rename-rewrites-child-FK-text
-- behavior in this fixture at all, so the transmission_refs regression this scenario names cannot
-- reproduce here (heal 2026-09-22, round 1: the first cut of this file omitted the clause, and
-- `--inject` against origin/main's real migrate-031.sql silently PASSED as a result).
CREATE TABLE transmission_refs ( tid TEXT NOT NULL REFERENCES transmission(id), ref TEXT NOT NULL );
CREATE TABLE transmission_refs_meta ( key TEXT PRIMARY KEY, value TEXT );
CREATE TABLE approval_audit (
  id TEXT PRIMARY KEY, transmission_id TEXT NOT NULL, verdict TEXT NOT NULL, note TEXT,
  decided_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE invites (
  id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, project_key TEXT NOT NULL, role TEXT NOT NULL,
  label TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  redeemed_at TEXT, redeemed_person TEXT, revoked_at TEXT
);
CREATE TABLE project_seats (
  person_id TEXT NOT NULL, project_key TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL, PRIMARY KEY (person_id, project_key)
);
-- sprint 6 (migrate-067 gives both an org column, and drops sso_nonce): an old org carries them from schema.sql and migrate-024
CREATE TABLE login_attempts ( id TEXT PRIMARY KEY, email TEXT, ok INTEGER, at TEXT );
CREATE TABLE sso_nonce ( n TEXT PRIMARY KEY, created_at TEXT NOT NULL );
CREATE TABLE check_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, pack_version TEXT NOT NULL,
  check_id TEXT NOT NULL, status TEXT NOT NULL, transmission_id TEXT, graded_by TEXT NOT NULL,
  graded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

NOW = "2026-09-22T00:00:00.000Z"


def fresh_db():
    con = sqlite3.connect(":memory:")
    con.isolation_level = None  # manual transaction control — see apply_migration()
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(PRE030_SCHEMA)
    return con


def seed(con):
    """The fixture, named per scenario. A real person + project anchor everything that must resolve;
    everything else is the one broken shape each scenario names."""
    con.execute("INSERT INTO projects (key,name,active,created_at) VALUES ('proj1','Test Project',1,?)", (NOW,))
    con.execute(
        "INSERT INTO people (id,name,role,key_hash,active,created_at) VALUES ('p1','Real Person','owner','realkeyhash1',1,?)",
        (NOW,),
    )
    con.execute(
        "INSERT INTO transmission (id,submitter,lane,route,status,created_at) VALUES ('T-1','p1','code','auto','received',?)",
        (NOW,),
    )
    # scenario 1 — a transmission_refs ROW (the FK re-pin)
    con.execute("INSERT INTO transmission_refs (tid,ref) VALUES ('T-1','screen:001')")
    # scenario 2 — an ORPHAN TOKEN (person_id names nobody)
    con.execute(
        "INSERT INTO tokens (token_hash,person_id,created_at,expires_at,revoked) VALUES ('tok-orphan','ghost-token-person',?,?,0)",
        (NOW, NOW),
    )
    # bonus — a token whose project names no real project (migrate-030a.sql's second duty)
    con.execute(
        "INSERT INTO tokens (token_hash,person_id,project,created_at,expires_at,revoked) VALUES ('tok-strayproj','p1','no-such-project',?,?,0)",
        (NOW, NOW),
    )
    # scenario 3 — an ORPHAN EVENT (person_id names nobody)
    con.execute(
        "INSERT INTO events (id,person_id,kind,created_at) VALUES ('ev-orphan','ghost-event-person','fragment',?)",
        (NOW,),
    )
    # scenario 4 — an UNTAGGED ARTIFACT (group_tag NULL — must become 'legacy-ungrouped')
    con.execute(
        "INSERT INTO artifacts (id,person_id,kind,r2_key,sha256,bytes,group_tag,created_at) VALUES "
        "('art-untagged','p1','html','k1','sha1',10,NULL,?)",
        (NOW,),
    )
    # scenario 5 — a check_results ROW naming a real transmission (batch migrate-031-reentrancy,
    # 2026-09-23): check_results is REBUILT in migrate-032.sql, not here, but ITS OWN FK into
    # `transmission` (once migrate-032 has run once, exactly ryuklabs-agent-r's live shape) is a
    # second, cross-file casualty of migrate-031.sql's own transmission rename on a REPLAY — see
    # migrate-031.sql's own header. WITHOUT this row, check_results has zero rows on a fresh fixture
    # and the FK-orphan check below is trivially satisfied regardless of whether the cascade
    # corruption ever happened (ABSENCE IS NOT EVIDENCE, docs/GUARDRAILS.md) — this row is what makes
    # `t_replay_converges_no_stale_trigger_refs_or_old_tables` a case that COULD have failed.
    con.execute(
        "INSERT INTO check_results (project,pack_version,check_id,status,transmission_id,graded_by,graded_at) VALUES "
        "('proj1','v1','AC.test.01','proven','T-1','p1',?)",
        (NOW,),
    )
    con.commit()


def apply_migration(con, path):
    """One migration file, one transaction — the same all-or-nothing shape D1 itself gives every
    `wrangler d1 execute --file` call (tools/fk-enforce-selftest.py's own header cites the same D1
    fact). PRAGMA defer_foreign_keys only has an effect inside an active transaction. Python's
    sqlite3.Connection.executescript() issues its OWN implicit COMMIT the moment it is called — before
    a single statement of its argument runs — so a `BEGIN` issued via a SEPARATE con.execute() call
    ahead of it is silently closed out again immediately (measured: `cannot rollback - no transaction
    is active` the first time this was written that way). The fix is to make BEGIN/COMMIT part of the
    SCRIPT TEXT itself, so executescript's own implicit initial commit (closing nothing, since no
    transaction is open yet) never gets the chance to end a transaction this file's own BEGIN opens a
    moment later, inside the same call."""
    sql = open(path).read()
    try:
        con.executescript("BEGIN;\n" + sql + "\nCOMMIT;\n")
    except Exception:
        con.execute("ROLLBACK")
        raise


def migrations_dir():
    return os.environ.get("MIGRATE_DRYRUN_SQL_DIR", ROOT)


def run_chain(con):
    d = migrations_dir()
    for name in ["migrate-030.sql", "migrate-030a.sql", "migrate-031.sql", "migrate-032.sql", "migrate-033.sql", "migrate-034.sql", "migrate-035.sql"]:
        apply_migration(con, os.path.join(d, name))


results = []


def case(name, fn):
    try:
        fn()
        results.append((name, True, "ok"))
    except AssertionError as e:
        results.append((name, False, str(e)))
    except Exception as e:
        results.append((name, False, f"unexpected {type(e).__name__}: {e}"))


def t_chain_applies_clean():
    con = fresh_db()
    seed(con)
    run_chain(con)  # must not raise


def t_transmission_refs_survives_and_a_fresh_row_still_inserts():
    con = fresh_db()
    seed(con)
    run_chain(con)
    row = con.execute("SELECT tid, ref FROM transmission_refs WHERE tid='T-1'").fetchone()
    assert row is not None, "the seeded transmission_refs row did not survive the migration"
    # the real proof, not a DDL read: a FRESH insert must still succeed post-migration — this is
    # exactly the shape that fails (measured live on siru-agent-r, 2026-09-22) when transmission_refs
    # is left pointing at "transmission_old" after that table is dropped.
    con.execute("INSERT INTO transmission_refs (tid, ref) VALUES ('T-1', 'screen:002')")
    n = con.execute("SELECT COUNT(*) FROM transmission_refs WHERE tid='T-1'").fetchone()[0]
    assert n == 2, f"expected 2 transmission_refs rows for T-1 after a fresh insert, got {n}"


def t_orphan_token_person_recreated_inactive_and_token_revoked():
    con = fresh_db()
    seed(con)
    run_chain(con)
    person = con.execute("SELECT active, key_hash FROM people WHERE id='ghost-token-person'").fetchone()
    assert person is not None, "migrate-030a.sql did not recreate the orphan token's person"
    assert person[0] == 0, f"the recreated person must be INACTIVE, got active={person[0]}"
    assert not re.fullmatch(r"[0-9a-f]{64}", person[1] or ""), "the placeholder key_hash must never look like a real sha256 digest"
    tok = con.execute("SELECT revoked, person_id FROM tokens WHERE token_hash='tok-orphan'").fetchone()
    assert tok[0] == 1, "the orphan token must be revoked"
    assert tok[1] == "ghost-token-person", "the token's own person_id must be UNCHANGED — the row comes back, nothing is reattributed"


def t_stray_project_token_revoked_and_nulled():
    con = fresh_db()
    seed(con)
    run_chain(con)
    tok = con.execute("SELECT revoked, project FROM tokens WHERE token_hash='tok-strayproj'").fetchone()
    assert tok[0] == 1, "a token naming no real project must be revoked"
    assert tok[1] is None, "a token naming no real project must have its project cleared, never widened"


def t_orphan_event_person_recreated_inactive():
    con = fresh_db()
    seed(con)
    run_chain(con)
    person = con.execute("SELECT active FROM people WHERE id='ghost-event-person'").fetchone()
    assert person is not None, "migrate-030a.sql did not recreate the orphan event's person"
    assert person[0] == 0, f"the recreated person must be INACTIVE, got active={person[0]}"
    ev = con.execute("SELECT person_id FROM events WHERE id='ev-orphan'").fetchone()
    assert ev[0] == "ghost-event-person", "the event's own person_id must be UNCHANGED — nothing they filed is deleted or reattributed"


def t_untagged_artifact_backfilled_to_legacy_ungrouped():
    con = fresh_db()
    seed(con)
    run_chain(con)
    row = con.execute("SELECT group_tag FROM artifacts WHERE id='art-untagged'").fetchone()
    assert row[0] == "legacy-ungrouped", f"expected 'legacy-ungrouped', got {row[0]!r}"
    # the CHECK itself (migrate-035.sql) must still refuse the banned literal going forward
    try:
        con.execute("INSERT INTO artifacts (id,person_id,kind,r2_key,sha256,bytes,group_tag,created_at) VALUES ('art-bad','p1','html','k2','sha2',10,'ungrouped',?)", (NOW,))
        con.commit()
        raise AssertionError("group_tag='ungrouped' should have been refused by the CHECK, insert SUCCEEDED")
    except sqlite3.IntegrityError:
        pass


def t_real_person_and_transmission_untouched():
    con = fresh_db()
    seed(con)
    run_chain(con)
    p = con.execute("SELECT active FROM people WHERE id='p1'").fetchone()
    assert p[0] == 1, "the REAL, already-valid person must stay untouched (active=1)"
    t = con.execute("SELECT submitter FROM transmission WHERE id='T-1'").fetchone()
    assert t[0] == "p1", "the real transmission's own submitter must be unchanged"


def t_replay_converges_no_stale_trigger_refs_or_old_tables():
    """batch migrate-031-reentrancy (2026-09-23): the SAME chain, applied a SECOND time against the
    SAME connection — no re-seed, no fresh fixture — is exactly the shape `sh tools/migrate-dryrun.sh
    ryuklabs-agent-r` hits for real against an org that already carries migrate-035's own schema.
    Measured live: SQLite's own ALTER TABLE RENAME behavior (cited in migrate-031.sql's own header)
    rewrites migrate-034.sql's `approval_audit_no_delete_real` trigger body (its WHEN clause names
    `transmission`) the moment migrate-031.sql's REPLAY renames that table away; migrate-031.sql then
    drops `transmission_old`, and the now-dangling trigger blows up the moment approval_audit's own
    rename touches it a few statements later — `no such table: main.transmission_old`, reproduced
    against origin/main's own migrate-031.sql by --inject (this case is not swapped out of INJECT_SWAP
    on purpose — it is the one this heal exists to prove)."""
    con = fresh_db()
    seed(con)
    run_chain(con)  # pass 1 — a fresh org becomes "already migrated"
    run_chain(con)  # pass 2 — the replay this heal makes safe (must not raise)
    old_tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_old'").fetchall()]
    assert old_tables == [], f"leftover *_old table(s) survive two passes: {old_tables}"
    triggers = con.execute("SELECT name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name").fetchall()
    assert [t[0] for t in triggers] == ["approval_audit_no_delete_real", "approval_audit_no_update"], \
        f"expected exactly the two approval_audit triggers to survive, got {[t[0] for t in triggers]}"
    for name, sql in triggers:
        assert "_old" not in sql, f"trigger {name} still names a *_old table after replay: {sql!r}"
    # every OTHER schema object too — not just triggers. check_results.transmission_id is the SECOND
    # cascade victim this heal found live: it carries a REAL FK into `transmission` from migrate-032.sql
    # (once that file has run once, exactly ryuklabs-agent-r's own shape), but check_results itself is
    # never rebuilt inside migrate-031.sql — the seed()-inserted check_results row (scenario 5) is what
    # makes this assertion a case that COULD have failed without migrate-031.sql's own check_results
    # defuse step.
    tables = con.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL").fetchall()
    for name, sql in tables:
        assert "_old" not in sql, f"table {name}'s own schema still names a *_old table after replay: {sql!r}"
    cr = con.execute("SELECT transmission_id, graded_by FROM check_results WHERE project='proj1' AND check_id='AC.test.01'").fetchone()
    assert cr == ("T-1", "p1"), f"the seeded check_results row must survive the replay unchanged, got {cr}"
    fk_bad = con.execute("PRAGMA foreign_key_check(check_results)").fetchall()
    assert fk_bad == [], f"check_results carries an unresolved FK after replay: {fk_bad}"
    # the real proof, not a DDL read: the restored trigger must still actually fire post-replay.
    con.execute(
        "INSERT INTO transmission (id,submitter,lane,route,status,created_at) VALUES ('T-replay','p1','code','auto','received',?)",
        (NOW,),
    )
    con.execute(
        "INSERT INTO approval_audit (id,transmission_id,verdict,decided_by,created_at) VALUES ('aa-replay','T-replay','approve','p1',?)",
        (NOW,),
    )
    try:
        con.execute("UPDATE approval_audit SET note='x' WHERE id='aa-replay'")
        raise AssertionError("approval_audit_no_update should have refused this UPDATE post-replay, it SUCCEEDED")
    except sqlite3.IntegrityError:
        pass


# sprint 7 (7.1): migrate-070 (the accounts) is skipped on a replay at its first ALTER, as 067 is (its guard asks nothing then)
SEVENTY = "migrate-070.sql"
# sprint 7 (7.3): migrate-072 (the org's path name) likewise, at its first ALTER (duplicate column name)
SEVENTY_TWO = "migrate-072.sql"
# sprint 7 (7.4a): migrate-073 (the session's account) likewise, at its first ALTER
SEVENTY_THREE = "migrate-073.sql"
# sprint 7's review (A1): migrate-074 (the seat's wait for its holder's yes) likewise, at its one ALTER
SEVENTY_FOUR = "migrate-074.sql"
# sprint 8 (8.1): migrate-075 (a plan per org and its limits) likewise, at its one ALTER (its table and rows kept by IF NOT EXISTS / DO NOTHING)
SEVENTY_FIVE = "migrate-075.sql"
SEVENTY_SEVEN = "migrate-077.sql"
SEVENTY_NINE = "migrate-079.sql"   # sprint 12, 12.3: it opens with ALTER TABLE accounts ADD COLUMN invited_org
EIGHTY = "migrate-080.sql"   # sprint 13, 13.1: its one statement, ALTER TABLE transmission ADD COLUMN client
EIGHTY_ONE = "migrate-081.sql"   # sprint 21, 21.4c: it opens with ALTER TABLE accounts ADD COLUMN google_sub


def apply_chain_skipping(con, start="", stop="~"):
    """EVERY migrate-*.sql in sorted order, the way tools/lib-migrate-chain.sh mdr_apply_chain applies them to a real
    org's copy: a file whose error is the well-known "already applied" shape (duplicate column name / already exists) is
    skipped (its transaction rolled back), any other error is real and raised. Returns the files skipped. start / stop
    bound the files by name (start <= name < stop), as the tool's --from does."""
    import glob
    skipped = []
    for path in sorted(glob.glob(os.path.join(migrations_dir(), "migrate-*.sql"))):
        if not (start <= os.path.basename(path) < stop):
            continue
        try:
            apply_migration(con, path)
        except Exception as e:
            low = str(e).lower()
            if "duplicate column name" in low or "already exists" in low:
                skipped.append(os.path.basename(path))
                continue
            raise AssertionError(f"{os.path.basename(path)} FAILED: {e}")
    return skipped


# the derived tables a replay must leave exact, each read in a stable order (k_node_lights without updated_at: the
# backfill stamps it again; its counts are what the Map reads)
DERIVED = {
    "k_node_lights": "SELECT project, node_id, green, red, amber, grey, light FROM k_node_lights ORDER BY 1, 2",
    "k_node_links": "SELECT project, node_id, links FROM k_node_links ORDER BY 1, 2",
    "k_screen_renders": "SELECT project, screen, renders FROM k_screen_renders ORDER BY 1, 2",
    "k_check_ungraded": "SELECT project, check_id FROM k_check_ungraded ORDER BY 1, 2",
    "k_check_refs": "SELECT project, ref, check_id FROM k_check_refs ORDER BY 1, 2, 3",
    "transmission_open": "SELECT * FROM transmission_open WHERE n <> 0 ORDER BY 1, 2, 3, 4, 5",
    "transmission_kinds": "SELECT * FROM transmission_kinds WHERE n <> 0 ORDER BY 1, 2, 3, 4",
    "transmission_goals": "SELECT * FROM transmission_goals WHERE n <> 0 ORDER BY 1, 2, 3, 4, 5, 6",
    "loops_open": "SELECT * FROM loops_open WHERE n <> 0 ORDER BY 1, 2",
    # sprint 3 (B3): migrate-050's checklist counts (its six check_results triggers are dropped by 031 and 032 and put back)
    "k_fill": "SELECT * FROM k_fill WHERE NOT (kind = 'stale' AND n = 0) ORDER BY 1, 2",
    # sprint 3 (B4): migrate-054's stale proof (its twelve triggers are dropped by 031 and 032 and put back; a zero stale row
    # in k_fill reads as none, as a tally's zero group does)
    "k_node_stale": "SELECT project, node_id, changed_at, changed_by, stale FROM k_node_stale ORDER BY 1, 2",
    "k_check_stale": "SELECT project, check_id FROM k_check_stale ORDER BY 1, 2",
    # sprint 4 (M6): migrate-065's takes (its two triggers on k_renders and its backfill: a replay appends none)
    "k_screen_takes": "SELECT project, screen, state, variant, format, take, hash, filed_at, filed_by FROM k_screen_takes ORDER BY 1, 2, 3, 4, 5, 6",
}
LIGHTS_RECOMPUTED = """
  SELECT r.project, r.ref, COALESCE(SUM(g.status IS 'proven'), 0), COALESCE(SUM(g.status IS 'refused'), 0),
    COALESCE(SUM(g.id IS NOT NULL AND g.status IS NOT 'proven' AND g.status IS NOT 'refused'), 0), COALESCE(SUM(g.id IS NULL), 0)
  FROM k_check_refs r LEFT JOIN check_results g ON g.id = (SELECT x.id FROM check_results x WHERE x.project = r.project
    AND x.check_id = r.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1)
  GROUP BY r.project, r.ref ORDER BY 1, 2"""


def seed_knowledge(con):
    """Rows for every derived table migrate-040..046 keep by trigger, filed AFTER the first pass (the k_* tables exist
    only from migrate-039), so the triggers themselves fill them: two nodes and a screen, an edge, two checks naming the
    nodes (one graded proven, one not), a render of the screen, an open loop."""
    w = ("p1", NOW, "p1", NOW)
    for nid, typ in (("n1", "table"), ("n2", "table"), ("screen:home", "screen")):
        con.execute("INSERT INTO k_nodes (project,id,type,name,created_by,created_at,updated_by,updated_at) VALUES ('proj1',?,?,?,?,?,?,?)", (nid, typ, nid, *w))
    con.execute("INSERT INTO k_edges (project,from_id,to_id,kind,created_by,created_at,updated_by,updated_at) VALUES ('proj1','n1','n2','reads',?,?,?,?)", w)
    con.execute("INSERT INTO k_checks (project,id,title,refs,created_by,created_at,updated_by,updated_at) VALUES ('proj1','C1','t','[\"n1\",\"n2\"]',?,?,?,?)", w)
    con.execute("INSERT INTO k_checks (project,id,title,refs,created_by,created_at,updated_by,updated_at) VALUES ('proj1','C2','t','[\"n1\"]',?,?,?,?)", w)
    con.execute("INSERT INTO check_results (project,pack_version,check_id,status,graded_by,graded_at) VALUES ('proj1','v1','C1','proven','p1',?)", (NOW,))
    con.execute("INSERT INTO k_renders (project,screen,state,variant,format,hash,bytes,created_by,created_at,updated_by,updated_at) VALUES ('proj1','screen:home','','','html',?,10,?,?,?,?)", ("a" * 64, *w))
    con.execute("INSERT INTO loops (id,person_id,title,status,opened_at) VALUES ('L1','p1','a loop','open',?)", (NOW,))
    # sprint 3 (B4): n1 changes after C1's grade, so C1's proof is stale there (migrate-054's rows are not empty across the replay)
    con.execute("UPDATE k_nodes SET name = 'n1, changed' WHERE project = 'proj1' AND id = 'n1'")


def t_full_chain_replay_keeps_every_trigger_and_derived_table_exact():
    """sprint-2 ship (2026-10-01): `sh tools/migrate-dryrun.sh ryuklabs-agent-r` pass 2 failed at migrate-031.sql with
    "error in trigger k_node_lights_ref_insert: no such table: main.check_results_defuse_old" — migrate-043's light
    triggers read check_results, which migrate-031 (and migrate-032) rebuild by rename. The WHOLE chain (every migrate-*.sql,
    skipping the already-applied ones as the real tool does) applied twice over a database that carries 040-046 and their
    rows: the replay must not fail, every trigger must be back, no schema text may name a *_old table, the derived tables
    must equal what pass 1 left and what their own backfills recompute, and the triggers must still fire.
    sprint 6: the whole-chain replay is the chain BEFORE migrate-067 — a re-run of migrate-031's rebuilds drops every
    column added after it (transmission.shape, the nine tables' org: tools/migrate-dryrun.sh notes the whole chain cannot
    replay past 053), so 067 and 068 are proved the way a ship replays them, `--from 067`, by the case below."""
    con = fresh_db()
    seed(con)
    SIX = "migrate-067.sql"
    apply_chain_skipping(con, stop=SIX)           # pass 1: the org becomes current (as of sprint 5)
    seed_knowledge(con)
    triggers1 = sorted(r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='trigger'"))
    for need in ("k_node_lights_ref_insert", "k_node_lights_grade_insert", "k_node_links_insert", "k_screen_renders_insert", "k_checks_ungraded_insert", "check_results_graded", "transmission_open_insert", "loops_open_insert", "k_fill_check_insert", "k_fill_grade_insert", "k_fill_node_insert",
                 "k_stale_grade_insert", "k_stale_ref_insert", "k_stale_node_update", "k_stale_contribution", "transmission_goals_insert", "transmission_next_done"):
        assert need in triggers1, f"pass 1 left no trigger {need}: {triggers1}"
    before = {t: con.execute(q).fetchall() for t, q in DERIVED.items()}
    assert before["k_node_lights"] and before["k_node_links"] and before["k_screen_renders"] and before["k_screen_takes"] and before["k_check_ungraded"] and before["loops_open"] and before["k_node_stale"] and before["k_check_stale"], \
        f"the fixture filed no derived rows (a case that cannot fail): {before}"
    apply_chain_skipping(con, stop=SIX)           # pass 2: the replay (must not raise)
    triggers2 = sorted(r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='trigger'"))
    assert triggers2 == triggers1, f"the replay changed the trigger set: lost {sorted(set(triggers1) - set(triggers2))}, gained {sorted(set(triggers2) - set(triggers1))}"
    stale = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE sql LIKE '%\\_old%' ESCAPE '\\'")]
    assert stale == [], f"schema object(s) name a *_old table after the replay: {stale}"
    after = {t: con.execute(q).fetchall() for t, q in DERIVED.items()}
    for t in DERIVED:
        assert after[t] == before[t], f"{t} changed across the replay: {before[t]} -> {after[t]}"
    lights = [r[:6] for r in after["k_node_lights"]]
    assert lights == con.execute(LIGHTS_RECOMPUTED).fetchall(), f"k_node_lights is not what its backfill computes: {lights}"
    # the triggers fire after the replay: a refusal moves C1's lights to red, an edge appends a link, a render rebuilds the screen
    con.execute("INSERT INTO check_results (project,pack_version,check_id,status,graded_by,graded_at) VALUES ('proj1','v1','C1','refused','p1','2026-09-23T00:00:00.000Z')")
    n2 = con.execute("SELECT light, green, red FROM k_node_lights WHERE project='proj1' AND node_id='n2'").fetchone()
    assert n2 == ("red", 0, 1), f"a new grade did not move the light after the replay: {n2}"
    con.execute("INSERT INTO k_edges (project,from_id,to_id,kind,created_by,created_at,updated_by,updated_at) VALUES ('proj1','n1','screen:home','reads','p1',?,'p1',?)", (NOW, NOW))
    links = con.execute("SELECT json_array_length(links) FROM k_node_links WHERE project='proj1' AND node_id='n1'").fetchone()
    assert links == (2,), f"a new edge did not reach k_node_links after the replay: {links}"
    con.execute("INSERT INTO k_checks (project,id,title,refs,created_by,created_at,updated_by,updated_at) VALUES ('proj1','C3','t','[\"n2\"]','p1',?,'p1',?)", (NOW, NOW))
    assert con.execute("SELECT 1 FROM k_check_ungraded WHERE project='proj1' AND check_id='C3'").fetchone(), "a new ungraded check did not reach k_check_ungraded after the replay"
    fill = con.execute("SELECT n, ungraded FROM k_fill WHERE project='proj1' AND kind='check'").fetchone()
    assert fill == (3, 2), f"a new check did not reach k_fill after the replay (want 3 checks, 2 ungraded): {fill}"


def t_sprint6_067_068_apply_then_replay_from_067():
    """sprint 6 (6.1): over an org current as of sprint 5 (the chain to 066, with its rows), 067 then 068 apply in the ship's
    order and fill org 1 into every org-wide row; `--from 067` again (the dry run's replay) skips 067 at its first column
    and re-runs 068 (re-runnable): the trigger set and every derived table unchanged."""
    SIX = "migrate-067.sql"
    con = fresh_db()
    seed(con)
    apply_chain_skipping(con, stop=SIX)
    seed_knowledge(con)
    pre = {t: con.execute(q).fetchall() for t, q in DERIVED.items()}
    assert apply_chain_skipping(con, start=SIX) == [], "067/068 did not apply over the org"
    moved = [t for t in DERIVED if con.execute(DERIVED[t]).fetchall() != pre[t]]
    assert not moved, f"067/068 moved a derived table (the fill must fire no running count; org 1's bucket stays ''): {moved}"
    triggers3 = sorted(r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='trigger'"))
    assert all(f"{t}_org_required" in triggers3 for t in ("people", "tokens", "events", "loops", "transmission")), f"068's triggers missing: {triggers3}"
    mid = {t: con.execute(q).fetchall() for t, q in DERIVED.items()}
    assert apply_chain_skipping(con, start=SIX) == [SIX, SEVENTY, SEVENTY_TWO, SEVENTY_THREE, SEVENTY_FOUR, SEVENTY_FIVE, SEVENTY_SEVEN, SEVENTY_NINE, EIGHTY, EIGHTY_ONE], "the replay of 067 (and 070, 072, 073, 074, 075, 077, 079, 080, 081) was not skipped at its first column"
    assert sorted(r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='trigger'")) == triggers3, "the --from 067 replay changed the trigger set"
    assert {t: con.execute(q).fetchall() for t, q in DERIVED.items()} == mid, "the --from 067 replay changed a derived table"
    nulls = [t for t in ("people", "tokens", "events", "loops", "transmission", "approval_audit", "artifacts", "invites", "login_attempts")
             if con.execute(f"SELECT COUNT(*) FROM {t} WHERE org IS NOT 1").fetchone()[0]]
    assert not nulls, f"rows left without org 1 after 067: {nulls}"


def t_sprint6_two_orgs_069_apply_then_replay():
    """sprint 6 (6.6; PLATFORM §5: a migration's dry run uses a copy holding at least two orgs): over an org current as of 068
    that holds a SECOND org (tools/fixtures/two-orgs.mjs sql — the dry run's own seed: an org row, its owner, member, two
    projects, a goal, a question, a contribution, an events row), migrate-069 applies (the (submitter, client_ref) index
    UNIQUE, the old one and transmission_refs_meta gone) and the replay from 067 changes nothing: both orgs' rows table by
    table, every row of org 2 still org 2's (its projects' keys, its ledger's project, its events), and the index refuses a
    second filing under one person's clientRef in either org."""
    SIX, NINE = "migrate-067.sql", "migrate-069.sql"
    con = fresh_db()
    seed(con)
    apply_chain_skipping(con, stop=SIX)
    seed_knowledge(con)
    assert apply_chain_skipping(con, start=SIX, stop=NINE) == [], "067/068 did not apply over the org"
    sql = subprocess.run(["node", os.path.join(ROOT, "tools", "fixtures", "two-orgs.mjs"), "sql", "2", "dryrunorgb"], capture_output=True, text=True, check=True).stdout
    assert "'--" not in sql and "--'" not in sql, "the second org's SQL holds a quoted '--' (wrangler's splitter would cut it)"
    con.executescript(sql)
    TABLES = ("org", "people", "projects", "project_seats", "transmission", "events", "k_goals", "k_questions")
    def counts():
        return {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in TABLES}
    def org2():
        return (con.execute("SELECT COUNT(*) FROM projects WHERE org = 2").fetchone()[0], con.execute("SELECT COUNT(*) FROM people WHERE org = 2").fetchone()[0],
                con.execute("SELECT COUNT(*) FROM transmission WHERE org = 2").fetchone()[0], con.execute("SELECT COUNT(*) FROM events WHERE org = 2").fetchone()[0])
    before, b2 = counts(), org2()
    one = con.execute("SELECT COUNT(*) FROM people WHERE org = 1").fetchone()[0]
    assert one >= 1 and con.execute("SELECT COUNT(*) FROM org WHERE id = 2").fetchone()[0] == 1 and b2 == (2, 2, 1, 1), f"the copy does not hold two orgs: org 1's people {one}, org 2's {b2}"
    assert apply_chain_skipping(con, start=NINE) == [], "069 did not apply over two orgs"
    idx = {r[0]: r[1] for r in con.execute("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='transmission'")}
    assert "idx_transmission_clientref_once" in idx and "UNIQUE" in idx["idx_transmission_clientref_once"] and "idx_transmission_clientref" not in idx, f"069's indexes: {sorted(idx)}"
    assert not con.execute("SELECT 1 FROM sqlite_master WHERE name = 'transmission_refs_meta'").fetchone(), "069 left transmission_refs_meta"
    assert apply_chain_skipping(con, start=SIX) == [SIX, SEVENTY, SEVENTY_TWO, SEVENTY_THREE, SEVENTY_FOUR, SEVENTY_FIVE, SEVENTY_SEVEN, SEVENTY_NINE, EIGHTY, EIGHTY_ONE], "the --from 067 replay over two orgs did not skip 067, 070, 072, 073, 074, 075, 077, 079, 080 and 081 alone"
    assert counts() == before and org2() == b2, f"069 or the replay moved a row: {before} -> {counts()}, org 2 {b2} -> {org2()}"
    plans = con.execute("SELECT id, plan FROM org ORDER BY id").fetchall()
    assert (2, "free") in plans and all((p == "team") == (i == 1) for i, p in plans) and con.execute("SELECT COUNT(*) FROM plan_limits").fetchone()[0] == 2, \
        f"075 over two orgs: org 2 free (org 1, where it has a row, team), the two plans (got {plans})"
    cross = con.execute("SELECT (SELECT COUNT(*) FROM transmission t JOIN projects p ON p.key = t.project WHERE t.org IS NOT p.org) + "
                        "(SELECT COUNT(*) FROM events e JOIN projects p ON p.key = e.project WHERE e.org IS NOT p.org) + "
                        "(SELECT COUNT(*) FROM project_seats s JOIN people x ON x.id = s.person_id JOIN projects p ON p.key = s.project_key WHERE x.org IS NOT p.org)").fetchone()[0]
    assert cross == 0, f"{cross} row(s) of one org name a project of the other after the replay"
    for org, who in ((2, "dryrunorgb-member-2"), (1, con.execute("SELECT submitter FROM transmission WHERE org = 1 AND submitter IS NOT NULL LIMIT 1").fetchone()[0])):
        con.execute("INSERT INTO transmission (id, submitter, lane, route, status, client_ref, created_at, org) VALUES (?, ?, 'leader', 'auto', 'routed', 'dup-ref', '2026-10-06T00:00:00.000Z', ?)", (f"T-20261006-9{org}1", who, org))
        try:
            con.execute("INSERT INTO transmission (id, submitter, lane, route, status, client_ref, created_at, org) VALUES (?, ?, 'leader', 'auto', 'routed', 'dup-ref', '2026-10-06T00:00:00.000Z', ?)", (f"T-20261006-9{org}2", who, org))
            raise AssertionError(f"org {org}: a second filing under one person's clientRef landed (069's index is not unique)")
        except sqlite3.IntegrityError:
            pass


CASES = [
    t_chain_applies_clean,
    t_transmission_refs_survives_and_a_fresh_row_still_inserts,
    t_orphan_token_person_recreated_inactive_and_token_revoked,
    t_stray_project_token_revoked_and_nulled,
    t_orphan_event_person_recreated_inactive,
    t_untagged_artifact_backfilled_to_legacy_ungrouped,
    t_real_person_and_transmission_untouched,
    t_replay_converges_no_stale_trigger_refs_or_old_tables,
    t_full_chain_replay_keeps_every_trigger_and_derived_table_exact,
    t_sprint6_067_068_apply_then_replay_from_067,
    t_sprint6_two_orgs_069_apply_then_replay,
]

# migrate-030.sql/030a.sql/032.sql/034.sql are NOT swapped by --inject: 030a.sql is new in this batch
# and does not exist on origin/main at all (there is nothing to fetch), and 032.sql/034.sql are
# untouched by it (`git diff --stat origin/main -- 'engine/migrate-0*.sql'` at write time named only
# migrate-030a.sql/031.sql/033.sql/035.sql as changed). Swapping only the three this batch actually
# fixed is what makes the injection test target — and prove — exactly this batch's own regression,
# not some unrelated drift.
INJECT_KEEP = ["migrate-030.sql", "migrate-030a.sql", "migrate-032.sql", "migrate-034.sql"]
INJECT_SWAP = ["migrate-031.sql", "migrate-033.sql", "migrate-035.sql"]


def build_inject_dir():
    """A throwaway temp dir standing in for 'this batch's migrate-031/033/035.sql fixes never
    landed': those three files come back LIVE from origin/main via `git show` (never a cached or
    hand-typed copy — the exact text this batch replaces, whatever it is today); everything else
    this fixture's migration chain needs comes from THIS checkout unchanged. Caller owns cleanup
    (shutil.rmtree)."""
    d = tempfile.mkdtemp(prefix="migrate-dryrun-inject-")
    root_prefix = os.path.basename(ROOT)  # "engine" — git show wants a repo-root-relative path
    for name in INJECT_KEEP:
        shutil.copy(os.path.join(ROOT, name), os.path.join(d, name))
    for name in INJECT_SWAP:
        original = subprocess.run(
            ["git", "-C", ROOT, "show", f"origin/main:{root_prefix}/{name}"],
            capture_output=True, text=True, check=True,
        ).stdout
        with open(os.path.join(d, name), "w") as f:
            f.write(original)
    return d


def main():
    inject = "--inject" in sys.argv[1:]
    cleanup_dir = None
    if inject:
        cleanup_dir = build_inject_dir()
        os.environ["MIGRATE_DRYRUN_SQL_DIR"] = cleanup_dir
    try:
        for fn in CASES:
            case(fn.__name__, fn)
        fails = [r for r in results if not r[1]]
        for name, ok, detail in results:
            print(f"  {'✓' if ok else '✗'} {name}" + ("" if ok else f" — {detail}"))
        if fails:
            print(f"  → {len(fails)}/{len(results)} case(s) failed (dir: {migrations_dir()})")
            if inject:
                print("  → --inject: the fixture IS sensitive to this batch's own regression "
                      "(origin/main's migrate-031/033/035.sql, as fetched above)")
            return 1
        if inject:
            print(f"  → --inject FAILED TO FAIL: all {len(results)} case(s) passed against "
                  "origin/main's original migrate-031/033/035.sql — this fixture cannot detect the "
                  "regression it exists to catch (ABSENCE IS NOT EVIDENCE, docs/GUARDRAILS.md)")
            return 1
        print(f"  ✓ migrate-dryrun fixture selftest: {len(results)}/{len(results)} case(s) hold "
              f"(dir: {migrations_dir()})")
        return 0
    finally:
        if cleanup_dir:
            del os.environ["MIGRATE_DRYRUN_SQL_DIR"]
            shutil.rmtree(cleanup_dir, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
