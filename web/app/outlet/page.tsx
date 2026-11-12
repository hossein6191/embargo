"use client";

// For outlets: pick a release (the demo release or any one still under embargo), post exactly its bond
// and name the prefix of your own site, then take the bond back once the embargo lifts, unless a page
// below your prefix was found reporting the story first.

import * as React from "react";
import Link from "next/link";

import { Key } from "@/components/keycap";
import { Notice } from "@/components/notice";
import { Placeholder, ReadError } from "@/components/read-state";
import { Suggest } from "@/components/suggest";
import { TxStage } from "@/components/tx-stage";
import { useDemoStatus } from "@/components/use-demo";
import { useMe } from "@/components/use-me";
import { useNow } from "@/components/use-now";
import { useAfterTx, useRead } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { WalletGate } from "@/components/wallet-gate";
import { calls, isMock, paidOutcome, readOutlet, readRelease, readReleasesWindow, releasePath } from "@/lib/chain";
import { MOCK_COMMIT, MOCK_REPO } from "@/lib/chain-mock";
import { REPO_URL, outletsCommit, repoOf } from "@/lib/config";
import { countdown, gen, utcClock } from "@/lib/format";
import { guide, sendingGuide, signGuide } from "@/lib/guide";
import { parseReleaseId, prefixProblem, pyStrip, sentence } from "@/lib/rules";
import { prefixChips } from "@/lib/suggestions";

export default function OutletPage() {
  const me = useMe();
  const now = useNow();
  const demo = useDemoStatus();
  const [raw, setRaw] = React.useState("");
  const recent = useRead(() => readReleasesWindow(1), []);
  useAfterTx(recent.refresh);
  const fallback = demo.data?.release || recent.data?.rows[0]?.id || "";
  const id = parseReleaseId(raw) || (raw ? "" : fallback);

  const chips = [
    ...(demo.data?.release ? [{ label: `${demo.data.release} · demo release`, value: demo.data.release }] : []),
    ...(recent.data?.rows ?? [])
      .filter((r) => r.id !== demo.data?.release && now > 0 && r.embargoUntil > now)
      .slice(0, 4)
      .map((r) => ({ label: r.id, value: r.id, tag: `lifts ${utcClock(r.embargoUntil)} UTC` })),
  ];

  return (
    <div className="flex flex-col gap-6 pt-2">
      <header>
        <p className="slug">For outlets</p>
        <h1 className="mt-1 text-[32px] sm:text-[40px]">Receive a release under embargo</h1>
        <p className="mt-2 max-w-[62ch] text-[15.5px] text-ink-2">
          Post exactly the release&apos;s bond and name one https prefix ending in /, below which your stories go up. Everything below it counts as yours, so name a folder only you publish under: no
          comments, no reader pages. The bond comes back at the lift, unless a page below the prefix is found reporting the story first.
        </p>
      </header>
      <section>
        <label htmlFor="release-id" className="label">
          Release
        </label>
        <input id="release-id" className="field sm:max-w-[14rem]" value={raw} placeholder={fallback || "E1"} onChange={(e) => setRaw(e.target.value)} />
        <Suggest label="Releases" chips={chips} onPick={setRaw} isOn={(v) => v === id} />
      </section>
      {id ? <OutletDesk key={id + me.address} id={id} /> : raw ? <p className="mono text-[13px] text-red-deep">THAT IS NOT A RELEASE ID (E1, E2 …).</p> : null}
    </div>
  );
}

function OutletDesk({ id }: { id: string }) {
  const me = useMe();
  const now = useNow();
  const release = useRead(() => readRelease(id), [id]);
  const place = useRead(() => readOutlet(id, me.address), [id, me.address], { enabled: !!me.address });
  useAfterTx(release.refresh);
  useAfterTx(place.refresh);
  const tx = useTx();
  const [prefix, setPrefix] = React.useState("");
  const repo = isMock ? MOCK_REPO : repoOf(REPO_URL);
  const commit = isMock ? MOCK_COMMIT : outletsCommit();

  if (release.loading) return <Placeholder lines={3} />;
  if (release.error) return <ReadError error={release.error} retry={release.retry} />;
  const r = release.data;
  if (!r) return <p className="mono text-[14px]">NO RELEASE {id} ON THE WIRE.</p>;
  const held = now ? now < r.embargoUntil : r.phase === "embargoed";
  const left = now ? Math.max(0, r.embargoUntil - now) : r.secondsLeft;
  const o = place.data;
  const joinOutcome = tx.call?.fn === "join" ? paidOutcome(tx.final) : { kind: "unknown" as const };
  const p = pyStrip(prefix);
  const problem = p ? prefixProblem(p) : "";
  const busy = tx.sending || (!!tx.hash && !tx.final);
  const isIssuer = !!me.address && me.address === r.issuer;

  return (
    <section className="flex flex-col gap-4 border-2 border-ink bg-[#fffdf3] p-3 sm:p-4">
      <div>
        <p className="slug">
          {r.id} · bond {gen(r.bondAtto)} · {held ? `hold until ${utcClock(r.embargoUntil)} UTC · T-${countdown(left)}` : `lifted ${utcClock(r.embargoUntil)} UTC`}
        </p>
        <h2 className="mt-1 text-[24px]">
          <Link href={releasePath(r.id)} className="hover:text-blue">
            {r.headline}
          </Link>
        </h2>
      </div>

      {o ? (
        <>
          <Notice g={guide({ state: held ? "embargoed" : o.status === "released" ? "released" : "lifted", role: "outlet", release: r.id, bondAtto: o.bondAtto, embargoUntil: r.embargoUntil, secondsLeft: held ? left : 0, outletStatus: o.status, mock: isMock })} />
          <p className="mono text-[13px] break-all">YOUR PREFIX {o.sitePrefix}</p>
          {o.status === "bonded" && (
            <WalletGate>
              <Key tone="blue" className="self-start" disabled={held || busy} onClick={() => void tx.start(calls.releaseBond(r.id, o.outlet))}>
                {held ? "Bond locked until the lift" : `Take back my ${gen(o.bondAtto)}`}
              </Key>
            </WalletGate>
          )}
        </>
      ) : isIssuer ? (
        <p className="text-[15px]">You issued {r.id}; an issuer may not join its own release as an outlet. Switch to another wallet to play an outlet.</p>
      ) : !held ? (
        <p className="text-[15px]">The embargo on {r.id} has lifted; outlets join only while it holds. Pick a release still under embargo.</p>
      ) : (
        <>
          <div>
            <label htmlFor="prefix" className="label">
              Your site prefix
            </label>
            <input id="prefix" className="field" inputMode="url" spellCheck={false} autoComplete="off" value={prefix} placeholder="https://yournews.example/news/" onChange={(e) => setPrefix(e.target.value)} />
            <Suggest label="Prefix suggestions" chips={prefixChips(repo, commit)} onPick={setPrefix} isOn={(v) => v === p} />
            {problem && <p className="mt-2 text-[13.5px] text-red-deep">{sentence(problem)}</p>}
          </div>
          <WalletGate>
            <Key tone="red" className="self-start" disabled={!p || !!problem || busy} onClick={() => void tx.start(calls.join(r.id, p, BigInt(r.bondAtto)))}>
              Join with {gen(r.bondAtto)}
            </Key>
          </WalletGate>
        </>
      )}
      <TxStage
        tx={tx}
        label={tx.call?.fn === "release_bond" ? `release_bond on ${r.id}` : `join ${r.id}`}
        sign={signGuide({ fn: tx.call?.fn === "release_bond" ? "release_bond" : "join", label: tx.call?.fn === "release_bond" ? `take back your bond on ${r.id}` : `join ${r.id} with ${gen(r.bondAtto)}`, valueAtto: r.bondAtto, mock: isMock })}
        sending={sendingGuide({ fn: tx.call?.fn === "release_bond" ? "release_bond" : "join", label: tx.call?.fn === "release_bond" ? `your bond back on ${r.id}` : `your join of ${r.id}`, valueAtto: r.bondAtto, mock: isMock })}
      />
      {joinOutcome.kind === "refused" && (
        <p role="alert" className="border-2 border-red bg-red-wash px-3 py-2 text-[14px] text-red-deep">
          Refused: {joinOutcome.reason} {gen(joinOutcome.returnedAtto)} came back to your wallet in the same transaction.
        </p>
      )}
    </section>
  );
}
