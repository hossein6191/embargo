"use client";

// The teleprinter: a torn-off wire strip with tractor-feed holes, run over the slate desk. The
// masthead (the mark, the service name, the wallet key), the page tabs, the wrong-chain banner, the
// mock bar in the demo build, and the end-of-copy footer.

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Mark } from "@/components/logo";
import { MockBar } from "@/components/mock-bar";
import { WalletButton, WrongChainBanner } from "@/components/wallet";
import { addressUrl, contractInUse, hasContract, isMock } from "@/lib/chain";
import { REPO_URL } from "@/lib/config";

const TABS = [
  { href: "/release", label: "Wire" },
  { href: "/issue", label: "Issue" },
  { href: "/outlet", label: "Outlet" },
  { href: "/ledger", label: "Ledger" },
  { href: "/how", label: "How" },
];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/";
  return (
    <div className="px-0 py-0 sm:px-4 sm:py-6">
      <div className="mx-auto max-w-[940px]">
        <div className="tear" aria-hidden="true" />
        <div className="strip pt-4 pb-8">
          <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b-2 border-ink pb-3">
            <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="Embargo, the front page">
              <Mark size={40} className="shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span className="font-serif text-[27px] leading-none font-bold tracking-[0.06em]">EMBARGO</span>
                <span className="slug mt-1 hidden text-[10.5px] sm:block">Wire service · press embargoes with teeth</span>
              </span>
            </Link>
            {!isMock && <WalletButton />}
          </header>
          <nav aria-label="Pages" className="flex flex-wrap gap-x-4 gap-y-1 border-b-[1.5px] border-dashed border-rule py-2">
            {TABS.map((t) => {
              const on = path === t.href || path.startsWith(t.href + "/");
              return (
                <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={`mono py-1 text-[13px] font-bold tracking-[0.12em] uppercase ${on ? "border-b-[3px] border-red text-ink" : "text-ink-2 hover:text-blue"}`}>
                  {t.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-3">
            <WrongChainBanner />
          </div>
          {isMock && <MockBar />}
          <main id="main" className="min-w-0 pt-2">
            {children}
          </main>
          <footer className="mt-10 border-t-2 border-ink pt-3 text-[13px] text-ink-2">
            <p className="mono font-bold tracking-[0.3em] text-ink">-0-  ENDS</p>
            <p className="mt-2">
              Embargo runs on GenLayer Studio (chain 61999).{" "}
              {hasContract() && (
                <a className="link" href={addressUrl(contractInUse())} target="_blank" rel="noreferrer">
                  {isMock ? "Demo contract" : "The contract"} ↗
                </a>
              )}
              {REPO_URL && (
                <>
                  {" · "}
                  <a className="link" href={REPO_URL} target="_blank" rel="noreferrer">
                    Source ↗
                  </a>
                </>
              )}
            </p>
            <p className="mt-1">Test GEN only. The names, outlets and pages in the demo are fictional.</p>
          </footer>
        </div>
        <div className="tear tear-bottom" aria-hidden="true" />
      </div>
    </div>
  );
}
