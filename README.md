# Embargo

A press embargo with teeth: outlets that receive a release under embargo post
a bond, and a page found on an outlet's own site reporting the story before
the embargo lifts, read by validators on the live web, sends that outlet's
bond to the issuer.

## The problem

A company or a lab that has news to announce sends it to journalists ahead of
time, "under embargo": they may read it, interview people and write their
stories, but publish nothing until a stated hour. It is how a ferry company
gets its new route covered properly on the morning it is announced, and how a
lab gets a careful write-up of a result instead of a rushed one.

The embargo is a promise and nothing more. An outlet that breaks it gets the
story first and the traffic that comes with it; the worst it risks is being
left off the next list. The issuer can complain, but the outlet controls its
own site and there is nobody neutral to say whether the page that went up
early really reported the announcement or only mentioned the company. So the
promise is cheap to break, and everybody knows it.

## What it is

An **issuer** issues a release: a headline (10 to 120 characters), a summary
of the news (40 to 600 characters), the instant its **embargo lifts** (at
least twenty minutes and at most sixty days ahead) and the **bond** each
outlet must stake to receive it (0.05 to 20 GEN). Nothing is paid to issue.

An **outlet** joins the release before the embargo lifts by sending exactly
that bond and naming the **prefix of its own website**, one `https` address
ending in `/` below which its stories are published, such as
`https://harbourpost.example/news/`. One join per outlet address per release.
A refused join sends every atto back in the same transaction. The bond is held
by the contract until the embargo lifts.

While the embargo holds, **anyone but that outlet** with a little **report
credit** may point at a page below the outlet's prefix: the issuer, a rival
outlet, a reader. Every validator fetches the page itself and reads it against
the release, and the network agrees on one of three findings:

- **broken**: the page reports the news in the release. In the same
  transaction the outlet's whole bond is paid out: **20% to the reporter, 80%
  to the issuer**. The reporter's 0.02 GEN report bond stays in its credit,
  and the outlet is marked as having broken the embargo on that release.
- **kept**: the page is about something else, or only mentions the issuer.
  The reporter's 0.02 GEN report bond goes to the outlet: the cost of a wrong
  accusation.
- **unclear**: anything else, including the two orders of a question
  disagreeing. A tenth of the report bond (0.002 GEN) goes to the outlet; the
  rest stays in the reporter's credit.

The same text is read once per outlet per release: a page whose fingerprint
was already read for that outlet is a **repeat**, the earlier finding stands,
and the full report bond goes to the outlet. Whether the report came before
the embargo lifted is not a question for anybody: it is the transaction's own
clock against the stored instant, and a report from that instant on is
refused before anything is fetched.

From the instant the embargo lifts, an outlet that did not break it takes its
**whole bond back** with `release_bond`. An outlet that broke it has nothing
to take back.

The demonstration release is E1, "Lantern Bay Ferries adds a night crossing to
Gull Island", whose summary reads "Lantern Bay Ferries will add a night
crossing to Gull Island from 1 June, the first in 30 years". Its two outlets
are fictional and their pages are in `outlets/`.

## How consensus is used

One consensus block per report, inside `report()`, which takes no value. Every
validator fetches the page once with `gl.nondet.web.get`, and the body of that
one answer is what is judged: a status outside 200 to 299 is a failed read and
stores nothing. The first 128,000 bytes are read as UTF-8, every tag is
removed (and the text after a script or style tag), the whitespace of the
first 32,000 characters is collapsed, and the first 6,000 characters are
judged. Their sha256, cut to 16 hex characters, is the page's fingerprint.

The node then asks four askings over two blocks, the **RELEASE** (the headline
and the summary, one labelled line each) and the **PAGE**, each fenced (every
`<` and `>` replaced, never deleted) and closed by a line tagged with the
start of its own sha256:

| asking | blocks | question |
|---|---|---|
| 1 | RELEASE then PAGE | REPORTS |
| 2 | PAGE then RELEASE | REPORTS |
| 3 | RELEASE then PAGE | OTHER |
| 4 | PAGE then RELEASE | OTHER |

The questions, word for word:

> **REPORTS**: "Does the PAGE report the news in the RELEASE, the same event or
> announcement, in its own words or the release's? Answer yes, no or unclear."
>
> **OTHER**: "Is the PAGE about something other than the news in the RELEASE,
> or does it only mention the issuer without reporting that announcement?
> Answer yes, no or unclear."

Each is followed by what its yes and its no mean, and before them stands one
definition of the news: the announcement the headline and summary make, which
a page reports when a reader learns that same announcement from it, whatever
the wording and whatever else the page also covers. A page that mentions the
issuer, its history or its other services without the announcement does not.

| finding | when |
|---|---|
| broken | REPORTS yes in both orders and OTHER no in both orders |
| kept | REPORTS no in both orders and OTHER yes in both orders |
| unclear | anything else |

The block returns `{"finding": ..., "fp": <16 hex>}`. Each validator does all
the work itself and compares the **whole** value by exact equality, so a page
that reads differently for different validators, or a model that leans on the
order of the blocks, gets no consensus or lands in unclear. A leader whose
fetch or model call failed is never agreed with: nothing is written, nothing
is taken, and the report may be made again. The model never sees an amount,
an address, an id or a clock. `rules()` publishes the four askings, the
definition, the combine table and the money in the contract's own words.

## Why the live web makes it a GenLayer job

The breach is a page on the outlet's own website, at the moment somebody
looks, and the question about it is one of meaning: a weather column, a
feature about the ferry company's seventy years, and a story that tells
readers about the night crossing before 1 June can all sit under the same
prefix and all name the company. Only the last one breaks the embargo. A
deterministic contract cannot fetch the page, and it could not tell those
three apart if it did. An oracle run by the issuer would be the issuer reading
the outlet's site for both of them, and the outlet's own word is worth exactly
what the embargo was worth before.

Here every validator fetches the page independently, reads it with its own
model in both orders and both framings, and the bond moves on the value they
agreed on, from money the contract already holds. Nobody uploads a
screenshot, and the time of the report is the chain's clock, not anybody's
claim.

## Who may do what

| call | who | when |
|---|---|---|
| `issue(headline, summary, embargo_until, bond)` | anyone; the sender is the issuer | the text, the embargo and the bond are fixed for good |
| `join(release, site_prefix)` + exactly the bond | anyone but the issuer, once per address per release | before the embargo lifts; every refusal returns what was sent |
| `deposit()` + value | anyone, to its own credit | any time |
| `withdraw()` | anyone, all of its own credit | any time |
| `report(release, outlet, url)` | anyone with at least 0.02 GEN of credit, but that outlet | while the embargo holds and the outlet's bond is held; the page below the outlet's prefix |
| `release_bond(release, outlet)` | that outlet only | from the instant the embargo lifts, once, unless it broke the embargo |

Views take short arguments and return at most twenty rows: `release(id)`,
`releases(offset, limit)`, `outlets_of(release, offset, limit)`,
`outlet(release, address)`, `reports_of(release, offset, limit)`,
`credit(address)`, `stats()`, `rules()`.

## The money

| event | from | to |
|---|---|---|
| join | the outlet | held here: exactly the release's bond |
| report found **broken** | the outlet's bond | 20% to the reporter, the rest to the issuer; the reporter's credit untouched |
| report found **kept** | 0.02 GEN of the reporter's credit | the outlet |
| report found **unclear** | 0.002 GEN of the reporter's credit | the outlet |
| a **repeat** of a text already read for that outlet | 0.02 GEN of the reporter's credit | the outlet; the earlier finding stands |
| `release_bond`, from the lift, an outlet that kept the embargo | its bond | back to the outlet |
| a refused join or deposit | what was sent | back to the sender, in the same transaction |
| `withdraw` | the sender's credit | the sender |

Every settlement is O(1): a report touches one outlet and pays at most three
transfers, a bond comes back in one call, and no write walks a list. The
contract holds exactly the bonds of the outlets still bonded and the report
credit, and the offline suite checks that after every step of sixteen seeded
random journeys.

## The limits, stated plainly

- **On chain nothing is secret.** The summary is readable by anyone from the
  moment it is issued, joined or not. A real release would put only a digest
  here and send the text off chain to the outlets that joined. In this
  demonstration the summary is public, and the site shows it to the outlets
  that joined.
- **Only pages below the outlet's own named prefix count.** A story published
  anywhere else, on another domain, in a newsletter or on social media, is not
  caught. The contract cannot know that a prefix is really the outlet's, so the
  issuer should check every prefix in `outlets_of` before it sends anything off
  chain. Everything below the prefix counts as the outlet's: an outlet should
  name one only it publishes under, with no comments or reader pages, because a
  prefix on a shared host lets anyone who can publish below it cost the outlet
  its bond.
- **A page must read the same for every validator.** A page with a clock, a
  rotating headline or personalised content gets no consensus and stores
  nothing. An outlet that serves validators another page than its readers is
  not caught.
- **Text only.** Images, video and scripts are not read, and only the first
  6,000 characters of a page's text are, so a report should point at the
  story's own page rather than a front page.
- **A story published and removed before anyone reports it is not caught.**
  Nor is a story that goes up a minute before the embargo lifts and is found
  after: reports are taken only while the embargo holds, by the transaction's
  own clock.
- **The page's own date is not read.** While the embargo holds, any page below
  the prefix that reports the news counts, whenever it went up.
- **The findings are a model's reading.** Two framings in two orders, compared
  exactly, keep a leaning model from deciding alone, but a page that honestly
  sits between reporting and mentioning lands in unclear, and costs its
  reporter a tenth of the report bond.

## What is in this repository

```
contracts/embargo.py            the contract
outlets/harbour-post/           The Harbour Post: early-story.html, weather.html, ferries-feature.html
outlets/bay-gazette/            The Bay Gazette: story-after.html, published after the embargo
tests/test_pure.py              the offline suite, including the consensus round with a world per node
tests/MUTATIONS.md              every defence removed in turn, and the test that caught it
tests/on_chain/smoke.mjs        a throwaway-account run against Studio
tools/mutate.py                 the generator that writes MUTATIONS.md and refuses to if anything survives
web/                            the site (see The site)
CONTRACTS.md                    purpose, consensus, state, methods, loops, errors and limits
DECISIONS.md                    why each rule is the way it is, and what is verified and what is not
```

## Running it

```
pip install -r requirements-dev.txt
pytest tests/ -q                              # no network, no Studio
genvm-lint check contracts/embargo.py
python tools/mutate.py                        # rewrites tests/MUTATIONS.md; exits 1 if a mutant survives
```

On this repository as it stands, `pytest tests/ -q` gives **125 passed** in
about a second. `genvm-lint check` (genvm-linter 0.11.0) prints
`Lint passed (3 checks)` and reports 14 methods, 8 view and 6 write.
`python tools/mutate.py` removes or inverts **229 defences** one at a time,
and **none survives**.

The on-chain run uses five throwaway keys it generates itself (ISSUER, POST,
GAZETTE, REPORTER, STRANGER) and funds them from the Studio faucet. It never
touches anybody's own wallet. The validators read the outlets' pages from
GitHub at one commit, so push the repository first and pass that commit:

```
npm ci
COMMIT=<40-character sha> node tests/on_chain/smoke.mjs        # about forty minutes
COMMIT=<sha> RESUME=1 node tests/on_chain/smoke.mjs            # continue from the saved state
```

`REPO=<owner>/<name>` names the GitHub repository when the git remote does
not. The script fetches the pages itself before it deploys anything and stops
if they are not at that commit. ISSUER issues E1 with its embargo about 25
minutes ahead and a 1 GEN bond; ISSUER is refused its own join, POST joins and
is refused a second join, GAZETTE's short payment is refused and returned
before it joins, and POST is refused its bond while the embargo holds. Then,
one consensus round each: weather.html is kept and the 0.02 GEN goes to POST;
ferries-feature.html is kept or unclear; early-story.html is broken, 0.2 GEN to
REPORTER and 0.8 GEN to ISSUER. A report with no credit, POST reporting itself,
an address outside POST's prefix and a second report of POST are each refused
before anything is fetched. Once the embargo has lifted by the chain's own
clock, a report of GAZETTE's story-after.html is refused, STRANGER is refused
GAZETTE's bond, GAZETTE takes its 1 GEN back once, and POST cannot take back
the bond it lost. The script then reads the deployed code back and compares it
with `contracts/embargo.py` byte for byte, checks the views, takes the credit
back, and checks that the contract holds nothing and every account ended where
the money table says. It prints a PASS or FAIL line for every check,
`N passed, M failed`, and the contract address.

## The site

`web/` is the site (Next.js 16; on Vercel, Root Directory `web`). It looks like a news-wire teleprinter: every
release is printed as a wire item headed "HOLD FOR RELEASE UNTIL hh:mm" with a live countdown, the outlets
that joined it are its subscriber lines, and every report comes back as a wire bulletin ("FLASH: EMBARGO
BROKEN - HARBOUR POST", "NOTED: PAGE IS ABOUT SOMETHING ELSE") with the page's fingerprint, its address and
where the money went.

| page | what it is for |
|---|---|
| `/` | the promise in one minute, how the money moves, where to start |
| `/release` | the demo release: deposit report credit, then report a demo outlet's page with one click |
| `/release/<id>` | any release: its outlets, the report desk, its bulletins, an outlet's key to take its bond back |
| `/issue` | issue a release of your own, then invite the two demo outlets to join it |
| `/outlet` | join a release with a bond and a site prefix, and take the bond back once it lifts |
| `/ledger` | the contract's totals and every release, newest first |
| `/how` | the four questions word for word, why GenLayer, the money, the limits, and `rules()` read live |

One visitor wallet can try everything. The site's server holds one throwaway Studio secret, `DEMO_KEY`, and
derives three accounts from it (keccak256 of the key and a label): the demo issuer, Lantern Bay Ferries, and
the two demo outlets, The Harbour Post and The Bay Gazette, whose sites are this repository's `outlets/`
folders on raw.githubusercontent.com pinned to one commit. `POST /api/demo/open` issues a fresh demo release
when none is still under embargo (embargo about thirty minutes ahead, 0.1 GEN bond) and has both demo
outlets join it; `POST /api/demo/join` has them join a release the visitor issued. The server signs only
those calls, with fixed words: nothing a visitor types is ever signed. `GET /api/demo/status` says whether the
desk can act and exactly why not.

Every waiting moment (a wallet prompt, a report being read, every state of a release for the issuer, an
outlet, the reporter and a reader) says what is happening, how long it takes, whether you must act, whether
you can leave and where the money is (`web/lib/guide.ts`).

```
cd web
npm ci
npm run dev:mock                     # the whole site on an in-memory copy of the contract, no wallet
npm run typecheck && npm run lint && npm run test:site && npm run build
```

`npm run test:site` checks every call against `contracts/embargo.py` (and asks the contract's own functions
through Python for the limits, the questions, `rules()` and each page's fingerprint), walks the in-memory
contract through every outcome with every atto accounted for, the waiting copy for every state and role,
every suggestion against the limits, the demo key reader, and that no file carries anything personal.

To bring the demo desk online after the contract is deployed and the repository pushed:

```
REGISTER=<contract> DEMO_KEY=<64 hex> COMMIT=<sha> node tools/open-demo.mjs     # DRY=1 prints the calls only
```

then set `DEMO_CONTRACT` and `OUTLETS_COMMIT` in `web/lib/config.ts` (or `NEXT_PUBLIC_CONTRACT` and
`NEXT_PUBLIC_OUTLETS_COMMIT`), `DEMO_KEY` on the host, and check that `GET /api/demo/status` answers
`"online": true`. `web/.env.example` lists every setting.

## Network

GenLayer Studio, chain 61999, RPC `https://studio.genlayer.com/api`, explorer
`https://explorer-studio.genlayer.com`. The contract pins the runner
`py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` in its first
line.

## Evidence

Run on 13 November 2026 on GenLayer Studio (chain 61999) by `tests/on_chain/smoke.mjs`, from generated accounts funded from the
Studio faucet, none of them anybody's wallet: **ISSUER** issues the release, **POST** and **GAZETTE** join as outlets, **REPORTER** reports pages, **STRANGER** tries what it may not; the outlet pages were the files in `outlets/` pinned to commit 95a5ce34b237760f5583b17eb015cb38d2429345. **30 passed, 0 failed**; transactions: 22 in 22 steps; sent a second time: none.
The whole log is `tests/on_chain/smoke-run.log`. Every validator read Harbour Post's pages against the release: the weather column read kept (the reporter's bond went to the outlet), and the early story read broken: 20% of Harbour Post's bond went to the reporter and 80% to the issuer in that transaction. After the embargo lifted a report was refused and Bay Gazette took its bond back.

- `embargo.py` deployed at [`0xd9e326E6890BaAeb2E8885782f5A7D140BE5b5e3`](https://explorer-studio.genlayer.com/address/0xd9e326E6890BaAeb2E8885782f5A7D140BE5b5e3)

- the code deployed at 0xd9e326E6890BaAeb2E8885782f5A7D140BE5b5e3 is byte for byte contracts/embargo.py: 63311 bytes, sha256 cfeb568beac1306a755dde729e177898e1899d035515d7f43e62cae26a3de88e

| step | by | transactions | votes |
|---|---|---|---|
| ISSUER issues E1, "Lantern Bay Ferries adds a night crossing to Gull Island", under an embargo about 25 minutes ahead; each outlet stakes 1 GEN | ISSUER | [0x5d82c208…](https://explorer-studio.genlayer.com/tx/0x5d82c2086e9419d3d9ed715e85d93700af9b5e46e42c9c24b906eeb71219cc30), [0x13386598…](https://explorer-studio.genlayer.com/tx/0x13386598fb999af7872ef655b9178167b4846b5a033008d2c164a87271320fc1) | 3 agree, 0 disagree, 2 idle |
| ISSUER may not join its own release as an outlet, and the 1 GEN comes back in the same transaction | ISSUER | [0xa2e9003b…](https://explorer-studio.genlayer.com/tx/0xa2e9003b3b33bf78be9ec90a14ec290aba728fb803609431341780b71372e2f0) | 3 agree, 0 disagree, 2 idle |
| POST joins E1 with 1 GEN and its prefix outlets/harbour-post/, and the receipt carries the release | POST | [0xeff29957…](https://explorer-studio.genlayer.com/tx/0xeff29957ff035f119b717b69f4834750fbb1358791030012481a4ec30e512712) | 3 agree, 0 disagree, 2 idle |
| POST's second join is refused (one join per outlet per release) and its 1 GEN comes back | POST | [0x6e5413db…](https://explorer-studio.genlayer.com/tx/0x6e5413dbe02e5362a1a6a9c99f36013956eee85985102981035e4c3339f16077) | 3 agree, 0 disagree, 2 idle |
| GAZETTE sends 0.9 GEN for a 1 GEN bond: refused, and the 0.9 GEN comes back | GAZETTE | [0xe00a62b7…](https://explorer-studio.genlayer.com/tx/0xe00a62b7665011a64b1eb6d192aef14228453a5d04dba678282fa7be0142a29c) | 3 agree, 0 disagree, 2 idle |
| GAZETTE joins E1 with 1 GEN and its prefix outlets/bay-gazette/ | GAZETTE | [0x883f6c42…](https://explorer-studio.genlayer.com/tx/0x883f6c42a0ffce0879c33b78874dbef1b01ef737cb40a0efeb6bc1777eb3094f) | 3 agree, 0 disagree, 2 idle |
| POST may not take its bond back while the embargo holds | POST | [0xd2906781…](https://explorer-studio.genlayer.com/tx/0xd290678104e88fc1b4fdc093d14b694726a60233c2f1584b700dbf54d3e74358) | 3 agree, 0 disagree, 2 idle |
| REPORTER reports with no credit: refused before anything is fetched | REPORTER | [0xfe171167…](https://explorer-studio.genlayer.com/tx/0xfe171167dbdd69b4730b793aa02934ca25e50855338b9dd4974564d380358308) | 3 agree, 0 disagree, 2 idle |
| REPORTER deposits 0.1 GEN of report credit | REPORTER | [0xa519eb7a…](https://explorer-studio.genlayer.com/tx/0xa519eb7a9e95e607265cb1e9476748231d96d78737faf849b66fccda972510dd) | 3 agree, 0 disagree, 2 idle |
| POST may not report itself | POST | [0x7dfdebe3…](https://explorer-studio.genlayer.com/tx/0x7dfdebe39f26d43fd3ad7c6c1813d963f888fcd3f5d2e8bbc6343d82dd85198a) | 3 agree, 0 disagree, 2 idle |
| REPORTER points at the repository's README as a POST page, outside POST's prefix: refused before any fetch, nothing taken | REPORTER | [0x02c3ce10…](https://explorer-studio.genlayer.com/tx/0x02c3ce10fafb6c908cd319d2ace64e23ff8a4eb2d3349d9d4c54fbfbc59392c5) | 3 agree, 0 disagree, 2 idle |
| every validator reads weather.html (a weather column): kept, and REPORTER's 0.02 GEN goes to POST | REPORTER | [0xf4b1310b…](https://explorer-studio.genlayer.com/tx/0xf4b1310beb9b9029c3c1f1572d7157ff0191019195a1eb2f2349a3d4bd614a58) | 3 agree, 0 disagree, 2 idle |
| every validator reads ferries-feature.html (the company's history, not the announcement): kept, or unclear, and POST is paid the matching part of the report bond | REPORTER | [0x43d7451c…](https://explorer-studio.genlayer.com/tx/0x43d7451ce2dd10361d9ae875a124cdc6a4bc17230c7922f92ef48fbc2ce59881) | 3 agree, 0 disagree, 2 idle |
| every validator reads early-story.html (the night crossing, before the embargo): broken; 0.2 GEN to REPORTER, 0.8 GEN to ISSUER, REPORTER's credit untouched | REPORTER | [0xa7373c27…](https://explorer-studio.genlayer.com/tx/0xa7373c27a8ea81333aab1fd5d2aefaae4c0efe9e59067290cfea3202cf84880b) | 3 agree, 0 disagree, 2 idle |
| POST cannot be reported again: its bond is already paid out, refused before anything is fetched | REPORTER | [0x4523f61e…](https://explorer-studio.genlayer.com/tx/0x4523f61efd0d7982d5de3ddbbd9b0f39c28b6b57e6a885e72f04d896e52a9fe4) | 3 agree, 0 disagree, 2 idle |
| after the embargo, REPORTER reports GAZETTE's story-after.html: refused before anything is fetched; a story published after it breaks nothing | REPORTER | [0x022a5185…](https://explorer-studio.genlayer.com/tx/0x022a5185b779f8b26ea8128121a2fb0658acef354081c8a463dc110517d40e98) | 4 agree, 0 disagree, 1 idle |
| STRANGER may not take GAZETTE's bond | STRANGER | [0xd95b97f3…](https://explorer-studio.genlayer.com/tx/0xd95b97f3d4d02c701aade574169c983cfaf74d6fa16127896bf272a82efef478) | 4 agree, 0 disagree, 1 idle |
| GAZETTE kept the embargo and takes its 1 GEN back | GAZETTE | [0x51d97904…](https://explorer-studio.genlayer.com/tx/0x51d97904cb294aa085339ee8e7ebffb13000b49b37d43defcbe916995d437327) | 3 agree, 0 disagree, 2 idle |
| GAZETTE's second release_bond is refused: a bond is paid out once | GAZETTE | [0xd3d63ad2…](https://explorer-studio.genlayer.com/tx/0xd3d63ad250fc7c25b97cf9aee7bf2b08049bf735bd280d8dc6325c40e7aad87c) | 3 agree, 0 disagree, 2 idle |
| POST cannot take back a bond it lost | POST | [0xd019e2ab…](https://explorer-studio.genlayer.com/tx/0xd019e2ab437530be1f92888d263cef493be0b94fc055820927bb838c8cc45166) | 3 agree, 0 disagree, 2 idle |
| REPORTER takes its 0.06 GEN of credit back | REPORTER | [0x346c0f0f…](https://explorer-studio.genlayer.com/tx/0x346c0f0f12ba7040cac9ec3109981adcca7b792ab6fbd33f561f9ddefe5e3b97) | 4 agree, 0 disagree, 1 idle |

## Licence

MIT. See `LICENSE`.
