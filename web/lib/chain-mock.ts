// A stand-in for the contract, in memory, for NEXT_PUBLIC_MOCK=1. lib/chain.ts delegates here.
//
// It follows contracts/embargo.py on everything deterministic: who may call what and when, the order
// of the checks and their refusal sentences word for word, the transaction's own clock against the
// embargo, a payable refusal sending every atto back, the repeat rule (one reading per text per outlet
// per release), where every atto goes, the counters, and every view answered in the contract's own
// JSON shape, so the mappers in lib/chain.ts run on the same rows in both modes. The one thing it
// cannot do is fetch a page or ask a model: a report of one of the four demo pages (lib/pages.ts) is
// found as scripted there, with the fingerprint the contract computes for that page's exact bytes,
// and any other address cannot be fetched and stores nothing. The mock bar says so on every page.
//
// The visitor acts as one of two wallets. The demo desk (an issuer and two outlets) acts when its
// buttons are pressed (demoOpen and demoJoin, the in-memory twins of POST /api/demo/open and
// /api/demo/join). One earlier release is seeded, lifted, so the ledger has a history, and the clock
// can be moved on so an embargo can be seen lifting. State lasts as long as the tab.

import type { Call, DemoAnswer, DemoOutlet, DemoStatus, TxStatus } from "./types.ts";
import { notify } from "./browser-store.ts";
import { CONTRACT_RULES } from "./contract-rules.ts";
import { DEMO_BOND, DEMO_HEADLINE, DEMO_LEAD_SECONDS, DEMO_OUTLETS, DEMO_SUMMARY, demoJoinProblem, demoPageOf, demoPrefix, type OutletKey } from "./pages.ts";
import {
  ADDRESS_CHARS,
  ID_CHARS,
  MAX_BOND,
  MAX_HEADLINE,
  MAX_LEAD,
  MAX_SUMMARY,
  MAX_URL,
  MIN_BOND,
  MIN_HEADLINE,
  MIN_LEAD,
  MIN_SUMMARY,
  PAGE,
  REPORTER_SHARE,
  REPORT_BOND,
  UNCLEAR_PART,
  numberArg,
  prefixProblem,
  pyStrip,
  textProblem,
  under,
  urlProblem,
  type Finding,
} from "./rules.ts";

const GEN = 10n ** 18n;
export const MOCK_CONTRACT = "0x00000000000000000000000000000000e3ba7600";
/** The commit and repository the demo build pretends the outlets' pages are pinned to. */
export const MOCK_COMMIT = "0123456789abcdef0123456789abcdef01234567";
export const MOCK_REPO = "demo-owner/embargo";

const inBrowser = typeof window !== "undefined";
const delay = (ms: number) => (inBrowser ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

// ---- the clock -----------------------------------------------------------------------------------

let clockOffset = 0;
/** The mock's transaction clock, in seconds: the browser's clock plus however far the visitor moved it on. */
export const mockNow = (): number => Math.floor(Date.now() / 1000) + clockOffset;
export const mockClockOffset = (): number => clockOffset;
/** Moves the mock clock on, so an embargo can be seen lifting. */
export function advanceClock(seconds: number): void {
  clockOffset += Math.max(0, Math.floor(seconds));
  notify();
}

// ---- who the visitor is acting as -----------------------------------------------------------------

export type Persona = { address: string; name: string; note: string };

export const VISITOR = "0x5e1a3c9b07d24f68a1e3c5b7d9f0a2c4e6b8d0f1";
export const SECOND = "0x7c2e4a6f81b3d5a7c9e0f2a4b6d8c0e1f3a5b7d2";
export const DEMO_ISSUER = "0x1a2b3c4d5e6f708192a3b4c5d6e7f80910a1b2c3";
export const DEMO_POST = "0xa1b2c3d4e5f60718293a4b5c6d7e8f9011a2b3c4";
export const DEMO_GAZETTE = "0xa2c3d4e5f6a7b8091a2b3c4d5e6f708192a3b4c5";
export const EARLIER_READER = "0xfe1d2c3b4a59687706f5e4d3c2b1a09f8e7d6c5b";

export const PERSONAS: Persona[] = [
  { address: VISITOR, name: "You", note: "report, issue or join with this wallet" },
  { address: SECOND, name: "Your second wallet", note: "join a release you issued with the first" },
];

let persona = VISITOR;
export const mockAddress = (): string => persona;
export function setMockPersona(address: string): void {
  if (PERSONAS.some((p) => p.address === address)) persona = address;
  notify();
}

// ---- balances -------------------------------------------------------------------------------------

const balances = new Map<string, bigint>([
  [VISITOR, 20n * GEN],
  [SECOND, 10n * GEN],
  [DEMO_ISSUER, 30n * GEN],
  [DEMO_POST, 30n * GEN],
  [DEMO_GAZETTE, 30n * GEN],
  [EARLIER_READER, 5n * GEN],
]);
const balance = (a: string) => balances.get(a.toLowerCase()) ?? 0n;
const credit = (a: string, v: bigint) => {
  balances.set(a.toLowerCase(), balance(a) + v);
};
export const mockBalanceText = (address: string): string => balance(address).toString();
let contractBalance = 0n;
/** The contract's own balance: every bond still held and every atto of report credit. */
export const mockContractBalance = (): bigint => contractBalance;
/** Every atto of test GEN the mock knows of, wallets and contract: what conservation is checked against. */
export const mockTotal = (): bigint => [...balances.values()].reduce((a, b) => a + b, 0n) + contractBalance;

/** emit_transfer from the contract. */
function pay(to: string, value: bigint): void {
  if (value <= 0n) return;
  contractBalance -= value;
  credit(to, value);
}

// ---- the contract's state -----------------------------------------------------------------------

type ReleaseState = {
  issuer: string;
  headline: string;
  summary: string;
  embargo_until: number;
  issued_at: number;
  bond: bigint;
  n_outlets: number;
  held: bigint;
  n_broken: number;
  n_released: number;
  n_reports: number;
  n_kept: number;
  n_unclear: number;
  n_repeats: number;
  to_issuer: bigint;
  to_reporters: bigint;
  fees_to_outlets: bigint;
};
type OutletState = {
  release_id: string;
  outlet: string;
  site_prefix: string;
  bond: bigint;
  joined_at: number;
  status: "bonded" | "broke" | "released";
  closed_at: number;
  broke_report: string;
  n_reports: number;
  fees_won: bigint;
};
type ReportState = {
  release_id: string;
  outlet: string;
  reporter: string;
  url: string;
  finding: Finding;
  fp: string;
  repeat_of: string;
  cost: bigint;
  to_outlet: bigint;
  to_reporter: bigint;
  to_issuer: bigint;
  at: number;
};

const releaseRows = new Map<string, ReleaseState>();
const outletRows = new Map<string, OutletState>();
const reportRows = new Map<string, ReportState>();
const lists = new Map<string, string[]>();
const seen = new Map<string, string>();
const credits = new Map<string, bigint>();
const t = {
  release_count: 0,
  report_count: 0,
  n_joins: 0,
  held_total: 0n,
  bonds_in: 0n,
  released_total: 0n,
  to_issuers: 0n,
  to_reporters: 0n,
  credit_total: 0n,
  deposited_total: 0n,
  credit_out: 0n,
  fees_total: 0n,
  returned: 0n,
  n_refused: 0,
  n_broken: 0,
  n_kept: 0,
  n_unclear: 0,
  n_repeats: 0,
  n_released: 0,
};

const push = (list: string, id: string) => lists.set(list, [...(lists.get(list) ?? []), id]);
const creditOf = (who: string) => credits.get(who) ?? 0n;

/** A raised [EXPECTED] refusal: nothing changes. */
class Refused extends Error {}
/** A round that cannot settle (the page could not be fetched): nothing is stored. */
class NotSettled extends Error {}
const fail = (m: string): never => {
  throw new Refused("[EXPECTED] " + m);
};

type Msg = { sender: string; value: bigint; now: number };
type Row = Record<string, unknown>;

// ---- the write methods, in the contract's order of checks ----------------------------------------------

function issue(m: Msg, headlineRaw: unknown, summaryRaw: unknown, untilRaw: unknown, bondRaw: unknown): Row {
  if (typeof headlineRaw !== "string" || typeof summaryRaw !== "string") fail("the headline and the summary are strings");
  const headline = pyStrip(headlineRaw as string);
  const summary = pyStrip(summaryRaw as string);
  let problem = textProblem(headline, MIN_HEADLINE, MAX_HEADLINE, "the headline");
  if (problem) fail(problem);
  problem = textProblem(summary, MIN_SUMMARY, MAX_SUMMARY, "the summary");
  if (problem) fail(problem);
  const stake = numberArg(bondRaw);
  const until = numberArg(untilRaw);
  if (stake < MIN_BOND || stake > MAX_BOND) fail(`the bond is a whole number of atto from ${MIN_BOND} (0.05 GEN) to ${MAX_BOND} (20 GEN)`);
  const now = m.now;
  if (until < BigInt(now + MIN_LEAD) || until > BigInt(now + MAX_LEAD))
    fail(`the embargo lifts at a unix time from ${MIN_LEAD} to ${MAX_LEAD} seconds after now (${now}); this one is ${until}`);
  t.release_count += 1;
  const rid = "E" + t.release_count;
  releaseRows.set(rid, {
    issuer: m.sender,
    headline,
    summary,
    embargo_until: Number(until),
    issued_at: now,
    bond: stake,
    n_outlets: 0,
    held: 0n,
    n_broken: 0,
    n_released: 0,
    n_reports: 0,
    n_kept: 0,
    n_unclear: 0,
    n_repeats: 0,
    to_issuer: 0n,
    to_reporters: 0n,
    fees_to_outlets: 0n,
  });
  return { ok: true, release: rid, issuer: m.sender, headline, summary, embargo_until: Number(until), bond: stake.toString(), issued_at: now };
}

function refuse(m: Msg, reason: string, fields: Row): Row {
  t.n_refused += 1;
  t.returned += m.value;
  pay(m.sender, m.value);
  return { ok: false, ...fields, reason, returned: m.value.toString() };
}

function join(m: Msg, releaseRaw: unknown, prefixRaw: unknown): Row {
  const value = m.value;
  const who = m.sender;
  let problem = "";
  let prefix = "";
  let release = "";
  if (typeof releaseRaw !== "string" || typeof prefixRaw !== "string") {
    problem = "the release id and the site prefix are strings";
  } else {
    release = pyStrip(releaseRaw);
    prefix = pyStrip(prefixRaw);
    if (!releaseRows.has(release)) problem = "no release " + release.slice(0, ID_CHARS);
  }
  const key = release + "|" + who;
  if (!problem) {
    const r = releaseRows.get(release)!;
    const now = m.now;
    if (who === r.issuer) problem = "the issuer of " + release + " may not join its own release as an outlet";
    else if (outletRows.has(key)) problem = who + " has already joined " + release + "; one join per outlet per release";
    else if (now >= r.embargo_until) problem = "the embargo on " + release + " lifted at " + r.embargo_until + "; outlets join while it holds";
    else if (value !== r.bond) problem = "send exactly the bond of " + r.bond + " atto to join " + release + "; this one sent " + value;
    else problem = prefixProblem(prefix);
  }
  if (problem) return refuse(m, problem, { release: release.slice(0, ID_CHARS) });
  const r = releaseRows.get(release)!;
  outletRows.set(key, { release_id: release, outlet: who, site_prefix: prefix, bond: value, joined_at: m.now, status: "bonded", closed_at: 0, broke_report: "", n_reports: 0, fees_won: 0n });
  r.n_outlets += 1;
  r.held += value;
  t.held_total += value;
  t.bonds_in += value;
  t.n_joins += 1;
  push("outlets:" + release, key);
  return { ok: true, release, outlet: who, site_prefix: prefix, bond: value.toString(), joined_at: m.now, embargo_until: r.embargo_until, headline: r.headline, summary: r.summary };
}

function releaseOf(rid: string): ReleaseState {
  const r = releaseRows.get(rid);
  if (!r) fail("no release " + rid.slice(0, ID_CHARS));
  return r!;
}

function outletOf(rid: string, raw: unknown): OutletState {
  if (typeof raw !== "string") fail("the outlet's address is a string");
  const who = pyStrip(raw as string).toLowerCase();
  const o = outletRows.get(rid + "|" + who);
  if (!o) fail(who.slice(0, ADDRESS_CHARS) + " has not joined " + rid + " as an outlet");
  return o!;
}

function releaseBond(m: Msg, releaseRaw: unknown, outletRaw: unknown): Row {
  if (typeof releaseRaw !== "string") fail("the release id is a string");
  const rid = pyStrip(releaseRaw as string);
  const r = releaseOf(rid);
  const o = outletOf(rid, outletRaw);
  if (m.sender !== o.outlet) fail("only the outlet " + o.outlet + " may take back its bond on " + rid);
  if (o.status === "broke")
    fail(o.outlet + " broke the embargo on " + rid + " (report " + o.broke_report + "); its bond went to the reporter and the issuer, and there is nothing to take back");
  if (o.status !== "bonded") fail(o.outlet + " took its bond on " + rid + " back already; a bond is paid out once");
  const now = m.now;
  if (now < r.embargo_until) fail("the embargo on " + rid + " holds until " + r.embargo_until + "; the bond comes back from then, in " + (r.embargo_until - now) + " seconds");
  o.status = "released";
  o.closed_at = now;
  r.held -= o.bond;
  r.n_released += 1;
  t.held_total -= o.bond;
  t.released_total += o.bond;
  t.n_released += 1;
  pay(o.outlet, o.bond);
  return { ok: true, release: rid, outlet: o.outlet, status: "released", paid: o.bond.toString(), closed_at: now, held: r.held.toString() };
}

function deposit(m: Msg): Row {
  if (m.value <= 0n) return refuse(m, "send the credit to add with the call", {});
  credits.set(m.sender, creditOf(m.sender) + m.value);
  t.credit_total += m.value;
  t.deposited_total += m.value;
  return { ok: true, address: m.sender, added: m.value.toString(), credit: creditOf(m.sender).toString() };
}

function withdraw(m: Msg): Row {
  const amount = creditOf(m.sender);
  if (amount <= 0n) fail("this address holds no report credit");
  credits.set(m.sender, 0n);
  t.credit_total -= amount;
  t.credit_out += amount;
  pay(m.sender, amount);
  return { ok: true, address: m.sender, withdrawn: amount.toString(), credit: "0" };
}

/** What every validator would agree on for this address: the scripted demo pages, or no page at all. */
function judge(url: string): { finding: Finding; fp: string } {
  const page = demoPageOf(url);
  if (!page) throw new NotSettled("[TRANSIENT] the page could not be fetched; nothing was stored, nothing was taken, and the report may be made again");
  return { finding: page.mock, fp: page.fp };
}

function report(m: Msg, releaseRaw: unknown, outletRaw: unknown, urlRaw: unknown): Row {
  if (typeof releaseRaw !== "string" || typeof outletRaw !== "string" || typeof urlRaw !== "string")
    fail("the release id, the outlet's address and the page address are strings");
  const rid = pyStrip(releaseRaw as string);
  const url = pyStrip(urlRaw as string);
  const r = releaseOf(rid);
  const o = outletOf(rid, outletRaw);
  const who = m.sender;
  if (who === o.outlet) fail("an outlet may not report itself; anyone else with credit may report it");
  if (o.status === "broke")
    fail(o.outlet + " already broke the embargo on " + rid + " (report " + o.broke_report + "); its bond is paid out, and only an outlet whose bond is still held can be reported");
  if (o.status !== "bonded") fail(o.outlet + " took its bond on " + rid + " back; only an outlet whose bond is still held can be reported");
  const problem = urlProblem(url, MAX_URL, "the page address");
  if (problem) fail(problem);
  if (!under(url, o.site_prefix)) fail("the page is not below the site prefix " + o.site_prefix + " that " + o.outlet + " named for " + rid + "; only pages below it count");
  const now = m.now;
  if (now >= r.embargo_until) fail("the embargo on " + rid + " lifted at " + r.embargo_until + "; a story published after it breaks nothing, and reports are taken only while it holds");
  const held = creditOf(who);
  if (held < REPORT_BOND) fail("a report puts " + REPORT_BOND + " atto (0.02 GEN) of report credit at stake and this address holds " + held + "; deposit() first");
  const judged = judge(url);
  let finding = judged.finding;
  const fp = judged.fp;
  const okey = rid + "|" + o.outlet;
  const textKey = okey + "|" + fp;
  const repeatOf = seen.get(textKey) ?? "";
  let cost: bigint;
  if (repeatOf) {
    finding = reportRows.get(repeatOf)!.finding;
    cost = REPORT_BOND;
  } else if (finding === "broken") cost = 0n;
  else if (finding === "kept") cost = REPORT_BOND;
  else cost = REPORT_BOND / UNCLEAR_PART;
  const broken = finding === "broken" && !repeatOf;
  const bond = o.bond;
  const toReporter = broken ? (bond * BigInt(REPORTER_SHARE)) / 100n : 0n;
  const toIssuer = broken ? bond - toReporter : 0n;
  t.report_count += 1;
  const rep = "R" + t.report_count;
  reportRows.set(rep, { release_id: rid, outlet: o.outlet, reporter: who, url, finding, fp, repeat_of: repeatOf, cost, to_outlet: cost, to_reporter: toReporter, to_issuer: toIssuer, at: now });
  push("reports:" + rid, rep);
  r.n_reports += 1;
  o.n_reports += 1;
  if (repeatOf) {
    r.n_repeats += 1;
    t.n_repeats += 1;
  } else {
    seen.set(textKey, rep);
    if (finding === "kept") {
      r.n_kept += 1;
      t.n_kept += 1;
    } else if (finding === "unclear") {
      r.n_unclear += 1;
      t.n_unclear += 1;
    }
  }
  if (cost > 0n) {
    credits.set(who, held - cost);
    t.credit_total -= cost;
    o.fees_won += cost;
    r.fees_to_outlets += cost;
    t.fees_total += cost;
    pay(o.outlet, cost);
  }
  if (broken) {
    o.status = "broke";
    o.closed_at = now;
    o.broke_report = rep;
    r.held -= bond;
    r.n_broken += 1;
    r.to_issuer += toIssuer;
    r.to_reporters += toReporter;
    t.held_total -= bond;
    t.to_issuers += toIssuer;
    t.to_reporters += toReporter;
    t.n_broken += 1;
    pay(who, toReporter);
    pay(r.issuer, toIssuer);
  }
  return {
    ok: true,
    release: rid,
    outlet: o.outlet,
    report: rep,
    url,
    finding,
    fp,
    repeat_of: repeatOf,
    outlet_status: o.status,
    cost: cost.toString(),
    to_outlet: cost.toString(),
    to_reporter: toReporter.toString(),
    to_issuer: toIssuer.toString(),
    credit: creditOf(who).toString(),
    at: now,
  };
}

function run(fn: string, args: unknown[], m: Msg): Row {
  switch (fn) {
    case "issue":
      return issue(m, args[0], args[1], args[2], args[3]);
    case "join":
      return join(m, args[0], args[1]);
    case "release_bond":
      return releaseBond(m, args[0], args[1]);
    case "deposit":
      return deposit(m);
    case "withdraw":
      return withdraw(m);
    case "report":
      return report(m, args[0], args[1], args[2]);
    default:
      throw new Error("the in-memory contract has no method " + fn);
  }
}

// ---- views, in the contract's JSON ------------------------------------------------------------------

function releaseRow(rid: string, now: number): Row {
  const r = releaseRows.get(rid)!;
  const until = r.embargo_until;
  const phase = now < 0 ? "unknown" : now < until ? "embargoed" : "lifted";
  return {
    release: rid,
    issuer: r.issuer,
    headline: r.headline,
    summary: r.summary,
    embargo_until: until,
    issued_at: r.issued_at,
    bond: r.bond.toString(),
    held: r.held.toString(),
    record: {
      outlets: r.n_outlets,
      bonded: r.n_outlets - r.n_broken - r.n_released,
      broken: r.n_broken,
      released: r.n_released,
      reports: r.n_reports,
      kept: r.n_kept,
      unclear: r.n_unclear,
      repeats: r.n_repeats,
      to_issuer: r.to_issuer.toString(),
      to_reporters: r.to_reporters.toString(),
      fees_to_outlets: r.fees_to_outlets.toString(),
    },
    now,
    phase,
    seconds_left: now >= 0 && now < until ? until - now : 0,
  };
}

function outletRow(key: string, now: number): Row {
  const o = outletRows.get(key)!;
  const r = releaseRows.get(o.release_id)!;
  return {
    release: o.release_id,
    outlet: o.outlet,
    site_prefix: o.site_prefix,
    bond: o.bond.toString(),
    joined_at: o.joined_at,
    status: o.status,
    broke_the_embargo: o.status === "broke",
    broke_report: o.broke_report,
    closed_at: o.closed_at,
    reports: o.n_reports,
    fees_won: o.fees_won.toString(),
    embargo_until: r.embargo_until,
    can_release: o.status === "bonded" && now >= r.embargo_until,
    now,
  };
}

function reportRow(rep: string): Row {
  const p = reportRows.get(rep)!;
  return {
    report: rep,
    release: p.release_id,
    outlet: p.outlet,
    reporter: p.reporter,
    url: p.url,
    finding: p.finding,
    fp: p.fp,
    repeat_of: p.repeat_of,
    cost: p.cost.toString(),
    to_outlet: p.to_outlet.toString(),
    to_reporter: p.to_reporter.toString(),
    to_issuer: p.to_issuer.toString(),
    at: p.at,
  };
}

function pageOf(list: string, offset: unknown, limit: unknown): { total: number; start: number; size: number; ids: string[] } {
  const all = lists.get(list) ?? [];
  const start = Number(numberArg(offset) < 0n ? 0n : numberArg(offset));
  let size = Number(numberArg(limit));
  if (size < 1 || size > PAGE) size = PAGE;
  return { total: all.length, start, size, ids: all.slice(start, Math.min(all.length, start + size)) };
}

const asText = (v: unknown) => (typeof v === "string" ? v : null);

function answer(fn: string, args: unknown[]): Row {
  const now = mockNow();
  switch (fn) {
    case "release": {
      const raw = asText(args[0]);
      if (raw === null) return { error: "the release id is a string" };
      const key = pyStrip(raw).slice(0, ID_CHARS);
      if (!releaseRows.has(key)) return { error: "no release " + key, release: key };
      return releaseRow(key, now);
    }
    case "releases": {
      const total = t.release_count;
      const start = Number(numberArg(args[0]) < 0n ? 0n : numberArg(args[0]));
      let size = Number(numberArg(args[1]));
      if (size < 1 || size > PAGE) size = PAGE;
      const rows: Row[] = [];
      for (let n = start + 1; n <= Math.min(total, start + size); n++) rows.push(releaseRow("E" + n, now));
      return { total, offset: start, limit: size, rows, now };
    }
    case "outlets_of": {
      const raw = asText(args[0]);
      if (raw === null) return { error: "the release id is a string" };
      const key = pyStrip(raw).slice(0, ID_CHARS);
      const p = pageOf("outlets:" + key, args[1], args[2]);
      return { release: key, total: p.total, offset: p.start, limit: p.size, rows: p.ids.map((i) => outletRow(i, now)), now };
    }
    case "outlet": {
      const r = asText(args[0]);
      const a = asText(args[1]);
      if (r === null || a === null) return { error: "the release id and the address are strings" };
      const key = pyStrip(r).slice(0, ID_CHARS) + "|" + pyStrip(a).toLowerCase().slice(0, ADDRESS_CHARS);
      if (!outletRows.has(key)) return { error: "no such outlet on that release", release: pyStrip(r).slice(0, ID_CHARS), outlet: pyStrip(a).toLowerCase().slice(0, ADDRESS_CHARS) };
      return outletRow(key, now);
    }
    case "reports_of": {
      const raw = asText(args[0]);
      if (raw === null) return { error: "the release id is a string" };
      const key = pyStrip(raw).slice(0, ID_CHARS);
      const p = pageOf("reports:" + key, args[1], args[2]);
      return { release: key, total: p.total, offset: p.start, limit: p.size, rows: p.ids.map(reportRow) };
    }
    case "credit": {
      const raw = asText(args[0]);
      if (raw === null) return { error: "the address is a string" };
      const key = pyStrip(raw).toLowerCase().slice(0, ADDRESS_CHARS);
      const held = creditOf(key);
      return { address: key, credit: held.toString(), report_bond: REPORT_BOND.toString(), reports: Number(held / REPORT_BOND) };
    }
    case "stats":
      return {
        releases: t.release_count,
        joins: t.n_joins,
        reports: t.report_count,
        broken: t.n_broken,
        kept: t.n_kept,
        unclear: t.n_unclear,
        repeats: t.n_repeats,
        released: t.n_released,
        held: t.held_total.toString(),
        bonds_in: t.bonds_in.toString(),
        released_total: t.released_total.toString(),
        to_issuers: t.to_issuers.toString(),
        to_reporters: t.to_reporters.toString(),
        fees_to_outlets: t.fees_total.toString(),
        credit: t.credit_total.toString(),
        deposited: t.deposited_total.toString(),
        credit_out: t.credit_out.toString(),
        refused_payments: t.n_refused,
        returned: t.returned.toString(),
      };
    case "rules":
      return CONTRACT_RULES;
    default:
      throw new Error("the in-memory contract has no view " + fn);
  }
}

/** A view, answered as the contract answers: a JSON string. */
export async function view(fn: string, args: (string | number)[]): Promise<string> {
  seed();
  await delay(80);
  return JSON.stringify(answer(fn, args));
}

// ---- transactions ---------------------------------------------------------------------------------

type Pending = { polls: number; result: Row; error: string; judged: boolean; settled: boolean };
const pending = new Map<string, Pending>();
let hashes = 0;
const fakeHash = () => "0x" + (++hashes).toString(16).padStart(8, "0") + "e3ba".repeat(14);

/** Runs a call as `sender` at the mock's clock, as the contract would, and returns its transaction hash. */
function send(sender: string, fn: string, args: unknown[], value: bigint): string {
  const who = sender.toLowerCase();
  if (balance(who) < value) throw new Error("insufficient funds for this transfer");
  credit(who, -value);
  contractBalance += value;
  let result: Row = {};
  let error = "";
  let settled = true;
  try {
    result = run(fn, args, { sender: who, value, now: mockNow() });
  } catch (e) {
    if (!(e instanceof Refused) && !(e instanceof NotSettled)) throw e;
    // A raised call changes nothing; the value sent goes back with it.
    contractBalance -= value;
    credit(who, value);
    error = e.message;
    settled = !(e instanceof NotSettled);
  }
  const hash = fakeHash();
  pending.set(hash, { polls: 0, result, error, judged: fn === "report" && (!error || !settled), settled });
  notify();
  return hash;
}

export async function write(call: Call): Promise<string> {
  seed();
  await delay(250);
  return send(persona, call.fn, call.args, call.value ?? 0n);
}

const STAGES = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED"];
const NO_VOTES = { agree: 0, disagree: 0, idle: 0 };

export async function txStatus(hash: string): Promise<TxStatus> {
  await delay(60);
  const p = pending.get(hash);
  if (!p) return { status: "UNKNOWN", votes: NO_VOTES, applied: null, undetermined: false, exec: null, result: null, message: "" };
  p.polls += 1;
  // A report has every validator fetch the page and ask four questions, so it moves slower.
  const stages = p.judged ? Math.max(1, Math.floor(p.polls / 2)) : p.polls;
  const done = stages >= STAGES.length;
  if (!p.settled) {
    // The page could not be read: every validator disagrees with a leader that raised. Nothing is stored.
    const disagree = done ? 4 : Math.min(Math.max(0, stages - 2), 4);
    return {
      status: done ? "UNDETERMINED" : STAGES[Math.min(stages - 1, STAGES.length - 2)],
      votes: { agree: 0, disagree, idle: done || disagree ? 5 - disagree : 0 },
      applied: done ? false : null,
      undetermined: done,
      exec: done ? "ERROR" : null,
      result: null,
      message: done ? p.error : "",
    };
  }
  const agree = done ? 4 : p.judged ? Math.min(Math.max(0, stages - 2), 4) : 0;
  return {
    status: STAGES[Math.min(stages - 1, STAGES.length - 1)],
    votes: { agree, disagree: 0, idle: done || agree ? 5 - agree : 0 },
    applied: done ? true : null,
    undetermined: false,
    exec: done ? (p.error ? "ERROR" : "SUCCESS") : null,
    result: done && !p.error ? p.result : null,
    message: done ? p.error || JSON.stringify(p.result) : "",
  };
}

export async function balanceOf(address: string): Promise<bigint> {
  await delay(40);
  return balance(address);
}

export async function faucet(address: string): Promise<bigint> {
  await delay(400);
  credit(address, 10n * GEN);
  notify();
  return balance(address);
}

// ---- the demo desk ---------------------------------------------------------------------------------

const DESK: Record<OutletKey, string> = { "harbour-post": DEMO_POST, "bay-gazette": DEMO_GAZETTE };

export const mockOutlets = (): DemoOutlet[] =>
  DEMO_OUTLETS.map((o) => ({ key: o.key, name: o.name, address: DESK[o.key], prefix: demoPrefix(MOCK_REPO, MOCK_COMMIT, o.key) }));

/** The newest release the demo issuer issued, or "". */
function newestDemoRelease(): string {
  for (let n = t.release_count; n >= 1; n--) if (releaseRows.get("E" + n)?.issuer === DEMO_ISSUER) return "E" + n;
  return "";
}

export function demoStatus(): DemoStatus {
  seed();
  const release = newestDemoRelease();
  const r = release ? releaseRows.get(release)! : null;
  const now = mockNow();
  const joined = !!release && mockOutlets().every((o) => outletRows.has(release + "|" + o.address));
  return {
    online: true,
    reason: "",
    issuer: DEMO_ISSUER,
    outlets: mockOutlets(),
    release,
    phase: r ? (now < r.embargo_until ? "embargoed" : "lifted") : "",
    secondsLeft: r && now < r.embargo_until ? r.embargo_until - now : 0,
    embargoUntil: r ? r.embargo_until : 0,
    joined,
    pages: true,
    pagesReason: "",
  };
}

const joinHashes = (rid: string): { label: string; hash: string }[] => {
  const out: { label: string; hash: string }[] = [];
  const r = releaseRows.get(rid)!;
  for (const o of mockOutlets()) {
    if (outletRows.has(rid + "|" + o.address)) continue;
    out.push({ label: `${o.name} joins ${rid}`, hash: send(o.address, "join", [rid, o.prefix], r.bond) });
  }
  return out;
};

/** The in-memory twin of POST /api/demo/open: a fresh demo release when none is still under embargo, and both demo outlets join it. */
export async function demoOpen(): Promise<DemoAnswer> {
  seed();
  await delay(300);
  const s = demoStatus();
  if (s.release && s.phase === "embargoed") {
    const hashes = s.joined ? [] : joinHashes(s.release);
    return { ok: true, hashes, release: s.release, note: `${s.release} is still under embargo; it is the demo release` };
  }
  const until = mockNow() + DEMO_LEAD_SECONDS;
  const issued = send(DEMO_ISSUER, "issue", [DEMO_HEADLINE, DEMO_SUMMARY, until, DEMO_BOND.toString()], 0n);
  const rid = "E" + t.release_count;
  return { ok: true, hashes: [{ label: `Lantern Bay Ferries issues ${rid}`, hash: issued }, ...joinHashes(rid)], release: rid, note: "" };
}

/** The in-memory twin of POST /api/demo/join: both demo outlets join a release a visitor issued. */
export async function demoJoin(raw: string): Promise<DemoAnswer> {
  seed();
  await delay(300);
  const rid = pyStrip(String(raw ?? "")).slice(0, ID_CHARS);
  const r = releaseRows.get(rid);
  const now = mockNow();
  const problem = demoJoinProblem(
    r ? { id: rid, issuer: r.issuer, bondAtto: r.bond, secondsLeft: Math.max(0, r.embargo_until - now), phase: now < r.embargo_until ? "embargoed" : "lifted" } : null,
    mockOutlets().map((o) => o.address),
  );
  if (problem) return { ok: false, reason: problem };
  const hashes = joinHashes(rid);
  if (!hashes.length) return { ok: false, reason: `both demo outlets have already joined ${rid}` };
  return { ok: true, hashes, release: rid, note: "" };
}

// ---- the seed ------------------------------------------------------------------------------------------

let seeded = false;
function seed(): void {
  if (seeded) return;
  seeded = true;
  const now = mockNow();
  const [post, gazette] = mockOutlets();
  // E1: an earlier release, lifted a day ago. The Harbour Post kept it and took its bond back; a reader's
  // report of the weather column was kept; The Bay Gazette has not yet asked for its bond.
  const e1Issued = now - 2 * 86400;
  const e1Until = now - 86400;
  const at = (when: number, fn: string, sender: string, args: unknown[], value = 0n) => {
    const saved = clockOffset;
    clockOffset = when - Math.floor(Date.now() / 1000);
    send(sender, fn, args, value);
    clockOffset = saved;
  };
  at(e1Issued, "issue", DEMO_ISSUER, ["Lantern Bay Ferries names its new car ferry the Guillemot", "Lantern Bay Ferries has named its new car ferry the Guillemot; she joins the Gull Island route in the spring", e1Until, DEMO_BOND.toString()]);
  at(e1Issued + 300, "join", DEMO_POST, ["E1", post.prefix], DEMO_BOND);
  at(e1Issued + 420, "join", DEMO_GAZETTE, ["E1", gazette.prefix], DEMO_BOND);
  at(e1Issued + 3600, "deposit", EARLIER_READER, [], REPORT_BOND * 2n);
  at(e1Issued + 3700, "report", EARLIER_READER, ["E1", DEMO_POST, post.prefix + "weather.html"]);
  at(e1Until + 600, "release_bond", DEMO_POST, ["E1", DEMO_POST]);
  // E2: the demo release, issued two minutes ago, its embargo about twenty-eight minutes ahead.
  at(now - 120, "issue", DEMO_ISSUER, [DEMO_HEADLINE, DEMO_SUMMARY, now - 120 + DEMO_LEAD_SECONDS, DEMO_BOND.toString()]);
  at(now - 90, "join", DEMO_POST, ["E2", post.prefix], DEMO_BOND);
  at(now - 80, "join", DEMO_GAZETTE, ["E2", gazette.prefix], DEMO_BOND);
  // The seed's transactions are history, not something a page should be tracking.
  pending.clear();
}

/** Test hook: the state's totals, for conservation checks. */
export function mockHeld(): { held: bigint; credit: bigint; contract: bigint } {
  seed();
  return { held: t.held_total, credit: t.credit_total, contract: contractBalance };
}

export const MOCK_ACCOUNTS = { VISITOR, SECOND, DEMO_ISSUER, DEMO_POST, DEMO_GAZETTE, EARLIER_READER };
