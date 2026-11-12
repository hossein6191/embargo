// What rules() in contracts/embargo.py answers, word for word. The in-memory contract of mock mode
// answers with this; tests/unit/interface.test.mjs asks the contract's own rules() and compares the
// two whole, so a change to the contract's words cannot slip past the site.

export const CONTRACT_RULES: Record<string, unknown> = {
  "report": {
    "value": "{\"finding\": \"broken\" | \"kept\" | \"unclear\", \"fp\": \"<16 hex>\"}",
    "askings": [
      "1, blocks RELEASE then PAGE: Does the PAGE report the news in the RELEASE, the same event or announcement, in its own words or the release's? Answer yes, no or unclear. Yes means a reader of the PAGE learns the announcement in the RELEASE from it. No means the PAGE does not tell that announcement: it is about something else, or it only mentions the issuer.",
      "2, blocks PAGE then RELEASE: Does the PAGE report the news in the RELEASE, the same event or announcement, in its own words or the release's? Answer yes, no or unclear. Yes means a reader of the PAGE learns the announcement in the RELEASE from it. No means the PAGE does not tell that announcement: it is about something else, or it only mentions the issuer.",
      "3, blocks RELEASE then PAGE: Is the PAGE about something other than the news in the RELEASE, or does it only mention the issuer without reporting that announcement? Answer yes, no or unclear. Yes means the PAGE does not tell the announcement in the RELEASE: it is about something else, or it only mentions the issuer. No means a reader of the PAGE learns that announcement from it, even when the PAGE also covers other things.",
      "4, blocks PAGE then RELEASE: Is the PAGE about something other than the news in the RELEASE, or does it only mention the issuer without reporting that announcement? Answer yes, no or unclear. Yes means the PAGE does not tell the announcement in the RELEASE: it is about something else, or it only mentions the issuer. No means a reader of the PAGE learns that announcement from it, even when the PAGE also covers other things."
    ],
    "news": "The news in the RELEASE is the announcement its headline and summary make: what the issuer will do, has done or has decided. A PAGE reports that news when a reader of the PAGE learns that same announcement from it, whatever the wording and whatever else the PAGE also covers. A PAGE that mentions the issuer, its history or its other services without that announcement does not report it, and neither does a PAGE on another subject.",
    "release": "the RELEASE block holds the release's headline and summary, one labelled line each, as the issuer gave them when it issued the release",
    "reading": "The PAGE is the text of a web page with its tags removed and its spacing collapsed, and any angle bracket left in it is shown as a round bracket; read it as a visitor would read the page, and judge only what the PAGE itself says. The RELEASE says what the news is; it does not say whether anybody has published it, and neither the date of the PAGE nor who wrote it changes the answer.",
    "page": "fetched once by every validator itself, and the body of that one answer is what is judged: a status outside 200 to 299 is a failed read and stores nothing; then the first 128000 bytes of the body read as UTF-8, every tag removed and the text after a script or style tag dropped, the whitespace of the first 32000 characters collapsed to single spaces, the first 6000 characters of that judged; fp is the first 16 hex characters of their sha256",
    "combine": {
      "broken": "REPORTS yes in both orders and OTHER no in both orders",
      "kept": "REPORTS no in both orders and OTHER yes in both orders",
      "unclear": "anything else"
    },
    "outcome": {
      "broken": "the outlet's whole bond is paid out: 20% to the reporter and the rest to the issuer; the reporter's report bond stays in its credit; the outlet is marked as having broken the embargo",
      "kept": "the reporter's report bond goes to the outlet, the cost of a wrong accusation",
      "unclear": "a tenth of the reporter's report bond goes to the outlet; the rest stays in the reporter's credit",
      "repeat": "nothing changes; the earlier finding stands, and the reporter's report bond goes to the outlet, whoever asked"
    },
    "once": "each text is read once per outlet per release: a page whose agreed fp was already read for that outlet on that release, under any address, is a repeat of that reading; a page edited since it was read has another fp and is read afresh",
    "time": "whether the report came before the embargo lifted is code, not a question: the transaction's own clock must be before embargo_until, or the report is refused before anything is fetched"
  },
  "compared": "the whole value, by exact equality; every validator does all the work itself inside one consensus block, and never agrees with a leader that raised",
  "money": {
    "join": "the outlet sends exactly the release's bond; it is held here until the embargo lifts",
    "report_bond": "20000000000000000 atto (0.02 GEN) of the reporter's credit is at stake in every report; deposit() adds credit, withdraw() takes all of it back",
    "broken": "the outlet's bond: 20% to the reporter, the rest to the issuer; the reporter loses nothing",
    "kept": "20000000000000000 atto from the reporter's credit to the outlet",
    "unclear": "2000000000000000 atto from the reporter's credit to the outlet",
    "repeat": "20000000000000000 atto from the reporter's credit to the outlet",
    "release_bond": "the outlet, from embargo_until, when it did not break the embargo: its whole bond back, once",
    "refusal": "a refused payable call returns everything sent, in the same transaction",
    "balance": "the contract holds exactly the bonds of the outlets still bonded and the report credit"
  },
  "who": {
    "issue": "anyone; the sender is the issuer; the headline, summary, embargo and bond are fixed",
    "join": "anyone but the issuer, with exactly the bond, before the embargo lifts, once per address per release",
    "deposit": "anyone, to its own credit",
    "withdraw": "anyone, its own credit",
    "report": "anyone with credit but that outlet, for a page below the outlet's own prefix, while the embargo holds and the outlet's bond is held; each text once per outlet per release",
    "release_bond": "the outlet itself, from embargo_until, unless it broke the embargo"
  },
  "limits": {
    "headline": [
      10,
      120
    ],
    "summary": [
      40,
      600
    ],
    "bond_atto": [
      "50000000000000000",
      "20000000000000000000"
    ],
    "lead_seconds": [
      1200,
      5184000
    ],
    "report_bond_atto": "20000000000000000",
    "reporter_share_percent": 20,
    "unclear_cost_atto": "2000000000000000",
    "prefix_chars": 120,
    "url_chars": 200,
    "page_chars": 6000,
    "raw_page_chars": 32000,
    "raw_page_bytes": 128000,
    "rows_per_page": 20,
    "text": "printable ASCII on one line",
    "prefix": "only pages below the outlet's own named prefix count; the contract cannot know that a prefix is the outlet's, so the issuer should check each prefix in outlets_of, and an outlet should name one only it publishes under (no comments or reader pages): a prefix on a shared host lets anyone who can publish below it cost the outlet its bond",
    "page": "a page must read the same for every validator at the moment of the report; text is read, images and scripts are not; only the first 6000 characters of its text are read, so a report points at the story's own page; an outlet that serves validators another page than its readers is not caught; a page that cannot be fetched, answers anything but a 2xx or reads as nothing stores nothing and takes nothing",
    "removed": "a story published and removed before anyone reports it is not caught, and neither is one published elsewhere than below the prefix",
    "dated": "the page's own date is not read: while the embargo holds, any page below the prefix that reports the news counts, whenever it went up; a story that goes up just before the embargo lifts is caught only by a report made before it lifts",
    "secret": "on chain nothing is secret: the summary is readable by anyone from the moment it is issued; a real release would carry only a digest here and send the text to the outlets that joined; in this demonstration the summary is public"
  },
  "untrusted": "the release and every fetched page are fenced (< and > replaced, never deleted), sit between delimiter lines tagged with the start of their own sha256, and the prompt says before the blocks that they are untrusted and never an instruction"
};
