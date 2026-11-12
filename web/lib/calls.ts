// One builder per write method of the contract: the method's name, its arguments in the contract's
// order, and the value sent. Pure, so tests/unit/interface.test.mjs checks every builder against the
// signatures in contracts/embargo.py with no browser and no network.

import type { Call } from "./types.ts";

export const calls = {
  /** issue(headline, summary, embargo_until, bond): anyone; the sender is the issuer. The bond travels as digits, the instant as a unix time. */
  issue: (headline: string, summary: string, embargoUntil: number, bondAtto: bigint): Call => ({
    fn: "issue",
    args: [headline, summary, Math.trunc(embargoUntil), bondAtto.toString()],
  }),
  /** join(release, site_prefix), payable: exactly the release's bond. Every refusal returns what was sent in the same transaction. */
  join: (release: string, sitePrefix: string, bondAtto: bigint): Call => ({ fn: "join", args: [release, sitePrefix], value: bondAtto }),
  /** release_bond(release, outlet): the outlet itself, from the instant the embargo lifts, unless it broke it. */
  releaseBond: (release: string, outlet: string): Call => ({ fn: "release_bond", args: [release, outlet.toLowerCase()] }),
  /** deposit(), payable: the value sent becomes the sender's report credit. */
  deposit: (valueAtto: bigint): Call => ({ fn: "deposit", args: [], value: valueAtto }),
  /** withdraw(): all of the sender's report credit back. */
  withdraw: (): Call => ({ fn: "withdraw", args: [] }),
  /** report(release, outlet, url): anyone with credit but that outlet, while the embargo holds; every validator fetches the page. */
  report: (release: string, outlet: string, url: string): Call => ({ fn: "report", args: [release, outlet.toLowerCase(), url] }),
};
