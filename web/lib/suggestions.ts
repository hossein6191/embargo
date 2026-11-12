// The one-click suggestions under every field. Every one is inside the contract's limits, which
// tests/unit/suggestions.test.mjs checks against lib/rules.ts (itself checked against the contract).
// Fictional names only.

import { DEMO_HEADLINE, DEMO_PAGES, DEMO_SUMMARY, demoPageUrl, type DemoPage, type OutletKey } from "./pages.ts";
import { REPORT_BOND } from "./rules.ts";

export type Chip<T> = { label: string; value: T; tag?: string };

const GEN = 10n ** 18n;

/** A headline and its summary, picked together. */
export const RELEASE_CHIPS: Chip<{ headline: string; summary: string }>[] = [
  { label: "Night crossing", value: { headline: DEMO_HEADLINE, summary: DEMO_SUMMARY } },
  {
    label: "Lighthouse museum",
    value: {
      headline: "Gull Point lighthouse opens as a museum in May",
      summary: "The Gull Point lighthouse will open to visitors as a museum from 3 May, with the lamp room reached by its original stair",
    },
  },
  {
    label: "Tide-powered mill",
    value: {
      headline: "Quay Street mill grinds flour by the tide again",
      summary: "The old tide mill on Quay Street will grind flour again from 20 April after a two-year restoration, the first time since 1952",
    },
  },
  {
    label: "Bakery prize",
    value: {
      headline: "Orrin's Bakery wins the regional bread prize",
      summary: "Orrin's Bakery of Lantern Bay has won this year's regional bread prize for its seeded rye, judges announced this morning",
    },
  },
];

/** How far ahead the embargo lifts, in seconds. */
export const LEAD_CHIPS: Chip<number>[] = [
  { label: "25 min", value: 25 * 60, tag: "shortest demo" },
  { label: "30 min", value: 30 * 60 },
  { label: "1 hour", value: 3600 },
  { label: "1 day", value: 86400 },
];

/** Each outlet's bond. */
export const BOND_CHIPS: Chip<bigint>[] = [
  { label: "0.05 GEN", value: GEN / 20n, tag: "least" },
  { label: "0.1 GEN", value: GEN / 10n, tag: "demo" },
  { label: "0.5 GEN", value: GEN / 2n },
  { label: "1 GEN", value: GEN, tag: "demo outlets' most" },
];

/** Report credit to deposit. */
export const DEPOSIT_CHIPS: Chip<bigint>[] = [
  { label: "0.02 GEN", value: REPORT_BOND, tag: "1 report" },
  { label: "0.1 GEN", value: REPORT_BOND * 5n, tag: "5 reports" },
  { label: "0.2 GEN", value: REPORT_BOND * 10n, tag: "10 reports" },
];

/** Prefixes an outlet of your own might name. The example hosts cannot be fetched, so nothing below them can be found. */
export function prefixChips(repo: string, commit: string): Chip<string>[] {
  const chips: Chip<string>[] = [
    { label: "Lantern Light news", value: "https://lanternlight.example/news/", tag: "a site of your own" },
    { label: "Gull Island Courier", value: "https://gullislandcourier.example/stories/", tag: "a site of your own" },
  ];
  if (repo && commit)
    chips.push({ label: "The Harbour Post's demo folder", value: `https://raw.githubusercontent.com/${repo}/${commit}/outlets/harbour-post/`, tag: "pages the validators can read" });
  return chips;
}

/** The demo pages of one outlet, as report chips: the address and what the network should find. */
export function pageChips(repo: string, commit: string, outlet: OutletKey): Chip<string>[] {
  return DEMO_PAGES.filter((p: DemoPage) => p.outlet === outlet).map((p) => ({ label: p.label, value: demoPageUrl(repo, commit, p), tag: p.expect }));
}

/** The report chips for an outlet's prefix: the demo pages when it is a demo folder at a pinned commit, none otherwise. */
export function reportChips(prefix: string): Chip<string>[] {
  const m = /^https:\/\/raw\.githubusercontent\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)\/([0-9a-f]{40})\/outlets\/(harbour-post|bay-gazette)\/$/.exec(prefix);
  return m ? pageChips(m[1], m[2], m[3] as OutletKey) : [];
}
