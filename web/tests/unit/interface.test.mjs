// The site against the contract it talks to, read from contracts/embargo.py in this repository: every
// write builder names a real write method with the right number of arguments and sends value only to
// a payable one; every view the site reads exists and the site reads every view; the limits and the
// questions are the contract's own; the checks a form makes answer as the contract's do; every refusal
// sentence the in-memory contract gives is made of the contract's words; and the in-memory rules() is
// the contract's rules(), compared whole.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { calls } from "../../lib/calls.ts";
import { CONTRACT_RULES } from "../../lib/contract-rules.ts";
import * as rules from "../../lib/rules.ts";
import { askContract } from "./oracle.mjs";

const raw = readFileSync(new URL("../../../contracts/embargo.py", import.meta.url), "utf8");
// The contract's source with Python's adjacent string literals (a sentence split over lines) joined.
const joined = raw
  .replace(/\\"/g, '"')
  .replace(/"\s*\n\s*"/g, "")
  .replace(/"\s*\n\s*\+\s*"/g, "")
  .replace(/"\s*\+\s*\n\s*"/g, "")
  .replace(/" "/g, "");
const chainSource = readFileSync(new URL("../../lib/chain.ts", import.meta.url), "utf8");
const mockSource = readFileSync(new URL("../../lib/chain-mock.ts", import.meta.url), "utf8");

function methods() {
  const out = {};
  const re = /@gl\.public\.(write(?:\.payable)?|view)\s*\n\s*def (\w+)\(self(?:,\s*([^)]*))?\)/g;
  for (const m of raw.matchAll(re)) {
    const params = (m[3] ?? "").split(",").map((p) => p.trim()).filter(Boolean);
    out[m[2]] = { kind: m[1].startsWith("view") ? "view" : "write", payable: m[1].endsWith("payable"), params: params.length };
  }
  return out;
}

test("every write builder names a write method of the contract, with its arguments and its value", () => {
  const all = methods();
  const built = [
    calls.issue("Lantern Bay Ferries adds a night crossing", "x".repeat(40), 1_900_000_000, 10n ** 17n),
    calls.join("E1", "https://news.example/a/", 10n ** 17n),
    calls.releaseBond("E1", "0x" + "ab".repeat(20)),
    calls.deposit(10n ** 17n),
    calls.withdraw(),
    calls.report("E1", "0x" + "ab".repeat(20), "https://news.example/a/b.html"),
  ];
  const writes = Object.entries(all).filter(([, m]) => m.kind === "write").map(([n]) => n).sort();
  assert.equal(writes.length, 6);
  assert.deepEqual([...new Set(built.map((c) => c.fn))].sort(), writes, "the site can send every write and nothing else");
  for (const c of built) {
    assert.equal(c.args.length, all[c.fn].params, `${c.fn} takes ${all[c.fn].params} arguments`);
    assert.equal(c.value !== undefined, all[c.fn].payable, `${c.fn} sends value only when payable`);
  }
  // issue(headline, summary, embargo_until, bond): the instant as a number, the bond as digits
  assert.equal(typeof built[0].args[2], "number");
  assert.equal(built[0].args[3], "100000000000000000");
});

test("every view of the contract is read by the site, and nothing else is", () => {
  const views = Object.entries(methods()).filter(([, m]) => m.kind === "view").map(([n]) => n).sort();
  assert.equal(views.length, 8);
  const read = [...new Set([...chainSource.matchAll(/view\("(\w+)"/g)].map((m) => m[1]))].sort();
  assert.deepEqual(read, views);
  for (const v of views) assert.ok(mockSource.includes(`case "${v}"`), `the in-memory contract answers ${v}()`);
});

test("the limits, the money and the questions are the contract's own", (t) => {
  const c = askContract([["constants", []]]);
  if (!c) return t.skip("no python3 on this machine");
  const k = c[0];
  const same = { MIN_BOND: rules.MIN_BOND, MAX_BOND: rules.MAX_BOND, MIN_LEAD: rules.MIN_LEAD, MAX_LEAD: rules.MAX_LEAD, REPORT_BOND: rules.REPORT_BOND, REPORTER_SHARE: rules.REPORTER_SHARE, UNCLEAR_PART: rules.UNCLEAR_PART, MIN_HEADLINE: rules.MIN_HEADLINE, MAX_HEADLINE: rules.MAX_HEADLINE, MIN_SUMMARY: rules.MIN_SUMMARY, MAX_SUMMARY: rules.MAX_SUMMARY, MAX_PREFIX: rules.MAX_PREFIX, MAX_URL: rules.MAX_URL, MAX_RAW_PAGE: rules.MAX_RAW_PAGE, MAX_RAW_BYTES: rules.MAX_RAW_BYTES, MAX_PAGE_TEXT: rules.MAX_PAGE_TEXT, FP_CHARS: rules.FP_CHARS, PAGE: rules.PAGE, ID_CHARS: rules.ID_CHARS, ADDRESS_CHARS: rules.ADDRESS_CHARS };
  for (const [name, mine] of Object.entries(same)) assert.equal(String(mine), k[name], name);
  for (const name of ["QUESTION_REPORTS", "MEANING_REPORTS", "QUESTION_OTHER", "MEANING_OTHER", "NEWS", "READING"]) assert.equal(rules[name], k[name], name);
});

test("the in-memory rules() is the contract's rules(), compared whole", (t) => {
  const r = askContract([["rules", []]]);
  if (!r) return t.skip("no python3 on this machine");
  assert.deepEqual(CONTRACT_RULES, r[0]);
  for (const [f, words] of Object.entries(rules.COMBINE)) assert.equal(r[0].report.combine[f], words);
});

test("the checks a form makes answer as the contract's do", (t) => {
  const urls = [
    "https://news.example/a/b.html",
    "http://news.example/a/",
    "https://News.example/a/",
    "https://news.example",
    "https://localhost/a/",
    "https://news.example/a//b",
    "https://news.example/a/../b",
    "https://news.example/a/./b",
    "https://news.example/a?x=1",
    "https://news.example/a#x",
    "https://news.example:8080/a",
    "https://news.example/café",
    "https://.news.example/a",
    "https://news.example./a",
    "https://raw.githubusercontent.com/demo-owner/embargo/0123456789abcdef0123456789abcdef01234567/outlets/harbour-post/",
    "https://news.example/" + "a".repeat(200),
    "https://news.example/a/b",
  ];
  const texts = [["Lantern Bay", 10, 120, "the headline"], ["short", 10, 120, "the headline"], ["tab\there ok ok", 10, 120, "the headline"], ["café au lait ok", 10, 120, "the headline"], ["x".repeat(121), 10, 120, "the headline"]];
  const numbers = [5, "12", " 7 ", "-3", "1.5", true, null, "٣", "9".repeat(41), "0"];
  const q = [
    ...urls.map((u) => ["url_problem", [u, 200, "the page address"]]),
    ...urls.map((u) => ["prefix_problem", [u]]),
    ...texts.map((x) => ["text_problem", x]),
    ...numbers.map((n) => ["number_arg", [n]]),
    ["under", ["https://a.example/x/y", "https://a.example/x/"]],
    ["under", ["https://a.example/x/", "https://a.example/x/"]],
  ];
  const a = askContract(q);
  if (!a) return t.skip("no python3 on this machine");
  let i = 0;
  for (const u of urls) assert.equal(rules.urlProblem(u, 200, "the page address"), a[i++], `url ${u}`);
  for (const u of urls) assert.equal(rules.prefixProblem(u), a[i++], `prefix ${u}`);
  for (const x of texts) assert.equal(rules.textProblem(...x), a[i++], `text ${x[0]}`);
  for (const n of numbers) assert.equal(rules.numberArg(n).toString(), a[i++], `number ${JSON.stringify(n)}`);
  assert.equal(rules.under("https://a.example/x/y", "https://a.example/x/"), a[i++]);
  assert.equal(rules.under("https://a.example/x/", "https://a.example/x/"), a[i++]);
});

test("every refusal sentence of the in-memory contract is made of the contract's words", () => {
  // The fixed pieces of each refusal (the text between the values) must appear in the contract's source.
  const pieces = [];
  for (const m of mockSource.matchAll(/(?:fail\(|problem = |refuse\(m, )([^;]+?)\)?;/g)) {
    for (const lit of m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      const s = lit[1].replace(/\\"/g, '"').trim();
      if (s.length >= 12) pieces.push(s);
    }
  }
  assert.ok(pieces.length >= 25, `found ${pieces.length} refusal pieces`);
  const missing = pieces.filter((p) => !joined.includes(p));
  assert.deepEqual(missing, []);
});
