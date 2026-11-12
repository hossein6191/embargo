# Contracts

One file. `contracts/embargo.py`, class `Embargo`, is the contract.

## Embargo

### Purpose

A press release under embargo whose outlets stake a bond. An issuer issues a
release with a headline, a summary, the instant the embargo lifts and the bond
each outlet stakes. An outlet joins with exactly that bond and the prefix of
its own site. While the embargo holds, anyone else with report credit may
point at a page below an outlet's prefix; the network reads it on the live web
and decides whether it reports the news. A breach pays the outlet's bond out
in the same call, 20% to the reporter and the rest to the issuer; a wrong
accusation pays the reporter's report bond to the outlet. Once the embargo has
lifted, every outlet that kept it takes its bond back.

### Consensus

One round, `_judge(release, url)`, called only from `report()`, which takes no
value. It is one `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` block. The
leader closure holds every `gl.nondet` call in the file: one
`gl.nondet.web.get(url)`, whose status is checked and whose body is the judged
text, and four `gl.nondet.exec_prompt` calls. Nothing is nested.

| asking | built by | blocks |
|---|---|---|
| 1 | `_reports_task(release, page, RELEASE_FIRST)` | RELEASE, PAGE |
| 2 | `_reports_task(release, page, PAGE_FIRST)` | PAGE, RELEASE |
| 3 | `_other_task(release, page, RELEASE_FIRST)` | RELEASE, PAGE |
| 4 | `_other_task(release, page, PAGE_FIRST)` | PAGE, RELEASE |

Each prompt is `HEADER`, `UNTRUSTED`, `EITHER_ORDER`, the two blocks,
`READING`, `NEWS`, the question, its meaning and `RETURN_WORD`. Every line but
the two block bodies is a constant. A block is
`<<<LABEL tag>>>\nbody\n<<<END LABEL tag>>>`, where the label is the
contract's (anything else prints as `BLOCK`), the body is `_fence(text)` cut to
the block's cap (740 characters for the RELEASE, which is the longest release
the door lets in, 6,000 for the PAGE), and the tag is the first 16 hex
characters of the body's own sha256. The longest prompt is under 10,000
characters.

The page is prepared by `_decoded` (the first 128,000 bytes as UTF-8, broken
bytes as the replacement character), `_visible` (tags out, text after a script
or style tag out, the first 32,000 characters walked) and `_page_text`
(whitespace of the first 32,000 characters collapsed, the first 6,000 kept; a
page that reads as nothing is `[TRANSIENT]`). The fingerprint is the first 16
hex characters of the sha256 of that text.

Answers are read by `_read_word` into `yes`, `no`, `unclear` or `""` (never
raising), and `_combine` gives `broken` only on REPORTS yes, yes and OTHER no,
no, and `kept` only on the mirror; everything else, all 254 other
combinations, is `unclear`. The block returns `{"finding", "fp"}`;
`_agrees` refuses a leader that raised, re-runs the whole closure inside
try/except, and compares by exact equality. `_clean_value` reads the agreed
value back into the closed set, and without a well-formed fingerprint nothing
is broken or kept.

### State

| field | what |
|---|---|
| `release_rows["E<n>"]` | `Release`: issuer, headline, summary, embargo_until, issued_at, bond, and its record (outlets, held, broken, released, reports, kept, unclear, repeats, to_issuer, to_reporters, fees_to_outlets) |
| `outlet_rows["E<n>|<address>"]` | `Outlet`: release, outlet, site_prefix, bond, joined_at, status (`bonded`, `broke`, `released`), closed_at, broke_report, reports, fees_won |
| `report_rows["R<n>"]` | `Report`: release, outlet, reporter, url, finding, fp, repeat_of, cost, to_outlet, to_reporter, to_issuer, at |
| `index`, `counts` | numbered lists `outlets:E<n>` and `reports:E<n>`: O(1) append, paged reads |
| `seen["E<n>|<outlet>|<fp>"]` | the report that first read that text for that outlet on that release |
| `balances[<address>]` | report credit |
| totals | held, bonds in, released, to issuers, to reporters, credit, deposited, credit out, fees to outlets, returned, and the counts |

Storage dataclasses hold scalars only (`Address`, `str`, `u256`, `u64`,
`u32`); lists are numbered slots keyed by string. Addresses are compared and
keyed in lower case.

### Methods

| method | kind | notes |
|---|---|---|
| `issue(headline, summary, embargo_until, bond)` | write | open on purpose; the sender is the issuer |
| `join(release, site_prefix)` | payable write | never raises, never asks the model; every refusal returns the value |
| `release_bond(release, outlet)` | write | the outlet only, from embargo_until, unless it broke |
| `deposit()` | payable write | open on purpose; never raises |
| `withdraw()` | write | open on purpose; pays only the sender's own credit |
| `report(release, outlet, url)` | write | anyone but that outlet; every refusal before the fetch; the one consensus round |
| `release`, `releases`, `outlets_of`, `outlet`, `reports_of`, `credit`, `stats`, `rules` | views | short arguments, at most 20 rows |

Value leaves through `_Payee(address).emit_transfer(value=...)` from six named
places: `_refuse` (a refused payment), `withdraw`, `report` (the report bond to
the outlet), `_forfeit` (the two shares of a broken outlet's bond) and
`_pay_back` (a kept bond). `_forfeit` is called only from `report`, `_pay_back`
only from `release_bond`.

### Loops

Every loop is bounded by a named constant: `URL_SIGNS` (five signs),
`FP_CHARS` (16), `MAX_RAW_PAGE` (the tag walk), and `PAGE` (20 rows in every
list view). No write walks a list. A static test lists every loop and fails on
a new one.

### Errors

`[EXPECTED]` is a rule of this contract and stores nothing. `[TRANSIENT]` is a
page that could not be fetched, answered outside 2xx or read as nothing, and
`[LLM_ERROR]` a model call that failed: both are raised in the leader, never
agreed with, and leave no trace.

### Limits

Only pages below the outlet's own named prefix count. A page must read the
same for every validator. Text only, the first 6,000 characters. A story
published and removed before anyone reports it is not caught. On chain nothing
is secret: the summary is public from issue. The full list is in `rules()` and
in the README.
