"use client";

// How it works: the four questions word for word, how they combine, why this needs GenLayer, where the
// money goes, the limits stated plainly, and the contract's own rules() read live.

import { Placeholder, ReadError } from "@/components/read-state";
import { useRead } from "@/components/use-read";
import { readRules } from "@/lib/chain";
import { gen } from "@/lib/format";
import { COMBINE, MAX_BOND, MEANING_OTHER, MEANING_REPORTS, MIN_BOND, NEWS, QUESTION_OTHER, QUESTION_REPORTS, REPORTER_SHARE, REPORT_BOND, UNCLEAR_COST } from "@/lib/rules";

const LIMITS: [string, string][] = [
  ["The prefix is the outlet's word", "The contract cannot know a prefix belongs to the outlet; the issuer should check each one. A prefix on a shared host lets anyone who can publish below it cost the outlet its bond."],
  ["A page must read the same for everyone", "A page with a clock, a rotating headline or personalised content gets no consensus and stores nothing. An outlet that serves validators another page than its readers is not caught."],
  ["Text only", "Images, video and scripts are not read, and only the first 6,000 characters of a page's text are, so a report points at the story's own page, not a front page."],
  ["Removed stories are not caught", "A story published and taken down before anyone reports it is not caught, nor one that goes up a minute before the lift and is found after."],
  ["The page's own date is not read", "While the embargo holds, any page below the prefix that reports the news counts, whenever it went up."],
  ["Nothing on a chain is secret", "The summary is readable by anyone from the moment it is issued. A real release would store only a digest; this demonstration keeps the summary public."],
  ["The findings are a model's reading", "Two framings in two orders, compared exactly, keep one leaning model from deciding alone, but a page that honestly sits between reporting and mentioning lands in unclear."],
];

export default function HowPage() {
  const rules = useRead(() => readRules(), []);
  const live = rules.data as { report?: { askings?: unknown } } | null;
  const askings = Array.isArray(live?.report?.askings) ? (live!.report!.askings as unknown[]).map(String) : null;

  return (
    <div className="flex flex-col gap-8 pt-2">
      <header>
        <p className="slug">How it works</p>
        <h1 className="mt-1 text-[32px] sm:text-[40px]">Four questions, one clock, no appeal</h1>
        <p className="mt-2 max-w-[62ch] text-[15.5px] text-ink-2">
          A report is one consensus round inside <span className="mono">report()</span>. Every validator fetches the page itself, once; a status outside 2xx is a failed read and stores nothing. The tags are
          removed, the spacing collapsed, the first 6,000 characters kept, and their sha256 cut to 16 hex characters is the page&apos;s fingerprint. Then four askings over the RELEASE and the PAGE.
        </p>
      </header>

      <section aria-labelledby="q">
        <h2 id="q" className="slug text-[13px] text-ink">
          The questions, word for word {askings ? "· read live from rules()" : ""}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <blockquote className="m-0 border-l-[4px] border-red bg-[#fffdf3] p-3">
            <p className="mono text-[12px] font-bold tracking-[0.1em]">REPORTS · askings 1 and 2</p>
            <p className="mt-1 font-serif text-[18px] leading-snug">&ldquo;{QUESTION_REPORTS}&rdquo;</p>
            <p className="mt-2 text-[14px] text-ink-2">{MEANING_REPORTS}</p>
          </blockquote>
          <blockquote className="m-0 border-l-[4px] border-blue bg-[#fffdf3] p-3">
            <p className="mono text-[12px] font-bold tracking-[0.1em]">OTHER · askings 3 and 4</p>
            <p className="mt-1 font-serif text-[18px] leading-snug">&ldquo;{QUESTION_OTHER}&rdquo;</p>
            <p className="mt-2 text-[14px] text-ink-2">{MEANING_OTHER}</p>
          </blockquote>
        </div>
        <p className="mt-3 text-[14.5px]">
          <strong>The news, defined once:</strong> {NEWS}
        </p>
        {askings && (
          <ol className="mono mt-3 flex flex-col gap-1.5 text-[12.5px] text-ink-2">
            {askings.map((a) => (
              <li key={a}>{a.split(":")[0]}: blocks in that order</li>
            ))}
          </ol>
        )}
        <table className="mt-4 w-full border-2 border-ink text-left text-[14px]">
          <tbody>
            {(Object.keys(COMBINE) as (keyof typeof COMBINE)[]).map((f) => (
              <tr key={f} className="border-t-[1.5px] border-dashed border-rule first:border-0">
                <th className={`mono w-28 px-2.5 py-2 align-top uppercase ${f === "broken" ? "text-red" : f === "unclear" ? "text-blue" : ""}`}>{f}</th>
                <td className="px-2.5 py-2">{COMBINE[f]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[14px] text-ink-2">
          Each validator does all the work itself and compares the whole value, finding and fingerprint, by exact equality. A leader whose fetch or model call failed is never agreed with: nothing is
          written, nothing is taken, and the report may be made again. The model never sees an amount, an address, an id or a clock.
        </p>
      </section>

      <section aria-labelledby="why" className="border-y-2 border-ink py-4">
        <h2 id="why" className="slug text-[13px] text-ink">
          Why this needs GenLayer
        </h2>
        <p className="mt-2 max-w-[66ch] text-[15.5px]">
          The breach is a page on the outlet&apos;s own website at the moment somebody looks, and the question about it is one of meaning: a weather column, a feature about the ferry company&apos;s seventy
          years and a story about the night crossing can all sit under the same prefix and all name the company. Only the last one breaks the embargo. A deterministic contract cannot fetch the page, and could
          not tell the three apart if it did; an oracle run by the issuer would be the issuer judging for both sides. Here every validator fetches the page independently and reads it with its own model, and
          the bond moves on the value they agreed on, from money the contract already holds. Nobody uploads a screenshot, and the time of the report is the chain&apos;s clock, not anybody&apos;s claim.
        </p>
      </section>

      <section aria-labelledby="money">
        <h2 id="money" className="slug text-[13px] text-ink">
          The money
        </h2>
        <table className="mt-3 w-full border-2 border-ink text-left text-[14px]">
          <thead className="mono bg-ink text-[11.5px] tracking-[0.1em] text-paper uppercase">
            <tr>
              <th className="px-2.5 py-2">Event</th>
              <th className="px-2.5 py-2">Where it goes</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["join", `exactly the release's bond (${gen(MIN_BOND)} to ${gen(MAX_BOND)}), held by the contract`],
              ["broken", `the outlet's whole bond: ${REPORTER_SHARE}% to the reporter, the rest to the issuer; the reporter's credit untouched`],
              ["kept", `${gen(REPORT_BOND)} of the reporter's credit to the outlet`],
              ["unclear", `${gen(UNCLEAR_COST)} of the reporter's credit to the outlet; the rest stays`],
              ["repeat", `${gen(REPORT_BOND)} of the reporter's credit to the outlet; the earlier finding stands`],
              ["release_bond", "from the lift, an outlet that kept the embargo takes its whole bond back, once"],
              ["refused join or deposit", "everything sent comes back in the same transaction"],
              ["withdraw", "all of the sender's report credit back to the sender"],
            ].map(([k, v]) => (
              <tr key={k} className="border-t-[1.5px] border-dashed border-rule align-top">
                <td className="mono px-2.5 py-2 font-bold">{k}</td>
                <td className="px-2.5 py-2">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[14px] text-ink-2">The contract holds exactly the bonds of the outlets still bonded and the report credit, nothing more.</p>
      </section>

      <section aria-labelledby="limits">
        <h2 id="limits" className="slug text-[13px] text-ink">
          The limits, stated plainly
        </h2>
        <dl className="mt-3 flex flex-col gap-3">
          {LIMITS.map(([k, v]) => (
            <div key={k} className="border-l-[3px] border-ink pl-3">
              <dt className="font-semibold">{k}</dt>
              <dd className="m-0 text-[14.5px] text-ink-2">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="rules">
        <h2 id="rules" className="slug text-[13px] text-ink">
          rules(), read live from the contract
        </h2>
        {rules.loading ? (
          <Placeholder lines={3} label="Reading rules()" />
        ) : rules.error ? (
          <ReadError error={rules.error} retry={rules.retry} />
        ) : (
          <details className="mt-2 border-2 border-ink bg-paper-2">
            <summary className="mono cursor-pointer px-3 py-2 text-[13px] font-bold">Show the contract&apos;s own words ({Object.keys(rules.data ?? {}).length} sections)</summary>
            <pre className="mono max-h-[28rem] overflow-auto border-t-[1.5px] border-dashed border-rule px-3 py-2 text-[12px] leading-relaxed break-words whitespace-pre-wrap">{JSON.stringify(rules.data, null, 2)}</pre>
          </details>
        )}
      </section>
    </div>
  );
}
