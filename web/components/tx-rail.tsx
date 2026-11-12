"use client";

// One transaction while it goes through, printed as a transmission log: the explorer link from the
// first second, the stages (sent, propose, commit, reveal, accept, final) as ticks on the tape and, for
// a report, the validators' votes. FINALIZED does not mean the state changed: a round whose validators
// split finalizes too, with nothing stored. The rail reads the tally, not only the status, and says so.

import * as React from "react";

import { useWallet } from "@/components/wallet";
import { failureOf, invalidateReads, isMock, movesMoney, txStatus, txUrl } from "@/lib/chain";
import { STAGES } from "@/lib/rpc";
import type { TxStatus, Votes } from "@/lib/types";

const POLL_MS = isMock ? 700 : 3000;

export const isFinal = (s: TxStatus) => s.undetermined || s.status === "FINALIZED" || s.status === "CANCELED" || s.status === "UNDETERMINED";

/** Polls txStatus(hash) until it is final. The status is kept with its hash, so a new hash never shows an old result. */
export function useTxStatus(hash: string | null): TxStatus | null {
  const [latest, setLatest] = React.useState<{ hash: string; status: TxStatus } | null>(null);
  React.useEffect(() => {
    if (!hash) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const s = await txStatus(hash);
        if (stopped) return;
        setLatest({ hash, status: s });
        if (isFinal(s)) return;
      } catch {
        /* a dropped poll is not a failed transaction */
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [hash]);
  return latest && latest.hash === hash ? latest.status : null;
}

const WORD: Record<string, string> = { PENDING: "SENT", PROPOSING: "PROPOSE", COMMITTING: "COMMIT", REVEALING: "REVEAL", ACCEPTED: "ACCEPT", FINALIZED: "FINAL" };

export function VoteTape({ votes }: { votes: Votes }) {
  const total = votes.agree + votes.disagree + votes.idle;
  return (
    <div className="mt-2.5">
      <p className="slug text-[11px]">Validators</p>
      <div className="mt-1 flex gap-1" aria-label="Validator votes">
        {Array.from({ length: Math.max(5, total) }, (_, i) => {
          const kind = i < votes.agree ? "agree" : i < votes.agree + votes.disagree ? "disagree" : total ? "idle" : "waiting";
          return (
            <span
              key={i}
              title={kind}
              className={`mono flex h-7 min-w-0 flex-1 items-center justify-center border-[1.5px] text-[10.5px] font-bold uppercase ${
                kind === "agree" ? "border-blue bg-blue text-paper" : kind === "disagree" ? "border-red bg-red-wash text-red-deep" : kind === "idle" ? "border-ink-3 text-ink-3" : "border-dashed border-ink-3"
              }`}
            >
              {kind === "waiting" ? "" : kind}
            </span>
          );
        })}
      </div>
      <p className="mono mt-1 text-[11.5px] text-ink-3">{total === 0 ? "waiting for the votes..." : `${votes.agree} agree / ${votes.disagree} disagree / ${votes.idle} idle`}</p>
    </div>
  );
}

export function TxRail({ hash, label, judged, onDone }: { hash: string; label: string; judged?: boolean; onDone?: (status: TxStatus) => void }) {
  const status = useTxStatus(hash);
  const wallet = useWallet();
  const doneFor = React.useRef<string | null>(null);
  const onDoneRef = React.useRef(onDone);
  const refreshRef = React.useRef(wallet.refreshBalance);
  const watchRef = React.useRef(wallet.watchBalance);
  React.useEffect(() => {
    onDoneRef.current = onDone;
    refreshRef.current = wallet.refreshBalance;
    watchRef.current = wallet.watchBalance;
  }, [onDone, wallet.refreshBalance, wallet.watchBalance]);

  React.useEffect(() => {
    if (!status || !isFinal(status) || doneFor.current === hash) return;
    doneFor.current = hash;
    invalidateReads();
    if (movesMoney(status)) watchRef.current();
    else void refreshRef.current();
    onDoneRef.current?.(status);
  }, [status, hash]);

  const at = status ? STAGES.indexOf(status.status) : -1;
  const final = status ? isFinal(status) : false;
  const canceled = status?.status === "CANCELED";
  const split = !!status?.undetermined;
  const failure = status && final ? failureOf(status) : "";
  const ok = final && !failure;

  return (
    <div className="border-2 border-ink bg-paper-2 px-3 py-2.5 text-[14px]" data-tx={hash}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="slug text-ink">Transmission · {label}</p>
        <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="mono link text-[12px] break-all text-ink-2">
          {isMock ? "demo tx " : "explorer "}
          {hash.slice(0, 10)}…{hash.slice(-6)} ↗
        </a>
      </div>
      <ol className="mt-2 grid grid-cols-6 gap-1" aria-label="Consensus stages">
        {STAGES.map((stage, i) => {
          const reached = split ? i < 4 : final && !canceled ? true : i <= at;
          const current = !final && i === at;
          return (
            <li key={stage} aria-current={current ? "step" : undefined} className="min-w-0">
              <span aria-hidden="true" className={`block h-2 ${reached ? (split || canceled ? "bg-red" : "bg-ink") : current ? "ticking bg-blue" : "bg-paper-3"}`} />
              <span className={`mono mt-1 block truncate text-[10.5px] font-bold ${reached || current ? "text-ink" : "text-ink-3"}`}>{WORD[stage]}</span>
            </li>
          );
        })}
      </ol>
      {judged && <VoteTape votes={status?.votes ?? { agree: 0, disagree: 0, idle: 0 }} />}
      <div className="mt-2" role="status" aria-live="polite">
        {!status && <p className="text-ink-2">Sent. Waiting for the network to list it…</p>}
        {status && !final && (
          <p className="text-ink-2">
            {status.status === "UNKNOWN"
              ? "The network has not listed this transaction yet. It usually appears within a few seconds."
              : judged
                ? "Every validator fetches the page itself and asks its model four questions; the contract stores a finding only if they agree on it exactly."
                : "The validators are checking the call. The page moves on by itself."}
          </p>
        )}
        {split && !canceled && (
          <p className="text-red-deep">
            <strong>Nothing was stored.</strong> {failure}
          </p>
        )}
        {canceled && <p className="text-red-deep">The network cancelled this transaction. Nothing was stored.</p>}
        {final && !split && !canceled && failure && (
          <p className="text-red-deep">
            <strong>Final, and refused:</strong> {failure}
            {status?.result && "returned" in status.result ? " What was sent came back in the same transaction." : ""}
          </p>
        )}
        {ok && !split && (
          <p className="text-blue-deep">
            <strong>Final.</strong> The validators agreed and the result is stored.
            {status && movesMoney(status) ? " GEN moved by this call lands in the wallet a few seconds after it is final." : ""}
          </p>
        )}
      </div>
    </div>
  );
}
