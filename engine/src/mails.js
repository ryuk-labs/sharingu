// src/mails.js — the emails (sprint 21, slice 21.4a; the owner's rulings of 2026-10-14): each one's words, its HTML in the website's
// look and its plain-text twin. src/email.js sendMail sends them; nothing here sends or reads anything.
// To a person, only three (and the rare fourth): verifyMail (join: verify this address), inMail ("You're in": the operator's
// approval), resetMail (a forgotten passphrase), and alreadyMail (a join for an address that holds an account: sign in, or reset).
// To the team only: teamRequestMail (a new VERIFIED request: its company, role, team size and source, never the person's name or
// email) and capMail (the cap reached).
// THE LOOK: one table-built card on the paper page (email clients drop <style> and flexbox), the lowercase wordmark beside U-chan's
// mark (a PNG the worker itself serves, /assets/brand/uchan-mark.png: the one image, and the wordmark's own text when images are
// off), the brand's colours written inline, ONE orange button, the same link again as text under it, a quiet foot. No tracking
// pixel, no image from anyone else, no remote font (the faces fall back to the system's). Every value from a person is escaped.
// Each builder takes the ORIGIN its links start with (the request's own, src/index.js; the operator's --origin) and answers
// { subject, html, text }.
import { esc } from "./ui.js";
import { frontAssetHref } from "./frontassets.js";
import { BRAND_TOKENS_CSS } from "./shell.js";

// the hours a verification link works, the minutes a reset link does (src/requestaccess.js, src/accounts.js use the same)
export const VERIFY_HOURS = 24;
export const RESET_MINUTES = 30;
// the brand's colours, read from the ONE token set (src/shell.js BRAND_TOKENS_CSS: the Paper world's values) and written inline,
// because an email client reads no CSS variable
const bv = (name) => (new RegExp(`--bv-${name}:(#[0-9A-Fa-f]{6})`).exec(BRAND_TOKENS_CSS) || [])[1];
const C = { paper: bv("paper"), surface: bv("surface"), ink: bv("ink"), ink2: bv("ink-2"), line: bv("line"), accent: bv("identity"), deep: bv("orange-deep") };
const SANS = "Manrope,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const DISPLAY = "Fredoka,'Trebuchet MS',Manrope,Helvetica,Arial,sans-serif";
const SITE = "https://www.sharingu.xyz/";

// card({ origin, preheader, heading, paras, button, after, facts }) -> the HTML (paras and after: trusted markup made here, each
// value already escaped; facts: [label, value] rows, escaped here; no origin: no mark, the wordmark's text alone)
function card({ origin, preheader, heading, paras = [], button = null, after = [], facts = [] }) {
  const p = (h, muted = false) => `<p style="margin:0 0 14px;font:400 15px/1.6 ${SANS};color:${muted ? C.ink2 : C.ink}">${h}</p>`;
  const rows = facts.map(([k, v]) => `<tr><td style="padding:8px 0;border-top:1px solid ${C.line};font:600 13px/1.4 ${SANS};color:${C.ink2};width:120px">${esc(k)}</td>` +
    `<td style="padding:8px 0;border-top:1px solid ${C.line};font:400 14px/1.4 ${SANS};color:${C.ink}">${esc(v)}</td></tr>`).join("");
  const btn = button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr><td style="border-radius:10px;background:${C.accent};border:1px solid ${C.deep};border-bottom-width:3px">` +
    `<a href="${esc(button.href)}" style="display:inline-block;padding:13px 22px;font:700 15px/1 ${SANS};color:${C.ink};text-decoration:none;border-radius:10px">${esc(button.label)}</a></td></tr></table>` +
    p(`Or open this link: <a href="${esc(button.href)}" style="color:${C.ink};word-break:break-all">${esc(button.href)}</a>`, true) : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${C.paper}">
<div style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 18px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
${origin ? `<td style="padding-right:8px;vertical-align:middle"><img src="${esc(origin + frontAssetHref("brand/uchan-mark.png"))}" width="27" height="30" alt="" style="display:block;border:0"></td>` : ""}
<td style="vertical-align:middle;font:600 26px/1 ${DISPLAY};letter-spacing:-1px;color:${C.ink}">sharingu</td></tr></table></td></tr>
<tr><td style="background:${C.surface};border:1px solid ${C.line};border-radius:14px;padding:30px 28px 18px">
<h1 style="margin:0 0 16px;font:800 24px/1.25 ${SANS};letter-spacing:-0.4px;color:${C.ink}">${esc(heading)}</h1>
${paras.map((h) => p(h)).join("\n")}
${btn}
${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${rows}</table>` : ""}
${after.map((h) => p(h, true)).join("\n")}
</td></tr>
<tr><td style="padding:18px 4px 0;font:400 12.5px/1.5 ${SANS};color:${C.ink2}">sharingu · <a href="${SITE}" style="color:${C.ink2}">www.sharingu.xyz</a></td></tr>
</table></td></tr></table>
</body></html>`;
}
// plain({ heading, paras, link, after, facts }) -> the plain-text twin: the same words, the link on its own line
function plain({ heading, paras = [], link = null, after = [], facts = [] }) {
  return [heading, "", ...paras.flatMap((t) => [t, ""]), ...(link ? [`${link.label}: ${link.href}`, ""] : []),
    ...facts.map(([k, v]) => `${k}: ${v}`), ...(facts.length ? [""] : []), ...after.flatMap((t) => [t, ""]), "sharingu · www.sharingu.xyz"].join("\n");
}
// mail(origin, words) -> { subject, html, text } from one set of words (text: plain sentences; html: the same, escaped)
function mail(origin, { subject, preheader, heading, paras, link = null, after = [], facts = [] }) {
  return {
    subject,
    html: card({ origin, preheader, heading, paras: paras.map(esc), button: link, after: after.map(esc), facts }),
    text: plain({ heading, paras, link, after, facts }),
  };
}

// verifyMail({ origin, link, name }) — a join's ONE verification email (its link: the verify page, src/accountpage.js)
export const verifyMail = ({ origin, link, name }) => mail(origin, {
  subject: "Verify your email",
  preheader: "One step: verify this address and your request takes its place in line.",
  heading: "Verify your email",
  paras: [`Hi ${name || "there"}, thank you for asking to join the sharingu beta.`, "Verify this address with your passphrase and your request takes its place in line."],
  link: { label: "Verify my email", href: link },
  after: [`The link works once, for ${VERIFY_HOURS} hours.`, "If you did not ask to join, ignore this email: nothing happens without the passphrase that was chosen."],
});
// alreadyMail({ origin }) — a join for an address that already holds an account: nothing changed
export const alreadyMail = ({ origin }) => mail(origin, {
  subject: "You already have a sharingu account",
  preheader: "Sign in, or reset your passphrase.",
  heading: "You already have an account",
  paras: ["Someone asked to join the sharingu beta with this address, which already holds a sharingu account. Nothing changed."],
  link: { label: "Sign in", href: `${origin}/login` },
  after: [`Forgot your passphrase? Reset it at ${origin}/account/forgot`, "If it was not you, ignore this email."],
});
// inMail({ origin, name, company }) — the operator's approval: sign in, then create the org (no code to carry)
export const inMail = ({ origin, name, company }) => mail(origin, {
  subject: "You're in",
  preheader: "Your place in the sharingu beta is open.",
  heading: "You're in",
  paras: [`Hi ${name || "there"}, your place in the sharingu beta is open.`, `Sign in with your email and passphrase, then create the org for ${company || "your team"}: the form comes filled in from your request.`],
  link: { label: "Sign in", href: `${origin}/login` },
  after: ["Replies to this email reach the sharingu team."],
});
// resetMail({ origin, link }) — a forgotten passphrase's link (its page: src/accountpage.js renderReset)
export const resetMail = ({ origin, link }) => mail(origin, {
  subject: "Reset your passphrase",
  preheader: `Choose a new passphrase: the link works for ${RESET_MINUTES} minutes.`,
  heading: "Reset your passphrase",
  paras: ["Someone asked to reset the passphrase of the sharingu account for this address.", "Choose a new one: every session of the account is signed out, then you are signed in fresh."],
  link: { label: "Choose a new passphrase", href: link },
  after: [`The link works once, for ${RESET_MINUTES} minutes.`, "If you did not ask, ignore this email: your passphrase stays as it is."],
});
// teamRequestMail({ origin, request }) — to the team: a new verified request (no name, no email of the person); its source (21.4b: the
// page that sent them, src/requestaccess.js sourceOf) among the facts
export const teamRequestMail = ({ origin, request }) => mail(origin, {
  subject: `New beta request: ${request.company}`,
  preheader: `${request.company} verified its request for a place.`,
  heading: "A new verified request",
  paras: ["A request for a place in the beta was verified and is in line."],
  facts: [["Company", request.company], ["Role", request.role], ["Team size", request.team_size], ...(request.source ? [["Source", request.source]] : []), ["Request", request.id]],
  after: ["Approve it on the operator page (org 1's address, then /operator) or from the operator's terminal: node tools/operator.mjs requests, then allow --request <id>."],
});
// capMail({ total, cap, days }) — to the team, once a day: the cap is reached, nothing is sent to a person
export const capMail = ({ total, cap, days }) => mail("", {
  subject: "Email checks paused: the cap is reached",
  preheader: `${total} counted emails in the last ${days} days.`,
  heading: "Email checks are paused",
  paras: [`The worker counted ${total} emails in the last ${days} days: the cap is ${cap}, inside Cloudflare's 3,000 a month.`,
    "Nothing is sent to a person until the window frees a place; the pages say email checks are paused and offer Google."],
});
