"use client";

// The ledger: the contract's totals, and every release newest first with where it stands.

import Link from "next/link";

import { Placeholder, ReadError } from "@/components/read-state";
import { useNow } from "@/components/use-now";
import { useAfterTx, useRead } from "@/components/use-read";
import { readReleasesWindow, readStats, releasePath } from "@/lib/chain";
import { countdown, gen, utcClock, utcStamp } from "@/lib/format";

export default function LedgerPage() {
  const stats = useRead(() => readStats(), []);
  const list = useRead(() => readReleasesWindow(3), []);
  useAfterTx(stats.refresh);
  useAfterTx(list.refresh);
  const now = useNow();
  const s = stats.data;

  return (
    <div className="flex flex-col gap-6 pt-2">
      <header>
        <p className="slug">The ledger</p>
        <h1 className="mt-1 text-[32px] sm:text-[40px]">Everything on the wire</h1>
      </header>
      {stats.error ? (
        <ReadError error={stats.error} retry={stats.retry} />
      ) : !s ? (
        <Placeholder lines={2} />
      ) : (
        <dl className="mono grid grid-cols-2 gap-px border-2 border-ink bg-ink text-[13px] sm:grid-cols-4">
          {(
            [
              ["Releases", String(s.releases)],
              ["Joins", String(s.joins)],
              ["Reports", String(s.reports)],
              ["Broken", String(s.broken)],
              ["Kept", String(s.kept)],
              ["Unclear", String(s.unclear)],
              ["Repeats", String(s.repeats)],
              ["Bonds back", String(s.released)],
              ["Bonds held", gen(s.heldAtto)],
              ["To issuers", gen(s.toIssuersAtto)],
              ["To reporters", gen(s.toReportersAtto)],
              ["Report credit", gen(s.creditAtto)],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="bg-paper px-2.5 py-2">
              <dt className="text-[10.5px] tracking-[0.12em] text-ink-3 uppercase">{k}</dt>
              <dd className={`m-0 text-[17px] font-bold ${k === "Broken" ? "text-red" : ""}`}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <section aria-labelledby="rel">
        <h2 id="rel" className="slug text-[13px] text-ink">
          Releases, newest first {list.data?.partial ? "(the newest sixty)" : ""}
        </h2>
        {list.error ? (
          <ReadError error={list.error} retry={list.retry} />
        ) : !list.data ? (
          <Placeholder lines={4} />
        ) : list.data.rows.length === 0 ? (
          <p className="mono mt-2 text-[13px]">NOTHING ON THE WIRE YET.</p>
        ) : (
          <ol className="mt-2">
            {list.data.rows.map((r) => {
              const held = now ? now < r.embargoUntil : r.phase === "embargoed";
              return (
                <li key={r.id} className="border-b-[1.5px] border-dashed border-rule py-3">
                  <p className="slug flex flex-wrap gap-x-3 text-[11.5px]">
                    <span className="text-ink">{r.id}</span>
                    <span>{utcStamp(r.issuedAt)}</span>
                    {held ? <span className="text-red">hold until {utcClock(r.embargoUntil)} UTC · T-{countdown(r.embargoUntil - now)}</span> : <span className="text-blue">lifted {utcStamp(r.embargoUntil)}</span>}
                  </p>
                  <Link href={releasePath(r.id)} className="mt-1 block font-serif text-[20px] leading-snug font-semibold hover:text-blue">
                    {r.headline}
                  </Link>
                  <p className="mono mt-1 text-[12px] text-ink-2">
                    bond {gen(r.bondAtto)} · {r.record.outlets} outlets · {r.record.reports} reports · {r.record.broken} broken · {r.record.kept} kept · {r.record.unclear} unclear · {r.record.released} bonds back
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
