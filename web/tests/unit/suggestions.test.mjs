// Every one-click suggestion is inside the contract's limits.

import test from "node:test";
import assert from "node:assert/strict";

import { DEMO_MAX_JOIN_BOND, demoPrefix } from "../../lib/pages.ts";
import { MAX_LEAD, MIN_LEAD, REPORT_BOND, bondProblem, headlineProblem, pageProblem, prefixProblem, summaryProblem, under } from "../../lib/rules.ts";
import { BOND_CHIPS, DEPOSIT_CHIPS, LEAD_CHIPS, RELEASE_CHIPS, pageChips, prefixChips, reportChips } from "../../lib/suggestions.ts";

const REPO = "demo-owner/embargo";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

test("release chips: every headline and summary is taken", () => {
  assert.ok(RELEASE_CHIPS.length >= 3);
  for (const c of RELEASE_CHIPS) {
    assert.equal(headlineProblem(c.value.headline), "", c.label);
    assert.equal(summaryProblem(c.value.summary), "", c.label);
  }
});

test("embargo and bond chips are inside the limits", () => {
  for (const c of LEAD_CHIPS) assert.ok(c.value >= MIN_LEAD + 120 && c.value <= MAX_LEAD, c.label);
  for (const c of BOND_CHIPS) assert.equal(bondProblem(c.value), "", c.label);
  assert.ok(BOND_CHIPS.some((c) => c.value <= DEMO_MAX_JOIN_BOND));
  for (const c of DEPOSIT_CHIPS) assert.ok(c.value >= REPORT_BOND && c.value % REPORT_BOND === 0n, c.label);
});

test("prefix chips are prefixes the contract takes", () => {
  for (const c of [...prefixChips(REPO, COMMIT), ...prefixChips("", "")]) assert.equal(prefixProblem(c.value), "", c.label);
  assert.equal(prefixChips("", "").length, 2, "no demo folder without a commit");
});

test("page chips are page addresses below their outlet's prefix, with what to expect", () => {
  for (const key of ["harbour-post", "bay-gazette"]) {
    const prefix = demoPrefix(REPO, COMMIT, key);
    const chips = pageChips(REPO, COMMIT, key);
    assert.ok(chips.length >= 1);
    assert.deepEqual(reportChips(prefix), chips);
    for (const c of chips) {
      assert.equal(pageProblem(c.value), "", c.value);
      assert.ok(under(c.value, prefix));
      assert.ok(c.tag);
    }
  }
  const post = pageChips(REPO, COMMIT, "harbour-post").map((c) => [c.label, c.tag]);
  assert.deepEqual(post, [
    ["Early story", "broken"],
    ["Weather column", "kept"],
    ["Company history", "kept or unclear"],
  ]);
  assert.deepEqual(reportChips("https://lanternlight.example/news/"), []);
});
