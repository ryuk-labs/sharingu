// routes.js — every page and every API door Tea Shop serves (the app's router reads this table).
import { page, api } from "./lib.js";

export default [
  page("GET /", "home", "Home", { lane: "buy", step: 1, file: "pages/home.js" }),
  page("GET /pricing", "pricing", "Pricing", { lane: "buy", step: 2, file: "pages/pricing.js", uses: ["GET /api/prices"] }),
  page("GET /checkout", "checkout", "Checkout", { lane: "buy", step: 3, file: "pages/checkout.js", uses: ["POST /api/orders"] }),
  api("GET /api/prices", { reads: ["prices"] }),
  api("POST /api/orders", { reads: ["prices"], writes: ["orders"] }),
];
