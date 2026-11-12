// The demo cast against the repository: every demo page exists in outlets/, its fingerprint is the one
// the contract computes for its exact bytes, every prefix and page address passes the contract's own
// checks, and the demo release's text is inside the contract's limits.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { DEMO_HEADLINE, DEMO_LEAD_SECONDS, DEMO_OUTLETS, DEMO_PAGES, DEMO_SUMMARY, demoPageOf, demoPageUrl, demoPrefix } from "../../lib/pages.ts";
import { MIN_LEAD, headlineProblem, pageProblem, prefixProblem, summaryProblem, under } from "../../lib/rules.ts";
import { askContract } from "./oracle.mjs";

const REPO = "demo-owner/embargo";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const file = (p) => readFileSync(new URL(`../../../outlets/${p.outlet}/${p.file}`, import.meta.url), "utf8");

test("every page in outlets/ is a demo page, and every demo page is in outlets/", () => {
  const onDisk = [];
  for (const o of DEMO_OUTLETS) for (const f of readdirSync(new URL(`../../../outlets/${o.key}/`, import.meta.url))) if (!f.startsWith("._")) onDisk.push(`${o.key}/${f}`);
  assert.deepEqual(onDisk.sort(), DEMO_PAGES.map((p) => `${p.outlet}/${p.file}`).sort());
});

test("each demo page's fingerprint is the contract's for its exact bytes", (t) => {
  const fps = askContract(DEMO_PAGES.map((p) => ["fingerprint", [file(p)]]));
  if (!fps) return t.skip("no python3 on this machine");
  assert.deepEqual(DEMO_PAGES.map((p) => p.fp), fps);
});

test("the demo release, the prefixes and the page addresses pass the contract's checks", () => {
  assert.equal(headlineProblem(DEMO_HEADLINE), "");
  assert.equal(summaryProblem(DEMO_SUMMARY), "");
  assert.ok(DEMO_LEAD_SECONDS >= MIN_LEAD + 300, "the demo embargo leaves time for the issue to land");
  for (const o of DEMO_OUTLETS) assert.equal(prefixProblem(demoPrefix(REPO, COMMIT, o.key)), "", o.key);
  for (const p of DEMO_PAGES) {
    const url = demoPageUrl(REPO, COMMIT, p);
    assert.equal(pageProblem(url), "", url);
    assert.ok(under(url, demoPrefix(REPO, COMMIT, p.outlet)));
    assert.equal(demoPageOf(url), p);
  }
  assert.equal(demoPageOf(`https://raw.githubusercontent.com/${REPO}/${COMMIT}/README.md`), null);
  assert.equal(demoPrefix("", COMMIT, "harbour-post"), "", "no repository, no prefix");
});
