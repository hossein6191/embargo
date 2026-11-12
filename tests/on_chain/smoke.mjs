/* Embargo against GenLayer Studio (chain 61999), with throwaway accounts. Deploys its own copy.
 *
 *   npm ci                                                   # genlayer-js 1.1.8 and viem 2.56.8, pinned by package-lock.json
 *   COMMIT=<sha> node tests/on_chain/smoke.mjs               # the whole run, about forty minutes
 *   COMMIT=<sha> RESUME=1 node tests/on_chain/smoke.mjs      # continue a run that was cut off, from the saved state
 *   STATE=/some/dir/run.json ...                             # the state file: keys, contract address, every step made
 *   FRESH=1 ...                                              # start over even though a saved run exists
 *
 * The validators read the outlets' pages from raw.githubusercontent.com, pinned to one commit, so the page every
 * node fetches is the same bytes. Push the repository first and pass that commit as COMMIT (40 hex characters).
 * REPO is "<owner>/<name>" on GitHub; when it is not set it is read from `git remote get-url origin`. The script
 * fetches the pages itself before it deploys anything, and stops if they are not there.
 *
 * Five accounts the script generates and funds itself play the whole story: ISSUER is Lantern Bay Ferries, which
 * issues the release; POST is The Harbour Post, whose site is outlets/harbour-post/; GAZETTE is The Bay Gazette,
 * whose site is outlets/bay-gazette/; REPORTER watches the outlets' sites while the embargo holds; STRANGER has no
 * part in the release and tries what only an outlet may do. Each outlet stakes 1 GEN; a report puts 0.02 GEN of
 * credit at stake.
 *
 * Phases:
 *   A  deploy; ISSUER issues E1 ("Lantern Bay Ferries adds a night crossing to Gull Island"), its embargo about
 *      25 minutes ahead. ISSUER tries to join its own release: refused, the 1 GEN back in the same transaction.
 *      POST joins with 1 GEN and its prefix; its second join is refused and returned. GAZETTE sends 0.9 GEN:
 *      refused and returned; then joins with 1 GEN. POST asks for its bond back while the embargo holds: refused.
 *   B  the reports, while the embargo holds, one consensus round each:
 *        REPORTER reports with no credit: refused before anything is fetched; then deposits 0.1 GEN
 *        POST tries to report itself: refused
 *        REPORTER points at the repository's README as a POST page, outside POST's prefix: refused before any fetch
 *        REPORTER: weather.html (a weather column)                 kept; the 0.02 GEN goes to POST
 *        REPORTER: ferries-feature.html (the company's history)    kept (0.02 GEN to POST) or unclear (0.002 GEN)
 *        REPORTER: early-story.html (the night crossing, early)    broken; 0.2 GEN to REPORTER, 0.8 GEN to ISSUER
 *        REPORTER reports POST again: refused, POST's bond is already paid out
 *   C  once the embargo has lifted by the chain's own clock: REPORTER reports GAZETTE's story-after.html and is
 *      refused before anything is fetched; STRANGER tries to take GAZETTE's bond and is refused; GAZETTE takes its
 *      1 GEN back, once; POST cannot take back a bond it lost.
 *   D  the deployed code is read back and compared with contracts/embargo.py byte for byte; the views are checked
 *      against what the run did; REPORTER takes its credit back; the contract holds nothing; every account ends
 *      where the money says.
 *
 * Every refusal is a signed transaction. Balances are read before and after every step that moves money.
 * Transactions are polled with eth_getTransactionByHash, never with views (gen_call is limited to 30 a minute
 * per client, shared with sim_fundAccount). A round the validators do not carry stores nothing; it is sent again
 * and both transactions are kept. Every id is read from the receipt of the call that made it, and a step whose
 * receipt does not carry the id it needs stops the run rather than guess. Every step is saved as it is made, so a
 * run cut off part way continues with RESUME=1 without sending anything twice.
 */
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { generatePrivateKey } from "viem/accounts";
import { getAddress } from "viem";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RPC = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";
const STATE = process.env.STATE || join(tmpdir(), "embargo-smoke-state.json");
const RECORD = process.env.RECORD || STATE.replace(/\.json$/, "") + "-record.json";
const FILE = new URL("../../contracts/embargo.py", import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);
const rpc = async (m, p) => {
  let last;
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) });
      const j = await r.json();
      if (j.error && (j.error.code === -32029 || r.status === 429)) { await sleep(((j.error.data?.retry_after_seconds) || 20) * 1000); continue; }
      if (j.error) { last = new Error(m + ": " + JSON.stringify(j.error).slice(0, 200)); await sleep(6000); continue; }
      return j.result;
    } catch (e) { last = e; await sleep(4000); }   // the connection itself failed, or the answer was not JSON
  }
  throw last;
};
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  - " + d : ""}`); return !!c; };
const note = (s) => console.log(`      .. ${s}`);
const GEN = 10n ** 18n;
const tally = (v) => `${v.agree} agree, ${v.disagree} disagree, ${v.idle} idle`;
const sha = (b) => createHash("sha256").update(b).digest("hex");

// ---------- where the validators will read the outlets' pages ----------
const COMMIT = String(process.env.COMMIT || "").trim();
if (!/^[0-9a-f]{40}$/.test(COMMIT)) {
  console.log("COMMIT must be the 40-character commit the outlets' pages were pushed in: COMMIT=<sha> node tests/on_chain/smoke.mjs");
  process.exit(2);
}
let REPO = String(process.env.REPO || "").trim();
if (!REPO) {
  try {
    const origin = execSync("git remote get-url origin", { cwd: new URL("../..", import.meta.url), encoding: "utf8" }).trim();
    REPO = (origin.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/) || [])[1] || "";
  } catch (e) { REPO = ""; }
}
if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(REPO)) {
  console.log("REPO must be <owner>/<name> on GitHub (or set the git remote origin): REPO=<owner>/embargo COMMIT=<sha> ...");
  process.exit(2);
}
const RAW_ROOT = `https://raw.githubusercontent.com/${REPO}/${COMMIT}/`;
const POST_SITE = RAW_ROOT + "outlets/harbour-post/";
const GAZETTE_SITE = RAW_ROOT + "outlets/bay-gazette/";
for (const prefix of [POST_SITE, GAZETTE_SITE]) {
  if (prefix.length > 120) {
    console.log(`The site prefix ${prefix} must be at most 120 characters (the contract's own rule); use a shorter repository name.`);
    process.exit(2);
  }
}
const PAGE = {
  weather: POST_SITE + "weather.html",
  feature: POST_SITE + "ferries-feature.html",
  early: POST_SITE + "early-story.html",
  after: GAZETTE_SITE + "story-after.html",
};
const OUTSIDE = RAW_ROOT + "README.md";          // a real page of the same commit, but not below POST's prefix
const LOCAL = {};
for (const [name, address] of Object.entries(PAGE)) {
  LOCAL[name] = readFileSync(new URL("../../" + address.slice(RAW_ROOT.length), import.meta.url), "utf8");
  let there = "";
  try { const r = await fetch(address); there = r.ok ? await r.text() : ""; } catch (e) { there = ""; }
  if (there !== LOCAL[name]) {
    console.log(`${address}\ndoes not serve ${address.slice(RAW_ROOT.length)} as it is in this checkout. Push the repository and pass that commit as COMMIT.`);
    process.exit(2);
  }
}
// what every validator should fingerprint: the first 32,000 characters with their tags removed (and the text after a
// script or style tag), then their spacing collapsed, at most 6,000; the contract's _visible and _page_text
const visible = (text) => {
  const pieces = text.slice(0, 32000).split("<");
  let out = pieces[0];
  for (const piece of pieces.slice(1)) {
    const close = piece.indexOf(">");
    if (close === -1) out += "<" + piece;
    else if (/^(script|style)/.test(piece.slice(0, 6).toLowerCase())) out += " ";
    else out += " " + piece.slice(close + 1);
  }
  return out;
};
const fpOf = (text) => sha(visible(text).slice(0, 32000).split(/\s+/).filter(Boolean).join(" ").slice(0, 6000)).slice(0, 16);

// ---------- state: keys, the contract address and every step already made survive a cut-off run ----------
if (existsSync(STATE) && !process.env.RESUME && !process.env.FRESH) {
  console.log(`A saved run exists at ${STATE}.\nRESUME=1 continues it; FRESH=1 starts over; STATE=<path> keeps another.`);
  process.exit(2);
}
const st = existsSync(STATE) && process.env.RESUME && !process.env.FRESH ? JSON.parse(readFileSync(STATE, "utf8")) : {};
st.keys = st.keys || {}; st.steps = st.steps || {}; st.views = st.views || {}; st.order = st.order || [];
st.commit = st.commit || COMMIT; st.repo = st.repo || REPO;
if (st.commit !== COMMIT) { console.log(`This saved run used commit ${st.commit}; continue it with that COMMIT, or start over with FRESH=1.`); process.exit(2); }
const SOURCE_SHA = sha(readFileSync(FILE));
if (st.source_sha256 && st.source_sha256 !== SOURCE_SHA) { console.log(`The saved run at ${STATE} deployed another contracts/embargo.py; start over with FRESH=1.`); process.exit(2); }
st.source_sha256 = SOURCE_SHA;
const save = () => {
  writeFileSync(STATE, JSON.stringify(st, null, 1));
  const { keys, ...shown } = st;       // the record carries no key
  writeFileSync(RECORD, JSON.stringify(shown, null, 1));
};
const ROLES = {
  issuer: "ISSUER, Lantern Bay Ferries, which issues the release",
  post: "POST, The Harbour Post, an outlet",
  gazette: "GAZETTE, The Bay Gazette, an outlet",
  reporter: "REPORTER, who watches the outlets' sites while the embargo holds",
  stranger: "STRANGER, who has no part in the release",
};
const NAME = { issuer: "ISSUER", post: "POST", gazette: "GAZETTE", reporter: "REPORTER", stranger: "STRANGER" };
for (const k of Object.keys(ROLES)) st.keys[k] = st.keys[k] || generatePrivateKey();
const acct = {}, client = {};
for (const k of Object.keys(ROLES)) { acct[k] = createAccount(st.keys[k]); client[k] = createClient({ chain: studionet, account: acct[k] }); }
const rd = createClient({ chain: studionet });
st.accounts = Object.fromEntries(Object.keys(ROLES).map((k) => [k, getAddress(acct[k].address)]));
const low = (k) => st.accounts[k].toLowerCase();
save();

// an id the run needs, read from a receipt; without it the run stops rather than guess
const need = (value, what) => {
  if (value === undefined || value === null || value === "") {
    ok(`the receipt carries ${what}`, false, "stopping: nothing after this step can be sent without it");
    st.checks = { pass, fail }; save();
    process.exit(1);
  }
  return value;
};

const balance = async (a) => BigInt(await rpc("eth_getBalance", [a, "latest"]) || "0x0");
const nonceOf = async (a) => Number(BigInt(await rpc("eth_getTransactionCount", [a, "latest"]) || "0x0"));
const fundOnce = async (k, whole) => {
  st.funded = st.funded || {};
  if (st.funded[k]) return;
  await rpc("sim_fundAccount", { account_address: getAddress(acct[k].address), amount: whole * 1e18 });   // checksummed
  for (let i = 0; i < 20 && (await balance(acct[k].address)) === 0n; i++) await sleep(3000);
  st.funded[k] = String(await balance(acct[k].address)); save();
};

// ---------- transactions ----------
const errText = (e) => String(e?.details || e?.shortMessage || e?.cause?.message || e?.message || e);
// A request the network refused or never received is made again. When the failure is ambiguous the
// sender's nonce says whether the transaction landed after all, and its hash is read back, so nothing
// is ever sent twice.
const sendRaw = async (who, what, make) => {
  const addr = acct[who].address;
  for (let i = 0; ; i++) {
    const n0 = await nonceOf(addr);
    try { return await make(); } catch (e) {
      const text = errText(e);
      if (i >= 8) throw e;
      console.log(`      ${what} was not taken (${text.slice(0, 70)}); looking again in 20s`);
      await sleep(20000);
      if ((await nonceOf(addr)) > n0) {
        const list = await rpc("sim_getTransactionsForAddress", [addr]);
        const hit = (list || []).find((t) => String(t.from_address).toLowerCase() === addr.toLowerCase() && Number(t.nonce) === n0);
        if (hit?.hash) return hit.hash;
        throw new Error(what + " landed but its hash could not be read back");
      }
    }
  }
};
const countVotes = (t) => { let a = 0, d = 0, idl = 0; for (const k in (t.consensus_data?.votes || {})) { const v = t.consensus_data.votes[k]; if (v === "agree") a++; else if (v === "disagree") d++; else idl++; } return { agree: a, disagree: d, idle: idl }; };
const wait = async (tx) => {
  let stuck = 0;
  for (let i = 0; i < 900; i++) {
    await sleep(4000);
    const t = await rpc("eth_getTransactionByHash", [tx]);
    if (t?.status === "FINALIZED") {
      const lr = t.consensus_data?.leader_receipt, one = Array.isArray(lr) ? lr[0] : lr;
      let msg = "";
      try { msg = Buffer.from(one.result, "base64").toString("utf8").replace(/[^\x20-\x7e]/g, " ").trim(); } catch (e) {}
      const v = countVotes(t);
      return { tx, msg, exec: one?.execution_result || "", votes: v, applied: v.agree * 2 > v.agree + v.disagree + v.idle, address: t.data?.contract_address || t.to_address || "" };
    }
    // a round no majority carried is final as it stands once it has been left alone for ten minutes
    if (t?.status === "UNDETERMINED" && (stuck = stuck + 1) > 150) return { tx, msg: "UNDETERMINED", exec: "", votes: countVotes(t), applied: false, address: "" };
    if (t?.status === "CANCELED") return { tx, msg: "CANCELED", exec: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "" };
    if (i > 0 && i % 75 === 0) console.log(`      [${stamp()}] still ${t?.status || "unknown"} after ${Math.round(i * 4 / 60)} minutes: ${tx}`);
  }
  return { tx, msg: "TIMEOUT", exec: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "" };
};
const jsonOf = (msg) => { const b = String(msg).indexOf("{"); if (b === -1) return null; try { return JSON.parse(String(msg).slice(b)); } catch (e) { return null; } };
const settleBalance = async (a, before, want) => { for (let i = 0; i < 45; i++) { const b = await balance(a); if (b - before === want) return b; await sleep(4000); } return await balance(a); };

// One step of the run: a signed transaction, its tally, what it returned, and the balances it moved.
// opt.value is what is sent with it; opt.watch names the accounts whose balances are read before and
// after; opt.expect is the change each should show once every transfer has landed, a table or a
// function of what the call returned. A step already in the saved state is not sent again.
const call = async (id, who, fn, args = [], opt = {}) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, fn, args: args.map(String), value: String(opt.value || 0n), tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    const watch = opt.watch || [];
    if (!rec.before) { rec.before = {}; for (const k of watch) rec.before[k] = String(await balance(acct[k].address)); save(); }
    let r;
    for (;;) {
      if (!rec.pending) {
        rec.pending = await sendRaw(who, fn, () => client[who].writeContract({ address: st.contract, functionName: fn, args, ...(opt.value ? { value: opt.value } : {}) }));
        save();
      }
      r = await wait(rec.pending);
      rec.tries.push({ tx: r.tx, votes: r.votes, exec: r.exec, applied: r.applied, msg: r.msg, at: stamp() });
      rec.pending = null; save();
      console.log(`      [${stamp()}] ${NAME[who]} ${fn}(${args.map((x) => String(x).slice(-30)).join(", ")})${opt.value ? " +" + Number(opt.value) / 1e18 + " GEN" : ""}  ${r.tx}  ${tally(r.votes)}  ${r.exec}`);
      if (r.msg === "TIMEOUT" || rec.tries.length >= 4) break;
      if (!r.applied) { console.log("      the validators did not carry that round (" + tally(r.votes) + "), so nothing was stored; sending it again"); continue; }
      break;
    }
    const expect = typeof opt.expect === "function" ? opt.expect(jsonOf(r.msg)) : opt.expect;
    rec.after = {}; rec.delta = {};
    for (const k of watch) {
      const before = BigInt(rec.before[k]);
      const want = expect && expect[k] !== undefined ? BigInt(expect[k]) : null;
      const now = want === null ? await balance(acct[k].address) : await settleBalance(acct[k].address, before, want);
      rec.after[k] = String(now); rec.delta[k] = String(now - before);
    }
    rec.done = true; save();
  }
  const last = rec.tries[rec.tries.length - 1];
  return { ...last, j: jsonOf(last.msg), tries: rec.tries, delta: rec.delta || {} };
};
const refused = (r, words) => r.exec === "ERROR" && r.msg.includes(words);
const moved = (r, k, want) => r.delta[k] === String(want);
const votes = (r) => r.tries.map((t) => tally(t.votes)).join(", then ");

const deploy = async (id, who) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, fn: "deploy embargo.py", args: [], value: "0", tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    const code = readFileSync(FILE);
    for (;;) {
      if (!rec.pending) { rec.pending = await sendRaw(who, "deploy", () => client[who].deployContract({ code, args: [], leaderOnly: false })); save(); }
      const r = await wait(rec.pending);
      rec.tries.push({ tx: r.tx, votes: r.votes, exec: r.exec, applied: r.applied, msg: r.msg.slice(0, 300), at: stamp() });
      rec.address = r.address; rec.pending = null; save();
      console.log(`      [${stamp()}] ${NAME[who]} deploy embargo.py  ${r.tx}  ${tally(r.votes)}  ${r.exec}  ${r.address}`);
      if (r.applied || r.msg === "TIMEOUT" || rec.tries.length >= 3) break;
    }
    rec.done = true; save();
  }
  return rec.address;
};

// ---------- reads: paced, and made again on a 429 or on "Contract not found" instead of failing ----------
let lastRead = 0;
const read = async (fn, args = []) => {
  for (let i = 0; i < 30; i++) {
    const gap = 3500 - (Date.now() - lastRead);
    if (gap > 0) await sleep(gap);
    lastRead = Date.now();
    try { return JSON.parse(String(await rd.readContract({ address: st.contract, functionName: fn, args }))); } catch (e) {
      if (i === 29) return { error: "VIEW ERROR " + fn + ": " + errText(e).slice(0, 100) };
      await sleep(/rate|429|limit/i.test(errText(e)) ? 25000 : 10000);
    }
  }
};
// a view read once for a check is kept with the run, so a continued run checks what was seen then
const seen = async (id, fn, args = []) => { if (!st.views[id]) { st.views[id] = { fn, args, at: stamp(), out: await read(fn, args) }; save(); } return st.views[id].out; };
// the chain's own clock, as a view reports it (or this machine's when a read carries none)
const chainNow = async (rid) => { const row = await read("release", [rid]); return Number(row.now > 0 ? row.now : Math.floor(Date.now() / 1000)); };
// wait, by the chain's own clock, until the embargo has lifted
const untilLifted = async (rid, until) => {
  for (;;) {
    const left = until - (await chainNow(rid));
    if (left < 0) return;
    console.log(`      [${stamp()}] waiting ${left + 20} s, by the chain clock, for the embargo on ${rid} to lift`);
    await sleep((left + 20) * 1000);
  }
};
const timeLeft = async (rid, until, what) => {
  const left = until - (await chainNow(rid));
  note(`${left} s of the embargo left by the chain clock before ${what}`);
  return left;
};

// ---------- the demonstration: one release, two outlets, the same pages as tests/test_pure.py ----------
const HEADLINE = "Lantern Bay Ferries adds a night crossing to Gull Island";
const SUMMARY = "Lantern Bay Ferries will add a night crossing to Gull Island from 1 June, the first in 30 years";
const BOND = GEN, REPORT_BOND = GEN / 50n, TENTH = REPORT_BOND / 10n;
const CREDIT = 5n * REPORT_BOND;                  // REPORTER's deposit: five reports' worth
const LEAD = 1500;                                // the embargo lifts about 25 minutes after the release is issued
const QUESTION_REPORTS = "Does the PAGE report the news in the RELEASE, the same event or announcement, in its own words or the release's? Answer yes, no or unclear.";
const QUESTION_OTHER = "Is the PAGE about something other than the news in the RELEASE, or does it only mention the issuer without reporting that announcement? Answer yes, no or unclear.";
const costOf = (j) => BigInt(j?.cost || "0");

for (const k of Object.keys(ROLES)) await fundOnce(k, 5);
if (!st.start) { st.start = {}; for (const k of Object.keys(ROLES)) st.start[k] = String(await balance(acct[k].address)); st.started = new Date().toISOString(); save(); }
console.log(`[${stamp()}] ${Object.keys(ROLES).map((k) => NAME[k].padEnd(9) + " " + st.accounts[k]).join("\n           ")}\n           POST's site ${POST_SITE}\n           GAZETTE's site ${GAZETTE_SITE}\n           state ${STATE}`);

// ================================================================ phase A
console.log(`\n[${stamp()}] ---- phase A: deploy, the release under embargo, two outlets bonded`);
st.contract = st.contract || await deploy("deploy", "issuer");
save();
console.log(`      Embargo at ${st.contract}`);
if (!st.embargoAt) { st.embargoAt = Math.floor(Date.now() / 1000) + LEAD; save(); }
const issued = await call("issueE1", "issuer", "issue", [HEADLINE, SUMMARY, st.embargoAt, String(BOND)]);
ok("ISSUER issues E1, \"Lantern Bay Ferries adds a night crossing to Gull Island\", under an embargo about 25 minutes ahead; each outlet stakes 1 GEN", issued.j?.ok === true && issued.j?.release === "E1" && issued.j?.summary === SUMMARY && issued.j?.bond === String(BOND) && issued.j?.embargo_until === st.embargoAt, `${votes(issued)}  ${issued.msg.slice(0, 120)}`);
const e1 = need(issued.j?.release, "the release id");
const UNTIL = Number(need(issued.j?.embargo_until, "the embargo instant"));
const own = await call("joinIssuer", "issuer", "join", [e1, POST_SITE], { value: BOND, watch: ["issuer"], expect: { issuer: 0n } });
ok("ISSUER may not join its own release as an outlet, and the 1 GEN comes back in the same transaction", own.exec !== "ERROR" && own.j?.ok === false && String(own.j?.reason).includes("may not join its own release") && own.j?.returned === String(BOND) && moved(own, "issuer", 0n), `${votes(own)}  ${own.j?.reason}`);
const jp = await call("joinPost", "post", "join", [e1, POST_SITE], { value: BOND, watch: ["post"], expect: { post: -BOND } });
ok(`POST joins ${e1} with 1 GEN and its prefix outlets/harbour-post/, and the receipt carries the release`, jp.j?.ok === true && jp.j?.site_prefix === POST_SITE && jp.j?.bond === String(BOND) && jp.j?.summary === SUMMARY && moved(jp, "post", -BOND), `${votes(jp)}  ${jp.msg.slice(0, 110)}`);
const jp2 = await call("joinPostAgain", "post", "join", [e1, POST_SITE], { value: BOND, watch: ["post"], expect: { post: 0n } });
ok("POST's second join is refused (one join per outlet per release) and its 1 GEN comes back", jp2.j?.ok === false && String(jp2.j?.reason).includes("has already joined " + e1) && jp2.j?.returned === String(BOND) && moved(jp2, "post", 0n), `${votes(jp2)}  ${jp2.j?.reason}`);
const SHORT = BOND - GEN / 10n;
const jgs = await call("joinGazetteShort", "gazette", "join", [e1, GAZETTE_SITE], { value: SHORT, watch: ["gazette"], expect: { gazette: 0n } });
ok("GAZETTE sends 0.9 GEN for a 1 GEN bond: refused, and the 0.9 GEN comes back", jgs.j?.ok === false && String(jgs.j?.reason).includes("send exactly the bond of " + String(BOND)) && jgs.j?.returned === String(SHORT) && moved(jgs, "gazette", 0n), `${votes(jgs)}  ${jgs.j?.reason}`);
const jg = await call("joinGazette", "gazette", "join", [e1, GAZETTE_SITE], { value: BOND, watch: ["gazette"], expect: { gazette: -BOND } });
ok(`GAZETTE joins ${e1} with 1 GEN and its prefix outlets/bay-gazette/`, jg.j?.ok === true && jg.j?.site_prefix === GAZETTE_SITE && moved(jg, "gazette", -BOND), `${votes(jg)}  ${jg.msg.slice(0, 110)}`);
const early = await call("releasePostEarly", "post", "release_bond", [e1, st.accounts.post], { watch: ["post"], expect: { post: 0n } });
ok("POST may not take its bond back while the embargo holds", refused(early, "the embargo on " + e1 + " holds until " + UNTIL) && moved(early, "post", 0n), `${votes(early)}  ${early.msg.slice(0, 140)}`);

// ================================================================ phase B
console.log(`\n[${stamp()}] ---- phase B: the reports while the embargo holds, every page read by the validators on the live web`);
const broke0 = await call("reportNoCredit", "reporter", "report", [e1, st.accounts.post, PAGE.weather]);
ok("REPORTER reports with no credit: refused before anything is fetched", refused(broke0, "this address holds 0; deposit() first"), `${votes(broke0)}  ${broke0.msg.slice(0, 140)}`);
const dep = await call("depositR", "reporter", "deposit", [], { value: CREDIT, watch: ["reporter"], expect: { reporter: -CREDIT } });
ok("REPORTER deposits 0.1 GEN of report credit", dep.j?.ok === true && dep.j?.credit === String(CREDIT) && moved(dep, "reporter", -CREDIT), `${votes(dep)}  ${dep.msg.slice(0, 100)}`);
const self = await call("reportSelf", "post", "report", [e1, st.accounts.post, PAGE.early]);
ok("POST may not report itself", refused(self, "an outlet may not report itself"), `${votes(self)}  ${self.msg.slice(0, 120)}`);
const outside = await call("reportOutside", "reporter", "report", [e1, st.accounts.post, OUTSIDE], { watch: ["post"], expect: { post: 0n } });
ok("REPORTER points at the repository's README as a POST page, outside POST's prefix: refused before any fetch, nothing taken", refused(outside, "the page is not below the site prefix " + POST_SITE) && moved(outside, "post", 0n), `${votes(outside)}  ${outside.msg.slice(0, 160)}`);
await timeLeft(e1, UNTIL, "the first report");
const r1 = await call("reportWeather", "reporter", "report", [e1, st.accounts.post, PAGE.weather], { watch: ["post"], expect: (j) => ({ post: costOf(j) }) });
ok("every validator reads weather.html (a weather column): kept, and REPORTER's 0.02 GEN goes to POST", r1.applied && r1.j?.finding === "kept" && r1.j?.cost === String(REPORT_BOND) && r1.j?.outlet_status === "bonded" && /^[0-9a-f]{16}$/.test(String(r1.j?.fp)) && moved(r1, "post", REPORT_BOND), `${votes(r1)}  ${JSON.stringify({ report: r1.j?.report, finding: r1.j?.finding, fp: r1.j?.fp, credit: r1.j?.credit })}`);
if (r1.j?.fp) note(`the stored fingerprint ${r1.j.fp}; this checkout's file collapsed gives ${fpOf(LOCAL.weather)}`);
const r2 = await call("reportFeature", "reporter", "report", [e1, st.accounts.post, PAGE.feature], { watch: ["post"], expect: (j) => ({ post: costOf(j) }) });
const featureCost = costOf(r2.j);
ok("every validator reads ferries-feature.html (the company's history, not the announcement): kept, or unclear, and POST is paid the matching part of the report bond", r2.applied && ((r2.j?.finding === "kept" && featureCost === REPORT_BOND) || (r2.j?.finding === "unclear" && featureCost === TENTH)) && r2.j?.outlet_status === "bonded" && moved(r2, "post", featureCost), `${votes(r2)}  ${JSON.stringify({ report: r2.j?.report, finding: r2.j?.finding, cost: r2.j?.cost, fp: r2.j?.fp })}`);
await timeLeft(e1, UNTIL, "the early story is reported");
const r3 = await call("reportEarly", "reporter", "report", [e1, st.accounts.post, PAGE.early], { watch: ["reporter", "issuer", "post"], expect: (j) => (j?.finding === "broken" ? { reporter: BOND / 5n, issuer: BOND - BOND / 5n, post: 0n } : {}) });
ok("every validator reads early-story.html (the night crossing, before the embargo): broken; 0.2 GEN to REPORTER, 0.8 GEN to ISSUER, REPORTER's credit untouched", r3.applied && r3.j?.finding === "broken" && r3.j?.outlet_status === "broke" && r3.j?.to_reporter === String(BOND / 5n) && r3.j?.to_issuer === String(BOND - BOND / 5n) && r3.j?.cost === "0" && r3.j?.credit === String(CREDIT - REPORT_BOND - featureCost) && moved(r3, "reporter", BOND / 5n) && moved(r3, "issuer", BOND - BOND / 5n) && moved(r3, "post", 0n), `${votes(r3)}  ${JSON.stringify({ report: r3.j?.report, finding: r3.j?.finding, fp: r3.j?.fp, to_reporter: r3.j?.to_reporter, to_issuer: r3.j?.to_issuer })}`);
if (r3.j?.fp) note(`the stored fingerprint ${r3.j.fp}; this checkout's file collapsed gives ${fpOf(LOCAL.early)}`);
const breach = need(r3.j?.report, "the id of the report that found the breach");
const again = await call("reportPostAgain", "reporter", "report", [e1, st.accounts.post, PAGE.early]);
ok("POST cannot be reported again: its bond is already paid out, refused before anything is fetched", refused(again, "already broke the embargo on " + e1 + " (report " + breach + ")"), `${votes(again)}  ${again.msg.slice(0, 140)}`);

// ================================================================ phase C
console.log(`\n[${stamp()}] ---- phase C: the embargo lifts`);
if (!st.steps.reportAfter?.done) await untilLifted(e1, UNTIL);
const late = await call("reportAfter", "reporter", "report", [e1, st.accounts.gazette, PAGE.after]);
ok("after the embargo, REPORTER reports GAZETTE's story-after.html: refused before anything is fetched; a story published after it breaks nothing", refused(late, "the embargo on " + e1 + " lifted at " + UNTIL), `${votes(late)}  ${late.msg.slice(0, 160)}`);
const grab = await call("releaseStranger", "stranger", "release_bond", [e1, st.accounts.gazette], { watch: ["stranger", "gazette"], expect: { stranger: 0n, gazette: 0n } });
ok("STRANGER may not take GAZETTE's bond", refused(grab, "only the outlet " + low("gazette") + " may take back its bond") && moved(grab, "gazette", 0n), `${votes(grab)}  ${grab.msg.slice(0, 130)}`);
const back = await call("releaseGazette", "gazette", "release_bond", [e1, st.accounts.gazette], { watch: ["gazette"], expect: { gazette: BOND } });
ok("GAZETTE kept the embargo and takes its 1 GEN back", back.j?.ok === true && back.j?.status === "released" && back.j?.paid === String(BOND) && moved(back, "gazette", BOND), `${votes(back)}  ${back.msg.slice(0, 120)}`);
const twice = await call("releaseGazetteAgain", "gazette", "release_bond", [e1, st.accounts.gazette], { watch: ["gazette"], expect: { gazette: 0n } });
ok("GAZETTE's second release_bond is refused: a bond is paid out once", refused(twice, "took its bond on " + e1 + " back already") && moved(twice, "gazette", 0n), `${votes(twice)}  ${twice.msg.slice(0, 120)}`);
const lost = await call("releasePost", "post", "release_bond", [e1, st.accounts.post], { watch: ["post"], expect: { post: 0n } });
ok("POST cannot take back a bond it lost", refused(lost, "broke the embargo on " + e1 + " (report " + breach + ")") && moved(lost, "post", 0n), `${votes(lost)}  ${lost.msg.slice(0, 140)}`);

// ================================================================ phase D
console.log(`\n[${stamp()}] ---- phase D: the code read back, the views, the credit, the balances`);
{
  const file = readFileSync(FILE);
  const chain = Buffer.from(String(await rpc("gen_getContractCode", [st.contract])), "base64");
  st.code = { address: st.contract, bytes: chain.length, sha256: sha(chain), file_bytes: file.length, file_sha256: sha(file), identical: Buffer.compare(chain, file) === 0 };
  save();
  ok(`the code deployed at ${st.contract} is byte for byte contracts/embargo.py`, st.code.identical, `${chain.length} bytes, sha256 ${st.code.sha256}`);
  const rel = await seen("release1", "release", [e1]);
  const rec = rel.record || {};
  ok(`release(${e1}) reads lifted: two outlets, one broke the embargo, one took its bond back, nothing held`, rel.phase === "lifted" && rel.held === "0" && rec.outlets === 2 && rec.broken === 1 && rec.released === 1 && rec.reports === 3 && rec.to_issuer === String(BOND - BOND / 5n) && rec.to_reporters === String(BOND / 5n) && rec.fees_to_outlets === String(REPORT_BOND + featureCost), JSON.stringify({ phase: rel.phase, record: rec }));
  const outs = await seen("outlets1", "outlets_of", [e1, 0, 20]);
  ok(`outlets_of(${e1}) lists POST as having broken the embargo in ${breach} and GAZETTE as released, with their prefixes`, outs.total === 2 && outs.rows?.[0]?.outlet === low("post") && outs.rows?.[0]?.status === "broke" && outs.rows?.[0]?.broke_the_embargo === true && outs.rows?.[0]?.broke_report === breach && outs.rows?.[0]?.site_prefix === POST_SITE && outs.rows?.[1]?.outlet === low("gazette") && outs.rows?.[1]?.status === "released", JSON.stringify((outs.rows || []).map((o) => [o.outlet.slice(0, 8), o.status, o.broke_report])));
  const one = await seen("outletPost", "outlet", [e1, st.accounts.post]);
  ok(`outlet(${e1}, POST) finds POST with its address in any letter case`, one.outlet === low("post") && one.can_release === false && one.reports === 3 && one.fees_won === String(REPORT_BOND + featureCost), JSON.stringify({ status: one.status, reports: one.reports, fees_won: one.fees_won }));
  const reps = await seen("reports1", "reports_of", [e1, 0, 20]);
  ok(`reports_of(${e1}) lists the three reports with the page, the finding, the fingerprint and where the money went`, reps.total === 3 && reps.rows?.[0]?.url === PAGE.weather && reps.rows?.[0]?.finding === "kept" && reps.rows?.[0]?.to_outlet === String(REPORT_BOND) && reps.rows?.[1]?.url === PAGE.feature && reps.rows?.[2]?.url === PAGE.early && reps.rows?.[2]?.finding === "broken" && reps.rows?.[2]?.to_reporter === String(BOND / 5n) && reps.rows?.[2]?.to_issuer === String(BOND - BOND / 5n) && reps.rows?.[2]?.fp === r3.j?.fp && reps.rows?.[2]?.reporter === low("reporter"), JSON.stringify((reps.rows || []).map((r) => [r.report, r.finding, r.cost, r.to_reporter, r.to_issuer])));
  const stats = await seen("stats", "stats", []);
  ok("stats(): one release, two joins, three reports, one breach, one bond back, three refused payments returned", stats.releases === 1 && stats.joins === 2 && stats.reports === 3 && stats.broken === 1 && stats.released === 1 && stats.held === "0" && stats.to_issuers === String(BOND - BOND / 5n) && stats.to_reporters === String(BOND / 5n) && stats.refused_payments === 3 && stats.returned === String(2n * BOND + SHORT), JSON.stringify(stats));
  const rules = await seen("rules", "rules", []);
  ok("rules() publishes the questions word for word, the comparison, the combine table and the limits", String(rules.report?.askings?.[0]).startsWith("1, blocks RELEASE then PAGE: " + QUESTION_REPORTS) && String(rules.report?.askings?.[2]).startsWith("3, blocks RELEASE then PAGE: " + QUESTION_OTHER) && rules.report?.combine?.broken === "REPORTS yes in both orders and OTHER no in both orders" && String(rules.compared).includes("exact equality") && String(rules.limits?.secret).includes("only a digest"), "");
  const back2 = CREDIT - REPORT_BOND - featureCost;
  const w = await call("withdrawR", "reporter", "withdraw", [], { watch: ["reporter"], expect: { reporter: back2 } });
  ok(`REPORTER takes its ${Number(back2) / 1e18} GEN of credit back`, w.j?.withdrawn === String(back2) && moved(w, "reporter", back2), `${votes(w)}  ${w.msg.slice(0, 100)}`);
  ok("the contract's own balance is zero", (await balance(st.contract)) === 0n, String(await balance(st.contract)));
  st.end = {}; for (const k of Object.keys(ROLES)) st.end[k] = String(await balance(acct[k].address));
  st.ended = new Date().toISOString(); save();
  const net = (k) => BigInt(st.end[k]) - BigInt(st.start[k]);
  const want = { issuer: BOND - BOND / 5n, post: -BOND + REPORT_BOND + featureCost, gazette: 0n, reporter: BOND / 5n - REPORT_BOND - featureCost, stranger: 0n };
  ok("every account ends where the money says: ISSUER up 0.8 GEN, POST down its bond less the report bonds it won, GAZETTE and STRANGER even, REPORTER up its 20% less what its wrong reports cost", Object.keys(want).every((k) => net(k) === want[k]), Object.keys(want).map((k) => NAME[k] + " " + Number(net(k)) / 1e18).join("  "));
}

st.checks = { pass, fail }; save();
console.log(`\n${pass} passed, ${fail} failed`);
console.log(`Embargo: ${st.contract}  ${EXPLORER}/address/${st.contract}`);
console.log("transactions:", st.order.reduce((n, id) => n + st.steps[id].tries.length, 0), "in", st.order.length, "steps; sent a second time:", st.order.filter((id) => st.steps[id].tries.length > 1).join(", ") || "none");
for (const id of st.order) { const s = st.steps[id]; console.log(`${id.padEnd(20)} ${s.tries.map((t) => t.tx + " " + tally(t.votes) + " " + t.exec).join(" | ")}`); }
console.log("record:", RECORD);
process.exit(fail ? 1 : 0);
