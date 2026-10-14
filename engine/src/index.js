import { db, installOrgSlot, installAddress, readerOrg } from "./data.js";
import { orgPath, orgUrl, inRequest, setOrgBase, orgBase, isPlatformPath, orgAt, inOrgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL the worker builds, under the org of its address
import { runCron } from "./cron.js";   // the cron (sprint 6, 6.4: every org, inside its CPU)
import { storeOfRow } from "./storage.js";   // sprint 6, 6.4: a file read by its exact id lies under its row's org
import { buildEntry } from "./oauth.js";
import { shell } from "./shell.js";
import { renderAudit, renderActivityAll, auditGradeOf, AUDIT_KIND_OPTIONS, AUDIT_LANE_OPTIONS, AUDIT_ROUTE_OPTIONS } from "./audit.js";
import { activityAcross, ACTIVITY_STATES } from "./activity.js";   // sprint 12 (12.5): Activity across every project
import { clientFamilyOf, setRequestClient } from "./client.js";   // sprint 13, 13.1: which AI filed it
import { LANE_KEYS } from "./lanes.js";
import { renderViewer } from "./pages.js";
import { renderLogin, renderNotHere } from "./login.js";
import { readMapNode, readCanvas, renderInspector } from "./mapnode.js";
import { readMapPage, OPENS as MAP_OPENS } from "./mapread.js";
import { mapModelOf, lightsSince } from "./knowledge/mapmodel.js";
import { layoutOf } from "./maplayout.js";
import { renderTransmissionPage } from "./txpage.js";
import { readBuild, renderBuild, fileRank } from "./build.js";
import { renderDocs } from "./docs.js";
import { computeHoles, holesShape, renderHoles } from "./holes.js";
import { renderControl } from "./controlpage.js";
import { readControl } from "./controlread.js";
import { readHomeSummary, renderHome } from "./home.js";
import { newTiming, timedEnv, withServerTiming, timeSync, timingOf } from "./timing.js";
import { installReqMemo, clearReqMemo } from "./reqmemo.js";
import { AUDIT_BASE_CLAUSES, auditEventsSql } from "./hotsql.js";
import { renderPicker } from "./picker.js";
import { renderProfilePage } from "./profile.js";
import { handleRespond } from "./qnaire.js";
import { readDecisions, decisionsJson, readQuestion, questionJson, renderDecisionsPage, renderQuestionPage, fileRound, exportRound, QID_RE } from "./decisions.js";
import { handleMcp, mapReg, projectCallScope, callTool, toolCallable, orgWantedOf } from "./mcp.js";
import { grantKindOf, GRANT_KINDS } from "./oauthgrants.js";   // sprint 7, 7.5a: an ACCOUNT grant's call names its org
import { libraryFor, docFor, docRecordFor, roleBriefFor } from "./docread.js";
import { openItems } from "./openitems.js";
import { askOwner } from "./ask.js";
import { formatsAnswer, PREVIEW_ITEM_SCHEMA, ITEM_SCHEMA_OF, WRITE_TOOL_NAMES } from "./formats.js";   // the registry, readable through the door (sprint 3, B1); the items' schemas (17.1; split in sprint 19)
import { previewItems, filePart, readPreviewView } from "./preview.js";   // preview, then the write tools (sprint 3, B2; split in sprint 19)
import { renderPreviewPage } from "./previewpage.js";
import { impactAnswer, impactFor, impactLines, readImpactRow, refsOfRow } from "./impact.js";   // impact and carry-forward (sprint 3, B4)
import { renderImpactPage, impactSection, touchesFact, nextRegion, IMPACT_CSS } from "./impactpage.js";
import { pickUp, pickStateOf } from "./pickup.js";
import { searchAnswer, readAnswer, changesAnswer, briefAnswer, libraryRead, changedCountFor } from "./extract.js";   // extract (sprint 3, B5)
import { renderLibraryPage, renderChangesPage, changedChip } from "./extractpage.js";
import { readVersionsView, versionsJson, renderVersions, readVersionHead, fileRestore, filePublish } from "./versionsview.js";
import { versionHead } from "./knowledge/versions.js";
import { gradeCheck } from "./knowledge/grades.js";
import { renderDocPage } from "./docpage.js";
import { md } from "./markdown.js";
import { renderCardPage, cardTabOf } from "./cardpage.js";
import { readMapPlane } from "./mapplanes.js";
import DOOR, { DOOR_TEXT } from "./doorcontract.js";
import { handleHandoff } from "./handoff.js";
import { getTenantConfig, resolveOwner, ownerName, orgBySlug, configOf, DEFAULT_BRAND, SESSION_TOKEN_PREFIX } from "./tenant.js";
import { HAT_KEYS, hatsOf, hatsJson, avatarValue } from "./hats.js";
import { renderGoals, renderGoalNode } from "./goals.js";
import { readGoals, readGoalNode, projectNameOf } from "./goalsread.js";
import { readGtmPipeline } from "./gtmread.js";
import { readBroadcast } from "./broadcastread.js";
import { tabListsSafe, mountLists } from "./tablists.js";
import { publishAnswer, equipAnswer } from "./broadcast.js";
import { regradeAnswer, installSelfPage } from "./regrade.js";
import { renderRegradePage } from "./regradepage.js";
import { renderGtm } from "./gtm.js";
import { renderBroadcast, renderStarterPage } from "./broadcastpage.js";
import { readLive } from "./broadcastlive.js";
import { presetOf } from "./starter.js";
import { json, text, uid, now, sha256, TX_LANES, isEvalMark, evalView, crossSiteLogin, isD1Quota, signInOr401, isBrowserNavigation } from "./util.js";
import { countCall, installPlanNote, planNoteOf, planShownOf, setPlanReader, suspensionOf, suspendedAnswer } from "./plans.js";   // sprint 8, 8.2: every signed-in REST write is a call the org's plan counts; 8.4: Control shows the plan; 8.5: the suspension's one check
import { handleStorage, handleLog } from "./reports.js";
import { runControlAction } from "./admin.js";
import { passphraseSignIn, countSignIn, mintSession, landingOf, clientOf, NO_SEAT_HERE_WORDS, chooseOrgWords, PENDING_ONLY_WORDS, EMAIL_NOT_ASCII_WORDS, signUp, orgsOfAccount, answerSeat, SEAT_ANSWER_WORDS, PICKER_PATH, betaCount } from "./accounts.js";   // sprint 7, 7.1: one account per email, a seat per org; 7.2: sign-up
import { renderSignup, renderInvite, signupProblem, SIGNUP_REFUSED_WORDS, SIGNUP_FIELD_WORDS } from "./signup.js";   // sprint 7, 7.2: sign-up by allowlist
import { inviteSignup, isInviteBody, INVITE_HEADERS } from "./invite.js";   // sprint 12, 12.3: an org's invite link (src/accounts.js THE INVITE LINK)
import { readRequest, trapped, fileRequest, requestByToken, placeInLine, approvedProfile, newRequestToken, REQUEST_FIELDS, REQUEST_TRAP, REQUEST_PATH, REQUEST_ASKED_PATH } from "./requestaccess.js";   // sprint 21, 21.1: request access
import { renderRequestAccess, renderRequestReceived, renderRequestAsked, renderRequestMissing, REQUEST_FIELD_WORDS } from "./requestpage.js";
import { renderShowcase } from "./showcase.js";   // sprint 21, 21.3: `/` for a browser with no session
import { createOrg, orgFields, orgFormProblem, ORG_FIELD_WORDS, ORG_WORDS, ORG_NAME_MAX } from "./orgs.js";   // sprint 7, 7.3: create an org
import { renderOrgNew, renderOrgMade } from "./orgpage.js";
import { renderOrgPicker } from "./orgpicker.js";   // sprint 7, 7.4b: the org picker at the root (GET /orgs)
import { reservedNames, orgSlugProblem } from "./orgnames.js";
import { backupPage, lastBackup } from "./backup.js";
import { readMeasures, exportOf } from "./measures.js";
import { SECRET_ACTIONS, runSecretAction } from "./secrets.js";
import { PROJECT_ARG, READ_PROJECT_RULE, seatsOnce, orgIsMultiProject, isPartnerReader, consentOf, mandateFloorFor, backfillReports, backupDump, decideTransmission, projectSeatsFor, projectsHeldBy, countActiveProjects, activeKeysOnce, resolveAny, resolveReader, sessionCookieToken, credentialLive, sessionPlace, csrfRefused, SESSION_COOKIE, SESSION_COOKIE_ATTRS, carriesTranscript, whoamiFor, bankArtifact, briefCountFor, liveStampOf, READ_SCOPE, switcherCurrentOf, transmissionOneFor, filingFor, artifactsListFor, mayReadArtifact } from "./core.js";
import { resolveProject, projectOf, projectScopeOf, NO_PROJECT, keyInOrg, projectSlug } from "./project.js";
import { renderDenied, placeMeterChip, LISTS_MARK } from "./ui.js";
import { fontResponse, iconResponse } from "./fonts.js";
import { challengeAnswer } from "./wellknown.js";   // sprint 11, 11.3: OpenAI's domain verification (the operator's stored token)
import { KNOWLEDGE_KINDS, MAX_OPS } from "./knowledge/schema.js";


import { ruleQuestion } from "./knowledge/decisions.js";
import { screensAnswer, serveRender, restoreAnswer } from "./knowledge/screens.js";   // screens and renders, the standard (ARCHITECTURE §11)
// Agent R Worker — the only door between people/agents and the org's brain.
// PRD: 02_AGENT_R/worker-prd.md (AGR-13) · ruling: ADR-016
// Invariant: nothing here ever stores conversation text (ADR-016 d).

const VERSION = "0.1.0";
// ADR-102 (migrate-020): standing trace consent, per person, self-service on /profile.
// NULL/absent = 'off'. Enforcement is STRIP + honest note, never a block — R never blocks.
const CONSENT_GRADES = ["off", "traces", "traces+prompts"];

// The capability registry (ADR-039). R discovers what it can do from HERE, never from a
// hand-maintained list in a skill file — that list went stale twice in one day and orphaned
// five routes. `trigger` ties each capability to the moment that fires it.
// STALENESS GUARD: evals parse this file for routes and assert every one is declared below.
const CAPABILITIES = [
  { m:"GET",  p:"/health",        auth:"none",   does:"is the door up, and which version answered (a platform check: it reads one row of the schema and names no org)" },
  { m:"GET",  p:"/fonts/:file",   auth:"none",   does:"the brand's three faces, self-hosted (manrope.woff2 · fredoka.woff2 · jetbrains-mono.woff2, SIL OFL 1.1, src/fonts.js): font/woff2, cached a year as immutable (the page's URL carries ?v=<the fonts' hash>); answered before any auth or D1 read; any other name is 404" },
  { m:"GET",  p:"/favicon.svg",   auth:"none",   does:"the favicon: U-chan, the brand's own vector (src/ui.js FAVICON_SVG, the website's favicon.svg), image/svg+xml; with ?v=<its hash> (the pages' link) cached a year as immutable, bare a day; answered before any auth or D1 read" },
  { m:"GET",  p:"/.well-known/openai-apps-challenge", auth:"none", does:"OpenAI's domain verification (sprint 11, 11.3; src/wellknown.js): the token the operator stored for this deployment (tools/operator.mjs set-openai-challenge), as text/plain and nothing else; 404 not_found when none is stored. The platform's, never an org's: answered at the root before any sign-in, with no D1 read" },
  { m:"POST", p:"/login",         auth:"none",   does:"email + password -> a 90-day token (sprint 7: one account per email, a seat per org; 7.4, the front door by path: the sign-in lives at the platform's root and CHOOSES the org — the org next names (/<org>/…) when your account holds a seat there, else your seat in org 1, else your first). Your ACCOUNT's passphrase signs in the chosen seat with an account session: a browser's cookie then reads, at any org's address /<org>/…, as your seat in that org. A seat's own secret (the key its admin gave you) signs in THAT seat only, with a seat session (its org alone). The token as a bearer is the seat it names. A form lands on next, else /<the chosen org>. A wrong or missing email or password is 401 invalid_login; your account's passphrase with no seat in any org is 403 no_seat_here (nothing signed in); 8 failures in 15 minutes on one account are 429 too_many_attempts" },
  { m:"GET",  p:"/login",         auth:"none",   does:"the sign-in page, at the platform's root (?next=<same-origin path> is carried to the POST; an org's page sends you here with next=/<org>/<page>)" },
  { m:"POST", p:"/signup",        auth:"none",   does:"sign up by allowlist (sprint 7, 7.2; no email is ever sent): email + code (the one-time code the operator gave for THAT email, by hand) + password (+ confirm: equal when sent) -> the account's passphrase: a new account, an account with none (every migrated person) takes it, an account that has one is reset (every session of every seat of the account, in every org, ends, and their connected apps); the code is spent in the same write. Then a 90-day token for the account's seat in the org the sign-up chose (sprint 7, 7.4: its org-1 seat, else its first: the ACCOUNT's session, which a browser carries to any of the account's orgs at /<org>/…), or, with no seat in any org, signed up and signed in to nothing (a form, sprint 21, 21.2: 200 with the create-an-org page, its email as typed and, when the email the code proved has an approved request for a place, the org's name its company and your name its name; the passphrase is yours to type there). JSON {account: created|set|reset, signedIn, person?, role?, title?, token?, expiresAt?, note}. An email not allowed and a wrong, used, expired or revoked code are ONE answer, 401 invalid_signup, writing only the attempt (it counts in the account's lockout: 8 failures in 15 minutes, with the sign-in's, are 429 too_many_attempts); a missing or malformed field is 422 bad_signup {field}; a cross-site form is 403 cross_site_signup. Only the operator allows an email and mints its code (tools/operator.mjs, the deployment's credentials): no route of the door does. AN ORG'S INVITE LINK (sprint 12, 12.3; src/accounts.js THE INVITE LINK): {via: invite, invite (the link's token, the whole link taken too), password (+ confirm)} -> the invited seat's account takes the passphrase, only when it has none and no seat in another org (then marked with that org: it reaches that org alone, creates no org, and answers no other org's seat until the operator's code confirms the email), the link spent in the same write; then the ACCOUNT session on that seat (a form: 302 to the org's address /<slug>, its cookie set). JSON {account: invited, signedIn, org, person?, role?, title?, token?, expiresAt?, note}. 401 invalid_invite, ONE answer (no such open link, used, expired, replaced by a newer one, its seat removed, reissued or pending) and 409 account_stands (the email's account has its own passphrase or a seat in another org: sign in and accept the seat on /orgs), each writing NOTHING; 422 bad_invite {field: invite|passphrase|confirm}; the same-origin guard and the address's flood filter as above" },
  { m:"GET",  p:"/signup",        auth:"none",   does:"the sign-up page (sprint 7, 7.2): email, the one-time code the operator gave you by hand, a passphrase twice; ?via=invite is the page an org's invite link opens (sprint 12, 12.3: <origin>/signup?via=invite#<token> — the token rides the fragment, which no request carries; the page's script moves it into the form): the passphrase twice, no session set before it is" },
  { m:"POST", p:"/request-access", auth:"none", does:"request access to the beta (sprint 21, 21.1; migrate-081; no session, no account, no org yet): name, email (your work email), company, role, team_size (1 | 2-10 | 11-50 | 51-200 | 201+) required; website, linkedin, x, github (each an http(s) address or that service's handle: the door stores the service's address it builds), ai_tools, use_case (one line) optional -> 303 to /request-access/<token>, your request's own private link (only its hash is kept). One open request per email, and the FIRST stands: a repeat for an email whose request is open changes nothing (no profile, no new link: the first link keeps working) and is a 303 to /request-access/asked, which says the email already asked. Nothing about accounts is read: an account's email with no open request files a request as any other. A request whose hidden field (trap) is filled is dropped with a new request's answer (its link opens nothing). 422 bad_request_access {field, note} before anything is written; 403 cross_site_request_access (a cross-site form, refused before the body is read); 429 too_many_attempts_ip (the address's flood filter, the budget POST /login and POST /signup spend). A form gets the page again with its values for a wrong field" },
  { m:"GET",  p:"/request-access", auth:"none", does:"the request-access page (sprint 21, 21.1): the profile's form, required and optional apart; a link to sign in" },
  { m:"GET",  p:"/request-access/:token", auth:"none", does:"your request's own page at its private link (sprint 21, 21.1 and 21.2), by its status. Open: you're in line — your name and company, your place in line (1 + the open requests that came before yours), the beta's places live from the database (N of 50 places taken; left out if it cannot be read), what comes next (the requests are reviewed in order; a sign-up code is emailed to your address when your place opens; with it, sign up: the org form comes filled in from this request) and a link to the walkthrough (the showcase's own section, /#walkthrough). Approved: your place is open, the code comes by email, a link to /signup. Declined: one sentence. A link that opens no request (wrong or malformed) is ONE 404 page. /request-access/asked (no token's shape) is the repeat's page: the email already asked, the first request's link shows your place, the beta's places and the walkthrough; it names nothing the request typed" },
  { m:"GET",  p:"/orgs",          auth:"reader",   does:"your orgs (sprint 7, 7.4b): the browser's org picker at the platform's root. With an ACCOUNT session (signed in with your account's passphrase) whose account holds seats in several orgs: the page listing them (each org's name, its address and your role there), each a link to /<org>/home (or to the page ?to=<path> names, under that org). A one-org account and a SEAT session (signed in with a seat's own secret: that seat only) never see it: 302 straight to their org. No session: the sign-in rule (a page navigation goes to /login?next=…, a script 401 auth_required). It lists only your own account's seats; a bearer names one seat: 302 straight to its org" },
  { m:"POST", p:"/orgs/seat",     auth:"session",   does:"answer a seat that waits for your yes (sprint 7's review, A1): an org's admin who adds your email while your account already stands elsewhere (it holds your passphrase, or a seat in another org) makes a PENDING seat — it signs nothing in and counts nowhere until you accept it. Your org list (GET /orgs) shows it with Accept and Decline; each posts {seat, answer: accept|decline} here with your ACCOUNT session (signed in with your account's passphrase; a seat session answers nothing), same-origin only. accept: the seat becomes active (409 already_seated when your account already holds an active seat in that org); decline: it stays inactive. A form is sent back to /orgs; JSON {seat, answer: accepted|declined}. Any other seat, a seat no longer waiting, another account's: 404 not_yours, the same for every case; no session: the sign-in rule" },
  { m:"GET",  p:"/orgs/new",      auth:"none",   does:"the create-an-org page (sprint 7, 7.3): your account's email and passphrase (the ACCOUNT's own, chosen at sign-up: never a key an org's admin gave you), the org's name, its address (its path name: a to z, 0 to 9 and single dashes, 2 to 40 characters, never a name the platform uses), its first project's short name (default: the address) and your name; the page belongs to the platform (the product's wordmark, no org's)" },
  { m:"POST", p:"/orgs",          auth:"none",   does:"create an org (sprint 7, 7.3; the write new-org.sh did by SQL): {email, password (your ACCOUNT passphrase), name, slug (its address: a-z, 0-9 and single dashes, 2 to 40 characters, never a name the platform uses: every first segment of the door's routes and the platform's fixed words), project? (the first project's slug, 2 to 30, default the slug), projectName? (default the name), you? (your seat's name, default your email's first part)} -> in ONE write: the org (its name and address), your OWNER seat in it (a seat of your account) and its first project o<id>--<project>; 200 {org:{id, name, slug}, project:{key, name}, person:{id, name, email}, key, mcp, address, note} — key is your new seat's own secret (its sign-in and its API key), shown ONCE in this answer only; address is the org's own address (its pages at /<slug>/…, sprint 7, 7.4), and your AI reaches it at the one /mcp with the key as its bearer. A form gets the page with the key, never a redirect. Who may: an account holder proven by the ACCOUNT's passphrase (no seat needed; a seat's own secret never creates an org); an account creates at most ONE org (the beta's free tier). Refusals, nothing written but the proof's attempt: 422 bad_org {field: email|password|name|slug|project|you} and 409 org_name_reserved, both before anything is read; 401 invalid_account (one answer: no account, an account with no passphrase yet, a wrong one or a seat's secret; it counts in the account's lockout: 8 failures in 15 minutes, with the sign-in's, are 429 too_many_attempts); 409 org_limit (this account already created its org); 403 org_by_invite (sprint 12, 12.3: an account an org's invite link made creates no org — the waitlist; the operator's code confirms its email first); 409 org_name_taken; 429 too_many_attempts_ip (the address's flood filter, the budget POST /login and POST /signup spend); 403 cross_site_org (a cross-site form, refused before the body is read)" },
  { m:"GET",  p:"/install",       auth:"none",   does:"day-0 installer script for a terminal" },
  { m:"GET",  p:"/missing",      auth:"none", does:"What is missing (src/checklist.js, src/holes.js): the project's checklist, ONE standard for every project counted only in the areas the project has, the meter overall and per area, then each open item in the order a project needs it, with its first missing thing and the call that fills it (fill, fillPath: its preview); an item the reader may not fill names who fills it and offers no call; the public sees the standard only; at most four D1 statements; HTML for a browser, JSON otherwise — twin of the missing tool and brain://missing" },
  { m:"GET",  p:"/goals",         auth:"reader", does:"Goals (UI-B6a, M-ADR-020): the project's goal tree, one row per goal with its % (rolled up by weight), its dimensions, what fed it (filings per area) its standing counters and its checks (checks {total, passed, failed, ungraded}: the checks whose refs name the goal, by their latest grade); What fed the top goal (points per lane) and Blocked (open decisions on goals, goals with no feed), ?period=quarter|month|all (default all, UTC) &eval=1; ONE read (at most four D1 statements), HTML for a browser, JSON otherwise {declared, project, period, tree, nodes, globalId, globalPct, aligned, unaligned, noFeed, whatFed, blocked, budget?} (F1: a goal's budget and budgetSum, its own and with the goals below, one currency or mixed), live:'unreachable' when the ledger read fails; DERIVED from landed filings, never hand-typed — twin of the goals tool and brain://goals" },
  { m:"GET",  p:"/goals/:ref",    auth:"reader", does:"one goal (UI-B6a, Q1A7AB8C6): the node (its %, parent breadcrumb, owner and due-by when served), its cells (count of target per dimension), the filings that name it (newest 25, one state chip each), its child goals, its counters by gapRefs goal/<id> (N standing · M ruled, and the exact call) and its checks (checks {total, passed, failed, ungraded, light, rows:[{id, title, severity, grade:{verdict, at, by}|null}], more}: the checks whose refs name the goal, each with its latest grade), ?period=&eval=1; at most four D1 statements, HTML for a browser, JSON otherwise; a ref not in this workspace's tree is 404 unknown_goal — twin of goals {ref} and brain://goal/{ref}; JSON {project, period, node, trail, parent, children, dims, pctRule, filings, counters, checks}" },
  { m:"GET",  p:"/gtm",          auth:"reader", does:"GTM (src/gtmread.js readGtmPipeline): the project's go-to-market contributions by activity kind (the GTM template's kinds in its order, then any other filed), each with its state and standing counters; the metrics are the gtm goals' own Goals cells; the strategy docs (gtm/), the follow-ups due and the card kinds that list on GTM; ?period=quarter|month|all (default all) &eval=1; at most four D1 statements; HTML for a browser, JSON otherwise {declared, project, period, template, campaigns, stamp, regions, followUps, strategy, lists} — twin of the gtm tool and brain://gtm" },
  { m:"GET",  p:"/broadcast",    auth:"reader", does:"Broadcast (src/broadcastread.js readBroadcast): the org's shelf of published skills, agents and workflows (each at its newest version, its publisher, and where this project stands on it: none, current or an update waiting, with whether you may equip it and why not), the starter items built into the engine (src/presets/), what this project has equipped, your own drafts with whether each may be published, and the call that files a draft (preview then file_contribution, a contribution of kind item); ?eval=1; at most 2 D1 statements; HTML for a browser (the tab, with the live picture of the week's landed contributions), JSON otherwise {project, org, stamp, filter, regions:{shelf, equipped-here, org-wall-note, starter-shelf}, mine, call, empty} — twin of the broadcast tool and brain://broadcast" },
  { m:"GET",  p:"/broadcast/live", auth:"reader", does:"Broadcast's live picture, JSON (sprint 2): the project's LANDED contributions (route auto, or decided approve) of the last 7 days, newest 200, from ONE statement on idx_transmission_project (each with its person and its goal's title by primary key; the press and dispute kinds, sharingu's own namespace and suite rows out, ?eval=1 includes suite rows) {project:{key}, days, since, at, limit, more, people:[{id, name, initials, tone, n}], goals:[{ref|null, title, known, n}] (ref null: the unaligned row; known false: a ref not in the goal tree), dots:[{id, by, goal, at, kind, what}]}; ?since=<ISO time> is the poll (only what landed from then on, oldest first, at most 50; poll:true), which the page runs on focus and every 30 s while visible, never on load; live:'unreachable' when the statement fails; no project: empty lists; JSON {project, days, since, at, limit, more, people, goals, dots}" },
  { m:"GET",  p:"/broadcast/starter/:slug", auth:"reader", does:"one starter item built into the engine (sprint 2; src/presets/<slug>.md, the same for every org): to a browser its page (kind, title, purpose, where this project stands on it with its Equip, the MCP calls it uses, then its full text as an AI client reads it), JSON otherwise {slug, kind, title, purpose, calls, v, href, equipSlug, here, can, body}; the here and can of GET /broadcast's starter-shelf (its one statement); 404 unknown_item for any other slug" },
  { m:"POST", p:"/broadcast/publish", auth:"bearer", does:"publish one of your own filed drafts (a contribution of kind item) to the org's shelf as its slug's next version (sprint 3, D2: the REST twin of the publish tool, ONE function, src/broadcast.js publishAnswer): {id, confirm?}; no id is 422 id_required; without confirm: true it answers the preview {preview:true, verb, id, slug, v, kind, line, shows, reaches, text, next} and writes nothing; with it (or a signed-in browser's press on Broadcast, its own confirm) it files ONE filing, lane leader, kind publish, parent the draft -> {id, slug, v, item}; anyone in the org whose role class is not Partner (403 partner_refused), on their own draft only (403 not_yours), seated somewhere (403 not_seated; the admin needs no seat); 404 unknown_item, 422 incomplete_item, 409 already_published, 409 slug_taken (a slug belongs to its first publisher); a read-only credential 403, a cross-origin session 403 cross_origin_session_write, a key in the URL 401; kind publish on any other door is 422 reserved_kind; a form is sent back to /broadcast?published=<id> — twin of the publish tool" },
  { m:"POST", p:"/broadcast/equip", auth:"bearer", does:"equip a published version into a project, and update-version (Q571B3D89 per project and attributed, QEBB5D318 pinned to its version; sprint 3, D2: the REST twin of the equip tool, ONE function, src/broadcast.js equipAnswer): {slug, v, project?, confirm?}; no slug is 422 slug_required; without confirm: true it answers the preview {preview:true, verb, slug, v, project, from, line, shows, reaches, text, next} and writes nothing; with it (or a signed-in browser's press, its own confirm) it files ONE filing, lane leader, kind equip, parent that version's publish, project the target, append-only (an update is a new row, the old one stands) -> {id, slug, v, project, from}; anyone seated on the target project whose role class is not Partner (403 partner_refused; the admin on any active project), 403 not_seated, 404 unknown_item, 404 unknown_version, 409 already_current, 422 project_required; a read-only credential 403, a cross-origin session 403 cross_origin_session_write, a key in the URL 401; kind equip on any other door is 422 reserved_kind; slug preset:<slug> equips a starter item built into the engine at its one version (else 404 unknown_version with latest): it writes the project's COPY first, the item's body as the doc starter/<slug>.md through the knowledge write door (its k_docs row and ONE ledger row, kind knowledge), then ONE filing, kind equip, parent none, gapRefs [\"preset/<slug>\"], proof preset:<slug>@v<n> -> also {doc, knowledge}; a form is sent back to /broadcast?equipped=<id> — twin of the equip tool" },
  { m:"GET",  p:"/build",         auth:"reader", does:"Build (UI-B4b): the project's filings (newest 50, each with its state chip, tempo word, goal, standing counters and latest rank press), where each one is (the three that moved last this week) and the finish line, ?kind=<kind>&sort=ranked|newest|goal&eval=1; one read (at most two D1 statements), HTML for a browser, JSON otherwise {project, asOf, counts:{contributions, inMotion, onCanvasWeek, byKind, records}, filter, rows, more, tempo, finishLine}, live:'unreachable' when the ledger read fails; seated readers, scoped to the project (Q0B546903) — twin of the build tool" },
  { m:"POST", p:"/rank",          auth:"reader", does:"rank a filing (QEFC716D5): {id} files ONE filing, lane leader, kind rank, parent <id>, routed auto, so the project's shared order puts the newest press first; any reader seated on the filing's project (the owner on any), else 404 not_found; no table, no migration; a form is sent back to Build — no MCP twin (Build's Rank button); no id is 422 id_required" },
  { m:"GET",  p:"/map",           auth:"reader",   does:"the Map, the main tab: ONE canvas of the project's model in layered columns (surfaces, screens, doors, data, decisions and gaps: an open decision is a chain whose question is open now), its layers (?layer=screens,doors,data,flows,deps), the views Arch and MCP (GET /map/arch, /map/mcp), the inspector (?node=<ref>, ?gap=<n>), a flow to play (?flow=<id>) and find (?find=); read in three statements of at most one row per node (the nodes, k_node_links, the lit rows of k_node_lights); the page to a browser (Accept: text/html), the compact layout {p, v, cols, groups, nodes, links, kinds, flows, counts, layerN} otherwise; JSON {p, v, cols, groups, nodes, links, kinds, flows, counts}" },
  { m:"GET",  p:"/map/lights",    auth:"reader",   does:"the Map's live lights: the nodes whose light changed after ?since=<ISO time> (k_node_lights, one indexed statement), oldest first, at most 200 {at, lights: [{id, light, counts}], stale: [{id, stale, at}] (sprint 3 B4: the stale marks that moved, k_node_stale, one more indexed statement), more}; the Map and the Screens view poll it on focus and every 30 s while visible; JSON {at, lights, stale, more}" },
  { m:"GET",  p:"/map/screens",  auth:"reader", does:"the Screens view's ONE read (docs/plan/ARCHITECTURE.md §11): one surface (app) of the project, ?surface=<key> (default the first with screens): {project, surfaces, surface, lanes, screens:[{id, name, lane, step, status, states, light, checks, renders (index rows only), wireframe}], edges, styles}; a render's body is GET /render/<hash>; three round trips of indexed statements, never a body; 404 unknown_surface; a browser is answered by the Map — twin of map {plane: \"screens\"}" },
  { m:"GET",  p:"/render/:hash", auth:"reader", does:"one render's body (a knowledge item of kind render), or a previous take of a frame (M6, migrate-065: a body the project's takes hold), by its sha256, ?project=<key>&style=<its style's hash>: a session cookie or a bearer, scoped like every knowledge read (a project you may not read answers 404 as a missing render); html a complete document (its style's css inline), wireframe the grammar as JSON, image the picture; always Content-Security-Policy: sandbox and X-Content-Type-Options: nosniff, for an <iframe sandbox> only; cached for good when the URL names the style's current hash, else revalidated by ETag; 410 blob_missing" },
  { m:"POST", p:"/render/restore", auth:"bearer", does:"restore a previous take of a screen's frame (sprint 4, M6; the Restore press on a screen's inspector and on the Screens view's pinned screen; src/knowledge/screens.js restoreAnswer): {project?, screen, state?, variant?, hash, confirm?, eval?} files ONE render upsert {screen, state, variant, hash} and no body through the knowledge write door as the person (the same item an agent files through preview then save_knowledge): the take's body becomes the frame's newest take again (its format, size and style), with ONE ledger row, kind knowledge -> {project, written, ledger, item}; a hash this project's takes do not hold 404 unknown_render (another project's alike); a Partner 403 partner_refused, before anything is read; the project rule of every knowledge write (403 project_forbidden, 422 project_required); no screen or a malformed hash 422 bad_field; the frame's current body writes nothing (written 0); without confirm: true a script is answered the preview {preview:true, project, item, line, next} and nothing is written, a signed-in browser's press is its own confirm; a read-only credential 403, a cross-origin session 403 cross_origin_session_write; a form is sent back to next or the page it came from (same-origin), else the screen on the Map" },
  { m:"GET",  p:"/decisions",    auth:"reader", does:"the Decisions screen (src/decisions.js): the project's questions with counts, who owes each answer, each ruling (choice and label), and what was filed on each (answers, the round, counters), ?status=open|in-force|superseded|countered&severity=&area=&eval=1; no question yet answers empty:\"no_questions\" with the item that files one; HTML for a browser, JSON otherwise {version, publishedAt, project, counts, whoOwes, filter, rows} — twin of the decisions tool" },
  { m:"GET",  p:"/question/:qid", auth:"reader", does:"one question's card (UI-B2): why it is asked, its options, its ruling (choice, label, rationale, when), what it blocks, who owes it, the counters filed on it and the exact call that files one; 404 not_found for a qid this project has not filed — the decisions tool with a qid; JSON {version, project, decision, live, counterCall}" },
  { m:"GET",  p:"/versions",      auth:"reader", does:"Versions, a Map view: why each version of the project's knowledge exists (a version is a snapshot in D1: the owner makes one with publish_version, and restore_version appends one of cause restored), newest first {n, title, at, by, cause:{kind: published|restored, ref: the version restored}, counts per kind, changes:{from, to, total, byKind}}, the current one, and what changed in the version viewed from the one before it (diff {from, to, lines: the first 30 of [{op + ~ -, what: the kind, ref: the id, label}], more, byKind: {kind: {added, changed, removed}}}, worked out from the two snapshots when the version was made); ?cause=all|published|restored; HTML for a browser, JSON otherwise {project, current, viewing, versions, counts:{all, published, restored}, diff}, versions:[] with empty:'no_versions' and a note naming publish_version before the first; ?head=1 is the BEHIND poll {n, at, title, cause} with no-store (one row); the read is ONE D1 statement (the list, the project's name on it) — twin of the versions tool" },
  { m:"GET",  p:"/versions/:v",   auth:"reader", does:"one version (v = its number, 12 or v12): the same read viewing it, with what changed in it from the one before it; viewing is free and changes nothing; 404 unknown_version — the versions tool with v; JSON {project, filter, current, viewing, versions, counts, diff}" },
  { m:"POST", p:"/versions/publish", auth:"owner", does:"make a version (the owner only): {project?, title} snapshots every knowledge table of the project into D1 and appends version n+1 (cause published, its counts per kind), with ONE ledger row (kind knowledge), in ONE D1 batch; 403 owner_only, 403 project_forbidden, 422 title_required or project_required, a read-only credential 403, a cross-origin cookie write 403 — twin of the publish_version tool" },
  { m:"POST", p:"/versions/restore", auth:"owner", does:"restore a version (the owner only): {project?, v} replaces the project's knowledge with version v's snapshot, every knowledge table in ONE D1 batch, live on every screen at once, with ONE ledger row (kind knowledge); in the same batch what the project held is first kept as version n+1 (\"Before restoring vX\", cause published) unless it is exactly the newest version's content, and the restored version (cause restored, ref v) follows it, so nothing filed since is lost: {project, restored, kept: the kept version or null, version, ledger}; 409 already_current restoring the current version with nothing filed since; 422 project_required naming no project in an org of more than one; 403 owner_only, 403 project_forbidden, 404 unknown_version, a read-only credential 403, a cross-origin cookie write 403; a form is sent back to /versions — twin of the restore_version tool" },
  { m:"GET",  p:"/docs",          auth:"none",   does:"public adoption guide — the base link (one secret · five calls), the three lines every contribution carries (what, why, what it touches), connect-your-Claude; brand-seamed, no truth (Mission C)" },
  { m:"GET",  p:"/home",          auth:"reader",   does:"Home (UI-B3): the project's name, its aim and its measure, what is moving, what needs you (decide · approve · grant, each a button), who moved the goals this month and who is here; rendered from the SAME read GET /home/summary answers, ?eval=1 includes suite rows" },
  { m:"GET",  p:"/home/summary",  auth:"reader",   does:"Home as JSON, one composed read (at most five D1 statements): {project, org, asOf:{knowledge: the project's newest knowledge write}, aim, metrics:{needsYou, inMotion (not landed: with a person, or needing more this week), contributions:{total, byKind}, shipped:{days, landed: the contributions approved or filed straight through in the last 7 days}}, needsYou:{rows, more, open, ruled, firstFive}, leaderboard:{period, rows}, whoIsHere:{people, count, projects}, whatChanged:{rows:[{id, what, line (what it changed and reached, in one line), toRedo, href}]} (sprint 3 B4: the newest code and design contributions), followUps:{rows:[{id, next, who, by, overdue, mine, href}], more} (the next actions due, yours first)}, live:'unreachable' when the ledger read fails; ?eval=1 includes suite rows; twin of the home tool; JSON {project, org, asOf, aim, metrics, needsYou, goalsMoved, meter, whoIsHere, whatChanged, followUps}" },
  { m:"GET",  p:"/brief",        auth:"reader", does:"the work packet (src/extract.js briefAnswer): ?for=<hat: management, engineering, organization, gtm, finance, partner, quality | a ref> -> for a hat {hat, aim, goals, questions, followUps, changed, version, startHere}; for a ref {item, dependsOn, dependedBy, questions, checks, contributions}; with no ?for=, JSON (or ?role=<role>) answers a role's brief, the project's doc capsules/<role>.md read under its visibility (404 unknown_brief), and a browser is sent to /home; 404 not_found — twin of the brief tool" },
  { m:"GET",  p:"/projects",      auth:"reader",   does:"the projects page — all your projects in this org, reachable anytime to switch the active one (M-ADR-013); a single-project reader has no choice and is sent home (renamed from Workspaces, Q5D239600/Q93B3F368)" },
  { m:"GET",  p:"/audit",         auth:"reader", does:"Activity — the shared contribution trail (who did what, when), read under the one project rule like every reader (?project= a project you hold; else your active or first seat; seated nowhere, the org-level rows only); the owner gets the org-wide rollup (owner ruling 2026-09-03, overturns S-040 owner-only); sprint 12 (12.5): ?all=1 — and the owner's rollup in an org of several active projects — is Activity across every project the reader may read (the owner: every active project; anyone else: their seats; a Partner its seated projects alone): every contribution newest first with who filed it (their role and hats), its project, lane and state (landed · with the owner · decided · needs more) and (sprint 13, 13.1) which AI filed it, as the tool names itself (nothing for a row filed before), ?in=<project>&who=<a filer's id>&lane=&state=&since= narrowing it, ?before= its next page; the read is src/activity.js activityAcross (three statements: the readable projects, each project's share of 1,000 newest rows (src/activity.js ACTIVITY_ROWS_MAX), the shown rows by primary key), the twin of changes {org: true, list: true}" },
  { m:"GET",  p:"/artifacts",    auth:"reader", does:"the saved files you may read, as JSON for any Accept: {count, items:[{id, title, group, by, at, public}]}, ?q=&group=&limit=; a non-owner sees public ones, scoped to the project — twin of read_file with no id" },
  { m:"GET",  p:"/view",         auth:"reader", does:"the in-frame viewer (ADR-090): a saved file inside the shell in a sandboxed iframe (?src=/artifact/<id>); any other src is 400 (no open redirect, no proxy)" },
  { m:"POST", p:"/grade",        auth:"bearer", does:"grade one check of the project's register through the one door, {checkId, verdict, proof?, clientRef?, project?}: an unknown checkId is refused unknown_check; with proof it counts at once and lights the nodes the check names, without proof it is not counted and routes to the owner; scoped as the tool scopes its project; no checkId is 422 check_id_required — twin of submit_grade" },
  { m:"POST", p:"/regrade",      auth:"bearer", does:"regrade one scope's stale (or ungraded) checks from their pages (sprint 4, R1: the REST twin of the regrade tool, ONE function, src/regrade.js regradeAnswer): {project?, flow | node | checks, confirm?, eval?} (flow: a flow's id, its checks those naming the flow or a screen or door of its steps; node: a node's id; checks: up to 60 check ids, a list or comma-separated); no scope is 422 ref_required, more than 60 checks 422 too_many_items, an unknown flow or node 404 unknown_node, an unknown check 404 unknown_check; without confirm it answers the plan {preview:true, verb, project, scope, cap, counts, observe:[{id, title, stale, path}], needsProof:[{id, title, why}], call?, more, line, text, next} and observes and writes nothing; with confirm it GETs each observable check's page (at most 8 a call, more: true when cut) through this worker's own handler with the caller's own credential, and files each verdict a page answered (200, or the page's own 302) through the grade door, its proof the request and what came back -> {project, scope, cap, counts, observed:[{id, title, path, status, verdict, said, counted?, filed?}], counted, needsProof, call?, more, note}; a check it cannot observe (a walk, another kind, a then that states more, an id it cannot fill, a page that did not admit the credential) is listed under needsProof with the submit_grade call that files it; anyone whose role class is not Partner (403 partner_refused), on a project they may write (403 project_forbidden; none: 422 project_required); a read-only credential 403, a cross-origin session 403 cross_origin_session_write; a form's first press answers the plan as a page, its confirm press files and is sent back to next (same-origin) — twin of the regrade tool" },
  { m:"POST", p:"/questions/:qid/rule", auth:"owner", does:"rule an open question: {project?, choice (the option's index: 0 for A), rationale?} — the question is decided in the same request (status decided, choice, label = the option's text, decidedBy, decidedAt) and every face reads it decided on the next load; ONE ledger row (kind knowledge) reads \"<qid> ruled <L>: <text>\"; 404 unknown_qid, 422 unknown_option, 409 not_open (already ruled), 422 project_required naming no project in an org of more than one, 403 owner_only or project_forbidden, nothing written on a refusal — twin of rule_question" },
  { m:"POST", p:"/backup-dump", auth:"owner",   does:"the backup of YOUR org (src/backup.js; sprint 6: an owner owns one org — every page holds the caller's org's rows alone, the whole database only with the deployment's credentials): with no argument the whole dump into R2 as the nightly cron writes it (one object per page under o<org>/backups/d1/<day>/ — the caller's org's own prefix — then manifest.json; answers {key, counts, pages, bytes, complete}, key where the manifest lies); ?page=<cursor> (\"\" to start) answers ONE page of one table, at most ?rows= (default 1000, max 2000) rows in one statement, and the next cursor (null at the end), writing nothing; ?eval=1 the suites' window (at most 50 rows a table, key o<org>/backups/d1/<day>.eval.json). Every table that holds truth (the knowledge, the versions, the grades, the ledger, projects, seats, people, the org, events); people WITHOUT key_hash, pass_hash, pass_salt or email; tokens, invites, login_attempts and previews never; derived tables never (a restore rebuilds them: tools/restore-local.mjs). Every org's backup lies under its own prefix, never another's" },
  { m:"GET",  p:"/canvas.json",   auth:"reader",   does:"the project's model as the Map's canvas, read live from D1: surfaces, lanes, screens, nav edges, flows, entities, relations, tables, doors (api), the architecture, gaps and dependency chains (with the cheapest move and counts derived from them), and its stamp v; immutable-cached when ?v matches the stamp" },
  { m:"GET",  p:"/map/node",     auth:"reader", does:"one node of the project's model: ?ref=<kind>:<id> (screen, door, table, entity, gap, flow, dep, lane, surface, service), ?ref=goal/<id> or ?gap=<n> (the walk over the open gaps) -> {ref, nodeId, kind, layer, title, parent, what, state (its light from the latest grades of the checks that name it), checks, status, facts, edges, card, walk, model, version}; the inspector fragment to a browser, JSON otherwise — twin of map {ref}" },
  { m:"GET",  p:"/map/:plane",   auth:"reader", does:"one plane of the map (src/mapplanes.js readMapPlane): arch (the project's architecture node: its lanes, the one seam contracts/door.json with its counts, the one org worker, the crossing rules), data (the tables with their columns, indexes and the doors that read and write them, the relations; ?table=<name> inspects one), api (every route this worker's registry declares, with its chip and the screens and tables the project's model gives it), mcp (every tool of the registry with its args, owner, write and whether you may call it; the shelf and the starter items), flows (the flows as swimlanes) or deps (each unfinished decision with what it reaches and blocks, and the cheapest move); an empty model answers 200 with empty regions, each naming the item that fills it; to a browser the Map opened on that plane, JSON otherwise {plane, project, planes, model, version, stamp, regions}; 503 unreadable, 404 unknown_table or unknown_plane — twin of map {plane}" },
  { m:"GET",  p:"/contract",      auth:"reader",   does:"the door's contract (UI-B8a, QFAEA20A3): contracts/door.json exactly as the gate diffed it, served in-process from the generated src/doorcontract.js (application/json, an ETag of the body, private, max-age=300); 0 D1 beyond the sign-in; JSON {tools, rest, counts, errors, formats}" },
  { m:"POST", p:"/backfill",      auth:"owner",    does:"generate the unified rt-v1.1 batch report for contributions missing one and link it back (ADR-074; the cron runs the same seam)" },
  { m:"POST", p:"/contribution/:id/decide", auth:"owner", does:"decide a contribution that waits for the owner (approve, reject or needs-work, with a note): an immutable audit row and the ruling mirrored; a decision is final, a second is refused; no verdict of approve, reject or needs-work is 422 bad_verdict — twin of decide_contribution" },
  { m:"GET",  p:"/control",       auth:"reader", does:"Control, the screen (sprint 2, src/controlpage.js): HTML rendered from the SAME readControl as GET /control/people, 200 to every signed-in reader (QC5F82B90: admin functions, not extra tabs), anonymous 302 /login; Members · Projects · Connect: the regions nav · people (one table: avatar, name, title, role Admin · Member · Partner, hats, projects, last filed, a ⋯ menu per row; Invite) · workspaces (the projects, archive and activate) · connect (the org's MCP URL and the setup for Claude Code, Claude Desktop and the claude.ai connector, ChatGPT and Codex; Versions and Grading explained) · keys (your own key and devices) · this-org (under Admin, with the admin's tools); ?all=1 (the admin) also lists the suites' seats, the archived people and every live device; every admin control a POST /control form, enabled exactly on its can.* and otherwise DISABLED with its reason (QB963C7EE amended by F6), the door refusing the same call independently; no D1 statement over the JSON; the top bar names the project the page read (U-TOPBAR)" },
  { m:"GET",  p:"/control/people", auth:"reader", does:"Control's ONE read (UI-B12a, src/controlread.js readControl; GET /control renders the same object): JSON {org:{name, deploy, manifest:'served'|'fallback', projects}, reader:{id, admin, readOnly?}, admin:{name}, people:[{id, name, email|null, title|null, consent|null, admin, role:'admin'|'member'|'partner', hats:[<hat>], avatar:{initials, tone}, label|null, lastFiled|null, active, you, seats:[{project, name}], can:{role, remove, seat, reissue, reason}}], workspaces:[{key, name, seats}], archived:[{key, name, seats}], keys:[{person, devices:[{device, since, expires}]}], stamp:{people, projects}, live?:'unreachable', eval?:true, all?:true}; the admin reads everyone active with emails, each one's typed label (label, migrate-044) and newest filing (lastFiled), every ACTIVE project and the archived ones, and their own live devices (?eval=1 adds the suites' eval-fixed people; ?all=1 adds them, the archived people and every live device); a non-admin reads the people who share an ACTIVE project with them, their own email only, the seat chips of their own projects, their own seated projects and their own devices, every can.* false with the reason CONTROL_REASON naming the admin; the read-only credential reads what its person reads with every can.* false and READ_ONLY_REASON (reader.readOnly true); email and consent (ADR-102, read-only here) on the admin's and your own row only; seated nowhere: only themselves; anonymous 401; at most 3 D1 statements beyond the sign-in; no MCP twin (whoami carries the caller's own seats and hats); a Partner's org.projects is their own seated keys only" },
  { m:"GET",  p:"/control/measures", auth:"owner", does:"the beta measures (src/measures.js): the org's first pick-up, repeat pick-ups (with pick-ups per week, the last 8), week-1 and week-4 return, cross-role goals, the median days from invite to the first landed contribution, and whether the org is activated, each with its definition, counted from the ledger in three indexed statements (eval-marked rows never count); JSON {format, org, at, note, measures:[{key, label, definition, value}]}, ?download=1 as a file to save; counts, dates, project keys and a goal id only (no person); the admin only, anyone else 403 owner_only; no MCP twin" },
  { m:"POST", p:"/control",       auth:"owner",  does:"the ONE admin write door (UI-B12a): a form action add-person (Invite: name, email, role member|partner or a typed role a script names, projectKey repeated for the seats, accessHat repeated for the access hats: none named, the typed role's; Invite's form sends seatsChosen=1 and seats exactly the projects ticked, none when none is; a script naming none seats a member on the org's sole project and a Partner nowhere; eval=1 from a script mints one of the suites' seats, eval-fixed-*; deliver=link — Invite's form sends it — makes a ONE-TIME INVITE LINK for the new seat in place of showing its key (sprint 12, 12.3: <origin>/signup?via=invite#<token>, 7 days, that seat and its email only, shown once; the invitee chooses their own passphrase; a seat that waits for its holder's yes gets none: its holder accepts it on /orgs), no deliver: the key, as before) · invite-link (personId: a new link for an active seat of YOUR org that was never used — never signed in, nothing filed, its account holding no passphrase of its own — any older open one of that seat revoked; a working seat: 'Nothing done', its secret reset with rotate-key or set-password; a seat of another org, a pending or removed one: nothing) · rotate-key (the new key shown once; that person's open sessions revoked in the same action) · set-role (role admin|member|partner; seated = member) · set-access-hats (personId, accessHat repeated: the WHOLE list of the hats that unlock briefings and cards for that person, migrate-045; none ticked: none; a hat outside the seven refused; an events row kind access) · add-project · archive-project · activate-project · grant-seat · revoke-seat · remove-person · clean-eval (the suites' marked rows, and an archived eval project swept of its seats, knowledge, derived rows and previews; its grades stay) (+ set-title · set-password kept for scripts); owner-only, refused to a seat 403 independently of the render; a read-only credential 403, a cross-origin cookie 403, a key in the address signs no one in (G2 M2); every answer is 200 + the page with its flash, a refusal 'Nothing done — …' (set-role never leaves the org with no real admin, the suites' eval-fixed owner never counted; add-person never mints an admin; remove-person never removes the last real admin); the one-time secret of add-person and rotate-key, and an invite link, ride the response body only, never a Location or a URL the server is sent (the link's token is its fragment)" },
  { m:"POST", p:"/respond",       auth:"bearer", does:"answer an open question with one of its options: {qid, option, provisional?} or {answers:[…]} — typed text is refused option_required, an absent option unknown_option, a qid this project has not filed unknown_qid, a ruled question not_open, nothing filed on any refusal; files the option's text (lane leader, kind answer, gapRefs q/<qid>) (QBDD22130). The owner's answer (not provisional) rules the question in the same request (ruled:true per answer); anyone else's waits with the owner, the question still open; a form is sent on to a same-origin next; no option is 422 option_required" },
  { m:"POST", p:"/round",         auth:"bearer", does:"the round is a filing (Q187911C3): {qid} adds a question to your round (lane leader, kind round, gapRefs q/<qid>); {export:true} banks your undecided answers and round filings as one rounds-format JSON artifact and returns {artifact, href, count}; a qid the project does not hold (or none) is 404 unknown_qid" },
  { m:"GET",  p:"/logout",        auth:"none",   does:"clear the web session cookie and return to the login page (ADR-056)" },
  { m:"POST", p:"/project",       auth:"bearer", does:"set the active project for this session (ADR-100 §1: the picker/switcher stamp — key must be one of your seats; empty key = the org rollup view, owner only). Needs a session token (cookie or bearer); a call with no web session to stamp is 400 no_session" },
  { m:"GET",  p:"/profile",       auth:"bearer", does:"your own page — your avatar, name, title, role (Admin · Member · Partner), your hats (the seven: management · engineering · organization · gtm · finance · partner · quality, each with its one-line meaning), your seats, the STANDING trace-consent toggle (ADR-102: off · traces · traces+prompts; stored in THIS org's own databank, self-service only — the admin sees, never sets) and your secrets" },
  { m:"POST", p:"/profile",       auth:"bearer", does:"set your own trace consent (ADR-102, migrate-020; a body with no action and no consent of off, traces or traces+prompts is 422 bad_consent with the allowed values) — below-grade material at the door is STRIPPED with an honest note, never blocked; or, re-authenticated with your current passphrase, change your passphrase or rotate your key (shown once) — the self-service secrets, 2026-09-08; or action set-profile {hats:[<hat>…] (a form: hat repeated), avatar:{tone, initials} (a form: tone, initials)}: your own hats and avatar (migrate-044), 422 bad_hat for a hat outside the seven; your hats shape what Home shows you first and NEVER what you may read (the owner's MCQ of 2026-10-01, migrate-045: the visibility rule reads the access hats your admin sets on POST /control set-access-hats); the change is an events row (kind profile). Your own row only: never the read-only credential, a cross-origin session 403" },
  { m:"POST", p:"/mcp",           auth:"bearer", does:"MCP endpoint — native tools for Claude Code, Desktop and claude.ai" },
  { m:"GET",  p:"/capabilities",  auth:"reader", does:"the capability inventory, GENERATED from the contract (contracts/door.json inventory, tools/make-door-contract.py): every tool with its title, read or write, who may call it, whether it reads a named project and how it fails, and every route with who may call it; JSON {note, you, tools, routes}, each tool marked callable for you" },
  { m:"GET",  p:"/updates",      auth:"bearer", does:"what changed for you and what waits on you, on the project ?project= names (else your active one): the SAME call as the updates tool (src/mcp.js callTool, so the project scope and its refusals are the tool's own; 403 project_forbidden): {you, org, project, aim, asOf, ageDays, blockers, activeProject, yourProjects, sinceYouWereLast, inYourLane, elsewhere, waitingOnYou:{openItems, blockers}, yours:{count, items}, more}; ?eval=1 ?limit=<n> — twin of updates and brain://updates", trigger:"T0" },
  { m:"GET",  p:"/whoami",        auth:"bearer", does:"who you are and how many open items are open on you; JSON {id, person, email, role, lane, hats, accessHats, roleClass, projects, org, activeProject, writeProjects, orgs:[{slug, name, role, current}], orgNote, plan} — orgs (sprint 7, 7.5a): where this credential acts: an account's own orgs (an OAuth grant or a session proven by the account's passphrase; the current one marked), else its one org; plan (sprint 8, 8.4): the org's plan and each limit with its usage (a Partner: the limits alone, never the org's counts)" },
  { m:"GET",  p:"/formats",       auth:"reader", does:"the standard every project is filled in (sprint 3, B1), generated from the two registries (src/knowledge/schema.js KINDS, src/shapes.js SHAPES), the same for every project: no seat and no project needed, any signed-in reader; JSON. No query: {kinds:[{kind, line, tabs}], shapes:[{shape, line}], file, next}; ?kind=<kind>: {kind, noun, line, key, fields:[{name, type, required?, key?, default?, values?, limits?, hint}], rules?, example, needsFirst?, call, shows:[{tab, path, region, what, when?}], checklist:[{id, area, question, fills, shows, over?}]}; ?shape=<lane>: {shape, label, line, fields, example, call, shows}; 404 unknown_kind | unknown_shape with the list — twin of the formats tool; JSON {kinds, items, shapes, file, next}" },
  { m:"POST", p:"/preview",       auth:"bearer", does:"see what will be filed before anything is (sprint 3, B2; split in sprint 19): {project?, items:[1..200], leftOut?:[{what, why}], note?, eval?}, each item ONE of {contribution:{lane, what, why, ...}}, a knowledge upsert {kind, op:'upsert', data} or a knowledge remove {kind, op:'remove', data}; a {grade} or an {answer} item is refused (wrong_tool: POST /grade and POST /respond file those); every item runs through the SAME checks and planning its write runs, NOTHING is written to the project and nothing is filed; answers {previewId, expiresAt, url, project, items:[{i (the index into the items sent, from 0), n (the number the text and the page print, from 1), type, kind, kindWord, line, places:[{tab, path, region, what}], tab, verdict:files|waits_for_owner|needs|unchanged|refused, effect, reasons:[plain words], filesWith (file_contribution|save_knowledge|remove_knowledge), needs?:{field, hint, formats}, refusal?, body?:{bytes, stripped?}}], parts:[{tool, items (their numbers), ready}], counts:{byVerdict, byKind}, reach:{touched, reached, checks:{total, read, graded}, goals, questions, asks, capped}, reachLine, leftOut, ready, notReady, text (the terminal block), next}; ONE previews row written (none for a read-only key, whose preview refuses every item for filing); a full key, a session cookie (same origin) or the read-only key as a Bearer header, never a key in the address; a project the caller holds no seat on 403 project_forbidden — twin of preview; no items is 422 items_required, nothing written" },
  { m:"POST", p:"/preview/file-contribution", auth:"bearer", does:"file a preview's contributions (sprint 19): {previewId, items (the preview's contribution items, as previewed and in their order), only?:'ready'}; an item of another operation 422 wrong_tool (each named with the tool that files it); a body without previewId 422 preview_id_required, without its items 422 items_required; refused unless the preview is the caller's own (404 preview_not_found), holds contributions (422 nothing_to_file), this part is not filed (409 preview_filed, with its receipt), not expired (409 preview_expired, an hour), the items equal the preview's contributions (409 preview_changed) and every one is ready (422 not_ready, unless only:'ready'); then ONE batch-door batch; answers the receipt {previewId, project, tool, complete, filedAt, items, counts, results:[{i, n, status, id?}], rest:[{tool, items}], text, url}; a retry with the same previewId files only what did not land; fileOnConfirm: true files nothing here (no confirm over REST) and says so; a read-only credential 403 — twin of file_contribution" },
  { m:"POST", p:"/preview/save-knowledge", auth:"bearer", does:"save a preview's knowledge upserts (sprint 19): {previewId, items (the preview's {kind, op:'upsert', data} items, as previewed and in their order), only?:'ready'}; the same refusals as POST /preview/file-contribution (wrong_tool, preview_id_required, items_required, preview_not_found, nothing_to_file, preview_filed, preview_expired, preview_changed, not_ready); then ONE knowledge write, all or nothing, with its one ledger row; answers the receipt; a retry with the same previewId writes nothing twice; a read-only credential 403 — twin of save_knowledge" },
  { m:"POST", p:"/preview/remove-knowledge", auth:"bearer", does:"remove what a preview's knowledge removes name (sprint 19): {previewId, items (the preview's {kind, op:'remove', data} items, as previewed and in their order), only?:'ready'}; the same refusals as POST /preview/file-contribution; then ONE knowledge write, all or nothing, with its one ledger row; answers the receipt; a retry with the same previewId removes nothing twice; a read-only credential 403 — twin of remove_knowledge" },
  { m:"GET",  p:"/preview/:id",   auth:"reader", does:"one preview in the app (sprint 3, B2): its state (not filed yet with when it expires, filed in part, filed with a link to what each item became, expired), its items (the line, the kind, where it will show as a link, the verdict as a chip, the reasons), what was left out, what it reaches (touched, reached, checks in question, goals, questions; Show on the Map pins the first touched node) and each part's exact call (its write tool and its items, sprint 19); READ-ONLY (nothing is filed from it); its author and anyone who may read its project (a seat; the owner any active project; a Partner only with a seat), an item whose roleVisibility does not admit the reader left out for anyone but its author; a missing, malformed or unreadable id 404; the page to a browser (Accept: text/html), the view as JSON otherwise; JSON {id, project, author, createdAt, expiresAt, filedAt, state, items, counts, reach, reachLine, parts:[{tool, items, filed}]}" },
  { m:"GET",  p:"/library",      auth:"reader", does:"the Library: the project's docs and cards you may read (a doc's or card's visibility names the roles that may; the owner reads all), start-here.md first, each with its confidence, as-of date and due-for-review mark; ?q=<words> searches (the search tool's read), ?kind=<card kind> lists one kind; HTML for a browser, JSON otherwise {project, startHere, note, count, docs:[{doc, title, link}], empty?} (read {kind: \"doc\"} is the tool's list)" },
  { m:"GET",  p:"/doc/:path",    auth:"reader", does:"one of the project's docs: to a browser the doc drawn in the shell (its title, path, confidence, as-of date and markdown), else the markdown; start-here.md is the project's own, else the built-in guide; 404 not_found for a doc that is not there or that your role may not read, the same answer for both (read {ref: \"doc/<path>\"} is the tool's read)", trigger:"T2b" },
  { m:"POST", p:"/open-items",   auth:"bearer", does:"open an open item {title, ref?}, or close one {close: id}; answers your open items after it; no title is 422 title_required — twin of open_items", trigger:"T7" },
  { m:"POST", p:"/ask",          auth:"bearer", does:"ask the owner a question {question, about?, project?}: recorded for the owner, it waits with them until answered and shows on your updates; no question is 422 question_required, a project you hold no seat on 403 project_forbidden — twin of ask" },
  { m:"POST", p:"/artifact",     auth:"bearer", does:"save a document or an HTML dump (?title=&group=&states=, ?screens= kept as text only: a file names no screen, and a screen's picture is a render) -> {id, hash, bytes, deeplink}; no group (or 'ungrouped') is 422 group_required, an empty body 422 empty — twin of save_file", trigger:"T3 · T4" },
  { m:"GET",  p:"/artifact/:id",  auth:"reader", does:"read a saved file back; ?meta=1 for who saved it and when. A public one serves to anyone with the link; any other needs its author or the owner: signed out 401 and anyone else 404 not_found, the same answers as for an id that does not exist" },
  { m:"POST", p:"/wrap-up",      auth:"bearer", does:"hand over at a session's end {summary, decisions?, answers?, proposals?, open?, project?}: each open line becomes one of your open items, each card answer files on Decisions; no summary is 422 summary_required — twin of wrap_up", trigger:"T9" },
  { m:"GET",  p:"/contribution/:id/impact", auth:"reader", does:"one contribution's Impact view: what it changed (the nodes it touched), what that reaches one hop out (by type, named, capped), the proof to redo (each check naming what changed that was graded before it, stale or not, with the regrade call as its preview), the decisions that apply, the goals it moved; read on the reader's own scope of the contribution's project (anything else 404 not_found, as a missing id); the page to a browser, JSON otherwise {project, id, what, touched, reached, proof, line, url} — the impact tool's read" },
  { m:"POST", p:"/contribution/:id/pick-up", auth:"reader", does:"take a contribution's next action: {done?, note?, release?} as JSON, or a form (action pick|done|release, the contribution page's buttons; sent back to the page): the first pick-up holds and a second is refused 409 next_taken naming who has it; done marks it done; release gives it back (the contributor, the owner or the holder; else 403 release_forbidden); 404 not_found for a contribution you may not read (unless its next.who names you), 422 no_next_action, 409 next_done; one row updated, nothing filed; a read-only credential 403, a cross-origin cookie write 403 — twin of pick_up" },
  { m:"GET",  p:"/impact",       auth:"reader", does:"what a change reaches: ?contribution=<id> (as /contribution/:id/impact reads it) or ?refs=a,b (the ids you are about to change, on ?project= or your active project): {touched, reached, proof:{toRedo, regraded, ungraded, calls}, decisions:{asks, named}, goals, line, capped} and with refs history:{refs, count, items, more} (the contributions that named them, newest first; &eval=1 with the suites' rows); read-only; 403 project_forbidden, 404 not_found, 422 refs_required — twin of the impact tool" },
  { m:"GET",  p:"/search",        auth:"reader", does:"one search across everything the reader may read in the project (sprint 3, B5; src/extract.js searchAnswer): ?q=<words>&kinds=goal,question,check,card,doc,node,contribution&limit=<per kind, max 25>&project=&eval=1 (the eval-marked contributions among the project's newest 300 join, as a tab's ?eval=1); reads the full-text index (migrate-056) then only the rows shown; {project, q, words, total, groups:[{kind, label, count, more, hits:[{kind, ref, title, snippet, href, updatedAt, …}]}]}; a doc or card the reader's role may not read is never named or counted; 422 q_required, unknown_kind; 503 search_unavailable before migrate-056 — twin of the search tool" },
  { m:"GET",  p:"/read",          auth:"reader", does:"one item by its ref, or one page of a kind (sprint 3, B5; src/extract.js readAnswer): ?ref=goal/<id>|q/<qid>|check/<id>|card/<kind>/<id>|doc/<path>|<node id>|T-… -> {project, kind, ref, item, links:[{rel, ref, href}], href}; ?kind=<kind>&limit=&after=&cardKind=&q=&screen= -> {project, kind, items, next, href}; a hidden doc or card is 404 not_found as a missing one; 422 bad_ref, ref_required, unknown_kind. To a browser (sprint 3, D2) ?ref=card/<kind>/<id> is the card's own page (its fields by the card format, its source, confidence, as-of date, due-for-review mark and who may read it; the tab its card kind names lit), any other ref 302 to the page that shows it, a ref the reader may not read the usual 404 page — twin of the read tool" },
  { m:"GET",  p:"/changes",       auth:"reader", does:"what changed in the project (sprint 3, B5; src/extract.js changesAnswer): ?since=<ISO time | v<N>> (default the current version, else 7 days)&kinds=&tab=&limit=&eval=1 (eval-marked rows included, as a tab's ?eval=1), or ?org=1 — the whole org in one bounded answer: {org: true, since:{at, label}, byProject:[{project, filings, contributions, knowledge (the owner only: a knowledge write may name what a member may not read), grades, latest, capped?}], total, capped?, note}, only the projects the caller may read; since an ISO time (default the last 30 days); each project reads at most its share of 1,000 of its newest rows on idx_transmission_project (src/extract.js ORG_ROWS_MAX, hidden rows counted toward it), a project that reaches it capped (its counts a floor); ?org=1&list=1 (sprint 12, 12.5; src/activity.js activityAcross, the read GET /audit?all=1 draws) — the contributions themselves across those projects, newest first: {org: true, list: true, projects:[{project, slug, name}], since, filters, items:[{id, at, project, slug, projectName, lane, kind, what, state: landed|with|decided|needs, decision, by:{id, name, role, title, hats, avatar}, door: mcp|api|web|null, client: claude|claude-code|chatgpt|codex|web|api|other|null, href}], more, next, capped?, note}, &person=<a filer's id>&lane=&state=&projects=a,b (only those of yours: another is 403 project_forbidden, nothing read)&before=<next>&limit= (default 50, at most 100); the same share of 1,000 rows per project, the filters applied to those rows, a capped project's page ending at its oldest row read and next going on from there; door is the door it came through; client (sprint 13, 13.1; migrate-080) is which AI filed it, the one family word stamped at the door from what the client declares (the OAuth client's registered name, the MCP clientInfo; web the app's forms, api a key on REST, other any other client): a self-declared label, never proof; null on a row filed before it; the ledger on idx_transmission_project, at most 200 rows read; {project, since:{at, label, version}, total, more, changes:[{id, change, kinds, at, by, lane, what, refs, reaches?:{touched, total, byType, first, toRedo, line, href}, href}]}; the What changed page to a browser (data-screen changes) — twin of the changes tool; JSON {project, since, total, more, changes}" },
  { m:"GET",  p:"/contribution/:id", auth:"reader", does:"one contribution by id: its three lines (what, why, what it touches), grade and route; a browser gets the contribution's page (header, ruling, what was filed, refs, counters, trail). The owner reads any; anyone else one they filed or one in a project they hold a seat on, and every other id answers 404 not_found exactly like a missing one; JSON {id, lane, kind, what, why, touches, route, status, project, created_at, grade} (read {ref: <id>} is the tool's read)" },
  { m:"POST", p:"/signout",       auth:"bearer", does:"revoke this device's token" },
  { m:"GET",  p:"/log",           auth:"owner",  does:"master log: every contribution of your org, all its users" },
  { m:"GET",  p:"/storage",       auth:"owner",  does:"what your org stores (its files and screen pictures, each body once) against its plan's storage limit, plus orphanCandidates — artifacts unreachable from any contribution (ADR-087 §3, warn-level)" },
];

// RESERVED_ORG_NAMES (sprint 7, 7.3; PLATFORM §2 item 9): the names an org's address may never take, DERIVED from the registry
// above (every route's first segment) and the platform's fixed words (src/orgnames.js): a route added here is reserved the moment
// it exists. tools/check-org-names.mjs (a gate step) proves every route the tables below answer is in it.
const RESERVED_ORG_NAMES = reservedNames(CAPABILITIES);

// ---- THE ADDRESS (sprint 7, 7.4; docs/plan/PLATFORM.md §2 item 9: each org at agent.ryuklabs.io/<org> for every page) ----
// splitAddress(path) -> { seg, rest } when the path's first segment can be an org's address (not a name the platform uses, and
// of a path name's form: src/orgnames.js), else null (the platform's root: every route as it always answered). rest is the
// path the org's address carries ("/" for the org's own root). Pure: whether an org holds the name is the router's one read.
function splitAddress(path) {
  const segs = String(path || "").split("/");
  const seg = segs[1] || "";
  if (!seg || RESERVED_ORG_NAMES.has(seg.toLowerCase()) || orgSlugProblem(seg, null)) return null;
  const rest = "/" + segs.slice(2).join("/");
  return { seg, rest: rest.replace(/\/+$/, "") || "/" };
}
// NOT_HERE — the ONE answer for an org's address that serves this caller nothing: an org no one holds, an org the account holds
// no seat in, a bearer of another org, a platform door asked for under an org. One body for every case, so the answer never
// tells who belongs to an org (membership is never told): a page in the PLATFORM's brand (src/login.js renderNotHere, sprint 7,
// 7.4b), drawn once per isolate from constants (never the org's brand, never anything of the request). An org's EXISTENCE and its
// name are not secret: the root's sign-in reached from its address wears its brand (signInBrandOf, below) — ruled kept until the
// one pre-public revisit (sprint 7's review, B4).
let NOT_HERE_HTML = null;
const NOT_HERE = () => new Response(NOT_HERE_HTML || (NOT_HERE_HTML = renderNotHere()), { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
// preferOrgOf(env, origin, next) -> the org a sign-in is going to (the org whose address `next` names, when an org holds it), or
// null: the root's sign-in chooses that org's seat first (src/accounts.js passphraseSignIn)
async function preferOrgOf(env, origin, next) {
  const row = await nextOrgRow(env, origin, next);
  return row ? Number(row.id) : null;
}
// nextOrgRow(env, origin, next) -> the org row whose address `next` names (/<org>/…), or null (no next, a root path, a name no
// org holds)
async function nextOrgRow(env, origin, next) {
  const p = sameOriginPath(next, origin);
  const a = p ? splitAddress(p.split(/[?#]/)[0].replace(/\/+$/, "") || "/") : null;
  return a ? orgBySlug(env, a.seg) : null;
}
// THE FRONT DOOR'S BRAND (sprint 7, 7.4b; PLATFORM §2 item 9: each org's brand on its own pages): the sign-in lives at the root.
// Reached from an org's address (an org's page sends a signed-out visit to /login?next=/<org>/<page>), it wears THAT org's
// brand (its name beside the product's wordmark); reached at the root, the PLATFORM's own (sharingu), never org 1's. What it
// tells, to anyone and with no credential: that an org holds that address, and the org's name — public by ruling until the one
// pre-public revisit (sprint 7's review, B4); never who belongs to it (the not-here page is one body, in the platform's brand,
// for every org).
async function signInBrandOf(env, origin, next) {
  const row = await nextOrgRow(env, origin, next).catch((e) => { if (isD1Quota(e)) throw e; return null; });
  return row ? configOf(row).brand : { ...DEFAULT_BRAND };
}
// landingFor(env, origin, signin, next) -> where a web sign-in (or sign-up) lands (sprint 7, 7.4b): `next` when it names an org's
// page and the session reaches that org (a SEAT session: its seat's org; an ACCOUNT session: any org its account holds a seat in,
// so the sign-in's chosen seat is there), or when it is a root path (the root's own rule takes it from there); else the
// sign-in's own landing (src/accounts.js landingOf: the picker for an account in several orgs, else the one org)
async function landingFor(env, origin, signin, next) {
  const p = sameOriginPath(next, origin);
  if (p) {
    const a = splitAddress(p.split(/[?#]/)[0].replace(/\/+$/, "") || "/");
    if (!a) return p;
    const row = await orgBySlug(env, a.seg);
    if (row && signin && signin.seat && Number(signin.seat.org) === Number(row.id)) return p;
  }
  return landingOf(env, signin);
}

// json · text · uid · now · sha256 · pbkdf2 · hex moved to src/util.js (M-ADR-008a) —
// imported at the top of this file; handler modules import the same one copy.

// servePage(env, opts) — every page in the shell: shell() + the Response. opts: { active, content, owner, cache, status,
// reader, tenant?, proj?, seatsRead?, head?, includeEval?, … } — active/content/owner pass straight to shell(); cache is the
// cache-control header (undefined omits it); status defaults to 200; reader is the resolved reader (null: an anonymous
// public view); tenant is the org's facts if the caller already read them (src/tenant.js getTenantConfig), else read
// here. The per-page reads (the project switcher, the badge, the version head) run as one parallel wave below.

// sameOriginPath(candidate, origin) — the ONE open-redirect guard (POST /login's ?next=, /view's
// ?src=). Resolves the candidate against OUR origin with the real URL parser and keeps it only if
// the origin survived: that is the exact test a browser applies to the Location header, so the
// backslash / tab / `@` shapes a prefix test lets through (`/\evil.com` → https://evil.com/) are
// refused here by construction. Returns the normalized path+query+hash, or "" when unsafe.
// addressFlooded(request, env) -> true when this address is over the LOGIN_LIMIT binding's budget (M-ADR-033/035: per-IP, keyed by
// address, IPv6 by /64, best-effort, fail-open but logged). POST /login and POST /signup share it: a code guess and a passphrase
// guess spend the same budget (sprint 7, 7.2). The per-account lockout (src/accounts.js) stays the credential defense.
async function addressFlooded(request, env) {
  const ipRaw = request.headers.get("cf-connecting-ip") || "";
  const ipK = ipRaw ? (ipRaw.includes(":") ? ipRaw.split(":").slice(0, 4).join(":") + "::/64" : ipRaw) : "";
  let over = false;
  if (ipK && env.LOGIN_LIMIT && typeof env.LOGIN_LIMIT.limit === "function") {
    try { over = (await env.LOGIN_LIMIT.limit({ key: "login:" + ipK })).success === false; }
    catch (e) { console.warn("LOGIN_LIMIT unavailable — running unlimited", String(e && e.message || e)); }
  } else if (ipK) { console.warn("LOGIN_LIMIT binding absent — running unlimited"); }
  return over;
}

function sameOriginPath(candidate, origin) {
  if (typeof candidate !== "string" || !candidate.startsWith("/")) return "";
  try {
    const u = new URL(candidate, origin);
    if (u.origin !== origin) return "";
    return u.pathname + u.search + u.hash;
  } catch { return ""; }
}

// wantsHtml(request) — a browser NAVIGATION vs an API/curl caller. Used by the two-faced routes
// below the REST gate (/contribution/:id) and the owner-only refusal, so a person
// on glass gets a page and a script gets JSON — without every in-page link having to remember a
// ?page=1 marker (kept as an explicit override). Keyed off Sec-Fetch-Dest (every browser sends
// it on a navigation; no API client does), falling back to Accept's FIRST type — never a
// substring match, which would hand HTML to a client that listed text/html at q=0.1.
function wantsHtml(request) {
  if (request.headers.get("sec-fetch-dest") === "document") return true;
  const accept = (request.headers.get("accept") || "").trim().toLowerCase();
  return accept.startsWith("text/html");
}

// dependNamesOf(env, project, depends) -> Map(ref -> name): the name of each ref a contribution depends on (src/maprefs.js
// dependForm: T-… a contribution, goal/<id>, q/<qid>, check/<id>, else a node id), one batch of at most four statements
async function dependNamesOf(env, project, depends) {
  const out = new Map();
  const refs = [...new Set((Array.isArray(depends) ? depends : []).map(String))].slice(0, 25);
  const want = { goal: [], q: [], check: [], node: [] };
  for (const r of refs) { if (/^T-\d{8}-\d{1,6}$/.test(r)) continue; if (r.startsWith("goal/")) want.goal.push(r.slice(5)); else if (r.startsWith("q/")) want.q.push(r.slice(2)); else if (r.startsWith("check/")) want.check.push(r.slice(6)); else want.node.push(r); }
  const q = (sql, ids) => db(env).prepare(`${sql} WHERE project = ?1 AND ${ids.length > 1 ? `${sql.includes("k_questions") ? "qid" : "id"} IN (SELECT value FROM json_each(?2))` : `${sql.includes("k_questions") ? "qid" : "id"} = ?2`}`).bind(project, ids.length > 1 ? JSON.stringify(ids) : ids[0]);
  const stmts = [], prefix = [];
  if (want.goal.length) { stmts.push(q("SELECT id AS k, title AS n FROM k_goals", want.goal)); prefix.push("goal/"); }
  if (want.q.length) { stmts.push(q("SELECT qid AS k, question AS n FROM k_questions", want.q)); prefix.push("q/"); }
  if (want.check.length) { stmts.push(q("SELECT id AS k, title AS n FROM k_checks", want.check)); prefix.push("check/"); }
  if (want.node.length) { stmts.push(q("SELECT id AS k, name AS n FROM k_nodes", want.node)); prefix.push(""); }
  if (!stmts.length) return out;
  const res = await db(env).batch(stmts);
  res.forEach((r, i) => { for (const row of (r && r.results) || []) if (row.n) out.set(prefix[i] + row.k, String(row.n)); });
  return out;
}

// ownerOnlyRefusal(request, env, person) — the ONE owner-only refusal (ADR-022): a browser gets the page in the shell
// (M-ADR-024), a script gets JSON 403 owner_only. The OWNER_ONLY gate answers through it (the owner-queue page that also
// did is retired, UI-B4b: it 302s to /build).

async function ownerOnlyRefusal(request, env, person) {
  const ownerLabel = ownerName(await resolveOwner(env));
  const what = `This reads across everyone — ask ${ownerLabel}.`;
  if (request.method === "GET" && wantsHtml(request)) {
    return servePage(env, { active: "audit", content: renderDenied({ what }), owner: false, reader: person, cache: "private, no-store", status: 403 });
  }
  return json({ error: "owner_only", note: what }, 403);
}

// flashOf(url) — the one-word outcome a form door sends a person back with (POST /respond, POST /round): a refusal
// code, a filing error, or that it filed. Only the codes the screens know are read; anything else reads as nothing.
const FLASH_CODES = new Set(["option_required", "unknown_option", "unknown_qid", "not_open", "project_required", "round_empty", "not_filed"]);
function flashOf(url) {
  const sp = url.searchParams, pick = (k) => (FLASH_CODES.has(sp.get(k) || "") ? sp.get(k) : null), n = (k) => (/^\d{1,2}$/.test(sp.get(k) || "") ? Number(sp.get(k)) : 0);
  return { refused: pick("refused"), txerror: pick("txerror"), filed: n("filed"), ruled: n("ruled"), rounded: sp.get("rounded") === "1" };
}

// serveMap(env, reader, key, url) -> the Map page (src/mapread.js readMapPage) opened as key names it (GET /map,
// /map/<plane>), full width with its own bar; the version head it read and, on Arch, the seats it read are handed to the
// shell so neither is read twice
async function serveMap(env, reader, key, url) {
  const r = await readMapPage(env, reader, key, url.searchParams, mapReg(CAPABILITIES, MCP_TOOLS, env));
  return servePage(env, { active: key, content: r.content, owner: reader.role === "owner", reader, cache: "private, no-store", full: true, head: r.head ?? null, seatsRead: r.seatsRead, status: r.status, meter: "map",
    lists: { tab: "map", compact: true, markerOnly: true } });
}
const REQ_FROM = Symbol.for("sharingu.from");
// ---- sprint 8, 8.2: THE REST DOOR'S CALLS (docs/plan/PLATFORM.md §4 sprint 8). Every signed-in request that is not a GET (or a
// HEAD) counts as one of the org's calls (src/plans.js countCall, ONE D1 batch), before its route runs: past the day's calls or the
// minute's burst a WRITE is refused plan_limit, 429 with Retry-After, nothing done (a read always answers: readOnAnyVerb below). The request's warning (src/plans.js PLAN_NOTE: this
// count's, or any write check's past 80%) rides the answer: a JSON object's planWarning, and the header below on any answer. A page GET is a read: never counted. /mcp counts per tools/call
// (src/mcp.js callGate); the session doors (sign-in, sign-out) are never counted, so a busy org can always sign out.
const uncountedWrite = (path) => path === "/mcp" || path === "/login" || path === "/logout" || path === "/signout";
// a non-GET that writes nothing is a READ, whatever its verb (8.2f, main's ruling): counted as a call, never burst- or plan-refused.
// POST /backup-dump (the pager in POST clothing, ruled), and the routes that answer any verb with a page or a packet and write
// nothing: /health, /, /home, /brief, /projects, /docs, /missing, /audit, /view, /canvas.json, /install, /whoami
const readOnAnyVerb = (path) => path === "/backup-dump" || path === "/health" || path === "/" || path === "/home" || path === "/brief" ||
  path === "/projects" || path === "/docs" || path === "/missing" || path === "/audit" || path === "/view" || path === "/canvas.json" ||
  path === "/install" || path === "/whoami";
const PLAN_WARNING_HEADER = "x-sharingu-plan-warning";
// planNoted(res, warning) -> the answer with the warning: the header always; a JSON object body gains planWarning
async function planNoted(res, w) {
  const h = new Headers(res.headers);
  h.set(PLAN_WARNING_HEADER, `${w.limit}${w.used != null ? ` ${w.used}/${w.allowed}` : ""} (plan ${w.plan})`);   // a Partner's: no count
  let body = res.body;
  if (/application\/json/.test(h.get("content-type") || "")) {
    const t = await res.text();
    body = t;
    try { const o = JSON.parse(t); if (o && typeof o === "object" && !Array.isArray(o) && o.planWarning == null) body = JSON.stringify({ ...o, planWarning: w }); } catch { /* not an object: the header says it */ }
    h.delete("content-length");
  }
  return new Response(body, { status: res.status, statusText: res.statusText, headers: h });
}
async function servePage(env, opts) {
  const o = opts || {};
  // the org's brand (src/tenant.js, its row): one read here covers every page; DEFAULT_BRAND inside shell() is the fallback
  const tenantP = o.tenant !== undefined ? Promise.resolve(o.tenant) : getTenantConfig(env);
  // The project switcher (ADR-100, the top bar's project-switcher region): computed HERE, once, for
  // every shell page, from the person's own seats (projectSeatsFor, the list whoami answers). A
  // switcher for a reader with real choice (more than one seat, or an owner in a multi-project org);
  // one seat is named statically; no seat renders the shell's own honest scope text (proj null).
  // Callers may pass proj explicitly (the picker page passes null) to skip this.
  // build0925-home-latency: the per-page reads below (the switcher, the badge count, the version head) are mutually
  // independent, so they run as ONE parallel wave, each with its own fallback.
  const projP = (async () => {
    if (o.proj !== undefined) return o.proj;
    if (!(o.reader && o.reader.id)) return null;
    try {
      // UI-B8b: a page that already ran these two reads (the arch plane: its org worker IS the seats and the active count)
      // hands them over as o.seatsRead = {seats, orgCount}, so the shell never reads them twice
      const [seats, orgCount] = o.seatsRead ? [o.seatsRead.seats || [], Number(o.seatsRead.orgCount) || 0]
        : await Promise.all([seatsOnce(env, o.reader.id), countActiveProjects(env)]);   // D9 (U-MCP): the request's one seats read
      const isOwner = o.reader.role === "owner";
      if (seats.length > 1 || (isOwner && orgCount > 1)) {
        // U-TOPBAR: the chip names the project this page READ — the seam's read scope (READ_SCOPE: a named ?project=, the live
        // stamp, or a member's single-seat/first-readable default) — never the raw session stamp (tokenProjectFor), so a
        // multi-seat member or the owner reading ?project=P sees P. The owner's unnamed default is the org rollup ("All
        // projects"). With no seam record (an unscoped request), the live stamp is the scope (liveStampOf, memoized): an
        // owner's stamp on an ARCHIVED project now reads "All projects", as the read itself does (tail-b D4).
        const sc = env[READ_SCOPE] || { project: await liveStampOf(o.reader, seats, env), named: false, active: true };
        const curKey = switcherCurrentOf(o.reader, seats, sc);
        // an owner reading a project with no seat row on it: its name from its row (one statement), else its slug, never the
        // org-prefixed key (sprint 12, 12.6: "o3--sharingu" in the rail)
        const cur = curKey ? (seats.find((s) => s.key === curKey) || { key: curKey, name: (await projectNameOf(env, curKey)) || projectSlug(curKey) }) : null;
        return { current: cur, options: seats, orgEntry: isOwner };
      } else if (seats.length === 1) {
        // one seat: nothing to switch, but the project that scopes this reader's pages is named
        return { current: { key: seats[0].key, name: seats[0].name || projectSlug(seats[0].key) }, options: seats, orgEntry: false, static: true };
      }
      return null;
    } catch { return null; }
  })();
  // The felt-loop badge (M-ADR-010): the "what's waiting on you" count, computed on-load for
  // every shell page. Defensive: a query hiccup shows no badge, never breaks the page.
  const briefCountP = (o.reader && o.reader.id) ? briefCountFor(o.reader, env, !!o.includeEval).catch(() => 0) : Promise.resolve(0);
  // The version head (src/knowledge/versions.js): the project's newest version, one row on its primary key, for every
  // signed-in page. Every Map view's bar carries it as the version chip, and the page is stamped with it so the shell's
  // BEHIND poll can tell a newer version (a publish or a restore) was made after the page was drawn. A caller that already
  // read it (the Versions view) hands it over; a failed read is no head.
  const headP = o.head !== undefined ? Promise.resolve(o.head)
    : (o.reader && o.reader.id) ? (async () => { try { return await versionHead(env, await projectOf(env)); } catch (e) { if (isD1Quota(e)) throw e; return null; } })()
      : Promise.resolve(null);
  // L4 (owner's rule, the revision): the fill lives on What is missing alone (and Home's Filled tile), never as a chip on a tab,
  // so no tab reads its checklist here: o.meter names the tab only for the "changed since" chip below
  // D2 (B7): a tab's main page names its tab (o.lists: a tab key, or {tab, compact, markerOnly}) and the card kinds that name
  // that tab list there (src/tablists.js: the kinds, then one batch; role visibility and access hats applied as the Library
  // applies them). No kind names the tab: no region. A failed read says so in the region; a quota error still reaches the
  // honest outage page. GTM draws its lists from its own read (its JSON and tool carry them), so it never passes o.lists.
  const listsOpt = o.lists ? (typeof o.lists === "string" ? { tab: o.lists } : o.lists) : null;
  // a markerOnly page (the Map) reads the lists only when its content carries the mark (its canvas overview), never on its other views
  const listsP = listsOpt && o.reader && o.reader.id && (!o.status || o.status === 200) && (!listsOpt.markerOnly || String(o.content || "").includes(LISTS_MARK))
    ? tabListsSafe(env, o.reader, listsOpt.tab) : Promise.resolve(null);
  // THE ORG SWITCHER (sprint 7, 7.4b): an ACCOUNT session (its cookie, proven by the account's passphrase: session_account)
  // lists its own account's orgs — ONE indexed read (src/accounts.js orgsOfAccount) — and the rail offers them when there are
  // several; a SEAT session, a bearer and a one-org account read nothing more and see none
  const orgsP = o.reader && o.reader.viaCookie && o.reader.session_account
    ? orgsOfAccount(env, o.reader.session_account).catch((e) => { if (isD1Quota(e)) throw e; return []; }) : Promise.resolve([]);
  const [tenantConfig, proj, briefCount, head, lists, orgs] = await Promise.all([tenantP, projP, briefCountP, headP, listsP, orgsP]);
  // "changed since v N" (sprint 3, B5): a tab's main page names its tab (o.changes, else o.meter) and, when the project has a
  // version, ONE bounded ledger statement counts what changed on that tab since it (src/extract.js changedCountFor, the same
  // classify the changes page and tool use; a role-limited doc or card is never counted). No version: no chip. A failed read
  // draws no chip; a quota error still reaches the honest outage page.
  const changesTab = o.changes || o.meter || null;
  const changed = changesTab && head && o.reader && o.reader.id && (!o.status || o.status === 200)
    ? await changedCountFor(env, o.reader, changesTab, head).catch((e) => { if (isD1Quota(e)) throw e; return null; }) : null;
  const chips = changed ? changedChip(changed) : "";
  const withLists = lists ? mountLists(o.content, lists, listsOpt) : o.content;
  const content = chips ? placeMeterChip(withLists, chips) : withLists;
  const brand = tenantConfig.brand;
  const scope = head ? String((await projectOf(env)) || "") : "";
  // role dropped (QC5F82B90): the shell's tabs are SEATED/ADMIN/ANONYMOUS; owner is the whole gate.
  const html = timeSync(timingOf(env), "render", () => shell({ active: o.active, content, owner: o.owner, reader: o.reader, wide: o.wide, full: o.full, brand, proj, briefCount, head, scope, orgs: orgs.length > 1 ? orgs : null, from: o.from !== undefined ? o.from : (env && env[REQ_FROM]) || "" }));
  const headers = { "content-type": "text/html; charset=utf-8" };
  if (o.cache !== undefined) headers["cache-control"] = o.cache;
  return new Response(html, { status: o.status || 200, headers });
}

// deployMetaFrom(env) — Machines section (S-040 amend 11): the running Worker's own
// deploy identity, read straight off the version_metadata binding (wrangler.jsonc) —
// {id, tag, timestamp} per Cloudflare's runtime contract. Returns null (never a
// guess) when the binding isn't present at runtime — a local `wrangler dev`/dry-run,
// or any environment that predates the binding.
function deployMetaFrom(env) {
  const meta = env && env.CF_VERSION_METADATA;
  if (!meta || !meta.id) return null;
  let date = null;
  try {
    const d = meta.timestamp instanceof Date ? meta.timestamp : new Date(meta.timestamp);
    if (!Number.isNaN(d.getTime())) date = d.toISOString().slice(0, 10);
  } catch { /* honest null, not a guess */ }
  return { id: String(meta.id).slice(0, 8), tag: meta.tag ? String(meta.tag) : "", date };
}

// Events the eval suite writes carry payload.eval=1 and are excluded from every measurement.

// countActiveProjects moved to src/core.js (UI-B8b): the arch plane and its map {plane} twin read the same statement.

// The owner gate in one place (M-ADR-008 T1) — byte-identical to the inline guards
// it replaces. requireOwnerKey() resolves the caller by
// key for the ops-infra POSTs and 403s "owner_only". It returns a Response to return, or
// null to proceed. Broader per-route auth unification (the redirect/servePage variants)
// lands with the dispatch-table router (T14), not here.
async function requireOwnerKey(request, env, url) {
  const p = await resolveReader(request, env, url, {}).catch(() => null);
  if (!p) return signInOr401(request, url);   // THE sign-in rule (D1b): no credential is 401, never a 403
  if (p.role !== "owner") return json({ error: "owner_only" }, 403);
  // hotfix-verb-csrf: these ops POSTs (/backfill · /backup-dump) sit ABOVE the gate, and resolveReader
  // accepts the owner's session cookie, so an owner's signed-in browser could be made to fire them from another site.
  // The same same-origin check every cookie write carries (a Bearer caller, the suites and curl never hit it).
  if (csrfRefused(request, url, p)) return json({ error: "cross_origin_session_write" }, 403);
  return null;
}
// the HTTP status of an extract refusal (src/extract.js): a missing item reads 404 exactly as a hidden one
const EXTRACT_STATUS = { not_found: 404, search_unavailable: 503, unknown_version: 404, project_forbidden: 403 };
// G2 M2: a saved file is served as an inert document (GET /artifact/:id): no script, nothing loaded from anywhere
const ARTIFACT_CSP = "sandbox allow-popups; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'; frame-ancestors 'self'";

// ---- the MCP tool registry (ADR-044; D5: one vocabulary, about 30 names, docs/plan/MCP.md §5; the old names and where each
// went: engine/tools/names.json). One row a tool, its FIRST line its flags: owner (the owner only), write (it files or changes
// something: a read-only grant is refused it), project (it reads the project the caller names, checked against their seats),
// and for the annotations (src/mcp.js annotationsOf, derived, never typed twice): stores (a read that keeps something of its
// own: preview), destructive (a write that can replace, remove or overrule what is held, a check's grade included; one
// that only adds is not), idempotent (its repeat changes nothing more), openWorld (it can reach outside the org: wrap_up's
// GitHub issue, save_file's public link, open to anyone on the web). title is what a client shows; desc says what it does,
// what it needs and what it answers, in at most three sentences. No tenant fact rides a description (check-brand.py guards this).
const MCP_TOOLS = [
  // ---- start a session ----
  { name:"whoami", title:"Who am I", owner:false, desc:"Who you are: your name, role, projects, the project your writes land in, what your consent allows, and the orgs this connection may act in (orgs: any call's orgSlug picks one). Needs nothing. Useful at the start of a session, to see where writes will land.",
    schema:{type:"object",properties:{}} },
  { name:"updates", title:"What changed for you", owner:false, project:true, desc:"What changed since you were last here and what waits on you: the project's aim and blockers, the changes in your lane, your open items, and your own contributions, questions and reports with where each stands. Needs nothing. Useful at the start of a session.",
    schema:{type:"object",properties:{project:{type:"string",description:READ_PROJECT_RULE},limit:{type:"integer",minimum:1,maximum:200,description:"your own items shown (default 20)"},eval:{type:"boolean",description:"include the test suites' rows"}}} },
  // ---- what is missing ----
  { name:"missing", title:"What is missing", owner:false, project:true, desc:"How filled a project is and what it still needs: the checklist's meter overall and per area, then each open item, the next first, with the call that fills it (fill, fillPath). Needs nothing. Useful when deciding what to file next.",
    schema:{type:"object",properties:{project:{type:"string",description:READ_PROJECT_RULE},eval:{type:"boolean",description:"include the test suites' rows"}}} },
  { name:"formats", title:"Formats", owner:false, desc:"How every item is shaped, the same for every project: with nothing, each knowledge kind and contribution shape in a line; with kind or shape, its fields, an example and where it shows. Needs no project.",
    schema:{type:"object",properties:{kind:{type:"string",enum:[...KNOWLEDGE_KINDS,"grade","answer"],description:"a knowledge kind, or grade or answer"},shape:{type:"string",enum:[...TX_LANES],description:"a contribution shape (a lane)"}}} },
  // ---- add: preview, then the write tool each item names ----
  { name:"preview", title:"Preview a filing", owner:false, project:true, stores:true, desc:"Shows what filing 1 to 200 items would do (where each shows, how it is graded, what it reaches, and a text for the person) and keeps that preview for an hour; it never files. An item is a {contribution}, a piece of work filed on Build, or a knowledge upsert {kind, op: \"upsert\", data} or remove {kind, op: \"remove\", data} of the project's aim, goals, questions, checks, cards, card kinds, Map nodes and edges, GTM template, docs, screen renders or styles. Its answer carries the previewId and each item's write tool (filesWith: file_contribution, save_knowledge or remove_knowledge); a grade or an answer is refused here, as submit_grade and respond file those.",
    schema:{type:"object",required:["items"],properties:{project:{type:"string",description:PROJECT_ARG},
      items:{type:"array",minItems:1,maxItems:MAX_OPS,description:"each ONE of the three forms (formats has every kind's and shape's fields, an example and where it shows)",items:PREVIEW_ITEM_SCHEMA},
      leftOut:{type:"array",maxItems:50,description:"what you read and did not turn into an item, and why: [{what, why}]",items:{type:"object",properties:{what:{type:"string"},why:{type:"string"}}}},
      note:{type:"string",description:"one line for the person"},
      clientRef:{type:"string",description:"your key for the whole batch (1 to 48 of a-z A-Z 0-9 . _ : -): filed again, nothing files twice"},
      eval:{type:"boolean",description:"marks a suite row"}}} },
  // sprint 19 (the owner's ruling, 2026-10-13: split by what the write does): three write tools, each filing ONE operation of a
  // preview (src/formats.js WRITE_TOOLS), each the twin of its REST door; the schema of each one's items is exactly its form
  { name:"file_contribution", title:"File contributions", owner:false, write:true, idempotent:true, desc:"Files the contributions of a preview the person has seen and agreed to, by its previewId and the SAME contribution items in their order: each is a new piece of work on Build in its shape (its lane: code, design, leader, vendor, ba or gtm), and it only adds. Answers a receipt with each item's id and link; filed again, nothing files twice (a part already filed answers its first receipt). Refused when an item is not a contribution (naming the tool that files it), the items differ from the preview's, the preview expired or an item is not ready (only: \"ready\" files the rest); fileOnConfirm: true asks the person first, in a client that supports confirmation.",
    schema:{type:"object",required:["previewId","items"],properties:{previewId:{type:"string",description:"the id preview answered"},
      items:{type:"array",minItems:1,maxItems:MAX_OPS,description:"the preview's contributions, as previewed and in their order",items:ITEM_SCHEMA_OF.file_contribution},
      only:{type:"string",enum:["ready"],description:"file the ready items and leave the rest"},
      fileOnConfirm:{type:"boolean",description:"true: a client that declared elicitation asks the person to confirm, and files on yes; any other client is answered that the person was not asked, and nothing is filed"}}} },
  { name:"save_knowledge", title:"Save knowledge", owner:false, write:true, idempotent:true, destructive:true, desc:"Saves the knowledge upserts of a preview the person has seen and agreed to, by its previewId and the SAME upsert items in their order: each adds or changes the project's aim, a goal, question, check, card, card kind, Map node or edge, the GTM template, a doc, a screen render or a style, merging the fields sent into what is held, all together or not at all. Answers a receipt with each item's id and link; saved again, nothing changes twice (a part already filed answers its first receipt). Refused when an item is not a knowledge upsert (naming the tool that files it), the items differ from the preview's, the preview expired or an item is not ready (only: \"ready\" saves the rest); fileOnConfirm: true asks the person first, in a client that supports confirmation.",
    schema:{type:"object",required:["previewId","items"],properties:{previewId:{type:"string",description:"the id preview answered"},
      items:{type:"array",minItems:1,maxItems:MAX_OPS,description:"the preview's knowledge upserts, as previewed and in their order",items:ITEM_SCHEMA_OF.save_knowledge},
      only:{type:"string",enum:["ready"],description:"save the ready items and leave the rest"},
      fileOnConfirm:{type:"boolean",description:"true: a client that declared elicitation asks the person to confirm, and saves on yes; any other client is answered that the person was not asked, and nothing is saved"}}} },
  { name:"remove_knowledge", title:"Remove knowledge", owner:false, write:true, idempotent:true, destructive:true, desc:"Removes what the knowledge removes of a preview the person has seen and agreed to name, by its previewId and the SAME remove items in their order: each removes the project's aim, a goal, question, check, card, card kind, Map node or edge, the GTM template, a doc, a screen render or a style by its key, all together or not at all. Answers a receipt with each item's id and link; removed again, nothing changes twice (a part already filed answers its first receipt). Refused when an item is not a knowledge remove (naming the tool that files it), the items differ from the preview's, the preview expired or an item is not ready (only: \"ready\" removes the rest); fileOnConfirm: true asks the person first, in a client that supports confirmation.",
    schema:{type:"object",required:["previewId","items"],properties:{previewId:{type:"string",description:"the id preview answered"},
      items:{type:"array",minItems:1,maxItems:MAX_OPS,description:"the preview's knowledge removes, as previewed and in their order",items:ITEM_SCHEMA_OF.remove_knowledge},
      only:{type:"string",enum:["ready"],description:"remove the ready items and leave the rest"},
      fileOnConfirm:{type:"boolean",description:"true: a client that declared elicitation asks the person to confirm, and removes on yes; any other client is answered that the person was not asked, and nothing is removed"}}} },
  { name:"ask", title:"Ask the owner", owner:false, write:true, desc:"Asks the owner a question in a sentence or two (about: what it concerns). It waits with the owner until it is answered, and shows on `updates`.",
    schema:{type:"object",required:["question"],properties:{question:{type:"string",description:"what you want to ask"},about:{type:"string",description:"what it is about (a screen, an area, a doc)"},project:{type:"string",description:PROJECT_ARG},eval:{type:"boolean",description:"marks a suite row"}}} },
  // ---- decide and prove ----
  { name:"respond", title:"Answer a question", owner:false, write:true, project:true, destructive:true, desc:"Answers an open question with one of its options: qid and option (0 for A, 1 for B), or answers: [{qid, option}] for several. The owner's answer rules the question; anyone else's waits for the owner. Refused option_required or not_open, and nothing is filed.",
    schema:{type:"object",properties:{
      qid:{type:"string",description:"the question's id (`decisions` lists them)"},
      option:{type:"integer",minimum:0,description:"the option's index: 0 for A, 1 for B"},
      provisional:{type:"boolean",description:"mark the answer provisional"},
      answers:{type:"array",items:{type:"object",required:["qid","option"],properties:{qid:{type:"string"},option:{type:"integer",minimum:0},provisional:{type:"boolean"},eval:{type:"boolean"},project:{type:"string"}}},description:"several answers in one call"},
      eval:{type:"boolean",description:"marks a suite row"},
      project:{type:"string",description:PROJECT_ARG}}} },
  { name:"rule_question", title:"Rule a question", owner:true, write:true, project:true, destructive:true, desc:"Owner only. Rules an open question: qid and choice (the option's index), with an optional rationale; it shows decided everywhere at once. Refused unknown_qid, unknown_option or not_open, and nothing is written.",
    schema:{type:"object",required:["qid","choice"],properties:{project:{type:"string",description:PROJECT_ARG},qid:{type:"string",description:"the question's id"},choice:{type:"integer",minimum:0,description:"the option's index: 0 for A, 1 for B"},rationale:{type:"string",description:"why, in a sentence or two"},eval:{type:"boolean",description:"marks a suite row"}}} },
  { name:"submit_grade", title:"Grade a check", owner:false, write:true, project:true, destructive:true, desc:"Grades one check: checkId and verdict (proven, refused or incomplete). With proof (a command and its result, a link, or a file's id) it counts at once and lights the nodes the check names; without proof it waits for the owner. Send clientRef to retry safely.",
    schema:{type:"object",required:["checkId","verdict"],properties:{checkId:{type:"string",description:"the check's id (read {kind: \"check\"} lists them)"},verdict:{type:"string",enum:["proven","refused","incomplete"]},proof:{type:"string"},clientRef:{type:"string"},project:{type:"string",description:PROJECT_ARG}}} },
  { name:"regrade", title:"Regrade from the pages", owner:false, write:true, project:true, destructive:true, desc:"Regrades the stale or ungraded checks of one flow, node or list of checks (flow, node or checks): each check this worker can observe on its own page is fetched as you and graded with what came back as proof, at most 8 a call; the rest come back under needsProof with the submit_grade calls that file them. Without confirm: true it only says what it would do.",
    schema:{type:"object",properties:{project:{type:"string",description:PROJECT_ARG},flow:{type:"string",description:"a flow's id (map {plane: \"flows\"} lists them)"},node:{type:"string",description:"a node's id, e.g. screen:<id>"},checks:{type:"array",maxItems:60,items:{type:"string"},description:"check ids (impact lists the ones to redo)"},confirm:{type:"boolean",description:"true: observe and file"},eval:{type:"boolean",description:"marks a suite row"}}} },
  { name:"decide_contribution", title:"Decide a contribution", owner:true, write:true, idempotent:true, destructive:true, desc:"Owner only. Decides a contribution that waits for the owner: id and verdict (approve, reject or needs-work), with a note. A decision is final; a second is refused.",
    schema:{type:"object",required:["id","verdict"],properties:{id:{type:"string",description:"the contribution's id (T-YYYYMMDD-NNN)"},verdict:{type:"string",enum:["approve","reject","needs-work"]},note:{type:"string",description:"why this verdict"}}} },
  // ---- carry forward ----
  { name:"pick_up", title:"Pick up", owner:false, write:true, idempotent:true, destructive:true, desc:"Takes a contribution's next action (id): it is yours until done: true or release: true, and a second taker is told who holds it. Anyone who may read the contribution may pick it up. Nothing is filed.",
    schema:{type:"object",required:["id"],properties:{id:{type:"string",description:"the contribution (T-YYYYMMDD-NNN)"},done:{type:"boolean",description:"mark the next action done"},note:{type:"string",description:"with done: what was done, in a line"},release:{type:"boolean",description:"give it back"}}} },
  { name:"open_items", title:"Open items", owner:false, write:true, destructive:true, desc:"Opens an open item (title, and a ref it concerns) or closes one (close: its id), and answers your open items. An open item marks unfinished work you carry between sessions; it never locks anything.",
    schema:{type:"object",properties:{title:{type:"string",description:"what is unfinished, in a line"},close:{type:"string",description:"the id of an item to close"},ref:{type:"string",description:"what it concerns, e.g. screen:<id> (at most 80 characters)"}}} },
  { name:"wrap_up", title:"Wrap up a session", owner:false, write:true, openWorld:true, desc:"Hands over at a session's end: a summary, and any decisions, answers, proposals and what is still open. Each open line becomes one of your open items and each card answer files on Decisions; it shows on `updates` under its summary (and opens an issue when the org links a GitHub repo).",
    schema:{type:"object",required:["summary"],properties:{
      summary:{type:"string"},decisions:{type:"array",items:{type:"object"}},
      answers:{type:"array",items:{type:"object"}},proposals:{type:"array",items:{type:"object"}},
      open:{type:"array",items:{type:"string"}},
      project:{type:"string",description:PROJECT_ARG}}} },
  // ---- find ----
  { name:"search", title:"Search", owner:false, project:true, desc:"Searches one project for words across the goals, questions, checks, cards, docs, map nodes and contributions you may read. Needs q (each word matches as a prefix); kinds and limit narrow it. Answers each hit's kind, ref (for read), title, snippet and link.",
    schema:{type:"object",required:["q"],properties:{project:{type:"string",description:READ_PROJECT_RULE},q:{type:"string",description:"the words, two letters and up"},kinds:{type:"array",items:{type:"string",enum:["goal","question","check","card","doc","node","contribution"]},description:"only these kinds"},limit:{type:"integer",minimum:1,maximum:25,description:"hits per kind (default 5)"},eval:{type:"boolean",description:"include the test suites' rows"}}} },
  { name:"read", title:"Read", owner:false, project:true, desc:"Reads one item by its ref (goal/<id>, q/<qid> or question/<qid>, check/<id>, card/<kind>/<id>, doc/<path>, a node id, T-YYYYMMDD-NNN) with its links, or one page of a kind (kind, limit, after); a check carries its latest grade, and status narrows checks to pass, fail or ungraded; a card carries the cards it relies on (refs) as links. An edge, render, style or card kind reads by kind and its key as ref. A hidden doc or card reads as not_found.",
    schema:{type:"object",properties:{project:{type:"string",description:READ_PROJECT_RULE},ref:{type:"string",description:"one item; doc/start-here.md is where to start"},kind:{type:"string",enum:[...KNOWLEDGE_KINDS,"contribution"],description:"a page of this kind instead of one item"},limit:{type:"integer",minimum:1,maximum:100},after:{type:"string",description:"the previous page's next"},cardKind:{type:"string",description:"with kind card: one card kind"},q:{type:"string",description:"with kind: only the items whose id or title holds these words"},screen:{type:"string",description:"with kind render: one screen's renders"},status:{type:"string",enum:["pass","fail","ungraded"],description:"with kind check: only the checks whose latest grade is this"},eval:{type:"boolean",description:"include the test suites' rows"}}} },
  { name:"changes", title:"What changed", owner:false, project:true, desc:"What changed in one project since a time or a version (default its current version, else the last 7 days), newest first: knowledge, contributions, grades, rulings and answers, each with who, when and what it reaches. since, kinds, tab and limit narrow it. org: true answers the whole org instead — the window's filings counted by project, only the projects you may read; with list: true, the contributions themselves across those projects, newest first (who filed each, their role and hats, its project, lane and state, and which AI filed it as the tool names itself), narrowed by person, lane, state and projects and paged by before.",
    schema:{type:"object",properties:{project:{type:"string",description:READ_PROJECT_RULE},since:{type:"string",description:"an ISO time or a version (v4)"},kinds:{type:"array",items:{type:"string"},description:"contribution, knowledge, grade, ruling, answer, version, broadcast, or a kind they touch"},tab:{type:"string",enum:["home","build","gtm","goals","decisions","map","broadcast","control"],description:"the kinds one tab shows"},limit:{type:"integer",minimum:1,maximum:100,description:"at most this many (default 25)"},eval:{type:"boolean",description:"include the test suites' rows"},org:{type:"boolean",description:"the whole org in one answer: the window's filings counted by project (your readable projects; since is then an ISO time, default 30 days; kinds, tab and limit do not apply)"},list:{type:"boolean",description:"with org: the contributions themselves, newest first, across your readable projects (limit: at most 100, default 50; next pages on)"},person:{type:"string",description:"with org and list: one filer's id (an item's by.id)"},lane:{type:"string",enum:LANE_KEYS,description:"with org and list: one lane"},state:{type:"string",enum:["landed","with","decided","needs"],description:"with org and list: landed (filed straight through), with (waiting for the owner), decided, needs (owes one more thing)"},projects:{type:"array",items:{type:"string"},description:"with org and list: only these of your projects"},before:{type:"string",description:"with org and list: the previous answer's next"}}} },
  { name:"impact", title:"Impact", owner:false, project:true, desc:"What a change reaches, before or after it: contribution (an id) or refs (the ids you are about to change). Answers what is touched, what that reaches one hop out, the graded checks in question with the regrade call, the open questions and goals, and (for refs) the contributions that named them. Useful before changing something.",
    schema:{type:"object",properties:{project:{type:"string",description:READ_PROJECT_RULE},contribution:{type:"string",description:"a contribution's id (T-YYYYMMDD-NNN)"},refs:{type:"array",items:{type:"string"},description:"screen:<id>, door:<method>:<path>, table:<name>, goal/<id>, q/<qid>, check/<id>"},eval:{type:"boolean",description:"include the test suites' rows"}}} },
  { name:"brief", title:"Brief", owner:false, project:true, desc:"The work packet. For a hat (management, engineering, organization, gtm, finance, partner, quality): its aim, goals, the open questions it owes, the blockers waiting on someone else (who, and what each blocks), follow-ups and what changed; for a ref: the item, what it depends on and what depends on it. With no `for`, your own role's brief (role names another's).",
    schema:{type:"object",properties:{project:{type:"string",description:READ_PROJECT_RULE},for:{type:"string",description:"a hat or a ref (goal/<id>, q/<qid>, check/<id>, a node id, T-YYYYMMDD-NNN)"},role:{type:"string",description:"with no for: whose role's brief (left out: yours)"},eval:{type:"boolean",description:"include the test suites' rows"}}} },
  // ---- read a tab ----
  { name:"home", title:"Home", owner:false, project:true, desc:"The project's Home in one read: its aim, what is moving, what needs you, who moved the goals this month and who is here.",
    schema:{type:"object",properties:{project:{type:"string",description:READ_PROJECT_RULE},eval:{type:"boolean",description:"include the test suites' rows"}}} },
  { name:"build", title:"Build", owner:false, project:true, desc:"The project's Build tab in one read: its contributions (the newest 50, each with its state, goal, counters and rank), what moved this week and the finish line. kind filters; sort is ranked, newest or goal.",
    schema:{type:"object",properties:{project:{type:"string",description:READ_PROJECT_RULE},kind:{type:"string",description:"only this kind"},sort:{type:"string",enum:["ranked","newest","goal"]},eval:{type:"boolean",description:"include the test suites' rows"}}} },
  { name:"gtm", title:"GTM", owner:false, project:true, desc:"The project's GTM tab: its go-to-market contributions by activity kind, each with its state and counters, the strategy docs and the gtm goals' numbers. period narrows it.",
    schema:{type:"object",properties:{project:{type:"string",description:READ_PROJECT_RULE},period:{type:"string",enum:["quarter","month","all"],description:"default all"},eval:{type:"boolean",description:"include the test suites' rows"}}} },
  { name:"goals", title:"Goals", owner:false, project:true, desc:"The project's goal tree: each goal's status, how far it moved, what fed it, its checks and its budget, added up the tree per currency. ref answers one goal with the filings that name it and its children; period narrows the numbers.",
    schema:{type:"object",properties:{project:{type:"string",description:READ_PROJECT_RULE},ref:{type:"string",description:"one goal's id"},period:{type:"string",enum:["quarter","month","all"],description:"default all"},eval:{type:"boolean",description:"include the test suites' rows"}}} },
  { name:"decisions", title:"Decisions", owner:false, project:true, desc:"The project's questions as the Decisions tab shows them: who owes each answer, the options, the ruling (who ruled it, and when) and what was filed on it. qid answers one question; status, severity and area filter; sort decided puts the latest ruling first and limit cuts the list.",
    schema:{type:"object",properties:{project:{type:"string",description:READ_PROJECT_RULE},qid:{type:"string",description:"one question"},status:{type:"string",enum:["open","in-force","superseded","countered"]},severity:{type:"string"},area:{type:"string"},sort:{type:"string",enum:["decided"],description:"the latest ruling first"},limit:{type:"integer",minimum:1,maximum:500,description:"at most this many rows"},eval:{type:"boolean",description:"include the test suites' rows"}}} },
  { name:"map", title:"Map", owner:false, project:true, desc:"One plane of the project's Map: arch (the default), data (table: the one inspected), api, mcp, flows or deps, or screens (surface: one app) with their renders. ref answers one node with its light, checks and edges (gap: the n-th open gap).",
    schema:{type:"object",properties:{project:{type:"string",description:READ_PROJECT_RULE},plane:{type:"string",enum:["arch","data","api","mcp","flows","deps","screens"],description:"default arch"},ref:{type:"string",description:"one node: screen:<id>, door:<method>:<path>, table:<name>, goal/<id> …"},gap:{type:"integer",minimum:1,description:"the n-th open gap"},table:{type:"string",description:"plane data: the table to inspect"},surface:{type:"string",description:"plane screens: the app (a screen node's data.surface)"}}} },
  { name:"broadcast", title:"Broadcast", owner:false, project:true, desc:"The org's shelf of published skills, agents and workflows, the built-in starter items, what this project has equipped and your drafts, each with where the project stands on it. Publishing and equipping are `publish` and `equip`.",
    schema:{type:"object",properties:{project:{type:"string",description:READ_PROJECT_RULE},eval:{type:"boolean",description:"include the test suites' rows"}}} },
  { name:"versions", title:"Versions", owner:false, project:true, desc:"The project's versions: why each exists, the current one, and what changed in each. v reads one; head: true answers only the current head.",
    schema:{type:"object",properties:{project:{type:"string",description:READ_PROJECT_RULE},v:{type:"string",description:"a version's number (12 or v12)"},cause:{type:"string",enum:["all","published","restored"]},head:{type:"boolean",description:"only the current head"}}} },
  // ---- files ----
  { name:"save_file", title:"Save a file", owner:false, write:true, openWorld:true, desc:"Saves a document or an HTML dump (content, title, group) and answers its id and a link you can cite; public: true serves it on the open web to anyone with the link, signed in or not. A picture of a screen is a render, filed through preview, not a file.",
    schema:{type:"object",required:["content","title"],properties:{
      content:{type:"string"},title:{type:"string"},group:{type:"string",description:"which part of the system it belongs to"},public:{type:"boolean",description:"serve it at its link with no key"},
      screens:{type:"string",description:"comma-separated ids of the screens it shows, kept as text"},
      states:{type:"string",description:"comma-separated state names"}}} },
  { name:"read_file", title:"Read a file", owner:false, desc:"Reads a saved file by id (meta: true for who saved it and when instead of its content), or with no id lists the files you may read (q, group, limit).",
    schema:{type:"object",properties:{id:{type:"string"},meta:{type:"boolean"},q:{type:"string"},group:{type:"string"},limit:{type:"integer",description:"with no id: at most this many (default 50, max 200)"}}} },
  // ---- agents ----
  { name:"publish", title:"Publish to Broadcast", owner:false, write:true, idempotent:true, desc:"Publishes one of your own drafts (id: a contribution of kind item) to the org's shelf as its next version. Without confirm it answers the preview and publishes nothing; confirm: true publishes, publishOnConfirm: true asks the person first (a client that declared elicitation). A Partner may not publish.",
    schema:{type:"object",required:["id"],properties:{id:{type:"string",description:"your draft's id (`broadcast` lists yours)"},confirm:{type:"boolean",description:"true publishes; left out, the preview"},publishOnConfirm:{type:"boolean",description:"true: a client that declared elicitation asks the person to confirm, and publishes on yes"},eval:{type:"boolean",description:"marks a suite row"}}} },
  { name:"equip", title:"Equip from Broadcast", owner:false, write:true, idempotent:true, destructive:true, desc:"Equips a shelf item (slug, or preset:<slug> for a starter item) into a project at version v, or updates it to that version. Without confirm it answers the preview; confirm: true equips, equipOnConfirm: true asks the person first (a client that declared elicitation). Anyone seated on the project but a Partner.",
    schema:{type:"object",required:["slug","v"],properties:{slug:{type:"string",description:"the item's slug, or preset:<slug>"},v:{type:"integer",minimum:1,description:"the version to equip"},project:{type:"string",description:"the project to equip into (left out: yours)"},confirm:{type:"boolean",description:"true equips; left out, the preview"},equipOnConfirm:{type:"boolean",description:"true: a client that declared elicitation asks the person to confirm, and equips on yes"},eval:{type:"boolean",description:"marks a suite row"}}} },
  // ---- admin ----
  { name:"create_project", title:"Create a project", owner:true, write:true, idempotent:true, destructive:true, desc:"Admin only. Creates a project (key: a-z, 0-9 and dashes; name), or makes an archived one active again, and answers its first checklist items with their calls. Seats stay on Control.",
    schema:{type:"object",required:["key","name"],properties:{key:{type:"string",description:"a-z, 0-9 and dashes, 2 to 40 characters"},name:{type:"string",description:"its name on screen, at most 80 characters"},eval:{type:"boolean",description:"a test run's own project"}}} },
  { name:"publish_version", title:"Publish a version", owner:true, write:true, project:true, desc:"Owner only. Keeps a snapshot of the project's whole knowledge as version n+1, with a title that says why it exists. Nothing on screen changes; restore_version brings it back.",
    schema:{type:"object",required:["title"],properties:{project:{type:"string",description:PROJECT_ARG},title:{type:"string",description:"why this version exists"},eval:{type:"boolean",description:"marks a suite row"}}} },
  { name:"restore_version", title:"Restore a version", owner:true, write:true, project:true, idempotent:true, destructive:true, desc:"Owner only. Makes the project's knowledge that version's (v) on every screen; what it holds now is kept as a version first, named in `kept`. Refused already_current or unknown_version.",
    schema:{type:"object",required:["v"],properties:{project:{type:"string",description:PROJECT_ARG},v:{type:"string",description:"its number (12 or v12)"},eval:{type:"boolean",description:"marks a suite row"}}} },
];

// ORG_ARG — sprint 7, 7.5a (PLATFORM §2 items 8 and 9: one /mcp; "a call switches between" the orgs): EVERY tool takes the
// optional `orgSlug`, the org the call acts in (stateless: nothing is kept on the grant). An ACCOUNT grant acts as its account's
// seat there, with that seat's role; any other credential names one seat, so it may name only that seat's org; any other org
// is refused org_unreachable before anything runs (src/mcp.js orgArgRefused), the same answer whether that org exists or not.
// Declared in contracts/door.declared.json (orgArgument); every row of the registry carries it, so tools/list, the Map's mcp
// plane and the attack suite's argument sets all see it.
const ORG_ARG = { type: "string", description: "the org to act in: one of whoami's orgs (its slug); left out, your current org" };
// sprint 19: each write tool's REST door: the tool's name, hyphenated, under /preview/ (the preview it files; a first segment the
// registry already reserves, src/orgnames.js, so no org's path name moves). restWriteTool(path) -> the tool a path files with, or null
const restWriteTool = (path) => (path.startsWith("/preview/") && WRITE_TOOL_NAMES.find((t) => path.slice("/preview/".length) === t.replace(/_/g, "-"))) || null;
for (const t of MCP_TOOLS) t.schema = { ...t.schema, properties: { ...(t.schema.properties || {}), orgSlug: ORG_ARG } };

// MCP surface (callTool · rpc/rpcErr/asText · hasWriteScope/WRITE_SCOPE · the /mcp handler)
// moved to src/mcp.js (M-ADR-008a phase 2b). MCP_TOOLS stays above — check-mcp-parity.py reads it here.

// /health's one row (sprint 6, 6.3: the platform's, read off the schema; it names nothing of any org)
const HEALTH_SQL = "SELECT 1 AS up FROM sqlite_master LIMIT 1";
// the contract's ETag (GET /contract): the body is a module constant, so its hash is computed once per isolate
let contractEtag = null;

const ABOVE_ROUTES = [
    // ---- public ----
  {
    test: (path, method) => path === "/health",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      // d1: a one-row probe so a data-store outage (the daily read budget, scar 2026-09-05) reads as
      // "quota" here instead of a bare 500 on every authenticated page while health stays green.
      let d1 = "ok";
      // must READ A ROW — `SELECT 1` reads none and sails through a row-read quota (measured 2026-09-05). sprint 6, 6.3: a
      // platform check only — the row is the schema's own (sqlite_master), never an org's: no person, no project, no org row
      try { await db(env).prepare(HEALTH_SQL).first(); } catch (e) { d1 = isD1Quota(e) ? "quota" : "error"; }
      const out = { ok: d1 === "ok", version: VERSION, d1 };
      // versionId / versionTag (batch:ship-canary-pin): WHICH deployed version answered this request, read off the
      // version_metadata binding — tools/ship.sh proves its preview, pinned-canary and 100% smokes by it. The FULL id
      // (deployMetaFrom's is cut to 8 for the Machines card); both keys are omitted when the binding is absent, never guessed.
      const meta = env.CF_VERSION_METADATA;
      if (meta && meta.id) { out.versionId = String(meta.id); if (meta.tag) out.versionTag = String(meta.tag); }
      return json(out);
    },
  },
    // ---- login: email + password -> your key ----
  {
    test: (path, method) => path === "/login" && method === "GET",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      // the brand (sprint 7, 7.4b: signInBrandOf): the org whose address `next` names, else the platform's own — never org 1's
      // by default. `?direct=1` (the retired launcher's opt-out, Q6FA72180) is a harmless no-op.
      const next = url.searchParams.get("next") || "";
      return new Response(renderLogin({ next, brand: await signInBrandOf(env, url.origin, next) }), { headers: { "content-type": "text/html; charset=utf-8" } });
    },
  },
  {
    test: (path, method) => path === "/logout",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      // Signing out lands on this org's own sign-in page. (The retired launcher's return to ITS
      // /logout, M-ADR-024, was deleted with it — Q6FA72180, 2026-09-27.)
      const to = "/login";
      // REVOKE the session row, not just the cookie (security review 2026-09-05, finding 4): a
      // cleared cookie whose token stayed live for 90 days was a sign-out in name only.
      const tok = sessionCookieToken(request);
      if (tok) { try { await db(env).prepare("UPDATE tokens SET revoked = 1 WHERE token_hash = ?").bind(await sha256(tok)).run(); } catch {} }
      return new Response(null, { status: 302, headers: { "location": to, "set-cookie": `${SESSION_COOKIE}=; ${SESSION_COOKIE_ATTRS}; Max-Age=0` } });
    },
  },
    // ---- POST /project — the picker/switcher stamp (ADR-100 §1: session-stamped carrier). ----
    // Cookie-aware (unlike the resolveAny section below): the picker is the browser flow.
    // The stamp rides the tokens row; a raw owner-key caller has no session row to
    // stamp — that is an honest no_session, not a silent success. key="" = the org
    // rollup view (owner only), stored as the '*' sentinel so "picked the org" and
    // "never picked" stay distinguishable (the picker re-shows only for the latter).
  {
    test: (path, method) => path === "/project" && method === "POST",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      const reader = await resolveReader(request, env, url, {}).catch(() => null);
      const ct = request.headers.get("content-type") || "";
      const isForm = ct.includes("form");
      if (!reader) return signInOr401(request, url, "/");
      if (csrfRefused(request, url, reader)) return json({ error: "cross_origin_session_write" }, 403);
      let key = "";
      if (isForm) { const fd = await request.formData().catch(() => null); key = fd ? String(fd.get("key") || "") : ""; }
      else { const b = await request.json().catch(() => ({})); key = String(b.key || ""); }
      key = keyInOrg(readerOrg(env), key.toLowerCase().trim());   // sprint 6 (6.2): a slug names a project of the reader's org
      let stamp;
      if (key === "") {
        if (reader.role !== "owner") return isForm
          ? new Response("The org rollup view is owner-only.", { status: 403 })
          : json({ error: "owner_only", note: "The org rollup view is owner-only (ADR-100 §3)." }, 403);
        stamp = "*";
      } else {
        const seats = await projectSeatsFor(reader.id, env);
        let ok = seats.some((s) => s.key === key);
        if (!ok && reader.role === "owner") {
          try { ok = !!(await db(env).prepare("SELECT key FROM projects WHERE key = ? AND active = 1 AND org = {org}").bind(key).first()); } catch {}
        }
        if (!ok) return isForm
          ? new Response("Not one of your projects.", { status: 403 })
          : json({ error: "project_forbidden", project: key, seats: seats.map((s) => s.key) }, 403);
        stamp = key;
      }
      // find the session token this request rode in on — bearer first, cookie second
      const header = request.headers.get("authorization") || "";
      let tok = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      if (!tok) tok = sessionCookieToken(request);
      let changed = 0;
      if (tok) {
        try {
          const res = await db(env).prepare("UPDATE tokens SET project = ? WHERE token_hash = ? AND revoked = 0").bind(stamp, await sha256(tok)).run();
          changed = res?.meta?.changes ?? 0;
        } catch { changed = 0; }
      }
      if (!changed) return json({ error: "no_session",
        note: "The active project rides the session token; a raw personal key has no session to stamp. Sign in (web/CLI) or pass project per call at the door." }, 400);
      if (isForm) return new Response(null, { status: 302, headers: { location: orgPath("/home") } });
      return json({ project: stamp === "*" ? null : stamp, org: stamp === "*" });
    },
  },
    // ---- /profile — the person's own page: identity + standing trace consent (ADR-102). ----
    // Cookie-aware like /project (the browser flow; bearer works too). Deliberately NOT readOnlyOk: the read-only credential
    // never flips anyone's consent. Self-service ONLY — /control shows the choice, never sets it.
  {
    test: (path, method) => path === "/profile" && method === "GET",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      const reader = await resolveReader(request, env, url, {}).catch(() => null);
      if (!reader) return signInOr401(request, url, orgPath("/profile"));
      const [consent, seats, tenant] = await Promise.all([
        consentOf(reader.id, env), projectsHeldBy(reader, env), getTenantConfig(env),
      ]);
      // M-ADR-019: if this reader's role is mandated, tell them plainly (transparent,
      // never hidden). mandateFloorFor returns "off" when no mandate applies.
      const mandateFloor = mandateFloorFor(reader, tenant);
      const saved = url.searchParams.get("saved");
      const content = renderProfilePage({ person: reader, seats, consent,
        mandateFloor, saved: saved === "1", savedProfile: saved === "profile", brand: tenant.brand, origin: url.origin,
        secret: String(url.searchParams.get("secret") || "").replace(/[^a-z]/g, "").slice(0, 20) });
      return servePage(env, { active: "profile", content, owner: reader.role === "owner", reader, cache: "private, no-store", tenant });
    },
  },
  {
    test: (path, method) => path === "/profile" && method === "POST",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      const reader = await resolveReader(request, env, url, {}).catch(() => null);
      const pct = request.headers.get("content-type") || "";
      const pForm = pct.includes("form");
      if (!reader) return signInOr401(request, url, orgPath("/profile"));
      if (csrfRefused(request, url, reader)) return json({ error: "cross_origin_session_write" }, 403);
      let consent = "";
      let isEval = false;
      let action = "set-consent", current = "", password = "";
      // migrate-044: set-profile — the person's own hats (the seven, src/hats.js) and avatar (a tone and up to three initials)
      let hatsIn = [], toneIn = "", initialsIn = "";
      if (pForm) { const fd = await request.formData().catch(() => null); consent = fd ? String(fd.get("consent") || "") : ""; action = fd ? String(fd.get("action") || "set-consent") : "set-consent"; current = fd ? String(fd.get("current") || "") : ""; password = fd ? String(fd.get("password") || "") : "";
        hatsIn = fd ? fd.getAll("hat").map(String) : []; toneIn = fd ? String(fd.get("tone") || "") : ""; initialsIn = fd ? String(fd.get("initials") || "") : ""; }
      else { const b = await request.json().catch(() => ({})); consent = String(b.consent || ""); isEval = !!b.eval || url.searchParams.get("eval") === "1"; action = String(b.action || "set-consent"); current = String(b.current || ""); password = String(b.password || "");
        hatsIn = Array.isArray(b.hats) ? b.hats.map(String) : []; toneIn = String((b.avatar && b.avatar.tone) || ""); initialsIn = String((b.avatar && b.avatar.initials) || ""); }
      if (action === "set-profile") {
        // your own row only (reader.id, resolved as above: never the read-only credential, CSRF checked);
        // a hat outside the seven is refused, never dropped silently; no hat is a valid choice (the hats clear)
        const unknown = hatsIn.map((h) => h.trim().toLowerCase()).filter((h) => h && !HAT_KEYS.includes(h));
        if (unknown.length) return pForm ? new Response("Unknown hat.", { status: 422 }) : json({ error: "bad_hat", hats: unknown.slice(0, 6), allowed: HAT_KEYS }, 422);
        const hats = hatsJson(hatsIn), avatar = avatarValue(toneIn, initialsIn);
        await db(env).prepare("UPDATE people SET hats = ?, avatar = ? WHERE id = ?").bind(hats, avatar, reader.id).run();
        clearReqMemo(env);   // this request's reader is read again with its new hats
        // the trail: what a person says they wear is auditable, like consent (it never widens what they read: migrate-045)
        await db(env).prepare(
          "INSERT INTO events (id, session_id, person_id, kind, payload_json, created_at, org) VALUES (?,?,?,?,?,?,{org})"
        ).bind(uid(), null, reader.id, "profile", JSON.stringify({ hats: hatsOf(hats), surface: "/profile", ...(isEval ? { eval: true } : {}) }), now()).run().catch(() => {});
        if (pForm) return new Response(null, { status: 302, headers: { location: orgPath("/profile?saved=profile") } });
        return json({ hats: hatsOf(hats), avatar: avatar || null });
      }
      // the self-service secrets (src/secrets.js): re-authenticated with the CURRENT secret; the lockout applies
      if (SECRET_ACTIONS.includes(action)) {
        // the credential this request rode in on (its session cookie, else its bearer): an ACCOUNT passphrase change ends every
        // other session of the account and keeps this one (src/secrets.js, the review's A2)
        const rode = (request.headers.get("authorization") || "").startsWith("Bearer ") ? request.headers.get("authorization").slice(7).trim() : sessionCookieToken(request);
        const r = await runSecretAction({ env, reader, action, current, password, isEval, keepHash: rode ? await sha256(rode) : null });
        if (!pForm) return json(r.code === "key" ? { ok: true, code: r.code, key: r.key } : { ok: r.status === 200, code: r.code }, r.status);
        if (r.code !== "key") return new Response(null, { status: 302, headers: { location: orgPath(`/profile?secret=${r.code}`) } });
        // a new key is shown ONCE: render the page from this response, never via a redirect
        const [pc, ps, pt] = await Promise.all([consentOf(reader.id, env), projectsHeldBy(reader, env), getTenantConfig(env)]);
        const content = renderProfilePage({ person: reader, seats: ps, consent: pc, mandateFloor: mandateFloorFor(reader, pt), brand: pt.brand, origin: url.origin, newKey: r.key });
        return servePage(env, { active: "profile", content, owner: reader.role === "owner", reader, cache: "private, no-store", tenant: pt });
      }
      consent = consent.toLowerCase().trim();
      if (!CONSENT_GRADES.includes(consent)) return pForm
        ? new Response("Unknown consent grade.", { status: 422 })
        : json({ error: "bad_consent", allowed: CONSENT_GRADES }, 422);
      await db(env).prepare("UPDATE people SET trace_consent = ? WHERE id = ?").bind(consent, reader.id).run();
      // events trail: the consent CHANGE is auditable; the payload names the new grade
      // only — nothing about what may later be captured under it rides this row.
      // kind "consent" is server-side only (the "pr" precedent — not in the validated
      // /event kind set, so it can never be posted directly).
      await db(env).prepare(
        "INSERT INTO events (id, session_id, person_id, kind, payload_json, created_at, org) VALUES (?,?,?,?,?,?,{org})"
      ).bind(uid(), null, reader.id, "consent", JSON.stringify({ traceConsent: consent, surface: "/profile", ...(isEval ? { eval: true } : {}) }), now()).run().catch(() => {});
      if (pForm) return new Response(null, { status: 302, headers: { location: orgPath("/profile?saved=1") } });
      return json({ consent });
    },
  },
  {
    test: (path, method) => path === "/login" && method === "POST",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      const ct = request.headers.get("content-type") || "";
      // LOGIN-CSRF guard (heal round 1, QC74D4892 verifier finding, 2026-09-22) — checked FIRST,
      // before the body is even read. Until 2026-09-22 only the retired launcher (frame.js, deleted
      // 2026-09-27, Q6FA72180) refused a cross-site sign-in POST; an org reached directly — the only
      // shape now — must refuse it itself. csrfRefused() (core.js) cannot cover this: it only fires
      // for an ALREADY-authenticated cookie session, which does not exist during a login attempt.
      // crossSiteLogin lives in src/util.js. A script client (curl, the suites) sends neither
      // Sec-Fetch-Site nor Origin and is unaffected.
      if (crossSiteLogin(request, url)) {
        return ct.includes("form")
          ? new Response(renderLogin({ error: "Cross-site sign-in refused." }), { status: 403, headers: { "content-type": "text/html; charset=utf-8" } })
          : json({ error: "cross_site_login" }, 403);
      }
      let body = {};
      if (ct.includes("form")) {
        const fd = await request.formData().catch(() => null);
        if (fd) body = { email: fd.get("email"), password: fd.get("password"), web: fd.get("web"), next: fd.get("next"), org: fd.get("org"), device: "web" };
      } else {
        body = await request.json().catch(() => ({}));
      }
      const isWeb = !!body.web;
      const loginBrand = isWeb ? await signInBrandOf(env, url.origin, body.next) : undefined; // the error re-renders: the page's own brand (7.4b)
      // per-IP FLOOD FILTER (M-ADR-033, corrected by M-ADR-035: the binding is best-effort and never tripped under
      // test; the per-account lockout below is the credential defense on this door): the LOGIN_LIMIT Rate Limiting
      // binding, keyed by address (IPv6 by /64), fail-open but logged; the per-account lockout below (sprint 7, 7.1:
      // src/accounts.js) stays the credential defense.
      {
        const over = await addressFlooded(request, env);
        if (over) return isWeb
          ? new Response(renderLogin({ error: "Too many sign-in attempts from this address. Wait a minute and try again.", next: body.next, brand: loginBrand }), { status: 429, headers: { "content-type": "text/html; charset=utf-8", "retry-after": "60" } })
          : json({ error: "too_many_attempts_ip", retryAfterSeconds: 60 }, 429);
      }
      // sprint 7 (7.1, PLATFORM §2.8): the ACCOUNT the email names (one per email), its lockout (8 failures in 15 minutes on
      // the account); 7.4 (the front door by path): the sign-in lives at the root, so its org is CHOSEN — the org `next` names
      // (/<org>/…) when the account holds a seat there, else its org-1 seat, else its first (src/accounts.js passphraseSignIn).
      // The account's passphrase signs in an ACCOUNT session (it reads, under any org's address, as the account's seat
      // there); a seat's own secret a SEAT session (that seat only). A right passphrase with no seat anywhere signs in nothing.
      // the review's A1: an account in several orgs is never signed in to one it did not choose — `org` (its path name) or the org
      // `next` names is the person's choice; else a browser lands on the picker and a JSON answer asks (409 choose_org) — and so
      // does one whose account has a seat waiting for its yes (the owner, 2026-10-09: `waits`, never its one active seat by default)
      const signin = await passphraseSignIn(env, url, { email: body.email, password: body.password, prefer: await preferOrgOf(env, url.origin, body.next),
        pick: typeof body.org === "string" ? body.org : "", client: await clientOf(request) });   // 8.3a: the lockout's key (the caller's address)
      if (signin.verdict === "locked") return isWeb
        ? new Response(renderLogin({ error: "Too many attempts. Wait 15 minutes and try again.", next: body.next, brand: loginBrand }), { status: 429, headers: { "content-type": "text/html; charset=utf-8", "retry-after": "900" } })
        : json({ error: "too_many_attempts", retryAfterMinutes: 15 }, 429);
      if (signin.verdict === "no_seat_here") return isWeb
        ? new Response(renderLogin({ error: NO_SEAT_HERE_WORDS, next: body.next, brand: loginBrand }), { status: 403, headers: { "content-type": "text/html; charset=utf-8" } })
        : json({ error: "no_seat_here", note: NO_SEAT_HERE_WORDS }, 403);
      if (!isWeb && signin.verdict === "ok" && signin.session === "account" && (signin.ask || signin.waits || signin.pickMissed || signin.pendingOnly)) {
        await countSignIn(env, signin, true);   // the account's passphrase was right: nothing is minted until the person names the org
        return signin.ask || signin.waits ? json({ error: "choose_org", orgs: signin.orgs || [], note: chooseOrgWords(signin) }, 409)
          : json({ error: "no_seat_here", note: signin.pendingOnly ? PENDING_ONLY_WORDS : NO_SEAT_HERE_WORDS }, 403);
      }
      const person = signin.seat;
      let ok = signin.verdict === "ok" && !!person;
      // mint a session token — this is the credential, nobody pastes keys any more. U-REISSUE (N1): the INSERT is conditional
      // on the hashes read ABOVE, before the pbkdf2 wait (src/accounts.js LOGIN_SESSION_SQL, mintSession): a Reissue (rotate-key), the
      // holder's rotate-my-key or a passphrase change that lands inside that wait leaves zero rows, and zero rows is a failed
      // sign-in — the same 401 as a wrong passphrase, the attempt counted as failed. Fail-closed: an answer that does not
      // report one row mints nothing. One session per sign-in, on the account's seat at this address.
      const token = SESSION_TOKEN_PREFIX + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      const tHash = await sha256(token);
      const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      if (ok) {
        // sprint 6 (6.2): the session lands in the org of the seat whose secret just checked (src/data.js signInEnv, inside
        // src/accounts.js mintSession), whatever the ambient cookie names
        const minted = await mintSession(env, signin, { tokenHash: tHash, device: String(body.device || "unknown").slice(0, 80), at: now(), expires });
        ok = ((minted && minted.meta && minted.meta.changes) || 0) >= 1;
      }
      await countSignIn(env, signin, ok);   // the org the sign-in chose, on the account (sprint 7, 7.4)
      if (!ok) return isWeb
        ? new Response(renderLogin({ error: "That email and passphrase do not match.", next: body.next, brand: loginBrand }), { status: 401, headers: { "content-type": "text/html; charset=utf-8" } })
        : json({ error: "invalid_login" }, 401);
      if (isWeb) {
        // open-redirect guard (readiness security pass): reject protocol-relative "//evil.com"
        // (a "/"-prefixed value that browsers follow off-site) — the same !startsWith("//") guard
        // /view already applies. Only a same-origin absolute path is a valid post-login destination.
        // The landing (sprint 7, 7.4b: landingFor): next when it names an org this session reaches (or a root path); else the
        // org picker for an account session in several orgs, else the chosen seat's org, /<its slug>.
        // The guard is the URL parser itself, not a prefix test (security review 2026-09-05,
        // finding 3): `/\evil.com`, `/\t/evil.com`, `/\@evil.com` all pass startsWith("/") &&
        // !startsWith("//") yet resolve off-site in every browser. Resolving against our own
        // origin and requiring the origin to survive is the only test that matches the browser.
        const next = await landingFor(env, url.origin, signin, body.next);
        return new Response(null, { status: 302, headers: {
          "location": next,
          "set-cookie": `${SESSION_COOKIE}=${token}; ${SESSION_COOKIE_ATTRS}; Max-Age=${90 * 24 * 60 * 60}`,
        } });
      }
      return json({
        person: person.name, role: person.role, title: person.title,
        token, expiresAt: expires,
        note: "Save this token. Send it as: Authorization: Bearer <token>. It lasts 90 days.",
      });
    },
  },
    // ---- sign-up by allowlist (sprint 7, 7.2; docs/plan/PLATFORM.md §2 item 10): the operator allowed an email and handed its
    // one-time code over by hand (tools/operator.mjs); the person brings both and a passphrase. No email is ever sent. ----
  {
    test: (path, method) => path === "/signup" && method === "GET",
    run: async (c) => {
      const { env, url } = c;
      const tenant = await getTenantConfig(env);
      const html = url.searchParams.get("via") === "invite" ? renderInvite({ brand: tenant.brand }) : renderSignup({ brand: tenant.brand });   // 12.3: the invite link's page
      // the invite link's page sends no Referer anywhere (sprint 12's review; src/invite.js INVITE_HEADERS: its redemption's answers too)
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...(url.searchParams.get("via") === "invite" ? INVITE_HEADERS : {}) } });
    },
  },
  {
    test: (path, method) => path === "/signup" && method === "POST",
    run: async (c) => {
      const { request, env, url } = c;
      const ct = request.headers.get("content-type") || "";
      const isForm = ct.includes("form");
      const page = async (status, error, email = "", extra = {}) => new Response(renderSignup({ error, email, brand: (await getTenantConfig(env)).brand }),
        { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...extra } });
      // the same-origin guard as POST /login (src/util.js crossSiteLogin), FIRST: a cross-site form never reaches the code check
      if (crossSiteLogin(request, url)) return isForm ? page(403, "Cross-site sign-up refused.") : json({ error: "cross_site_signup" }, 403);
      let body = {};
      if (isForm) {
        const fd = await request.formData().catch(() => null);
        if (fd) body = { email: fd.get("email"), code: fd.get("code"), password: fd.get("password"), confirm: fd.get("confirm"), web: fd.get("web"), via: fd.get("via"), invite: fd.get("invite") };
      } else {
        body = await request.json().catch(() => ({}));
        if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
      }
      const isWeb = isForm || !!body.web;
      const typed = typeof body.email === "string" ? body.email.trim().slice(0, 254) : "";
      // the address's flood filter, the budget POST /login spends too (addressFlooded)
      if (await addressFlooded(request, env)) return isWeb
        ? page(429, "Too many attempts from this address. Wait a minute and try again.", typed, { "retry-after": "60" })
        : json({ error: "too_many_attempts_ip", retryAfterSeconds: 60 }, 429);
      // sprint 12, 12.3: an org's invite link (after the same-origin guard and the flood filter; src/invite.js)
      if (isInviteBody(body)) return inviteSignup({ request, env, url, body, isWeb });
      // the fields, before anything is read (nothing here depends on which emails are allowed)
      const field = signupProblem({ email: body.email, code: body.code, password: body.password, confirm: isWeb ? (body.confirm ?? "") : body.confirm });
      if (field === "email_ascii") return isWeb ? page(422, EMAIL_NOT_ASCII_WORDS, typed) : json({ error: "email_not_ascii", field: "email", note: EMAIL_NOT_ASCII_WORDS }, 422);   // A5
      if (field) return isWeb ? page(422, SIGNUP_FIELD_WORDS[field], typed) : json({ error: "bad_signup", field, note: SIGNUP_FIELD_WORDS[field] }, 422);
      // the email's open code, compared in constant time, spent in the one batch that writes the account (src/accounts.js signUp)
      const r = await signUp(env, url, { email: body.email, code: body.code, password: body.password, client: await clientOf(request) });   // its session (if any): the account's, on its chosen seat (7.4)
      if (r.verdict === "locked") return isWeb
        ? page(429, "Too many attempts. Wait 15 minutes and try again.", typed, { "retry-after": "900" })
        : json({ error: "too_many_attempts", retryAfterMinutes: 15 }, 429);
      if (r.verdict !== "ok") return isWeb ? page(401, SIGNUP_REFUSED_WORDS, typed) : json({ error: "invalid_signup", note: SIGNUP_REFUSED_WORDS }, 401);
      // signed up: a session on the account's seat in the org this address serves (the same conditional mint as POST /login),
      // else signed in to nothing (no seat here: a new person; creating an org is slice 7.3)
      // the review's A1: a JSON sign-up never names an org for the person — with several active seats, or only seats waiting for
      // its yes, it signs in nothing (a browser's lands on the picker, where the person picks or answers); and with one active seat
      // while another seat waits for its yes (the owner, 2026-10-09: `waits`), it signs in nothing too
      let token = null, expires = null;
      if (r.seat && (isWeb || !(r.ask || r.waits || r.pendingOnly))) {
        token = SESSION_TOKEN_PREFIX + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
        expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
        const minted = await mintSession(env, r, { tokenHash: await sha256(token), device: isWeb ? "web" : String(body.device || "unknown").slice(0, 80), at: now(), expires });
        if (((minted && minted.meta && minted.meta.changes) || 0) < 1) token = null;   // a rotate landed meanwhile: signed up, not signed in
      }
      const note = token ? "Signed up and signed in. Save this token: send it as Authorization: Bearer <token>. It lasts 90 days."
        : r.ask || r.waits ? `Signed up. ${chooseOrgWords(r)} (POST /login)`
        : r.pendingOnly ? `Signed up. ${PENDING_ONLY_WORDS}`
        : r.seat ? "Signed up. Sign in with your email and the new passphrase."
        : "Signed up. Your account holds no seat in any org yet: creating your own org is the next step (POST /orgs; the page: /orgs/new).";
      // sprint 21, 21.2 (the owner's "prefills the org at sign-up"): a form that signed up an account with no seat answers the
      // create-an-org page itself, its email as typed and, from the email's newest APPROVED request for a place, the org's name
      // (its company) and your name. The code just proved that email (signUp's ok, r.email), which is what makes the read the
      // person's own; a failed read fills in only the email. Never the passphrase.
      if (isWeb && !token && !r.seat) {
        const p = await approvedProfile(env, r.email).catch(() => null);
        const values = { email: typed, ...(p ? { name: p.company.slice(0, ORG_NAME_MAX), you: p.name.slice(0, ORG_NAME_MAX) } : {}) };
        return new Response(renderOrgNew({ host: url.host, values }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
      }
      if (isWeb) return token
        ? new Response(null, { status: 302, headers: { location: await landingOf(env, r), "set-cookie": `${SESSION_COOKIE}=${token}; ${SESSION_COOKIE_ATTRS}; Max-Age=${90 * 24 * 60 * 60}` } })
        : new Response(null, { status: 302, headers: { location: "/login" } });
      return json({ account: r.how, signedIn: !!token, ...(token ? { person: r.seat.name, role: r.seat.role, title: r.seat.title, token, expiresAt: expires } : {}), note });
    },
  },
    // ---- request access (sprint 21, 21.1; src/requestaccess.js, migrate-081): the beta's first step, before any account or org. Public
    // (no session), at the platform's root only (src/orgpath.js PLATFORM_PATHS). A new request is answered with a 303 to its private
    // link; a repeat for an email whose request is open changes nothing and is sent to the asked page (the owner's ruling,
    // 2026-10-13: the first request stands; that an email asked is said, which the owner accepted); one the honeypot drops gets a
    // link that opens nothing. Nothing reads accounts: an answer never says whether an email holds one ----
  {
    test: (path, method) => path === "/request-access" && method === "GET",
    run: async (c) => new Response(renderRequestAccess({ brand: (await getTenantConfig(c.env)).brand }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }),
  },
  {
    test: (path, method) => path === "/request-access" && method === "POST",
    run: async (c) => {
      const { request, env, url } = c;
      const ct = request.headers.get("content-type") || "";
      const isForm = ct.includes("form");
      const page = async (status, error, values = {}, extra = {}) => new Response(renderRequestAccess({ error, values, brand: (await getTenantConfig(env)).brand }),
        { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...extra } });
      // the same-origin guard as POST /login and POST /signup (src/util.js crossSiteLogin), FIRST: a cross-site form is never read
      if (crossSiteLogin(request, url)) return isForm ? page(403, "Cross-site request refused.") : json({ error: "cross_site_request_access" }, 403);
      let body = {};
      if (isForm) {
        const fd = await request.formData().catch(() => null);
        if (fd) for (const k of REQUEST_FIELDS) body[k] = fd.get(k);
      } else {
        body = await request.json().catch(() => ({}));
        if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
      }
      const isWeb = isForm || !!body.web;
      // what a form gets back when a field was wrong: the person's own strings (never the honeypot's), each cut short
      const kept = Object.fromEntries(REQUEST_FIELDS.filter((k) => k !== REQUEST_TRAP && typeof body[k] === "string").map((k) => [k, body[k].slice(0, 300)]));
      // the address's flood filter, the budget POST /login and POST /signup spend (addressFlooded)
      if (await addressFlooded(request, env)) return isWeb
        ? page(429, "Too many attempts from this address. Wait a minute and try again.", kept, { "retry-after": "60" })
        : json({ error: "too_many_attempts_ip", retryAfterSeconds: 60 }, 429);
      // the fields, before anything is written (src/requestaccess.js readRequest: nothing here depends on who asked before)
      const read = readRequest(body);
      if (read.field) return isWeb ? page(422, REQUEST_FIELD_WORDS[read.field], kept)
        : json({ error: "bad_request_access", field: read.field, note: REQUEST_FIELD_WORDS[read.field] }, 422);
      // the honeypot filled: a new request's answer, a link that opens nothing, nothing written; a repeat (null): the asked page
      const token = trapped(body) ? newRequestToken() : await fileRequest(env, read.request);
      return new Response(null, { status: 303, headers: { location: token ? `${REQUEST_PATH}/${token}` : REQUEST_ASKED_PATH, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    },
  },
  {
    // the repeat's page (a fixed path no token can be): it names nothing the request typed; the beta's count (sprint 21, 21.2:
    // public numbers, two aggregate statements; a failed read leaves the count out, never a guess)
    test: (path, method) => path === REQUEST_ASKED_PATH && method === "GET",
    run: async (c) => {
      const [tenant, count] = await Promise.all([getTenantConfig(c.env), betaCount(c.env).catch(() => null)]);
      return new Response(renderRequestAsked({ brand: tenant.brand, count }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    },
  },
  {
    test: (path, method) => path.startsWith("/request-access/") && method === "GET",
    run: async (c) => {
      const { env, path } = c;
      const brand = (await getTenantConfig(env)).brand;
      // the link's token is the path's last segment: read by its hash; any link that opens no request is the one 404
      const r = await requestByToken(env, path.slice("/request-access/".length));
      const headers = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" };
      if (!r) return new Response(renderRequestMissing({ brand }), { status: 404, headers });
      // sprint 21, 21.2: an OPEN request's place (one range count on the line index) and the beta's count (two aggregates), side
      // by side; an approved or declined one reads nothing more. A failed count is left out, never a guess.
      const [place, count] = r.status === "open" ? await Promise.all([placeInLine(env, r), betaCount(env).catch(() => null)]) : [null, null];
      return new Response(renderRequestReceived({ brand, request: r, place, count }), { headers });
    },
  },
    // ---- the org picker (sprint 7, 7.4b; docs/plan/PLATFORM.md §2 item 8: "sign-in lists the person's orgs"): the browser's
    // session at the root, where it signs no one in — only the orgs it reaches are read (src/core.js sessionPlace: an ACCOUNT
    // session's own account's seats; a SEAT session's one seat), never another account's, never a seat it could not open ----
  {
    test: (path, method) => path === "/orgs" && method === "GET",
    run: async (c) => {
      const { request, env, url } = c;
      const to = inOrgPath(url.searchParams.get("to") || "");
      const tok = request.headers.get("authorization") ? "" : sessionCookieToken(request);
      const place = tok ? await sessionPlace(tok, env) : null;
      // a bearer names one seat: the router's seam resolved it and set its org's base (only for a valid credential) —
      // straight to that org, as a seat session goes
      const base = !place && request.headers.get("authorization") ? orgBase() : "";
      if (base) return new Response(null, { status: 302, headers: { location: orgAt(base.slice(1), to), "cache-control": "private, no-store" } });
      if (!place) return signInOr401(request, url, undefined, { error: "auth_required", hint: "GET /orgs is the browser's org picker: sign in at /login. A bearer names one seat (GET /whoami)." });
      const go = (slug) => new Response(null, { status: 302, headers: { location: orgAt(slug, to), "cache-control": "private, no-store" } });
      // a SEAT session reaches its one seat, and a one-org account with no seat waiting its one org: straight in, never a picker
      const pending = place.pending || [];
      if (!place.account || (place.orgs.length === 1 && !pending.length)) return go(place.orgs[0].slug);
      const said = String(url.searchParams.get("seat") || "").replace(/[^a-z_]/g, "").slice(0, 20);
      return new Response(renderOrgPicker({ orgs: place.orgs, pending, to, host: url.host, said }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } });
    },
  },
    // ---- a seat waits for its holder's yes (sprint 7's review, A1; migrate-074): the picker's Accept and Decline. The holder's own
    // ACCOUNT session (the cookie: a SEAT session carries no account and answers nothing), same-origin only (the front door's
    // guard, src/util.js crossSiteLogin), ONE statement bound to the session's account (src/accounts.js answerSeat) ----
  {
    test: (path, method) => path === "/orgs/seat" && method === "POST",
    run: async (c) => {
      const { request, env, url } = c;
      const ct = request.headers.get("content-type") || "";
      const isForm = ct.includes("form");
      if (crossSiteLogin(request, url)) return isForm ? new Response("Cross-site request refused.", { status: 403 }) : json({ error: "cross_site_seat" }, 403);
      let seat = "", answer = "";
      if (isForm) { const fd = await request.formData().catch(() => null); seat = fd ? String(fd.get("seat") || "") : ""; answer = fd ? String(fd.get("answer") || "") : ""; }
      else { const b = await request.json().catch(() => ({})); seat = String((b && b.seat) || ""); answer = String((b && b.answer) || ""); }
      const tok = sessionCookieToken(request);
      if (!tok) return signInOr401(request, url, PICKER_PATH, { error: "auth_required", hint: "Accept or decline a seat from your org list: sign in at /login with your account's passphrase." });
      const r = await answerSeat(env, tok, seat.slice(0, 80), answer);
      if (isForm) return new Response(null, { status: 303, headers: { location: `${PICKER_PATH}?seat=${r.done || r.error}`, "cache-control": "private, no-store" } });
      return r.done ? json({ seat, answer: r.done }) : json({ error: r.error, note: SEAT_ANSWER_WORDS[r.error] }, r.error === "already_seated" ? 409 : 404);
    },
  },
    // ---- create an org (sprint 7, 7.3; docs/plan/PLATFORM.md §2 items 6, 8 and 9): an account holder, proven by the ACCOUNT's
    // passphrase, makes an org, its owner seat and its first project in one write (src/orgs.js createOrg: the authority argument).
    // The page belongs to the platform; the answer carries the owner's key ONCE (never a redirect, never a URL, never logged). ----
  {
    test: (path, method) => path === "/orgs/new" && method === "GET",
    run: async (c) => {
      const { url } = c;
      return new Response(renderOrgNew({ host: url.host }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    },
  },
  {
    test: (path, method) => path === "/orgs" && method === "POST",
    run: async (c) => {
      const { request, env, url } = c;
      const ct = request.headers.get("content-type") || "";
      const isForm = ct.includes("form");
      const page = (status, error, values = {}, extra = {}) => new Response(renderOrgNew({ error, values, host: url.host }),
        { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...extra } });
      // the same-origin guard as POST /login and POST /signup (src/util.js crossSiteLogin), FIRST: nothing read, nothing written
      if (crossSiteLogin(request, url)) return isForm ? page(403, "Cross-site request refused.") : json({ error: "cross_site_org" }, 403);
      let raw = {};
      if (isForm) {
        const fd = await request.formData().catch(() => null);
        if (fd) for (const k of ["email", "password", "name", "slug", "project", "projectName", "you", "web"]) raw[k] = fd.get(k);
      } else {
        raw = await request.json().catch(() => ({}));
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};
      }
      const isWeb = isForm || !!raw.web;
      const f = orgFields(raw);
      // what the page fills back in: never the passphrase
      const typed = { email: f.email, name: f.name, slug: f.slug, project: String(raw.project == null ? "" : raw.project).trim().slice(0, 64), you: String(raw.you == null ? "" : raw.you).trim().slice(0, 81) };
      const refuse = (r) => {
        const words = r.error === "bad_org" ? ORG_FIELD_WORDS[r.field] : ORG_WORDS[r.error];
        return isWeb ? page(r.status, words, typed, r.status === 429 ? { "retry-after": "900" } : {})
          : json({ error: r.error, ...(r.field ? { field: r.field } : {}), note: words }, r.status);
      };
      // the fields and the reserved names, before anything is read (and before the address's budget is spent: a malformed
      // request costs no sign-in attempt)
      const bad = orgFormProblem(f, RESERVED_ORG_NAMES);
      if (bad) return refuse(bad);
      if (await addressFlooded(request, env)) return isWeb
        ? page(429, "Too many attempts from this address. Wait a minute and try again.", typed, { "retry-after": "60" })
        : json({ error: "too_many_attempts_ip", retryAfterSeconds: 60 }, 429);
      const made = await createOrg(env, url, f, { client: await clientOf(request) });   // 8.3a: the lockout's key
      if (made.error) return refuse(made);
      if (isWeb) return new Response(renderOrgMade({ made, origin: url.origin }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
      return json({ org: made.org, project: made.project, person: made.person, key: made.key, mcp: `${url.origin}/mcp`, address: `${url.origin}/${made.org.slug}`,
        note: "Save the key now: it is shown once. It is your owner seat's own secret (its sign-in and its API key). The org's pages are at its address; your AI reaches the org at mcp with the key as its bearer." },
        200, { "cache-control": "no-store" });
    },
  },
  {
    test: (path, method) => path === "/" || path === "/home",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      if (path === "/") {
        // The picker (ADR-100 §4): shown ONLY to a cookie session with real choice and
        // no stamp yet — multi-seat, or an owner in a multi-project org. Everyone else
        // (SIRU today: single-seat roster, one project) auto-enters — 302 /home, the
        // exact response this route has always returned.
        const reader = c.gateReader || await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
        if (reader && reader.viaCookie && !reader.token_project) {
          const seats = await projectSeatsFor(reader.id, env);
          const isOwner = reader.role === "owner";
          const orgCount = isOwner ? await countActiveProjects(env) : 0;
          if (seats.length > 1 || (isOwner && orgCount > 1)) {
            const tenant = await getTenantConfig(env);
            const content = renderPicker({ projects: isOwner ? await projectsHeldBy(reader, env) : seats, orgEntry: isOwner, personName: reader.name, brand: tenant.brand });
            // #6 (readiness review, Wave 3): this used to pass proj:null, which also
            // zeroed servePage's hasChoice computation (proj drives BOTH the nav's
            // Projects entry and the topbar switcher chip) — so the picker page itself
            // hid the very nav item that reaches it. Omitting proj here lets servePage
            // compute it normally (the same cheap seats/orgCount check this handler just
            // ran), so the nav entry + chip render correctly on the picker too.
            return servePage(env, { active: "home", content, owner: isOwner, reader, cache: "private, no-store", tenant });
          }
        }
        return new Response(null, { status: 302, headers: { location: orgPath("/home") } });
      }
      // UI-B3: Home is ONE composed read (src/home.js readHomeSummary, at most five D1 statements in one parallel wave),
      // rendered in-process from the SAME call GET /home/summary and the MCP `home` tool answer, so the page and the
      // JSON cannot disagree. The gate resolved this reader (GATED_SURFACE); resolve here only if it is ever reached
      // without one (a reader is required: an unauthenticated visit was already sent to /login).
      const reader = c.gateReader || await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      if (!reader) return signInOr401(request, url);
      const isOwner = reader.role === "owner";
      const includeEval = url.searchParams.get("eval") === "1";
      const [tenant, summary] = await Promise.all([getTenantConfig(env), readHomeSummary(env, reader, url.searchParams)]);
      return servePage(env, { active: "home", changes: "home", lists: "home", content: renderHome(summary, { owner: isOwner, brand: tenant.brand, reader, eval: includeEval }),
        owner: isOwner, reader, tenant, includeEval, cache: "private, no-store" });
    },
  },
  { test: (path, method) => path === "/home/summary" && method === "GET",
    run: async (c) => {
      const { env, url } = c;
      const reader = c.gateReader;   // gated (GATED_SURFACE): resolved once, reused
      return json(await readHomeSummary(env, reader, url.searchParams), 200, { "cache-control": "private, no-store" });
    } },
  { test: (path, method) => path === "/brief",
    // A browser's bare /brief lands on Home, where what needs you is (Q893B08A5).
    run: async (c) => {
      const { url } = c;
      // sprint 3 B5: ?for=<hat | ref> is the brief tool's twin (src/extract.js briefAnswer), on the seam's scoped env (c.env:
      // resolveProject, the tool's own project rule); without it, the legacy alias below
      if (url.searchParams.get("for") != null) {
        const out = await briefAnswer(c.env, c.gateReader, { for: url.searchParams.get("for"), eval: url.searchParams.get("eval") || undefined });
        return json(out, out.error ? EXTRACT_STATUS[out.error] || 422 : 200, { "cache-control": "private, no-store" });
      }
      // D5: a role's brief: JSON, or ?role=, answers the brief tool's no-`for` form (src/docread.js roleBriefFor)
      if (url.searchParams.get("role") != null || !wantsHtml(c.request)) {
        const r = await roleBriefFor(c.env, c.gateReader, url.searchParams.get("role") || "");
        return json(r.error ? r : { project: await projectOf(c.env), for: null, role: r.role, brief: { path: r.path, title: r.title, body: r.body } }, r.error ? 404 : 200, { "cache-control": "private, no-store" });
      }
      const q = new URLSearchParams(url.search || ""); q.delete("k");   // the personal key never rides a Location header
      const qs = q.toString();
      return new Response(null, { status: 302, headers: { location: orgPath("/home" + (qs ? "?" + qs : "")), "cache-control": "private, no-store" } });
    } },
  { test: (path, method) => path === "/projects",
    run: async (c) => {
      // The projects page (M-ADR-013; renamed from Workspaces, Q5D239600/Q93B3F368 — the soft
      // scope inside an org is called PROJECT): renderPicker on demand, reachable ANYTIME —
      // unlike "/" which shows it only pre-stamp — so a multi-project reader can always get
      // back to switch. A single-seat reader has nothing to choose → 302 /home, so this route
      // and the nav entry (shown only when there IS choice) agree. #6 (readiness review, Wave
      // 3): this used to pass proj:null to suppress the redundant switcher chip, which ALSO
      // zeroed servePage's hasChoice — hiding the Projects nav entry on the one page it should
      // always be visible/active on. proj is left unset below so servePage computes it
      // normally (same seats already fetched here), so the nav entry + the chip both render.
      const { env } = c;
      const reader = c.gateReader;
      const seats = await projectSeatsFor(reader.id, env);
      const isOwner = reader.role === "owner";
      const orgCount = isOwner ? await countActiveProjects(env) : 0;
      if (!(seats.length > 1 || (isOwner && orgCount > 1))) {
        return new Response(null, { status: 302, headers: { location: orgPath("/home") } });
      }
      const tenant = await getTenantConfig(env);
      // D2b: the owner holds every active project (it read "No projects assigned yet" with five)
      const content = renderPicker({ projects: isOwner ? await projectsHeldBy(reader, env) : seats, orgEntry: isOwner, personName: reader.name, brand: tenant.brand, current: String((await projectOf(env)) || "") });
      return servePage(env, { active: "projects", content, owner: isOwner, reader, cache: "private, no-store", tenant });
    } },
  { test: (path, method) => path === "/docs",
    run: async (c) => {
      // Public adoption guide (Mission C) — no auth, brand-seamed, no truth. A stranger org reads
      // the base link + envelope + connect-your-Claude before it ever has a seat. Domain = the
      // actual serving origin, so the snippets are copy-paste correct for whatever org runs this.
      const { request, env, url } = c;
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      const tenant = await getTenantConfig(env);
      return servePage(env, { active: "docs", content: renderDocs({ brand: tenant.brand, domain: url.origin }), owner: reader?.role === "owner", reader, tenant, cache: "public, max-age=300" });
    } },
  { test: (path, method) => path === "/missing",
    run: async (c) => {
      // What is missing, on glass: a seated reader sees its project's knowledge graded piece by piece, each open piece with
      // the call that fills it (src/holes.js computeHoles, the same read the missing tool and brain://missing answer); the
      // public sees only the shape and the standard (holesShape, no reads, no leak: owner ruling 2026-09-02)
      const { request, env, url } = c;
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      const tenant = await getTenantConfig(env);
      const holes = reader ? await computeHoles(env, reader, tenant) : holesShape(tenant);
      // no-store on BOTH branches: the seat's view is live per-reader, and the public view must be a
      // DETERMINISTIC privacy gate — an edge-cached copy could serve a stale live-data page, so never cache.
      return servePage(env, { active: "missing", content: renderHoles(holes, { brand: tenant.brand, params: url.searchParams }), owner: reader?.role === "owner", reader, tenant, cache: reader ? "private, no-store" : "no-store" });
    } },
  // ---- UI-B6a: Goals and one goal (src/goalsread.js readGoals / readGoalNode, rendered by src/goals.js), with the MCP
  // twin `goals` (and {ref}) and the resources brain://goals and brain://goal/{ref}. The feed folds into GET /goals. ----
  { test: (path, method) => (path === "/goals" || path.startsWith("/goals/")) && method === "GET",
    run: async (c) => {
      const { request, env, url, path } = c;
      const reader = c.gateReader;   // gated (GATED_SURFACE + its /goals/ prefix branch): resolved once, reused
      if (path === "/goals") {
        const g = await readGoals(env, reader, url.searchParams);
        if (!wantsHtml(request)) return json(g, 200, { "cache-control": "private, no-store" });
        const tenant = await getTenantConfig(env);
        return servePage(env, { active: "goals", meter: "goals", lists: "goals", content: renderGoals(g, { brand: tenant.brand, params: url.searchParams }), owner: reader.role === "owner", reader, tenant,
          includeEval: !!g.eval, cache: "private, no-store" });
      }
      let ref = ""; try { ref = decodeURIComponent(path.slice("/goals/".length)); } catch { ref = ""; }
      const n = ref && !ref.includes("/") ? await readGoalNode(env, reader, ref, url.searchParams) : null;
      if (!n) {
        // a ref not in THIS workspace's tree: the same answer whether it is missing or another project's (M-ADR-028)
        if (!wantsHtml(request)) return json({ error: "unknown_goal", ref: ref.slice(0, 80) }, 404, { "cache-control": "private, no-store" });
        return servePage(env, { active: "goals", content: renderDenied({ what: "No goal by that id in this project's tree. Goals lists every one." }), owner: reader.role === "owner", reader,
          cache: "private, no-store", status: 404 });
      }
      if (!wantsHtml(request)) return json(n, 200, { "cache-control": "private, no-store" });
      const tenant = await getTenantConfig(env);
      // sprint 3 L3: the open questions that name this goal (what they block or affect), from the open-only read Home and the
      // shell's badge share (memoized per request); the page only, the goal's JSON keeps its shape
      const openQ = await readDecisions(env, reader, url.searchParams, { open: true }).catch((e) => { if (isD1Quota(e)) throw e; return { rows: [] }; });
      const names = new Set([n.node.id, `goal/${n.node.id}`]);
      const questions = (openQ.rows || []).filter((q) => q.status === "open" && [...(q.blocks || []), ...(q.affects || [])].some((x) => names.has(String(x))));
      return servePage(env, { active: "goals", content: renderGoalNode(n, { brand: tenant.brand, questions }), owner: reader.role === "owner", reader, tenant,
        includeEval: !!n.eval, cache: "private, no-store" });
    } },
  // ---- UI-B10a + UI-B10b: GTM (src/gtmread.js readGtmPipeline, rendered by src/gtm.js renderGtm), with the MCP twin
  // `gtm` and the resource brain://gtm. ONE read, two faces: HTML for a browser, JSON otherwise. ----
  { test: (path, method) => path === "/gtm" && method === "GET",
    run: async (c) => {
      const { request, env, url } = c;
      const reader = c.gateReader;   // gated (GATED_SURFACE): resolved once, reused
      const g = await readGtmPipeline(env, reader, url.searchParams);
      if (!wantsHtml(request)) return json(g, 200, { "cache-control": "private, no-store" });
      const tenant = await getTenantConfig(env);
      return servePage(env, { active: "gtm", meter: "gtm", content: renderGtm(g, { brand: tenant.brand, params: url.searchParams }), owner: reader.role === "owner", reader, tenant,
        includeEval: !!g.eval, cache: "private, no-store" });
    } },
  // ---- UI-B11a + UI-B11b: Broadcast (src/broadcastread.js readBroadcast, rendered by src/broadcastpage.js renderBroadcast),
  // with the MCP twin `broadcast` and the resource brain://broadcast. ONE read, two faces: HTML for a browser, JSON otherwise.
  // A Publish or Equip form comes back here (303 ?published=<id> | ?equipped=<id>): the page acknowledges it, re-reading nothing. ----
  { test: (path, method) => path === "/broadcast" && method === "GET",
    run: async (c) => {
      const { request, env, url } = c;
      const reader = c.gateReader;   // gated (GATED_SURFACE): resolved once, reused
      const b = await readBroadcast(env, reader, url.searchParams);
      if (!wantsHtml(request)) return json(b, 200, { "cache-control": "private, no-store" });
      const tenant = await getTenantConfig(env);
      const doc = String(url.searchParams.get("doc") || "").replace(/[^a-z0-9/._-]/gi, "").slice(0, 80);
      const ack = url.searchParams.get("published") ? "Published. It is on the shelf at its next version."
        : url.searchParams.get("equipped") ? (doc ? `Equipped. This project's copy is ${doc}: its AI reads it, and anyone seated edits it through preview then save_knowledge.` : "Equipped. This project is pinned to that version.") : "";
      // sprint 2: the page (never the JSON) draws the live picture, src/broadcastlive.js readLive's one statement
      const live = await readLive(env, reader, url.searchParams);
      return servePage(env, { active: "broadcast", meter: "broadcast", lists: "broadcast", content: renderBroadcast(b, { brand: tenant.brand, ack, partner: isPartnerReader(reader), live }), owner: reader.role === "owner", reader, tenant,
        includeEval: !!b.eval, cache: "private, no-store" });
    } },
  // ---- sprint 2: GET /broadcast/live, the live picture's JSON and its poll (?since=), src/broadcastlive.js readLive: ONE
  // statement (the Map's lights pattern: the page polls it on focus and every 30 s while visible, never on load) ----
  { test: (path, method) => path === "/broadcast/live" && method === "GET",
    run: async (c) => {
      const { request, env, url } = c;
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(signedOutUnlessQuota);
      if (!reader) return signInOr401(request, url, undefined, { error: "auth_required" });
      return json(await readLive(env, reader, url.searchParams), 200, { "cache-control": "private, no-store" });
    } },
  // ---- sprint 2: GET /broadcast/starter/:slug, one starter item built into the engine (src/starter.js): its page to a browser,
  // JSON otherwise; where this project stands on it is GET /broadcast's own starter-shelf card (its one statement) ----
  { test: (path, method) => path.startsWith("/broadcast/starter/") && method === "GET",
    run: async (c) => {
      const { request, env, url, path } = c;
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(signedOutUnlessQuota);
      if (!reader) return signInOr401(request, url);
      let slug = ""; try { slug = decodeURIComponent(path.slice("/broadcast/starter/".length)); } catch { slug = ""; }
      const p = presetOf(slug);
      if (!p) return json({ error: "unknown_item", slug: slug.slice(0, 48), note: "No starter item by that slug. GET /broadcast lists the starter shelf." }, 404);
      const b = await readBroadcast(env, reader, url.searchParams);
      const card = ((b.regions || {})["starter-shelf"] || []).find((x) => x.slug === p.slug) || { slug: p.slug, kind: p.kind, title: p.title, purpose: p.purpose, calls: p.calls, v: p.version };
      if (!wantsHtml(request)) return json({ ...card, body: p.body }, 200, { "cache-control": "private, no-store" });
      const tenant = await getTenantConfig(env);
      return servePage(env, { active: "broadcast", content: renderStarterPage(card, b, { body: md(p.body) }), owner: reader.role === "owner", reader, tenant,
        includeEval: !!b.eval, cache: "private, no-store" });
    } },
  {
    test: (path, method) => path === "/audit",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      // Activity is a READER surface (owner ruling 2026-09-03, overturns S-040 owner-only):
      // every signed-in member sees the contribution trail of what they may read (the one project rule, below); the owner
      // keeps the org-wide rollup. Only an anonymous hit is turned away, to /login (302),
      // consistent with every other gated reader page.
      if (!reader) return signInOr401(request, url);
      // sprint 12 (12.5): ALL PROJECTS — ?all=1, and the owner's rollup (the switcher's "All projects": no project named, no live
      // stamp, an org of several active projects) read src/activity.js activityAcross: every contribution of every project the
      // reader may read (the owner: every active project; anyone else: their seats; a Partner its seated projects alone), newest
      // first, filtered by ?in= (a project), ?who= (a filer's id), ?lane=, ?state=, ?since=, paged by ?before= (its cursor)
      const isOwnerA = reader.role === "owner";
      const seatsA = isOwnerA ? await projectSeatsFor(reader.id, env) : await seatsOnce(env, reader.id);
      const auditAp = isOwnerA ? switcherCurrentOf(reader, seatsA, env[READ_SCOPE] || { project: await liveStampOf(reader, seatsA, env), named: false, active: true }) : null;
      const manyA = isOwnerA ? (await activeKeysOnce(env)).length > 1 : seatsA.length > 1;
      if (url.searchParams.get("all") === "1" || (isOwnerA && !auditAp && manyA)) {
        const q = url.searchParams, fa = { in: q.get("in") || "", who: q.get("who") || "", lane: q.get("lane") || "", state: q.get("state") || "", since: q.get("since") || "" };
        const read = await activityAcross(env, reader, { projects: fa.in || undefined, person: fa.who || undefined, lane: fa.lane || undefined, state: fa.state || undefined,
          since: fa.since || undefined, before: q.get("before") || undefined, limit: q.get("limit") || undefined });
        if (read.error) return servePage(env, { active: "audit", content: renderDenied({ what: read.error === "project_forbidden" ? "No project by that name that you may read." : read.error === "unreadable" ? "Activity could not be read just now." : "That filter is not one Activity knows." }),
          owner: isOwnerA, reader, cache: "private, no-store", status: read.error === "project_forbidden" ? 403 : read.error === "unreadable" ? 503 : 422 });
        const tenantA = await getTenantConfig(env);
        // ?who='s chip: the person's name when the answer holds them (their rows), else "unknown person" — never the typed id
        return servePage(env, { active: "audit", content: renderActivityAll(read, { filters: fa, ownerName: ownerName(await resolveOwner(env)), states: ACTIVITY_STATES, whoName: fa.who ? "unknown person" : "" }),
          owner: isOwnerA, reader, cache: "private, no-store", tenant: tenantA });
      }
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "80", 10) || 80, 200);
      // G5 (ADR-089 §5): simple filters as query params, composed as their own AND-group
      // on top of the base "SIRU-domain only" WHERE — data source unchanged, only the
      // view (and now these filter clauses) changed. person matches by name
      // (case-insensitive); kind/lane are exact matches against events columns; route
      // reads the mirrored transmission route off "pr"-kind rows' payload (the only kind
      // that ever carries one); since is a plain >= on created_at (a bare YYYY-MM-DD
      // sorts correctly against the ISO timestamps stored there).
      const fPerson = url.searchParams.get("person") || "";
      const fKind = url.searchParams.get("kind") || "";
      const fLane = url.searchParams.get("lane") || "";
      const fRoute = url.searchParams.get("route") || "";
      const fSince = url.searchParams.get("since") || "";
      // the fixed exclusions live in src/hotsql.js (build0925:d1-hot-queries): the first three are also the WHERE of
      // migrate-037's partial index idx_events_audit, which bounds this scan to the LIMIT.
      // sprint 6 (6.2): the reader's org's trail only (src/data.js {org}; events.org carries no index: the walk is unchanged)
      const clauses = [...AUDIT_BASE_CLAUSES, "e.org = {org}"];
      const binds = [];
      if (fPerson) { clauses.push("lower(p.name) = ?"); binds.push(fPerson.toLowerCase()); }
      // M-ADR-026 "my work": by id, never by name
      const fMine = url.searchParams.get("mine") === "1";
      if (fMine) { clauses.push("p.id = ?"); binds.push(reader.id); }
      if (fKind) { clauses.push("e.kind = ?"); binds.push(fKind); }
      if (fLane) { clauses.push("e.lane = ?"); binds.push(fLane); }
      if (fRoute) { clauses.push("json_extract(e.payload_json,'$.route') = ?"); binds.push(fRoute); }
      if (fSince) { clauses.push("e.created_at >= ?"); binds.push(fSince); }
      // G2 H1 (the independent review): the trail is read under THE one project rule (src/project.js), like every other
      // reader — never the raw session stamp, which a Bearer key, an OAuth grant or an unswitched session never carries (that
      // read the whole org's trail for every signed-in person, a seatless Partner included). A reader who is not the owner
      // reads the request's scope (projectScopeOf: a named ?project= they hold, their active or first seat; seated nowhere,
      // the org-level rows only; a Partner seated nowhere, the org-level rows only in any org). The owner keeps the org
      // rollup: the project the page names or the live stamp (the switcher's own answer), else every project.
      let trailOf = null;   // the project this trail reads (12.5: named beside the All projects choice)
      if (isOwnerA) {
        if (auditAp) { clauses.push("e.project = ?"); binds.push(auditAp); trailOf = auditAp; }
      } else {
        const sc = await projectScopeOf(env);
        if (sc.filter === "eq") { clauses.push("e.project = ?"); binds.push(sc.project); trailOf = sc.project; }
        else if (sc.filter === "null") clauses.push("e.project IS NULL");
      }
      const allProjects = manyA ? { name: trailOf ? ((seatsA.find((x) => x.key === trailOf) || {}).name || projectSlug(trailOf)) : null } : null;
      binds.push(limit + 1);   // L4: one past the page, so the trail's count says "80+" instead of presenting the page as the total
      const { results: got } = await db(env).prepare(auditEventsSql(clauses)).bind(...binds).all();
      const more = got.length > limit, results = got.slice(0, limit);
      const rows = results.map((r) => { let pl = {}; try { pl = JSON.parse(r.payload_json || "{}"); } catch {}
        return { at: r.created_at, kind: r.kind, by: r.by_name, role: r.by_role, lane: r.ev_lane || null, project: r.project || null,
                 what: pl.what || pl.title || pl.question || pl.claim || pl.summary || null, basis: r.basis || null, touches: r.touches || null,
                 route: pl.route || null,
                 link: pl.transmissionId ? orgPath("/contribution/" + pl.transmissionId + "?page=1") : (pl.artifactId ? orgPath("/view?src=" + encodeURIComponent("/artifact/" + pl.artifactId)) : null) }; });
      // L4: a grade row reads "Graded <the node's name> · <verdict>": the names of the graded checks' nodes, on k_nodes' primary
      // key (project, id) for the rows shown, each in the project its event names (the trail is already scoped to what the reader
      // may read); one statement per project and 90 ids (D1 binds at most 100 parameters), one batch
      const idsBy = new Map();
      for (const r of rows) { const g = auditGradeOf(r.what); if (!g || !r.project) continue; if (!idsBy.has(r.project)) idsBy.set(r.project, new Set()); idsBy.get(r.project).add(g.node); }
      const nodeNames = new Map(), nameStmts = [];
      for (const [p, set] of idsBy) { const ids = [...set]; for (let i = 0; i < ids.length; i += 90) { const ch = ids.slice(i, i + 90); nameStmts.push(db(env).prepare(`SELECT project, id, name FROM k_nodes WHERE project = ? AND id IN (${ch.map(() => "?").join(",")})`).bind(p, ...ch)); } }
      if (nameStmts.length) {
        const nr = await db(env).batch(nameStmts).catch((e) => { if (isD1Quota(e)) throw e; return []; });
        for (const x of nr || []) for (const n of (x && x.results) || []) nodeNames.set(`${n.project}|${n.id}`, String(n.name || n.id));
      }
      const tenant = await getTenantConfig(env);
      const content = renderAudit(rows, { more, limit, nodeNames, allProjects,
        filters: { person: fPerson, kind: fKind, lane: fLane, route: fRoute, since: fSince, mine: fMine },
        options: { kinds: AUDIT_KIND_OPTIONS, lanes: AUDIT_LANE_OPTIONS, routes: AUDIT_ROUTE_OPTIONS },
        brand: tenant.brand, ownerName: ownerName(await resolveOwner(env)), servedStamp: { publishedAt: now() },
      });
      return servePage(env, { active: "audit", content, owner: reader.role === "owner", reader, cache: "private, no-store", tenant });
    },
  },
  {
    test: (path, method) => path === "/artifacts" && method === "GET",
    // The Files PAGE is retired (Q4F5323A0, UI-B4b): its buckets, tags and typed search box went with it (Q1E8D4C9C).
    // What stays is read_file's list twin (read_file with no id): artifactsListFor (src/core.js, QF9C8E14A), the SAME seam and
    // the same scope the tool reads, answered as JSON for ANY Accept. Its own auth: an unauthenticated call is a 401
    // JSON, never a login page (it is not a page).
    run: async (c) => {
      const { request, env, url } = c;
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      if (!reader) return signInOr401(request, url, undefined, { error: "auth_required", hint: "Authorization: Bearer <your key>" });
      const seats = await projectSeatsFor(reader.id, env);
      const sp = url.searchParams;
      return json(await artifactsListFor(reader, env, seats, { q: sp.get("q") || undefined, group: sp.get("group") || undefined, limit: sp.get("limit") || undefined }),
        200, { "cache-control": "private, no-store" });
    },
  },
    // GET /view?src=<internal path> — ADR-090: the in-frame viewer. No raw document
    // ever loses the shell again — every View-class link on every surface (Files rows,
    // the rt-v1.1 report artifact link, the agentic report examples) routes here
    // instead of straight to the raw route. reader auth + readOnlyOk (same as /artifacts
    // — GATED_SURFACE above already redirects an unauthenticated browser hit to
    // /login; this re-resolve matches every other gated route's own pattern).
    // src must be a same-origin internal path under /artifact/ (a banked artifact) — everything else
    // is 400, never a redirect/proxy to anywhere else.
  {
    test: (path, method) => path === "/view",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      const VIEW_SRC_PREFIXES = ["/artifact/"];
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      if (!reader) return signInOr401(request, url);
      const src = url.searchParams.get("src") || "";
      // same parser-backed guard as POST /login's ?next= (sameOriginPath), then the prefix allowlist.
      const okSrc = !!sameOriginPath(src, url.origin) && VIEW_SRC_PREFIXES.some((p) => src.startsWith(p));
      if (!okSrc) return json({ error: "bad_src", note: "src must be a same-origin path starting with one of: " + VIEW_SRC_PREFIXES.join(", "), got: src }, 400);
      let shortName = src.split("/").filter(Boolean).pop() || src;
      try { shortName = decodeURIComponent(shortName); } catch { /* keep the raw segment if it isn't valid percent-encoding */ }
      // the iframe's request rides the visitor's own session cookie (a key never rides a URL: G2 M2)
      const content = renderViewer({ src: orgPath(src), shortName });   // the frame and its raw link under the org (sprint 7, 7.4)
      return servePage(env, { active: "view", content, owner: reader.role === "owner", reader, cache: "private, no-store" });
    },
  },
  // ---- UI-B4b: Build (src/build.js), one read with the MCP twin `build`, and the rank door with its twin `rank`. ----
  { test: (path, method) => path === "/build" && method === "GET",
    run: async (c) => {
      const { request, env, url } = c;
      const reader = c.gateReader;   // gated (GATED_SURFACE): resolved once, reused
      const b = await readBuild(env, reader, url.searchParams);
      if (!wantsHtml(request)) return json(b, 200, { "cache-control": "private, no-store" });
      const tenant = await getTenantConfig(env);
      return servePage(env, { active: "build", changes: "build", lists: "build", content: renderBuild(b, { brand: tenant.brand }), owner: reader.role === "owner", reader, tenant,
        includeEval: !!b.eval, cache: "private, no-store" });
    } },
  { test: (path, method) => path === "/rank" && method === "POST",
    run: async (c) => {
      const { request, env, url } = c;
      const ct = request.headers.get("content-type") || "";
      const isForm = ct.includes("form");
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      if (!reader) return signInOr401(request, url, orgPath("/build"));
      // the same two refusals every cookie/boot-link write carries (the /round and /respond doors')
      if (reader.readOnly) return json({ error: "read_only_credential", hint: "A read-only key can read but not rank. Use your full key." }, 403);
      if (csrfRefused(request, url, reader)) return json({ error: "cross_origin_session_write" }, 403);
      let a = {}, next = "";
      if (isForm) {
        const fd = await request.formData().catch(() => null);
        if (fd) { a = { id: String(fd.get("id") || ""), eval: String(fd.get("eval") || "") === "1" }; next = sameOriginPath(String(fd.get("next") || ""), url.origin); }
      } else a = await request.json().catch(() => ({})) || {};
      if (carriesTranscript(a)) return json({ error: "transcript_rejected" }, 422);
      const { http, ...body } = await fileRank(env, reader, { id: a.id, eval: a.eval, via: isForm ? "build" : (a.via || "http") });
      if (!isForm || body.error) return json(body, http || 200);
      return new Response(null, { status: 303, headers: { location: next || orgPath("/build"), "cache-control": "private, no-store" } });
    } },
  // ---- UI-B2 (J1, ruling a question): the Decisions screen, the QuestionCard and the round, one module
  // (src/decisions.js) with the MCP twins `decisions` · `round` · `respond`. GET /questionnaire is gone
  // (QBDD22130, the /respond hard cut): an answer is an option of a published question, chosen here. ----
  { test: (path, method) => path === "/decisions" && method === "GET",
    run: async (c) => {
      const { request, env, url } = c;
      const reader = c.gateReader;   // gated (GATED_SURFACE): resolved once, reused
      const d = await readDecisions(env, reader, url.searchParams);
      if (!wantsHtml(request)) return json(decisionsJson(d), d.error ? 502 : 200, { "cache-control": "private, no-store" });
      return servePage(env, { active: "decisions", meter: "decisions", lists: "decisions", content: renderDecisionsPage(d, { ...flashOf(url), reader, params: url.searchParams }), owner: reader.role === "owner", reader,
        cache: "private, no-store", status: d.error ? 502 : 200 });
    } },
  { test: (path, method) => path.startsWith("/question/") && method === "GET",
    run: async (c) => {
      const { request, env, url, path } = c;
      const reader = c.gateReader;   // gated by the /question/ prefix branch of GATED_SURFACE
      let qid = ""; try { qid = decodeURIComponent(path.slice("/question/".length)); } catch { qid = ""; }
      const card = QID_RE.test(qid) ? await readQuestion(env, reader, qid, url.searchParams) : { status: 404, error: "not_found", qid: qid.slice(0, 64) };
      if (!wantsHtml(request)) return json(questionJson(card), card.status || 200, { "cache-control": "private, no-store" });
      // no pack is the EMPTY pattern (200); an unknown qid is a 404 page; an unreadable pack is ERROR
      const status = card.error === "no_pack" ? 200 : (card.status || 200);
      return servePage(env, { active: "question", content: renderQuestionPage(card, { ...flashOf(url), eval: url.searchParams.get("eval") === "1", reader }),
        owner: reader.role === "owner", reader, cache: "private, no-store", status });
    } },
  // ---- Versions (src/versionsview.js over src/knowledge/versions.js: snapshots in D1), a Map view, with the MCP twins
  // `versions`, `publish_version` and `restore_version` ----
  { test: (path, method) => (path === "/versions" || path.startsWith("/versions/")) && method === "GET",
    run: async (c) => {
      const { request, env, url, path } = c;
      const reader = c.gateReader;   // gated (GATED_SURFACE + its /versions/ prefix branch): resolved once, reused
      if (path === "/versions" && url.searchParams.get("head") === "1") {
        return json(await readVersionHead(env), 200, { "cache-control": "no-store" });
      }
      let v = null;
      if (path !== "/versions") { try { v = decodeURIComponent(path.slice("/versions/".length)); } catch { v = ""; } }
      const q = { v, cause: url.searchParams.get("cause") };
      const d = await readVersionsView(env, reader, q);
      const status = d.status || 200;
      if (!wantsHtml(request)) return json(versionsJson(d), status, { "cache-control": "private, no-store" });
      if (d.error === "unknown_version") {
        return servePage(env, { active: "versions", content: renderDenied({ what: `No version ${String(v || "").slice(0, 80)} on this project. Versions lists every one.` }), owner: reader.role === "owner", reader,
          cache: "private, no-store", status: 404, head: d.current || null });
      }
      const flash = /^\d{1,9}$/.test(url.searchParams.get("restored") || "")
        ? { restored: url.searchParams.get("restored"), ...(/^\d{1,9}$/.test(url.searchParams.get("kept") || "") ? { kept: url.searchParams.get("kept") } : {}) } : null;
      // the disabled Restore's reason says "the owner" (no owner lookup: the page runs only its own two statements)
      return servePage(env, { active: "versions", content: renderVersions(d, { flash, eval: url.searchParams.get("eval") === "1", path }),
        owner: reader.role === "owner", reader, cache: "private, no-store", status, head: d.current || null });
    } },
  // the owner's two doors: publish (JSON) and restore (JSON, or the Versions page's form). The same refusals every
  // cookie/boot-link write carries (the /rank and /round doors'), then the body's project scoped by the SAME projectCallScope
  // callTool runs for the tools; the seam (src/knowledge/versions.js) checks the owner again and resolves the project.
  { test: (path, method) => (path === "/versions/restore" || path === "/versions/publish") && method === "POST",
    run: async (c) => {
      const { request, env, url, path } = c;
      const restore = path === "/versions/restore";
      const ct = request.headers.get("content-type") || "";
      const isForm = ct.includes("form");
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      if (!reader) return signInOr401(request, url, orgPath("/versions"));
      if (reader.readOnly) return json({ error: "read_only_credential", hint: `A read-only key can read but not ${restore ? "restore" : "publish"}. Use your full key.` }, 403);
      if (csrfRefused(request, url, reader)) return json({ error: "cross_origin_session_write" }, 403);
      let a = {};
      if (isForm) {
        const fd = await request.formData().catch(() => null);
        if (fd) a = { v: String(fd.get("v") || ""), title: String(fd.get("title") || ""), project: fd.get("project") ? String(fd.get("project")) : undefined, eval: String(fd.get("eval") || "") === "1" };
      } else a = await request.json().catch(() => ({})) || {};
      if (carriesTranscript(a)) return json({ error: "transcript_rejected" }, 422);
      const r = await projectCallScope(reader, a.project, env);
      if (r.error) return json(r, 403);
      const args = { project: a.project, eval: a.eval, via: isForm ? "versions" : (a.via || "http") };
      const { http, ...body } = restore ? await fileRestore(r.env, r.person, { ...args, v: a.v }) : await filePublish(r.env, r.person, { ...args, title: a.title });
      if (!isForm || body.error) return json(body, http || 200);
      const back = new URLSearchParams();
      if (body.project) back.set("project", body.project);
      if (restore && body.version) back.set("restored", String(body.version.n));
      if (restore && body.kept) back.set("kept", String(body.kept));
      if (a.eval) back.set("eval", "1");
      return new Response(null, { status: 303, headers: { location: orgPath(`/versions?${back}`), "cache-control": "private, no-store" } });
    } },
  { test: (path, method) => path === "/round" && method === "POST",
    run: async (c) => {
      const { request, env, url } = c;
      const ct = request.headers.get("content-type") || "";
      const isForm = ct.includes("form");
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      if (!reader) return signInOr401(request, url, orgPath("/decisions"));
      // the same two refusals every cookie/boot-link write carries (the /respond door's, below)
      if (reader.readOnly) return json({ error: "read_only_credential", hint: "A read-only key can read but not add to the round. Use your full key." }, 403);
      if (csrfRefused(request, url, reader)) return json({ error: "cross_origin_session_write" }, 403);
      let a = {}, next = "";
      if (isForm) {
        const fd = await request.formData().catch(() => null);
        if (fd) { a = { qid: String(fd.get("qid") || ""), export: String(fd.get("export") || "") === "1", eval: String(fd.get("eval") || "") === "1", project: String(fd.get("project") || "") }; next = sameOriginPath(String(fd.get("next") || ""), url.origin); }
      } else a = await request.json().catch(() => ({})) || {};
      const ev = isEvalMark(a.eval);
      const res = (a.export === true || isEvalMark(a.export))
        ? await exportRound(env, reader, { eval: ev, origin: url.origin })
        : await fileRound(env, reader, { qid: a.qid, eval: ev, project: a.project });
      const { status, ...body } = res;
      if (!isForm) return json(body, status || 200);
      if (body.href) return new Response(null, { status: 302, headers: { location: body.href } });
      const back = next || (a.qid && QID_RE.test(String(a.qid)) ? orgPath(`/question/${encodeURIComponent(a.qid)}`) : orgPath("/decisions"));
      const sep = back.includes("?") ? "&" : "?";
      const flag = body.error ? `refused=${encodeURIComponent(body.error)}` : body.count === 0 && !body.qid ? "refused=round_empty" : "rounded=1";
      return new Response(null, { status: 302, headers: { location: back + sep + flag } });
    } },
  // preview's twin (sprint 3, B2): above the gate, because a read-only key MAY preview (it writes nothing: no previews row,
  // every item refused for filing). The caller: resolveAny (a full key or the read-only key as a Bearer header, else the
  // session cookie), never a key in the URL; a cookie caller is held to the same-origin write rule (a preview writes
  // its one row). The body's project is resolved by the door's own stamp inside previewItems, then scoped like a write.
  {
    test: (path, method) => path === "/preview" && method === "POST",
    run: async (c) => {
      const { request, env, url } = c;
      const reader = await resolveAny(request, env).catch(() => null);
      if (!reader) return signInOr401(request, url, undefined, { error: "unauthorized", hint: "Authorization: Bearer <your key>" });
      if (csrfRefused(request, url, reader)) return json({ error: "cross_origin_session_write" }, 403);
      const body = (await request.json().catch(() => ({}))) || {};
      if (carriesTranscript(body)) return json({ error: "transcript_rejected" }, 422);
      const out = await previewItems(reader, body, env, { via: "http", origin: url.origin });
      return json(out, out.error === "project_forbidden" ? 403 : out.error ? 422 : 200, { "cache-control": "private, no-store" });
    },
  },
  {
    test: (path, method) => path === "/respond" && method === "POST",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      if (!reader) return signInOr401(request, url, orgPath("/decisions")); // a POST — return to the page it came from
      // the same two refusals every cookie/boot-link write carries (adversarial review 2026-09-09: this door lacked both)
      if (reader.readOnly) return json({ error: "read_only_credential", hint: "A read-only key can read but not answer. Use your full key." }, 403);
      if (csrfRefused(request, url, reader)) return json({ error: "cross_origin_session_write" }, 403);
      return handleRespond(request, env, url, reader);
    },
  },



  {
    test: (path, method) => path === "/canvas.json",
    run: async (c) => {
      const { request, env, url } = c;
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      if (!reader) return signInOr401(request, url, undefined, { error: "auth_required" });
      // the project's model (src/mapnode.js readCanvas, so its stamp is the page's ?v)
      let cv;
      try { cv = await readCanvas(env); } catch (e) { if (isD1Quota(e)) throw e; return json({ error: "unreadable", note: "The project's model could not be read." }, 503); }
      const want = url.searchParams.get("v");
      return new Response(JSON.stringify({ v: cv.v, project: cv.project, ...cv.canvas }), { headers: { "content-type": "application/json", "cache-control": want && want === cv.v ? "private, max-age=31536000, immutable" : "private, no-store" } });
    },
  },
  {
    // GET /map/node: one node of the map, the inspector's read. JSON to a script, the inspector fragment (src/mapnode.js
    // renderInspector, the ONE renderer) when the request accepts text/html. D1: the node and its edges, the project's
    // gaps, the checks that name it; the decision rows (affects) and the versions head beside them.
    test: (path, method) => path === "/map/node" && method === "GET",
    run: async (c) => {
      const { request, env, url } = c;
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      if (!reader) return signInOr401(request, url);   // THE sign-in rule, before any lookup (D1b)
      const wantsHtml = /text\/html/.test(request.headers.get("accept") || "");
      const ans = await readMapNode(env, reader, url.searchParams, { draw: wantsHtml });
      if (wantsHtml && ans.status === 200) return new Response(renderInspector(ans.body, { open: ans.open, project: ans.project }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } });
      return json(ans.body, ans.status, { "cache-control": "private, no-store" });
    },
  },
  {
    // GET /map (the main tab) and GET /map/lights (its live lights). The page: src/mapread.js readMapPage over the compact
    // model (src/knowledge/mapmodel.js, three statements of at most one row per node), full width with its own bar. JSON
    // (a script): the compact layout the page embeds. A failed model read is UNREACHABLE on glass, 503 to a script.
    test: (path, method) => method === "GET" && (path === "/map" || path === "/map/lights"),
    run: async (c) => {
      const { request, env, url, path } = c;
      const wantsHtml = /text\/html/.test(request.headers.get("accept") || "");
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(signedOutUnlessQuota);
      if (path === "/map/lights") {
        if (!reader) return signInOr401(request, url, undefined, { error: "auth_required" });
        try { return json(await lightsSince(env, await projectOf(env), url.searchParams.get("since") || ""), 200, { "cache-control": "private, no-store" }); }
        catch (e) { if (isD1Quota(e)) throw e; return json({ error: "unreadable" }, 503); }
      }
      if (!reader) return signInOr401(request, url);
      if (wantsHtml) return serveMap(env, reader, "map", url);
      try { return json(layoutOf(await mapModelOf(env, await projectOf(env))), 200, { "cache-control": "private, no-store" }); }
      catch (e) { if (isD1Quota(e)) throw e; return json({ error: "unreadable", note: "The project's model could not be read." }, 503); }
    },
  },
  {
    // GET /map/screens: the Screens view's ONE read (src/knowledge/screens.js readScreens, ARCHITECTURE §11), JSON only, on
    // the project the seam scoped (?project=); a browser asking for the page (Accept: text/html) falls through to the Map's
    // own route below. Compact JSON: the view reads it on every surface switch.
    test: (path, method) => method === "GET" && path === "/map/screens",
    run: async (c) => {
      const { request, env, url } = c;
      if (/text\/html/.test(request.headers.get("accept") || "")) return undefined;
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(signedOutUnlessQuota);
      if (!reader) return signInOr401(request, url, undefined, { error: "auth_required" });
      const ans = await screensAnswer(env, url.searchParams.get("surface"));
      return new Response(JSON.stringify(ans.body), { status: ans.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" } });
    },
  },
  {
    // GET /map/:plane: a door plane (api, mcp) read in-process off CAPABILITIES and MCP_TOOLS, or a model plane (arch, data,
    // flows, deps) read off the project's model in D1, by src/mapplanes.js readMapPlane, the ONE reader (map {plane}
    // and brain://map/{plane} answer the same): JSON to a script, unchanged. To a browser, the Map page opened on that
    // plane's layers or view (src/mapread.js OPENS); /map/system (the old System plane) is the Map itself.
    // /map/node (above) is UI-B7b's own door and never reaches here.
    test: (path, method) => method === "GET" && path.startsWith("/map/") && path !== "/map/node" && path !== "/map/lights",
    run: async (c) => {
      const { request, env, url, path } = c;
      let plane = ""; try { plane = decodeURIComponent(path.slice("/map/".length)); } catch { plane = ""; }
      if (plane === "system") return new Response(null, { status: 302, headers: { location: orgPath("/map" + (url.search || "")) } });
      const wantsHtml = /text\/html/.test(request.headers.get("accept") || "");
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      if (!reader) return signInOr401(request, url);
      if (wantsHtml) {
        if (!MAP_OPENS[plane] || plane === "map") return servePage(env, { active: "map", content: renderDenied({ what: "The map has no such plane yet." }), owner: reader.role === "owner", reader, cache: "private, no-store", status: 404 });
        return serveMap(env, reader, plane, url);
      }
      const ans = await readMapPlane(env, reader, plane, mapReg(CAPABILITIES, MCP_TOOLS, env), { table: url.searchParams.get("table") });
      return json(ans.body, ans.status, { "cache-control": "private, no-store" });
    },
  },
  {
    // GET /contract (UI-B8a, QFAEA20A3): contracts/door.json exactly as the gate diffed it, from the generated
    // src/doorcontract.js (tools/make-door-contract.py writes both; gate.sh diffs both). Its ETag is computed once per isolate.
    test: (path, method) => path === "/contract" && method === "GET",
    run: async (c) => {
      const { request, env, url } = c;
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      if (!reader) return signInOr401(request, url, undefined, { error: "auth_required" });
      const etag = (contractEtag ||= '"' + (await sha256(DOOR_TEXT)).slice(0, 32) + '"');
      const headers = { "content-type": "application/json; charset=utf-8", etag, "cache-control": "private, max-age=300" };
      if ((request.headers.get("if-none-match") || "") === etag) return new Response(null, { status: 304, headers });
      return new Response(DOOR_TEXT, { headers });
    },
  },
  {
    test: (path, method) => path === "/backfill" && method === "POST",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      const gate = await requireOwnerKey(request, env, url);
      if (gate) return gate;
      const res = await backfillReports(env, url.origin, url.searchParams.get("eval") === "1");
      return json(res);
    },
  },
    // The D1 -> R2 nightly backup, on demand (PRD A3, ADR-082 §4). Owner-only, like
    // /backfill above; ?eval=1 is accepted (not a permission bypass) so the eval suite
    // can prove the seam without a separate code path — see backupDump()'s header.
  {
    test: (path, method) => path === "/backup-dump" && method === "POST",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      const gate = await requireOwnerKey(request, env, url);
      if (gate) return gate;
      // sprint 3 S3b: ?page=<cursor> answers ONE page of the dump (src/backup.js backupPage: one bounded statement, nothing
      // written; tools/restore-local.mjs walks the cursor); without it, the whole dump to R2 as the cron writes it
      if (url.searchParams.has("page")) {
        const out = await backupPage(env, { cursor: url.searchParams.get("page"), rows: url.searchParams.get("rows") });
        return json(out, out.error ? 422 : 200, { "cache-control": "private, no-store" });
      }
      // sprint 6, 6.4: into R2 under the caller's org's own prefix (src/storage.js), for every org
      const res = await backupDump(env, url.searchParams.get("eval") === "1");
      return json(res);
    },
  },
  {
    // UI-B12b: Control, the screen, on GET /control for every signed-in reader (QC5F82B90: admin holds admin functions, not
    // extra tabs), rendered from the SAME readControl as GET /control/people (src/controlread.js) by src/controlpage.js; a
    // non-admin sees every admin control DISABLED with its reason (QB963C7EE amended by F6). POST /control is the ONE admin write
    // door (UI-B12a): the owner check, the read-only refusal and csrfRefused below are the enforcement,
    // independent of the render. Every answer is 200 + the page with its flash (the response contract, D2).
    test: (path, method) => path === "/control",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      if (!reader) return signInOr401(request, url);
      const owner = reader.role === "owner";
      if (request.method !== "GET" && !owner) {
        return servePage(env, { active: "control", owner: false, reader, status: 403, cache: "private, no-store",
          content: renderDenied({ what: "Only an admin can change who holds a seat, a role or a key. Nothing was changed." }) });
      }
      // SECURITY (readiness security pass): /control resolves with readOnlyOk:true, so the OWNER's
      // read-only derived credential (resolveReadOnly, as a Bearer header) can reach here
      // as { role:"owner", readOnly:true }. It must be refused on writes — runControlAction can
      // rotate-key / set-password / add-person. core.js states the rule ("refuse person.readOnly on
      // anything but GET"); this ABOVE_ROUTE bypasses the central BELOW_ROUTES guard, so it enforces it
      // inline. Same class as ADR-050 (a leaked boot link is NOT a write key). Its GET reads the page
      // with every control disabled (readControl's readOnly fold, UI-B12b).
      if (reader.readOnly && request.method !== "GET") {
        return servePage(env, { active: "control", owner: true, reader, status: 403, cache: "private, no-store",
          content: renderDenied({ what: "A read-only credential can view the control panel but cannot change it. Sign in with your full key to make changes." }) });
      }
      if (csrfRefused(request, url, reader)) {
        return servePage(env, { active: "control", owner: true, reader, status: 403, cache: "private, no-store",
          content: renderDenied({ what: "That change did not come from this site, so it was refused." }) });
      }
      let flash = "";
      if (request.method === "POST") {
        const fd = await request.formData().catch(() => null);
        const action = fd ? String(fd.get("action") || "") : "";
        const personId = fd ? String(fd.get("personId") || "") : "";
        if (fd) { flash = await runControlAction({ action, fd, personId, env, reader }) /* the acting owner — remove-person refuses self */; clearReqMemo(env); /* people rows may have changed — this request re-reads them */ }
      }
      // the page is the JSON's own read (D1: one read, two faces), no statement of its own; servePage draws the shell with the
      // seam's read scope (READ_SCOPE rides this request's env), so /control?project=P names P on the top-bar chip (U-TOPBAR)
      const tenant = await getTenantConfig(env);
      const read = await readControl(env, reader, { eval: url.searchParams.get("eval") === "1", all: url.searchParams.get("all") === "1", deploy: deployMetaFrom(env) });
      // sprint 3 S3b: the beta measures, read for the admin only (three indexed statements, src/measures.js); a failed read draws
      // no Measures card (the page stands without it); a D1 quota error propagates
      const measures = owner && !read.live ? await readMeasures(env).catch((e) => { if (isD1Quota(e)) throw e; return null; }) : null;
      // G2 item 9: the newest backup's result and time, for the admin (one statement; a failed read draws "Not read")
      const backup = owner && !read.live ? await lastBackup(env).catch((e) => { if (isD1Quota(e)) throw e; return { unread: true }; }) : undefined;
      // sprint 8, 8.4: the plan and its usage, for the admin (ONE statement, src/plans.js planShownOf); a failed read draws no Plan card
      const plan = owner && !read.live ? await planShownOf(env).catch((e) => { if (isD1Quota(e)) throw e; return null; }) : null;
      return servePage(env, { active: "control", changes: "control", content: renderControl(read, { flash, brand: tenant.brand, origin: url.origin, engine: tenant.brand && tenant.brand.engine, measures, backup, plan }), owner, reader, cache: "private, no-store", tenant, includeEval: !!read.eval });
    },
  },
  {
    test: (path, method) => path === "/install",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      const ownerLabel = ownerName(await resolveOwner(env));
      const engineName = String((await getTenantConfig(env)).brand.engine || "").replace(/['\\]/g, ""); // rides the seam; quote-safe inside the sh script
      const script = `#!/bin/sh
# ${engineName} — day 0. One command, no GitHub account, no repo access.
#   curl -fsSL ${url.origin}/install | sh
set -e
BASE="${url.origin}"
SKILLS="\${SKILLS_DIR:-$HOME/.claude/skills}"
printf '${engineName} — sign in once.\n'
# under curl-pipe-sh the script itself is stdin, so prompts must read from the terminal
EMAIL="\${SHARINGU_EMAIL:-}"; PASSWORD="\${SHARINGU_PASSWORD:-}"
if [ -z "$EMAIL" ]; then printf 'Email: '; read EMAIL < /dev/tty; fi
if [ -z "$PASSWORD" ]; then
  stty -echo < /dev/tty 2>/dev/null || true
  printf 'Password: '; read PASSWORD < /dev/tty
  stty echo < /dev/tty 2>/dev/null || true
  printf '\n'
fi
RESP=$(printf '{"email":"%s","password":"%s","device":"%s"}' "$EMAIL" "$PASSWORD" "$(hostname)" \\
  | curl -sS -X POST "$BASE/login" -H 'content-type: application/json' --data-binary @-)
case "$RESP" in
  *too_many_attempts*) printf '\nToo many attempts for that email. Wait 15 minutes and try again.\n'; exit 1;;
  *invalid_login*)     printf '\nThat email and passphrase do not match. Check both, or ask ${ownerLabel} to confirm your account exists.\n'; exit 1;;
esac
TOKEN=$(printf '%s' "$RESP" | tr ',' '\n' | grep '"token"' | cut -d'"' -f4)
WHO=$(printf '%s' "$RESP"   | tr ',' '\n' | grep '"person"' | cut -d'"' -f4)
[ -n "$TOKEN" ] || { printf 'No token returned.\n'; exit 1; }
printf '%s' "$TOKEN" > "$HOME/.sharingu-agent-r-token"; chmod 600 "$HOME/.sharingu-agent-r-token"
printf '%s' "$BASE" > "$HOME/.sharingu-agent-r-url"
command -v python3 >/dev/null 2>&1 || {
  printf 'This installer needs python3, which is not on this machine.\n'
  printf 'Install it (on a Mac: xcode-select --install) and run this again.\n'; exit 1; }
mkdir -p "$SKILLS"
curl -fsS -H "Authorization: Bearer $TOKEN" "$BASE/ring" | SKILLS="$SKILLS" BASE="$BASE" python3 -c '
import json,sys,os
ring=json.load(sys.stdin); base=os.environ["SKILLS"]
for name,body in ring["skills"].items():
    d=os.path.join(base,name); os.makedirs(d,exist_ok=True)
    open(os.path.join(d,"SKILL.md"),"w").write(body)
    open(os.path.join(d,"worker.txt"),"w").write(os.environ["BASE"])
print("  installed:", " ".join("/"+k for k in sorted(ring["skills"])))
' || { printf 'Could not fetch the ring.\n'; exit 1; }
printf '\nWelcome, %s. Open Claude in any project and ask it to call whoami.\n' "$WHO"
`;
      return new Response(script, { headers: { "content-type": "text/x-shellscript; charset=utf-8" } });
    },
  },
    // ---- capability discovery: R asks the Worker what it can do (ADR-039) ----
  {
    test: (path, method) => path === "/capabilities" && method === "GET",
    // D5 (MCP.md §9 demand 9): the capability inventory, GENERATED from the contract (tools/make-door-contract.py writes it into
    // contracts/door.json `inventory`; the gate regenerates and diffs it), never typed here. Each tool is marked callable for
    // THIS reader by the one filter tools/list uses (src/mcp.js toolCallable); each route by its auth.
    run: async (c) => {
      const { request, env, url } = c;
      const reader = await resolveReader(request, env, url, { readOnlyOk: true });
      if (!reader) return signInOr401(request, url, undefined, { error: "unauthorized" });
      const inv = DOOR.inventory || { tools: [], routes: [] };
      const rows = new Map(MCP_TOOLS.map((t) => [t.name, t]));
      const routeOk = (r) => r.who !== "the owner" || reader.role === "owner";
      return json({
        note: inv.note,
        you: { person: reader.name, role: reader.role },
        tools: inv.tools.map((t) => ({ ...t, callable: rows.has(t.name) && toolCallable(rows.get(t.name), reader) })),
        routes: inv.routes.map((r) => ({ ...r, callable: routeOk(r) })),
        failures: inv.failures,
      }, 200, { "cache-control": "private, no-store" });
    },
  },
    // ---- the deeplink: a banked dump, fetched back by id: a Bearer header or a session cookie, never a key in the address (G2 M2). ----
    // Without this, /artifact was write-only: you could bank a dump and never cite it again.
  {
    test: (path, method) => path.startsWith("/artifact/") && method === "GET",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      const id = path.slice("/artifact/".length).replace(/[^a-zA-Z0-9-]/g, "");
      // D1b item 1: who is asking is settled BEFORE the lookup, and the lookup's answer never tells a caller more than it may
      // know. ADR-055: a public artifact serves to anyone with the link. Otherwise: no credential is 401 whether or not the id
      // exists (it used to be 401 for a real id and 404 for a made-up one: an existence oracle); a signed-in reader who is
      // neither the owner nor its author reads not_found, exactly as for an id that does not exist (it used to be 403).
      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      const row = await db(env).prepare(
        "SELECT a.*, p.name AS by_name FROM artifacts a JOIN people p ON p.id = a.person_id WHERE a.id = ?"
      ).bind(id).first();
      if (!row || row.group_tag !== "public") {
        if (!reader) return signInOr401(request, url, undefined, { error: "unauthorized", hint: "Authorization: Bearer <your key>, or sign in" });
        if (!(await mayReadArtifact(reader, row, env))) return json({ error: "not_found", id }, 404);
      }
      if (url.searchParams.get("meta") === "1") {
        return json({
          id: row.id, title: row.title, kind: row.kind, group: row.group_tag,
          by: row.by_name, at: row.created_at, bytes: row.bytes, sha256: row.sha256,
          deeplink: orgUrl(url.origin, "/artifact/" + row.id),
        });
      }
      // sprint 6, 6.4: the body lies under the ROW's org (src/storage.js storeOfRow): read by its exact id, after the row's own rule
      // above (a public file answers from any org, ADR-055 as ruled; anything else only inside its own org)
      const obj = await storeOfRow(env, row).get(row.r2_key);
      if (!obj) return json({ error: "blob_missing", key: row.r2_key }, 410);
      const ctMap = { html: "text/html", image: "image/png", svg: "image/svg+xml",
                      pdf: "application/pdf", json: "application/json", other: "application/octet-stream" };
      const ascii = (s) => String(s || "").replace(/[^\x20-\x7E]/g, "").slice(0, 180);
      const extMap = { html: "html", image: "png", svg: "svg", pdf: "pdf", json: "json", other: "bin" };
      const hdrs = {
        "content-type": ctMap[row.kind] || "application/octet-stream",
        "x-artifact-title": ascii(row.title),
        "x-artifact-by": ascii(row.by_name),
        "x-artifact-at": ascii(row.created_at),
      };
      // A banked dump is SUBMITTER-SUPPLIED markup served from this origin. G2 M2 (the independent review: a member's file,
      // opened by another person, ran script with unrestricted network and read the viewer's key off its own address): it is a
      // DOCUMENT, never a program — `sandbox` with no allow-scripts (no script runs; an opaque origin: no cookie, no storage,
      // no same-origin reach into the app), and a policy that loads nothing from anywhere (default-src 'none': no image, font,
      // style sheet, frame or fetch beyond the file's own inline styles and data: images), sends no form and sets no base;
      // nosniff on every kind, so a file is read only as the type it was banked as.
      hdrs["x-content-type-options"] = "nosniff";
      if (row.kind === "html" || row.kind === "svg") hdrs["content-security-policy"] = ARTIFACT_CSP;
      if (url.searchParams.get("download")) {
        const fn = (ascii(row.title).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "artifact") + "." + (extMap[row.kind] || "bin");
        hdrs["content-disposition"] = `attachment; filename="${fn}"`;
      }
      return new Response(await obj.arrayBuffer(), { headers: hdrs });
    },
  },
    // ---- the standard (sprint 3, B1): GET /formats, the twin of the formats tool (src/formats.js formatsAnswer, generated from
    // the two registries). Any signed-in reader, no seat and no project: it reads nothing but the bundle. ----
  {
    test: (path, method) => path === "/formats" && method === "GET",
    run: async (c) => {
      const { request, env, url } = c;
      const reader = await resolveReader(request, env, url, { readOnlyOk: true });
      if (!reader) return signInOr401(request, url, undefined, { error: "unauthorized", hint: "Authorization: Bearer <your key>, or sign in" });
      const out = formatsAnswer({ kind: url.searchParams.get("kind") ?? undefined, shape: url.searchParams.get("shape") ?? undefined });
      return json(out, out.error ? 404 : 200, { "cache-control": "private, max-age=300" });
    },
  },
    // ---- the library: the project's docs (k_docs), the twins of `read {kind: "doc"}` and `read {ref: "doc/<path>"}` (src/docread.js libraryFor, docFor: the
    // same role rule). A Bearer header or a session cookie, never a key in the address (G2 M2). ----
  {
    test: (path, method) => (path === "/library" || path.startsWith("/doc/")) && method === "GET",
    run: async (c) => {
      const { request, env, url, path } = c;
      const reader = await resolveReader(request, env, url, { readOnlyOk: true });
      if (!reader) return signInOr401(request, url, undefined, { error: "unauthorized", hint: "Authorization: Bearer <your key>, or sign in" });
      // sprint 3 B5: a browser gets the Library page (src/extract.js libraryRead; with ?q= the search tool's own read), on the
      // seam's scoped env, the same project rule as the library tool; a script keeps the JSON list below
      if (path === "/library" && wantsHtml(request)) {
        const q = String(url.searchParams.get("q") || "").trim().slice(0, 200);
        const [lib, found] = await Promise.all([q ? Promise.resolve(null) : libraryRead(env, reader, { kind: url.searchParams.get("kind") }), q ? searchAnswer(env, reader, { q }) : Promise.resolve(null)]);
        return servePage(env, { active: "library", content: renderLibraryPage(lib, found, { q, project: url.searchParams.get("project") || "" }), owner: reader.role === "owner", reader, cache: "private, no-store" });
      }
      if (path === "/library") {
        const lib = await libraryFor(env, reader);
        const docs = lib.docs.map((d) => ({ doc: d, title: lib.titles[d] || null, link: orgUrl(url.origin, "/doc/" + d) }));
        return json({ project: lib.project, startHere: lib.startHere, note: lib.note, count: docs.length, docs, ...(lib.empty ? { empty: lib.empty } : {}) }, 200, { "cache-control": "private, no-store" });
      }
      let rel = ""; try { rel = decodeURIComponent(path.slice("/doc/".length)); } catch { rel = ""; }
      // sprint 3 B1: a browser gets the doc drawn in the shell (its confidence and as-of date with it); a script the markdown
      if (/text\/html/.test(c.request.headers.get("accept") || "")) {
        const d = await docRecordFor(env, reader, rel);
        const status = d.error === "path_required" ? 400 : d.error ? 404 : 200;   // a hidden doc is not_found (D1b item 2)
        const content = d.error ? renderDenied({ what: "No doc is filed at that path in this project." }) : renderDocPage(d);
        return servePage(env, { active: "doc", content, owner: reader.role === "owner", reader, cache: "private, no-store", status });
      }
      const out = await docFor(env, reader, rel);
      if (typeof out !== "string") return json(out, out.error === "path_required" ? 400 : 404);
      return text(out, { "x-doc": rel, "cache-control": "private, no-store" });
    },
  },
    // ---- MCP endpoint (ADR-044). Bearer auth through the SAME resolver as everything else. ----
  {
    test: (path, method) => path === "/mcp" && method === "POST",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      return await handleMcp(request, env, ctx, url, { MCP_TOOLS, CAPABILITIES, VERSION });
    },
  },
  {
    // sprint 3, D3 (Streamable HTTP): the door offers no standalone GET stream and keeps no session to end, so GET and
    // DELETE on /mcp answer 405, as the transport specifies (a client then goes on with POST alone)
    test: (path, method) => path === "/mcp" && (method === "GET" || method === "DELETE"),
    run: async () => new Response(null, { status: 405, headers: { allow: "POST" } }),
  },
];

const BELOW_ROUTES_1 = [
  {
    test: (path, method) => path === "/signout" && method === "POST",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      // Bearer first, else the session cookie (M-ADR-024 — this route is reachable by a cookie
      // session now). Honest result: `signedOut` reports whether a live row was actually revoked
      // (security review 2026-09-05, finding 4 — it used to hash "" and answer true).
      const header = request.headers.get("authorization") || "";
      const tok = (header.startsWith("Bearer ") ? header.slice(7).trim() : "") || sessionCookieToken(request);
      if (!tok) return json({ error: "no_session", note: "Nothing to sign out: no session token on this request." }, 400);
      const r = await db(env).prepare("UPDATE tokens SET revoked = 1 WHERE token_hash = ? AND revoked = 0").bind(await sha256(tok)).run();
      return json({ signedOut: (r?.meta?.changes ?? 0) > 0 });
    },
  },
    // ---- updates: what changed for you since you were last here and what waits on you (D5: heartbeat, state and thread folded
    // into one read). The twin of the `updates` tool reaches it through the TOOL'S OWN DOOR (src/mcp.js callTool): the same
    // owner and scope checks, the same project scope (projectCallScope over ?project=) and the same project note, so the two
    // twins answer the same project for every caller (D5 Part 4 b: GET /updates read the seam's scope and answered no project in
    // a one-project org where its tool answered the sole project). ----
  {
    test: (path, method) => path === "/updates" && method === "GET",
    run: async (c) => {
      const { env, url, person } = c;
      const sp = url.searchParams;
      const args = { ...(sp.get("project") != null ? { project: sp.get("project") } : {}), ...(sp.get("eval") != null ? { eval: sp.get("eval") } : {}), ...(sp.get("limit") != null ? { limit: sp.get("limit") } : {}) };
      const out = await callTool("updates", args, person, env, url, MCP_TOOLS, { CAPABILITIES });
      return json(out, out && out.error ? (out.error === "project_forbidden" ? 403 : 422) : 200, { "cache-control": "private, no-store" });
    },
  },
  // ---- UI-B12a: Control's ONE read (src/controlread.js readControl), JSON for every signed-in reader, scoped by who they
  // are; below the gate, so anonymous is 401 JSON. B12b's GET /control page renders the same object. ----
  {
    test: (path, method) => path === "/control/people" && method === "GET",
    run: async (c) => {
      const { env, url, person } = c;
      const d = await readControl(env, person, { eval: url.searchParams.get("eval") === "1", all: url.searchParams.get("all") === "1", deploy: deployMetaFrom(env) });
      return json(d, 200, { "cache-control": "private, no-store" });
    },
  },
  {
    // sprint 3 S3b: the beta measures (src/measures.js), the admin's read and export. authority: role owner only (a member, a
    // Partner and the suites' seats are refused owner_only); the export holds counts, dates, project keys and a goal id, no person.
    test: (path, method) => path === "/control/measures" && method === "GET",
    run: async (c) => {
      const { env, url, person } = c;
      if (!person || person.role !== "owner") return json({ error: "owner_only", note: "Only an admin reads or exports the beta measures." }, 403);
      const [read, tenant] = await Promise.all([readMeasures(env), getTenantConfig(env)]);
      const out = exportOf(read, { org: tenant && tenant.brand && tenant.brand.org });
      if (url.searchParams.get("download") === "1") {
        return new Response(JSON.stringify(out, null, 2), { status: 200, headers: { "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="sharingu-measures-${read.at.slice(0, 10)}.json"`, "cache-control": "private, no-store" } });
      }
      return json(out, 200, { "cache-control": "private, no-store" });
    },
  },
  {
    test: (path, method) => path === "/whoami",
    run: async (c) => {
      const { request, env, ctx, url, path, person } = c;
      return json(await whoamiFor(person, env)); // one packet, both doors (M-ADR-008a T10)
    },
  },
  // ---- open items (D5): the twin of the `open_items` tool, ONE function (src/openitems.js) ----
  {
    test: (path, method) => path === "/open-items" && method === "POST",
    run: async (c) => {
      const { request, env, person } = c;
      const body = await request.json().catch(() => ({}));
      if (carriesTranscript(body)) return json({ error: "transcript_rejected" }, 422);
      const { status, ...out } = await openItems(person, env, body || {});
      return json(out, status);
    },
  },
  // ---- ask (D5): the twin of the `ask` tool, ONE function (src/ask.js); POST /event folded into POST /ask, record_event into file ----
  {
    test: (path, method) => path === "/ask" && method === "POST",
    run: async (c) => {
      const { request, env, person } = c;
      const body = await request.json().catch(() => ({}));
      if (carriesTranscript(body)) return json({ error: "transcript_rejected" }, 422);
      const { status, ...out } = await askOwner(person, env, body || {});
      return json(out, status);
    },
  },
  {
    test: (path, method) => path === "/grade" && method === "POST",
    run: async (c) => {
      const { request, env, person } = c;
      const body = await request.json().catch(() => ({}));
      if (carriesTranscript(body)) return json({ error: "transcript_rejected" }, 422);
      // U-MCP-tail-c N2 (QE6B9CEBA): a body naming `project` is scoped by the SAME helper as submit_grade (mcp.js
      // projectCallScope, callTool's D4 block) — a project the caller may not read is 403 project_forbidden, nothing
      // filed; else the grade runs on the re-scoped env with the re-stamped person. No `project`: the seam's scope, as before.
      let who = person, scoped = env;
      if (body && body.project !== undefined) {
        const r = await projectCallScope(person, body.project, env);
        if (r.error) return json(r, 403);
        ({ env: scoped, person: who } = r);
      }
      const out = await gradeCheck(who, scoped, { ...body, via: body.via || "http" });
      return json(out, out.error === "unknown_check" ? 404 : out.error ? 422 : 200);
    },
  },
  // ---- R1: regrade from a page (sprint 4): the REST twin of the `regrade` tool, ONE function (src/regrade.js regradeAnswer).
  // Below the gate: a read-only credential (403) and a cross-origin cookie write are refused before this runs. The body's
  // `project` is scoped by the SAME helper as the tool (mcp.js projectCallScope), as POST /grade's is. A form is the press on
  // a flow's view, a Map node's inspector or the Impact view: its first press answers the plan as a page (nothing observed or
  // written), its confirm press (confirm=1) observes and files, then goes back to next (same-origin only). ----
  {
    test: (path, method) => path === "/regrade" && method === "POST",
    run: async (c) => {
      const { request, env, url, person } = c;
      const isForm = (request.headers.get("content-type") || "").includes("form");
      let a = {}, next = "";
      if (isForm) {
        const fd = await request.formData().catch(() => null);
        if (fd) for (const k of ["project", "flow", "node", "checks", "confirm", "eval"]) if (fd.get(k) != null && fd.get(k) !== "") a[k] = String(fd.get(k));
        next = sameOriginPath(fd ? String(fd.get("next") || "") : "", url.origin);
      } else a = (await request.json().catch(() => ({}))) || {};
      if (carriesTranscript(a)) return json({ error: "transcript_rejected" }, 422);
      let who = person, scoped = env;
      if (a.project !== undefined) {
        const r = await projectCallScope(person, a.project, env);
        if (r.error) return json(r, 403);
        ({ env: scoped, person: who } = r);
      }
      const { http, ...body } = await regradeAnswer(scoped, who, a, { via: isForm ? "page" : "http" });
      if (!isForm || body.error) return json(body, http || 200, { "cache-control": "private, no-store" });
      if (body.preview) {
        const penv = { ...scoped, [READ_SCOPE]: { project: body.project, named: true, active: false } };
        return servePage(penv, { active: "regrade", content: renderRegradePage(body, { next, eval: a.eval === "1" }), owner: who.role === "owner", reader: who, cache: "private, no-store" });
      }
      const back = next || (body.scope.kind === "flow" ? orgPath(`/map?flow=${encodeURIComponent(body.scope.ref.replace(/^flow:/, ""))}&project=${encodeURIComponent(body.project)}`)
        : body.scope.kind === "node" ? orgPath(`/map?node=${encodeURIComponent(body.scope.ref)}&project=${encodeURIComponent(body.project)}`) : orgPath(`/map?project=${encodeURIComponent(body.project)}`));
      return new Response(null, { status: 303, headers: { location: back, "cache-control": "private, no-store" } });
    },
  },
  // ---- Broadcast's two verbs through the door (sprint 3, D2 · B7; MCP.md §5): the REST twins of the `publish` and `equip`
  // tools, ONE function each (src/broadcast.js publishAnswer / equipAnswer). Below the gate: a read-only credential (403) and
  // a cross-origin cookie write are refused before this runs; a key in the URL never reaches here (resolveAny reads the
  // header or the session cookie). Who may: src/broadcast.js mayPublish / mayEquip (the role CLASS: a Partner is refused).
  // A press in a signed-in browser (the Broadcast page's forms) is the person's confirm and files at once (a form goes back
  // to /broadcast?published=<id> | ?equipped=<id>); any other caller previews first and files with confirm: true. ----
  {
    test: (path, method) => (path === "/broadcast/publish" || path === "/broadcast/equip") && method === "POST",
    run: async (c) => {
      const { request, env, path, person } = c;
      const isPublish = path === "/broadcast/publish";
      const isForm = (request.headers.get("content-type") || "").includes("form");
      let a = {};
      if (isForm) {
        const fd = await request.formData().catch(() => null);
        if (fd) for (const k of ["id", "slug", "v", "project", "eval", "confirm"]) if (fd.get(k) != null) a[k] = String(fd.get(k));
      } else a = (await request.json().catch(() => ({}))) || {};
      if (carriesTranscript(a)) return json({ error: "transcript_rejected" }, 422);
      const press = person.viaCookie === true;   // a signed-in browser's press is its own confirm
      const args = isPublish ? { id: a.id, eval: a.eval, confirm: a.confirm } : { slug: a.slug, v: a.v, project: a.project, eval: a.eval, confirm: a.confirm };
      const { http, ...body } = isPublish ? await publishAnswer(env, person, args, { press, via: press ? "broadcast" : "http" })
        : await equipAnswer(env, person, args, { press, via: press ? "broadcast" : "http" });
      if (!isForm || body.error || body.preview) return json(body, http || 200, { "cache-control": "private, no-store" });
      const q = `${isPublish ? "published" : "equipped"}=${encodeURIComponent(body.id)}${body.doc ? `&doc=${encodeURIComponent(body.doc)}` : ""}${a.eval === "1" || a.eval === true ? "&eval=1" : ""}`;
      return new Response(null, { status: 303, headers: { location: orgPath(`/broadcast?${q}`), "cache-control": "private, no-store" } });
    } },
  // ---- M6: the Restore press (src/knowledge/screens.js restoreAnswer): a previous take of a screen's frame made its newest again,
  // through the knowledge write door as the person. Below the gate: a read-only credential (403) and a cross-origin cookie write
  // are refused before this runs. The body's `project` is scoped by the SAME helper as the tools (mcp.js projectCallScope), as
  // POST /regrade's is. A form (the inspector's press) files at once and goes back to next, or the page it came from (the Map's
  // inspector or the Screens view, same-origin only), else the screen on the Map. ----
  {
    test: (path, method) => path === "/render/restore" && method === "POST",
    run: async (c) => {
      const { request, env, url, person } = c;
      const isForm = (request.headers.get("content-type") || "").includes("form");
      let a = {}, next = "";
      if (isForm) {
        const fd = await request.formData().catch(() => null);
        if (fd) for (const k of ["project", "screen", "state", "variant", "hash", "confirm", "eval"]) if (fd.get(k) != null) a[k] = String(fd.get(k));
        next = sameOriginPath(fd ? String(fd.get("next") || "") : "", url.origin);
        if (!next) { try { const ref = new URL(request.headers.get("referer") || ""); if (ref.origin === url.origin) next = sameOriginPath(ref.pathname + ref.search, url.origin); } catch { next = ""; } }
      } else a = (await request.json().catch(() => ({}))) || {};
      if (carriesTranscript(a)) return json({ error: "transcript_rejected" }, 422);
      let who = person, scoped = env;
      if (a.project !== undefined && a.project !== "") {
        const r = await projectCallScope(person, a.project, env);
        if (r.error) return json(r, 403);
        ({ env: scoped, person: who } = r);
      }
      const press = person.viaCookie === true;   // a signed-in browser's press is its own confirm
      const { http, ...body } = await restoreAnswer(scoped, who, a, { press, via: press ? "map" : "http" });
      if (!isForm || body.error || body.preview) return json(body, http || 200, { "cache-control": "private, no-store" });
      const back = next || orgPath(`/map?node=${encodeURIComponent(String(a.screen || ""))}${body.project ? `&project=${encodeURIComponent(body.project)}` : ""}`);
      return new Response(null, { status: 303, headers: { location: back, "cache-control": "private, no-store" } });
    },
  },
  // the three write tools' twins (sprint 19; src/preview.js filePart): below the gate, so a read-only credential (403) and a
  // cross-origin cookie write are refused before this runs; filePart scopes the preview's own project with projectCallScope,
  // reads the preview only for its author and files only the path's operation
  {
    test: (path, method) => method === "POST" && !!restWriteTool(path),
    run: async (c) => {
      const { request, env, url, person, path } = c;
      const body = (await request.json().catch(() => ({}))) || {};
      if (carriesTranscript(body)) return json({ error: "transcript_rejected" }, 422);
      const out = await filePart(person, body, env, { via: "http", origin: url.origin, tool: restWriteTool(path) });
      const st = { preview_not_found: 404, project_forbidden: 403, read_only_credential: 403, preview_filed: 409, preview_expired: 409, preview_changed: 409 };
      return json(out, out.error ? st[out.error] || 422 : 200, { "cache-control": "private, no-store" });
    },
  },
  // one preview's page (sprint 3, B2): its author, or anyone who may read its project; anything else the usual 404
  {
    test: (path, method) => path.startsWith("/preview/") && method === "GET",
    run: async (c) => {
      const { request, env, path, person } = c;
      let id = "";
      try { id = decodeURIComponent(path.slice("/preview/".length)); } catch { id = ""; }
      let view = null, down = false;
      try { view = await readPreviewView(env, person, id); } catch (e) { if (isD1Quota(e)) throw e; down = true; }
      if (!view && !down) return wantsHtml(request)
        ? servePage(env, { active: "preview", content: renderDenied({ what: "No such preview here." }), owner: person.role === "owner", reader: person, cache: "private, no-store", status: 404 })
        : json({ error: "not_found", path }, 404);
      if (!wantsHtml(request)) {
        if (down) return json({ error: "unreachable", note: "The preview could not be read right now." }, 503);
        const { scopedEnv, ...out } = view;
        return json(out, 200, { "cache-control": "private, no-store" });
      }
      // the page wears its own project's scope (the top bar's chip names the project the preview files into)
      const penv = view && view.scopedEnv ? { ...view.scopedEnv, [READ_SCOPE]: { project: view.project, named: true, active: false } } : env;
      return servePage(penv, { active: "preview", content: renderPreviewPage(view, { down }), owner: person.role === "owner", reader: person, cache: "private, no-store", status: down ? 503 : 200 });
    },
  },
  // rule_question's twin: the owner rules an open question (src/knowledge/decisions.js ruleQuestion, which checks the owner
  // again). The gate above has refused a read-only credential and a cross-origin cookie write; the body's project is
  // scoped by the SAME projectCallScope callTool runs.
  {
    test: (path, method) => path.startsWith("/questions/") && path.endsWith("/rule") && method === "POST",
    run: async (c) => {
      const { request, env, path, person } = c;
      if (person.role !== "owner") return json({ error: "owner_only", note: "Only the owner rules a question. Answer it with POST /respond: your answer waits with the owner." }, 403);
      let qid = "";
      try { qid = decodeURIComponent(path.slice("/questions/".length, -"/rule".length)); } catch { qid = ""; }
      const body = (await request.json().catch(() => ({}))) || {};
      if (carriesTranscript(body)) return json({ error: "transcript_rejected" }, 422);
      const r = await projectCallScope(person, body.project, env);
      if (r.error) return json(r, 403);
      const out = await ruleQuestion(r.person, r.env, { project: body.project, qid, choice: body.choice, rationale: body.rationale, eval: body.eval, via: "http" });
      const st = { owner_only: 403, read_only_credential: 403, project_forbidden: 403, unknown_qid: 404, not_open: 409, write_failed: 500 };
      return json(out, out.error ? st[out.error] || 422 : 200);
    },
  },
];

const BELOW_ROUTES_2 = [
  {
    test: (path, method) => path === "/storage" && method === "GET",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      return handleStorage(env);
    },
  },
  {
    test: (path, method) => path === "/log" && method === "GET",
    run: async (c) => {
      const { request, env, ctx, url, path } = c;
      return handleLog(env, url);
    },
  },
  {
    test: (path, method) => path.startsWith("/contribution/") && path.endsWith("/decide") && method === "POST",
    run: async (c) => {
      const { request, env, ctx, url, path, person } = c;
      if (person.role !== "owner") return json({ error: "owner_only" }, 403);
      const txId = path.slice("/contribution/".length, -"/decide".length).replace(/[^A-Za-z0-9-]/g, "");
      // RULINGS ON THE PAGE (one-mind WP7): the page's form posts application/x-www-form-urlencoded (verdict · note · next)
      // beside the JSON body agents send — one seam (decideTransmission), two bodies. A form caller is a person on glass:
      // a redirect, never JSON — to `next` (same-origin only) or the row's own page; already_decided lands on the page too.
      const ct = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const isForm = ct === "application/x-www-form-urlencoded" || ct === "multipart/form-data";
      let body = {};
      if (isForm) {
        const fd = await request.formData().catch(() => null);
        if (fd) body = { verdict: String(fd.get("verdict") || ""), note: String(fd.get("note") || ""), next: String(fd.get("next") || "") };
      } else {
        body = await request.json().catch(() => ({}));
      }
      const res = await decideTransmission(person, txId, body, env);
      if (isForm && (!res.error || res.error === "already_decided")) {
        const dest = sameOriginPath(body.next, url.origin) || orgPath(`/contribution/${txId}?page=1`);
        return new Response(null, { status: 302, headers: { location: dest } });
      }
      return json(res, res.error === "not_found" ? 404 : res.error === "already_decided" ? 409 : res.error ? 422 : 200);
    },
  },
  // ---- impact and carry-forward (sprint 3, B4; src/impact.js, src/pickup.js) ----
  // GET /contribution/:id/impact: the Impact view (a browser) or its JSON, the `impact` tool's own answer for {contribution}.
  // The row is read scoped to the reader AND the reader must hold a read scope on its project (src/impact.js readImpactRow);
  // anything else is the same 404 a missing id answers.
  {
    test: (path, method) => method === "GET" && /^\/contribution\/[^/]+\/impact$/.test(path),
    run: async (c) => {
      const { request, env, path, person } = c;
      const id = path.slice("/contribution/".length, -"/impact".length).replace(/[^A-Za-z0-9-]/g, "");
      const got = await readImpactRow(env, person, id);
      if (got.error) return wantsHtml(request)
        ? servePage(env, { active: "transmission", content: renderDenied({ what: "No such contribution here." }), owner: person.role === "owner", reader: person, cache: "private, no-store", status: 404 })
        : json({ error: "not_found", id }, 404);
      const imp = { ...(await impactFor(got.env, got.project, refsOfRow(got.row), { row: got.row })), url: orgPath(`/contribution/${encodeURIComponent(got.row.id)}/impact`) };
      if (!wantsHtml(request)) return json(imp, 200, { "cache-control": "private, no-store" });
      const penv = got.project ? { ...got.env, [READ_SCOPE]: { project: got.project, named: true, active: false } } : env;
      return servePage(penv, { active: "transmission", content: renderImpactPage(imp), owner: person.role === "owner", reader: person, cache: "private, no-store" });
    },
  },
  // POST /contribution/:id/pick-up: the pick_up tool's twin (src/pickup.js pickUp, its rules there). A form (the contribution
  // page's buttons: action pick | done | release, note) is sent back to the page; JSON gets the answer.
  {
    test: (path, method) => method === "POST" && /^\/contribution\/[^/]+\/pick-up$/.test(path),
    run: async (c) => {
      const { request, env, url, path, person } = c;
      const id = path.slice("/contribution/".length, -"/pick-up".length).replace(/[^A-Za-z0-9-]/g, "");
      const ct = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const isForm = ct === "application/x-www-form-urlencoded" || ct === "multipart/form-data";
      let a = {};
      if (isForm) {
        const fd = await request.formData().catch(() => null);
        const act = fd ? String(fd.get("action") || "pick") : "pick";
        a = { id, done: act === "done", release: act === "release", note: fd && fd.get("note") != null ? String(fd.get("note")) : undefined };
      } else {
        const b = await request.json().catch(() => ({}));
        a = { ...b, id };
      }
      const out = await pickUp(person, env, a);
      if (isForm) return new Response(null, { status: 302, headers: { location: orgPath(`/contribution/${encodeURIComponent(id)}?page=1`) } });
      const st = { not_found: 404, id_required: 422, no_next_action: 422, next_taken: 409, next_done: 409, not_picked_up: 409, release_forbidden: 403 };
      return json(out, out.error ? st[out.error] || 422 : 200, { "cache-control": "private, no-store" });
    },
  },
  // GET /impact: the `impact` tool's twin: ?contribution=<id> or ?refs=a,b on the request's project (the seam scoped it)
  {
    test: (path, method) => path === "/impact" && method === "GET",
    run: async (c) => {
      const { env, url, person } = c;
      const scope = await resolveProject(person, url.searchParams.get("project") || null, await seatsOnce(env, person.id), env);
      if (scope.error) return json(scope, 403);
      const out = await impactAnswer(scope.env, person, { contribution: url.searchParams.get("contribution") || undefined, refs: url.searchParams.get("refs") || undefined, eval: url.searchParams.get("eval") || undefined }, scope.project || null);
      return json(out, out.error === "not_found" ? 404 : out.error ? 422 : 200, { "cache-control": "private, no-store" });
    },
  },
  // ---- extract (sprint 3, B5; src/extract.js): the twins of search, read and changes, on the seam's scoped env (c.env: a GET
  // naming ?project= was checked by resolveProject and 403'd project_forbidden before any route ran) ----
  {
    test: (path, method) => (path === "/search" || path === "/read" || path === "/changes") && method === "GET",
    run: async (c) => {
      const { request, env, url, path, person } = c;
      const p = url.searchParams;
      const list = (k) => (p.get(k) ? p.get(k).split(",") : undefined);
      if (path === "/changes" && wantsHtml(request)) {
        const ch = await changesAnswer(env, person, { since: p.get("since") || undefined, tab: p.get("tab") || undefined, kinds: list("kinds"), limit: p.get("limit") || 50, eval: p.get("eval") || undefined }, { work: true, reach: "touched" });
        return servePage(env, { active: "changes", content: renderChangesPage(ch, { project: p.get("project") || "", since: p.get("since") || "", kinds: p.get("kinds") || "" }), owner: person.role === "owner", reader: person, cache: "private, no-store" });
      }
      // D2 (B7): one item's page on the new path. A card's ref draws the card's own page (src/cardpage.js, the tab its kind names
      // lit), from the SAME readAnswer the JSON and the `read` tool answer; a ref the reader may not read is the usual 404 page,
      // exactly as a missing one (authority: readAnswer's not_found). Any other ref is sent to the page that shows it (its
      // href), except a ref whose only page is this read (a check naming no node): its JSON, as before.
      if (path === "/read" && wantsHtml(request) && p.get("ref")) {
        const one = await readAnswer(env, person, { ref: p.get("ref") });
        if (one.error) return servePage(env, { active: "library", content: renderDenied({ what: one.error === "project_required" ? "Pick a project to read it." : "Nothing by that ref in this project that you may read." }),
          owner: person.role === "owner", reader: person, cache: "private, no-store", status: EXTRACT_STATUS[one.error] || 422 });
        if (one.kind === "card") return servePage(env, { active: cardTabOf(one.item), content: renderCardPage(one), owner: person.role === "owner", reader: person, cache: "private, no-store" });
        if (one.href && !one.href.startsWith(orgPath("/read"))) return new Response(null, { status: 302, headers: { location: one.href, "cache-control": "private, no-store" } });
        return json(one, 200, { "cache-control": "private, no-store" });
      }
      // sprint 3 S3b: ?eval=1, the tabs' switch (src/extract.js evalOn): the eval-marked rows join the answer; no scope widens
      const ev = p.get("eval") || undefined;
      const out = path === "/search" ? await searchAnswer(env, person, { q: p.get("q"), kinds: list("kinds"), limit: p.get("limit"), eval: ev })
        : path === "/read" ? await readAnswer(env, person, { ref: p.get("ref") || undefined, kind: p.get("kind") || undefined, limit: p.get("limit"), after: p.get("after") || undefined, cardKind: p.get("cardKind") || undefined, status: p.get("status") || undefined, q: p.get("q") || undefined, screen: p.get("screen") || undefined, eval: ev })
        : await changesAnswer(env, person, { since: p.get("since") || undefined, tab: p.get("tab") || undefined, kinds: list("kinds"), limit: p.get("limit"), eval: ev, org: p.get("org") || undefined,
          list: p.get("list") || undefined, person: p.get("person") || undefined, lane: p.get("lane") || undefined, state: p.get("state") || undefined, projects: list("projects"), before: p.get("before") || undefined });
      return json(out, out.error ? EXTRACT_STATUS[out.error] || 422 : 200, { "cache-control": "private, no-store" });
    },
  },
  {
    test: (path, method) => path.startsWith("/contribution/") && method === "GET",
    run: async (c) => {
      const { request, env, ctx, url, path, person } = c;
      const id = path.slice("/contribution/".length).replace(/[^A-Za-z0-9-]/g, "");
      // lifted to src/core.js transmissionOneFor (door-true batch, QF9C8E14A) so the
      // `read` tool (ref T-…) reads the SAME row. UI-B4a: scoped to the reader (Q0B546903) — a row
      // outside their scope is the same 404 not_found a missing id is.
      // ?page=1 → the filing page (OD4, wf-filing; UI-B4a): core.js filingFor, the same scoped row plus ONE counters
      // statement, 2 D1 in total. JSON stays the one row (transmissionOneFor).
      if (url.searchParams.get("page") === "1" || wantsHtml(request)) {
        const { grade, counters, evalView, ...row } = await filingFor(id, env, person, { includeEval: url.searchParams.get("eval") === "1" });
        if (row.error) return json({ error: row.error, id: row.id }, 404);
        const txTenant = await getTenantConfig(env);
        // sprint 3 B4: its impact (src/impact.js impactLines: one batch of four statements, only for a reader who may read
        // the project's model) and its next action with its pick-up (src/pickup.js; one names statement, only when picked)
        // (a contributor who no longer holds a seat on the project reads their row, never the project's model: no Impact region)
        let lite = null, mayImpact = false, goalTitle = null, dependNames = new Map();
        if (row.project) {
          const sc = await resolveProject(person, row.project, await seatsOnce(env, person.id), env).catch((e) => { if (isD1Quota(e)) throw e; return { error: "unreadable" }; });
          if (!sc.error) {
            mayImpact = true; lite = (await impactLines(sc.env, row.project, [row])).get(String(row.id)) || null;
            // L4: the goal it names by its TITLE (one row on k_goals' primary key, only for a reader of the project's model)
            if (row.goal_ref) goalTitle = await db(sc.env).prepare("SELECT title FROM k_goals WHERE project = ? AND id = ?").bind(row.project, String(row.goal_ref)).first("title").catch((e) => { if (isD1Quota(e)) throw e; return null; });
            // what it depends on, by NAME (one batch over the four tables' primary keys; a ref nothing names shows as its id)
            dependNames = await dependNamesOf(sc.env, row.project, row.depends).catch((e) => { if (isD1Quota(e)) throw e; return new Map(); });
          }
        }
        const pick = await pickStateOf(env, row);
        const impact = mayImpact ? impactSection(lite, row.id, { project: row.project }) : "";
        const side = nextRegion(pick, { canAct: !person.readOnly, readerId: person.id, isOwner: person.role === "owner", isContributor: row.submitter === person.id });
        const content = IMPACT_CSS + renderTransmissionPage(row, { grade, counters, origin: url.origin, canDecide: person.role === "owner", evalView, brand: txTenant.brand, ownerName: ownerName(await resolveOwner(env)), servedStamp: { publishedAt: now() }, side, impact, touchesFact: touchesFact(lite),
          names: new Map(((lite && lite.touched && lite.touched.names) || []).map((n) => [n.id, n.name])), goalTitle, dependNames });
        return servePage(env, { active: "transmission", content, owner: person.role === "owner", reader: person, cache: "private, no-store", tenant: txTenant });
      }
      const { grade, ...row } = await transmissionOneFor(id, env, person);
      if (row.error) return json({ error: row.error, id: row.id }, 404);
      return json({ ...row, grade });
    },
  },
  {
    test: (path, method) => path === "/wrap-up" && method === "POST",
    run: async (c) => {
      const { request, env, ctx, url, path, person } = c;
      return handleHandoff(request, env, person);
    },
  },
  {
    test: (path, method) => path === "/artifact" && method === "POST",
    run: async (c) => {
      const { request, env, ctx, url, path, person } = c;
      const ct = (request.headers.get("content-type") || "application/octet-stream").split(";")[0];
      const title = url.searchParams.get("title") || "untitled";
      const group = url.searchParams.get("group") || "ungrouped";
      const buf = await request.arrayBuffer();
      // ONE seam (the one-mind PRD, WP8): the composer banks a file through the same function — the
      // consent floor for traces, the storage guard, the hash, the R2 put, the two inserts, the improve note.
      const out = await bankArtifact(person, env, { bytes: buf, contentType: ct, title, group,
        screens: url.searchParams.get("screens"), states: url.searchParams.get("states"),
        isEval: isEvalMark(url.searchParams.get("eval")), origin: url.origin });
      const { status, ...body } = out;
      return json(body, status || 200);
    },
  },
];

// M-ADR-027: does this org front more than one workspace? Only then is the per-request workspace
// wrapper worth its extra reads. U-MCP-tail-b heal (the adversarial review's finding 1): THE one rule, core.js
// orgIsMultiProject — the D1 ACTIVE projects through ONE memo (a minute per isolate, pinned per request) that
// projectScopeOf reads too, so the seam's "scope it" and the reads' "null scope = project IS NULL" never disagree.
async function orgHasWorkspaces(env) {
  return await orgIsMultiProject(env);
}

// signedOutUnlessQuota(err) — review fix 8 (sprint 2): the catch the poll routes give resolveReader: a failed sign-in reads as
// signed out (null), but a D1 quota error propagates to the honest outage answer (quotaResponse), never a 401
const signedOutUnlessQuota = (e) => { if (isD1Quota(e)) throw e; return null; };

// isD1Quota(err) lives in src/util.js (UI-B2: the Decisions overlay rethrows a quota error so it reaches the
// honest outage page below instead of reading as an unreachable store).

// The honest outage page/JSON (M-ADR-032): the data store is over its daily budget until 00:00 UTC —
// say so, with the reset time, instead of a bare `error code: 1101` on every authenticated page.
function quotaResponse(request) {
  const resetIn = (() => { const n = new Date(); const r = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1); return Math.max(1, Math.round((r - n.getTime()) / 60000)); })();
  const what = `The data store is over its daily read budget; it resets at 00:00 UTC (in about ${resetIn} minutes). Nothing is lost.`;
  if ((request.headers.get("accept") || "").startsWith("text/html") || request.headers.get("sec-fetch-dest") === "document") {
    return new Response(`<!doctype html><meta charset="utf-8"><title>Over budget</title><div style="font:15px/1.5 system-ui;max-width:52ch;margin:4rem auto;padding:0 1rem"><h1 style="font-size:20px">Back at 00:00 UTC</h1><p>${what}</p></div>`, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": String(resetIn * 60) } });
  }
  return json({ error: "d1_quota", note: what, retryAfterMinutes: resetIn }, 503);
}

// R1: the paths a regrade may observe (src/regrade.js installSelfPage): the GET routes a reader may read (`auth` reader or
// none; never an owner-only page such as /log or /storage — a check is any seated member's text, and its verdict and proof
// file into the project, which every seat reads: sprint-4 review, H1), and never /logout, the one GET that changes something
// (it ends the session). Tested on the URL-normalised PATHNAME (installSelfPage), so a dot-segment path resolves first.
const OBSERVABLE_GETS = CAPABILITIES.filter((c) => c.m === "GET" && c.p !== "/logout" && (c.auth === "reader" || c.auth === "none"))
  .map((c) => new RegExp(`^${c.p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:[a-z]+/g, "[^?#]+")}(?:[?#]|$)`));
const observablePath = (pathname) => OBSERVABLE_GETS.some((re) => re.test(pathname));

// build0925-home-latency: every request gets its own timing accumulator and an env whose RAW bindings are timed
// (src/timing.js) — installed here, before the project seam copies the env (the copies keep the timed bindings).
// HTML pages and /health leave with a Server-Timing header (kind-level spans only); the body is never touched.
const workerHandler = {
  async fetch(request, env, ctx) {
    const t = newTiming();
    // tools/page-budget.mjs asks for every statement's rows (src/timing.js countRows): a bare first() then runs as all()
    if (request.headers.get("x-count-rows") === "1") t.countFirst = true;
    const tenv = timedEnv(env, t);
    // ...and one D1 read per request for the owner lookup and the read-only roster (src/reqmemo.js) — request-scoped,
    // never isolate-wide. timedEnv always hands back a fresh object, so the slot never lands on the shared env.
    if (tenv && tenv !== env) installReqMemo(tenv);
    // ...and the request's org slot (src/data.js): empty until the sign-in fills it, shared by every copy the seam makes
    if (tenv && tenv !== env) installOrgSlot(tenv);
    // ...and its plan-warning slot (sprint 8, 8.2: the REST door's count writes it, the answer below carries it)
    if (tenv && tenv !== env) installPlanNote(tenv);
    // the rail's lit tab (shell.js tabOf, L4): a page that belongs to no tab lights the one its address names (?from=<tab>);
    // stamped on the request's env (object spread carries Symbol keys through the seam), read by servePage alone
    if (tenv && tenv !== env) { try { tenv[REQ_FROM] = new URL(request.url).searchParams.get("from") || ""; } catch { /* no from */ } }
    // R1: the regrade's observation door (src/regrade.js installSelfPage): this request's own credential, its own pages
    if (tenv && tenv !== env) installSelfPage(tenv, request, env, ctx, workerHandler, observablePath);
    const path = (() => { try { return new URL(request.url).pathname.replace(/\/+$/, "") || "/"; } catch { return ""; } })();
    // sprint 7, 7.4: the request's own async context, where the router sets the org base every URL it builds starts with
    // (src/orgpath.js: never a parameter, never shared between two requests the isolate interleaves)
    return inRequest(async () => {
      try {
        const res = await routeRequest(request, tenv, ctx);
        const w = path !== "/mcp" ? planNoteOf(tenv) : null;   // the MCP door carries it in the tool's result, never the envelope
        return withServerTiming(w ? await planNoted(res, w) : res, t, path);
      }
      catch (e) { if (isD1Quota(e)) return withServerTiming(quotaResponse(request), t, path); throw e; }
    });
  },
};

const routeRequest = async (request, env, ctx) => {
  {
    const url = new URL(request.url);
    let path = url.pathname.replace(/\/+$/, "") || "/";
    const c = { request, env, ctx, url, path };

    // the brand's faces (src/fonts.js, the look pass): static bytes, answered before the project seam, the gate or any D1
    // read, so a page's three font requests cost no statement and no auth
    if (path === "/favicon.svg" && (request.method === "GET" || request.method === "HEAD")) return iconResponse(request.method, url.searchParams.has("v"));
    if (path.startsWith("/fonts/") && (request.method === "GET" || request.method === "HEAD")) {
      return fontResponse(path.slice("/fonts/".length), request.method) || json({ error: "not_found", path }, 404);
    }
    // OpenAI's domain verification (sprint 11, 11.3; src/wellknown.js): the deployment's token, one KV read, before the address, any
    // sign-in or any D1 read; none stored is the ordinary not-found. Under an org's address it is a platform door (NOT_HERE below)
    if (path === "/.well-known/openai-apps-challenge" && (request.method === "GET" || request.method === "HEAD")) {
      return (await challengeAnswer(env, request.method)) || json({ error: "not_found", path }, 404);
    }
    // a render's body (src/knowledge/screens.js serveRender, ARCHITECTURE §11): answered before the seam, which would refuse a
    // named project the caller may not read with 403 project_forbidden and name it; here that is a 404, as a missing render
    // is. serveRender resolves the caller itself (a session cookie or a bearer) and scopes the project with the
    // seam's own resolveProject; it only ever reads (GET and HEAD)

    // ---- THE ADDRESS (sprint 7, 7.4; docs/plan/PLATFORM.md §2 item 9): the ONE place the org of a request's address is
    // resolved, once, before any sign-in. /<org>/<page> is that org's page; everything else is the platform's root.
    //   * under an org's address: a platform door (sign-in, MCP, OAuth, the static files) is not there (NOT_HERE); no credential
    //     at all is the sign-in rule, the same for every name (nothing is read) — but a file by its exact id (GET /artifact/:id,
    //     ADR-055's public link) answers as at the root; a credential: the org row by its path name, the slot's address
    //     (src/data.js installAddress: every sign-in after it is refused unless its person is of that org), then the reader. A
    //     credential live somewhere that signs in nobody HERE (a bearer of another org, a session with no seat here, any at a
    //     name no org holds) is NOT_HERE, one body for all; a dead one is the sign-in rule. Then the request routes on the path
    //     the address carries, and every URL it builds carries the org's base (src/orgpath.js setOrgBase).
    //   * at the root: a bearer answers from its own org as it always did; a cookie session signs no one in here (a cookie's
    //     org is its address's), and a page navigation that carries a live one is sent to the same page in the session's org.
    const addr = splitAddress(path);
    let who = null, whoResolved = false, orgRow = null;
    if (addr) {
      if (isPlatformPath(addr.rest)) return NOT_HERE();
      const hasBearer = (request.headers.get("authorization") || "").startsWith("Bearer ");
      const hasCookie = !!sessionCookieToken(request);
      const isGet = request.method === "GET" || request.method === "HEAD";
      const anonFile = isGet && addr.rest.startsWith("/artifact/");
      if (!hasBearer && !hasCookie && !anonFile) return signInOr401(request, url);
      const row = orgRow = hasBearer || hasCookie ? await orgBySlug(env, addr.seg) : null;
      installAddress(env, row ? { org: Number(row.id), slug: row.slug } : { org: null, slug: addr.seg });
      if (hasBearer || hasCookie) {
        try { who = await resolveReader(request, env, url, { readOnlyOk: true, props: ctx && ctx.props }); }
        catch (e) { if (isD1Quota(e)) throw e; who = null; }
        whoResolved = true;
        if (!who) {
          if (await credentialLive(request, env).catch((e) => { if (isD1Quota(e)) throw e; return false; })) return NOT_HERE();
          if (!anonFile) return signInOr401(request, url);
        }
      }
      if (row) setOrgBase(row.slug);
      path = c.path = addr.rest;
    } else {
      installAddress(env, null);
      const tok = sessionCookieToken(request);
      if (tok && (request.method === "GET" || request.method === "HEAD") && isBrowserNavigation(request) && !isPlatformPath(path)) {
        // where the session may go (sprint 7, 7.4b: src/core.js sessionPlace): a SEAT session and a one-org account straight
        // to the same page in their one org; an account in several orgs to the org picker, carrying the page asked for
        const place = await sessionPlace(tok, env);
        if (place) {
          const q = new URLSearchParams(url.search || ""); q.delete("k");   // the personal key never rides a Location header
          const qs = q.toString();
          const asked = path === "/" ? "" : path + (qs ? "?" + qs : "");
          const location = !place.account || (place.orgs.length === 1 && !(place.pending || []).length)
            ? "/" + place.orgs[0].slug + (path === "/" ? (qs ? "?" + qs : "") : asked)
            : PICKER_PATH + (asked ? "?to=" + encodeURIComponent(asked) : "");
          return new Response(null, { status: 302, headers: { location, "cache-control": "private, no-store" } });
        }
      }
    }

    // ---- THE PROJECT SEAM (M-ADR-027; U-MCP Q0D506BBC; the rule: src/project.js). In a multi-project org, resolve who is
    // asking once and hand every route an env carrying the project resolveProject picks (src/project.js PROJECT) — the SAME
    // helper the MCP tools and resources/read call, so a GET twin answers what its tool answers:
    //   * a GET naming ?project=<key>: that project when the caller may read it (a seat; the owner: any active project),
    //     else 403 project_forbidden, nothing read — honoured in any org, and it NEVER writes the stamp (POST /project does);
    //   * none: the caller's active project (the session stamp, or a single seat), else the first project in key order
    //     the caller may read — never a project they hold no seat on; seated nowhere: the org root.
    // Single-project orgs never pay for it (no ?project=) and stay byte-identical. The seats read is the request's one
    // (seatsOnce, D9), reused by every later reader in the request.
    const wantProject = request.method === "GET" ? url.searchParams.get("project") : null;
    const namesProject = wantProject != null && wantProject.trim() !== "";
    // review fix 1 (sprint 2): a single-project org scopes a PARTNER's request too (the identity read is the request's memoized
    // one, so nobody else pays a statement): a Partner seated on no active project reads no project (project.js NO_PROJECT), never
    // the org's one active project. A failure to scope a known Partner fails closed (no project), never open.
    // sprint 6 (6.2): who is asking comes FIRST — the sign-in names the org (src/data.js), and the org's projects are read only
    // inside it (core.js orgProjectsOnce). A request with no reader is never scoped (as before: no reader, no project).
    if (!whoResolved) {
      // sprint 7, 7.5a: an ACCOUNT grant's call to /mcp names the org it acts in (src/mcp.js orgWantedOf, read off a copy of the
      // body): the sign-in below is then the account's seat THERE, as callerOf's will be (one request, one org)
      const wantOrg = path === "/mcp" && request.method === "POST" && ctx && grantKindOf(ctx.props) === GRANT_KINDS.account
        ? orgWantedOf(await request.clone().json().catch(() => null)) : "";
      try { who = await resolveReader(request, env, url, { readOnlyOk: true, props: ctx && ctx.props, wantOrg }); }
      catch { who = null; /* no project resolved — the org root serves, as before; the route's own resolve answers the error */ }
    }
    // ---- THE SUSPENSION (sprint 8, 8.5; docs/plan/PLATFORM.md §4: the operator suspends an org): the ONE check, here, where the
    // request's org has resolved — under an org's address (its row read above, then the sign-in as that org) and at the root (a
    // bearer's own org) alike, after the sign-in, so only the org's OWN people meet it (another org's credential met the one
    // not-here answer above; no credential, the sign-in rule). The org row's settings say it (src/plans.js suspensionOf; the
    // operator's tools/operator.mjs suspend / unsuspend write that one key, nothing else of the org): every page, MCP call, REST
    // call and sign-in landing of that org answers ONE 403 org_suspended, nothing routed, nothing counted, nothing deleted. No
    // statement of its own for an org that is not suspended: the org row is the one this request reads anyway (the address's
    // above; at the root the tenant row setOrgBase reads below, by its path name), kept a minute per isolate (src/tenant.js) — a
    // suspension takes hold within that minute. A row that SAYS suspended is confirmed by one fresh read of it before the 403, so
    // the operator's unsuspend is answered at once (only a suspended org's refused requests pay it).
    if (who && readerOrg(env) != null) {
      if (!orgRow) { const slug = (await getTenantConfig(env)).slug; orgRow = slug ? await orgBySlug(env, slug) : null; }
      if (orgRow && Number(orgRow.id) === readerOrg(env) && suspensionOf(orgRow)
        && suspensionOf(await db(env).prepare("SELECT settings FROM org WHERE id = {org}").first())) return suspendedAnswer(isBrowserNavigation(request));
    }
    // a render's body (src/knowledge/screens.js serveRender): answered before the project seam, as the comment above it says;
    // after the suspension's check (it resolves its own caller from the same request memo)
    if (path.startsWith("/render/") && (request.method === "GET" || request.method === "HEAD")) return serveRender(request, env, url, path);
    // a bearer at the root (an MCP client, a script): every URL its answer carries is under its own org (src/orgpath.js)
    if (!addr && who) setOrgBase((await getTenantConfig(env)).slug);
    // sprint 8's review (A1): the request's reader marked on its plan slot, so a Partner's warnings and refusals carry no count of
    // the org's (src/plans.js setPlanReader; the MCP door marks the seat each call acts as, src/mcp.js callerOf)
    if (who) setPlanReader(env, isPartnerReader(who));
    // sprint 13, 13.1: which AI filed it (src/client.js): a signed-in browser's form is the web app, a bearer on REST the API (no
    // client signal); the MCP door sets its own word for each call (src/mcp.js callerOf)
    if (who && path !== "/mcp") setRequestClient(clientFamilyOf({ door: who.viaCookie ? "web" : "api" }));
    // sprint 8, 8.2: a signed-in write is one of the org's calls (PLAN_NOTE above): a refused one is 429, nothing routed
    if (who && readerOrg(env) != null && request.method !== "GET" && request.method !== "HEAD" && !uncountedWrite(path)) {
      const gate = await countCall(env, { write: !readOnAnyVerb(path) });
      if (gate.refusal) return json(gate.refusal, 429, { "retry-after": String(gate.refusal.retryAfter ?? 60), "cache-control": "private, no-store" });
    }
    const multi = !!who && (namesProject || await orgHasWorkspaces(env));
    if (multi || isPartnerReader(who)) {
      let scope = null;
      try {
        if (who) scope = await resolveProject(who, namesProject ? wantProject : null, await seatsOnce(env, who.id), env);
      } catch {
        scope = isPartnerReader(who) ? { project: null, env: { ...env, [NO_PROJECT]: true } } : null;   // the org root serves, as before; a Partner reads no project
      }
      if (scope && scope.error) return json(scope, 403);
      // U-TOPBAR: the scope's own record rides the request's env (a fresh object — never the shared env), so the top-bar
      // chip (servePage) names the project the page read; nothing else reads it, and the stamp is untouched
      if (scope) c.env = { ...scope.env, [READ_SCOPE]: { project: scope.project || null, named: !!scope.named, active: !!scope.active } };
    }

    // The SIRU surface goes behind login (owner ruling S-019): only provisioned people see the
    // internal grades · gaps · decisions · scope. Public stays: /health /login /logout /install.
    // Unauthed hits on a surface page redirect to /login (with ?next to return).
    const GATED_SURFACE = ["/home", "/home/summary", "/brief", "/changes", "/build", "/projects", "/decisions", "/view", "/goals", "/gtm", "/broadcast", "/versions"]; // UI-B4b: /artifacts is a JSON-only twin of its tool now, with its own auth (a 401 JSON, never a login page); /build is the Build screen.
    // /question/:qid is a PREFIX (UI-B2), so it is gated by its own branch: includes() would never match it. So is the
    // filing page /contribution/:id (UI-B4a): a seated reader opens it now, so a signed-out browser goes to /login. So is
    // one version, /versions/:v (UI-B5b). So is one goal, /goals/:ref (UI-B6a).
    if (path === "/" || GATED_SURFACE.includes(path) || ((path.startsWith("/question/") || path.startsWith("/contribution/") || path.startsWith("/versions/") || path.startsWith("/goals/") || path.startsWith("/preview/")) && request.method === "GET")) {
      const gateReader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      if (!gateReader) {
        // sprint 21, 21.3: the platform's root `/` for a browser navigation that signs no one in (no session, or a dead one; no
        // bearer: src/util.js isBrowserNavigation) is the showcase, its beta count read live (two aggregates, src/accounts.js
        // betaCount; left out if it fails). Under an org's address `/` keeps the sign-in rule, and a script is refused 401.
        if (path === "/" && !addr && isBrowserNavigation(request)) {
          const count = await betaCount(env).catch((e) => { if (isD1Quota(e)) throw e; return null; });
          return new Response(renderShowcase({ count }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
        }
        // "/" keeps its own next (ADR-100 §4: login → picker) — the root decides
        // picker-vs-home AFTER auth; everything else returns straight to itself. A script is refused 401 (THE sign-in rule).
        return signInOr401(request, url);
      }
      c.gateReader = gateReader;
    }

    for (const r of ABOVE_ROUTES) {
      if (r.test(path, request.method)) {
        const res = await r.run(c);
        if (res !== undefined) return res;
      }
    }

    // A typo'd path must read as a typo, not as a credential problem (audit #12).
    const KNOWN = CAPABILITIES.map((c) => c.p);
    const known = KNOWN.some((k) => k === path || (k.includes("/:") && path.startsWith(k.split("/:")[0] + "/")));
    if (!known) return json({ error: "not_found", path,
      hint: "No such route. GET /capabilities lists everything you can call." }, 404);

    // ---- everything below needs a key ----
    // This one gate fans out into BOTH read routes (whoami, updates,
    // the owner reads) and write routes (open-items, ask, artifact, wrap-up,
    // signout) — every write below is a POST, every read below is a GET, so ADR-050's
    // read-only credential is let in here and then refused, once, on anything but GET. That is
    // enforced HERE rather than trusted to each handler below.
    const person = c.person = await resolveAny(request, env);
    if (!person) return signInOr401(request, url, undefined, { error: "unauthorized", hint: "Authorization: Bearer <your key>" });
    if (person.readOnly && request.method !== "GET") {
      return json({ error: "read_only_credential",
                    hint: "This is a read-only token. Use your full key to write." }, 403);
    }
    // A cookie-authenticated WRITE must come from this origin (M-ADR-024 / security review
    // finding 1): sibling org workers are one SITE on workers.dev, so SameSite=Lax alone would let
    // same-site HTML write to the ledger as the person. Bearer callers never hit this.
    if (csrfRefused(request, url, person)) {
      return json({ error: "cross_origin_session_write", hint: "A web session may only write from its own origin. Use Authorization: Bearer for scripts." }, 403);
    }

    for (const r of BELOW_ROUTES_1) {
      if (r.test(path, request.method)) {
        const res = await r.run(c);
        if (res !== undefined) return res;
      }
    }

    // ADR-022: routes that write truth or read across everyone are owner-only.
    // UI-B4a (Q0B546903): /transmission left this list: the ledger is open to seated readers, scoped (core.js
    // transmissionQueueFor / transmissionOneFor), decide checks the owner itself, and the owner-queue PAGE is retired
    // (UI-B4b: a browser is sent to /build).
    const OWNER_ONLY = ["/storage", "/log"];
    if (OWNER_ONLY.some((r) => path === r || path.startsWith(r + "/")) && person.role !== "owner") {
      return ownerOnlyRefusal(request, env, person);
    }

    for (const r of BELOW_ROUTES_2) {
      if (r.test(path, request.method)) {
        const res = await r.run(c);
        if (res !== undefined) return res;
      }
    }

    return json({ error: "not_found", path }, 404);
  }
};

// Cron: twice a day (ADR-016) — every org's report backfill, nightly backup and expired previews, one org at a time as the
// deployment for that org (src/cron.js runCron: sprint 6, 6.4, the cron loops over orgs inside its CPU)
workerHandler.scheduled = async function scheduled(event, env) {
  return runCron(env, (event && Number(event.scheduledTime)) || Date.now());
};

export default buildEntry(workerHandler);
