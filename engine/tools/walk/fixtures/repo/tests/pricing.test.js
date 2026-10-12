// tests/pricing.test.js — what done looks like for the pricing page and its door.
import { test } from "node:test";

test("the pricing screen shows the monthly and the annual plan", { screen: "pricing", goal: "annual-plan" }, () => {});
test("the prices door answers both plans with their price", { door: "GET /api/prices", goal: "annual-plan" }, () => {});
