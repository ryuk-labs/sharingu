-- tools/fixtures/local-plan.sql — the LOCAL-only plan row (sprint 8, 8.2; main's ruling 8.2f): every org the test harness makes
-- rides it (the smoke's, the suites', the local app's, the in-process workers'), as the operator raises an org by hand during the
-- beta (docs/plan/PLATFORM.md §4), so a run never trips the ruled limits: the smoke's org 1 alone outgrows team. Data, never a
-- migration and never on live: only the harness writes it (tools/lib-r-local.sh rl_seed, tools/fixtures/sqlite-worker.mjs). The
-- ruled free and team rows stay exactly as ruled (migrate-075); s46 and s47 test them on their own orgs.
INSERT INTO plan_limits (plan, people, projects, items_month, calls_day, burst_minute, storage_bytes, updated_at) VALUES ('local', 100000, 100000, 100000000, 100000000, 1000000, 1099511627776, '2026-10-08T00:00:00.000Z') ON CONFLICT (plan) DO NOTHING;
