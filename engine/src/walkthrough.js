// src/walkthrough.js — THE walkthrough, as data (sprint 21, 21.3; the owner's MCQ, 2026-10-14): the five public videos and the
// channel, ONE list. The showcase at `/` draws it (src/showcase.js, its #walkthrough section); every other page that offers the
// walkthrough (the request's in-line and asked pages, src/requestpage.js) links to that section, never to a list of its own.
// Each is a plain link that opens YouTube in a new tab: no embed, no iframe, no thumbnail, so nothing third-party loads on a page
// of ours (the website's docs page keeps its own copies, `docs.html#walkthrough`, the stores' demo address).
import { PLATFORM_ROOT } from "./orgpath.js";

export const WALKTHROUGH = [
  { title: "Join and connect", url: "https://youtu.be/uriCywoKUds" },
  { title: "Org and people", url: "https://youtu.be/tQqznIrS5t4" },
  { title: "Fill the product side", url: "https://youtu.be/9G8QML-7yHY" },
  { title: "Fill the GTM side", url: "https://youtu.be/UCBdg8f2wL8" },
  { title: "The ChatGPT walkthrough", url: "https://youtu.be/oZtAL5Uf4Ak" },
];
export const WALKTHROUGH_CHANNEL = { title: "The channel", url: "https://www.youtube.com/@SharinguAIApp" };
// where a page sends a person for the walkthrough: the showcase's own section, at the platform's root (never an org's)
export const WALKTHROUGH_PATH = `${PLATFORM_ROOT}#walkthrough`;
