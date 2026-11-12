// Opens the first demo release from DEMO_KEY, by hand, once the contract is deployed and the repository is
// pushed: checks the key, derives the three demo accounts (lib/demo-key.ts), funds them from Studio's faucet,
// issues "Lantern Bay Ferries adds a night crossing to Gull Island" (embargo about thirty minutes ahead, 0.1
// GEN bond) and has The Harbour Post and The Bay Gazette join it with their pinned prefixes. Nothing in the
// build runs it.
//
//   REGISTER=0x... DEMO_KEY=... COMMIT=<40 hex> node tools/open-demo.mjs
//   DRY=1 REGISTER=0x... COMMIT=<40 hex> node tools/open-demo.mjs        # check and print the calls, send nothing
//   REPO=<owner>/<name> ...                                               # when neither NEXT_PUBLIC_REPO_URL nor the git remote names it
//
// The key is read from the environment only and never printed. When COMMIT is given, every demo page is fetched
// from raw.githubusercontent.com and compared with outlets/ in this checkout, so a wrong commit is caught before
// anyone relies on it (OUTLETS_COMMIT in lib/config.ts takes the same commit). If a demo release from this key is
// still under embargo with both outlets joined, nothing is sent. Each transaction is followed to a final status.
// Needs Node 22.18 or later (it reads lib/*.ts directly).

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getAddress } from "viem";

import { REPO_URL, repoOf } from "../lib/config.ts";
import { deriveAll, keyProblem } from "../lib/demo-key.ts";
import { DEMO_BOND, DEMO_HEADLINE, DEMO_LEAD_SECONDS, DEMO_OUTLETS, DEMO_PAGES, DEMO_SUMMARY, demoPageUrl, demoPrefix } from "../lib/pages.ts";
import { headlineProblem, prefixProblem, summaryProblem } from "../lib/rules.ts";

const RPC = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";
const studio = { ...studionet, rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC] } } };

const REGISTER = (process.env.REGISTER || "").trim();
const COMMIT = (process.env.COMMIT || "").trim().toLowerCase();
const DRY = process.env.DRY === "1";
function remoteRepo() {
  try {
    const origin = execSync("git remote get-url origin", { cwd: new URL("..", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return (origin.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/) || [])[1] || "";
  } catch {
    return "";
  }
}
const REPO = (process.env.REPO || repoOf(REPO_URL) || remoteRepo()).trim();

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
if (!/^0x[0-9a-fA-F]{40}$/.test(REGISTER)) fail("REGISTER must be the deployed contract's 0x address.");
if (!/^[0-9a-f]{40}$/.test(COMMIT)) fail("COMMIT must be the 40-character commit the outlets/ pages were pushed in.");
if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(REPO)) fail("REPO must be <owner>/<name> on GitHub (or set NEXT_PUBLIC_REPO_URL, or the git remote origin).");
const problem = keyProblem(process.env.DEMO_KEY);
if (!DRY && problem) fail(`DEMO_KEY: ${problem}.`);
const why = headlineProblem(DEMO_HEADLINE) || summaryProblem(DEMO_SUMMARY) || DEMO_OUTLETS.map((o) => prefixProblem(demoPrefix(REPO, COMMIT, o.key))).find(Boolean);
if (why) fail(`The demo release would be refused: ${why}.`);

// ---- the pages every validator will fetch must be at that commit (skipped in a dry run) --------------------
for (const p of DRY ? [] : DEMO_PAGES) {
  const here = readFileSync(new URL(`../../outlets/${p.outlet}/${p.file}`, import.meta.url), "utf8");
  let there = "";
  try {
    const r = await fetch(demoPageUrl(REPO, COMMIT, p));
    there = r.ok ? await r.text() : "";
  } catch {
    there = "";
  }
  if (there !== here) fail(`${demoPageUrl(REPO, COMMIT, p)}\ndoes not serve outlets/${p.outlet}/${p.file} as it is in this checkout. Push the repository and pass that commit as COMMIT.`);
}
if (!DRY) console.log(`the ${DEMO_PAGES.length} demo pages are at https://raw.githubusercontent.com/${REPO}/${COMMIT}/outlets/; set OUTLETS_COMMIT = "${COMMIT}" in lib/config.ts`);

const acc = problem ? null : deriveAll(process.env.DEMO_KEY);
if (!problem && !acc) fail("DEMO_KEY does not derive three usable accounts; use another key.");
if (acc) for (const [label, a] of Object.entries(acc)) console.log(`demo ${label.padEnd(12)} ${getAddress(a.address)}`);
const until = () => Math.floor(Date.now() / 1000) + DEMO_LEAD_SECONDS;
console.log(`${DRY ? "DRY RUN: " : ""}to ${REGISTER}`);
console.log(`  issue(${JSON.stringify(DEMO_HEADLINE)}, ${JSON.stringify(DEMO_SUMMARY)}, ${until()}, "${DEMO_BOND}")   as the issuer`);
for (const o of DEMO_OUTLETS) console.log(`  join(<release>, "${demoPrefix(REPO, COMMIT, o.key)}") with ${DEMO_BOND} atto   as ${o.label}`);
if (DRY) process.exit(0);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(method, params) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const body = await res.json();
      if (body.error) {
        await sleep(res.status === 429 || body.error.code === -32029 ? 20_000 : 5000);
        continue;
      }
      return body.result;
    } catch {
      await sleep(4000);
    }
  }
  throw new Error(`${method} did not answer`);
}

/** Follows a transaction to a final status; returns the contract's JSON return and the vote tally. */
async function follow(hash) {
  for (let i = 0; i < 300; i++) {
    await sleep(4000);
    const tx = await rpc("eth_getTransactionByHash", [hash]);
    const status = String(tx?.status ?? "");
    if (status === "FINALIZED" || status === "CANCELED" || status === "UNDETERMINED") {
      const lr = tx.consensus_data?.leader_receipt;
      const one = Array.isArray(lr) ? lr[0] : lr;
      let text = "";
      try {
        text = Buffer.from(one?.result ?? "", "base64").toString("utf8");
      } catch {
        text = "";
      }
      const start = text.indexOf("{");
      let json = null;
      try {
        json = start >= 0 ? JSON.parse(text.slice(start, text.lastIndexOf("}") + 1)) : null;
      } catch {
        json = null;
      }
      const votes = Object.values(tx.consensus_data?.votes ?? {});
      return { status, json, agree: votes.filter((v) => v === "agree").length, of: votes.length, text };
    }
  }
  return { status: "TIMEOUT", json: null, agree: 0, of: 0, text: "" };
}

async function read(client, functionName, args) {
  for (let i = 0; i < 8; i++) {
    try {
      const raw = await client.readContract({ address: REGISTER, functionName, args });
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      await sleep(5000);
    }
  }
  throw new Error(`could not read ${functionName}() from Studio`);
}

async function send(key, functionName, args, value, label) {
  const client = createClient({ chain: studio, account: createAccount(key) });
  for (let tries = 1; ; tries++) {
    try {
      const hash = await client.writeContract({ address: REGISTER, functionName, args, value });
      const done = await follow(hash);
      const okay = done.json?.ok === true;
      console.log(`${okay ? "OK  " : "FAIL"}  ${label}: ${okay ? "" : done.status + " " + done.text.slice(0, 160)}  ${done.agree}/${done.of} agree  ${EXPLORER}/tx/${hash}`);
      if (!okay) process.exit(1);
      return done.json;
    } catch (e) {
      if (tries >= 3) fail(`${label} not sent (${String(e?.shortMessage || e?.message || e).slice(0, 80)})`);
      await sleep(15_000);
    }
  }
}

// Each derived account signs from its own balance; Studio's faucet tops one up that holds less than 2 GEN.
for (const a of Object.values(acc)) {
  const have = BigInt((await rpc("eth_getBalance", [a.address, "latest"])) || "0x0");
  if (have >= 2n * 10n ** 18n) continue;
  await rpc("sim_fundAccount", { account_address: getAddress(a.address), amount: 20e18 });
  for (let i = 0; i < 20 && BigInt((await rpc("eth_getBalance", [a.address, "latest"])) || "0x0") <= have; i++) await sleep(3000);
}

const reader = createClient({ chain: studio });
const first = await read(reader, "releases", [0, 20]);
const last = first.total > 20 ? await read(reader, "releases", [Math.floor((first.total - 1) / 20) * 20, 20]) : first;
const mine = (last.rows ?? []).filter((r) => r.issuer === acc.issuer.address).sort((a, b) => Number(b.release.slice(1)) - Number(a.release.slice(1)))[0];
let release = mine && mine.phase === "embargoed" && mine.seconds_left > 300 ? mine.release : "";
if (!release) {
  const out = await send(acc.issuer.key, "issue", [DEMO_HEADLINE, DEMO_SUMMARY, until(), DEMO_BOND.toString()], 0n, "issue the demo release");
  release = out.release;
}
const joined = (await read(reader, "outlets_of", [release, 0, 20])).rows?.map((r) => r.outlet) ?? [];
for (const o of DEMO_OUTLETS) {
  if (joined.includes(acc[o.key].address)) {
    console.log(`SKIP  ${o.name} already holds ${release}`);
    continue;
  }
  await send(acc[o.key].key, "join", [release, demoPrefix(REPO, COMMIT, o.key)], DEMO_BOND, `${o.name} joins ${release}`);
}
console.log(`\nThe demo release is ${release}. Set DEMO_KEY on the host, OUTLETS_COMMIT in lib/config.ts, and check GET /api/demo/status.`);
