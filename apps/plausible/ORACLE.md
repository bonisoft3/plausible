# The oracle

How every number this app shows is graded, by what, and what a red run looks
like.

The shape is chess's. There, `Legal` carries every move the position allows
with the position it leads to, so perft reaches the engine through the app's
own rows and there is no test-only surface; the two checks are **cardinality**
(is the row set exactly the set that should exist) and **value** (is each row
right). Here, `Bucket`, `Breakdown` and `Topline` carry every answer the
declared question space allows, and the two checks are the same two. Cardinality
is asserted first, always, because a missing row must fail as a missing row and
not as a value mismatch somewhere else.

Every definition below is written as arithmetic over integers. A definition
carried as a word — "thirty minutes", "the last seven days", "the visits in the
bucket" — is a definition the two implementations can read differently and
agree by luck, which is the one failure this apparatus exists to prevent.

---

## 1. The fixture

### 1.1 What it is

`fixtures/events.json` — **1 200 hits over 35 local days**, sorted by
`(epoch, id)`, eight columns:

```
id · epoch · visitor · name · interactive · pathname · source · browser
```

Nothing else. Every dimension the app breaks down by is one of these columns
or is derived from them; a column no screen reads is the fossil this tree has
no lint for, so the log carries none.

`epoch` is spelled as the app's `timestamp` carrier —
`2026-03-04T23:00:00.000000Z` — because the app seeds `Event` from these bytes.
Every reader takes it to whole UTC seconds on load (the handlers, the engine,
the oracle), and everything below is stated in those seconds.

The window is fixed and stated as integers, because a timezone is what this
app grades and a date string would beg the question:

| | UTC seconds | reads as |
|---|---|---|
| the log's first hit | `1772665200` | 2026-03-05T00:00 Europe/Berlin (CET, +01:00), a **Thursday** |
| the clock moves forward | `1774746000` | 01:59:59 CET → 03:00:00 CEST on 2026-03-29 |
| the log's last hit | `1775650740` | 2026-04-08T14:19 Europe/Berlin (CEST, +02:00) |
| `as_of_epoch` | `1775650800` | 2026-04-08T14:20 Europe/Berlin, a **Wednesday** |

`1775650800 − 1772665200 = 2985600`. Read as local days that is 34 whole ones
plus 14 h 20 m, and one of the 34 is 23 hours long:
`34 × 86400 − 3600 + 51600 = 2985600`. Three properties of that window are
load-bearing and each is asserted literally in `oracle.test.ts`:

- **the first local day is mid-week.** A Monday-aligned corpus makes a
  Monday-start week and a Sunday-start week produce the same bucket count on
  every range, which hides the week rule completely.
- **`as_of` is not local midnight.** It is 14 h 20 m into its local day, so a
  range read as "N × 86400 seconds back from `as_of`" and a range read as "the
  N local days ending with the as-of day" differ by more than half a day and
  cannot be confused for one another. At local midnight the two coincide and the
  whole of the range arithmetic goes ungraded.
- **the clock change is interior.** It is 24 local days after the first hit and
  10 before the last, so it sits inside three of the five ranges (§2.1) — `28d`,
  `custom_21d` and the day pinned to it — rather than at an edge where a clamp
  would hide it.

`as_of_epoch` is seeded onto the `Filter` row: it is the app's entire clock, and
it is data. Nothing in the app reads a real clock, so a run in 2030 grades the
same numbers.

Shape, counted off the committed file: **400 visits, 251 distinct visitors**, 12
pathnames, 11 of which are entered on, 9 sources (one of them `direct`), 5
browsers, and 1 200 hits split **750 `pageview` · 350 `engagement` ·
100 `signup`**, so the log's `events` count (§2.1) is 850 and its `pageviews`
count is 750. The strict chain `visitors < visits < pageviews` holds by
construction, not by luck (251 < 400 < 750), and §5.3 asserts it per range and in
three buckets of every granularity rather than trusting the ratio.

Two local days are deliberately dense at **90 hits each** — **2026-03-29** and
**2026-04-08**, which are the only two days an hour axis ever covers (§2.1) —
leaving 30 or 31 a day across the other 33.

**No column is a function of another.** For every ordered pair drawn from
`visitor, name, interactive, pathname, source, browser` the log contains two
rows that agree on the first and differ on the second (30 pairs; `id` and
`epoch` are excluded as determinants because they are near-unique by
construction). This is what keeps `interactive` from being a spelling of
`name`: the log carries `signup` hits declared both interactive and not, so a
bounce rule written against the name and one written against the flag give
different answers. `oracle.test.ts` asserts all 30 pairs.

### 1.2 How it is made

`fixtures/generate.ts` is a seeded deterministic generator that a **human runs
once** and that no test ever invokes. It walks arithmetically rather than
drawing pseudo-randomly — the discipline of `apps/jsfb/shell/handlers/bench.js`
— because a generator that is reproducible only through a PRNG's internal
state is reproducible by nobody who reads it. It emits, in one run:

- `fixtures/events.json` — the log,
- `fixtures/events.sha256` — its digest,
- `fixtures/sessions.json` — the sidecar (§1.4),
- `fixtures/zones.json` — the three `Zone` rows (§1.5), which `Zone.seed`
  `@embed`s exactly as `Event.seed` does the log,
- `fixtures/plants.json` — the manifest of what it planted (§4.2),
- `fixtures/anchors.json` — the transcribed vendor cohorts (§3.5).

It is the only place in the app with a real `Date` and a real `Intl`, and it
uses neither for anything the app must reproduce: local day boundaries are the
app's arithmetic over `Zone` rows, and the generator's `Intl` output is used
only to *check* those rows, never to write them.

### 1.3 One artifact, three readers

`program.cue` pulls the log in with

```cue
@extern(embed)
_events: _ @embed(file="fixtures/events.json")
```

and unifies it as `Event: seed: _events`. Measured in this tree: `@embed` of a
JSON array from an app subdirectory resolves relative to the package directory
and exports all 1 200 rows in 0.04 s — **381 166 bytes** as JSON, **208 329** as
YAML, which is the size the seed adds to `shell.yaml` and the number decision D2
argues from. The chain is entirely existing machinery:

```
fixtures/events.json
  → @embed → Event.seed → cue export → shell/shell.yaml `seed:`
      → the browser's store, on every open
      → appSeed(appDir) → mountApp({tables}) → the linkedom test tier
  → read directly by oracle.sql, through read_json_auto
```

The app's rows, the browser's rows and the grader's input are **the same bytes
from one file**. There is no second copy of the log anywhere and therefore no
drift to lint. The sha256 is checked anyway, because a hand-edited fixture is a
different failure from a drifted one, and because `fixtures/**` is not in
bayt's build fingerprint (decision D5).

### 1.4 The sidecar the app cannot read

`fixtures/sessions.json` carries the session partition the generator
*intended*: `(visitor, ord, start_epoch, last_epoch, entry_page, exit_page,
pageviews, events, bounce, duration, source, browser)`, plus the hours each
visit spans. `visitor` and `ord` are the key the three witnesses meet on; the
ten columns after it are compared, and `hours` as a set.

**No entity declares a table for it.** It is not in `program.cue`, not in
`shell.yaml`, not in the store, not reachable from any screen, and not in
`state.rows` of any reduce. The app structurally cannot read it.

This is deliberately stronger than carrying the intended partition as a column
of the graded log and forbidding the reduce to look: a hygiene rule enforced by
grepping a handler's source for a column name is defeated by
`row["session_" + "ord"]`, and a file no entity declares is defeated by
nothing.

### 1.5 The clock, as three integer rows

`Zone` is seeded with exactly these three rows (`starts_epoch` spelled as a
`timestamp` in `fixtures/zones.json`, as `epoch` is), and the app's local-time
arithmetic is a lookup for the greatest `starts_epoch <= epoch` followed by
integer civil-from-days:

| id | `starts_epoch` | `offset_seconds` | `abbr` |
|---|---|---|---|
| `z-cet-2025` | `1761440400` | `3600` | CET |
| `z-cest-2026` | `1774746000` | `7200` | CEST |
| `z-cet-2026` | `1792890000` | `3600` | CET |

Verified against tzdata one second either side of each instant: at
`1761440399` Berlin reads 2025-10-26T02:59:59 +02:00 and at `1761440400` it
reads 02:00:00 +01:00; at `1774745999` it reads 2026-03-29T01:59:59 +01:00 and
at `1774746000` 03:00:00 +02:00; at `1792889999` it reads 2026-10-25T02:59:59
+02:00 and at `1792890000` 02:00:00 +01:00.

The first row precedes the log's first hit, so every hit resolves. **The third
row is after the log's last hit and it is not decoration**: it is what makes
the `starts_epoch <= epoch` bound load-bearing. A lookup that takes the last
row of the table, or the row with the greatest offset, yields +7200 or +3600
everywhere, the 23-hour local day becomes 24 hours, and the H8 cardinality
assertions go red. With two rows that bug passes.

The third row also carries the **step back**, and that is the second thing it is
for. The 2026-03-29 step deletes a local hour, which a walk over UTC hours
renders by producing no key for it; the 2026-10-25 step repeats one, and there an
hour key names two hours. §11 refuses a grid that reaches such an hour twice, and
refuses a `Zone` table with no step back at all — the `clock_repeat` column is
that hour, derived from these rows and never from a hit, and `tests/clock.test.ts`
drives both of the app's folds onto it. No window over this log contains the
step, so the app's two refusals are graded there and nowhere else.

---

## 2. The question set, as rows

### 2.1 Five vocabularies, whose sizes are the claim

Seeded tables. The ir states each row count; `coverage.test.ts` asserts it.

| Entity | Rows | What it holds |
|---|---|---|
| `Metric` | 7 | `visitors, visits, pageviews, events, views_per_visit, bounce_rate, visit_duration` |
| `Panel` | 4 | `page, entry_page, source, browser` — four *kinds* of dimension, not four columns |
| `Range` | 5 | `day, 7d, 28d, custom_21d, custom_dst_day` |
| `Grain` | 7 | the legal `(range, granularity)` pairs, transcribed |
| `FilterSet` | 11 | the eleven filter shapes (§2.4) |

A `Breakdown` row carries **six** detailed metrics — `visitors`, `visits`,
`pageviews`, `events`, `bounce_rate`, `visit_duration` — all six shown at
`/f/:preset/:panel`, while the dashboard collapses each panel to the visitor count,
the share bar and the bounce arc. The two vocabularies are not the same six:
`views_per_visit` has a top-line cell and no panel column, and `events` has a
panel column and no top-line cell. Between them every one of the seven metrics
is rendered as an aggregate somewhere, which is what §5.5's axis assertion
needs.

#### Which rows a panel shows, and in what order

Sourced from the vendor, like the entry-page rule of §3.5. The dashboard panel
issues its query as `order_by: [['visitors','desc'], ...dimensionOrderBy(dims)]`
with `pagination: { limit: MAX_ITEMS, offset: 0 }` and `MAX_ITEMS = 9`
(`assets/js/dashboard/stats/reports/index-breakdown.tsx`, lines 42, 87, 89);
`dimensionOrderBy` appends `[dimension, 'asc']` for every dimension outside
`CANNOT_ORDER_BY_DIMENSIONS = ['event:goal']`
(`assets/js/dashboard/stats/breakdowns.tsx`:235-241); and each entry becomes a
plain `ORDER BY` on the selected name
(`lib/plausible/stats/sql/query_builder.ex`:217-226). None of these four panels
is `event:goal`, so all four rank **`visitors` descending, ties broken by the
dimension value ascending**, and the dashboard keeps the first **nine**. The
full-panel screen orders the same way and cuts at nothing
(`assets/js/dashboard/stats/modals/details-breakdown.tsx`:131-134 over
`defaultOrderBy [['visitors','desc']]`). No departure to grade.

`breakdown.ord` carries that position, and `panel_rows` echoes the 9. Without
them the panel's **selection and order are graded by nothing**: ranked by
pageviews instead of visitors, the page panel at `(none, 28d)` shows a different
set (`/signup` in, `/blog/why` out) in a different order, and every number in it
is a number this oracle answers and answers correctly — the reverse anti-join
reports all nine as covered and the full-panel screen satisfies the forward one.
The position is therefore in §5.5's coverage key on both sides.

The tie leg decides membership and not merely order: 27 of the 212 panels are
tied on visitors across the ninth row. §11 refuses a fixture that has lost that,
lost its ties altogether, or stopped overflowing nine rows at all.

#### The seven metrics, as arithmetic

`sessions_n`, `bounce_denom`, `pv_sum` and `dur_sum` are graded columns beside
the quotients, not intermediates, so a wrong divisor cannot hide behind a
quotient that rounds the same.

| metric | over | value |
|---|---|---|
| `visitors` | matching **hits** | `count(distinct visitor)` |
| `visits` | matching **visits** | `sessions_n` |
| `pageviews` | matching **hits** | `count(*) where name = 'pageview'` |
| `events` | matching **hits** | `count(*) where name <> 'engagement'` |
| `views_per_visit` | matching **visits** | `round(pv_sum / sessions_n, 2)`, where `pv_sum` sums each matching visit's own pageview count |
| `bounce_rate` | the **entry-restricted** visits | `round(bounce_n / bounce_denom * 100)`, `0` when `bounce_denom = 0` |
| `visit_duration` | matching **visits** | `round(dur_sum / sessions_n)` seconds |

Three facts in that table are the ones two implementations most easily read
differently, and all three are anchored externally in §3.5:

- **`events` excludes `engagement` hits.** An engagement hit is the tracker's
  own liveness ping. It holds its visit open (§4.1 H1) and it contributes to
  nothing else: not `events`, not `pageviews`, not the exit page, not the
  bounce, not the duration.
- **`pageviews` and `pv_sum` are different numbers.** `pageviews` counts hits
  in the window; `pv_sum` sums the pageview counts of the visits that started
  in it, and a visit straddling either edge belongs to exactly one of the two.
  They are both graded, and `coherent` (stage 9) compares `views_per_visit`
  against `pv_sum`, never against `pageviews`.
- **only `bounce_rate` restricts its divisor.** Under a page filter,
  `bounce_denom` counts the visits that **entered** a matching page while
  `sessions_n` counts the visits that matched at all, so `views_per_visit` and
  `visit_duration` keep the unrestricted divisor and `bounce_rate` does not.
  This is H4, H7 and H9, and §3.5's anchor A4 pins all three sides of it with
  the vendor's own asserted numbers.

A fourth fact is not in the table because it is not a metric, and it is the most
important integer in the app: **the session boundary is `1860`**. Those four
digits appear in `Metric.reads` for `visits`, in every `Question.reads` that
mentions the boundary, in `oracle.sql`'s `sessions` CTE, in `stitch.js`, and in
H1's boundary walk — the same literal each time. "Thirty minutes" appears only
in `says`, where it is the vendor's sentence and not a rule.

#### What "matching" means, over hits and over visits

- a **hit** matches a window iff `from <= epoch < to`;
- a **visit** matches a window iff its **start** instant does, so a visit open
  across `from` belongs to the earlier window and contributes hits to the later
  one without being counted in it;
- the five slots split in two, and the split decides everything. `page` and
  `name` are **event-scoped**; `source`, `browser` and `entry_page` are
  **visit-scoped**.
  - a **hit** matches an event-scoped slot by its own column, and a visit-scoped
    slot through **its visit** — by the attribution frozen at that visit's first
    hit for `source` and `browser`, and by the visit's own `entry_page`. This is
    why anchor A3's `pageviews` is 2 and not 1: the second hit carries no source
    of its own, and it matches `visit:source is google` because the visit it
    belongs to began on google.
  - a **visit** matches an event-scoped slot by **containment** — it matches
    `page` iff any of its hits does — and a visit-scoped slot by its own frozen
    column.

#### The range → window arithmetic

A range is a half-open interval of UTC seconds `[from, to)` derived from
`as_of_epoch` **on the site's clock**. Two operations do all the work:

- `midnight(t)` — the greatest epoch `m <= t` that is 00:00:00 local;
- `back(m, k)` — subtract `k` from the local **civil date** of `m`, then
  convert that date's 00:00:00 local back to UTC with the offset in force *at
  that instant*. `back(m, k)` is **not** `m − k × 86400`: over this fixture the
  28-day window would start an hour early, which puts a 29th bucket on a
  28-bucket axis (H8).

| range | `from` | `to` | `from` | `to` | seconds | local days |
|---|---|---|---|---|---|---|
| `day` | `midnight(as_of)` | `as_of` | `1775599200` | `1775650800` | `51600` | the as-of day, part-way through |
| `7d` | `back(midnight(as_of), 6)` | `as_of` | `1775080800` | `1775650800` | `570000` | 7, the last part-way |
| `28d` | `back(midnight(as_of), 27)` | `as_of` | `1773270000` | `1775650800` | `2380800` | 28, the last part-way |
| `custom_21d` | 2026-03-15 00:00 local | 2026-04-05 00:00 local | `1773529200` | `1775340000` | `1810800` | 21 whole |
| `custom_dst_day` | 2026-03-29 00:00 local | 2026-03-30 00:00 local | `1774738800` | `1774821600` | `82800` | 1 whole, 23 hours long |

`to` is exclusive everywhere. The three rolling ranges end at `as_of` itself,
so their last local day is 14 h 20 m long; the two custom ranges are pinned to
local midnights and are whole.

`custom_21d`'s `1775340000 − 1773529200 = 1810800`, where 21 twenty-four-hour
days would be `1814400`: it is **exactly one hour short**, and that hour is the
one the site's clock skips. If that subtraction ever comes out to `1814400` the
fixture has lost its clock change and the whole of H8 has silently stopped
testing anything, so `oracle.test.ts` asserts the difference literally.

The five windows are **pairwise distinct, and none contains another's edge by
accident**: `custom_21d` starts three local days after `28d` does and ends
three whole local days before `as_of`, so it is a strict interior subwindow of
`28d`, and `7d` overlaps it without being contained. That is what makes the
range axis grade anything: a clone that clamps any window to "the whole log"
differs from the ground truth on four of the five ranges, and one that confuses
two ranges differs on both. §11 gates the property directly, and
`expects: nonzero` cannot: **no two `Range` rows produce the same ground-truth
top-line row for any filter set.** It is a property of the fixture, so it is
asserted over the ground truth before any app code exists.

The widest range covers 28 of the 35 local days, so the seven days before
`28d`'s opening are outside every dashboard number by construction. They are not
dead weight: they are what makes "the whole log" a wrong answer for every range,
they carry H8's `2026-03-11` plant, and they are graded — every hit of them is a
row of `/log`, every visit a row of `/sessions`, and both screens are compared
to the ground truth in full.

`custom_dst_day` is why the range vocabulary has five rows. The published
product offers arbitrary custom date ranges and offers an hour axis for a
one-day range; this app seeds one such range, pinned to the local day the clock
changes, because that day is the reason the app was chosen and no other range
can put it on an hourly axis. `active_bucket` cannot serve — it names a
`Bucket` id whose meaning is relative to the current range — and a day
parameter on `Filter` would be a second, unenumerated way to say what a `Range`
row already says.

#### The legal `(range, granularity)` pairs, and the bucket grid

Rows rather than a rule inside a handler, so "every legal pair was driven" is an
assertion `coverage.test.ts` can make:

```
day            → hour
7d             → day
28d            → day, week
custom_21d     → day, week
custom_dst_day → hour
```

A bucket exists for **every** grid step the window intersects, whether or not a
hit falls in it: the grid is window arithmetic, never a group-by over the data,
on both sides. The step is one local hour, one local day, or one local week,
walked forward from `from` and stamped on the site's clock — which is why the
23-hour day yields 23 hour buckets and not 24 with a hole.

**A week starts on the local Monday**, and a week bucket's key is the date of
that Monday. A partial week at either edge is one bucket.

| pair | buckets | first | last |
|---|---|---|---|
| `day` → hour | **15** | 2026-04-08 00 | 2026-04-08 14 |
| `7d` → day | **7** | 2026-04-02 | 2026-04-08 |
| `28d` → day | **28** | 2026-03-12 | 2026-04-08 |
| `28d` → week | **5** | 2026-03-09 | 2026-04-06 |
| `custom_21d` → day | **21** | 2026-03-15 | 2026-04-04 |
| `custom_21d` → week | **4** | 2026-03-09 | 2026-03-30 |
| `custom_dst_day` → hour | **23** | 2026-03-29 00 | 2026-03-29 23 |
| | **103** | | |

Every one of the four wrong readings H8 names changes one of those counts, which
is why they are caught as cardinality and not as arithmetic: a Sunday-start week
gives `custom_21d` **3** buckets where the rule gives 4; a window start computed
by multiplication gives `28d` **29** day buckets where the rule gives 28; days
cut in UTC give `28d` **29** as well, opening on 2026-03-11; a 24-hour DST day
gives `custom_dst_day` **24** hour buckets where the rule gives 23.

#### Which rows a metric is over, at every granularity

The asymmetry below is the shared-assumption risk §6 names, and stating it is
the only defence: at hour granularity `visits` is over `SessionHour` while
`visitors` and `pageviews` are over hits, so **the hourly visit counts do not
sum to the daily figure** and that is correct.

| metric | hour bucket | day bucket | week bucket | window (top line, breakdown row) |
|---|---|---|---|---|
| `visitors` | hits in the hour | hits in the day | hits in the week | hits in the window |
| `visits` | **`SessionHour`**: distinct visits with a row for that local hour, whether or not a hit fell in it | visits whose **start** is in the day | visits whose **start** is in the week | visits whose **start** is in the window |
| `pageviews` | hits in the hour, `name = 'pageview'` | ditto, per day | ditto, per week | ditto, per window |
| `events` | not bucketed | not bucketed | not bucketed | hits in the window, `name <> 'engagement'` |
| `views_per_visit` | not bucketed | not bucketed | not bucketed | `pv_sum / sessions_n` over the window's visits |
| `bounce_rate` | not bucketed | not bucketed | not bucketed | `bounce_n / bounce_denom` over the window's visits |
| `visit_duration` | not bucketed | not bucketed | not bucketed | `dur_sum / sessions_n` over the window's visits |

`Bucket` carries three counts — `visitors`, `visits`, `pageviews` — and the
four remaining metrics are window-level only. That is a departure, and it is
declared: the published product *does* bucket `views_per_visit` by week (its own
`time:week` case, cited in §3.5) and *does* attribute a visit's duration to the
hour it ended in rather than smearing it across the hours it was open (anchor
A6's third column). Four `departs: declined` rows carry the cost, one per
metric, so the reverse anti-join has something to point at instead of a
silence.

### 2.2 What the mechanical space actually is

Two of the three axes are fixed by the vocabulary alone, so they are stated and
asserted. The third is fixed by the data, so it is neither.

| | count | how |
|---|---|---|
| top-line | **330** | 6 top-line metrics × 11 filter sets × 5 ranges |
| graph | **3 399** | 3 bucketed metrics × 103 buckets × 11 filter sets |
| **stated and asserted** | **3 729** | `sweep.test.ts` asserts both literals before comparing a value |
| breakdown | 7 584 | 4 panels × 5 ranges × 11 filter sets, holding 1 264 (panel, dimension value) rows between them, × 6 detailed metrics. The panels offer 12 pages, 11 entry pages, 9 sources and 5 browsers at their widest |
| reachable cursors | 8 730 | 6 top-line metrics × 291 distinct cursors × 5 ranges — every cursor one gesture from a declared shape (§3.1's reach closure) |
| tick, scale point, chip | 385 · 1 133 · 12 | 5 ticks per (legal pair × filter set); one scale point per graph bucket; one chip per occupied slot |

Only the first two are literals in this document, because only they are
recoverable from the vocabulary alone; the rest are the size of the ground
truth's own key sets and the run **prints** them, since the number of rows in a
breakdown cell shrinks with the filter and cannot be derived from
`m.rows("panel") × …`. A headline the apparatus cannot defend is the one thing
§6 is trying not to produce, so the asserted headline is 3 729 and the rest is a
measurement — `21 574` numbers a screen can show, in total, on the run this
document was last checked against.

Each of those positions carries two assertions in this order — cardinality,
then value — and every value assertion covers the divisors as well as the
quotient, so the count of *comparisons* is a small multiple of 3 729. The
document does not state that multiple either.

### 2.3 The reviewable artifact: 312 seeded `Question` rows

| Block | Rows | Why this block |
|---|---|---|
| metric × filter set | 77 | 7 × 11 — the two axes that genuinely interact: filtering changes *which* rows a metric is over, and for two metrics it changes the divisor too |
| panel × detailed metric × 3 filter sets | 72 | 4 × 6 × 3 — a hard-coded column name in the fold fails here |
| graph metric × legal pair | 21 | 3 × 7 — every granularity, every range |
| range × metric | 35 | 5 × 7 — window arithmetic against every metric |
| bucket basis | 13 | one per bucketed cell of §2.1's basis table (3 × 3), plus one `declined` row per never-bucketed metric (4) |
| pairwise covering array over the rest | 48 | every pair of levels across (panel, range, grain, filter set) appears once |
| hard cases | 40 | §4, one or more per trap |
| declined | 6 | the four dropped dimension families, minute granularity, and two conditions on one dimension |
| **312** | | the ir states the number; `coverage.test.ts` asserts it, block by block, against `question-examples.ts`'s `BLOCKS` |

`events` is driven on `/f/:preset/:panel`, which shows six detailed metrics per
row; the top line shows six and `events` is not one of them. That is what
gives every one of the seven `Metric` rows a driven question, which §5.5's axis
assertion requires.

### 2.4 The eleven filter shapes

Eleven, because eleven different *shapes* is what changes the arithmetic; a
twelfth value of an existing shape changes nothing.

| id | shape | slots |
|---|---|---|
| `none` | empty | — |
| `visit-1` | one visit dimension | `f_browser=is:Chrome` |
| `event-1` | one event dimension | `f_page=is:/pricing` |
| `visit-visit` | two visit dimensions | `f_source=is:google` ∧ `f_browser=is:Chrome` |
| `event-visit` | mixed | `f_page=is:/blog/why` ∧ `f_browser=is:Safari` |
| `negated` | is-not | `f_source=not:google` |
| `contains` | substring | `f_page=has:/blog` |
| `disjunction` | one slot, two values | `f_browser=is:Chrome\|Safari` |
| `unentered` | the divergent-divisor pair | `f_page=is:/checkout`, a page **no visit entered on** |
| `entry-page` | the entry-page slot | `f_entry_page=is:/docs` |
| `goal` | the hit-name slot | `f_name=is:signup` |

The last two exist because a cursor slot no graded number depends on is a
fossil, and the nine above leave two of the five empty: without `entry-page` and
`goal` a `rollup` that never reads `f_entry_page` or `f_name` produces
byte-identical output on every assertion in the apparatus. `coverage.test.ts`'s
`slots` anti-join is what refuses that, and these two rows are what satisfy it.
`entry-page` is not a re-spelling of `event-1`: a page slot matches a visit by
containment and an entry-page slot by the visit's own first viewed page, so the
two disagree on every visit that reached `/docs` without entering there.

The operator rides inside the slot's value (`is:`, `not:`, `has:`, and `|` for
a disjunction) so that no filter value ever contains `&` or `=`. That keeps the
whole filter vocabulary out of the read grammar's way; it is also the bound the
app declares, and it costs the ability to state two clauses on one dimension
(`page is /a` ∧ `page is /b`), which is a `departs: declined` row.

### 2.5 The `Question` columns, and the two that must never merge

```
id · metric · panel · dimension · range · grain · filter_set
   · says · reads · departs · expects · hard_case · note
```

- **`says`** is the published sentence about that metric, verbatim, from the
  vendor's own metric definitions.
- **`reads`** is *this app's own wording* of what it computes.

They are separate columns and they are rendered side by side on `/spec`. This
is w3caria's move and it is the only rung in the whole apparatus that grades
the *reading* rather than the arithmetic: a departure cannot be hidden by
rewording, because rewording `reads` leaves `says` alone and the difference is
still on screen.

`departs` is a closed vocabulary, three words:

| value | means |
|---|---|
| `no` | this app computes exactly what the sentence says |
| `approximates` | this app computes something the sentence permits but does not require, or over a narrower input than the sentence assumes. The `note` says which and why. |
| `declined` | this app does not answer this question at all, and the `note` says what it would have cost |

`expects` is the non-degeneracy declaration (§5.3), and it is five words. Four
name a number: `nonzero`, and the three different reasons a position is allowed
to answer zero — `zero-by-ifNotFinite` (the divisor is empty),
`zero-by-empty-window` (the cohort is), and `zero-by-filter` (the cursor selects
hits, and none of them is the kind this metric counts). The first of the three is
the vendor's own name for the case — its aggregation expressions wrap every
quotient in `ifNotFinite(…, 0)` (§3.5) — and it is what a divisor of zero
means: not an error, not a NULL, not a NaN, but `0` on both sides. The fifth,
`unanswered`, names no number at all: the oracle answers no row for the position
and the drive asserts the app shows nothing there. It is what a `declined` row
declares, and the two go together in both directions —
`departs == "declined"` iff `expects == "unanswered"`, checked by `shape()` over
every seeded row.

**No `Question` row carries an expected value.** A seeded expected value is a
golden file, and a golden file is not an oracle — it grades the app against a
number the same author wrote down while looking at the app. Every number comes
from §3 at run time. The external anchors, which are the one class of number
this author did not write, are not `Question` rows either: they are assertions
on the ground truth itself and they live in §3.5.

---

## 3. The independent ground truth

### 3.1 DuckDB over the same log, hand-authored SQL

`apps/plausible/oracle.sql` is one reviewed document — authored, never
generated — in the style and with the header discipline of
`plugins/pronto/invariants.sql`. It is invoked as

```
mise x -- duckdb -json -c ".read oracle.sql"
```

with the process's cwd set to the app directory
(`fromFileUrl(new URL("../", import.meta.url))` from a file in `tests/`), which
is the exact call `plugins/pronto/check-facts.ts` already makes against the
`http:duckdb` pin every pronto app's `.mise.toml` already carries. **Zero new
tooling, and no temporary file**: the script reads the committed log directly
with `read_json('fixtures/events.json', columns = {…})`, every column declared.
`epoch` is declared text and parsed in the carrier's form: `read_json_auto`
types it as a naive `TIMESTAMP`, and a cast to `timestamptz` then shifts it by
the session's own zone (measured: three hours, on a machine set to
America/Sao_Paulo). Nothing is written, so the
`deno test` command needs no `--allow-write` at all.

It computes the *entire* answer space:

1. a `zones` CTE — the three literal rows of §1.5;
2. a `local` CTE stamping each hit's local day, week and hour, computed **two
   ways**: from the `zones` join, and from DuckDB's own
   `AT TIME ZONE 'Europe/Berlin'`. The CTE asserts they agree, so a wrong
   `Zone` row fails here rather than propagating;
3. a `windows` CTE — the five ranges of §2.1, each computed by ICU date
   arithmetic over local civil dates and then **asserted equal to the stated
   integers**, so the literals in this document are pinned by a real tz
   database rather than transcribed by hand;
4. a `grid` CTE — the 103 buckets, walked forward from each window's `from`, so
   an empty bucket exists on this side too;
5. a `sessions` CTE — the partition, from the integer predicate of §4.1 H1:
   a new visit begins iff `epoch − prev_epoch >= 1860`, where `prev_epoch` is
   the previous hit of that visitor **of any name**, expressed as
   `sum(gap >= 1860) over (partition by visitor order by epoch, id)`;
6. a `session_hours` CTE — `generate_series` over each visit's local hours;
7. a `sets` CTE — the eleven filter shapes as literal predicates;
8. an `anchors` CTE — the transcribed vendor cohorts (§3.5), isolated by
   visitor-id prefix;
9. a `reach` closure — every cursor one gesture from a declared shape, whether
   the gesture is a drill-down or a chip removal, collapsed to 291 distinct
   five-slot cursors and answered on the six top-line metrics at every range.
   Its `reach_agg` is a **second, independent path** to every declared shape's
   top line — §7 reaches it through `hit_match` and `visit_match`, this one
   applies the slot predicates directly — and §11 asserts the two agree on all
   330 declared numbers;
10. a `wrong` family — one expression per named alternative reading (§4.2), so
    the discrimination assertions compare two SQL readings and not SQL against
    prose.

**One invocation per test run**, cached behind a module-level lazy promise in
`tests/ground-truth.ts` and shared by every test file. Measured here: the whole
1 437-line file answers in **0.56 s**, while a bare `duckdb -c "select 1"` costs
~77 ms — so one call per graded position, each also re-reading the log, is
minutes against half a second.

#### The output contract

`duckdb -json` emits **one JSON document per statement**, so a script ending in
several `SELECT`s writes several concatenated arrays and `JSON.parse` throws.
Verified: `select 1 as a; select 2 as b;` prints `[{"a":1}]` then `[{"b":2}]`.

`oracle.sql` therefore ends in exactly **one** `SELECT` returning exactly one
row, whose columns are the answer sets — each a `list` of structs with its own
column list, so nothing is null-padded into a shared shape:

```sql
select
  (select list({...} order by …) from …) as topline,        -- the six headline metrics
  (select list({...} order by …) from …) as bucket,         -- the graph's three
  (select list({...} order by …) from …) as breakdown,      -- the four panels
  (select list({...} order by …) from …) as tick,           -- the axis
  (select list({...} order by …) from …) as scale,          -- the axis's domain
  (select list({...} order by …) from …) as scale_point,    -- one point per column
  (select list({...} order by …) from …) as chip,
  (select list({...} order by …) from …) as session,        -- the intermediate
  (select list({...} order by …) from …) as session_hour,
  (select list({...} order by …) from …) as grid,           -- the bucket keys alone
  (select list({...} order by …) from …) as reach,          -- the gestures
  (select list({...} order by …) from …) as reach_topline,  -- what they land on
  (select list({...} order by …) from …) as anchor,         -- §3.5
  (select list({...} order by …) from …) as wrong,          -- §4.2
  (select list({...} order by …) from …) as dependency,     -- §1.1's 30 pairs
  coalesce((select list({...} order by …) from violation), []) as violation,
  (select list({...} order by …) from clock_repeat) as clock_repeat,  -- §1.5
  {...} as windows,
  (select …) as current_visitors,
  (select n from panel_limit) as panel_rows,
  1860 as session_gap_seconds;
```

Twenty-one columns, and `oracle.test.ts` asserts every one is present and that an
empty answer set arrives as `[]` rather than null — which is what the `coalesce`
on `violation` is for, since the column whose emptiness is the success case is
the one a null would read as green.

`JSON.parse(stdout)[0]` is the whole ground truth. Verified against duckdb:
a list-of-structs column renders as a nested JSON array of objects in one
document.

`session_gap_seconds` is echoed so the literal cannot drift on the SQL side
without a test seeing it. On the app side the same literal is pinned
behaviourally rather than by a grep: `stitch.test.ts` walks the four planted
boundary gaps and compares the app's partition to this one at each (§4.1 H1).

The columns of the four answer sets a screen renders from are:

```
topline         filter_set · range · metric
                  · value_num · value_den · value_round · value_text
bucket          filter_set · range · grain · bucket_key · ord · metric · value_num
breakdown       filter_set · range · panel · dim_value · ord · metric
                  · value_num · value_den · value_round · value_text
                  · share · arc
                  · set_page · set_entry_page · set_source · set_browser · set_name
reach_topline   cursor · range · metric · value_num · value_den · value_round
```

`bucket` carries no divisor because none of its three metrics is a quotient.
`breakdown` carries `ord` because a panel's row selection and order are part of
what a screen shows and nothing else in the output can express them (*Which rows
a panel shows*); it carries `share` and `arc` because the bar's width and the arc's
sweep are geometry the fold computes, so even the picture is on the oracle; and
it carries the five `set_*` columns because they are the cursor the row's own
drill-down form submits (PLAN.md, *The cursor contract*). `reach_topline` has no
`value_text`: a reached cursor's numbers are graded before they are rendered, and
`cursor` is the five slots spelled the way the route spells them.

The divisors travel as `value_den` beside every quotient, and `value_text` is
the **rendered** string, because the rounding is part of the metric definition
and the graded artifact is what a reader sees.

### 3.2 Why not the three obvious alternatives

- **SQL against the app's own database.** There isn't one — the app is
  all-`tab`. If there were, the app's aggregation would be SQL over that
  database against those tables, and the same misreading of a timestamp would be
  invisible on both sides. It also cannot run at the test tier, which is where
  the whole-screen suite lives.
- **A TypeScript reference implementation in the test tier.** Same language,
  same author, same file shape as `shell/handlers/rollup.js`; the session loop
  would be copy-adjacent to the app's. Kept only as the third witness on the
  stitch (§3.3), never as the primary.
- **The published prose as assertions.** Produces no numbers. Kept as
  `Metric.says` and `Question.says`, where it grades the reading — the half a
  number cannot.

### 3.3 The stitch gets three witnesses

Sessionization is the one step both sides must perform, and therefore the
highest-risk place for the two to be wrong together. Three formulations:

1. **the sidecar** — the partition the generator intended, by construction;
2. **DuckDB's window formulation** — `sum(gap >= 1860) over (partition by
   visitor order by epoch, id)`, set-at-once;
3. **the app's incremental fold** — event by event, in the shape the real
   product's session store uses.

(1) ≡ (2) is asserted **as a lint on the fixture, before a line of app code
runs**. That is a perft-grade property: two independent formulations agree on a
partition of 1 200 hits into 400 visits and on the 526 `SessionHour` rows those
visits span. (3) ≡ (1) is the app's grade.

### 3.4 The clock, graded independently

`oracle.sql` §11 probes every hit's local hour and week stamp, and all five
window integers, against DuckDB's `AT TIME ZONE 'Europe/Berlin'` — a real
tzdata implementation this author did not write — and raises on any
disagreement; `oracle.test.ts` asserts the gate list empty.

That grades **both halves**: the seeded offsets, and the app's own
civil-from-days arithmetic that turns an epoch and an offset into a local day,
week and hour. A design that pre-computes local days in the generator and
stores them as columns grades the *fixture* and lets a clone with broken date
arithmetic pass; this one does not, because the app has to do the arithmetic.

ICU loads lazily from `extensions.duckdb.org` and the grader runs at the
`test` verb on the host, never inside the preview cluster, which has no
outbound network.

### 3.5 The external anchors: the vendor's own worked examples

The vendor publishes no worked example with numbers in its documentation — the
metrics-definitions page carries prose and benchmark ranges and no arithmetic.
It publishes them somewhere better: as executable assertions in its own test
suite, over fixtures small enough to transcribe. Six cohorts are transcribed
into the log, each on its own reserved visitor-id prefix, with the vendor's
inter-hit gaps preserved exactly and the whole cohort planted inside one local
day so no window edge or clock change cuts it. `oracle.sql`'s `anchors` CTE
isolates each by that prefix, applies the filter the vendor's case applies, and
emits the metrics it asserts; `fixture.test.ts` compares them to the numbers
below **before** anything else runs, because a ground truth that disagrees with
the vendor's own assertions is wrong regardless of what the app does.

Both sides take the prefix from `fixtures/anchors.json` rather than transcribing
it. A cohort isolated by a prefix the log does not carry matches nothing, and a
`like` that matches nothing is not an error: the external witness disappears in
silence while every internal assertion stays green. §11's `anchor_cohort_empty`
and `anchor_not_graded` gates refuse that outcome, and reading the one file
stops it from arising.

`fixtures/anchors.json` carries, per cohort: the citation (repository path and
test name), the transcribed rows, the vendor's filter, and the vendor's
asserted values verbatim. Those values are the only numbers in the apparatus
this author did not compute.

| id | vendor's test | the cohort | the vendor's numbers |
|---|---|---|---|
| **A1** | `test/plausible_web/controllers/api/external_stats_controller/query_test.exs`, "aggregates all metrics in a single query" | 3 pageviews: `v1` at +0 and +1500, `v2` at +0 | `pageviews` 3, `visits` 2, `views_per_visit` 1.5, `visitors` 2, `bounce_rate` 50, `visit_duration` 750 |
| **A2** | same file, "aggregate `views_per_visit` rounds to two decimal places" | 5 pageviews: `v1` at +0 and +1500, `v2` at +0 and +1500, `v3` at +0 | `views_per_visit` 1.67 |
| **A3** | same file, "can filter by source" | 3 pageviews: `v1` at +0 with `source=google` then +1500 with none, `v2` at +0 with none; filter `visit:source is google` | `pageviews` 2, `visitors` 1, `bounce_rate` 0, `visit_duration` 1500 |
| **A4** | same file, "can filter by page" | 4 pageviews: `v1` at +0 on `/` then +1500 on `/blog/why`, `v2` at +0 on `/`, `v3` at +0 on `/blog/why`; filter `event:page is /blog/why` | `pageviews` 2, `visitors` 2, `bounce_rate` **100**, `visit_duration` **750** |
| **A5** | same file, "does not count engagement events towards the events metric" and "engagement events do not affect bounce rate and visit duration" | 2 hits: a pageview at +0 and an `engagement` at +3 | `events` 1, `bounce_rate` 100, `visit_duration` 0 |
| **A6** | same file, "visitors and visits are smeared across `time:hour` buckets but `visit_duration` is not" | 15 pageviews in one local day: `v1` every 20 min from 00:00 to 03:20 (11 hits), `v2` at 01:05 and 01:10, `v3` at 02:10 and 02:20 | per hour bucket, `[visits, visitors, visit_duration, pageviews]`: 00 → `[1,1,0,3]`, 01 → `[2,2,300,5]`, 02 → `[2,2,600,5]`, 03 → `[1,1,12000,2]` |

Each was re-derived from this document's arithmetic before being written down,
and each agrees: A1's `visit_duration` is `(1500 + 0)/2 = 750` because a
one-hit visit stays in the divisor (H6); A2's is `5/3 = 1.6667` rounded to
`1.67`; A3's `pageviews` is 2 because the visit's source is frozen at its first
hit and its second hit therefore matches too; A4's `bounce_rate` is 100 and not
50 because the divisor is the one visit that **entered** `/blog/why`, while its
`visit_duration` of 750 averages **both** matching visits — one anchor, three
of the four facts in §2.1's warning list; A5's `events` of 1 and duration of 0
are the engagement rule; A6's four buckets are one visit of 12 000 s open in
four consecutive hours, counted in each (H2), with `pageviews` per hour on the
hit basis.

A6 also anchors one of the four bucketing rules this app declines: the vendor
attributes a visit's `visit_duration` to the hour of its last hit (12 000 in
hour 03, and `0` in hour 00, where no visit ended), which is why
`visit_duration` at hour granularity is a `departs: declined` row with a cost
rather than an invention.

**All seven `Metric.formula` values are the vendor's own expressions**, quoted
verbatim from `lib/plausible/stats/sql/expression.ex` at a stated revision
(`plausible/analytics@b787d17`) with the line range and the `?` bindings in
`Metric.source`: `uniq(?)` at :308-310, `greatest(sum(?), 0)` at :450-452 with
the hour-granularity smear branch `uniq(?)` at :444-446,
`countIf(? = 'pageview')` at :296-298, `countIf(? != 'engagement')` at :302-304,
and the three coalesce expressions below. A line number is a citation only
against a revision, which is why the revision is stated.

Six further rules are anchored by the vendor's own source or by an assertion
without a number, and are cited verbatim in `Metric.formula` and
`Question.note`:

- **the session boundary.** `lib/plausible/session/cache_store.ex` keeps a
  session iff
  `NaiveDateTime.diff(event.timestamp, session.timestamp, :minute) <= 30`.
  Elixir's `:minute` diff truncates, so 1 859 s reads as 30 minutes and
  continues while 1 860 s reads as 31 and starts a new visit — which is
  exactly the integer this app uses, and exactly what a clone reading "30
  minutes" as `>= 1800` gets wrong.
- **the coalesce.** `lib/plausible/stats/sql/expression.ex` spells
  `bounce_rate` as
  `toUInt32(greatest(ifNotFinite(round(sumIf(is_bounce * sign, ?) / sumIf(sign, ?) * 100), 0), 0))`,
  `views_per_visit` as
  `greatest(ifNotFinite(round(sum(? * ?) / sum(?), 2), 0), 0)` and
  `visit_duration` as
  `toUInt32(greatest(ifNotFinite(round(sum(duration * sign) / sum(sign)), 0), 0))`.
  A zero divisor is `0`, the rounding is 2 decimals / whole percent / whole
  seconds, and `bounce_rate` is the only one of the three whose divisor is
  conditional — all four facts read off one expression each.
- **the entry and exit pages.** `lib/plausible/session/cache_store.ex` writes
  both as `if(pageview?, do: event.pathname, else: …)` — at session creation,
  `entry_page: if(event.name == "pageview", do: event.pathname, else: "")` and
  the same for `exit_page`; on every later event, `entry_page` moves only
  `if(session.entry_page == "" and pageview?)` and `exit_page` only
  `if(pageview?)`. So the entry page is the first page **viewed**, not the
  pathname of the hit that opened the visit, and a session a custom event opened
  carries the empty string until it views one. The reading is unambiguous in the
  source and there is no departure to grade: the one visit in the log that
  distinguishes them (`v080`, a `signup` on `/signup` then a pageview of
  `/pricing`) enters at `/pricing`. `oracle.sql` §5 and `fixtures/engine.ts`
  both spell it that way, and `fixture.test.ts` is where the two are compared.
- **the bounce.** The same file seeds `is_bounce: event.name == "pageview" or
  not event.interactive?` and clears it with
  `not (pageviews >= 2 or (event.interactive? and not pageview?))`, which over a
  whole visit is: a visit bounces iff it viewed at most one page and carried no
  interactive hit that was not a page view. A custom event that declares itself
  non-interactive therefore does **not** clear a bounce — counting non-`engagement`
  hits instead moves this fixture's `(none, 28d)` `bounce_rate` from 40 to 31.
- **the week label.** The vendor's `views_per_visit in a time:week dimension
  query` case asserts bucket keys `2021-01-04` and `2021-01-18`, both Mondays,
  for data on those days; a Sunday-start week would have labelled the first
  `2021-01-03`.
- **the clock the buckets are cut on.** Its `timeseries with quarter-hour
  timezone` case puts a site on `Asia/Katmandu` (+05:45) and asserts that seven
  hits between 05:00 and 06:30 UTC land in local hour buckets 10, 11 and 12
  with counts 1, 4 and 2 — buckets cut on the site's clock and then read in
  UTC, which is H8's first half. It is cited and not transcribed: this app has
  one site clock, and a second one would be a fixture the app cannot express.

What the anchors do **not** cover, and where the ceiling of §6 therefore still
bites: the spring-forward day itself, the range→window civil-day arithmetic,
current visitors, the `unentered` shape, and `views_per_visit` under a filter.
Those five rest on one author's reading, twice implemented.

---

## 4. The hard cases

### 4.1 The ten

Each is one or more `Question` rows with a `hard_case` value, a `note` naming
the behaviour it pins, and a named case in `questions.test.ts`.

| # | The rule | The fixture plants | The wrong reading it catches |
|---|---|---|---|
| **H1** | A visit ends when the gap from its **last hit** reaches **1 860 seconds** — 31 whole minutes, the boundary the vendor's truncating minute diff produces. A hit of any name resets it, an `engagement` ping included. No maximum length, no cut at midnight. | consecutive gaps of exactly `1799`, `1800`, `1859` and `1860` seconds for one visitor; and a 50-minute span bridged by an `engagement` ping at minute 25 | `gap >= 1800`, the naive reading of "30 minutes"; timing from the visit's start; `>` where the rule wants `>=` on the integer; an engagement ping that does not hold the visit open |
| **H2** | At day/week granularity a visit lands in the bucket of its **start**. At hour granularity it is counted in **every hour it was open**. | two visits spanning four local hours each (`v003`, `v004`) — and anchor A6, which is the vendor's own version of the same shape. An hour a visit was open in but left empty is **unreachable on this log and says so**: at a 1 860-second boundary two consecutive hits are at most 30 min 59 s apart, which cannot straddle a whole clock hour, so every open hour holds a hit of its own. The one hour any visit spans without a hit is `2026-03-29 02`, which does not exist (H8). One visit — `v100` — is open across the `day` range's own opening, which is what separates “open in that hour” from “open in that hour AND started in this window”: §11 refuses a log with no such visit | hourly visit counts summed to the daily figure — 71 against 85 on the two hour-grain ranges |
| **H3** | Visitors is a distinct count over the whole range, not a sum of the buckets'. A visit crossing UTC midnight keeps the visitor key it opened with; a returning visitor is one visitor. | a visit straddling UTC midnight; a visitor appearing on two days; a visitor key rotating mid-visit | Σ(daily visitors) used as the range total, in either direction |
| **H4** | Bounce rate under a page filter is computed over the visits that **entered** a matching page, not those that viewed one. | a visit entering `/a` and viewing `/b`, with filter shape `event-1` on `/b` — and anchor A4 | filtering bounce rate by viewed page |
| **H5** | Views per visit is two decimals; page views count only hits named `pageview`; events count every hit except `engagement`. | a visit of one page view and three `engagement` pings; a visit viewing the same page twice | counting engagement pings as events; de-duplicating repeat views; integer rounding |
| **H6** | Visit duration is the last **non-engagement** hit minus the first, averaged over **all** matching visits, zero-duration ones included. | a cohort of ≥12 one-hit visits | dropping zero-duration visits from the divisor; letting an engagement ping extend the duration |
| **H7** | An event-dimension filter on a visit-level metric requires matching the hits and then answering about their visits. | filter shape `unentered`: `/checkout`, viewed by ≥3 visits, entered by none | filtering the visit row on `page` and answering about the entry page instead. The **discriminating column is `visits`**: the rule gives ≥3 and the wrong reading gives 0. `bounce_rate` is `0` on both sides, by the vendor's `ifNotFinite` coalesce over a `bounce_denom` of 0 — which is why the case is graded on `visits` and its `bounce_rate` row is declared `expects: zero-by-ifNotFinite` |
| **H8** | Buckets are cut on the site's clock and then read in UTC: a day is a local day, a week starts on the local Monday, and N days back is N **calendar** days back. | the 2026-03-29 spring-forward — a 23-hour local day and a local hour that does not exist; a hit in the local hour 23:00 of 2026-03-11, the hour a multiplied window start wrongly includes; a hit on Sunday 2026-03-15, which a Sunday-start week pulls into a different bucket | UTC-only bucketing; 24 bars on a 23-hour day; `midnight(as_of) − 27 × 86400` as the 28-day window start; a week that starts Sunday |
| **H9** | Views per visit and visit duration divide by the matching visits; bounce rate divides by the visits that entered a matching page. Under a page filter these are **different divisors**. | a window where the two counts diverge by more than one | one divisor reused for all three |
| **H10** | Current visitors is `[as_of − 300, as_of)` and is **filter-independent**. | a burst of distinct visitors inside that interval, the last hit at `as_of − 60` | applying the filter set to it; reading a real clock instead of `as_of` |

### 4.2 Assert the plants landed — and that they discriminate

A hard case that quietly stops being planted turns green and stays green. Two
assertions per case, both driven off `fixtures/plants.json`:

1. **Presence.** The configuration is in the log. H1's four gaps exist for the
   named visitor; H8's local day has 23 hours and its two edge hits exist;
   H7's `/checkout` is viewed by ≥3 visits and entered by none; H6's cohort has
   ≥12 one-hit visits. `fixtures/verify.ts` recomputes all 23 of those
   properties from the log and prints them; `fixture.test.ts` holds the half of
   the assertion that survives a regeneration silently — that every visitor and
   event id the manifest names is still there.
2. **Discrimination.** For each **named wrong reading**, the ground truth's
   answer under the rule differs from its answer under that reading, on the
   case's own probe. `oracle.sql` computes both — the wrong readings are SQL,
   not prose — and emits them under `wrong`, which is also a §11 gate;
   `oracle.test.ts` asserts it over every emitted reading.

A plant record is a configuration and a pair of names. **It carries no
numbers**, because a number in the plant file would be a golden value by
another route:

```
{ case:  "H1",
  probe: { metric, filter_set, range, grain, panel, dim_value },
  rows:  { visitors: ["v041"], events: ["e0417", "e0418", …] },
  present: [ ["gap", "e0417", "e0418", 1799], ["gap", "e0418", "e0419", 1800], … ],
  wrong:   ["gap_ge_1800", "gap_from_start", "engagement_does_not_hold"] }
```

**The authority is what `oracle.sql` emits under `wrong`**, because that is the
artifact that computes both readings. `tests/coverage.ts`'s `WRONG_READINGS`
holds the same list, and §5.5's hard-case anti-join drives off it — held equal to
`wrong` as a set by `coverage.test.ts` rather than counted, so a reading added on
either side arrives as a red run and not as a header comment that has stopped
being true.

`fixtures/plants.json` and `fixtures/engine.ts`'s `WRONG` are held equal to it
too, by `fixture.test.ts`, and as sets rather than by count: a name only a plant
carries is a plant guarding nothing, and a name only the oracle computes is a
graded reading no plant is known to discriminate. Both are silent until the
three are held equal.

Seventeen names, with the probe each is measured on and both answers over this
log:

| reading | case | probe | rule | wrong |
|---|---|---|---|---|
| `gap_ge_1800` | H1 | visits over the log | 400 | 402 |
| `gap_from_start` | H1 | visits over the log | 400 | 513 |
| `engagement_does_not_hold` | H1 | visits over the log | 400 | 476 |
| `hourly_visits_summed` | H2 | visits over the two hour-grain ranges | 71 | 85 |
| `hours_from_nonengagement` | H2 | `SessionHour` rows over the log | 526 | 461 |
| `visitors_summed` | H3 | `(none, 28d, day)` visitors | 240 | 253 |
| `bounce_on_viewed_page` | H4 | `(event-1, 28d)` bounce rate | 36 | 23 |
| `events_count_every_hit` | H5 | `(none, 28d)` events | 751 | 983 |
| `duration_drops_zero` | H6 | `(none, 28d)` visit duration | 862 | 1 256 |
| `duration_includes_engagement` | H6 | `(none, 28d)` visit duration | 862 | 1 305 |
| `visit_row_filtered_on_page` | H7 | `(unentered, 28d)` visits | 25 | 0 |
| `twenty_four_bars` | H8 | `custom_dst_day` hour buckets | 23 | 24 |
| `utc_day_buckets` | H8 | `28d` day buckets | 28 | 29 |
| `week_starts_sunday` | H8 | `custom_21d` week buckets | 4 | 3 |
| `window_by_multiplication` | H8 | `28d` day buckets | 28 | 29 |
| `one_divisor_for_both` | H9 | `(event-1, 28d)` bounce divisor against visit divisor | 36 | 56 |
| `current_visitors_filtered` | H10 | current visitors | 6 | 2 |

A hard case on which the rule and every one of its named wrong readings happen
to coincide over this fixture is **not a hard case**, and the run fails saying
so. H7 is the case that most nearly failed this rule — its headline expectation
is a bounce rate of 0, indistinguishable from a genuine zero — and it earns its
place on `visits`, not on `bounce_rate`.

---

## 5. The checks

Eight files under `tests/` — `oracle`, `fixture`, `stitch`, `coherent`, `svg`,
`questions`, `sweep`, `coverage` — each declared as
`loop: surface: checks: "<name>": {verb: "test", cmds, note}`, and PLAN.md
stage 10 declares the same eight. Command shape:

```
deno test --config tests/deno.json --no-lock --no-check \
  --allow-env --allow-read --allow-run=mise tests/<x>.test.ts
```

`--allow-run=mise` is what reaches `duckdb`; there is no `--allow-write`,
because nothing is written — the oracle reads the committed log directly
(§3.1). That is not a convenience: `cmds` are argv-shaped and run through
nushell, which does **not** expand `$env.TMPDIR` inside a bare word (verified —
it passes the token through unchanged, and the interpolating spellings are
`--flag=($env.TMPDIR)` or `$"--flag=($env.TMPDIR)"`), so a temp-directory
flag is a trap the design does not need to step in.

They run at `test` and not at `integrate` because nothing here needs a live
service, which is the rule for choosing a verb.

`coherent.test.ts` is the one of the eight this document does not specify: it
grades a predicate over hand-built rows rather than anything the oracle computes,
and PLAN.md stage 9 owns both the predicate's clauses and its cases.

### 5.1 The two checks over the ground truth, before any app code runs

They are split by what they read. `oracle.test.ts` needs nothing but
`oracle.sql`'s output; `fixture.test.ts` reads `fixtures/`. A failure in either
means the oracle is wrong, so both run before the app is mounted anywhere.

`fixture.test.ts`:

- The two witnesses are comparable at all, before either is believed: neither
  carries a column the other has no opinion about, and both filter by the same
  vocabulary. A comparison that silently skips a column is the failure this pair
  precedes.
- `sha256(events.json) == events.sha256`.
- **The sidecar ≡ DuckDB's window stitch**, key set first and then column by
  column; then the `SessionHour` key set. The compared columns are *derived*
  from what the two witnesses carry rather than listed — a list covers the
  columns its author thought of — and over this fixture they are the ten after
  the key: `start_epoch`, `last_epoch`, entry and exit page, `pageviews`,
  `events`, `bounce`, `duration`, `source`, `browser`.
- **The sidecar ≡ `fixtures/engine.ts`'s incremental fold**, over the same key
  and every column the sidecar carries. With the pair above, this is where all
  three sessionizations of §3.3 meet — pairwise, both against the sidecar, so a
  regenerated fixture cannot launder a break in either reader. Two of the three
  reading one rule the same wrong way is what these comparisons exist for, and
  what happened once already. Both are by identity and not by coercion: every
  side keys a visit `visitor#ord` with `ord` counted from one, `last_epoch` is
  the visit's close (its last hit of any name, pings included), and `bounce` is
  a boolean.
- Every anchor cohort reproduces the vendor's asserted numbers (§3.5), read
  from `fixtures/anchors.json` — the same file `oracle.sql` takes the cohort
  prefixes from, so a prefix cannot be right in one place and wrong in the
  other.
- Every visitor and event id `plants.json` names is still in the log (§4.2).
- **§11 asks exactly the gates the roster names, and every one of them fires**
  when the thing it guards is broken. The roster carries a counter-mutation per
  gate — one text substitution into `oracle.sql`, run against `violation` alone
  — because a name check cannot see a gate hollowed into a no-op. A gate whose
  name is still in §11 and whose predicate is `where false` leaves `violation`
  empty and every other assertion in this apparatus green, which is the same
  clean bill of health that meeting the precondition gives. The mutation's
  anchor must occur exactly once in the file, so a refactor that moves the text
  disarms nothing silently.

`oracle.test.ts`:

- The output is one document carrying every column of §3.1's contract, and an
  empty answer set arrives as `[]` rather than null.
- `session_gap_seconds == 1860`.
- `violation` is empty — §11's gates, which include the oracle's own agreement
  with ICU on every window, hour stamp and week stamp.
- The window integers: all five `(from, to)` pairs of §2.1, and `custom_21d`'s
  `1775340000 − 1773529200 == 1810800`, one hour short of 21 days.
- The bucket grid: 103 buckets over the seven legal pairs, with the per-pair
  counts of §2.1, and the DST day's 23 keys with local hour 02 absent.
- The stated cardinalities of the graded space (§2.2).
- Every named wrong reading discriminates (§4.2).
- No column of the log is a function of another — all 30 ordered pairs (§1.1).
- The axis is the 1/2/5 rule and every graph point sits inside it.
- Every `Breakdown` and `Chip` row carries all five cursor slots.
- **A panel is ranked by visitors, ties broken by the dimension** — the vendor's
  `order_by` recomputed from the visitor counts alone and held against the `ord`
  the SQL assigned, so oracle.sql is shown to implement the rule it cites.
- **Every filter slot moves a graded number** — the assertion §2.4's last two
  shapes exist to satisfy, made here on the ground truth rather than waiting for
  `coverage.test.ts` to make it over what the app rendered.
- **The reach closure is graded, and it agrees with the panel it was clicked
  from**: the top line under a drilled cursor equals the breakdown row that
  drilled to it. That is the second independent path of §3.1 checked against the
  first, on every declared shape.
- The run **prints what it graded**, by answer set, with the declined regions and
  their cost beside it. A total nobody can see is a total nobody checks.

Two assertions of this pair need artifacts stages 1 and 2 have not produced
yet, and neither file makes them: `(await appSeed(APP)).event ≡ events.json`,
which needs `shell.yaml`; and the non-degeneracy floor of §5.3, which needs the
`Question` rows.

### 5.2 `stitch.test.ts` — the derived intermediate, before any aggregate

Mounts `/sessions` with the seeded log, settles, then:

1. **cardinality**: the app's `Session` key set equals DuckDB's, exactly; then
   the app's `SessionHour` key set equals DuckDB's, exactly;
2. **value**: per visit, every column;
3. the four boundary gaps of H1, one assertion each, which is where the app's
   own `1860` is pinned;
4. the ten hard cases individually, by the visit ids `plants.json` names.

`SessionHour` being a materialized table rather than a branch inside the
aggregation is what makes H2 checkable by a human reading the rows: "this visit
appears in four hour rows, and the four hourly visit counts it contributes to sum
to four where the day counts it once" is an artifact on screen at `/sessions`,
gradable against the published rule without running anything, and a second
structural place for the two implementations to disagree. It is the only defence
in the apparatus against a *shared* misreading of that rule — other than anchor
A6, which is the vendor's own numbers for exactly this shape.

The obvious sharper artifact — an hour row holding no hit — **cannot be shown on
this log**, and pretending otherwise would be a check nobody can run: the 1 860-
second boundary makes every open hour hold a hit of its own (§4.1 H2). The one
row that is open over an hour with no hit is `v063`'s, and the hour is the one
the clock skips. Its absence is why `session_hour` has 526 rows and not 527.

### 5.3 `questions.test.ts` — the 312 seeded rows

For each: set the cursor **through the app's own forms** — submit the range
form, the granularity form, the filter-set navigation, the drill-down forms —
settle, and read the number **off the rendered DOM text**, not off the row. A
working drive is itself evidence the write paths work, and reading the text
grades the binding and the rounding along with the arithmetic.

Compare to the cached DuckDB answer for that
`(metric, panel, dimension, range, grain, filter_set)`. Record the id into a
module-level `driven` set through a `drives(...ids)` helper.

Which screen a row is read on is fixed by the row and not chosen: a granularity
can only be stated on the dashboard, so the covering array's rows are read off
the dashboard's own cut panels, while `events` and every ord above the vendor's
cut exist only on `/f/:preset/:panel`. Grouping by the mount each row needs makes
the whole roster 31 mounts rather than 312.

A `declined` row is driven like any other and its drive asserts the **absence**
it claims: no bucket on the axis carries a cell for a metric the graph declines,
no panel and no cursor slot names a dropped dimension family, no granularity
button reads `minute`, and no drill-down form states one slot twice. Declining
and forgetting are otherwise the same green run.

This file also runs `shape()` — `question-examples.ts`'s closed-vocabulary
validator — over the app's own 312 rows rather than over the eight worked
examples alone. The examples are what makes the other 304 mechanical, and until
the 304 are held to the same shape that is a claim about them and not a check on
them. And it runs the three anti-joins of §5.5 that need a driven set —
**forward**, **axis** and **hard cases** — because this is the file that has
one; `coverage.test.ts` rehearses all six against a doctored stand-in.

**Non-degeneracy.** Zero equals zero passes while the filter is entirely
broken. So:

- every `Question` declares `expects`, and the test asserts DuckDB's answer has
  the declared shape — a row declared `nonzero` whose ground truth is zero is a
  fixture failure, not a pass;
- this file asserts, per range and in at least three buckets of every
  granularity, the **strict** chain `visitors < visits < pageviews`. At 1 200
  hits over 35 local days many buckets would otherwise have
  `visitors == visits`, and a fold that counts visits where it should count
  distinct visitors is invisible in exactly those buckets. The generator plants
  the inequality deliberately rather than hoping for it, which is what the two
  dense days of §1.1 are for at hour granularity.

### 5.4 `sweep.test.ts` — the mechanical questions

Generated from the app's own vocabulary rows, walked over every reachable
cursor position. Two assertions per position, **in this order**:

1. **cardinality** — the emitted key sets of `Bucket`, `Breakdown`, `Tick` and
   `Chip` equal DuckDB's key sets exactly. No extra row, no missing one.
2. **value** — every column of every row, including the divisors
   (`sessions_n`, `bounce_denom`, `dur_sum`, `pv_sum`) and not only the
   quotients.

It also asserts the two counts §2.2 states — 330 top-line and 3 399 graph
positions — and **prints** the breakdown, tick and chip key-set sizes rather
than asserting a literal nobody can derive from the vocabulary.

Cardinality first is the perft analogue and it is the assertion that catches a
fold quietly ceasing to emit a bucket, or emitting one for a value that no
longer exists. A value-only check reports that as a mismatch on some unrelated
row, or as nothing at all. It is also the assertion H8's three wrong readings
fail: 24 hour buckets where the rule gives 23, 29 day buckets where it gives
28, 3 week buckets where it gives 4.

Carrying the divisors as columns is what makes H4/H9 gradable at row level: on
a `Breakdown` row, `bounce_denom` and `sessions_n` are different numbers under
a page filter, and a design that stores only the finished percentage cannot
represent the divergence it claims to test.

### 5.5 `coverage.test.ts` — the last case, six anti-joins

- **forward** — `seeded.filter(id => !driven.has(id))` is empty, `stray` is
  empty, and `seeded.length === 312`. **A published question nothing drove
  fails the run and names it.** It grades the question ROSTER, and is handed
  neither the rendered nor the graded set, so it covers for neither of the two
  below. It, `axis` and `hard cases` are the three that take a driven set, so
  they run for real in `questions.test.ts` (§5.3) and are rehearsed here.
- **reverse** — every number the app *rendered* across the sweep is covered by
  some question or by the sweep's declared space. A number the app can show that
  nothing grades is a finding. The key is the POSITION — cursor, range, grain,
  **bucket number**, panel, **row number**, value, metric — and not the column
  name: a panel ranked by the wrong metric shows nine rows whose every number the
  oracle answers correctly, so only the row number each was shown at separates
  the two panels (*Which rows a panel shows*, §2.2), and a time axis rendered in
  the wrong order shows every bucket it should. One finding per ungraded shape,
  naming every cell in it, so a re-ordering is one defect that says which cells
  moved. This is the local answer to the standing gap that nothing in this tree
  catches a column no screen reads, and with nine reduce-written entities
  (PLAN.md stage 3) this app has the largest fossil surface any app here has
  shipped.
  **Its key does not reach everything the app writes**, and the two values
  outside it are named rather than left to be found. `Filter.active_bucket` is
  written by the graph caret and is not a `(dimension, dim_value, metric)`; it is
  graded by the caret readout naming the bucket the reader is on
  (`{#accept-graph-caret-walks}`), and by nothing else. `Fold.error` is stage 9's
  whole output; it is graded by `coherent.test.ts` over the predicate directly,
  and by stage 9's own rehearsal — break `rollup`'s divisor and read the clause
  name off the dashboard. Neither is a number the arithmetic produces, which is
  why neither anti-join over the graded space can see them, and why they are
  listed here instead.
- **unrendered** — every position the ground truth answers is a number the sweep
  saw on screen. It is `reverse` walked from the other side, and the pair is
  half an oracle without it: `reverse` can only fire on something the app SHOWED,
  so an app that renders nothing, drops a whole panel, or cuts a panel to its
  top three rows produces **zero findings** anywhere else in this file — measured
  at 19 809 graded positions, where deleting the `page` panel hides 2 166 numbers
  and `reverse` stays silent on all of them. There is no declined region on this
  side: `graded` is what the oracle chose to answer, and the regions nobody
  grades are absent from the set rather than excused inside it.
- **axis** — every `Metric`, every `Panel`, every `Range`, every legal
  `(range, grain)` pair, every `FilterSet` and every cell of §2.1's basis table
  appears in at least one *driven* question, not merely in the sweep. A
  `declined` row satisfies a cell only with its cost stated in `note`.
  **Its `metric@window` cells do not reach the four declines**, and this is the
  one place the roster is weaker than it reads. A `@window` cell is satisfied by
  any driven row with no granularity, and the app has dozens of those per
  metric; the four `departs: declined` rows of §2.3 sit at `metric@day` and
  `metric@hour`, which the basis table does not list, so they satisfy nothing and
  nothing requires them. Removing all four leaves `axis` green — only
  `forward`'s block count catches it, and that count is declared by hand beside
  them. The fix is for a `@window` cell to take two driven rows, one that answers
  the window and one that declines the bucketing with its cost, which is what
  §2.1 already claims the four rows are for.
- **hard cases** — every `H1`..`H10` is named by at least one driven question,
  and every named wrong reading of §4.2 is named by at least one.
- **slots** — every one of the five cursor slots moves at least one graded
  number. This is the anti-join the two shapes of §2.4 exist to satisfy: with
  `f_entry_page` and `f_name` occupied by nothing, a `rollup` that never reads
  either produces byte-identical output across the whole graded space, and every
  other anti-join stays green while it does.

### 5.6 `svg.test.ts` — pin the platform walls executably

The chart design (`DESIGN.md`, `PLAN.md` stage 7) rests on a claim about where
the SVG namespace survives. Prose restating a wall rots; assertions do not.
Three:

- a bare `<rect>` as an HTML `<template>`'s item root reports
  `namespaceURI === "http://www.w3.org/1999/xhtml"` — the wall that makes a
  per-row shape into a shared canvas impossible;
- a `<template>` authored **inside** an `<svg>` has `content === undefined`,
  and hydrating that region **throws** — the region does not mis-render, it
  crashes;
- the shipped chart's static `<svg>` inside a slot region reports
  `namespaceURI === "http://www.w3.org/2000/svg"` with its bound `d` resolved,
  and the shipped per-row `<svg>` inside a breakdown item template reports the
  same with its bound `stroke-dasharray` resolved.

Assertions are on `namespaceURI` and on throwing, never on error-message text,
so they survive a linkedom bump.

### 5.7 What comes free, and what does not

Free from the platform: `machines` at `test`, which walks every arrow of both
cursor charts against XState.

**Less free than it looks**: `visual` at `integrate` photographs the four
**static** routes — `/`, `/sessions`, `/log`, `/spec` — at two viewports, and
neither parametrized route. `check-visual` resolves a `:param` by fetching its
planned table over PostgREST, an all-`tab` app has no such table, and an
unresolved param is a `major` finding that drops the route from `live` while only
a `critical` exits non-zero. So `just integrate` is green with two advisories and
the app's two most important routes go unphotographed. PLAN.md stage 12 and
decision D11 carry the mechanism and the line citations; the consequence for this
document is that no oracle assertion may rest on the battery having seen
`/f/:preset`.

**Not free, and this app owes it**: linkedom serializes a wrong-namespace
element and a clipped-to-nothing element identically to a correct one, so a
chart that clips everything away is green at every tier above. A browser-tier
assertion of non-zero painted boxes for a line segment, a tick and an arc is
required, and it belongs where Playwright already lives —
`plugins/omnishell/playwright-tests/`. That is a platform file, it is named as
such in `PLAN.md` decision D6, and it is not this app's to write into.

---

## 6. The ceiling, named

Every claim above about what the numbers should be is **one author's reading of
one product's source, implemented twice in one sitting**. DuckDB is a different
engine, SQL is a different language, and the test tier is a different tier — but
none of that buys independence of the *reading*. And the sidecar is not a third
witness to the reading either: the generator implements sessionization itself,
so it can only witness that the app and the generator agree with each other.

chess had third-party perft counts over its whole space; w3caria had the APG's
published tables. This app's external witness is six configurations, not a
space, so it is one rung below either, and pretending otherwise would be the
worst thing in the apparatus. Three mitigations, all cheap, all shipped:

1. **`Metric.formula` carries the vendor's own aggregation expression,
   verbatim**, and `Question.note` carries the source file and the rule it
   comes from. A reviewer can diff intent against *both* implementations
   without running anything. This is the only rung that grades the reading, and
   §3.5 cites the source expressions it rests on.

   **It has already earned its keep, and what it caught is a departure this
   document did not know it had.** `Metric.says` is quoted from the vendor's
   published definition; while the `visitors` quote stopped after its first
   sentence, `departs: "no"` on every `visitors` row read as true. The published
   paragraph's third sentence is *"If a person visits from multiple devices or on
   multiple days, they are counted as separate visitors"* — the vendor's
   `user_id` is a hash under a salt it rotates and discards inside 48 h
   (`lib/plausible/session/salts.ex`), so it cannot span a day. This app's log
   carries a stable `visitor`, and its 251 distinct visitors over 35 days (§1.1)
   are 251 to this app and rather more to the published reading. The log can
   express the published one — it is a distinct count of `(visitor, local day)`
   — so this is a choice and not a limit. It is now declared: the whole
   definitional paragraph is quoted, `Metric.reads` states the departure and its
   scope, and every `visitors` question over a window wider than one local day
   carries `departs: "approximates"` with its cost. Seventy-five rows moved. The
   general lesson is the sharper half: **a `says` quoted short is how a departure
   disappears**, so `says` is now the whole definitional paragraph and stops only
   where the vendor's prose turns to analogy, benchmark ranges or a link.
2. **Six transcribed vendor cohorts (§3.5)**, whose expected values are
   assertions the vendor itself publishes and executes. They are the only
   numbers here this author did not compute, and they cover the top line, the
   two-decimal rounding, a visit-dimension filter with frozen attribution, the
   entry-page bounce divisor against the unrestricted duration divisor, the
   engagement rule, and hour-granularity smearing. They are asserted against
   the ground truth before any app code runs.
3. **An ir Decision saying what is left.** The five things §3.5 names as
   unanchored — the spring-forward day, the range→window civil-day arithmetic,
   current visitors, the `unentered` shape, and `views_per_visit` under a
   filter — are graded implementation against implementation, and a defect
   shared by the reading of both sides will pass. Stated, with its cost, rather
   than papered over with "different engine, different language, different
   tier".

**The second ceiling is depth, and it is a bound rather than a hole.** The reach
closure grades every cursor one gesture from a declared shape, on the six
top-line metrics at every range. It does not grade the graph or the four panels
*under* a reached cursor, because a panel row under a reached cursor **is** the
next gesture's cursor and the closure does not terminate at any size this file
can emit. Both declines are named in `tests/coverage.ts`'s `DECLINED_REACH` with
their cost — 89 919 numbers for the graph half, non-enumerable for the panels —
and `reverse` matches a rendered number against them, so a screen that starts
showing one is reported by name rather than passing in silence. What can still
escape is exactly this: a bucket fold or a breakdown fold that is right from a
declared shape and wrong from a drilled one.

---

## 7. What a red run says

| failure | which check | what it prints |
|---|---|---|
| the fixture was regenerated and lost a plant | `fixture.test.ts` | `H1 event e0417` — the manifest names a row the log no longer has |
| a plant stopped discriminating | `oracle.test.ts` | `H4 wrong reading bounce_on_viewed_page does not discriminate: both readings give 33` |
| the DST day went flat | `oracle.test.ts` | `custom_21d is 1814400s; expected 1810800s — the fixture no longer spans a clock change` |
| a `Zone` row is wrong | `oracle.test.ts` | `zone z-cest-2026 says +3600 at 1774746001; tzdata says +7200` |
| the window arithmetic drifted | `oracle.test.ts` | `28d from=1773266400; expected 1773270000 — a window start computed by multiplication` |
| two ranges became one window | `oracle.test.ts` | `28d and custom_21d agree on every top-line row for filter set none — a quarter of the range axis grades nothing` |
| the ground truth disagrees with the vendor | `fixture.test.ts` | `anchor A4\| bounce_rate: ground truth 50, vendor asserts 100` |
| a cohort stops matching the log | `oracle.test.ts` | `anchor_cohort_empty: anchor A1 matches no hit under prefix a1-` — the external witness gone, which every other assertion would otherwise survive |
| the two sessionizations disagree | `fixture.test.ts` | `v080#1 entry_page: sidecar "/pricing", oracle "/signup"` — one visit, named, with both readings |
| a column of the log became derivable | `oracle.test.ts` | `name → interactive is a function over the log: no two rows agree on name and differ on interactive` |
| the stitch disagrees | `stitch.test.ts` | the visit ids present on one side and absent on the other, before any column is compared |
| the session boundary moved | `stitch.test.ts` | `gap 1800 between e0419 and e0420 split a visit; the boundary is 1860` |
| a bucket stopped being emitted | `sweep.test.ts` | `(none, custom_dst_day, hour): app has 24 buckets, ground truth has 23 — extra 2026-03-29 02` |
| a number is wrong | `sweep.test.ts` | the full key and both values, plus both divisors |
| a divisor is wrong but the quotient rounds the same | `sweep.test.ts` | caught, because the divisors are graded columns |
| a published question nothing drove | `coverage.test.ts` | the ids, and `seeded.length` against 312 |
| **a number the app shows that nothing grades** | `coverage.test.ts` | the `(dimension, dim_value, metric)` keys — the most serious finding this apparatus produces |
| a cursor slot nothing depends on | `oracle.test.ts`, then `coverage.test.ts` | `no graded number depends on f_name` — a column of the cursor the whole apparatus is blind to, which is why §2.4 has eleven shapes and not nine |
| the two paths to a top line disagree | `oracle.test.ts` | the cursor, the range and the metric, with the number `hit_match` gives and the number the reach closure gives — two SQL readings of one filter, not SQL against prose |
| a derived row is internally incoherent | `coherent.test.ts`, and on screen | the clause name, from the predicate `rollup` calls before it states a row. There is no store-side refusal to lean on at `tab` tier (PLAN.md stage 9, D10): `rollup` returns one `Fold.error` patch and no sink writes, so the last coherent numbers stay on screen beside a named error |
| a departure hidden by rewording | impossible by construction | `says` and `reads` are different columns and `/spec` renders both |
