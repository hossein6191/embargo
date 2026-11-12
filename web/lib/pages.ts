// The demo desk's fixed cast: the demo release, the two demo outlets and the pages each one publishes
// in outlets/ of the repository, served by raw.githubusercontent.com at one commit so every validator
// fetches the same bytes. Pure, so node runs it in tests/unit.
//
// `expect` is what the network should find for a page reported while the embargo holds, as the README
// and the on-chain run say; on chain every validator judges for itself. `mock` is what the in-memory
// contract of mock mode finds, and `fp` is the fingerprint the contract computes for the page's exact
// bytes (tests/unit/pages.test.mjs recomputes every one with the contract's own functions).

import type { Finding } from "./rules.ts";

export const DEMO_HEADLINE = "Lantern Bay Ferries adds a night crossing to Gull Island";
export const DEMO_SUMMARY = "Lantern Bay Ferries will add a night crossing to Gull Island from 1 June, the first in 30 years";
/** The demo embargo lifts about thirty minutes after the release is issued. */
export const DEMO_LEAD_SECONDS = 30 * 60;
/** 0.1 GEN: what each demo outlet stakes. */
export const DEMO_BOND = 10n ** 17n;
/** The demo outlets join a visitor's release only when its bond is at most this (1 GEN). */
export const DEMO_MAX_JOIN_BOND = 10n ** 18n;
/** ...and only when its embargo holds for at least this long, so the join lands before it lifts. */
export const DEMO_MIN_JOIN_LEFT = 180;

export type OutletKey = "harbour-post" | "bay-gazette";
export type DemoPage = {
  outlet: OutletKey;
  file: string;
  label: string;
  /** what the page is, in a few words */
  about: string;
  /** what the network should find while the embargo holds, in words */
  expect: string;
  mock: Finding;
  fp: string;
};

export const DEMO_OUTLETS: { key: OutletKey; name: string; label: string }[] = [
  { key: "harbour-post", name: "The Harbour Post", label: "harbour-post" },
  { key: "bay-gazette", name: "The Bay Gazette", label: "bay-gazette" },
];

export const DEMO_PAGES: DemoPage[] = [
  {
    outlet: "harbour-post",
    file: "early-story.html",
    label: "Early story",
    about: "the night crossing, published before the lift",
    expect: "broken",
    mock: "broken",
    fp: "146ac57005c7950d",
  },
  {
    outlet: "harbour-post",
    file: "weather.html",
    label: "Weather column",
    about: "sea fog until Thursday",
    expect: "kept",
    mock: "kept",
    fp: "a5acfb6dc333d535",
  },
  {
    outlet: "harbour-post",
    file: "ferries-feature.html",
    label: "Company history",
    about: "seventy years of the ferry company, no night crossing",
    expect: "kept or unclear",
    mock: "unclear",
    fp: "a4bf50701ebaa999",
  },
  {
    outlet: "bay-gazette",
    file: "story-after.html",
    label: "Story for after the lift",
    about: "the night crossing, written to go up once the embargo lifts",
    expect: "refused once the embargo lifts; broken if reported while it holds",
    mock: "broken",
    fp: "c260f080247aabba",
  },
];

export const outletName = (key: OutletKey): string => DEMO_OUTLETS.find((o) => o.key === key)?.name ?? key;

/** The prefix a demo outlet names: its folder of outlets/ at the pinned commit. */
export const demoPrefix = (repo: string, commit: string, key: OutletKey): string =>
  repo && commit ? `https://raw.githubusercontent.com/${repo}/${commit}/outlets/${key}/` : "";

/** A demo page's address under its outlet's prefix. */
export const demoPageUrl = (repo: string, commit: string, page: DemoPage): string => {
  const p = demoPrefix(repo, commit, page.outlet);
  return p ? p + page.file : "";
};

/** The demo page an address names (at any commit of any repository), or null. */
export function demoPageOf(url: string): DemoPage | null {
  const m = /^https:\/\/raw\.githubusercontent\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/[0-9a-f]{40}\/outlets\/([a-z-]+)\/([a-z-]+\.html)$/.exec(String(url ?? "").trim());
  if (!m) return null;
  return DEMO_PAGES.find((p) => p.outlet === m[1] && p.file === m[2]) ?? null;
}

/** Why the demo outlets will not join a release, in the demo desk's words; "" when they will. */
export function demoJoinProblem(r: { id: string; issuer: string; bondAtto: bigint; secondsLeft: number; phase: string } | null, outlets: string[]): string {
  if (!r) return "there is no such release";
  if (r.phase !== "embargoed") return `the embargo on ${r.id} has lifted; outlets join only while it holds`;
  if (r.secondsLeft < DEMO_MIN_JOIN_LEFT) return `the embargo on ${r.id} lifts in under ${DEMO_MIN_JOIN_LEFT / 60} minutes, too soon for a join to land before it`;
  if (r.bondAtto > DEMO_MAX_JOIN_BOND) return `the demo outlets join releases whose bond is at most 1 GEN; ${r.id} asks for more`;
  if (outlets.map((o) => o.toLowerCase()).includes(r.issuer.toLowerCase())) return `a demo outlet issued ${r.id}, and an issuer may not join its own release`;
  return "";
}
