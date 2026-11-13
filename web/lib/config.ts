// Site settings: the contract address, the name, the repository and the commit the demo outlets'
// pages are pinned to.
//
// DEMO_CONTRACT is the deployed copy the site reads when NEXT_PUBLIC_CONTRACT is unset. It is filled in
// once the contract is deployed; while both are empty every page says the contract is not deployed
// yet, and the whole site still works with NEXT_PUBLIC_MOCK=1.
export const DEMO_CONTRACT: string = "0xd9e326E6890BaAeb2E8885782f5A7D140BE5b5e3";

/**
 * The commit of the public repository whose outlets/ the demo outlets publish under, as
 * raw.githubusercontent.com serves it: every validator fetches the same bytes. Filled in once the
 * repository is pushed; NEXT_PUBLIC_OUTLETS_COMMIT overrides it. While both are empty the demo outlets
 * cannot name their prefixes, so no demo release can be opened.
 */
export const OUTLETS_COMMIT: string = "95a5ce34b237760f5583b17eb015cb38d2429345";

export const SITE_NAME = "Embargo";
export const SITE_TAGLINE = "A press embargo with teeth.";
export const SITE_LINE =
  "Outlets that receive a release under embargo post a bond. A page on an outlet's own site that reports the story before the embargo lifts, read by GenLayer validators on the live web, sends that bond to the issuer and the reporter.";

/**
 * The public source repository. No account name is written into the repository: NEXT_PUBLIC_REPO_URL
 * names it, and on Vercel the repository the site was built from names it by itself (its system
 * variables NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER and _SLUG). The footer's Source link is hidden while
 * neither names one, and so is the demo desk, which needs the repository to build the pinned prefixes.
 */
const builtFrom =
  process.env.NEXT_PUBLIC_VERCEL_GIT_PROVIDER === "github" && process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER && process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG
    ? `https://github.com/${process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER}/${process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG}`
    : "";
export const REPO_URL: string = process.env.NEXT_PUBLIC_REPO_URL || builtFrom || "";

/** The contract in use: the deploy's environment first, then the committed address. */
export const contractAddress = (): string => (process.env.NEXT_PUBLIC_CONTRACT || DEMO_CONTRACT || "").trim();

/** The commit the demo outlets' pages are pinned to: 40 lowercase hex characters, or "". */
export const outletsCommit = (): string => {
  const c = (process.env.NEXT_PUBLIC_OUTLETS_COMMIT || OUTLETS_COMMIT || "").trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(c) ? c : "";
};

/** "<owner>/<name>" from a GitHub address, or "" when it is not one. */
export function repoOf(url: string): string {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(String(url || "").trim());
  return m ? `${m[1]}/${m[2]}` : "";
}
