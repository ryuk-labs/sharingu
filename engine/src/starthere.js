// starthere.js — the newcomer's FIRST read (W4, B7b, Q60CCC574: day-1 is ONE MCP URL and a sign-in, about five minutes).
// `initialize` names `start-here.md` as the guide; this makes that doc real on EVERY project: `read` {ref:
// "doc/start-here.md"} serves the project's own start-here.md (a doc filed through preview then file) when it has one, else
// this built-in text, and the Library lists it first either way. PURE — the org's name, the engine's name and the owner's name are passed
// in from the seam (src/tenant.js), never typed here (check-brand.py). It names only tools the door carries; a
// human verb (land · deploy · publish · consent · reopen) has no tool, and this text never pretends otherwise.
import { TEMPO_WORDS } from "./tempo.js";
import { orgNoteDefault, PROJECT_RULE } from "./core.js";

export const START_HERE_TOOLS = ["whoami", "updates", "missing", "formats", "preview", "file", "ask", "wrap_up", "open_items", "read", "goals"];

// what each tempo word means, keyed by the word (TEMPO_WORDS is the one list; a word without a line here fails the selftest)
const TEMPO_MEANS = {
  "in": "received and live; nothing is wrong, nobody has ruled yet",
  "with": "waiting for the owner's ruling",
  "decided": "the owner ruled (approve · reject · needs-work)",
  "on the canvas": "landed (approved, or filed straight through) and names what it touches; it is part of the shared picture at once",
  "needs more": "it could not be filed as binding: the reply named what is `missing`, with an `example`; send it again with those",
};

export function startHereText(o) {
  const org = (o && o.org) || "this org";
  const engine = (o && o.engine) || "the engine";
  const owner = (o && o.owner) || "the owner";
  // B7d S1: the org-note sentence is orgNoteDefault's (src/core.js) — the SAME one whoami's projectGloss renders, so this
  // doc never promises a name the gloss cannot give. `home` is the org's declared home project (homeProjectOf), or null.
  // B7e C5: `homeName` — the home project's own name, read from the projects table by the caller (mcp.js startHereDoc)
  const orgNote = orgNoteDefault((o && o.home) || null, [], (o && o.homeName) || null);
  const words = TEMPO_WORDS.map((w) => `- **${w === "with" ? `with ${owner}` : w}** — ${TEMPO_MEANS[w] || ""}`).join("\n");
  return `# Start here — ${org}

You are connected to ${engine}, where ${org} keeps its shared knowledge. Everything below happens through this one connection:
no clone, no install, no repo. Five calls make you a working member.

## Your first five minutes
1. \`whoami\` — who you are here: your projects, the project your writes land in (\`activeProject\`), and one line
   each on what your lane and consent mean.
2. \`updates\` — what changed since you were last here and what is waiting on you: the project's aim and blockers, your
   open items, and your own contributions and questions with where each stands. Call it at the start of every session.
3. \`missing\` with \`project\` — what your project still needs, and for each item the exact call that fills it (most are
   \`preview\` items: the aim, goals, questions, checks, the map, docs). \`formats\` shows how every item is shaped.
4. Contribute one thing. Preview it first: \`preview\` shows what will be filed, where it will show, how it is graded and
   what it reaches, and files nothing; show the person its \`text\` as it is. Then \`file\` with the same items files it.
   The simplest is a plain note — what and why only: no touches, proof, screens or ids needed, and anyone may file it in
   lane "leader", whatever your own lane is:
   \`preview\` with \`{"project": "<one of your projects>", "items": [{"contribution": {"lane": "leader", "kind": "note", "what": "…", "why": "…"}}]}\`,
   then \`file\` with \`{"previewId": "<the id preview answered>", "items": [the same items]}\`.
   (\`touches\` — the note ids or areas it affects — is optional for a plain note; every other filing needs it.)
   The receipt names each item with its status and its id; the preview's \`effect\` said where it lands (files at once, or
   waits for the owner), and \`updates\` shows where it stands after, in the words below.
5. Ask one thing: \`ask\` with \`{"question": "…", "project": "<one of your projects>"}\`. It waits with ${owner} until it is
   answered, and \`updates\` shows it.

Close a session with \`wrap_up\` and \`{"summary": "what you did", "open": ["what is still open"], "project": "<one of your projects>"}\`
— each open line becomes one of your open items, and the reply's \`receipt.openItemIds\` names them (the same ids
\`updates\` lists under waitingOnYou; close one with \`open_items\` and \`close\`).

## Which project
${PROJECT_RULE}
\`updates\` shows which project each thing you sent landed in.
${orgNote}

## Where an item stands
Every item of yours in \`updates\` wears one of these words:
${words}

## What to read next
- \`read\` with \`{"kind": "doc"}\` — every doc here; \`read\` with \`{"ref": "doc/<path>"}\` reads one.
- \`goals\` — the goal tree, and how far each goal has moved.

## What no tool here does
Landing code, deploying, publishing, giving consent and reopening a decision stay with people. Nothing at this door
does them; if one is needed, say so with \`ask\`.
`;
}
