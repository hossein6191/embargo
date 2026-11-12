// The shapes the pages use, in one place with no runtime code: lib/chain.ts maps every view answer
// into these, and lib/chain-mock.ts answers in the contract's own JSON so the same mappers run in both
// modes. Every instant is unix seconds on the contract's clock; 0 until it happens. Every amount is a
// decimal string of atto.

import type { Finding, OutletStatus, Phase } from "./rules.ts";

export type ReleaseRecord = {
  outlets: number;
  bonded: number;
  broken: number;
  released: number;
  reports: number;
  kept: number;
  unclear: number;
  repeats: number;
  toIssuerAtto: string;
  toReportersAtto: string;
  feesToOutletsAtto: string;
};

/** release(id): the text, the embargo, the bond, the record, and where it stands on the view's clock. */
export type Release = {
  /** "E2" */
  id: string;
  issuer: string;
  headline: string;
  summary: string;
  embargoUntil: number;
  issuedAt: number;
  bondAtto: string;
  heldAtto: string;
  record: ReleaseRecord;
  /** the view's own clock; 0 when it had none */
  now: number;
  phase: Phase;
  secondsLeft: number;
};

/** outlet(release, address): one outlet's place on one release. */
export type OutletRow = {
  release: string;
  outlet: string;
  sitePrefix: string;
  bondAtto: string;
  joinedAt: number;
  status: OutletStatus;
  brokeTheEmbargo: boolean;
  brokeReport: string;
  closedAt: number;
  reports: number;
  feesWonAtto: string;
  embargoUntil: number;
  canRelease: boolean;
  now: number;
};

/** One report: which page, what the network found, where the money went. */
export type ReportRow = {
  /** "R3" */
  id: string;
  release: string;
  outlet: string;
  reporter: string;
  url: string;
  finding: Finding;
  fp: string;
  repeatOf: string;
  costAtto: string;
  toOutletAtto: string;
  toReporterAtto: string;
  toIssuerAtto: string;
  at: number;
};

export type Credit = { address: string; creditAtto: string; reportBondAtto: string; reports: number };

export type Paged<T> = { total: number; offset: number; limit: number; rows: T[] };

/** stats(): totals only. Amounts in atto. */
export type Stats = {
  releases: number;
  joins: number;
  reports: number;
  broken: number;
  kept: number;
  unclear: number;
  repeats: number;
  released: number;
  heldAtto: string;
  bondsInAtto: string;
  releasedTotalAtto: string;
  toIssuersAtto: string;
  toReportersAtto: string;
  feesToOutletsAtto: string;
  creditAtto: string;
  depositedAtto: string;
  creditOutAtto: string;
  refusedPayments: number;
  returnedAtto: string;
};

/** rules(): the contract's own words, kept as it wrote them. */
export type Rules = Record<string, unknown>;

export type Votes = { agree: number; disagree: number; idle: number };

export type TxStatus = {
  /** PENDING | PROPOSING | COMMITTING | REVEALING | ACCEPTED | FINALIZED | CANCELED | UNDETERMINED | UNKNOWN */
  status: string;
  votes: Votes;
  /** null until votes exist */
  applied: boolean | null;
  /** finished with no majority: nothing was stored */
  undetermined: boolean;
  /** SUCCESS | ERROR | null */
  exec: string | null;
  /** the contract's JSON return, if any */
  result: Record<string, unknown> | null;
  /** the decoded return or error text */
  message: string;
};

export type ReadResult<T> = { data: T; source: "chain" | "mock" };

/** The contract's write methods, by name. */
export type WriteFn = "issue" | "join" | "release_bond" | "deposit" | "withdraw" | "report";

export type Arg = string | number;

/** One contract call, ready to sign: the method, its arguments in the contract's order, and the value sent. */
export type Call = { fn: WriteFn; args: Arg[]; value?: bigint };

/** One of the two demo outlets, as the demo desk names it. */
export type DemoOutlet = { key: "harbour-post" | "bay-gazette"; name: string; address: string; prefix: string };

/**
 * GET /api/demo/status: whether the demo desk can act now, its three public addresses, the newest demo
 * release, and exactly why not when it cannot. The key itself is never in it.
 */
export type DemoStatus = {
  online: boolean;
  reason: string;
  issuer: string;
  outlets: DemoOutlet[];
  /** the newest release the demo issuer issued, or "" */
  release: string;
  /** "embargoed" | "lifted" | "" */
  phase: string;
  secondsLeft: number;
  /** the instant its embargo lifts, unix seconds; 0 when there is none */
  embargoUntil: number;
  /** true when both demo outlets joined `release` */
  joined: boolean;
  /** the demo outlets' prefixes can be built: the commit and the repository are known */
  pages: boolean;
  pagesReason: string;
};

/** What the demo desk answered when asked to act: transaction hashes, or why not. */
export type DemoAnswer =
  | { ok: true; hashes: { label: string; hash: string }[]; release: string; note: string }
  | { ok: false; reason: string; retryAfter?: number };
