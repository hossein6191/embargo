// Chain access for Embargo: the ONE file that knows the contract's interface.
//
// Every method name, argument order, view shape and outcome word of contracts/embargo.py that the site
// depends on is written here (and in lib/calls.ts) and nowhere else. Pages import typed reads, call
// builders and mapped outcomes from this module; lib/chain-mock.ts stands in for the contract in mock
// mode and answers in the contract's own JSON, so the mappers below run in both modes.
//
// Reads go through readContract (gen_call) with the retry policy in lib/rpc.ts: eight tries over about
// forty seconds, because Studio answers "Contract not found" for a healthy contract for about a minute
// after a deploy. A failed read is never "no data" and never proof that a write failed. Studio allows
// 30 gen_call a minute from one browser (the faucet shares them), so every view answer is cached for
// 30 s, two components asking for the same view share one request, and invalidateReads() drops the
// cache once a transaction is final.

import * as mock from "./chain-mock";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getAddress, type Address } from "viem";
import { notify } from "./browser-store";
import { contractAddress } from "./config";
import { RATE_LIMITED, createReadCache, decodeTx, isMissingMethodError, noteFailure, rpc, sleep, waitForCooldown, withRetry, type RawTx } from "./rpc";
import { FINDINGS, OUTLET_STATUSES, PAGE, idNumber, sentence, type Finding, type OutletStatus, type Phase } from "./rules";
import type { Arg, Call, Credit, DemoAnswer, DemoOutlet, DemoStatus, OutletRow, Paged, ReadResult, Release, ReportRow, Rules, Stats, TxStatus, WriteFn } from "./types";
import { chainName, getChainId, getSigner } from "./wallet";

export { RATE_LIMITED, cooldownRemainingMs } from "./rpc";
export { contractAddress };
export { calls } from "./calls";

export const CHAIN_ID = 61999;
export const RPC_URL = "https://studio.genlayer.com/api";
export const EXPLORER_URL = "https://explorer-studio.genlayer.com";

export const isMock = process.env.NEXT_PUBLIC_MOCK === "1";

export const NETWORK_ERROR = "could not reach the network";
export const NO_CONTRACT = "the contract is not deployed yet";
export const FAUCET_REFUSED = "Studio refused the faucet request (it allows 30 requests a minute from one browser). Try again in a minute.";

export const hasContract = (): boolean => isMock || !!contractAddress();
export const contractInUse = (): string => (isMock ? mock.MOCK_CONTRACT : contractAddress());

// The SDK's studionet object carries another explorer URL; the RPC and explorer hosts are set here.
export const studio = {
  ...studionet,
  rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "GenLayer Studio Explorer", url: EXPLORER_URL } },
};

const reader = () => createClient({ chain: studio });

type Row = Record<string, unknown>;

const num = (v: unknown, dflt = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : dflt;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v);
  return dflt;
};
const str = (v: unknown, dflt = ""): string => (v === undefined || v === null ? dflt : String(v));
const atto = (v: unknown): string => {
  if (typeof v === "bigint") return v >= 0n ? v.toString() : "0";
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? BigInt(Math.trunc(v)).toString() : "0";
  const s = str(v, "0").trim();
  return /^\d+$/.test(s) ? s : "0";
};
const addr = (v: unknown): string => str(v).toLowerCase();
const secs = (v: unknown): number => Math.max(0, num(v));
const asRow = (v: unknown): Row => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {});
const rowsOf = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((r): r is Row => !!r && typeof r === "object" && !Array.isArray(r)) : []);
const fp = (v: unknown): string => (/^[0-9a-f]{16}$/.test(str(v)) ? str(v) : "");
const finding = (v: unknown): Finding => (FINDINGS.includes(str(v) as Finding) ? (str(v) as Finding) : "unclear");
const outletStatus = (v: unknown): OutletStatus => (OUTLET_STATUSES.includes(str(v) as OutletStatus) ? (str(v) as OutletStatus) : "bonded");
const phase = (v: unknown): Phase => (str(v) === "embargoed" ? "embargoed" : str(v) === "lifted" ? "lifted" : "unknown");

function parseView(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

export const READ_TTL_MS = 30_000;
const onServer = typeof window === "undefined";
const views = createReadCache<unknown>(onServer ? 0 : READ_TTL_MS);

let moved = 0;
/** How many times the chain has moved under this page: a stable snapshot. */
export const chainVersion = (): number => moved;

/** Forget every cached view answer and tell the lists on screen to read again. */
export const invalidateReads = () => {
  views.clear();
  moved++;
  notify();
};

async function view(fn: string, args: Arg[] = [], opts: { fresh?: boolean } = {}): Promise<unknown> {
  if (isMock) return parseView(await mock.view(fn, args));
  const address = contractAddress();
  if (!address) throw new Error(NO_CONTRACT);
  const key = `${address.toLowerCase()}|${fn}|${JSON.stringify(args)}`;
  if (opts.fresh) views.forget(key);
  try {
    const raw = await views.get(key, () =>
      withRetry(() => reader().readContract({ address: address as Address, functionName: fn, args }), { bucket: "gen", giveUp: isMissingMethodError }),
    );
    return parseView(raw);
  } catch (e) {
    if (e instanceof Error && e.message === RATE_LIMITED) throw e;
    throw new Error(NETWORK_ERROR);
  }
}

const SOURCE: ReadResult<unknown>["source"] = isMock ? "mock" : "chain";
const result = <T>(data: T): ReadResult<T> => ({ data, source: SOURCE });

// ---- row mappers (every missing field gets a default) -----------------------------------------------

export function mapRelease(r: Row, id = ""): Release {
  const rec = asRow(r.record);
  return {
    id: str(r.release ?? id),
    issuer: addr(r.issuer),
    headline: str(r.headline),
    summary: str(r.summary),
    embargoUntil: secs(r.embargo_until),
    issuedAt: secs(r.issued_at),
    bondAtto: atto(r.bond),
    heldAtto: atto(r.held),
    record: {
      outlets: num(rec.outlets),
      bonded: num(rec.bonded),
      broken: num(rec.broken),
      released: num(rec.released),
      reports: num(rec.reports),
      kept: num(rec.kept),
      unclear: num(rec.unclear),
      repeats: num(rec.repeats),
      toIssuerAtto: atto(rec.to_issuer),
      toReportersAtto: atto(rec.to_reporters),
      feesToOutletsAtto: atto(rec.fees_to_outlets),
    },
    now: secs(r.now),
    phase: phase(r.phase),
    secondsLeft: secs(r.seconds_left),
  };
}

export function mapOutlet(r: Row): OutletRow {
  return {
    release: str(r.release),
    outlet: addr(r.outlet),
    sitePrefix: str(r.site_prefix),
    bondAtto: atto(r.bond),
    joinedAt: secs(r.joined_at),
    status: outletStatus(r.status),
    brokeTheEmbargo: r.broke_the_embargo === true,
    brokeReport: str(r.broke_report),
    closedAt: secs(r.closed_at),
    reports: num(r.reports),
    feesWonAtto: atto(r.fees_won),
    embargoUntil: secs(r.embargo_until),
    canRelease: r.can_release === true,
    now: secs(r.now),
  };
}

export function mapReport(r: Row): ReportRow {
  return {
    id: str(r.report),
    release: str(r.release),
    outlet: addr(r.outlet),
    reporter: addr(r.reporter),
    url: str(r.url),
    finding: finding(r.finding),
    fp: fp(r.fp),
    repeatOf: str(r.repeat_of),
    costAtto: atto(r.cost),
    toOutletAtto: atto(r.to_outlet),
    toReporterAtto: atto(r.to_reporter),
    toIssuerAtto: atto(r.to_issuer),
    at: secs(r.at),
  };
}

export function mapStats(r: Row): Stats {
  return {
    releases: num(r.releases),
    joins: num(r.joins),
    reports: num(r.reports),
    broken: num(r.broken),
    kept: num(r.kept),
    unclear: num(r.unclear),
    repeats: num(r.repeats),
    released: num(r.released),
    heldAtto: atto(r.held),
    bondsInAtto: atto(r.bonds_in),
    releasedTotalAtto: atto(r.released_total),
    toIssuersAtto: atto(r.to_issuers),
    toReportersAtto: atto(r.to_reporters),
    feesToOutletsAtto: atto(r.fees_to_outlets),
    creditAtto: atto(r.credit),
    depositedAtto: atto(r.deposited),
    creditOutAtto: atto(r.credit_out),
    refusedPayments: num(r.refused_payments),
    returnedAtto: atto(r.returned),
  };
}

const paged = <T>(value: Row, map: (r: Row) => T): Paged<T> => {
  if (!Array.isArray(value.rows)) throw new Error(NETWORK_ERROR);
  return { total: num(value.total), offset: num(value.offset), limit: num(value.limit, PAGE), rows: rowsOf(value.rows).map(map) };
};

// ---- reads: one function per view ---------------------------------------------------------------------

type Fresh = { fresh?: boolean };

/** release(id): null when the contract holds no such release. */
export async function readRelease(id: string, opts: Fresh = {}): Promise<ReadResult<Release | null>> {
  const value = asRow(await view("release", [id], opts));
  if ("error" in value || !value.issuer) return result(null);
  return result(mapRelease(value, id));
}

/** releases(offset, limit): one page of every release, oldest first. */
export async function readReleases(offset = 0, opts: Fresh = {}): Promise<ReadResult<Paged<Release>>> {
  return result(paged(asRow(await view("releases", [Math.max(0, Math.trunc(offset)), PAGE], opts)), (r) => mapRelease(r)));
}

/** The newest releases first: the first page says how many there are, then the newest pages, at most `maxPages`. */
export async function readReleasesWindow(maxPages = 3, opts: Fresh = {}): Promise<ReadResult<{ total: number; rows: Release[]; partial: boolean }>> {
  const first = (await readReleases(0, opts)).data;
  const pages = Math.ceil(first.total / PAGE);
  const rows = [...first.rows];
  for (let p = pages - 1, k = 1; p >= 1 && k < maxPages; p--, k++) rows.push(...(await readReleases(p * PAGE, opts)).data.rows);
  const unique = new Map(rows.map((r) => [r.id, r]));
  return result({ total: first.total, rows: [...unique.values()].sort((a, b) => idNumber(b.id) - idNumber(a.id)), partial: pages > maxPages });
}

/** outlets_of(release, 0, 20): the outlets in the order they joined. */
export async function readOutlets(release: string, opts: Fresh = {}): Promise<ReadResult<Paged<OutletRow>>> {
  const value = asRow(await view("outlets_of", [release, 0, PAGE], opts));
  if ("error" in value) return result({ total: 0, offset: 0, limit: PAGE, rows: [] });
  return result(paged(value, mapOutlet));
}

/** outlet(release, address): null when that address has not joined. */
export async function readOutlet(release: string, address: string, opts: Fresh = {}): Promise<ReadResult<OutletRow | null>> {
  const value = asRow(await view("outlet", [release, address.toLowerCase()], opts));
  if ("error" in value || !value.outlet) return result(null);
  return result(mapOutlet(value));
}

/** reports_of(release, offset, limit), newest first: the first page, then the newest pages, at most `maxPages`. */
export async function readReports(release: string, maxPages = 3, opts: Fresh = {}): Promise<ReadResult<{ total: number; rows: ReportRow[] }>> {
  const read = async (offset: number) => {
    const value = asRow(await view("reports_of", [release, offset, PAGE], opts));
    if ("error" in value) return { total: 0, offset: 0, limit: PAGE, rows: [] } as Paged<ReportRow>;
    return paged(value, mapReport);
  };
  const first = await read(0);
  const pages = Math.ceil(first.total / PAGE);
  const rows = [...first.rows];
  for (let p = pages - 1, k = 1; p >= 1 && k < maxPages; p--, k++) rows.push(...(await read(p * PAGE)).rows);
  const unique = new Map(rows.map((r) => [r.id, r]));
  return result({ total: first.total, rows: [...unique.values()].sort((a, b) => idNumber(b.id) - idNumber(a.id)) });
}

/** credit(address): the report credit and how many reports it covers. */
export async function readCredit(address: string, opts: Fresh = {}): Promise<ReadResult<Credit>> {
  const r = asRow(await view("credit", [address.toLowerCase()], opts));
  return result({ address: addr(r.address), creditAtto: atto(r.credit), reportBondAtto: atto(r.report_bond), reports: num(r.reports) });
}

export async function readStats(opts: Fresh = {}): Promise<ReadResult<Stats>> {
  return result(mapStats(asRow(await view("stats", [], opts))));
}

/** rules(): the contract's own words for its questions, its money, who may do what and its limits. */
export async function readRules(): Promise<ReadResult<Rules>> {
  return result(asRow(await view("rules", [])));
}

// ---- writes -----------------------------------------------------------------------------------------------

/** True for the call the validators judge: every one fetches the page and asks its model four questions. */
export const isJudged = (fn: WriteFn) => fn === "report";

const WRONG_CHAIN = (chainId: number | null) => `Your wallet is on ${chainName(chainId)}. Switch it to GenLayer Studio (chain 61999) before signing.`;

/** Sends a call through the connected EIP-1193 provider. Resolves to the transaction hash. */
export async function write(call: Call): Promise<string> {
  if (isMock) return mock.write(call);
  const address = contractAddress();
  if (!address) throw new Error("The contract is not deployed yet, so there is nothing to sign.");
  const signer = getSigner();
  if (!signer) throw new Error("Connect a wallet first.");
  // Studio is gasless and the SDK skips its own chain check for it, so the refusal to sign elsewhere lives here.
  const chainId = await getChainId(signer.provider);
  if (chainId !== CHAIN_ID) throw new Error(WRONG_CHAIN(chainId));
  const client = createClient({ chain: studio, account: signer.address as Address, provider: signer.provider });
  const hash = await client.writeContract({ address: address as Address, functionName: call.fn, args: call.args, value: call.value ?? 0n });
  if (typeof hash !== "string" || !hash.startsWith("0x")) throw new Error("The wallet returned no transaction hash.");
  return hash;
}

// ---- outcomes: what a finished call's JSON return means ---------------------------------------------

/** True when the leader's return is what the chain stored. */
export const stored = (s: TxStatus | null): s is TxStatus => !!s && !s.undetermined && s.applied !== false && s.status !== "CANCELED";

/** The tag of a raised error: a rule ([EXPECTED]), a page that could not be read ([TRANSIENT]) or a model failure ([LLM_ERROR]). */
export function errorTag(s: TxStatus | null): "EXPECTED" | "TRANSIENT" | "LLM_ERROR" | "" {
  const m = /\[(EXPECTED|TRANSIENT|LLM_ERROR)\]/.exec(s?.message || "");
  return m ? (m[1] as "EXPECTED" | "TRANSIENT" | "LLM_ERROR") : "";
}

function raisedSentence(s: TxStatus): string {
  const m = /\[(?:EXPECTED|TRANSIENT|LLM_ERROR)\]\s*([^"}\n]+)/.exec(s.message || "");
  return m ? sentence(m[1]) : "";
}

/** The contract's reason for refusing a call, as a sentence; "" when the call was not refused. */
export function refusalReason(s: TxStatus | null): string {
  if (!s) return "";
  const r = s.result;
  if (r && r.ok === false) return sentence(str(r.reason));
  if (s.exec === "ERROR" && !s.undetermined) return raisedSentence(s) || sentence(s.message || "");
  return "";
}

export function succeeded(s: TxStatus | null): boolean {
  return !!s && s.status === "FINALIZED" && stored(s) && s.exec !== "ERROR" && s.result?.ok !== false;
}

/** A report whose round stored nothing (the page could not be read, or a model failed): why. */
export function unsettledWhy(s: TxStatus | null): string {
  if (!s || !s.undetermined) return "";
  return errorTag(s) ? raisedSentence(s) : "";
}

/** A plain sentence for a tx that finished without doing what was asked; "" when it did. */
export function failureOf(s: TxStatus | null): string {
  if (!s) return "";
  if (s.undetermined) {
    const why = unsettledWhy(s);
    return why
      ? `${why} The validators did not agree on a value, so nothing was stored and no credit was taken.`
      : "The validators did not reach a majority, so nothing was stored. Sending the same report again is safe.";
  }
  if (s.status === "CANCELED") return "The network cancelled the transaction. Nothing was stored.";
  const reason = refusalReason(s);
  if (reason) return reason;
  if (s.applied === false) return "The validators did not accept this transaction. Nothing was stored.";
  return "";
}

const ok = (s: TxStatus | null): s is TxStatus & { result: Row } => stored(s) && s.result?.ok === true;

/** issue()'s return: the new release's id, or "". */
export const issuedRelease = (s: TxStatus | null): string => (ok(s) && /^E\d+$/.test(str(s.result.release)) ? str(s.result.release) : "");

export type Paid = { kind: "done"; result: Row } | { kind: "refused"; reason: string; returnedAtto: string } | { kind: "unknown" };

/** join()'s or deposit()'s return: taken, or refused with what came back in the same transaction. */
export function paidOutcome(s: TxStatus | null): Paid {
  if (!stored(s) || !s.result) return { kind: "unknown" };
  if (s.result.ok === true) return { kind: "done", result: s.result };
  if (s.result.ok === false) return { kind: "refused", reason: sentence(str(s.result.reason)), returnedAtto: atto(s.result.returned) };
  return { kind: "unknown" };
}

export type ReportOutcome = {
  report: string;
  release: string;
  outlet: string;
  url: string;
  finding: Finding;
  fp: string;
  repeatOf: string;
  outletStatus: OutletStatus;
  costAtto: string;
  toOutletAtto: string;
  toReporterAtto: string;
  toIssuerAtto: string;
  creditAtto: string;
};

/** report()'s return: the agreed finding and where the money went. */
export function reportOutcome(s: TxStatus | null): ReportOutcome | null {
  if (!ok(s) || !FINDINGS.includes(str(s.result.finding) as Finding)) return null;
  const r = s.result;
  return {
    report: str(r.report),
    release: str(r.release),
    outlet: addr(r.outlet),
    url: str(r.url),
    finding: finding(r.finding),
    fp: fp(r.fp),
    repeatOf: str(r.repeat_of),
    outletStatus: outletStatus(r.outlet_status),
    costAtto: atto(r.cost),
    toOutletAtto: atto(r.to_outlet),
    toReporterAtto: atto(r.to_reporter),
    toIssuerAtto: atto(r.to_issuer),
    creditAtto: atto(r.credit),
  };
}

/** True when GEN moves to or from the signer's wallet because of this call, so the balance is watched afterwards. */
export function movesMoney(s: TxStatus): boolean {
  const r = s.result;
  if (!r) return false;
  if (r.ok === false) return atto(r.returned) !== "0";
  if (r.ok !== true) return false;
  return atto(r.paid) !== "0" || atto(r.withdrawn) !== "0" || atto(r.to_reporter) !== "0";
}

// ---- the demo desk ------------------------------------------------------------------------------

let demoCache: { at: number; value: DemoStatus } | null = null;

const OFFLINE = (reason: string): DemoStatus => ({ online: false, reason, issuer: "", outlets: [], release: "", phase: "", secondsLeft: 0, embargoUntil: 0, joined: false, pages: false, pagesReason: "" });

/** Whether the demo desk can act now, its accounts and its newest release. Asked of the site's own server; cached 20 s. */
export async function readDemoStatus(opts: Fresh = {}): Promise<DemoStatus> {
  if (isMock) return mock.demoStatus();
  if (!opts.fresh && demoCache && Date.now() - demoCache.at < 20_000) return demoCache.value;
  try {
    const res = await fetch("/api/demo/status", { cache: "no-store" });
    const b = (await res.json()) as Partial<DemoStatus>;
    const outlets: DemoOutlet[] = Array.isArray(b.outlets)
      ? b.outlets
          .filter((o) => o && (o.key === "harbour-post" || o.key === "bay-gazette"))
          .map((o) => ({ key: o.key, name: str(o.name), address: addr(o.address), prefix: str(o.prefix) }))
      : [];
    const value: DemoStatus = {
      online: b.online === true,
      reason: str(b.reason),
      issuer: addr(b.issuer),
      outlets,
      release: /^E[1-9]\d{0,8}$/.test(str(b.release)) ? str(b.release) : "",
      phase: str(b.phase),
      secondsLeft: num(b.secondsLeft),
      embargoUntil: num(b.embargoUntil),
      joined: b.joined === true,
      pages: b.pages === true,
      pagesReason: str(b.pagesReason),
    };
    demoCache = { at: Date.now(), value };
    return value;
  } catch {
    return OFFLINE("the site's server did not answer");
  }
}

export const forgetDemoStatus = () => {
  demoCache = null;
};

async function askDemo(path: string, body: Record<string, string>): Promise<DemoAnswer> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const a = (await res.json()) as Record<string, unknown>;
    if (a.ok === true && Array.isArray(a.hashes)) {
      const hashes = (a.hashes as Row[]).filter((h) => /^0x[0-9a-fA-F]{64}$/.test(str(h.hash))).map((h) => ({ label: str(h.label), hash: str(h.hash) }));
      return { ok: true, hashes, release: str(a.release), note: str(a.note) };
    }
    return { ok: false, reason: sentence(str(a.reason, "the demo desk did not answer")), retryAfter: num(a.retryAfter) || undefined };
  } catch {
    return { ok: false, reason: "The site's server did not answer. Try again in a minute." };
  }
}

/** Asks the demo desk for a fresh demo release (when none is still under embargo), joined by both demo outlets. */
export async function requestDemoOpen(): Promise<DemoAnswer> {
  forgetDemoStatus();
  if (isMock) return mock.demoOpen();
  return askDemo("/api/demo/open", {});
}

/** Asks both demo outlets to join a release. Nothing the visitor typed goes with it but the release id. */
export async function requestDemoJoin(release: string): Promise<DemoAnswer> {
  forgetDemoStatus();
  if (isMock) return mock.demoJoin(release);
  return askDemo("/api/demo/join", { release });
}

// ---- transactions, balances, the faucet -------------------------------------------------------------

export async function txStatus(hash: string): Promise<TxStatus> {
  if (isMock) return mock.txStatus(hash);
  const tx = await withRetry(() => rpc<RawTx | null>("eth_getTransactionByHash", [hash]), { tries: 2, bucket: "eth", ownBudget: true });
  return decodeTx(tx);
}

export async function balanceOf(address: string): Promise<bigint> {
  if (isMock) return mock.balanceOf(address);
  const hex = await withRetry(() => rpc<string>("eth_getBalance", [address, "latest"]), { tries: 3, bucket: "eth", ownBudget: true });
  return BigInt(hex || "0x0");
}

const FAUCET_PAUSE_MS = 10_000;
const FAUCET_TRIES = 3;
const FAUCET_WAIT_MS = 60_000;

/** sim_fundAccount with 10 GEN, up to three tries ten seconds apart. Resolves when the balance moved. */
export async function faucet(address: string, opts: { stillWanted?: () => boolean } = {}): Promise<bigint> {
  if (isMock) return mock.faucet(address);
  let account: string;
  try {
    account = getAddress(address); // Studio credits only a checksummed address
  } catch {
    throw new Error("That is not a valid 0x address, so the faucet was not asked.");
  }
  let before: bigint;
  try {
    before = await balanceOf(account);
  } catch {
    throw new Error("Could not read this wallet's balance from Studio, so the faucet was not asked. Try again in a few seconds.");
  }
  let sent = false;
  for (let i = 0; i < FAUCET_TRIES && !sent; i++) {
    await waitForCooldown("gen");
    try {
      await rpc("sim_fundAccount", { account_address: account, amount: 10e18 });
      sent = true;
    } catch (e) {
      noteFailure(e, Date.now(), "gen");
      if (i === FAUCET_TRIES - 1) throw new Error(FAUCET_REFUSED);
      await sleep(FAUCET_PAUSE_MS);
    }
  }
  const started = Date.now();
  while (Date.now() - started < FAUCET_WAIT_MS) {
    await sleep(2000);
    if (opts.stillWanted && !opts.stillWanted()) throw new Error("The faucet wait ended: the wallet switched accounts.");
    try {
      const now = await balanceOf(account);
      if (now !== before) return now;
    } catch {
      /* a dropped poll is not a failed faucet */
    }
  }
  throw new Error("The faucet did not credit the account within 60 s. Try again.");
}

export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER_URL}/address/${address}`;
export const releasePath = (id: string) => `/release/${id}`;
