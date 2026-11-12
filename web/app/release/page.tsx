"use client";

// The demo release: Lantern Bay Ferries' night crossing, held by The Harbour Post and The Bay Gazette.
// The visitor plays the reporter here. When no demo release is still under embargo, one key asks the
// demo desk for a fresh one, joined by both demo outlets; every transaction it sends is on screen.

import * as React from "react";

import { Key } from "@/components/keycap";
import { Notice } from "@/components/notice";
import { Placeholder } from "@/components/read-state";
import { ReleaseDesk } from "@/components/release-desk";
import { TxRail } from "@/components/tx-rail";
import { useDemoStatus } from "@/components/use-demo";
import { useNow } from "@/components/use-now";
import { isMock, issuedRelease, requestDemoJoin, requestDemoOpen } from "@/lib/chain";
import { deskGuide } from "@/lib/guide";
import type { DemoAnswer, TxStatus } from "@/lib/types";

export default function DemoReleasePage() {
  const demo = useDemoStatus();
  const now = useNow();
  const [opened, setOpened] = React.useState("");
  const [asking, setAsking] = React.useState(false);
  const [answers, setAnswers] = React.useState<DemoAnswer[]>([]);
  const s = demo.data;
  const id = opened || s?.release || "";
  // The demo release has lifted by the clock on this page, or the desk said so when asked.
  const lifted = !!s && !!s.release && (s.phase !== "embargoed" || (now > 0 && s.embargoUntil > 0 && now >= s.embargoUntil));

  const open = async () => {
    setAsking(true);
    const a = await requestDemoOpen();
    setAnswers([a]);
    if (a.ok && a.release) setOpened(a.release);
    setAsking(false);
  };

  // The issue's id is only in its final transaction: when the desk answered before it was final, the
  // page asks the demo outlets to join once it sees the id.
  const onIssued = async (st: TxStatus) => {
    const rid = issuedRelease(st);
    if (!rid) return;
    setOpened(rid);
    if (answers.some((a) => a.ok && a.release)) return;
    const j = await requestDemoJoin(rid);
    setAnswers((prev) => [...prev, j]);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="pt-2">
        <p className="slug">The demo release · you are the reporter</p>
        <h1 className="mt-1 text-[32px] sm:text-[40px]">On the wire now</h1>
        <p className="mt-2 max-w-[62ch] text-[15.5px] text-ink-2">
          Two fictional outlets hold this release under embargo and have each staked a bond. Their sites are folders of this project&apos;s repository, pinned to one commit, so every validator reads the same
          bytes. Deposit a little report credit, then report one of their pages.
        </p>
      </header>

      {demo.loading && !s && <Placeholder lines={3} label="Asking the demo desk" />}
      {s && !s.online && (
        <div className="bulletin bulletin-advisory p-4">
          <p className="slug text-blue">Advisory · the demo desk is away</p>
          <p className="mt-2 font-sans text-[15px]">
            The demo desk cannot act right now: {s.reason}. {s.release ? `The last demo release, ${s.release}, is below and can still be read.` : "Releases on the ledger can still be read, and anyone can issue one."}
          </p>
        </div>
      )}

      {s?.online && !asking && (!id || (id === s.release && lifted)) && (
        <section className="border-2 border-blue bg-blue-wash p-4">
          <p className="slug text-blue">{id ? `${id} has lifted` : "No demo release yet"}</p>
          <p className="mt-1 text-[15px]">
            {id ? "Its embargo is over, so reports are closed on it. " : ""}A fresh demo release is issued by the demo issuer with its embargo about thirty minutes ahead and a 0.1 GEN bond, and both demo outlets
            join it. Nothing leaves your wallet.
          </p>
          <Key tone="blue" className="mt-3" disabled={asking} onClick={() => void open()}>
            {asking ? "Asking the demo desk…" : "Open a fresh demo release"}
          </Key>
        </section>
      )}
      {asking && <Notice g={deskGuide("open", "", isMock)} />}
      {answers.map((a, i) =>
        a.ok ? (
          <div key={i} className="flex flex-col gap-2.5">
            {a.note && <p className="mono text-[13px] text-ink-2">{a.note.toUpperCase()}.</p>}
            {a.hashes.map((h) => (
              <TxRail key={h.hash} hash={h.hash} label={h.label} onDone={h.label.includes("issues") ? (st) => void onIssued(st) : undefined} />
            ))}
          </div>
        ) : (
          <p key={i} role="alert" className="border-2 border-red bg-red-wash px-3 py-2 text-[14px] text-red-deep">
            {a.reason}
          </p>
        ),
      )}

      {id && <ReleaseDesk id={id} />}
    </div>
  );
}
