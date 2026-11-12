// The demo desk, server side only (imported by app/api/demo/*). It holds one throwaway Studio secret,
// DEMO_KEY, and derives three accounts from it (lib/demo-key.ts): the demo issuer, Lantern Bay
// Ferries, and the two demo outlets, The Harbour Post and The Bay Gazette. It signs exactly two kinds of
// thing: issue() of the one demo release, word for word (lib/pages.ts), and join() by the two demo
// outlets with their fixed prefixes, the repository's outlets/<outlet>/ folders pinned to one commit.
// Nothing a visitor types is ever signed: a visitor names a release id at most. The key is never
// logged, never returned and never written anywhere; an answer names the public addresses at most.

import { createAccount, createClient } from "genlayer-js";
import { getAddress, type Address } from "viem";

import { balanceOf, contractAddress, isMock, issuedRelease, readOutlets, readRelease, readReleases, studio } from "./chain";
import { REPO_URL, outletsCommit, repoOf } from "./config";
import { deriveAll, keyProblem, type Label } from "./demo-key";
import { DEMO_LIMITS, createLimiter } from "./demo-limit";
import { DEMO_BOND, DEMO_HEADLINE, DEMO_LEAD_SECONDS, DEMO_MIN_JOIN_LEFT, DEMO_OUTLETS, DEMO_SUMMARY, demoJoinProblem, demoPrefix } from "./pages";
import { FINAL_STATUSES, decodeTx, rpc, sleep, statusName, type RawTx } from "./rpc";
import { PAGE, idNumber, parseReleaseId } from "./rules";
import type { DemoOutlet, DemoStatus, Release } from "./types";

export const NO_CONTRACT_REASON = "the contract is not deployed yet";
export const RPC_DOWN = "Studio's RPC did not answer; try again in a minute";
export const NO_COMMIT = "the demo outlets' pages are not pinned to a commit yet (OUTLETS_COMMIT in lib/config.ts, or NEXT_PUBLIC_OUTLETS_COMMIT)";
export const NO_REPO = "the site does not know its public repository (NEXT_PUBLIC_REPO_URL), so it cannot build the demo outlets' prefixes";
export const noBalance = (label: Label) => `the demo ${label} account holds no GEN and Studio's faucet did not top it up`;

/** The demo outlets' prefixes can be built: the commit and the repository are known. */
export function pagesState(): { pages: boolean; pagesReason: string } {
  if (!outletsCommit()) return { pages: false, pagesReason: NO_COMMIT };
  if (!repoOf(REPO_URL)) return { pages: false, pagesReason: NO_REPO };
  return { pages: true, pagesReason: "" };
}

type Accounts = NonNullable<ReturnType<typeof deriveAll>>;
let derived: { raw: string; value: Accounts | null } | null = null;
function accounts(): Accounts | null {
  const raw = process.env.DEMO_KEY ?? "";
  if (!derived || derived.raw !== raw) derived = { raw, value: deriveAll(raw) };
  return derived.value;
}

const outletsOf = (a: Accounts): DemoOutlet[] =>
  DEMO_OUTLETS.map((o) => ({ key: o.key, name: o.name, address: a[o.key].address, prefix: demoPrefix(repoOf(REPO_URL), outletsCommit(), o.key) }));

/** Each derived account signs from its own balance; Studio's faucet refills one that holds less than 2 GEN. */
async function ensureBalance(address: string): Promise<boolean> {
  const have = await balanceOf(address);
  if (have >= 2n * 10n ** 18n) return true;
  try {
    await rpc("sim_fundAccount", { account_address: getAddress(address), amount: 20e18 });
  } catch {
    return have > DEMO_BOND;
  }
  for (let i = 0; i < 6; i++) {
    await sleep(2000);
    try {
      if ((await balanceOf(address)) > have) return true;
    } catch {
      /* one dropped read; ask again */
    }
  }
  return have > DEMO_BOND;
}

/** The newest release the demo issuer issued: the last page of releases(), then the one before it. */
async function newestDemoRelease(issuer: string): Promise<Release | null> {
  const first = (await readReleases(0, { fresh: true })).data;
  const pages = Math.max(1, Math.ceil(first.total / PAGE));
  for (let p = pages - 1, k = 0; p >= 0 && k < 2; p--, k++) {
    const rows = p === 0 ? first.rows : (await readReleases(p * PAGE, { fresh: true })).data.rows;
    const mine = rows.filter((r) => r.issuer === issuer).sort((a, b) => idNumber(b.id) - idNumber(a.id));
    if (mine[0]) return mine[0];
  }
  return null;
}

const offline = (reason: string, extra: Partial<DemoStatus> = {}): DemoStatus => ({
  online: false,
  reason,
  issuer: "",
  outlets: [],
  release: "",
  phase: "",
  secondsLeft: 0,
  embargoUntil: 0,
  joined: false,
  ...pagesState(),
  ...extra,
});

let cached: { at: number; value: DemoStatus } | null = null;

/** Whether the demo desk can act now, and exactly why not. */
export async function demoStatusNow(opts: { fresh?: boolean } = {}): Promise<DemoStatus> {
  if (isMock) return offline("in the demo build the demo desk answers in the browser");
  const problem = keyProblem(process.env.DEMO_KEY);
  if (problem) return offline(problem);
  const a = accounts();
  if (!a) return offline("the key set does not derive three usable accounts; set another DEMO_KEY");
  const base = { issuer: a.issuer.address, outlets: outletsOf(a) };
  if (!contractAddress()) return offline(NO_CONTRACT_REASON, base);
  if (!opts.fresh && cached && Date.now() - cached.at < 15_000) return cached.value;
  for (const label of ["issuer", "harbour-post", "bay-gazette"] as Label[]) {
    try {
      if (!(await ensureBalance(a[label].address))) return offline(noBalance(label), base);
    } catch {
      return offline(RPC_DOWN, base);
    }
  }
  let release: Release | null = null;
  let joined = false;
  try {
    release = await newestDemoRelease(a.issuer.address);
    if (release) {
      const rows = (await readOutlets(release.id, { fresh: true })).data.rows.map((r) => r.outlet);
      joined = base.outlets.every((o) => rows.includes(o.address));
    }
  } catch {
    return offline(RPC_DOWN, base);
  }
  const pages = pagesState();
  const value: DemoStatus = {
    online: pages.pages,
    reason: pages.pages ? "" : pages.pagesReason,
    ...base,
    release: release?.id ?? "",
    phase: release ? (release.phase === "embargoed" ? "embargoed" : "lifted") : "",
    secondsLeft: release?.secondsLeft ?? 0,
    embargoUntil: release?.embargoUntil ?? 0,
    joined,
    ...pages,
  };
  cached = { at: Date.now(), value };
  return value;
}

const limiter = createLimiter(DEMO_LIMITS);

// One transaction at a time per account: the hash of its last one, until it is final.
const inflight = new Map<string, { hash: string; at: number }>();

async function stillMoving(address: string): Promise<boolean> {
  const last = inflight.get(address);
  if (!last) return false;
  if (Date.now() - last.at > DEMO_LIMITS.sentHoldMs) {
    inflight.delete(address);
    return false;
  }
  try {
    const tx = await rpc<RawTx | null>("eth_getTransactionByHash", [last.hash]);
    if (tx && FINAL_STATUSES.has(statusName(tx.status))) {
      inflight.delete(address);
      return false;
    }
  } catch {
    /* not readable now: still moving, as far as anyone can tell */
  }
  return true;
}

// One signature at a time: the demo accounts never race each other for a nonce.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

async function sign(key: `0x${string}`, address: string, functionName: string, args: (string | number)[], value: bigint): Promise<string> {
  const hash = await serial(async () => {
    const client = createClient({ chain: studio, account: createAccount(key) });
    return client.writeContract({ address: contractAddress() as Address, functionName, args, value });
  });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("no hash");
  inflight.set(address, { hash, at: Date.now() });
  return hash;
}

/** Follows a transaction for up to `ms`; its decoded status once final, or null. */
async function follow(hash: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    await sleep(3000);
    try {
      const tx = await rpc<RawTx | null>("eth_getTransactionByHash", [hash]);
      if (tx && FINAL_STATUSES.has(statusName(tx.status))) return decodeTx(tx);
    } catch {
      /* a dropped poll; ask again */
    }
  }
  return null;
}

type Hash = { label: string; hash: string };
export type ServerAnswer = { status: number; body: { ok: true; hashes: Hash[]; release: string; note: string } | { ok: false; reason: string; retryAfter?: number } };

const busy = (who: string): ServerAnswer => ({ status: 409, body: { ok: false, reason: `the demo ${who} is still waiting for its last transaction to be final; try again in a minute`, retryAfter: 30 } });

/** Both demo outlets that have not joined `release` join it with their fixed prefixes. */
async function joinOutlets(a: Accounts, release: Release, outlets: DemoOutlet[]): Promise<Hash[] | ServerAnswer> {
  const have = (await readOutlets(release.id, { fresh: true })).data.rows.map((r) => r.outlet);
  const missing = outlets.filter((o) => !have.includes(o.address));
  for (const o of missing) if (await stillMoving(o.address)) return busy(o.key);
  const out: Hash[] = [];
  for (const o of missing) out.push({ label: `${o.name} joins ${release.id}`, hash: await sign(a[o.key].key, o.address, "join", [release.id, o.prefix], BigInt(release.bondAtto)) });
  return out;
}

const turn = (key: string): ServerAnswer | null => {
  const t = limiter.attempt(key, Date.now());
  return t.ok ? null : { status: 429, body: { ok: false, reason: `the demo desk was asked a moment ago; try again in ${t.retryAfter} s`, retryAfter: t.retryAfter } };
};

/** A fresh demo release when none is still under embargo, and both demo outlets join it. */
export async function sendOpen(): Promise<ServerAnswer> {
  const s = await demoStatusNow({ fresh: true });
  if (!s.online) return { status: 503, body: { ok: false, reason: "the demo desk is offline: " + s.reason } };
  const wait = turn("open");
  if (wait) return wait;
  const a = accounts()!;
  try {
    if (s.release && s.phase === "embargoed" && s.secondsLeft > DEMO_MIN_JOIN_LEFT) {
      const r = (await readRelease(s.release, { fresh: true })).data;
      if (!r) return { status: 502, body: { ok: false, reason: "could not read the demo release from Studio; try again in a minute" } };
      const joins = await joinOutlets(a, r, s.outlets);
      if (!Array.isArray(joins)) return joins;
      return { status: 200, body: { ok: true, hashes: joins, release: r.id, note: `${r.id} is still under embargo; it is the demo release` } };
    }
    if (await stillMoving(a.issuer.address)) return busy("issuer");
    const until = Math.floor(Date.now() / 1000) + DEMO_LEAD_SECONDS;
    const issued = await sign(a.issuer.key, a.issuer.address, "issue", [DEMO_HEADLINE, DEMO_SUMMARY, until, DEMO_BOND.toString()], 0n);
    const hashes: Hash[] = [{ label: "Lantern Bay Ferries issues the demo release", hash: issued }];
    cached = null;
    // The joins need the new release's id, which only the final transaction carries. Wait for it a while;
    // when it takes longer, the page asks POST /api/demo/join once it sees the id.
    const final = await follow(issued, 40_000);
    const id = issuedRelease(final);
    if (!id) return { status: 200, body: { ok: true, hashes, release: "", note: "the release is being issued; the demo outlets join it once it is final" } };
    const r = (await readRelease(id, { fresh: true })).data;
    if (!r) return { status: 200, body: { ok: true, hashes, release: id, note: "the release is issued; the demo outlets join it on the next try" } };
    const joins = await joinOutlets(a, r, s.outlets);
    if (!Array.isArray(joins)) return { status: 200, body: { ok: true, hashes, release: id, note: "the release is issued; the demo outlets join it on the next try" } };
    return { status: 200, body: { ok: true, hashes: [...hashes, ...joins], release: id, note: "" } };
  } catch {
    // Nothing of the error goes out: it is the network's, and it is not the visitor's business.
    return { status: 502, body: { ok: false, reason: "Studio did not take the demo desk's transaction; try again in a minute" } };
  }
}

/** Both demo outlets join a release (a visitor's, or the demo release they have not joined yet). */
export async function sendJoin(raw: string): Promise<ServerAnswer> {
  const id = parseReleaseId(raw);
  if (!id) return { status: 400, body: { ok: false, reason: 'send {"release": "E3"}' } };
  const s = await demoStatusNow();
  if (!s.online) return { status: 503, body: { ok: false, reason: "the demo desk is offline: " + s.reason } };
  const wait = turn("join:" + id);
  if (wait) return wait;
  const a = accounts()!;
  try {
    const r = (await readRelease(id, { fresh: true })).data;
    const problem = demoJoinProblem(r ? { id, issuer: r.issuer, bondAtto: BigInt(r.bondAtto), secondsLeft: r.secondsLeft, phase: r.phase } : null, s.outlets.map((o) => o.address));
    if (problem) return { status: r ? 409 : 404, body: { ok: false, reason: problem } };
    const joins = await joinOutlets(a, r!, s.outlets);
    if (!Array.isArray(joins)) return joins;
    if (!joins.length) return { status: 409, body: { ok: false, reason: `both demo outlets have already joined ${id}` } };
    cached = null;
    return { status: 200, body: { ok: true, hashes: joins, release: id, note: "" } };
  } catch {
    return { status: 502, body: { ok: false, reason: "Studio did not take the demo outlets' joins; try again in a minute" } };
  }
}
