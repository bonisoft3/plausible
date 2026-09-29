---
pronto: alpha
name: plausible
business: none — a reference implementation, published so the numbers can be checked
stage: polished single-feature slice
team: studio
cluster: mecha
terminal: omnishell
loop: sayt
build: bayt
---

# The Answer Set — web analytics, and the arithmetic behind every number

A web analytics dashboard is a page of numbers, and almost nobody can say where
any of them came from. "Bounce rate 41%" — of what, over which sessions,
counted how, and does filtering to a page change which sessions it is about?
Every product in the category answers those questions somewhere in a docs site
nobody opens next to the number it explains.

This one puts the arithmetic on the same screen as the result. It reads a
fixed, published log of thirty-five days of traffic and answers a **published,
finite set of questions** about it. The questions are listed in the app. Each
one carries the sentence the category publishes about that metric, and beside
it this implementation's own reading, so a place where the two differ is
printed rather than discovered. A number the app can show that no published
question asks about is a defect, and so is a published question the app cannot
answer.

The log never changes and there is no live traffic. That is the point: a
dashboard over a fixed log has a right answer, and it can be told what it is.

## Data

- `Event` — the log: one row per hit, with the moment it happened, who it came
  from, what kind of hit it was and whether it counted as an interaction, the
  page, the source and the browser. The kind and the interaction flag are two
  facts and not one: a custom event can decline to be an interaction. Nothing
  writes to it; it is the ground the whole app stands on.
- `Zone` — the site's clock, as rows: the moments its offset from UTC changes
  and what it changes to. A day here is a day where the site is, not a day in
  UTC, and this is where that is written down.
- `Session` — one visit: when it opened and when it last did anything, which
  page it entered on and which it left from, how many views and how many
  events it held, whether it bounced, and how long it lasted. Derived from the
  log alone.
- `SessionHour` — one row per visit per clock hour it was open, whether or not
  anything happened in that hour. A visit spanning four hours has four rows.
- `Filter` — what the reader is looking at: the range, the granularity, the
  bucket they have picked out, and which of the five slots they have narrowed
  by — the four panel dimensions and the hit's own name.
- `Topline` — the six headline numbers for what the reader is looking at, kept
  as the counts they are made of as well as the figures they show.
- `Bucket` — one point of the graph: its moment, its label, its three counts,
  and the height it is drawn at.
- `Tick` — the graph's axis: five labelled marks and where each sits.
- `Scale` — the graph's domain and the two shapes drawn from it.
- `Breakdown` — one row of one panel: a page, an entry page, a source or a
  browser, with its counts and the counts they are made of.
- `Chip` — the filters currently applied, one row each, each removable.
- `Corpus` — one row saying what the log is: how many events, visits, visitors
  and days, and which days.
- `Panel`, `Metric`, `Range`, `Grain`, `FilterSet` — the vocabulary: the four
  breakdowns, the seven metrics with the published sentence and the published
  formula for each, the five ranges — the day, the last seven days, the last
  twenty-eight, a fixed twenty-one-day window and the day the clock changed —
  which granularities each range allows, and the eleven filter shapes.
- `Question` — the published question set: every question this app claims to
  answer, with the category's sentence about it and this app's own reading, and
  a word for where the two part company.

## Screens

Six: the index, a dashboard, one panel in full, the visits, the log, and the
specification.

### 1. The index

What the log is — events, visits, visitors, and the thirty-five days it spans —
and then the eleven filter shapes, each with the sentence that says what it
narrows to. Opening one opens the dashboard on it.

There is no free-text filter box, and that is a stated choice: a view has to be
one of the eleven to be reachable by name.

### 2. The dashboard

For the chosen filter shape:

- **Six numbers**: visitors, visits, page views, views per visit, bounce rate,
  visit duration. Each carries the sentence that defines it.
- **The graph**: visitors over the range at the granularity chosen, drawn as one
  column per bucket with a labelled axis, and beside it every point as a
  row of a table carrying all three of its counts — visitors, visits and page
  views. The table is what the graph means; the drawing is decoration and says
  so. Every bucket the range covers is a row, including the ones nothing
  happened in. Arrow keys walk the points and a readout names the one you are
  on.
- **The range and the granularity**, each a row of buttons; a range only offers
  the granularities it allows. One of the five ranges is the day the site's
  clock moved, which is the only way an hourly axis reaches it.
- **Four panels**: top pages, entry pages, sources, browsers. Each row shows
  its share as a bar, its visitor count, its share of the whole, and — for
  bounce rate — a small arc. Clicking a row narrows the whole dashboard to it.
  A panel shows the **nine** values with the most visitors, most first, and two
  values with the same visitor count are ordered by the value itself, ascending.
  The tie is not a detail: it decides which row is the ninth.
- **The chips**: every filter currently applied, each removable.
- **Current visitors**, the count in the last five minutes of the log, which
  ignores every filter and says so.

### 3. One panel in full

Every value of one dimension — twelve pages, eleven entry pages, nine sources,
five browsers — with the six detailed metrics beside each, rather than the nine
rows and one metric the dashboard collapses to. Same order as the dashboard,
cut at nothing. This is the only screen that shows the event count as a number
of its own.

### 4. The visits

Every visit the log was cut into: when it opened and closed, its entry and exit
pages, its counts, whether it bounced, and how long it lasted — and beneath
each, the clock hours it was open in. This is the intermediate every number on
the dashboard is built out of, and it is on screen rather than hidden.

### 5. The log

The raw hits, a day at a time. Every column the app reads is a column shown.

### 6. The specification

The seven metrics with the published sentence, the published formula, and this
app's reading in three separate columns. The ranges and the granularities each
allows. And the whole published question set, grouped by whether this app
answers it as published, approximately, or not at all.

## Behavior

- **A visit ends one thousand eight hundred and sixty seconds after its last
  hit, not after it opened.** That is thirty-one whole minutes: a gap of thirty
  minutes and fifty-nine seconds continues a visit, thirty-one minutes exactly
  starts a new one. The rule is the integer and not the phrase, because
  "thirty minutes" read as eighteen hundred seconds is a different app that
  agrees with this one everywhere except the minute where it matters. Any hit
  resets the clock, the tracker's own liveness pings included. There is no
  maximum length and no cut at midnight, so a visit may span days.
- **A page view is a page view, and a liveness ping is neither.** Views count
  only hits that are page views. Events count every hit except the pings the
  tracker sends by itself to say the reader is still there: a ping holds its
  visit open and contributes nothing else to it — not an event, not a view, not
  a second of duration, and it never clears a bounce. A visit of one page view
  and three pings has one view, one event, and lasted no time.
- **The entry page is the first page viewed and never changes; the exit page is
  the last page viewed.** A visit that opens on something other than a page
  view has no entry page until it views one, and a hit that is not a page view
  never moves the exit page.
- **Where a visit came from is settled by its first hit.** A visit's source and
  browser are the ones its first hit carried and no later hit revises them — so
  narrowing to a source keeps every hit of every visit that began there,
  including the hits that name no source at all.
- **A visit that never got anywhere bounced.** A visit bounces if it viewed one
  page and did nothing interactive; a second view, or an interactive event,
  clears it. Whether a hit counts as an interaction is a property of the hit
  and not of its name: a liveness ping never does, and a custom event may
  declare that it does not either.
- **A visit that lasted no time still counts.** Duration is the distance from
  the first hit to the last one that was not a liveness ping, so a one-hit
  visit lasts zero seconds — and it stays in the divisor of the average, which
  is what makes the average lower than people expect.
- **Visitors are counted, not summed.** The visitors over a week is how many
  distinct people appeared in it, which is not the sum of the seven daily
  figures, in either direction. The same is true of every range and every
  bucket.
- **A day is a day where the site is.** Buckets are cut on the site's clock and
  then read in UTC. The log spans the twenty-ninth of March, when the site's
  clock moves forward: that day is twenty-three hours long and one hour of it
  does not exist. The graph shows twenty-three bars for it, not twenty-four
  with a hole — and that day is one of the five ranges a reader can pick,
  because a rule that can only be computed and never seen is a rule nothing
  grades.
- **A week starts on Monday, on the site's clock.** A week bucket is labelled
  by the date of its Monday, and a week clipped by the edge of a range is one
  bucket like any other. Starting weeks on Sunday changes how many buckets
  there are and not only what they are called.
- **A range is a whole number of the site's own days, counted on the
  calendar.** The three rolling ranges end at the instant the log ends and open
  at the site's midnight N days before the day it ends on — where N days before
  is a subtraction of dates, not a subtraction of N times twenty-four hours.
  Across a clock change those two are an hour apart, and that hour holds
  traffic, so the wrong one puts an extra bar at the left edge of the graph.
  The last day of a rolling range is part-way through; the twenty-one-day
  window and the clock-change day are whole days, midnight to midnight.
- **At hourly granularity a visit is counted in every hour it was open**, even
  in an hour where nothing happened. So the hourly visit counts do not add up
  to the daily figure, and that is correct rather than a rounding error.
- **Filtering by a page filters visits by what they contain, not by where they
  started.** A visit that entered on one page and viewed another matches a
  filter on the second. But the bounce rate under a page filter is the bounce
  rate of the visits that *entered* there — so filtering to a page nobody
  entered on gives a visit count above zero and a bounce rate of exactly zero.
  That is the published behaviour and it is stated as a question, not hidden.
- **The averages do not all have the same divisor.** Views per visit and visit
  duration divide by the matching visits; bounce rate divides by the visits
  that entered a matching page. Under a page filter that is two different
  numbers, and a screen showing one divisor for all three is wrong.
- **Rounding is part of the definition.** Views per visit is two decimals.
  Bounce rate is a whole percent. Visit duration is a whole number of seconds.
  A number that is right and rounded differently is a wrong number here.
- **Current visitors ignores the filters.** It is the count in the last five
  minutes of the log and nothing narrows it, which is the one number on the
  dashboard that does not answer the same question as its neighbours.
- **Every published question is asked of the app, and every number the app
  shows answers one.** Both directions are checked. A question nothing drove is
  a failure; a number nothing grades is a failure, and the more serious of the
  two.
- **Where this app departs from the published definition, the row says so and
  says which way.** A departure is a stated choice printed beside the sentence
  it departs from, in its own words, never a reworded version of the sentence.

![[acceptance.md]]

## Out of scope

- Live traffic, a tracking script, and anything that writes to the log. The log
  is a fixture; the app is a reader of it.
- The nineteen other breakdowns the category ships — operating system, device,
  region, city, referrer, the five campaign dimensions and the rest. They are
  the same arithmetic over a different column; four dimensions of four
  different kinds cover what is worth checking, and the rest are listed as
  declined with that reason.
- Goals as their own screen, conversion rates and funnels. A goal is a filter
  on the hit's name and is exercised as one: it is the eleventh filter shape,
  and every number on the dashboard answers under it.
- Comparison against a previous period or the same period last year. It is the
  same arithmetic on a shifted window.
- Views per visit, bounce rate and visit duration as points on the graph. Those
  three are answered for the whole range and for every breakdown row, and the
  published product's own reading of a visit's duration inside a single hour —
  it lands in the hour the visit ended rather than in each hour it was open —
  is listed as declined with that reason beside it.
- Two conditions on one dimension. A filter says one thing per dimension, with
  is, is-not, contains and a list of alternatives; asking for a page that is
  both `/a` and `/b` is declined, and the reason is that the operator has to
  ride inside the value for a view to be nameable in a URL.
- Imported historical data, which arrives as daily totals rather than hits and
  therefore answers some panels and not others. Modelling a collection that is
  aggregate rather than fact is a platform question, not a product one.
- Accounts, multiple sites, sharing links, e-mail reports, and the settings
  surface.
- A world map. A shared drawing surface with one shape per row is not something
  this platform can draw, and a table of countries with a flag is not worth
  building to say so.
- A pointer crosshair on the graph. The keyboard caret does the same job and
  can be checked; a hover cannot.
