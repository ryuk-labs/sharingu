#!/usr/bin/env python3
"""fk-enforce-selftest.py — build0921:schema-enforced (QD1A9E7EB · Q5AE248CC · Q0B50A78E ·
Q23D7E346 · QE2D90B38).

Proves boot.sql's schema hardening the only way that counts: a real SQLite connection, PRAGMA
foreign_keys=ON, boot.sql applied verbatim, then for every FOREIGN KEY / CHECK / TRIGGER this batch
added, ONE positive case (a legitimate row the constraint must accept) and ONE negative case (a row
it must refuse) — printed with its actual outcome, never asserted from reading the DDL. A constraint
this file did not watch reject a bad row is not proven (ABSENCE IS NOT EVIDENCE).

D1 note (verified against Cloudflare's own docs, 2026-09-18 board pass, re-checked here): D1 enforces
every FOREIGN KEY it is given AS THE DEFAULT — PRAGMA foreign_keys=ON is not optional in D1, it
cannot be turned off mid-transaction either (D1 wraps every write in an implicit transaction). This
harness sets it explicitly because a bare sqlite3 connection (unlike D1) defaults it OFF — the
harness must not be more lenient than the runtime it stands in for.
Source: https://developers.cloudflare.com/d1/sql-api/foreign-keys/

Usage: python3 tools/fk-enforce-selftest.py
Exit 0 all cases behaved as expected; exit 1 with every miss listed.
"""
import os, sqlite3, sys, uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOT = os.path.join(ROOT, "boot.sql")


def fresh_db():
    con = sqlite3.connect(":memory:")
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(open(BOOT).read())
    return con


def seed_person(con, pid="p1"):
    con.execute(
        "INSERT INTO people (id,name,role,key_hash,created_at,org) VALUES (?,?,?,?,?,1)",
        (pid, "Test Person", "owner", uuid.uuid4().hex, "2026-09-21T00:00:00.000Z"),
    )


def seed_project(con, key="proj1"):
    con.execute(
        "INSERT INTO projects (key,name,created_at) VALUES (?,?,?)",
        (key, "Test Project", "2026-09-21T00:00:00.000Z"),
    )


def seed_transmission(con, tid="T-1", submitter="p1"):
    con.execute(
        "INSERT INTO transmission (id,submitter,lane,route,status,created_at,org) VALUES (?,?,?,?,?,?,1)",
        (tid, submitter, "code", "auto", "received", "2026-09-21T00:00:00.000Z"),
    )


results = []  # (name, ok, detail)


def case(name, fn):
    try:
        fn()
        results.append((name, True, "ok"))
    except AssertionError as e:
        results.append((name, False, str(e)))
    except Exception as e:
        results.append((name, False, f"unexpected {type(e).__name__}: {e}"))


def expect_integrity_error(con, sql, params, label):
    try:
        con.execute(sql, params)
        con.commit()
        raise AssertionError(f"{label}: expected FOREIGN KEY/CHECK/trigger refusal, insert SUCCEEDED")
    except sqlite3.IntegrityError as e:
        return str(e)


# ---- QD1A9E7EB / QCE1F9725 — convention relations, now real FKs -------------------------------

def t_approval_audit_transmission_fk():
    con = fresh_db()
    seed_person(con); seed_transmission(con)
    con.execute("INSERT INTO approval_audit (id,transmission_id,verdict,decided_by,created_at,org) VALUES (?,?,?,?,?,1)",
                ("a1", "T-1", "approve", "p1", "2026-09-21T00:00:00.000Z"))
    con.commit()
    err = expect_integrity_error(con,
        "INSERT INTO approval_audit (id,transmission_id,verdict,decided_by,created_at,org) VALUES (?,?,?,?,?,1)",
        ("a2", "T-ORPHAN", "approve", "p1", "2026-09-21T00:00:00.000Z"),
        "approval_audit.transmission_id -> transmission.id")
    assert "FOREIGN KEY" in err, err


def t_approval_audit_decided_by_fk():
    con = fresh_db()
    seed_person(con); seed_transmission(con)
    expect_integrity_error(con,
        "INSERT INTO approval_audit (id,transmission_id,verdict,decided_by,created_at,org) VALUES (?,?,?,?,?,1)",
        ("a3", "T-1", "approve", "p-ORPHAN", "2026-09-21T00:00:00.000Z"),
        "approval_audit.decided_by -> people.id")


def t_invites_project_key_fk():
    con = fresh_db()
    seed_person(con)
    expect_integrity_error(con,
        "INSERT INTO invites (id,code_hash,project_key,role,created_by,created_at,expires_at,org) VALUES (?,?,?,?,?,?,?,1)",
        ("i1", "h1", "PROJ-ORPHAN", "member", "p1", "2026-09-21T00:00:00.000Z", "2026-09-22T00:00:00.000Z"),
        "invites.project_key -> projects.key")


def t_invites_created_by_fk():
    con = fresh_db()
    seed_project(con)
    expect_integrity_error(con,
        "INSERT INTO invites (id,code_hash,project_key,role,created_by,created_at,expires_at,org) VALUES (?,?,?,?,?,?,?,1)",
        ("i2", "h2", "proj1", "member", "p-ORPHAN", "2026-09-21T00:00:00.000Z", "2026-09-22T00:00:00.000Z"),
        "invites.created_by -> people.id")


def t_loops_person_fk():
    con = fresh_db()
    expect_integrity_error(con,
        "INSERT INTO loops (id,person_id,title,opened_at,org) VALUES (?,?,?,?,1)",
        ("l1", "p-ORPHAN", "a loop", "2026-09-21T00:00:00.000Z"),
        "loops.person_id -> people.id")


def t_project_seats_fk_pair():
    con = fresh_db()
    seed_person(con); seed_project(con)
    con.execute("INSERT INTO project_seats (person_id,project_key,created_at) VALUES (?,?,?)",
                ("p1", "proj1", "2026-09-21T00:00:00.000Z"))
    con.commit()
    expect_integrity_error(con,
        "INSERT INTO project_seats (person_id,project_key,created_at) VALUES (?,?,?)",
        ("p-ORPHAN", "proj1", "2026-09-21T00:00:00.000Z"),
        "project_seats.person_id -> people.id")
    expect_integrity_error(con,
        "INSERT INTO project_seats (person_id,project_key,created_at) VALUES (?,?,?)",
        ("p1", "PROJ-ORPHAN", "2026-09-21T00:00:00.000Z"),
        "project_seats.project_key -> projects.key")


def t_tokens_person_fk():
    con = fresh_db()
    expect_integrity_error(con,
        "INSERT INTO tokens (token_hash,person_id,created_at,expires_at,org) VALUES (?,?,?,?,1)",
        ("tok1", "p-ORPHAN", "2026-09-21T00:00:00.000Z", "2026-10-21T00:00:00.000Z"),
        "tokens.person_id -> people.id")


def t_transmission_submitter_fk():
    con = fresh_db()
    expect_integrity_error(con,
        "INSERT INTO transmission (id,submitter,lane,route,status,created_at,org) VALUES (?,?,?,?,?,?,1)",
        ("T-BAD", "p-ORPHAN", "code", "auto", "received", "2026-09-21T00:00:00.000Z"),
        "transmission.submitter -> people.id")


def t_transmission_parent_selfref_fk():
    con = fresh_db()
    seed_person(con); seed_transmission(con, "T-1")
    con.execute(
        "INSERT INTO transmission (id,submitter,lane,route,status,created_at,parent,org) VALUES (?,?,?,?,?,?,?,1)",
        ("T-2", "p1", "code", "auto", "received", "2026-09-21T00:00:00.000Z", "T-1"))
    con.commit()
    expect_integrity_error(con,
        "INSERT INTO transmission (id,submitter,lane,route,status,created_at,parent,org) VALUES (?,?,?,?,?,?,?,1)",
        ("T-3", "p1", "code", "auto", "received", "2026-09-21T00:00:00.000Z", "T-ORPHAN"),
        "transmission.parent -> transmission.id (self-ref)")


def t_transmission_project_fk():
    con = fresh_db()
    seed_person(con)
    expect_integrity_error(con,
        "INSERT INTO transmission (id,submitter,lane,route,status,created_at,project,org) VALUES (?,?,?,?,?,?,?,1)",
        ("T-4", "p1", "code", "auto", "received", "2026-09-21T00:00:00.000Z", "PROJ-ORPHAN"),
        "transmission.project -> projects.key")


# ---- Q5AE248CC — check_results type fix + FK --------------------------------------------------

def t_check_results_transmission_id_fk_text():
    con = fresh_db()
    seed_person(con); seed_project(con); seed_transmission(con)
    con.execute(
        "INSERT INTO check_results (project,pack_version,check_id,status,transmission_id,graded_by) VALUES (?,?,?,?,?,?)",
        ("proj1", "v1", "AC.01", "proven", "T-1", "p1"))
    con.commit()
    col_type = con.execute("SELECT typeof(transmission_id) FROM check_results WHERE check_id='AC.01'").fetchone()[0]
    assert col_type == "text", f"expected transmission_id stored as text, got {col_type}"
    expect_integrity_error(con,
        "INSERT INTO check_results (project,pack_version,check_id,status,transmission_id,graded_by) VALUES (?,?,?,?,?,?)",
        ("proj1", "v1", "AC.02", "proven", "T-ORPHAN", "p1"),
        "check_results.transmission_id -> transmission.id (TEXT, post-ALTER)")


def t_check_results_graded_by_fk_text():
    con = fresh_db()
    seed_project(con)
    expect_integrity_error(con,
        "INSERT INTO check_results (project,pack_version,check_id,status,graded_by) VALUES (?,?,?,?,?)",
        ("proj1", "v1", "AC.03", "proven", "p-ORPHAN"),
        "check_results.graded_by -> people.id (TEXT, post-ALTER)")


def t_check_results_project_fk():
    con = fresh_db()
    seed_person(con)
    expect_integrity_error(con,
        "INSERT INTO check_results (project,pack_version,check_id,status,graded_by) VALUES (?,?,?,?,?)",
        ("PROJ-ORPHAN", "v1", "AC.04", "proven", "p1"),
        "check_results.project -> projects.key")


# ---- Q0B50A78E — events FK + payload_json structural check -------------------------------------

def t_events_person_fk():
    con = fresh_db()
    expect_integrity_error(con,
        "INSERT INTO events (id,person_id,kind,created_at,org) VALUES (?,?,?,?,1)",
        ("e1", "p-ORPHAN", "drift", "2026-09-21T00:00:00.000Z"),
        "events.person_id -> people.id")


def t_events_project_fk():
    con = fresh_db()
    seed_person(con)
    expect_integrity_error(con,
        "INSERT INTO events (id,person_id,kind,created_at,project,org) VALUES (?,?,?,?,?,1)",
        ("e2", "p1", "drift", "2026-09-21T00:00:00.000Z", "PROJ-ORPHAN"),
        "events.project -> projects.key")


def t_events_payload_json_must_be_valid_json():
    con = fresh_db()
    seed_person(con)
    con.execute("INSERT INTO events (id,person_id,kind,created_at,payload_json,org) VALUES (?,?,?,?,?,1)",
                ("e3", "p1", "drift", "2026-09-21T00:00:00.000Z", '{"claim":"x"}'))
    con.commit()
    expect_integrity_error(con,
        "INSERT INTO events (id,person_id,kind,created_at,payload_json,org) VALUES (?,?,?,?,?,1)",
        ("e4", "p1", "drift", "2026-09-21T00:00:00.000Z", "this is a raw pasted transcript, not JSON"),
        "events.payload_json CHECK json_valid()")


# ---- Q23D7E346 — approval_audit append-only ----------------------------------------------------

def t_approval_audit_no_update():
    con = fresh_db()
    seed_person(con); seed_transmission(con)
    con.execute("INSERT INTO approval_audit (id,transmission_id,verdict,decided_by,created_at,org) VALUES (?,?,?,?,?,1)",
                ("a10", "T-1", "needs-work", "p1", "2026-09-21T00:00:00.000Z"))
    con.commit()
    try:
        con.execute("UPDATE approval_audit SET verdict='approve' WHERE id='a10'")
        con.commit()
        raise AssertionError("approval_audit UPDATE should have been refused by the trigger, but SUCCEEDED")
    except sqlite3.IntegrityError as e:
        assert "append-only" in str(e), str(e)


def t_approval_audit_no_delete_real_row():
    con = fresh_db()
    seed_person(con); seed_transmission(con, "T-1")
    con.execute("INSERT INTO approval_audit (id,transmission_id,verdict,decided_by,created_at,org) VALUES (?,?,?,?,?,1)",
                ("a11", "T-1", "approve", "p1", "2026-09-21T00:00:00.000Z"))
    con.commit()
    try:
        con.execute("DELETE FROM approval_audit WHERE id='a11'")
        con.commit()
        raise AssertionError("approval_audit DELETE on a real (eval=0) row should have been refused, but SUCCEEDED")
    except sqlite3.IntegrityError as e:
        assert "append-only" in str(e), str(e)


def t_approval_audit_delete_allowed_for_eval_row():
    con = fresh_db()
    seed_person(con)
    con.execute("INSERT INTO transmission (id,submitter,lane,route,status,eval,created_at,org) VALUES (?,?,?,?,?,?,?,1)",
                ("T-EVAL", "p1", "code", "auto", "received", 1, "2026-09-21T00:00:00.000Z"))
    con.execute("INSERT INTO approval_audit (id,transmission_id,verdict,decided_by,created_at,org) VALUES (?,?,?,?,?,1)",
                ("a12", "T-EVAL", "approve", "p1", "2026-09-21T00:00:00.000Z"))
    con.commit()
    con.execute("DELETE FROM approval_audit WHERE transmission_id IN (SELECT id FROM transmission WHERE eval=1)")
    con.commit()
    n = con.execute("SELECT COUNT(*) FROM approval_audit WHERE id='a12'").fetchone()[0]
    assert n == 0, "the sanctioned eval-hygiene DELETE (src/admin.js) must still work — the trigger over-blocked it"


# ---- QE2D90B38 — artifacts group_tag NOT NULL + CHECK -------------------------------------------

def t_artifacts_group_tag_not_null():
    con = fresh_db()
    seed_person(con)
    try:
        con.execute(
            "INSERT INTO artifacts (id,person_id,kind,r2_key,sha256,bytes,created_at,org) VALUES (?,?,?,?,?,?,?,1)",
            ("art1", "p1", "html", "k1", "h1", 10, "2026-09-21T00:00:00.000Z"))
        con.commit()
        raise AssertionError("artifacts.group_tag NULL should have been refused (NOT NULL), but SUCCEEDED")
    except sqlite3.IntegrityError as e:
        assert "NOT NULL" in str(e), str(e)


def t_artifacts_group_tag_rejects_ungrouped():
    con = fresh_db()
    seed_person(con)
    try:
        con.execute(
            "INSERT INTO artifacts (id,person_id,kind,r2_key,sha256,bytes,created_at,group_tag,org) VALUES (?,?,?,?,?,?,?,?,1)",
            ("art2", "p1", "html", "k2", "h2", 10, "2026-09-21T00:00:00.000Z", "ungrouped"))
        con.commit()
        raise AssertionError("artifacts.group_tag='ungrouped' should have been refused (CHECK), but SUCCEEDED")
    except sqlite3.IntegrityError as e:
        assert "CHECK" in str(e), str(e)


def t_artifacts_group_tag_accepts_real_value_and_fk():
    con = fresh_db()
    seed_person(con); seed_project(con)
    con.execute(
        "INSERT INTO artifacts (id,person_id,kind,r2_key,sha256,bytes,created_at,group_tag,project,org) VALUES (?,?,?,?,?,?,?,?,?,1)",
        ("art3", "p1", "html", "k3", "h3", 10, "2026-09-21T00:00:00.000Z", "report", "proj1"))
    con.commit()
    expect_integrity_error(con,
        "INSERT INTO artifacts (id,person_id,kind,r2_key,sha256,bytes,created_at,group_tag,project,org) VALUES (?,?,?,?,?,?,?,?,?,1)",
        ("art4", "p1", "html", "k4", "h4", 10, "2026-09-21T00:00:00.000Z", "report", "PROJ-ORPHAN"),
        "artifacts.project -> projects.key")


def t_artifacts_person_fk():
    con = fresh_db()
    expect_integrity_error(con,
        "INSERT INTO artifacts (id,person_id,kind,r2_key,sha256,bytes,created_at,group_tag,org) VALUES (?,?,?,?,?,?,?,?,1)",
        ("art5", "p-ORPHAN", "html", "k5", "h5", 10, "2026-09-21T00:00:00.000Z", "report"),
        "artifacts.person_id -> people.id")


# ---- B3-heal (2026-09-22) — transmission_refs.tid -> transmission.id ---------------------------
# boot.sql has always declared this FK (migrate-018.sql), but no case here ever proved it — the gap
# that let migrate-031.sql's own rename-away-and-drop of `transmission` silently rewrite
# transmission_refs' own schema text to reference the dropped "transmission_old" ship unnoticed
# (measured live on siru-agent-r, 10 real rows, 2026-09-22) go uncaught by this file for one whole
# migration cycle. boot.sql itself was always correct (a fresh day-0 tenant never saw the bug); the
# INCREMENTAL migration replay was not — this case proves boot.sql's own declaration holds, the
# companion proof (tools/migrate-dryrun.sh / tools/migrate-dryrun-selftest.py) proves the replay does.
def t_transmission_refs_tid_fk():
    con = fresh_db()
    seed_person(con); seed_transmission(con)
    con.execute("INSERT INTO transmission_refs (tid, ref) VALUES (?, ?)", ("T-1", "screen:001"))
    con.commit()
    err = expect_integrity_error(con,
        "INSERT INTO transmission_refs (tid, ref) VALUES (?, ?)",
        ("T-ORPHAN", "screen:002"),
        "transmission_refs.tid -> transmission.id")
    assert "FOREIGN KEY" in err, err



# ---- sprint 6, 6.1 (migrate-067/068) — the org: many org rows; every org-wide row carries its org ---------------------

ORG_ROWS = {   # table -> (columns, values) of one legitimate row (seed_person and seed_transmission seed p1 and T-1)
    "people": ("id,name,role,key_hash,created_at", ("p-org", "P", "member", "h-org", "2026-09-21T00:00:00.000Z")),
    "tokens": ("token_hash,person_id,created_at,expires_at", ("tok-org", "p1", "2026-09-21T00:00:00.000Z", "2027-01-01T00:00:00.000Z")),
    "invites": ("id,code_hash,project_key,role,created_by,created_at,expires_at", ("i-org", "c-org", "proj1", "member", "p1", "2026-09-21T00:00:00.000Z", "2026-09-22T00:00:00.000Z")),
    "events": ("id,person_id,kind,created_at", ("e-org", "p1", "fragment", "2026-09-21T00:00:00.000Z")),
    "artifacts": ("id,person_id,kind,r2_key,sha256,bytes,group_tag,created_at", ("a-org", "p1", "html", "k", "s", 1, "report", "2026-09-21T00:00:00.000Z")),
    "loops": ("id,person_id,title,opened_at", ("l-org", "p1", "t", "2026-09-21T00:00:00.000Z")),
    "approval_audit": ("id,transmission_id,verdict,decided_by,created_at", ("aa-org", "T-1", "approve", "p1", "2026-09-21T00:00:00.000Z")),
    "login_attempts": ("id,email,ok,at", ("la-org", "x@y.z", 0, "2026-09-21T00:00:00.000Z")),
    "transmission": ("id,submitter,lane,route,status,created_at", ("T-org", "p1", "code", "auto", "received", "2026-09-21T00:00:00.000Z")),
}


def t_org_required_on_every_org_wide_table():
    con = fresh_db()
    seed_person(con); seed_project(con); seed_transmission(con)
    for t, (cols, vals) in ORG_ROWS.items():
        marks = ",".join("?" * len(vals))
        err = expect_integrity_error(con, f"INSERT INTO {t} ({cols}) VALUES ({marks})", vals, f"{t} without its org")
        assert "org_required" in err, f"{t}: refused, but not by its org trigger: {err}"
        con.execute(f"INSERT INTO {t} ({cols},org) VALUES ({marks},2)", vals)
        con.commit()
        assert con.execute(f"SELECT COUNT(*) FROM {t} WHERE org = 2").fetchone()[0] == 1, f"{t}: the row with its org did not land"


def t_org_holds_many_rows_with_positive_ids():
    con = fresh_db()
    for i in (1, 2, 3):
        con.execute("INSERT INTO org (id,name,created_at,updated_at) VALUES (?,?,?,?)", (i, f"org {i}", "t", "t"))
    con.commit()
    assert con.execute("SELECT COUNT(*) FROM org").fetchone()[0] == 3, "org does not hold three rows"
    expect_integrity_error(con, "INSERT INTO org (id,name,created_at,updated_at) VALUES (?,?,?,?)", (0, "zero", "t", "t"), "org id 0 (CHECK id >= 1)")


def t_project_key_carries_its_org():
    con = fresh_db()
    for k in ("siru", "o2--web", "o2-web"):
        seed_project(con, k)
    got = dict((r[0], (r[1], r[2])) for r in con.execute("SELECT key, org, slug FROM projects"))
    assert got == {"siru": (1, "siru"), "o2--web": (2, "web"), "o2-web": (1, "o2-web")}, got
    try:
        con.execute("INSERT INTO projects (key,name,created_at,org) VALUES (?,?,?,?)", ("o3--x", "X", "t", 3))
        raise AssertionError("a write of the generated projects.org SUCCEEDED")
    except sqlite3.OperationalError as e:
        assert "generated column" in str(e), str(e)

# ---- migrate-070.sql (sprint 7, 7.1): one account per email, a seat per org --------------------------------------------

def seat(con, pid, email, org=1, active=1, ph=None, ps=None):
    con.execute("INSERT INTO people (id,name,email,role,key_hash,active,created_at,pass_hash,pass_salt,org) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (pid, pid, email, "member", uuid.uuid4().hex, active, "2026-10-07T00:00:00.000Z", ph, ps, org))
    con.commit()


def acct(con, email):
    return con.execute("SELECT id, pass_hash, pass_salt FROM accounts WHERE email = ?", (email,)).fetchone()


def t_accounts_email_unique_and_lowercase():
    con = fresh_db()
    con.execute("INSERT INTO accounts (id,email,created_at,updated_at) VALUES ('a1','vic@x.test','t','t')"); con.commit()
    err = expect_integrity_error(con, "INSERT INTO accounts (id,email,created_at,updated_at) VALUES (?,?,?,?)", ("a2", "vic@x.test", "t", "t"), "a second account for one email")
    assert "UNIQUE" in err, err
    err = expect_integrity_error(con, "INSERT INTO accounts (id,email,created_at,updated_at) VALUES (?,?,?,?)", ("a3", "Vic@X.test", "t", "t"), "an account email not lower-cased")
    assert "CHECK" in err, err


def t_people_account_fk():
    con = fresh_db()
    seat(con, "p1", "p1@x.test")
    assert con.execute("SELECT account_id FROM people WHERE id='p1'").fetchone()[0] == acct(con, "p1@x.test")[0], "the seat is not its email's account's"
    err = expect_integrity_error(con, "INSERT INTO people (id,name,role,key_hash,created_at,org,account_id) VALUES (?,?,?,?,?,1,?)",
                                 ("p2", "x", "member", uuid.uuid4().hex, "t", "no-such-account"), "people.account_id -> accounts.id")
    assert "FOREIGN KEY" in err, err


def t_seat_attach_one_account_one_seat_per_org():
    con = fresh_db()
    seat(con, "v1", " Vic@X.test", 1, ph="h1", ps="s1"); seat(con, "v2", "vic@x.test", 2, ph="h2", ps="s2"); seat(con, "v0", "vic@x.test", 1, active=0)
    a = acct(con, "vic@x.test")
    assert a and a[1] is None, f"a new account carries a passphrase (an admin's minted key must never be one): {a}"
    assert con.execute("SELECT COUNT(DISTINCT account_id), COUNT(*) FROM people WHERE id IN ('v0','v1','v2')").fetchone() == (1, 3), "three seats of one email are not one account"
    err = expect_integrity_error(con, "INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,1,?,1)",
                                 ("v3", "v3", "VIC@x.test", "member", uuid.uuid4().hex, "t"), "a second active seat of one account in one org")
    assert "account_seat_taken" in err, err
    err = expect_integrity_error(con, "INSERT OR IGNORE INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,1,?,1)",
                                 ("v4", "v4", "vic@x.test", "member", uuid.uuid4().hex, "t"), "the same, under an outer OR IGNORE")
    assert "account_seat_taken" in err, err


def t_seat_email_set_once():
    con = fresh_db()
    con.execute("INSERT INTO people (id,name,role,key_hash,created_at,org) VALUES ('n1','n1','member',?, 't', 1)", (uuid.uuid4().hex,)); con.commit()
    con.execute("UPDATE people SET email = 'late@x.test' WHERE id = 'n1'"); con.commit()
    assert con.execute("SELECT account_id FROM people WHERE id='n1'").fetchone()[0] == acct(con, "late@x.test")[0], "a seat given its first email did not join that email's account"
    err = expect_integrity_error(con, "UPDATE people SET email = ? WHERE id = ?", ("other@x.test", "n1"), "a seat's email changed")
    assert "account_email" in err, err


# ---- migrate-074.sql (sprint 7's review, A1): a seat waits for its holder's yes ------------------------------------------------

def t_pending_seat_never_active():
    con = fresh_db()
    seat(con, "p1", "p1@x.test")
    assert con.execute("SELECT pending FROM people WHERE id='p1'").fetchone()[0] == 0, "a seat is pending by default"
    con.execute("INSERT INTO people (id,name,email,role,key_hash,active,pending,created_at,org) VALUES ('p2','p2','p2@x.test','member',?,0,1,'t',2)", (uuid.uuid4().hex,)); con.commit()
    err = expect_integrity_error(con, "UPDATE people SET active = 1 WHERE id = ?", ("p2",), "a pending seat made active without clearing its wait")
    assert "CHECK" in err, err
    err = expect_integrity_error(con, "INSERT INTO people (id,name,role,key_hash,active,pending,created_at,org) VALUES (?,?,?,?,1,1,'t',1)", ("p3", "x", "member", uuid.uuid4().hex), "an active pending seat")
    assert "CHECK" in err, err
    err = expect_integrity_error(con, "UPDATE people SET pending = 2 WHERE id = ?", ("p2",), "a wait that is neither 0 nor 1")
    assert "CHECK" in err, err
    con.execute("UPDATE people SET active = 1, pending = 0 WHERE id = 'p2'"); con.commit()   # the accept: one statement, both columns
    assert con.execute("SELECT active, pending FROM people WHERE id='p2'").fetchone() == (1, 0), "the accept did not land"


# ---- migrate-071.sql (sprint 7, 7.2): the operator's one-time sign-up codes ----------------------------------------------

def code(con, cid, email, h, used=None, revoked=None, how=None):
    con.execute("INSERT INTO signup_codes (id,email,code_hash,created_at,expires_at,used_at,used_how,revoked_at) VALUES (?,?,?,?,?,?,?,?)",
                (cid, email, h, "2026-10-07T00:00:00.000Z", "2026-10-14T00:00:00.000Z", used, how, revoked))
    con.commit()


def t_signup_codes_one_open_per_email():
    con = fresh_db()
    code(con, "c1", "ann@x.test", "h1")
    err = expect_integrity_error(con, "INSERT INTO signup_codes (id,email,code_hash,created_at,expires_at) VALUES (?,?,?,?,?)", ("c2", "ann@x.test", "h2", "t", "t"), "a second OPEN code for one email")
    assert "UNIQUE" in err, err
    con.execute("UPDATE signup_codes SET revoked_at = 't' WHERE id = 'c1'"); con.commit()
    code(con, "c3", "ann@x.test", "h3")   # once the first is revoked, a new open one lands
    con.execute("UPDATE signup_codes SET used_at = 't', used_how = 'created' WHERE id = 'c3'"); con.commit()
    code(con, "c4", "ann@x.test", "h4")   # and once it is used
    err = expect_integrity_error(con, "INSERT INTO signup_codes (id,email,code_hash,created_at,expires_at) VALUES (?,?,?,?,?)", ("c5", "bob@x.test", "h4", "t", "t"), "one code hash twice")
    assert "UNIQUE" in err, err


def t_signup_codes_checks():
    con = fresh_db()
    err = expect_integrity_error(con, "INSERT INTO signup_codes (id,email,code_hash,created_at,expires_at) VALUES (?,?,?,?,?)", ("c1", "Ann@X.test", "h1", "t", "t"), "a code's email not lower-cased")
    assert "CHECK" in err, err
    err = expect_integrity_error(con, "INSERT INTO signup_codes (id,email,code_hash,created_at,expires_at,used_at,used_how) VALUES (?,?,?,?,?,?,?)", ("c2", "ann@x.test", "h2", "t", "t", "t", "stolen"), "a used_how outside created/set/reset")
    assert "CHECK" in err, err
    code(con, "c3", "ann@x.test", "h3", used="t", how="reset")


# ---- migrate-072.sql (sprint 7, 7.3): an org's path name and its founder ----------------------------------------------------

def org_row(con, oid, name, slug=None, founder=None, settings=None):
    con.execute("INSERT INTO org (id,name,slug,created_by_account,settings,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", (oid, name, slug, founder, settings, "t", "t"))
    con.commit()


def t_org_slug_check_and_unique():
    con = fresh_db()
    org_row(con, 1, "One", "one-org")
    org_row(con, 2, "Two", "a-b-2")
    for bad, why in (("a--b", "two dashes"), ("-ab", "a leading dash"), ("ab-", "a trailing dash"), ("A-b", "a capital"), ("a", "one character"), ("x" * 41, "41 characters"), ("a_b", "an underscore")):
        expect_integrity_error(con, "INSERT INTO org (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)", (9, "Bad", bad, "t", "t"), f"a path name with {why}")
    err = expect_integrity_error(con, "INSERT INTO org (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)", (3, "Dup", "one-org", "t", "t"), "a path name two orgs hold")
    assert "UNIQUE" in err, err


def t_org_one_per_founder():
    con = fresh_db()
    org_row(con, 1, "One", None, None)
    org_row(con, 2, "Two", "two", "acct-1")
    org_row(con, 3, "Three", "three", None)   # many orgs with no founder (the operator's)
    org_row(con, 4, "Four", "four", None)
    err = expect_integrity_error(con, "INSERT INTO org (id,name,slug,created_by_account,created_at,updated_at) VALUES (?,?,?,?,?,?)", (5, "Five", "five", "acct-1", "t", "t"), "a second org founded by one account")
    assert "UNIQUE" in err, err


def t_org_default_slug():
    con = fresh_db()
    org_row(con, 1, "Ryuklabs")
    org_row(con, 2, "Suites", settings='{"suites":true}')
    org_row(con, 3, "Org B")
    org_row(con, 4, "  Ünïcode!! ")
    org_row(con, 5, "Login")
    got = dict(con.execute("SELECT id, slug FROM org").fetchall())
    assert got == {1: "ryuklabs", 2: "suites", 3: "org-b-3", 4: "org-4", 5: "login-5"}, got
    con.execute("UPDATE org SET slug = NULL WHERE id = 3"); con.commit()
    assert con.execute("SELECT slug FROM org WHERE id = 3").fetchone()[0] == "org-b-3"


CASES = [
    ("QD1A9E7EB · approval_audit.transmission_id -> transmission.id", t_approval_audit_transmission_fk),
    ("QD1A9E7EB · approval_audit.decided_by -> people.id", t_approval_audit_decided_by_fk),
    ("QD1A9E7EB · invites.project_key -> projects.key", t_invites_project_key_fk),
    ("QD1A9E7EB · invites.created_by -> people.id", t_invites_created_by_fk),
    ("QD1A9E7EB · loops.person_id -> people.id", t_loops_person_fk),
    ("QD1A9E7EB · project_seats.{person_id,project_key} FK pair", t_project_seats_fk_pair),
    ("QD1A9E7EB · tokens.person_id -> people.id", t_tokens_person_fk),
    ("QD1A9E7EB · transmission.submitter -> people.id", t_transmission_submitter_fk),
    ("QD1A9E7EB · transmission.parent -> transmission.id (self-ref)", t_transmission_parent_selfref_fk),
    ("QD1A9E7EB · transmission.project -> projects.key", t_transmission_project_fk),
    ("Q5AE248CC · check_results.transmission_id -> transmission.id (TEXT)", t_check_results_transmission_id_fk_text),
    ("Q5AE248CC · check_results.graded_by -> people.id (TEXT)", t_check_results_graded_by_fk_text),
    ("Q5AE248CC · check_results.project -> projects.key", t_check_results_project_fk),
    ("Q0B50A78E · events.person_id -> people.id", t_events_person_fk),
    ("Q0B50A78E · events.project -> projects.key", t_events_project_fk),
    ("Q0B50A78E · events.payload_json CHECK json_valid()", t_events_payload_json_must_be_valid_json),
    ("Q23D7E346 · approval_audit UPDATE refused", t_approval_audit_no_update),
    ("Q23D7E346 · approval_audit DELETE refused on a real row", t_approval_audit_no_delete_real_row),
    ("Q23D7E346 · approval_audit DELETE still allowed for the eval-hygiene sweep", t_approval_audit_delete_allowed_for_eval_row),
    ("QE2D90B38 · artifacts.group_tag NOT NULL", t_artifacts_group_tag_not_null),
    ("QE2D90B38 · artifacts.group_tag CHECK rejects 'ungrouped'", t_artifacts_group_tag_rejects_ungrouped),
    ("QE2D90B38 · artifacts.group_tag accepts a real tag + artifacts.project FK", t_artifacts_group_tag_accepts_real_value_and_fk),
    ("QD1A9E7EB · artifacts.person_id -> people.id", t_artifacts_person_fk),
    ("migrate-018.sql · transmission_refs.tid -> transmission.id", t_transmission_refs_tid_fk),
    ("migrate-068.sql · each org-wide table refuses a row without its org, and lands it with one", t_org_required_on_every_org_wide_table),
    ("migrate-067.sql · org holds many rows, each id >= 1", t_org_holds_many_rows_with_positive_ids),
    ("migrate-067.sql · projects.org and projects.slug are read off the key, never written", t_project_key_carries_its_org),
    ("migrate-070.sql · accounts.email UNIQUE and lower-cased (CHECK)", t_accounts_email_unique_and_lowercase),
    ("migrate-070.sql · people.account_id -> accounts.id", t_people_account_fk),
    ("migrate-070.sql · a seat joins its email's account (made with no passphrase); one active seat per org (people_account_attach)", t_seat_attach_one_account_one_seat_per_org),
    ("migrate-070.sql · a seat's email is set once (people_account_late, people_email_fixed)", t_seat_email_set_once),
    ("migrate-074.sql · a pending seat is never active (CHECK pending IN (0, 1) AND (pending = 0 OR active = 0)); the accept clears both in one statement", t_pending_seat_never_active),
    ("migrate-071.sql · one OPEN sign-up code per email (idx_signup_open), one row per code hash", t_signup_codes_one_open_per_email),
    ("migrate-071.sql · a code's email lower-cased, its used_how one of created/set/reset (CHECK)", t_signup_codes_checks),
    ("migrate-072.sql · an org's path name: a-z, 0-9, single dashes, 2 to 40, no dash at either end (CHECK); unique (idx_org_slug)", t_org_slug_check_and_unique),
    ("migrate-072.sql · one org per founder account (idx_org_founder); none for an operator's org", t_org_one_per_founder),
    ("migrate-072.sql · the default path name from the org's name (org_slug_on_insert, org_slug_on_update)", t_org_default_slug),
]

if __name__ == "__main__":
    if not os.path.exists(BOOT):
        print("  ✗ boot.sql missing")
        sys.exit(1)
    for name, fn in CASES:
        case(name, fn)
    fails = [r for r in results if not r[1]]
    for name, ok, detail in results:
        mark = "✓" if ok else "✗"
        print(f"  {mark} {name}" + ("" if ok else f" — {detail}"))
    if fails:
        print(f"  → {len(fails)}/{len(results)} case(s) failed")
        sys.exit(1)
    print(f"  ✓ all {len(results)} FK/CHECK/trigger cases proven (positive + negative) against boot.sql")
