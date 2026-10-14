// src/walkthrough.js — THE walkthrough, as data (sprint 21, 21.3; 21.P B9/B10: the website's own five, in its order): the five
// public videos and the channel, ONE list, the SAME titles, badges, durations and order as the website's docs page
// (docs.html#walkthrough, the stores' demo address): the reviewer's test cases first, then a new team's four steps. The showcase at
// `/` draws it (src/showcase.js, its #walkthrough section: each video plays in place behind its poster, as the website's does);
// every other page that offers the walkthrough (the request's pages, src/requestpage.js) links to that section, never to a list of
// its own. The posters are the website's own JPEGs, served by the worker (src/frontassets.js), never hotlinked.
import { PLATFORM_ROOT } from "./orgpath.js";

// id: the YouTube video's id (an 11-character name); badge, title and time as the website shows them; duration its ISO form (the
// <time datetime>); poster: the still under engine/assets/, its width and height
export const WALKTHROUGH = [
  { id: "oZtAL5Uf4Ak", badge: "ChatGPT + the live app", title: "The reviewer’s eight test cases", time: "4:34", duration: "PT4M34S", poster: "walkthrough/5-chatgpt-test-cases.jpg", w: 960, h: 540 },
  { id: "uriCywoKUds", badge: "Step 1 of 4", title: "Join and connect", time: "1:03", duration: "PT1M3S", poster: "walkthrough/1-join-and-connect.jpg", w: 960, h: 600 },
  { id: "tQqznIrS5t4", badge: "Step 2 of 4", title: "Your org, its project, its people", time: "0:55", duration: "PT55S", poster: "walkthrough/2-org-and-people.jpg", w: 960, h: 600 },
  { id: "9G8QML-7yHY", badge: "Step 3 of 4", title: "Fill the product side", time: "0:56", duration: "PT56S", poster: "walkthrough/3-fill-the-product-side.jpg", w: 960, h: 600 },
  { id: "UCBdg8f2wL8", badge: "Step 4 of 4", title: "Fill the GTM side", time: "0:53", duration: "PT53S", poster: "walkthrough/4-fill-the-gtm-side.jpg", w: 960, h: 600 },
].map((v) => ({ ...v, url: `https://youtu.be/${v.id}` }));
// the player a press loads in place (the website's: youtube-nocookie, autoplay, no related videos from other channels)
export const embedUrl = (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
export const WALKTHROUGH_CHANNEL = { title: "sharingu’s YouTube channel", url: "https://www.youtube.com/@SharinguAIApp" };
// where a page sends a person for the walkthrough: the showcase's own section, at the platform's root (never an org's)
export const WALKTHROUGH_PATH = `${PLATFORM_ROOT}#walkthrough`;
