// The in-memory contract walked through every outcome, as a visitor would on the site: deposit, a kept
// page, an unclear page, a repeat, a broken page, every refusal before anything is fetched, a page that
// cannot be read, the lift, a bond taken back, the demo desk opening a release and joining a visitor's.
// After every step every atto is accounted for: the wallets and the contract together hold what they
// held before, and the contract holds exactly the bonds still bonded and the report credit.

import test from "node:test";
import assert from "node:assert/strict";

import * as mock from "../../lib/chain-mock.ts";
import { calls } from "../../lib/calls.ts";
import { demoPrefix } from "../../lib/pages.ts";

const GEN = 10n ** 18n;
const { VISITOR, SECOND, DEMO_ISSUER, DEMO_POST, DEMO_GAZETTE } = mock.MOCK_ACCOUNTS;
const POST_SITE = demoPrefix(mock.MOCK_REPO, mock.MOCK_COMMIT, "harbour-post");
const GAZETTE_SITE = demoPrefix(mock.MOCK_REPO, mock.MOCK_COMMIT, "bay-gazette");

const view = async (fn, ...args) => JSON.parse(await mock.view(fn, args));
async function final(hash) {
  for (let i = 0; i < 40; i++) {
    const s = await mock.txStatus(hash);
    if (s.status === "FINALIZED" || s.status === "UNDETERMINED") return s;
  }
  throw new Error("never final");
}
const send = async (call) => final(await mock.write(call));
const bal = (a) => BigInt(mock.mockBalanceText(a));
let total = 0n;
function conserved(step) {
  const h = mock.mockHeld();
  assert.equal(h.contract, h.held + h.credit, `${step}: the contract holds the bonds and the credit, nothing else`);
  assert.equal(mock.mockTotal(), total, `${step}: no atto made or lost`);
}

test("the demo release is on the wire, joined by both demo outlets", async () => {
  const s = mock.demoStatus();
  total = mock.mockTotal();
  assert.equal(s.online, true);
  assert.equal(s.release, "E2");
  assert.equal(s.phase, "embargoed");
  assert.equal(s.joined, true);
  assert.ok(s.secondsLeft > 1500 && s.secondsLeft <= 1800);
  const r = await view("release", "E2");
  assert.equal(r.issuer, DEMO_ISSUER);
  assert.equal(r.bond, (GEN / 10n).toString());
  assert.equal(r.held, (GEN / 5n).toString());
  const o = await view("outlets_of", "E2", 0, 20);
  assert.deepEqual(o.rows.map((x) => [x.outlet, x.site_prefix, x.status]), [
    [DEMO_POST, POST_SITE, "bonded"],
    [DEMO_GAZETTE, GAZETTE_SITE, "bonded"],
  ]);
  const e1 = await view("release", "E1");
  assert.equal(e1.phase, "lifted");
  assert.equal(e1.record.released, 1);
  assert.equal(e1.record.kept, 1);
  conserved("seed");
});

test("refusals before any credit: no credit, the outlet itself, outside the prefix", async () => {
  let s = await send(calls.report("E2", DEMO_POST, POST_SITE + "weather.html"));
  assert.equal(s.exec, "ERROR");
  assert.match(s.message, /^\[EXPECTED\] a report puts 20000000000000000 atto \(0\.02 GEN\) of report credit at stake and this address holds 0; deposit\(\) first$/);
  s = await send(calls.report("E2", DEMO_POST, "https://raw.githubusercontent.com/demo-owner/embargo/README.md"));
  assert.match(s.message, /is not below the site prefix/);
  s = await send(calls.deposit(0n));
  assert.deepEqual([s.result.ok, s.result.reason, s.result.returned], [false, "send the credit to add with the call", "0"]);
  conserved("refusals");
});

test("deposit, then a kept page: the report bond goes to the outlet", async () => {
  let s = await send(calls.deposit(GEN / 10n));
  assert.equal(s.result.credit, (GEN / 10n).toString());
  conserved("deposit");
  const postBefore = bal(DEMO_POST);
  s = await send(calls.report("E2", DEMO_POST, POST_SITE + "weather.html"));
  assert.equal(s.votes.agree, 4);
  assert.deepEqual([s.result.finding, s.result.fp, s.result.cost, s.result.repeat_of, s.result.outlet_status], ["kept", "a5acfb6dc333d535", (GEN / 50n).toString(), "", "bonded"]);
  assert.equal(bal(DEMO_POST) - postBefore, GEN / 50n);
  assert.equal(s.result.credit, ((GEN / 10n) - GEN / 50n).toString());
  conserved("kept");
});

test("an unclear page costs a tenth of the report bond; the same text again is a repeat at full cost", async () => {
  let s = await send(calls.report("E2", DEMO_POST, POST_SITE + "ferries-feature.html"));
  assert.deepEqual([s.result.finding, s.result.cost], ["unclear", (GEN / 500n).toString()]);
  conserved("unclear");
  s = await send(calls.report("E2", DEMO_POST, POST_SITE + "weather.html"));
  assert.deepEqual([s.result.finding, s.result.repeat_of, s.result.cost], ["kept", "R2", (GEN / 50n).toString()]);
  const r = await view("release", "E2");
  assert.deepEqual([r.record.kept, r.record.unclear, r.record.repeats, r.record.reports], [1, 1, 1, 3]);
  conserved("repeat");
});

test("a page that cannot be fetched stores nothing and takes nothing", async () => {
  const before = await view("credit", VISITOR);
  const s = await send(calls.report("E2", DEMO_POST, POST_SITE + "no-such-page.html"));
  assert.equal(s.undetermined, true);
  assert.match(s.message, /^\[TRANSIENT\] the page could not be fetched; nothing was stored/);
  assert.deepEqual(await view("credit", VISITOR), before);
  assert.equal((await view("release", "E2")).record.reports, 3);
  conserved("transient");
});

test("a broken page: the whole bond, 20% to the reporter and the rest to the issuer", async () => {
  const me = bal(VISITOR);
  const issuer = bal(DEMO_ISSUER);
  const credit = (await view("credit", VISITOR)).credit;
  const s = await send(calls.report("E2", DEMO_POST, POST_SITE + "early-story.html"));
  assert.deepEqual([s.result.finding, s.result.fp, s.result.cost, s.result.to_reporter, s.result.to_issuer, s.result.outlet_status], ["broken", "146ac57005c7950d", "0", (GEN / 50n).toString(), ((GEN * 8n) / 100n).toString(), "broke"]);
  assert.equal(bal(VISITOR) - me, GEN / 50n);
  assert.equal(bal(DEMO_ISSUER) - issuer, (GEN * 8n) / 100n);
  assert.equal((await view("credit", VISITOR)).credit, credit, "the reporter's credit untouched");
  const o = await view("outlet", "E2", DEMO_POST);
  assert.deepEqual([o.status, o.broke_the_embargo, o.broke_report], ["broke", true, "R5"]);
  const again = await send(calls.report("E2", DEMO_POST, POST_SITE + "weather.html"));
  assert.match(again.message, /already broke the embargo on E2 \(report R5\); its bond is paid out/);
  conserved("broken");
});

test("joins: the issuer refused, a wrong bond refused, both sent straight back", async () => {
  mock.setMockPersona(VISITOR);
  const issued = await send(calls.issue("Gull Point lighthouse opens as a museum", "The Gull Point lighthouse will open to visitors as a museum from 3 May", mock.mockNow() + 1500, GEN / 10n));
  assert.equal(issued.result.release, "E3");
  const me = bal(VISITOR);
  let s = await send(calls.join("E3", "https://lanternlight.example/news/", GEN / 10n));
  assert.deepEqual([s.result.ok, s.result.reason, s.result.returned], [false, "the issuer of E3 may not join its own release as an outlet", (GEN / 10n).toString()]);
  assert.equal(bal(VISITOR), me);
  mock.setMockPersona(SECOND);
  s = await send(calls.join("E3", "https://lanternlight.example/news/", GEN / 20n));
  assert.match(s.result.reason, /^send exactly the bond of 100000000000000000 atto to join E3; this one sent 50000000000000000$/);
  s = await send(calls.join("E3", "https://lanternlight.example/news", GEN / 10n));
  assert.match(s.result.reason, /^the site prefix ends with \//);
  s = await send(calls.join("E3", "https://lanternlight.example/news/", GEN / 10n));
  assert.equal(s.result.ok, true);
  s = await send(calls.join("E3", "https://lanternlight.example/news/", GEN / 10n));
  assert.match(s.result.reason, /has already joined E3; one join per outlet per release/);
  s = await send(calls.releaseBond("E3", SECOND));
  assert.match(s.message, /the embargo on E3 holds until \d+; the bond comes back from then, in \d+ seconds/);
  mock.setMockPersona(VISITOR);
  conserved("joins");
});

test("the demo desk joins a visitor's release, once", async () => {
  const a = await mock.demoJoin("E3");
  assert.equal(a.ok, true);
  assert.equal(a.hashes.length, 2);
  for (const h of a.hashes) assert.equal((await final(h.hash)).result.ok, true);
  const b = await mock.demoJoin("E3");
  assert.deepEqual(b, { ok: false, reason: "both demo outlets have already joined E3" });
  assert.equal((await view("release", "E3")).record.outlets, 3);
  conserved("desk join");
});

test("the lift: reports refused, bonds taken back once, a broken outlet has nothing to take", async () => {
  mock.advanceClock(1800);
  let s = await send(calls.report("E2", DEMO_GAZETTE, GAZETTE_SITE + "story-after.html"));
  assert.match(s.message, /the embargo on E2 lifted at \d+; a story published after it breaks nothing/);
  mock.setMockPersona(SECOND);
  const before = bal(SECOND);
  s = await send(calls.releaseBond("E3", SECOND));
  assert.deepEqual([s.result.status, s.result.paid], ["released", (GEN / 10n).toString()]);
  assert.equal(bal(SECOND) - before, GEN / 10n);
  s = await send(calls.releaseBond("E3", SECOND));
  assert.match(s.message, /took its bond on E3 back already; a bond is paid out once/);
  s = await send(calls.releaseBond("E2", DEMO_GAZETTE));
  assert.match(s.message, /only the outlet 0x[0-9a-f]{40} may take back its bond on E2/);
  mock.setMockPersona(VISITOR);
  s = await send(calls.join("E2", "https://lanternlight.example/news/", GEN / 10n));
  assert.match(s.result.reason, /the embargo on E2 lifted at \d+; outlets join while it holds/);
  const o = await view("outlet", "E3", SECOND);
  assert.deepEqual([o.status, o.can_release], ["released", false]);
  assert.equal((await view("outlet", "E2", DEMO_GAZETTE)).can_release, true);
  conserved("lift");
});

test("a fresh demo release once none is under embargo; withdraw takes all the credit back", async () => {
  const a = await mock.demoOpen();
  assert.equal(a.ok, true);
  assert.equal(a.release, "E4");
  assert.equal(a.hashes.length, 3);
  for (const h of a.hashes) assert.equal((await final(h.hash)).result.ok, true);
  const s1 = mock.demoStatus();
  assert.deepEqual([s1.release, s1.phase, s1.joined], ["E4", "embargoed", true]);
  const again = await mock.demoOpen();
  assert.deepEqual([again.ok, again.release, again.hashes.length], [true, "E4", 0]);
  const me = bal(VISITOR);
  const credit = BigInt((await view("credit", VISITOR)).credit);
  const s = await send(calls.withdraw());
  assert.equal(s.result.withdrawn, credit.toString());
  assert.equal(bal(VISITOR) - me, credit);
  const none = await send(calls.withdraw());
  assert.match(none.message, /this address holds no report credit/);
  const st = await view("stats");
  assert.deepEqual([st.broken, st.kept, st.unclear, st.repeats, st.released], [1, 2, 1, 1, 2]);
  assert.equal(st.credit, mock.mockHeld().credit.toString());
  conserved("withdraw");
});
