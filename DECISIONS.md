# Decisions

Why each rule is the way it is. Each one names what it protects against.

## 1. The outlet's own site is the evidence

An embargo is broken where the outlet publishes, so the only page that counts
is one below the prefix the outlet named when it staked its bond. The reporter
does not upload anything and the issuer does not describe the breach: the
validators fetch the page themselves. Whoever controls a URL controls what it
says, which is why the prefix is the outlet's own choice, made with its money
at stake, and why the limits say plainly that a prefix on a shared host lets
anybody who can publish below it cost the outlet its bond. The contract cannot
tell whether a prefix really belongs to the outlet; in a real deployment the
issuer would send the text off chain only to outlets whose prefix it
recognises.

The address is checked before anything is fetched: `https`, a lowercase host
with a dot, letters, digits and `- . _ ~ /` only, no query, fragment, port,
percent sign, empty segment, `.` or `..`. One page has one spelling, and a path
cannot climb out of the prefix it starts with. The address never reaches the
prompt.

## 2. Two framings, both orders, one block

REPORTS asks whether the page reports the news; OTHER asks the mirror, whether
it is about something else or only mentions the issuer. Each is asked with the
release first and with the page first, all four inside the one block, because
position bias is invisible to consensus otherwise: every validator builds the
prompt the same way and would lean the same way. `broken` needs REPORTS yes
twice and OTHER no twice; `kept` the mirror; anything else is `unclear`. A
model that says yes to everything, one that answers by the order of the
blocks, and one that answers one framing only all land in unclear, and the
suite shows each.

The two questions are the design's, word for word. OTHER carries an "or"
because a page that does not report the announcement has two typical shapes;
both mean the same answer, and its meaning line says so in one condition
("Yes means the PAGE does not tell the announcement in the RELEASE"). The one
definition of the news, `NEWS`, stands before both questions so that neither
has to define anything itself, and it settles the case a compound reading
would leave open: a page that reports the announcement as one item among
others reports it.

## 3. The value, not a tolerance

The block returns `{"finding", "fp"}` and validators compare it whole, by
exact equality. The fingerprint is in the value on purpose: a page that reads
differently for different validators (an edit between fetches, a rotating
headline) gets no consensus and stores nothing, rather than a finding about a
page somebody else saw. There is no tolerance anywhere to argue for.

## 4. The time is code

Whether the report came before the embargo lifted is the transaction's own
clock, `gl.message_raw["datetime"]`, against the stored instant, checked
before anything is fetched. Nothing about time reaches the model, and the
page's own date is not read: while the embargo holds, a page below the prefix
that reports the news counts, whenever it went up. At the instant the embargo
lifts, reports stop and bonds can come back; the two windows never overlap.

## 5. A failure is never a finding

A fetch that fails, a status outside 2xx, a page that reads as nothing and a
model call that fails are raised in the leader as `[TRANSIENT]` or
`[LLM_ERROR]`. A validator never agrees with a leader that raised, and its own
failure is a disagreement. Nothing is written before the round, so a round
that does not settle takes nothing and the report may be made again. An error
page is never judged, even when its text looks like the story.

## 6. Each text once, and no free re-roll

The same text is read once per outlet per release. A page whose agreed
fingerprint was already read for that outlet is a repeat: the earlier finding
stands and the full report bond goes to the outlet, under any spelling of the
address. An unclear reading costs only a tenth, so a repeat of it costs the
full bond: asking again is never cheaper than being wrong. A page edited since
it was read has another fingerprint and is read afresh, which is exactly the
case of an outlet that puts the story up at an address that held something
harmless. The same text on another outlet, or on another release, is a
different question and is read afresh.

## 7. The money is already here, and moves in the same call

The bond is taken at join, so a breach pays out in the report that finds it,
with no claim step and no second party to cooperate: 20% to the reporter
(`bond * 20 // 100`, an integer) and the rest to the issuer, so the two shares
always add up to the bond. A wrong accusation is paid by the accuser to the
accused. The reporter must hold the report bond even to catch a breach, so
every report has something at stake; a breach costs it nothing.

Every atto has an owner who can take it out with one call: a held bond by its
outlet from the lift, a credit by its owner at any time, a broken bond at
once. Nothing waits on anybody else, and every settlement is O(1).

## 8. The doors

- `issue` is open: the sender becomes the issuer of a new release and nothing
  else is touched.
- `join` refuses the issuer, a second join from the same address (letter case
  does not matter), a join from the lift on, any amount but the bond, and a
  prefix that is not a plain `https` directory. It is payable, never raises,
  never asks the model, and returns every refused atto in the same
  transaction.
- `report` refuses the outlet itself, an outlet that already broke the
  embargo or took its bond back, an address outside the prefix, a report from
  the lift on, and a reporter without the report bond, all before the fetch.
- `release_bond` refuses anyone but the outlet, any time before the lift, an
  outlet that broke the embargo, and a second call.

There is no cap a stranger can fill: any number of outlets may join a release
and any number of reports may be made. Dedupe is by address only, so nobody
can block an outlet by naming its prefix first.

## 9. Views

Every view takes at most three short arguments, reads at most 16 characters
of an id and 42 of an address, and returns at most 20 rows. `rules()` carries
the four askings, the definition, the combine table, the money and the limits
in the contract's own words.

## 10. Verified, and not verified

Verified offline, on every run of `pytest tests/ -q`: every rule and refusal,
the join refunds and dedupe, each finding and its money to the atto, the
repeat rule, the time check at the instant of the lift, `release_bond`, orders
disagreeing, failed fetches and failed models leaving no state, the static
rules (bounded loops, sender checks, nondet only in the closure, fencing,
payable writes that never ask the model), and the books balancing after every
step of sixteen seeded random journeys. `tools/mutate.py` removes 229 defences
one at a time and every one is caught.

Not verified offline: how a real model reads the demonstration pages, and how
Studio's validators fetch them. That is what `tests/on_chain/smoke.mjs` is
for, and its record goes in the README once it has run.
