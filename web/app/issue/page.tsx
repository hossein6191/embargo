"use client";

// Issue a release: a headline and a summary, the instant its embargo lifts and each outlet's bond,
// every field with one-click suggestions and checked against the contract's limits before anything is
// signed. Once it is on the wire, one key invites the two demo outlets to join it.

import * as React from "react";
import Link from "next/link";

import { Key } from "@/components/keycap";
import { DemoJoin } from "@/components/release-desk";
import { Suggest } from "@/components/suggest";
import { TxStage } from "@/components/tx-stage";
import { useDemoStatus } from "@/components/use-demo";
import { useNow } from "@/components/use-now";
import { useTx } from "@/components/use-tx";
import { WalletGate } from "@/components/wallet-gate";
import { calls, isMock, issuedRelease, releasePath } from "@/lib/chain";
import { gen, localClock, parseGen, span, utcClock } from "@/lib/format";
import { sendingGuide, signGuide } from "@/lib/guide";
import { MAX_HEADLINE, MAX_SUMMARY, MIN_LEAD, bondProblem, headlineProblem, leadProblem, pyLen, pyStrip, sentence, summaryProblem } from "@/lib/rules";
import { BOND_CHIPS, LEAD_CHIPS, RELEASE_CHIPS } from "@/lib/suggestions";

export default function IssuePage() {
  const now = useNow();
  const demo = useDemoStatus();
  const tx = useTx();
  const [headline, setHeadline] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [minutes, setMinutes] = React.useState("30");
  const [bond, setBond] = React.useState("0.1");
  const [touched, setTouched] = React.useState(false);

  const lead = Math.round(Number(minutes) * 60);
  const bondAtto = parseGen(bond);
  const until = now ? now + (Number.isFinite(lead) ? lead : 0) : 0;
  const problems = [
    headlineProblem(headline),
    summaryProblem(summary),
    bondAtto === null ? "the bond is a number of GEN, such as 0.1" : bondProblem(bondAtto),
    !Number.isFinite(lead) || lead <= 0 ? "the embargo lifts a number of minutes from now" : lead < MIN_LEAD + 120 ? "the embargo lifts at least 22 minutes ahead here, so the transaction lands more than twenty minutes before it" : leadProblem(until, now),
  ].filter(Boolean);
  const issued = issuedRelease(tx.final);
  const busy = tx.sending || (!!tx.hash && !tx.final);

  const send = () => {
    setTouched(true);
    if (problems.length || bondAtto === null || !now) return;
    void tx.start(calls.issue(pyStrip(headline), pyStrip(summary), now + lead, bondAtto));
  };

  return (
    <div className="flex flex-col gap-6 pt-2">
      <header>
        <p className="slug">For issuers</p>
        <h1 className="mt-1 text-[32px] sm:text-[40px]">Issue a release under embargo</h1>
        <p className="mt-2 max-w-[62ch] text-[15.5px] text-ink-2">
          Whoever signs is the issuer. The headline, the summary, the embargo and the bond are fixed for good once issued, and nothing is paid to issue. On a chain nothing is secret: the summary is public from
          the moment it lands, so keep this to demonstration news.
        </p>
      </header>

      <section className="flex flex-col gap-5 border-2 border-ink bg-[#fffdf3] p-3 sm:p-4">
        <div>
          <label htmlFor="headline" className="label">
            Headline <span className="text-ink-3">({pyLen(pyStrip(headline))}/{MAX_HEADLINE})</span>
          </label>
          <input id="headline" className="field" value={headline} maxLength={MAX_HEADLINE + 20} onChange={(e) => setHeadline(e.target.value)} placeholder="Lantern Bay Ferries adds a night crossing" />
          <Suggest
            label="Release suggestions"
            chips={RELEASE_CHIPS}
            isOn={(v) => v.headline === headline && v.summary === summary}
            onPick={(v) => {
              setHeadline(v.headline);
              setSummary(v.summary);
            }}
          />
        </div>
        <div>
          <label htmlFor="summary" className="label">
            Summary of the news <span className="text-ink-3">({pyLen(pyStrip(summary))}/{MAX_SUMMARY})</span>
          </label>
          <textarea id="summary" className="field" value={summary} maxLength={MAX_SUMMARY + 40} onChange={(e) => setSummary(e.target.value)} placeholder="What the issuer will do, has done or has decided, in one or two sentences." />
          <p className="mt-1 text-[13px] text-ink-2">Printable ASCII on one line. The validators judge every reported page against this headline and summary.</p>
        </div>
        <div>
          <label htmlFor="minutes" className="label">
            Embargo lifts in (minutes)
          </label>
          <input id="minutes" className="field sm:max-w-[12rem]" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          <Suggest label="Embargo suggestions" chips={LEAD_CHIPS} isOn={(v) => v === lead} onPick={(v) => setMinutes(String(v / 60))} />
          {now > 0 && Number.isFinite(lead) && lead > 0 && (
            <p className="lockline mt-2 text-[13px]">
              HOLD FOR RELEASE UNTIL {utcClock(until)} UTC · {localClock(until)} your time · in {span(lead)}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="bond" className="label">
            Each outlet&apos;s bond (GEN)
          </label>
          <input id="bond" className="field sm:max-w-[12rem]" inputMode="decimal" value={bond} onChange={(e) => setBond(e.target.value)} />
          <Suggest label="Bond suggestions" chips={BOND_CHIPS} isOn={(v) => v === bondAtto} onPick={(v) => setBond(gen(v).replace(" GEN", ""))} />
          <p className="mt-1 text-[13px] text-ink-2">0.05 to 20 GEN. The demo outlets join releases whose bond is at most 1 GEN.</p>
        </div>
        {touched && problems.length > 0 && (
          <ul role="alert" className="list-disc pl-5 text-[14px] text-red-deep">
            {problems.map((p) => (
              <li key={p}>{sentence(p)}</li>
            ))}
          </ul>
        )}
        <WalletGate>
          <Key tone="red" disabled={busy} onClick={send} className="self-start">
            Issue under embargo
          </Key>
        </WalletGate>
        <TxStage
          tx={tx}
          label="issue"
          sign={signGuide({ fn: "issue", label: `issue "${pyStrip(headline).slice(0, 60)}" under embargo`, mock: isMock })}
          sending={sendingGuide({ fn: "issue", label: "your release", mock: isMock })}
        />
      </section>

      {issued && (
        <section className="feed-in border-2 border-blue bg-blue-wash p-4">
          <p className="slug text-blue">On the wire · {issued}</p>
          <p className="mt-1 text-[15px]">
            {issued} is issued and under embargo. Outlets can join it until it lifts. Invite the two demo outlets to join it, each with a bond and its pinned prefix, and then report them, or watch who does.
          </p>
          {demo.data?.online ? <DemoJoin release={issued} /> : <p className="mt-2 text-[14px] text-ink-2">The demo desk is away ({demo.data?.reason || "asking"}), so the demo outlets cannot join now.</p>}
          <p className="mt-3">
            <Link className="link mono text-[14px]" href={releasePath(issued)}>
              Open {issued} on the wire →
            </Link>
          </p>
        </section>
      )}
    </div>
  );
}
