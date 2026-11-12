"use client";

// One write, from the wallet prompt to the final line, in one place: while the wallet asks, the sign
// notice; while the transaction goes through, the waiting notice (lib/guide.ts) above the rail with
// its explorer link; once final, the rail's last line; a wallet error in words a person can act on.

import { Notice } from "@/components/notice";
import { TxRail } from "@/components/tx-rail";
import type { TxRun } from "@/components/use-tx";
import type { Guide } from "@/lib/guide";

export function TxStage({ tx, sign, sending, label, judged, className = "" }: { tx: TxRun; sign: Guide; sending: Guide; label: string; judged?: boolean; className?: string }) {
  if (tx.sending) return <Notice g={sign} className={className} />;
  if (tx.error)
    return (
      <p role="alert" className={`border-2 border-red bg-red-wash px-3 py-2 text-[14px] text-red-deep ${className}`}>
        {tx.error}
      </p>
    );
  if (!tx.hash) return null;
  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {!tx.final && <Notice g={sending} since={tx.at || undefined} />}
      <TxRail hash={tx.hash} label={label} judged={judged} onDone={tx.onDone} />
    </div>
  );
}
