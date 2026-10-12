// tools/fixtures/org.mjs — a selftest's env as a request after a sign-in (sprint 6, 6.2: src/data.js). The worker's own requests get
// their org from the sign-in (installOrgSlot at the entry, signIn in the resolvers); a selftest that calls a reader or a writer
// directly hands it an env already signed in to an org (org 1, ryuklabs, unless it names another), and EXPLAINs a statement
// with the org written in (orgSql), as the layer writes it.
import { ORG_SLOT, orgSql } from "../../src/data.js";
// asOrg(env, org = 1) -> a copy of env signed in to `org` (its own fresh slot: a sign-in never writes into another env's)
export const asOrg = (env, org = 1) => ({ ...env, [ORG_SLOT]: { org } });
// withSlot(env) -> env with an EMPTY slot of its own (a request before anyone signed in: the resolvers fill it)
export const withSlot = (env) => ({ ...env, [ORG_SLOT]: { org: null } });
// org1(sql | sqlBuilder) -> the statement as org 1's request runs it ({org} -> 1, {orgbucket} -> '')
export const org1 = (v) => (typeof v === "function" ? (...a) => org1(v(...a)) : typeof v === "string" ? orgSql(v, 1) : v);
export { orgSql };
