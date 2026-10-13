// tools/walkthrough/scenes.mjs — THE SCRIPT of the second walkthrough (G3): the sharingu project end to end, on real data,
// in Paper, as ten beats. Each beat is real actions on the real app (tools/walkthrough/record.mjs drives it; take.mjs is the
// one command). SCRIPT is the script as data (what happens, its captions, its target seconds); BEATS are the actions.
//
// What the take FILES, all into the project `sharingu` (real in kind; the org is rebuilt from empty before a take, so
// nothing here carries a take number — take.mjs refuses an org that already holds a take):
//   beat 3, a member's client (a seat minted on Control before the take; its key is held out of frame):
//     · a contribution (lane code): the walkthrough recorder itself, toward goal c6-video, its proof the rehearsal's own
//       measures (take.mjs reads them from the last rehearsal's report), its next action the owner's: record the final take
//     · goal c6-video moved to "in progress" (a knowledge item: the goal's own state)
//     · a check on screen:goal-node: a goal's page links each contribution that moved it
//     · an open question for the owner: which world the take is recorded in (the owner's ruling, Paper, is what the
//       owner set for this video; the take rules it on camera with that choice)
//   beat 6, the owner's client: that check graded from what the page answered (tools/walkthrough/grade.mjs)
//   beat 7, the owner's client: a real commit of this repo that touches that screen and is not in the project's history
//     yet (CHANGE: by default 7fafeb61b, the names; take.mjs --change <commit> builds another from git; its clientRef is
//     the history's own, so a later history replay of it is a duplicate, not a second row); then the owner in the app
//     (R1): Regrade on the stale node's inspector, its plan (what each page proves, what needs a person), Regrade again:
//     the worker observes each page as the owner and files the grades through the door
//   beat 9, the owner in the app: picks up the member's next action (the org's first pick-up: Control's measures register it)
export const PROJECT = "sharingu";
export const GOAL = "c6-video";
export const CHECK = "c6-video.goal-links";
export const QID = "Q-video-world";

// the member's filing (beat 3). `proof` and `who` are filled by take.mjs (the rehearsal's measures; the owner's email).
export function memberItems({ proof, owner, by }) {
  return [
    { contribution: { lane: "code", kind: "pr", clientRef: "walkthrough-v2-recorder", what: "Walkthrough recorder",
      why: "One take of the sharingu project on real data, in the new look: a real pointer, eased scrolls, the pages' own open animations, captions, a cross-fade between beats.",
      touches: ["engine/tools/walkthrough/record.mjs", "engine/tools/walkthrough/scenes.mjs", "engine/tools/walkthrough/take.mjs"],
      goalRef: GOAL, proof, next: { what: "Record the final take on the ship candidate", who: owner, by } } },
    { kind: "goal", op: "upsert", data: { id: GOAL, status: "in progress" } },
    { kind: "check", op: "upsert", data: { id: CHECK, kind: "screen", title: "A goal links its work",
      given: "a goal a contribution was filed toward", when: `GET /goals/${GOAL} with Accept: text/html`,
      then: "200 HTML holding data-screen=\"goal-node\" and the regions data-region=\"filings\"; it links /contribution/",
      refs: ["screen:goal-node", GOAL] } },
    { kind: "question", op: "upsert", data: { qid: QID, question: "Which world to record?", status: "open", whoOwes: "owner",
      why: "The video is the brand's first impression; the brand's reference world is Paper.",
      options: [{ what: "Paper" }, { what: "Ink" }, { what: "Both, one after the other" }], affects: [GOAL] } },
  ];
}

// the change (beat 7): a real commit of this repo, filed as the project's history files a commit (the same clientRef, so a
// later history replay of it is a duplicate). Its touches: the screens whose renderer the commit changed, and its own files.
export const CHANGE = {
  sha: "7fafeb61b6600cf626cd6033a36cd49355a41e08",
  item: { contribution: { lane: "code", kind: "pr", happenedAt: "2026-10-02T20:03:49Z", clientRef: "sharingu-history-7fafeb61b",
    source: [{ kind: "commit", ref: "7fafeb61b6600cf626cd6033a36cd49355a41e08", label: "ryukdev/sharingu (branch sprint-3)" }],
    what: "The names: 34 tools in one vocabulary",
    why: "66 tools become 34, renamed at once with no alias: every old tool answers unknown and every old address 404s. Each tool has a title and its annotations; GET /capabilities serves the generated inventory; every caller moved first.",
    touches: ["screen:home", "screen:build", "screen:filing", "screen:impact", "screen:goals", "screen:goal-node", "screen:gtm", "screen:decisions",
      "screen:question", "screen:holes", "screen:library", "screen:changes", "screen:card", "screen:control", "screen:docs", "screen:broadcast",
      "screen:versions", "screen:map", "engine/tools/names.json", "engine/src/mcp.js", "engine/src/index.js"],
    components: ["service:cloudflare-workers", "service:cloudflare-d1"], goalRef: "b6-names", depends: [],
    proof: "The commit states: smoke 207/207, the walk 13 of 13; the importer rebuilt from empty, stored == built on all five; 81 rows of the authority table the same, 19 narrower, none wider." } },
};

// ---- THE SCRIPT, as data: beat, what happens, the captions (each at most eight words), target seconds ----
export const SCRIPT = [
  { n: 1, id: "sign-in", what: "Sign in with the key (a password field) → Home: the aim, the tiles, latest changes, who contributed", captions: ["Sign in with your passphrase", "Home: the aim and this week", "Who contributed this week"], seconds: 26 },
  { n: 2, id: "missing", what: "Home's Filled tile → What is missing: the meter, the open items, the first one's Copy", captions: ["What is missing", "Copy the first open item"], seconds: 8 },
  { n: 3, id: "client-files", what: "The member's terminal: preview of four items (the door's own text) → the preview's page in the app → file, the receipt", captions: ["A member's client previews four items", "The same preview, in the app", "Filed: the receipt"], seconds: 21 },
  { n: 4, id: "shows-at-once", what: "Build: the new row, opened, then its page (proof, touches) → Home: landed this week +1 → Goals: C6 in progress → What changed: the filing and its reach", captions: ["On Build at once", "Its page: why, proof, what it touches", "Landed this week: one more", "C6 moved to in progress", "What changed, and what it reaches"], seconds: 29 },
  { n: 5, id: "decide", what: "Decisions: a ruled question reads its ruling; the new question under Open → its options as cards → Rule A → decided at once", captions: ["A ruling reads in one phrase", "The new question needs you", "Its options, side by side", "Ruled at once"], seconds: 15 },
  { n: 6, id: "prove", what: "The Map on A goal (one check ungraded) → the owner's terminal grades it from what the page answered → back on the Map the light turns → the Screens view: the frame and its picture", captions: ["A goal: one check ungraded", "Graded from what the page answered", "The light turns green", "The screen, as it looks"], seconds: 32 },
  { n: 7, id: "change-stale", what: "The owner files a real commit that touches that screen → its Impact (what it reaches, the proof to redo) → the Map: stale → Regrade on the node: the plan (what its pages prove, what needs a person) → Regrade → the Map: fresh", captions: ["A change is filed", "What it reaches, and the proof to redo", "Stale until regraded", "Regrade: the pages prove it, walks need you", "Fresh again, regraded from the page"], seconds: 39 },
  { n: 8, id: "architecture", what: "The Arch view: the open, a part hovered, Play \"A contribution is filed\" end to end", captions: ["The architecture", "Play: a contribution is filed"], seconds: 33 },
  { n: 9, id: "carry-forward", what: "Home's Follow-ups: the member's next action is the owner's → its page → Pick up → Control · Admin: the first pick-up registers", captions: ["A next action waits for you", "Picked up", "The first pick-up counts"], seconds: 20 },
  { n: 10, id: "close", what: "Home again: needs you 0, the week, the people", captions: ["Home, one round later"], seconds: 8 },
];
const C = Object.fromEntries(SCRIPT.map((b) => [b.id, b.captions]));

const Q = (p) => `${p}${p.includes("?") ? "&" : "?"}project=${PROJECT}`;
const ARCH_CSS = ".ar-cap{max-width:min(940px,calc(100% - 140px));padding:14px 16px 14px 20px}.ar-capt{font-size:20px}.ar-capk{font-size:13px}.ar-capn{font-size:14px}";

// a Map node by its title (the canvas draws one <g class="mx-n"> per node, its <title> the node's name)
const mapNode = (r, title) => r.js(`(function(){var g=[].slice.call(document.querySelectorAll('#mx-units g.mx-n, g.mx-n')).find(function(x){var t=x.querySelector('title');return t&&(t.textContent===${JSON.stringify(title)}||t.textContent.indexOf(${JSON.stringify(title + " (")})===0);});if(!g)return null;var b=g.getBoundingClientRect();return {x:b.left+Math.min(b.width*0.35,90),y:b.top+b.height/2,light:g.getAttribute('data-light'),stale:/\\(\\d+ stale\\)/.test(g.querySelector('title').textContent)};})()`);

// the Map opened on the A goal node (pinned by the address: its inspector open), the node hovered
async function mapOn(r, name, caption) {
  // two steps in (the canvas's own + button) so the node's labels read at 1080p: done before the shot opens
  const zoomIn = async () => { for (let i = 0; i < 2; i++) { await r.js("(function(){var b=document.querySelector('[data-button=\"zoom\"][data-dir=\"in\"]');if(b)b.click();})()"); await r.sleep(450); } await r.sleep(500); };
  await r.cut(Q(`/map?node=${encodeURIComponent("screen:goal-node")}`), { name, caption, waitFor: "g.mx-n", settle: 900, prep: zoomIn });
  let n = null; for (let i = 0; i < 20 && !n; i++) { n = await mapNode(r, "A goal"); if (!n) await r.sleep(150); }
  if (n) { await r.move(n.x, n.y, 900); await r.sleep(700); }
  else console.log("    (the Map drew no node titled A goal: " + JSON.stringify(await r.js("[].slice.call(document.querySelectorAll('g.mx-n title')).map(function(t){return t.textContent}).slice(0,12)")) + ")");
  await r.hover("#mx-insp, .mx-insp, [data-region='inspector']", { ms: 800 }).catch(() => {}); await r.sleep(1600);
  return n;
}

export const BEATS = {
  // 1 · sign in, then Home
  "sign-in": async (r, t) => {
    await r.cut("/login", { name: "sign in, then Home", caption: C["sign-in"][0], waitFor: "#password" });
    if ((await r.js("(function(){var p=document.querySelector('#password');return p&&p.type})()")) !== "password") throw new Error("the sign-in's key field is not a password field: no key is typed");
    await r.click("#email", { ms: 700 }); await r.type(t.ownerEmail, 45);
    await r.click("#password", { ms: 450 }); await r.type(t.ownerKey, 22);
    await r.sleep(350);
    await r.clickNav('form[action="/login"] button[type=submit]', { waitFor: '[data-region="metrics"], [data-screen="projects"]', settle: 250 });
    if (/[?&]k=/.test(await r.js("location.search"))) throw new Error("a key is in the address bar");
    // an org of several projects lands on its Projects page: open sharingu there, as a person does (one project: Home at once)
    if (await r.rectOf('[data-screen="projects"]')) {
      await r.sleep(900);
      await r.clickNav(`[data-region="projects"] form:has(input[name="key"][value="${PROJECT}"]) button`, { waitFor: '[data-region="metrics"]', settle: 250, caption: C["sign-in"][1] });
    }
    await r.cap(C["sign-in"][1]);
    await r.hover('[data-region="aim"]', { ms: 1100 }); await r.sleep(1700);
    await r.hover('a.p-tile[href$="/build?when=7d"]', { ms: 800 }); await r.sleep(1300);
    await r.hover('[data-region="what-changed"] .p-li', { ms: 800 }); await r.sleep(1300);
    await r.cap(C["sign-in"][2]);
    await r.scrollTo('[data-region="who-is-here"]', { top: 330, ms: 1100 });
    await r.hover('[data-region="who-is-here"] .p-line, [data-region="who-is-here"] li', { ms: 700 }); await r.sleep(1800);
    await r.scrollBy(-2000, { ms: 900 });
  },
  // 2 · what is missing: the meter, an open item, its Copy
  missing: async (r) => {
    await r.clickNav('a.p-tile[href$="/missing"]', { caption: C.missing[0], waitFor: '[data-region="meter"], [data-region="open"]', settle: 900 });
    await r.hover('[data-region="meter"], [data-region="glance"]', { ms: 700 }); await r.sleep(1300);
    await r.hover('[data-region="open"] .p-line', { ms: 800 }); await r.sleep(900);
    await r.cap(C.missing[1]);
    await r.click('[data-region="open"] [data-button="copy-call"]', { ms: 700 }); await r.sleep(1700);
  },
  // 3 · a client files: the member's terminal, the preview's page, the receipt
  "client-files": async (r, t) => {
    await r.terminal(`${t.memberName} · terminal`, { caption: C["client-files"][0] });
    const pv = await r.run("node mcp-call.mjs preview @take.json", () => t.exec("member", ["mcp-call.mjs", "preview", "@take.json"]), { after: 2600 });
    t.previewId = (/P-[0-9a-f]{16}/.exec(pv) || [])[0];
    if (!t.previewId) throw new Error("the preview answered no id: " + pv.slice(0, 300));
    await r.closeTerminal();
    await r.cut(Q(`/preview/${t.previewId}`), { name: "preview page", caption: C["client-files"][1], waitFor: '[data-region="items"]' });
    await r.hover('[data-region="items"] li, [data-region="items"] .p-line', { ms: 800 }); await r.sleep(1200);
    await r.hover('[data-region="items"] li, [data-region="items"] .p-line', { ms: 600, nth: 3 }); await r.sleep(900);
    await r.hover('[data-region="reach"]', { ms: 700 }); await r.sleep(1400);
    await r.terminal(`${t.memberName} · terminal`, { caption: C["client-files"][2] });
    // each part with its own write tool, in the preview's order (sprint 19): the contributions' receipt names the contribution
    let rc = "";
    for (const tool of t.tools.take) rc += await r.run(`node mcp-call.mjs ${tool} ${t.previewId} @take.json`, () => t.exec("member", ["mcp-call.mjs", tool, t.previewId, "@take.json"]), { after: 2600 }) + "\n";
    t.contribution = (/contribution .*?(T-\d{8}-\d+)/.exec(rc) || [])[1];
    if (!t.contribution) throw new Error("the receipt named no contribution: " + rc.slice(0, 300));
    await r.closeTerminal();
  },
  // 4 · it shows at once: Build (the row opened, its page), Home's week, Goals, What changed
  "shows-at-once": async (r, t) => {
    await r.cut(Q("/build"), { name: "build", caption: C["shows-at-once"][0], waitFor: '[data-region="filings"]' });
    const row = `[data-region="filings"] li[data-id="${t.contribution}"]`;
    await r.click(`${row} summary`, { ms: 900, at: "right" }); await r.sleep(1700);
    await r.clickNav(`${row} a.u-btn[href*="/contribution/"]`, { waitFor: '[data-region="envelope"]', settle: 700, caption: C["shows-at-once"][1] });
    await r.hover('[data-region="envelope"]', { ms: 800 }); await r.sleep(2400);
    await r.cut(Q("/home"), { name: "home week", caption: C["shows-at-once"][2], waitFor: '[data-region="metrics"]' });
    await r.hover('a.p-tile[href$="/build?when=7d"]', { ms: 800 }); await r.sleep(1800);
    await r.clickNav('[data-tab="goals"]', { waitFor: '[data-region="goal-tree"], [data-screen="goals"]', settle: 700, caption: C["shows-at-once"][3] });
    await r.scrollTo(`[data-id="${GOAL}"]`, { top: 380, ms: 1100 });
    await r.hover(`[data-id="${GOAL}"] .p-line-title`, { ms: 700 }); await r.sleep(1300);
    await r.clickNav(`[data-id="${GOAL}"] a.p-line-title`, { waitFor: '[data-region="node"]', settle: 700 });
    await r.hover('[data-region="cells"], [data-region="node"]', { ms: 700 }); await r.sleep(1500);
    await r.hover('[data-region="filings"] li, [data-region="filings"] .p-line', { ms: 700 }); await r.sleep(1300);
    await r.cut(Q("/changes"), { name: "what changed", caption: C["shows-at-once"][4], waitFor: '[data-region="changes"]' });
    await r.hover('[data-region="changes"] li, [data-region="changes"] .p-line', { ms: 800 }); await r.sleep(2200);
  },
  // 5 · decide: a ruling shown, the open question, its options, ruled at once
  decide: async (r) => {
    await r.cut(Q("/decisions"), { name: "decisions", caption: C.decide[0], waitFor: '[data-region="ruled"]' });
    await r.hover('[data-region="ruled"] .p-line', { ms: 900 }); await r.sleep(1600);
    await r.cap(C.decide[1]);
    await r.hover(`[data-region="open"] .p-line, [data-region="question-list"] .p-line`, { ms: 800 }); await r.sleep(1200);
    await r.clickNav(`[data-region="open"] a[href*="/question/${QID}"], a[href*="/question/${QID}"]`, { waitFor: '[data-region="options"]', settle: 700 });
    await r.cap(C.decide[2]);
    await r.hover('[data-region="options"] .p-opt', { nth: 1, ms: 800 }); await r.sleep(700);
    await r.hover('[data-region="options"] .p-opt', { nth: 0, ms: 700 }); await r.sleep(700);
    await r.clickNav('[data-region="options"] .p-opt .p-opt-go', { nth: 0, waitFor: '[data-region="options"]', settle: 700 });
    await r.cap(C.decide[3]);
    await r.hover('[data-region="options"]', { ms: 700 }); await r.sleep(2000);   // the ruling, in one phrase
  },
  // 6 · prove: the Map, the grade from the terminal, the light turned, the Screens view and its picture
  prove: async (r, t) => {
    await mapOn(r, "map amber", C.prove[0]);
    t.lights.before = (await mapNode(r, "A goal") || {}).light;
    await r.terminal("Ryuk · terminal", { caption: C.prove[1] });
    await r.run(`node grade.mjs ${CHECK} --link /contribution/${t.contribution}`, () => t.exec("owner", ["grade.mjs", CHECK, "--link", `/contribution/${t.contribution}`, "--goal", GOAL]), { after: 2600 });
    await r.closeTerminal();
    await mapOn(r, "map green", C.prove[2]);
    t.lights.after = (await mapNode(r, "A goal") || {}).light;
    await r.sleep(1200);
    await r.cut(Q("/map/screens?screen=goal-node"), { name: "atlas", caption: C.prove[3], waitFor: "#ax-stage", settle: 4500 });
    await r.hover("#ax-world .ax-f.ax-pin", { ms: 900 }).catch(() => {}); await r.sleep(1200);   // the pinned frame: A goal
    await r.js("(function(){var s=document.getElementById('ax-stage');if(s)s.focus();})()"); await r.key("Enter"); await r.sleep(800);
    await r.js("(function(){var a=document.activeElement;if(a&&a.blur)a.blur();})()");
    await r.move(r.view.w * 0.5, r.view.h * 0.55, 900); await r.sleep(2600);
  },
  // 7 · change and stale: a real commit filed (the terminal), its Impact, stale on the Map, Regrade from the node (the app), fresh
  "change-stale": async (r, t) => {
    await r.terminal("Ryuk · terminal", { caption: C["change-stale"][0] });
    const pv = await r.run("node mcp-call.mjs preview @change.json", () => t.exec("owner", ["mcp-call.mjs", "preview", "@change.json"]), { after: 1200 });
    const pid = (/P-[0-9a-f]{16}/.exec(pv) || [])[0];
    let rc = "";
    for (const tool of t.tools.change) rc += await r.run(`node mcp-call.mjs ${tool} ${pid} @change.json`, () => t.exec("owner", ["mcp-call.mjs", tool, pid, "@change.json"]), { after: 1800 }) + "\n";
    t.change = (/contribution .*?(T-\d{8}-\d+)/.exec(rc) || [])[1];
    if (!t.change) throw new Error("the change's receipt named no contribution: " + rc.slice(0, 300));
    await r.closeTerminal();
    await r.cut(Q(`/contribution/${t.change}/impact`), { name: "impact", caption: C["change-stale"][1], waitFor: '[data-region="proof"]' });
    await r.hover('[data-region="glance"] .p-tile', { nth: 2, ms: 800 }); await r.sleep(1400);
    await r.scrollTo('[data-region="proof"]', { top: 140, ms: 1100 });
    await r.hover('[data-region="proof"] .p-line', { ms: 700 }); await r.sleep(1800);
    await mapOn(r, "map stale", C["change-stale"][2]);
    t.lights.stale = await mapNode(r, "A goal");
    await r.sleep(1200);
    // the press on the inspector: its first press answers the plan as a page, its confirm files and comes back to the Map
    await r.clickNav('[data-region="inspector"] [data-button="regrade"]', { waitFor: '[data-screen="regrade"]', settle: 700, caption: C["change-stale"][3] });
    await r.hover('[data-region="observe"] .p-line', { ms: 800 }); await r.sleep(1400);
    await r.hover('[data-region="needs-proof"]', { ms: 700 }); await r.sleep(1200);
    await r.clickNav('[data-button="regrade-confirm"]', { waitFor: "g.mx-n", settle: 900 });
    await mapOn(r, "map fresh", C["change-stale"][4]);
    t.lights.fresh = await mapNode(r, "A goal");
    await r.sleep(1200);
  },
  // 8 · the architecture: open, a part, Play one journey
  architecture: async (r) => {
    await r.cut(Q("/map/arch"), { name: "arch", caption: C.architecture[0], waitFor: "#ar-world", settle: 200 });
    await r.css(ARCH_CSS);
    await r.sleep(2200);
    await r.hover('#ar-world .ar-n[data-kind="door"]', { ms: 1000 }); await r.sleep(1800);
    await r.cap(C.architecture[1]);
    await r.click("#ar-play", { ms: 900 });
    await r.move(r.view.w * 0.73, r.view.h * 0.89, 900);   // the canvas's empty corner, clear of the step caption
    // the journey plays whole: until its caption reads its last step, then a beat on it
    for (let i = 0; i < 60; i++) { const s = await r.js("(function(){var n=document.querySelector('#ar-cap .ar-capn');return n?n.textContent:''})()"); const m = /(\d+)\s*\/\s*(\d+)/.exec(s || ""); if (m && m[1] === m[2]) break; await r.sleep(500); }
    await r.sleep(2600);
  },
  // 9 · carry forward: the follow-up, its page, the pick-up, Control's measures
  "carry-forward": async (r, t) => {
    await r.cut(Q("/home"), { name: "home follow-ups", caption: C["carry-forward"][0], waitFor: '[data-region="follow-ups"]' });
    await r.scrollTo('[data-region="follow-ups"]', { top: 330, ms: 1000 });
    await r.hover(`[data-region="follow-ups"] a[href*="/contribution/${t.contribution}"], [data-region="follow-ups"] .p-line`, { ms: 800 }); await r.sleep(1200);
    await r.clickNav(`[data-region="follow-ups"] a[href*="/contribution/${t.contribution}"], [data-region="follow-ups"] a[href*="/contribution/"]`, { waitFor: '[data-region="next-action"]', settle: 700 });
    await r.scrollTo('[data-region="next-action"]', { top: 260, ms: 900 });
    await r.clickNav('[data-region="next-action"] form button[type=submit]', { waitFor: '[data-region="next-action"]', settle: 700 });
    await r.cap(C["carry-forward"][1]);
    await r.scrollTo('[data-region="next-action"]', { top: 260, ms: 600 });
    await r.hover('[data-region="next-action"]', { ms: 700 }); await r.sleep(1700);
    await r.cut("/control#ct-measures", { name: "control measures", caption: C["carry-forward"][2], waitFor: '[data-region="measures"]', settle: 1200 });
    await r.scrollTo('[data-region="measures"]', { top: 200, ms: 900 });
    await r.hover('[data-region="measures"] .p-tile', { ms: 800, nth: 1 }); await r.sleep(3200);
  },
  // 10 · close on Home
  close: async (r) => {
    await r.cut(Q("/home"), { name: "home close", caption: C.close[0], waitFor: '[data-region="metrics"]' });
    await r.move(r.view.w * 0.55, r.view.h * 0.42, 1200); await r.sleep(3800);
    await r.pointer(false); await r.sleep(1200);
  },
};
