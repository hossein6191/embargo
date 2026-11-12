"use client";

// One release on the wire: the wire item with its live countdown, the telex notice for where it stands
// and who is looking, the subscriber lines, the report desk (credit, deposit, the report with one-click
// pages, the validators at work, the bulletin it prints), the outlet's own key to take its bond back,
// and every report as a wire bulletin. /release shows the demo release with it; /release/[id] any one.

import * as React from "react";

import { Notice } from "@/components/notice";
import { Key } from "@/components/keycap";
import { Placeholder, ReadError } from "@/components/read-state";
import { Suggest } from "@/components/suggest";
import { TxRail } from "@/components/tx-rail";
import { TxStage } from "@/components/tx-stage";
import { useDemoStatus } from "@/components/use-demo";
import { useMe } from "@/components/use-me";
import { useNow } from "@/components/use-now";
import { useAfterTx, useRead } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { WalletGate } from "@/components/wallet-gate";
import { Bulletin, Subscribers, WireItem, nameFrom } from "@/components/wire";
import { calls, isMock, readCredit, readOutlets, readRelease, readReports, reportOutcome, requestDemoJoin } from "@/lib/chain";
import { gen } from "@/lib/format";
import { guide, sendingGuide, signGuide, deskGuide, type Role, type State } from "@/lib/guide";
import { DEPOSIT_CHIPS, reportChips } from "@/lib/suggestions";
import { REPORT_BOND, pageProblem, pyStrip, sentence, under } from "@/lib/rules";
import type { DemoAnswer, DemoStatus, OutletRow, Release, ReportRow } from "@/lib/types";

type Loaded = { release: Release | null; outlets: OutletRow[]; reports: ReportRow[] };

async function loadAll(id: string): Promise<{ data: Loaded; source: "chain" | "mock" }> {
  const r = await readRelease(id);
  if (!r.data) return { data: { release: null, outlets: [], reports: [] }, source: r.source };
  const [o, p] = await Promise.all([readOutlets(id), readReports(id)]);
  return { data: { release: r.data, outlets: o.data.rows, reports: p.data.rows }, source: r.source };
}

/** The names the wire prints for the demo desk's accounts. */
export function knownNames(s: DemoStatus | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s) return out;
  if (s.issuer) out[s.issuer] = "Lantern Bay Ferries";
  for (const o of s.outlets) out[o.address] = o.name;
  return out;
}

export function ReleaseDesk({ id }: { id: string }) {
  const me = useMe();
  const now = useNow();
  const demo = useDemoStatus();
  const read = useRead<Loaded>(() => loadAll(id), [id]);
  useAfterTx(read.refresh);
  const names = React.useMemo(() => knownNames(demo.data), [demo.data]);
  const name = nameFrom(names, me.address);

  if (read.loading) return <Placeholder lines={5} />;
  if (read.error) return <ReadError error={read.error} retry={read.retry} />;
  const r = read.data?.release;
  if (!r) return <p className="mono py-6 text-[14px]">NO RELEASE {id} ON THE WIRE. Check the id on the ledger.</p>;
  const outlets = read.data!.outlets;
  const reports = read.data!.reports;

  const held = now ? now < r.embargoUntil : r.phase === "embargoed";
  const left = now ? Math.max(0, r.embargoUntil - now) : r.secondsLeft;
  const mine = outlets.find((o) => o.outlet === me.address) ?? null;
  const role: Role = !me.address ? "reader" : me.address === r.issuer ? "issuer" : mine ? "outlet" : "reporter";
  const state: State = held ? "embargoed" : role === "outlet" && mine?.status === "released" ? "released" : "lifted";
  const issuerName = names[r.issuer] ? `${names[r.issuer]} · demo issuer` : `Issuer ${name(r.issuer)}`;
  const demoMissing = !!demo.data?.online && held && left > 180 && demo.data.outlets.some((o) => !outlets.some((x) => x.outlet === o.address)) && r.issuer !== "";

  return (
    <div className="flex flex-col gap-6">
      <WireItem r={r} issuerName={issuerName} />
      <Notice
        g={guide({ state, role, release: r.id, bondAtto: mine?.bondAtto ?? r.bondAtto, embargoUntil: r.embargoUntil, secondsLeft: held ? left : 0, outletStatus: mine?.status, outlet: mine ? "you" : undefined, mock: isMock })}
      />

      <section aria-labelledby="subs">
        <h2 id="subs" className="slug text-[13px] text-ink">
          Subscribers · {outlets.length}
        </h2>
        <div className="mt-1">
          <Subscribers rows={outlets} name={name} me={me.address} />
        </div>
        {demoMissing && <DemoJoin release={r.id} />}
      </section>

      {mine && <OutletKeys r={r} o={mine} />}

      {held ? (
        <ReportDesk r={r} outlets={outlets} name={name} />
      ) : (
        <p className="mono border-2 border-blue bg-blue-wash px-3 py-2 text-[13px] text-blue-deep">REPORTS CLOSED. The embargo lifted at its stated instant; a story published from then on breaks nothing.</p>
      )}

      <section aria-labelledby="bulletins">
        <h2 id="bulletins" className="slug text-[13px] text-ink">
          Wire bulletins · {reports.length}
        </h2>
        {reports.length === 0 ? (
          <p className="mono mt-2 text-[13px] text-ink-2">NO REPORTS ON {r.id} YET.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {reports.map((p) => (
              <Bulletin key={p.id} p={p} name={name} />
            ))}
          </div>
        )}
      </section>
      <CreditKeys />
    </div>
  );
}

/** The demo outlets join a release they have not joined (a visitor's, or the demo release mid-way). */
export function DemoJoin({ release }: { release: string }) {
  const [answer, setAnswer] = React.useState<DemoAnswer | null>(null);
  const [asking, setAsking] = React.useState(false);
  const ask = async () => {
    setAsking(true);
    setAnswer(await requestDemoJoin(release));
    setAsking(false);
  };
  return (
    <div className="mt-3 flex flex-col gap-2.5">
      {!answer?.ok && (
        <Key tone="blue" disabled={asking} onClick={() => void ask()} className="key-wrap self-start">
          {asking ? "Asking the demo desk…" : "Have the demo outlets join"}
        </Key>
      )}
      {asking && <Notice g={deskGuide("join", release, isMock)} />}
      {answer && !answer.ok && (
        <p role="alert" className="border-2 border-red bg-red-wash px-3 py-2 text-[14px] text-red-deep">
          {answer.reason}
        </p>
      )}
      {answer?.ok && answer.hashes.map((h) => <TxRail key={h.hash} hash={h.hash} label={h.label} />)}
    </div>
  );
}

/** The outlet's own key: its bond back from the lift, unless it broke the embargo. */
function OutletKeys({ r, o }: { r: Release; o: OutletRow }) {
  const tx = useTx();
  const now = useNow();
  const can = o.status === "bonded" && (now ? now >= r.embargoUntil : o.canRelease);
  return (
    <section aria-labelledby="your-place" className="border-2 border-ink bg-paper-2 p-3">
      <h2 id="your-place" className="slug text-[13px] text-ink">
        Your place on {r.id} · {o.status === "bonded" ? "bond held" : o.status === "broke" ? "broke the embargo" : "bond back"}
      </h2>
      <p className="mt-1 text-[14.5px]">
        You joined with {gen(o.bondAtto)} and the prefix <span className="mono break-all">{o.sitePrefix}</span>.
      </p>
      {o.status === "bonded" && (
        <Key tone="blue" className="mt-3" disabled={!can || tx.sending || (!!tx.hash && !tx.final)} onClick={() => void tx.start(calls.releaseBond(r.id, o.outlet))}>
          {can ? `Take back my ${gen(o.bondAtto)}` : "Bond locked until the lift"}
        </Key>
      )}
      <TxStage
        className="mt-3"
        tx={tx}
        label={`release_bond on ${r.id}`}
        sign={signGuide({ fn: "release_bond", label: `take back your ${gen(o.bondAtto)} bond on ${r.id}`, mock: isMock })}
        sending={sendingGuide({ fn: "release_bond", label: `your bond back on ${r.id}`, mock: isMock })}
      />
    </section>
  );
}

/** The reporter's credit: deposit with one-click amounts, the balance, withdraw. */
function CreditKeys() {
  const me = useMe();
  const credit = useRead(() => readCredit(me.address), [me.address], { enabled: !!me.address });
  useAfterTx(credit.refresh);
  const tx = useTx();
  const [amount, setAmount] = React.useState<bigint>(REPORT_BOND * 5n);
  if (!me.address) return null;
  const have = BigInt(credit.data?.creditAtto ?? "0");
  return (
    <section aria-labelledby="credit" className="border-t-2 border-ink pt-3">
      <h2 id="credit" className="slug text-[13px] text-ink">
        Report credit
      </h2>
      <p className="mono mt-1 text-[14px]">
        {credit.loading ? "reading…" : credit.error ? "could not reach the network" : `${gen(have)} on the contract · covers ${credit.data?.reports ?? 0} report${credit.data?.reports === 1 ? "" : "s"}`}
      </p>
      <Suggest label="Deposit amount" chips={DEPOSIT_CHIPS} onPick={setAmount} isOn={(v) => v === amount} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Key disabled={tx.sending || (!!tx.hash && !tx.final)} onClick={() => void tx.start(calls.deposit(amount))}>
          Deposit {gen(amount)}
        </Key>
        {have > 0n && (
          <Key disabled={tx.sending || (!!tx.hash && !tx.final)} onClick={() => void tx.start(calls.withdraw())}>
            Withdraw {gen(have)}
          </Key>
        )}
      </div>
      <TxStage
        className="mt-3"
        tx={tx}
        label={tx.call?.fn === "withdraw" ? "withdraw" : "deposit"}
        sign={signGuide({ fn: tx.call?.fn === "withdraw" ? "withdraw" : "deposit", label: tx.call?.fn === "withdraw" ? "withdraw your report credit" : `deposit ${gen(amount)} of report credit`, valueAtto: amount.toString(), mock: isMock })}
        sending={sendingGuide({ fn: tx.call?.fn === "withdraw" ? "withdraw" : "deposit", label: tx.call?.fn === "withdraw" ? "your credit back" : `${gen(amount)} of report credit`, valueAtto: amount.toString(), mock: isMock })}
      />
    </section>
  );
}

/** The report: an outlet, a page below its prefix, one signature, the validators at work, the bulletin. */
function ReportDesk({ r, outlets, name }: { r: Release; outlets: OutletRow[]; name: (a: string) => string }) {
  const me = useMe();
  const now = useNow();
  const credit = useRead(() => readCredit(me.address), [me.address], { enabled: !!me.address });
  useAfterTx(credit.refresh);
  const open = outlets.filter((o) => o.status === "bonded" && o.outlet !== me.address);
  const [pick, setPick] = React.useState("");
  // The address belongs to the outlet it was typed for: when that outlet leaves the list, the field clears.
  const [entry, setEntry] = React.useState({ outlet: "", url: "" });
  const outlet = open.find((o) => o.outlet === pick) ?? open[0] ?? null;
  const url = outlet && entry.outlet === outlet.outlet ? entry.url : "";
  const setUrl = (v: string) => setEntry({ outlet: outlet?.outlet ?? "", url: v });
  const tx = useTx();
  const done = reportOutcome(tx.final);
  const busy = tx.sending || (!!tx.hash && !tx.final);
  const page = pyStrip(url);
  const problem = !outlet ? "" : !page ? "" : pageProblem(page) ? sentence(pageProblem(page)) : !under(page, outlet.sitePrefix) ? sentence(`the page is not below the site prefix ${outlet.sitePrefix} that ${outlet.outlet} named for ${r.id}; only pages below it count`) : "";
  const have = BigInt(credit.data?.creditAtto ?? "0");
  const short = !!me.address && credit.data !== null && have < REPORT_BOND;
  const outletLabel = outlet ? name(outlet.outlet) : "the outlet";

  return (
    <section aria-labelledby="report" className="border-2 border-red p-3 sm:p-4">
      <h2 id="report" className="hold text-[15px]">
        Report a page · while the embargo holds
      </h2>
      <p className="mt-1 text-[14.5px] text-ink-2">
        Point at a page below an outlet&apos;s prefix. Every validator fetches it and asks whether it reports this release. Broken pays you 20% of the outlet&apos;s bond; a wrong
        accusation costs {gen(REPORT_BOND)} of your credit.
      </p>
      {open.length === 0 ? (
        <p className="mono mt-3 text-[13px]">NO OUTLET ON {r.id} CAN BE REPORTED NOW (none is bonded, or the only one is you).</p>
      ) : (
        <>
          <p className="label mt-4">Outlet</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Outlet">
            {open.map((o) => (
              <button
                key={o.outlet}
                type="button"
                className="chip"
                aria-pressed={outlet?.outlet === o.outlet}
                onClick={() => {
                  setPick(o.outlet);
                  setEntry({ outlet: o.outlet, url: "" });
                }}
              >
                {name(o.outlet)}
              </button>
            ))}
          </div>
          {outlet && (
            <>
              <label htmlFor="page-url" className="label mt-4">
                Page address, below <span className="break-all normal-case">{outlet.sitePrefix}</span>
              </label>
              <input id="page-url" className="field" inputMode="url" autoComplete="off" spellCheck={false} placeholder={outlet.sitePrefix + "…"} value={url} onChange={(e) => setUrl(e.target.value)} />
              <Suggest label="Pages" chips={reportChips(outlet.sitePrefix)} onPick={setUrl} isOn={(v) => v === page} />
              {problem && <p className="mt-2 text-[13.5px] text-red-deep">{problem}</p>}
              {short && <p className="mt-2 text-[13.5px] text-red-deep">A report needs {gen(REPORT_BOND)} of report credit; deposit some below first.</p>}
              <WalletGate>
                <Key tone="red" className="mt-3" disabled={!page || !!problem || busy || short} onClick={() => void tx.start(calls.report(r.id, outlet.outlet, page))}>
                  File report on {outletLabel}
                </Key>
              </WalletGate>
            </>
          )}
        </>
      )}
      <TxStage
        className="mt-4"
        tx={tx}
        judged
        label={`report on ${r.id}`}
        sign={signGuide({ fn: "report", label: `report a page of ${outletLabel} against ${r.id}`, mock: isMock })}
        sending={guide({ state: "reading", role: "reporter", release: r.id, outlet: outletLabel, bondAtto: outlet?.bondAtto ?? r.bondAtto, mock: isMock })}
      />
      {done && (
        <div className="mt-4 flex flex-col gap-3">
          <Bulletin
            fresh
            name={name}
            p={{ id: done.report, release: done.release, outlet: done.outlet, reporter: me.address, url: done.url, finding: done.finding, fp: done.fp, repeatOf: done.repeatOf, costAtto: done.costAtto, toOutletAtto: done.toOutletAtto, toReporterAtto: done.toReporterAtto, toIssuerAtto: done.toIssuerAtto, at: now }}
          />
          <Notice g={guide({ state: done.finding, role: "reporter", release: done.release, outlet: name(done.outlet), bondAtto: outlet?.bondAtto ?? r.bondAtto, creditAtto: done.creditAtto, repeat: !!done.repeatOf, embargoUntil: r.embargoUntil, secondsLeft: done.finding === "broken" ? 0 : Math.max(0, r.embargoUntil - now), mock: isMock })} />
        </div>
      )}
    </section>
  );
}
