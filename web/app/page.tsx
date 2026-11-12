// The front page: the promise in one minute, how the money moves, and where to start.

import { KeyLink } from "@/components/keycap";
import { Mark } from "@/components/logo";
import { REPORT_BOND, REPORTER_SHARE, UNCLEAR_COST } from "@/lib/rules";
import { gen } from "@/lib/format";

const MONEY: [string, string, string][] = [
  ["An outlet joins", "the outlet", "held by the contract: exactly the release's bond"],
  ["A page is found broken", "the outlet's whole bond", `${REPORTER_SHARE}% to the reporter, the rest to the issuer`],
  ["A page is found kept", `${gen(REPORT_BOND)} of the reporter's credit`, "the outlet: the cost of a wrong accusation"],
  ["A reading is unclear", `${gen(UNCLEAR_COST)} of the reporter's credit`, "the outlet; the rest stays in the credit"],
  ["The same text again", `${gen(REPORT_BOND)} of the reporter's credit`, "the outlet; the earlier finding stands"],
  ["The embargo lifts", "an outlet that kept it", "takes its whole bond back with one signature"],
];

export default function Home() {
  return (
    <div className="flex flex-col gap-9">
      <section className="pt-4">
        <p className="hold text-[15px]">Hold for release until the stated hour</p>
        <h1 className="mt-2 max-w-[18ch] text-[40px] sm:text-[58px]">A press embargo with teeth.</h1>
        <p className="mt-4 max-w-[60ch] font-serif text-[19px] leading-relaxed">
          An issuer sends its news to outlets ahead of time, under embargo. Each outlet posts a bond to receive it. If a page on the outlet&apos;s own site reports the story before the embargo lifts, anyone
          can point at it: every GenLayer validator fetches the page itself, reads it against the release, and when they agree it reports the news, the outlet&apos;s bond goes to the issuer and the reporter in
          the same transaction.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <KeyLink href="/release" tone="red">
            Try the demo release
          </KeyLink>
          <KeyLink href="/how">Read the rules</KeyLink>
        </div>
      </section>

      <section aria-labelledby="minute" className="border-y-2 border-ink py-5">
        <h2 id="minute" className="slug text-[13px] text-ink">
          The promise in one minute
        </h2>
        <ol className="mt-3 grid gap-4 sm:grid-cols-3">
          {[
            ["01 · Issue", "The issuer writes a headline and a summary, picks the instant the embargo lifts and the bond each outlet stakes. Nothing is paid to issue."],
            ["02 · Join", "An outlet sends exactly the bond and names the prefix of its own site, the folder its stories go up under. The bond is held until the lift."],
            ["03 · Report", "While the embargo holds, anyone but that outlet may report a page below its prefix. The validators fetch it and answer four questions: broken, kept or unclear."],
          ].map(([h, t]) => (
            <li key={h} className="border-l-[3px] border-red pl-3">
              <p className="mono text-[13px] font-bold tracking-[0.1em]">{h}</p>
              <p className="mt-1 text-[15px]">{t}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[15px] text-ink-2">
          Whether the report came in time is not a question for anybody: it is the transaction&apos;s own clock against the stored instant. A story that goes up after the lift breaks nothing.
        </p>
      </section>

      <section aria-labelledby="money">
        <h2 id="money" className="slug text-[13px] text-ink">
          How the money moves
        </h2>
        <div className="mt-3 overflow-hidden border-2 border-ink">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead className="mono bg-ink text-[11.5px] tracking-[0.1em] text-paper uppercase">
              <tr>
                <th className="px-2.5 py-2 font-bold">When</th>
                <th className="px-2.5 py-2 font-bold">From</th>
                <th className="hidden px-2.5 py-2 font-bold sm:table-cell">To</th>
              </tr>
            </thead>
            <tbody>
              {MONEY.map(([when, from, to]) => (
                <tr key={when} className="border-t-[1.5px] border-dashed border-rule align-top">
                  <td className="px-2.5 py-2 font-semibold">{when}</td>
                  <td className="px-2.5 py-2">
                    {from}
                    <span className="mt-0.5 block text-ink-2 sm:hidden">→ {to}</span>
                  </td>
                  <td className="hidden px-2.5 py-2 sm:table-cell">{to}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[13.5px] text-ink-2">A refused join or deposit sends every atto back in the same transaction. Every settlement touches one outlet and pays at most three transfers.</p>
      </section>

      <section aria-labelledby="start" className="border-2 border-ink bg-paper-2 p-4">
        <div className="flex items-center gap-3">
          <Mark size={34} />
          <h2 id="start" className="text-[26px]">
            Start
          </h2>
        </div>
        <ol className="mt-3 flex flex-col gap-3 text-[15px]">
          <li>
            <strong>Play the reporter.</strong> The demo release is held by two fictional outlets, The Harbour Post and The Bay Gazette. Deposit a little credit, then report one of their pages with one click:
            the early story should come back broken, the weather column kept.
          </li>
          <li>
            <strong>Play the issuer.</strong> Issue a release of your own and invite the two demo outlets to join it, then watch their bonds held until your hour.
          </li>
          <li>
            <strong>Play an outlet.</strong> Join a release with a prefix of your own and take your bond back once it lifts.
          </li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-3">
          <KeyLink href="/release" tone="red">
            Report
          </KeyLink>
          <KeyLink href="/issue" tone="blue">
            Issue
          </KeyLink>
          <KeyLink href="/outlet">Join as an outlet</KeyLink>
        </div>
        <p className="mt-3 text-[13.5px] text-ink-2">You need a browser wallet on GenLayer Studio (chain 61999); the site adds the network and its menu gives 10 test GEN. Nothing here is real money.</p>
      </section>
    </div>
  );
}
