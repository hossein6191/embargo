// What a visitor is told whenever they wait, in plain lines: what is happening and who it waits for,
// how long it takes or the exact time, whether anything is needed from them now, whether they can
// leave and where things will be when they come back, and where the money is right now. The same
// words for every state of a release (under embargo, a report being read, broken, kept, unclear,
// embargo lifted, bond released) and every role (the issuer, an outlet, the reporter, a reader), and
// for every wallet prompt and transaction on its way.
//
// Pure, with no React: the state, the role and the numbers in, the words out. components/notice.tsx
// renders a guide as a telex notice; tests/unit/guide.test.mjs runs every state for every role.
// Nothing here may promise what contracts/embargo.py does not do.

import { gen, span, utcClock } from "./format.ts";
import { REPORTER_SHARE, REPORT_BOND, UNCLEAR_COST } from "./rules.ts";
import type { WriteFn } from "./types.ts";

export const STATES = ["embargoed", "reading", "broken", "kept", "unclear", "lifted", "released"] as const;
export type State = (typeof STATES)[number];
export const ROLES = ["issuer", "outlet", "reporter", "reader"] as const;
export type Role = (typeof ROLES)[number];

export type Tone = "hold" | "busy" | "flash" | "noted" | "lifted" | "done";

export type Guide = {
  /** "<state>:<role>", written on the notice for tests and tools */
  id: string;
  tone: Tone;
  /** the wire slug above the notice */
  kicker: string;
  /** 1. what is happening now, and who it waits for */
  now: string;
  /** 2. how long it takes, or the exact time */
  time: string;
  /** 3. whether anything is needed from you now */
  need: string;
  /** 4. whether you can leave, and where things will be */
  leave: string;
  canLeave: boolean;
  /** 5. where the money is right now */
  money: string;
  /** seconds until the next thing happens, for a countdown */
  left?: number;
  leftLabel?: string;
};

export type GuideInput = {
  state: State;
  role: Role;
  /** "E2" */
  release: string;
  /** the outlet the state is about, e.g. "The Harbour Post" */
  outlet?: string;
  /** the outlet's bond, atto */
  bondAtto?: string;
  /** the embargo's instant, unix seconds */
  embargoUntil?: number;
  /** seconds until it lifts, on the contract's clock */
  secondsLeft?: number;
  /** the viewer's report credit, atto */
  creditAtto?: string;
  /** for a lifted release seen by an outlet: did it break the embargo, take its bond back, or neither */
  outletStatus?: "bonded" | "broke" | "released";
  /** a report that was a repeat of an earlier reading */
  repeat?: boolean;
  mock?: boolean;
};

export const NOTHING_NEEDED = "Nothing is needed from you.";
const KICKERS: Record<State, string> = {
  embargoed: "HOLD FOR RELEASE",
  reading: "WIRE CHECK IN PROGRESS",
  broken: "FLASH",
  kept: "NOTED",
  unclear: "ADVISORY",
  lifted: "EMBARGO LIFTED",
  released: "BOND RELEASED",
};
const TONES: Record<State, Tone> = { embargoed: "hold", reading: "busy", broken: "flash", kept: "noted", unclear: "noted", lifted: "lifted", released: "done" };

const READ_TIME = (mock?: boolean) =>
  mock
    ? "A few seconds in this demo build; usually 1 to 3 minutes on Studio, where every validator fetches the page itself."
    : "Usually 1 to 3 minutes: every validator fetches the page itself and asks its model four questions about it.";

const hhmm = (until?: number) => (until ? `${utcClock(until)} UTC` : "the stated hour");

function stay(role: Role, release: string): string {
  if (role === "outlet") return `You can close this page; your place on ${release} stays on the contract and on /outlet.`;
  if (role === "issuer") return `You can close this page; ${release} and its outlets stay on the contract, at /release/${release}.`;
  if (role === "reporter") return `You can close this page; every report stays on the wire of ${release}, at /release/${release}.`;
  return `You can close this page and come back to /release/${release} at any time.`;
}

/** The guide for one state of a release, for one role. */
export function guide(g: GuideInput): Guide {
  const { state, role, release } = g;
  const outlet = g.outlet || "the outlet";
  const bond = gen(g.bondAtto ?? "0");
  const reporterCut = gen(((BigInt(g.bondAtto ?? "0") * BigInt(REPORTER_SHARE)) / 100n).toString());
  const issuerCut = gen((BigInt(g.bondAtto ?? "0") - (BigInt(g.bondAtto ?? "0") * BigInt(REPORTER_SHARE)) / 100n).toString());
  const credit = g.creditAtto !== undefined ? gen(g.creditAtto) : "";
  const creditLine = credit ? ` Your report credit on the contract is ${credit}.` : "";
  const until = hhmm(g.embargoUntil);
  const base = { id: `${state}:${role}`, tone: TONES[state], kicker: KICKERS[state] };
  const left = g.secondsLeft && g.secondsLeft > 0 ? g.secondsLeft : undefined;
  const lifts = left ? `The embargo lifts at ${until}, in ${span(left)}.` : `The embargo lifts at ${until}.`;

  switch (state) {
    case "embargoed": {
      const timing = { time: lifts, left, leftLabel: "Embargo lifts in" };
      if (role === "issuer")
        return { ...base, ...timing, now: `${release} is under embargo. Its outlets hold the story, and anyone with report credit may point at a page on an outlet's site that reports it early.`, need: NOTHING_NEEDED + " You may report an outlet yourself, like anyone else.", leave: stay(role, release), canLeave: true, money: `Every outlet's ${bond} bond is held by the contract until the lift. Nothing of it is yours unless a report finds an outlet broke the embargo.` };
      if (role === "outlet")
        return { ...base, ...timing, now: `You hold ${release} under embargo. Publish nothing below your prefix that reports it before ${until}.`, need: `Nothing until ${until}; then take your bond back with one signature.`, leave: stay(role, release), canLeave: true, money: `Your ${bond} bond is held by the contract. It comes back to you at the lift, unless a page below your prefix is found reporting the story first.` };
      if (role === "reporter")
        return { ...base, ...timing, now: `${release} is under embargo. You may report any page below an outlet's prefix that you think tells the story early.`, need: `Nothing is required. A report needs ${gen(REPORT_BOND)} of report credit, deposited first.`, leave: stay(role, release), canLeave: true, money: `Nothing of yours is at stake until you report.${creditLine} Credit can be withdrawn at any time.` };
      return { ...base, ...timing, now: `${release} is under embargo: its outlets have the story and have staked a bond not to publish it before ${until}.`, need: NOTHING_NEEDED, leave: stay(role, release), canLeave: true, money: `The outlets' bonds (${bond} each) are held by the contract.` };
    }
    case "reading": {
      const base2 = { ...base, time: READ_TIME(g.mock), leave: stay(role, release), canLeave: true };
      if (role === "reporter")
        return { ...base2, now: `The validators are reading the page you reported against ${release}: each fetches it, removes the tags and asks whether it reports the release.`, need: NOTHING_NEEDED + " The page moves on by itself.", money: `${gen(REPORT_BOND)} of your report credit is at stake; nothing has moved yet. Broken costs you nothing and pays you ${reporterCut}; kept costs ${gen(REPORT_BOND)}; unclear costs ${gen(UNCLEAR_COST)}.` };
      if (role === "outlet")
        return { ...base2, now: `Somebody reported a page below your prefix on ${release}. The validators are reading it now.`, need: "Nothing; the page is read as it is served right now.", money: `Your ${bond} bond is held. Broken sends all of it out (${reporterCut} to the reporter, ${issuerCut} to the issuer); kept or unclear pays you part of the reporter's credit.` };
      if (role === "issuer")
        return { ...base2, now: `A report against ${outlet} on ${release} is being read by the validators.`, need: NOTHING_NEEDED, money: `If the page is found to break the embargo, ${issuerCut} of ${outlet}'s bond comes to your wallet in the same transaction.` };
      return { ...base2, now: `The validators are reading a page reported against ${outlet} on ${release}.`, need: NOTHING_NEEDED, money: `${outlet}'s ${bond} bond is held while they read.` };
    }
    case "broken": {
      const repeat = g.repeat;
      const done = { ...base, time: "Settled in the same transaction; nothing more happens.", leave: stay(role, release), canLeave: true };
      if (repeat && role === "reporter")
        return { ...done, now: "That text was read before; the earlier finding stands.", need: NOTHING_NEEDED, money: `${gen(REPORT_BOND)} of your report credit went to the outlet, as any repeat costs.` };
      if (role === "reporter")
        return { ...done, now: `EMBARGO BROKEN: the network found that ${outlet}'s page reports ${release} before the lift.`, need: NOTHING_NEEDED, money: `${reporterCut} of ${outlet}'s bond was paid to your wallet. Your ${gen(REPORT_BOND)} report bond stayed in your credit.${creditLine}` };
      if (role === "outlet")
        return { ...done, now: `EMBARGO BROKEN: a page below your prefix was found reporting ${release} before the lift.`, need: "Nothing can be done: there is no appeal and nothing to take back.", money: `Your whole ${bond} bond was paid out: ${reporterCut} to the reporter and ${issuerCut} to the issuer.` };
      if (role === "issuer")
        return { ...done, now: `EMBARGO BROKEN: ${outlet} published ${release} early, and the network agreed on it.`, need: NOTHING_NEEDED, money: `${issuerCut} of ${outlet}'s bond was paid to your wallet; ${reporterCut} went to the reporter.` };
      return { ...done, now: `EMBARGO BROKEN: ${outlet} was found reporting ${release} before the lift.`, need: NOTHING_NEEDED, money: `${outlet}'s ${bond} bond was paid out, ${REPORTER_SHARE}% to the reporter and the rest to the issuer.` };
    }
    case "kept":
    case "unclear": {
      const cost = g.repeat || state === "kept" ? REPORT_BOND : UNCLEAR_COST;
      const what = g.repeat
        ? "That text was read before; the earlier finding stands."
        : state === "kept"
          ? `NOTED: the page is about something else, or only mentions the issuer. ${outlet} kept the embargo on that page.`
          : "ADVISORY: the validators' four answers did not line up, so the reading is unclear and nothing was decided.";
      const timing = { time: left ? `Settled. ${lifts}` : "Settled in the same transaction.", left, leftLabel: left ? "Embargo lifts in" : undefined };
      const done = { ...base, ...timing, leave: stay(role, release), canLeave: true };
      if (role === "reporter")
        return { ...done, now: what, need: "Nothing. You may report another page while the embargo holds.", money: `${gen(cost)} of your report credit went to ${outlet}${state === "unclear" && !g.repeat ? "; the rest stayed in your credit" : ""}.${creditLine}` };
      if (role === "outlet")
        return { ...done, now: what, need: `Nothing until ${until}; then take your bond back.`, money: `${gen(cost)} of the reporter's credit was paid to your wallet. Your ${bond} bond is still held until the lift.` };
      if (role === "issuer")
        return { ...done, now: what, need: NOTHING_NEEDED, money: `Nothing moved to or from you. ${outlet}'s ${bond} bond is still held.` };
      return { ...done, now: what, need: NOTHING_NEEDED, money: `${gen(cost)} of the reporter's credit went to ${outlet}; its bond is still held.` };
    }
    case "lifted": {
      const done = { ...base, leave: stay(role, release), canLeave: true };
      if (role === "outlet") {
        if (g.outletStatus === "broke")
          return { ...done, now: `The embargo on ${release} lifted at ${until}. You were found to have broken it.`, time: "Nothing more happens.", need: "Nothing can be done: the bond was paid out.", money: `Your ${bond} bond went to the reporter and the issuer.` };
        if (g.outletStatus === "released")
          return guide({ ...g, state: "released" });
        return { ...done, now: `The embargo on ${release} lifted at ${until}. You kept it: your bond is yours to take back.`, time: "Any time from now; it never expires.", need: "Yes: sign once to take your bond back. Nobody else can do it for you.", leave: `You can close this page; the bond waits on the contract until you take it, at /outlet.`, money: `Your ${bond} bond is still on the contract, waiting for you.` };
      }
      if (role === "reporter")
        return { ...done, now: `The embargo on ${release} lifted at ${until}. Reports are no longer taken: a story published now breaks nothing.`, time: "Nothing more happens to this release's reports.", need: "Nothing. Your credit can be withdrawn at any time.", money: `Whatever was paid to you is in your wallet.${creditLine || " Any credit left stays on the contract until you withdraw it."}` };
      if (role === "issuer")
        return { ...done, now: `The embargo on ${release} lifted at ${until}. The story is yours to publish, and everyone's.`, time: "Each outlet that kept the embargo takes its bond back when it asks.", need: NOTHING_NEEDED, money: "Any share of a broken outlet's bond is already in your wallet. The other bonds go back to their outlets, not to you." };
      return { ...done, now: `The embargo on ${release} lifted at ${until}.`, time: "Nothing more is decided on this release.", need: NOTHING_NEEDED, money: "The bonds of outlets that kept the embargo wait on the contract until each outlet takes its own back." };
    }
    case "released": {
      const done = { ...base, time: "Nothing more happens.", need: "Nothing is left to do here.", leave: stay(role, release), canLeave: true };
      if (role === "outlet") return { ...done, now: `You kept the embargo on ${release} and took your bond back.`, money: `Your ${bond} bond is back in your wallet.` };
      if (role === "issuer") return { ...done, now: `${outlet} kept the embargo on ${release} and took its bond back.`, money: "Nothing moved to or from you." };
      if (role === "reporter") return { ...done, now: `${outlet} kept the embargo on ${release} and took its bond back.`, money: `Nothing of yours moved.${creditLine}` };
      return { ...done, now: `${outlet} kept the embargo on ${release} and took its bond back.`, money: `${outlet}'s ${bond} bond is back in its wallet.` };
    }
  }
}

// ---- the wallet prompt and a transaction on its way ------------------------------------------------

export type SignInput = { fn: WriteFn; label: string; valueAtto?: string; mock?: boolean };

const moneyNow: Record<WriteFn, (v: string) => string> = {
  issue: () => "Issuing costs nothing; no GEN leaves your wallet.",
  join: (v) => `${v} is still in your wallet. Once it lands it is held by the contract until the lift; a refused join sends all of it back in the same transaction.`,
  release_bond: () => "Your bond is on the contract; this sends all of it back to your wallet.",
  deposit: (v) => `${v} is still in your wallet. Once it lands it is your report credit on the contract, and you can withdraw it at any time.`,
  withdraw: () => "Your credit is on the contract; this sends all of it to your wallet.",
  report: () => `Your report credit is on the contract. ${gen(REPORT_BOND)} of it is put at stake when the report is read.`,
};

/** While the wallet asks for a signature: nothing has been sent. */
export function signGuide(s: SignInput): Guide {
  return {
    id: `sign:${s.fn}`,
    tone: "busy",
    kicker: "AWAITING YOUR KEY",
    now: `Your wallet is asking you to sign: ${s.label}.`,
    time: "As long as you take; nothing is sent until you confirm in the wallet.",
    need: "Yes: confirm or cancel in your wallet's window.",
    leave: "Stay on this page until the wallet has answered.",
    canLeave: false,
    money: moneyNow[s.fn](gen(s.valueAtto ?? "0")),
  };
}

/** While a transaction other than a report goes through. A report uses guide({ state: "reading" }). */
export function sendingGuide(s: SignInput): Guide {
  return {
    id: `sending:${s.fn}`,
    tone: "busy",
    kicker: "ON THE WIRE",
    now: `Sent: ${s.label}. The validators are checking the call.`,
    time: s.mock ? "A few seconds in this demo build; about 30 seconds on Studio." : "About 30 seconds.",
    need: NOTHING_NEEDED + " The page moves on by itself.",
    leave: "You can close this page; the transaction goes through without it, and its explorer link is below.",
    canLeave: true,
    money: s.fn === "join" || s.fn === "deposit" ? `${gen(s.valueAtto ?? "0")} has left your wallet; it is held by the contract, or comes back in the same transaction if refused.` : moneyNow[s.fn](gen(s.valueAtto ?? "0")),
  };
}

/** While the demo desk's accounts send their transactions. */
export function deskGuide(what: "open" | "join", release: string, mock?: boolean): Guide {
  return {
    id: `desk:${what}`,
    tone: "busy",
    kicker: "DEMO DESK AT WORK",
    now: what === "open" ? "The demo issuer is issuing a fresh release, and both demo outlets are joining it." : `Both demo outlets are joining ${release || "your release"} with their prefixes.`,
    time: mock ? "A few seconds in this demo build; about a minute on Studio." : "About a minute: each transaction is checked by the validators.",
    need: NOTHING_NEEDED,
    leave: "You can close this page; the demo accounts finish without it.",
    canLeave: true,
    money: "The demo accounts pay their own bonds from throwaway test GEN; nothing leaves your wallet.",
  };
}

/** The one-line form of a state, for a row in a list. */
export const oneLine = (g: Guide): string => `${g.now} ${g.need === NOTHING_NEEDED ? "" : g.need}`.trim();
