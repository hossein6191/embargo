"use client";

// The wire copy: a release printed as a wire item headed "HOLD FOR RELEASE UNTIL hh:mm" with a live
// countdown, its outlets as subscriber lines, and every report as a wire bulletin with its
// fingerprint, its page and where the money went.

import Link from "next/link";

import { useNow } from "@/components/use-now";
import { addressUrl, releasePath } from "@/lib/chain";
import { countdown, gen, localClock, shortAddr, utcClock, utcStamp } from "@/lib/format";
import type { OutletRow, Release, ReportRow } from "@/lib/types";

/** Who an address is, for the wire: a demo account's name, "YOU", or the short address. */
export type Namer = (address: string) => string;

export function WireItem({ r, issuerName, linkTitle }: { r: Release; issuerName: string; linkTitle?: boolean }) {
  const now = useNow();
  const left = now ? Math.max(0, r.embargoUntil - now) : r.secondsLeft;
  const held = now ? left > 0 : r.phase === "embargoed";
  return (
    <article className="feed-in border-y-2 border-ink py-4" aria-label={`Release ${r.id}`}>
      <p className="slug flex flex-wrap gap-x-3">
        <span>Embargo wire</span>
        <span>{r.id}</span>
        <span>Issued {utcStamp(r.issuedAt)}</span>
      </p>
      {held ? (
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <p className="hold text-[19px] sm:text-[23px]">Hold for release until {utcClock(r.embargoUntil)} UTC</p>
          <p className="lockline text-[20px] sm:text-[24px]" aria-label={`Embargo lifts in ${countdown(left)}`}>
            <span className="text-[12px] tracking-[0.12em]">T-</span>
            {countdown(left)}
          </p>
        </div>
      ) : (
        <p className="lockline mt-2 text-[19px] tracking-[0.04em] sm:text-[23px]">EMBARGO LIFTED {utcClock(r.embargoUntil)} UTC · FOR IMMEDIATE RELEASE</p>
      )}
      <p className="mono mt-0.5 text-[12px] text-ink-3">
        {utcStamp(r.embargoUntil)} · {localClock(r.embargoUntil)} your time
      </p>
      <p className="slug mt-3 text-ink">{issuerName}</p>
      <h2 className="mt-1 text-[27px] sm:text-[34px]">{linkTitle ? <Link className="hover:text-blue" href={releasePath(r.id)}>{r.headline}</Link> : r.headline}</h2>
      <p className="mt-2 max-w-[62ch] font-serif text-[18px] leading-relaxed">{r.summary}</p>
      <p className="mono mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
        <span>BOND {gen(r.bondAtto)} PER OUTLET</span>
        <span>{r.record.outlets} OUTLET{r.record.outlets === 1 ? "" : "S"}</span>
        <span>HELD {gen(r.heldAtto)}</span>
        <span>{r.record.reports} REPORT{r.record.reports === 1 ? "" : "S"}</span>
      </p>
      <p className="mono mt-2 text-[12px] font-bold tracking-[0.3em] text-ink-3">{held ? "-MORE-" : "-0-"}</p>
    </article>
  );
}

const STATUS_WORD: Record<OutletRow["status"], string> = { bonded: "BONDED", broke: "BROKE IT", released: "BOND BACK" };

export function Subscribers({ rows, name, me }: { rows: OutletRow[]; name: Namer; me: string }) {
  if (!rows.length)
    return <p className="mono border-b-[1.5px] border-dashed border-rule py-3 text-[13px] text-ink-2">NO SUBSCRIBERS YET. An outlet joins by posting the bond and naming its site prefix.</p>;
  return (
    <ol className="mono text-[13px]">
      {rows.map((o, i) => (
        <li key={o.outlet} className="grid grid-cols-[auto_1fr] gap-x-3 border-b-[1.5px] border-dashed border-rule py-2.5 sm:grid-cols-[auto_1fr_auto]">
          <span className="font-bold text-ink-3">SUB {String(i + 1).padStart(2, "0")}</span>
          <span className="min-w-0">
            <span className="font-bold tracking-[0.06em] uppercase">{name(o.outlet)}</span>
            {o.outlet === me && <span className="ml-2 bg-blue px-1 text-[11px] text-paper">YOU</span>}
            <span className="block break-all text-ink-2">{o.sitePrefix}</span>
            <span className="block text-ink-3">
              bond {gen(o.bondAtto)} · {o.reports} report{o.reports === 1 ? "" : "s"} · fees won {gen(o.feesWonAtto)}
            </span>
          </span>
          <span className={`col-start-2 font-bold sm:col-start-auto sm:text-right ${o.status === "broke" ? "text-red" : o.status === "released" ? "text-blue" : "text-ink"}`}>
            {STATUS_WORD[o.status]}
            {o.status === "broke" && o.brokeReport ? ` · ${o.brokeReport}` : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The bulletin's headline, in wire capitals. */
export function bulletinHead(p: Pick<ReportRow, "finding" | "repeatOf">, outletName: string): { head: string; tone: "flash" | "noted" | "advisory" } {
  if (p.repeatOf) return { head: `REPEAT: TEXT ALREADY READ - ${p.repeatOf} STANDS`, tone: "noted" };
  if (p.finding === "broken") return { head: `FLASH: EMBARGO BROKEN - ${outletName.replace(/^THE /i, "").toUpperCase()}`, tone: "flash" };
  if (p.finding === "kept") return { head: "NOTED: PAGE IS ABOUT SOMETHING ELSE", tone: "noted" };
  return { head: "ADVISORY: READING UNCLEAR - NOTHING DECIDED", tone: "advisory" };
}

export function Bulletin({ p, name, fresh }: { p: ReportRow; name: Namer; fresh?: boolean }) {
  const { head, tone } = bulletinHead(p, name(p.outlet));
  return (
    <article className={`bulletin bulletin-${tone} p-3 text-[13px] ${fresh ? "feed-in" : ""}`} aria-label={`Report ${p.id}`}>
      <p className={`text-[15px] font-extrabold tracking-[0.04em] sm:text-[17px] ${tone === "flash" ? "text-red" : tone === "advisory" ? "text-blue" : "text-ink"}`}>{head}</p>
      <p className="slug mt-1 text-[11px]">
        {p.id} · {p.release} · {name(p.outlet)} · {utcStamp(p.at)}
      </p>
      <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1">
        <dt className="text-ink-3">PAGE</dt>
        <dd className="m-0 min-w-0 break-all">
          <a className="link" href={p.url} target="_blank" rel="noreferrer">
            {p.url}
          </a>
        </dd>
        <dt className="text-ink-3">FINGERPRINT</dt>
        <dd className="m-0 font-bold tracking-[0.08em]">{p.fp || "--"}</dd>
        <dt className="text-ink-3">REPORTER</dt>
        <dd className="m-0">
          <a className="link" href={addressUrl(p.reporter)} target="_blank" rel="noreferrer">
            {name(p.reporter)}
          </a>
        </dd>
        <dt className="text-ink-3">MONEY</dt>
        <dd className="m-0">
          {p.finding === "broken" && !p.repeatOf
            ? `${gen(p.toReporterAtto)} to the reporter, ${gen(p.toIssuerAtto)} to the issuer: the outlet's whole bond. The reporter's credit untouched.`
            : `${gen(p.costAtto)} of the reporter's credit to the outlet.`}
        </dd>
      </dl>
    </article>
  );
}

export const nameFrom =
  (known: Record<string, string>, me: string): Namer =>
  (a: string) =>
    a === me && me ? "You" : known[a] ?? shortAddr(a);
