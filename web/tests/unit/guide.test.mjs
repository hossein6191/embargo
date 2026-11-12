// The waiting copy for every state and every role: what is happening, how long, whether you must act,
// whether you can leave, where the money is, with no hole, no "undefined" and no number left unprinted.

import test from "node:test";
import assert from "node:assert/strict";

import { ROLES, STATES, deskGuide, guide, sendingGuide, signGuide } from "../../lib/guide.ts";

const GEN = 10n ** 18n;
const LINES = ["kicker", "now", "time", "need", "leave", "money"];
const clean = (g, what) => {
  for (const k of LINES) {
    assert.equal(typeof g[k], "string", `${what}: ${k}`);
    assert.ok(g[k].trim().length >= (k === "kicker" ? 4 : 9), `${what}: ${k} says something`);
    assert.doesNotMatch(g[k], /undefined|NaN|null|\[object/, `${what}: ${k}`);
  }
  assert.equal(typeof g.canLeave, "boolean");
};

test("every state has words for every role", () => {
  const base = { release: "E2", outlet: "The Harbour Post", bondAtto: (GEN / 10n).toString(), embargoUntil: 1_900_000_000, creditAtto: (GEN / 20n).toString() };
  for (const state of STATES)
    for (const role of ROLES) {
      const g = guide({ ...base, state, role, secondsLeft: state === "embargoed" ? 1500 : 0 });
      clean(g, `${state}:${role}`);
      if (!(state === "lifted" && role === "outlet")) assert.equal(g.id, `${state}:${role}`);
    }
  assert.equal(STATES.length * ROLES.length, 28);
});

test("the numbers are the contract's: 20% of the bond to the reporter, the rest to the issuer, 0.02 and 0.002 of credit", () => {
  const b = { release: "E2", outlet: "The Harbour Post", bondAtto: GEN.toString(), embargoUntil: 1_900_000_000 };
  assert.match(guide({ ...b, state: "broken", role: "reporter" }).money, /0\.2 GEN of The Harbour Post's bond was paid to your wallet/);
  assert.match(guide({ ...b, state: "broken", role: "issuer" }).money, /0\.8 GEN of The Harbour Post's bond was paid to your wallet/);
  assert.match(guide({ ...b, state: "kept", role: "reporter" }).money, /0\.02 GEN of your report credit went to/);
  assert.match(guide({ ...b, state: "unclear", role: "reporter" }).money, /0\.002 GEN of your report credit/);
  assert.match(guide({ ...b, state: "unclear", role: "reporter", repeat: true }).money, /0\.02 GEN/);
  assert.match(guide({ ...b, state: "reading", role: "reporter" }).money, /0\.02 GEN of your report credit is at stake; nothing has moved yet/);
});

test("under embargo a countdown runs; an outlet that kept it must act after the lift, one that broke it cannot", () => {
  const b = { release: "E2", bondAtto: (GEN / 10n).toString(), embargoUntil: 1_900_000_000 };
  const held = guide({ ...b, state: "embargoed", role: "outlet", secondsLeft: 1500 });
  assert.equal(held.left, 1500);
  assert.equal(held.leftLabel, "Embargo lifts in");
  assert.match(held.time, /in 25 min/);
  const kept = guide({ ...b, state: "lifted", role: "outlet", outletStatus: "bonded" });
  assert.match(kept.need, /^Yes: sign once to take your bond back/);
  const broke = guide({ ...b, state: "lifted", role: "outlet", outletStatus: "broke" });
  assert.match(broke.need, /Nothing can be done/);
  const back = guide({ ...b, state: "lifted", role: "outlet", outletStatus: "released" });
  assert.equal(back.id, "released:outlet");
  assert.match(back.money, /back in your wallet/);
});

test("a wallet prompt asks you to act and to stay; a transaction on its way lets you leave", () => {
  for (const fn of ["issue", "join", "release_bond", "deposit", "withdraw", "report"]) {
    const s = signGuide({ fn, label: "something", valueAtto: (GEN / 10n).toString() });
    clean(s, `sign:${fn}`);
    assert.equal(s.canLeave, false);
    assert.match(s.need, /^Yes/);
    const t = sendingGuide({ fn, label: "something", valueAtto: (GEN / 10n).toString() });
    clean(t, `sending:${fn}`);
    assert.equal(t.canLeave, true);
  }
  for (const w of ["open", "join"]) clean(deskGuide(w, "E3"), `desk:${w}`);
  assert.match(sendingGuide({ fn: "deposit", label: "x", mock: true }).time, /demo build/);
});
