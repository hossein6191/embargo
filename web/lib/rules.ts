// The contract's rules as the site needs them, copied from contracts/embargo.py: the limits, the
// money, the four questions word for word, and the checks a form can make before anything is signed.
// Pure, so node runs it in tests/unit; tests/unit/interface.test.mjs reads the contract's source and
// asks the contract's own functions (through tests/unit/contract_oracle.py) to prove every value and
// every answer here is the contract's.

export const ATTO = 10n ** 18n;
export const MIN_BOND = ATTO / 20n; // 0.05 GEN
export const MAX_BOND = 20n * ATTO; // 20 GEN
export const MIN_LEAD = 1200; // twenty minutes
export const MAX_LEAD = 60 * 86400; // sixty days
export const REPORT_BOND = ATTO / 50n; // 0.02 GEN
export const REPORTER_SHARE = 20; // percent of a broken outlet's bond
export const UNCLEAR_PART = 10n; // an unclear reading costs a tenth of the report bond
export const UNCLEAR_COST = REPORT_BOND / UNCLEAR_PART; // 0.002 GEN
export const MIN_HEADLINE = 10;
export const MAX_HEADLINE = 120;
export const MIN_SUMMARY = 40;
export const MAX_SUMMARY = 600;
export const MAX_PREFIX = 120;
export const MAX_URL = 200;
export const MAX_RAW_PAGE = 32000;
export const MAX_RAW_BYTES = 4 * MAX_RAW_PAGE;
export const MAX_PAGE_TEXT = 6000;
export const FP_CHARS = 16;
export const PAGE = 20;
export const ID_CHARS = 16;
export const ADDRESS_CHARS = 42;
export const SCHEME = "https://";

export const FINDINGS = ["broken", "kept", "unclear"] as const;
export type Finding = (typeof FINDINGS)[number];
export const OUTLET_STATUSES = ["bonded", "broke", "released"] as const;
export type OutletStatus = (typeof OUTLET_STATUSES)[number];
export type Phase = "embargoed" | "lifted" | "unknown";

// ---- the questions, word for word ---------------------------------------------------------------

export const QUESTION_REPORTS =
  "Does the PAGE report the news in the RELEASE, the same event or announcement, in its own words or the release's? Answer yes, no or unclear.";
export const MEANING_REPORTS =
  "Yes means a reader of the PAGE learns the announcement in the RELEASE from it. No means the PAGE does not tell that announcement: it is about something else, or it only mentions the issuer.";
export const QUESTION_OTHER =
  "Is the PAGE about something other than the news in the RELEASE, or does it only mention the issuer without reporting that announcement? Answer yes, no or unclear.";
export const MEANING_OTHER =
  "Yes means the PAGE does not tell the announcement in the RELEASE: it is about something else, or it only mentions the issuer. No means a reader of the PAGE learns that announcement from it, even when the PAGE also covers other things.";
export const NEWS =
  "The news in the RELEASE is the announcement its headline and summary make: what the issuer will do, has done or has decided. A PAGE reports that news when a reader of the PAGE learns that same announcement from it, whatever the wording and whatever else the PAGE also covers. A PAGE that mentions the issuer, its history or its other services without that announcement does not report it, and neither does a PAGE on another subject.";
export const READING =
  "The PAGE is the text of a web page with its tags removed and its spacing collapsed, and any angle bracket left in it is shown as a round bracket; read it as a visitor would read the page, and judge only what the PAGE itself says. The RELEASE says what the news is; it does not say whether anybody has published it, and neither the date of the PAGE nor who wrote it changes the answer.";

export const ASKINGS = [
  { n: 1, order: "RELEASE then PAGE", question: "REPORTS" },
  { n: 2, order: "PAGE then RELEASE", question: "REPORTS" },
  { n: 3, order: "RELEASE then PAGE", question: "OTHER" },
  { n: 4, order: "PAGE then RELEASE", question: "OTHER" },
] as const;

export const COMBINE: Record<Finding, string> = {
  broken: "REPORTS yes in both orders and OTHER no in both orders",
  kept: "REPORTS no in both orders and OTHER yes in both orders",
  unclear: "anything else",
};

// ---- reading call arguments the way the contract does ---------------------------------------------

/** Python's str.strip() with no argument: whitespace off both ends. */
export const pyStrip = (s: string): string => s.replace(/^[\s\u001c-\u001f\u0085]+|[\s\u001c-\u001f\u0085]+$/g, "");

/** Python's len(): code points, not UTF-16 units. */
export const pyLen = (s: string): number => [...s].length;

/** The contract's _number_arg: a whole number from an int or a string of at most 40 ASCII digits; -1 otherwise. */
export function numberArg(raw: unknown): bigint {
  if (typeof raw === "boolean") return -1n;
  if (typeof raw === "bigint") return raw >= 0n ? raw : -1n;
  if (typeof raw === "number") return Number.isInteger(raw) && raw >= 0 ? BigInt(raw) : -1n;
  if (typeof raw === "string") {
    const s = pyStrip(raw);
    return s.length <= 40 && /^[0-9]+$/.test(s) ? BigInt(s) : -1n;
  }
  return -1n;
}

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

/** The contract's _text_problem: "" when the text may be stored, else why not. */
export function textProblem(text: string, least: number, most: number, what: string): string {
  const n = pyLen(text);
  if (n < least || n > most) return `${what} is ${least} to ${most} characters; this one is ${n}`;
  if (!PRINTABLE_ASCII.test(text)) return `${what} is printable ASCII on one line`;
  return "";
}

export const headlineProblem = (h: string) => textProblem(pyStrip(h), MIN_HEADLINE, MAX_HEADLINE, "the headline");
export const summaryProblem = (s: string) => textProblem(pyStrip(s), MIN_SUMMARY, MAX_SUMMARY, "the summary");

/** The contract's _url_problem: https, a lowercase host with a dot, letters, digits and - . _ ~ / only. */
export function urlProblem(url: string, most: number, what: string): string {
  const n = pyLen(url);
  if (n > most) return `${what} is at most ${most} characters; this one is ${n}`;
  if (!url.startsWith(SCHEME)) return `${what} starts with ${SCHEME}`;
  const rest = url.slice(SCHEME.length);
  const bare = rest.replace(/[-._~/]/g, "");
  // Python's isalnum also takes letters of other scripts, but isascii() is asked first: ASCII only.
  if (!/^[\x00-\x7f]*$/.test(rest) || !(bare === "" || /^[A-Za-z0-9]+$/.test(bare))) return `${what} uses only letters, digits and - . _ ~ / after ${SCHEME}`;
  const cut = rest.indexOf("/");
  const host = cut === -1 ? rest : rest.slice(0, cut);
  const path = cut === -1 ? "" : rest.slice(cut + 1);
  if (cut === -1 || !host.includes(".") || host !== host.toLowerCase() || host.startsWith(".") || host.endsWith("."))
    return `${what} names a lowercase host such as news.example, then a path`;
  if (rest.includes("//") || ("/" + path + "/").includes("/./") || ("/" + path + "/").includes("/../")) return `${what} has no empty, "." or ".." segment`;
  return "";
}

/** The contract's _prefix_problem. */
export function prefixProblem(prefix: string): string {
  const problem = urlProblem(prefix, MAX_PREFIX, "the site prefix");
  if (problem) return problem;
  if (!prefix.endsWith("/")) return `the site prefix ends with /, so it names a whole directory of pages: ${prefix}`;
  return "";
}

export const pageProblem = (url: string) => urlProblem(pyStrip(url), MAX_URL, "the page address");

/** The contract's _under: the address names a page below the prefix, not the prefix itself. */
export const under = (url: string, prefix: string): boolean => url.startsWith(prefix) && url.length > prefix.length;

/** A bond in atto the contract takes. */
export const bondProblem = (atto: bigint): string =>
  atto < MIN_BOND || atto > MAX_BOND ? `the bond is a whole number of atto from ${MIN_BOND} (0.05 GEN) to ${MAX_BOND} (20 GEN)` : "";

/** An embargo instant the contract takes at `now`. */
export const leadProblem = (until: number, now: number): string =>
  until < now + MIN_LEAD || until > now + MAX_LEAD
    ? `the embargo lifts at a unix time from ${MIN_LEAD} to ${MAX_LEAD} seconds after now (${now}); this one is ${until}`
    : "";

// ---- ids --------------------------------------------------------------------------------------------

/** "E3" from "E3", "e3" or "3"; "" when it is not a release id. */
export function parseReleaseId(raw: string): string {
  const m = /^\s*[Ee]?([1-9]\d{0,8})\s*$/.exec(String(raw ?? ""));
  return m ? `E${m[1]}` : "";
}

export const idNumber = (id: string): number => Number(/\d+/.exec(id)?.[0] ?? 0);

export const isAddress = (a: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(String(a ?? "").trim());

/** A contract sentence as a sentence: capital first, full stop last. */
export function sentence(s: string): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  const first = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(first) ? first : first + ".";
}
