// src/profile.js — the person's own page (the look pass, sprint 2; the owner's MCQ of 2026-09-30 evening): who they are here
// (their mark, name, title, role), their HATS (one or more of the seven, each with its one-line meaning: Home leads
// with what the hats need and the briefing follows them, src/hats.js), their seats, the STANDING consent toggle (ADR-102
// §2, owner ruling "build now" 2026-09-01) and their secrets. Content-only; the caller wraps with shell(). Self-service ONLY:
// a person sets their own hats, mark and consent; the admin sees the consent on /control and never sets it for anyone. The
// name and the title are the admin's (the door takes no self-edit of them).
//
// Consent grades (people.trace_consent, migrate-020): NULL/'off' — nothing shared (default) · 'traces' — session traces may
// be stored for R's improvement · 'traces+prompts' — authored prompts too. Enforced at the door (src/index.js): below-grade
// material is STRIPPED with an honest note, never blocked. Data lands in THIS org's own databank only, indexed by engine
// axes, never by project (ADR-102 + addendum), said in plain words below so the person consents to something they understand.
//
// Hats and the mark save through POST /profile action set-profile (the same route, the same resolve: never
// the read-only credential; the same CSRF check). The owner's ruling (MCQ, 2026-10-01; migrate-045): the hats a person
// picks here only shape what Home shows them first; the hats that unlock briefings and cards are their ACCESS hats, which only
// the admin sets on Control. The page says so, and shows the access hats read-only.

import { esc, errorState } from "./ui.js";
import { card, facts, chip, avatar, line, lines, empty, pageHead, cols, stack, copyBtn } from "./parts.js";
import { DEFAULT_BRAND } from "./tenant.js";
import { HATS, hatsOf, avatarOf, AVATAR_TONES, roleClassOf, roleWordOf } from "./hats.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { projectSlug } from "./project.js";

// gradesFor(engine) — the three consent grades. A function of the tenant's engine
// name (not a module constant) because the "traces" detail names it in rendered copy.
// copy: off-screen (each grade's meaning rides its radio's title)
function gradesFor(engine) {
  return [
    { value: "off", label: "Share nothing", detail: "No traces, no prompts. Your work still files normally. This only governs data about HOW you work." },
    { value: "traces", label: "Share session traces", detail: `Tool-use and session shape may be stored in THIS org's own databank to improve ${engine}. Never your words.` },
    { value: "traces+prompts", label: "Traces + my written prompts", detail: "Also the prompts you explicitly attach to a report (the one sanctioned field). Owner-readable only, stored only in this org's databank." },
  ];
}
const TONE_WORD = { stone: "Stone", gold: "Gold", sky: "Sky", violet: "Violet" };

// renderProfilePage(opts) — the page (sprint 3, L3: the revision, docs/plan/LOOK.md). The head (the person's name and mark), the
// facts (role, title, projects, access hats, consent), then four cards, each ONE form or one read: Your hats (the seven as
// checkable chips, each hat's meaning in its title; the mark's tone), Your access (read-only chips), Consent (three radio lines,
// each grade's meaning in its title), Your secrets (change the passphrase, rotate the key; the new key once, as a copyable
// value). Every form posts exactly what it posted before (POST /profile: set-profile, set-consent, set-my-passphrase,
// rotate-my-key; the same field names; the same CSRF check at the door): only the frame around them changed.
export function renderProfilePage(opts) {
  const { person = {}, seats = [], consent = "off", saved = false, savedProfile = false, brand = DEFAULT_BRAND, mandateFloor = "off", secret = "", newKey = "" } = opts || {};
  const SECRET_FLASH = { passphrase: ["ok", "Passphrase changed"], wrong: ["bad", "That current passphrase did not match. Nothing changed."], locked: ["bad", "Too many attempts. Wait 15 minutes and try again."], short: ["bad", "Passphrase too short (minimum 4 characters). Nothing changed."] };   // copy: error
  const secretFlash = newKey
    ? `<div class="pr-flash pr-key" title="Your passphrase is unchanged. Every tool that held the old key stops working now, and every signed-in session and CLI token of yours is signed out, this one included: sign in again with your passphrase."><b>New key</b><code class="pr-keyval">${esc(newKey)}</code>${copyBtn(newKey, { title: "Copy it now: it is shown once" })}</div>`
    // a refused change is the ERROR pattern (red only there, always with its icon); a done change is the green flash
    : (SECRET_FLASH[secret] ? (SECRET_FLASH[secret][0] === "bad" ? errorState({ what: SECRET_FLASH[secret][1] }) : `<div class="pr-flash" title="Use it from your next sign-in; sessions already open stay signed in">${esc(SECRET_FLASH[secret][1])}</div>`) : "");
  const cur = consent || "off";
  const grades = gradesFor(brand.engine);
  // M-ADR-019: a mandated floor is shown plainly, never hidden: a chip, its whole rule in its title
  const mandated = mandateFloor === "traces" || mandateFloor === "traces+prompts";
  const mandateChip = mandated ? chip(`Traced at ${mandateFloor}`, { tone: "warn", attrs: 'data-mandate="1"', title: `Your org monitors internal staff at the "${mandateFloor}" level. As internal staff, your work sessions are traced at least at this level to help improve ${brand.engine}. This is set by org policy, applies to internal roles only, and is shown here rather than hidden. You can raise your own level below, never lower it below the org floor. What is captured is still sanitized (engine behaviour only) and never includes your conversation text.` }) : "";
  const radios = grades.map((g) => `
    <label class="pr-grade${cur === g.value ? " on" : ""}" title="${esc(g.detail)}">
      <input type="radio" name="consent" value="${esc(g.value)}"${cur === g.value ? " checked" : ""}>
      <span class="pr-glabel">${esc(g.label)}</span>
    </label>`).join("");
  const av = avatarOf(person);
  const cls = roleClassOf(person.role);
  const worn = new Set(hatsOf(person.hats));
  const access = hatsOf(person.access_hats).map((k) => HATS.find((h) => h.key === k)).filter(Boolean);
  const head = pageHead({ title: person.name || "Your profile", aside: `${avatar({ name: person.name || "", initials: av.initials, tone: av.tone, size: 32 })}${mandateChip}` });
  // copy: off-screen (the Role cell's title)
  const roleNote = cls === "partner" ? "As a Partner you see only the projects you are seated on" : cls === "admin" ? "As the admin you manage people on Control" : "You see everything in the projects you are seated on";
  const f = facts([
    { label: "Role", html: `<span class="pr-role" data-role="${esc(cls)}">${esc(roleWordOf(person.role))}</span>`, title: `${roleNote}. Your name and title are set by your admin.` },
    { label: "Title", value: person.title || "–" },
    { label: "Projects", value: seats.length ? String(seats.length) : "–", title: seats.length ? seats.map((x) => x.name || projectSlug(x.key)).join(" · ") : "" },
    { label: "Access", value: cls === "admin" ? "Everything" : access.length ? access.map((h) => h.label).join(", ") : "Your role" },
    { label: "Consent", value: (grades.find((g) => g.value === cur) || grades[0]).label },
  ], { region: "identity" });
  // your projects, by name (the seats this person holds; the owner holds every active project)
  const projects = card({ label: "Projects", count: seats.length || "", flush: true, region: "seats", body: seats.length ? lines(seats.map((x) => line({ title: x.name || projectSlug(x.key), sub: x.name && projectSlug(x.key) !== x.name ? `<code class="pr-mono">${esc(projectSlug(x.key))}</code>` : "" })), { compact: true }) : empty("No project yet") });
  // your hats: the seven, each a checkable chip with its one-line meaning in its title, and your mark's tone
  const hatChips = HATS.map((h) => `<label class="pr-hat" title="${esc(`${h.line} ${h.detail || ""}`.trim())}"><input type="checkbox" name="hat" value="${esc(h.key)}"${worn.has(h.key) ? " checked" : ""}><span>${esc(h.label)}</span></label>`).join("");
  const tones = AVATAR_TONES.map((t) => `<label class="pr-tone" title="${esc(TONE_WORD[t])}"><input type="radio" name="tone" value="${esc(t)}"${av.tone === t ? " checked" : ""}>${avatar({ name: person.name || "", initials: av.initials, tone: t, size: 32 })}<span class="u-sr">${esc(TONE_WORD[t])}</span></label>`).join("");
  const hatsForm = `<form method="POST" action="${orgPath(`/profile`)}" class="pr-form" data-region="hats">
    <input type="hidden" name="action" value="set-profile">
    ${card({ label: "Your hats", attrs: 'title="Pick the ones you wear: they set what Home shows you first. They never change what you may read; that is your access."',
      action: `<button type="submit" class="u-btn small" data-button="save-profile" data-door="POST /profile">Save</button>`,
      body: `<div class="pr-hats">${hatChips}</div><h3 class="p-label pr-h" id="pr-h-mark">Your mark</h3><div class="pr-tones" role="radiogroup" aria-labelledby="pr-h-mark">${tones}</div>` })}
  </form>`;
  // your access: the hats your admin gave you (people.access_hats), read-only
  const accessCard = card({ label: "Your access", region: "access-hats", attrs: `title="${esc(cls === "admin" ? "As the admin you read everything in this org." : "A doc or card opened to one of these hats opens to you. Only an admin changes this, on Control.")}"`,
    action: chip("Set by your admin"), body: access.length ? `<ul class="pr-access-list">${access.map((h) => `<li data-hat="${esc(h.key)}" title="${esc(h.line)}">${esc(h.label)}</li>`).join("")}</ul>`
      : empty(cls === "admin" ? "Everything" : "No access hat") });
  const consentForm = `<form method="POST" action="${orgPath(`/profile`)}" class="pr-form">
    <input type="hidden" name="action" value="set-consent">
    ${card({ label: "Consent", attrs: 'title="Whatever you pick, the data stays in this org&#39;s own databank, never a central store, and is indexed by how the engine behaved, never by any project. It applies from now on, not retroactively (ADR-102)."',
      action: `<button type="submit" class="u-btn small">Save</button>`, body: `<div class="pr-grades">${radios}</div>` })}
  </form>`;
  const secrets = card({ label: "Your secrets", attrs: 'title="Your passphrase signs you in on the web. Your key is what a tool uses to act as you; it is never stored in a readable form, so the only time you can see it is the moment it is made. Both changes ask for your current passphrase first."',
    body: `${secretFlash}<div class="pr-secrets">
    <form method="POST" action="${orgPath(`/profile`)}" class="pr-secret" aria-labelledby="pr-h-pass">
      <h3 class="p-label pr-h" id="pr-h-pass">Passphrase</h3>
      <input type="hidden" name="action" value="set-my-passphrase">
      <label class="pr-lab" title="Your current passphrase, or your key if you never had a passphrase">Current passphrase<input type="password" name="current" required autocomplete="current-password" data-input-exception="auth"></label>
      <label class="pr-lab" title="Three words with hyphens works well">New passphrase<input type="password" name="password" required minlength="4" autocomplete="new-password" data-input-exception="auth"></label>
      <button type="submit" class="u-btn small">Change passphrase</button>
    </form>
    <form method="POST" action="${orgPath(`/profile`)}" class="pr-secret" aria-labelledby="pr-h-key">
      <h3 class="p-label pr-h" id="pr-h-key">Key</h3>
      <input type="hidden" name="action" value="rotate-my-key">
      <label class="pr-lab">Current passphrase<input type="password" name="current" required autocomplete="current-password" data-input-exception="auth"></label>
      <button type="submit" class="u-btn small" title="Shown once, here. Your passphrase stays as it is; every tool holding the old key stops working and all your sessions are signed out.">Rotate my key</button>
    </form>
  </div>` });
  const flashes = `${saved ? `<div class="pr-flash" title="Your consent choice is live now">Saved</div>` : ""}${savedProfile ? `<div class="pr-flash" title="Your hats and your mark are live now">Saved</div>` : ""}`;
  return `<div class="profile-page">${head}${flashes}${stack(f, cols(stack(hatsForm, consentForm, secrets), stack(accessCard, projects)))}</div>
<style>
  .profile-page{color:var(--text)}
  .profile-page .pr-form{margin:0}
  .profile-page .pr-mono{font:400 11.5px/1 var(--mono);color:var(--text-faint)}
  .profile-page .pr-role[data-role="partner"]{color:var(--accent-text)}
  .profile-page .pr-hats{display:flex;flex-wrap:wrap;gap:8px}
  .profile-page .pr-hat{position:relative;display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 12px 0 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);cursor:pointer;font:500 13px/1 var(--sans);
    transition:border-color var(--dur-fast) var(--ease),background-color var(--dur-fast) var(--ease)}
  .profile-page .pr-hat:hover{border-color:var(--line-strong)}
  .profile-page .pr-hat input{margin:0;accent-color:var(--text)}
  .profile-page .pr-hat:has(input:checked){border-color:var(--text);background:var(--hover)}
  .profile-page .pr-hat:has(input:focus-visible){outline:2px solid var(--focus);outline-offset:2px}
  .profile-page .pr-tones{display:flex;gap:8px;margin:16px 0 0}
  .profile-page .pr-tone{position:relative;display:inline-grid;place-items:center;padding:2px;border-radius:50%;border:2px solid transparent;cursor:pointer}
  .profile-page .pr-tone input{position:absolute;opacity:0;pointer-events:none}
  .profile-page .pr-tone:has(input:checked){border-color:var(--text)}
  .profile-page .pr-tone:has(input:focus-visible){outline:2px solid var(--focus);outline-offset:2px}
  .profile-page .pr-access-list{display:flex;flex-wrap:wrap;gap:6px;list-style:none;margin:0;padding:0}
  .profile-page .pr-access-list li{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:6px;background:var(--well);color:var(--text);font:600 12.5px/1 var(--sans)}
  .profile-page .pr-grades{display:flex;flex-direction:column;gap:6px}
  .profile-page .pr-grade{display:flex;align-items:center;gap:8px;min-height:36px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface);cursor:pointer;
    transition:border-color var(--dur-fast) var(--ease)}
  .profile-page .pr-grade:hover{border-color:var(--line-strong)}
  .profile-page .pr-grade.on,.profile-page .pr-grade:has(input:checked){border-color:var(--text)}
  .profile-page .pr-grade input{margin:0;accent-color:var(--text)}
  .profile-page .pr-glabel{font:500 13.5px/1.3 var(--sans)}
  .profile-page .pr-secrets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .profile-page .pr-secret{display:grid;gap:10px;align-content:start;margin:0}
  .profile-page .pr-tones{margin-top:0}
  .profile-page .pr-hats+.pr-h{margin:16px 0 8px}
  .profile-page .pr-secret .u-btn{justify-self:start}
  .profile-page .pr-lab{display:grid;gap:5px;font:500 12px/1.3 var(--sans);color:var(--text-muted)}
  .profile-page .pr-lab input{font:400 14px var(--sans);padding:8px 10px;border:1px solid var(--line-strong);border-radius:8px;background:var(--page);color:var(--text)}
  .profile-page .pr-flash{display:inline-flex;align-items:center;gap:10px;margin:0 0 12px;padding:8px 12px;border-radius:8px;background:var(--ok-tint);color:var(--ok);font:500 13px/1.3 var(--sans)}
  .profile-page .pr-key{display:flex;flex-wrap:wrap;background:var(--surface);color:var(--text);border:1px solid var(--line-strong)}
  .profile-page .pr-keyval{font:400 13px/1.4 var(--mono);padding:4px 8px;border-radius:6px;background:var(--well);color:var(--text);word-break:break-all;user-select:all}
  @media (max-width:640px){.profile-page .pr-secrets{grid-template-columns:1fr}}
</style>`;
}
