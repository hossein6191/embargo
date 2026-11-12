"use client";

// A telex notice: the waiting copy from lib/guide.ts for one state and one role, printed as a ruled
// box. What is happening, how long, whether you must act, whether you can leave, where the money is,
// and a live countdown when the next thing has a time.

import * as React from "react";

import { useWallNow } from "@/components/use-now";
import { countdown } from "@/lib/format";
import type { Guide } from "@/lib/guide";

const EDGE: Record<Guide["tone"], string> = {
  hold: "border-red",
  busy: "border-blue",
  flash: "border-red",
  noted: "border-ink",
  lifted: "border-blue",
  done: "border-ink",
};

export function Notice({ g, since, action, className = "" }: { g: Guide; since?: number; action?: React.ReactNode; className?: string }) {
  const wall = useWallNow();
  // A countdown keeps its own start: the seconds the page was given, counted down by the wall clock.
  const [start] = React.useState(() => Math.floor(Date.now() / 1000));
  const left = g.left !== undefined && wall ? Math.max(0, g.left - (wall - start)) : g.left;
  const elapsed = since && wall ? Math.max(0, wall - since) : 0;
  const rows: [string, string][] = [
    ["How long", g.time],
    ["From you", g.need],
    ["Leaving", g.leave],
    ["Money", g.money],
  ];
  return (
    <section data-guide={g.id} aria-live="polite" className={`border-2 border-l-[6px] bg-[#fffdf3] ${EDGE[g.tone]} ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-[1.5px] border-dashed border-rule px-3 py-2">
        <span className={`slug ${g.tone === "flash" || g.tone === "hold" ? "text-red" : g.tone === "busy" || g.tone === "lifted" ? "text-blue" : ""} ${g.tone === "busy" ? "caret" : ""}`}>{g.kicker}</span>
        {left !== undefined && left > 0 && (
          <span className="lockline text-[13px]">
            {g.leftLabel ?? "Next in"} {countdown(left)}
          </span>
        )}
        {g.tone === "busy" && elapsed > 0 && <span className="lockline text-[13px]">{countdown(elapsed)} elapsed</span>}
      </div>
      <p className="px-3 pt-2.5 font-serif text-[18px] leading-snug font-semibold">{g.now}</p>
      <dl className="grid gap-x-3 gap-y-1.5 px-3 pt-2 pb-3 text-[14.5px] sm:grid-cols-[7.5rem_1fr]">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="slug pt-0.5 text-[11px]">{k}</dt>
            <dd className="m-0">{v}</dd>
          </React.Fragment>
        ))}
      </dl>
      {action && <div className="border-t-[1.5px] border-dashed border-rule px-3 py-3">{action}</div>}
    </section>
  );
}
