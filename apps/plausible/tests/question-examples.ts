// One fully written `Question` row per block of ORACLE.md §2.3, and the closed
// vocabularies every row is drawn from.
//
// 312 rows of 13 columns is the largest hand-authored artifact in the app, and
// the eight rows below are what make the other 304 mechanical: each block's
// example fixes the id scheme, which columns that block leaves empty, how `says`
// is quoted, how `reads` is worded against it, and what `expects` a position of
// that shape is allowed to declare. They live under tests/ and not in
// program.cue because `shape()` below is executable — the seeded rows are checked
// against these vocabularies rather than against a prose description of them.
//
// `says` is VERBATIM from the vendor's published definitions and nothing else.
// Where the vendor publishes no sentence for a metric, `says` is empty and the
// `note` says so; inventing a plausible sentence would defeat the one rung of
// this apparatus that grades the reading rather than the arithmetic.

export type Question = {
  id: string;
  metric: string;
  /** '' unless the question is about a breakdown panel */
  panel: string;
  /** '' unless the question is about one dimension value */
  dimension: string;
  range: string;
  /** '' unless the question is about a bucketed number */
  grain: string;
  filter_set: string;
  /** the vendor's published sentence, verbatim; '' where none is published */
  says: string;
  /** this app's own wording of what it computes */
  reads: string;
  departs: Departs;
  expects: Expects;
  /** '' unless the row is one of the ten */
  hard_case: string;
  note: string;
};

export const METRICS = [
  "visitors",
  "visits",
  "pageviews",
  "events",
  "views_per_visit",
  "bounce_rate",
  "visit_duration",
] as const;
export const PANELS = ["page", "entry_page", "source", "browser"] as const;
export const RANGES = ["day", "7d", "28d", "custom_21d", "custom_dst_day"] as const;
export const GRAINS = ["hour", "day", "week"] as const;
export const FILTER_SETS = [
  "none",
  "visit-1",
  "event-1",
  "visit-visit",
  "event-visit",
  "negated",
  "contains",
  "disjunction",
  "unentered",
  "entry-page",
  "goal",
] as const;
/** The seven legal (range, granularity) pairs, as `range/grain`. */
export const LEGAL_PAIRS = [
  "day/hour",
  "7d/day",
  "28d/day",
  "28d/week",
  "custom_21d/day",
  "custom_21d/week",
  "custom_dst_day/hour",
] as const;
export const HARD_CASES = ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8", "H9", "H10"] as const;

export type Departs = "no" | "approximates" | "declined";
/** How a position is allowed to answer zero. Four ways, and a row must name
 * which: a zero nobody predicted is the answer an empty fold and a correct one
 * both give. `zero-by-filter` is the goal shape's — under `f_name=is:signup` no
 * hit is a page view, so `pageviews` is 0 with a full window and a live fold.
 *
 * `unanswered` is the fifth value and it is not a zero at all: the oracle
 * answers no row for the position, and the drive asserts the app shows nothing
 * there. It is what a `declined` row declares. Spelling a decline as
 * `zero-by-empty-window` would claim the app answers 0, which is a different
 * claim and a checkable one. */
export type Expects =
  | "nonzero"
  | "zero-by-ifNotFinite"
  | "zero-by-empty-window"
  | "zero-by-filter"
  | "unanswered";

/** The eight blocks, with the row count each owes. `coverage.test.ts` asserts the
 * seeded rows partition into exactly these, and that they sum to their total. */
export const BLOCKS = {
  "metric-filter": 77,
  "panel-metric": 72,
  "graph-pair": 21,
  "range-metric": 35,
  "bucket-basis": 13,
  "covering-array": 48,
  "hard-case": 40,
  "declined": 6,
} as const;

export const BLOCK_OF: Record<string, keyof typeof BLOCKS> = {
  mf: "metric-filter",
  pm: "panel-metric",
  gp: "graph-pair",
  rm: "range-metric",
  bb: "bucket-basis",
  cv: "covering-array",
  hc: "hard-case",
  dc: "declined",
};

/** The eight worked examples. */
export const EXAMPLES: Question[] = [
  // ---- metric × filter set (77 = 7 × 11) -------------------------------------
  // The axis that genuinely interacts: a filter changes WHICH rows a metric is
  // over, and for bounce_rate it changes the divisor as well. The range is pinned
  // to 28d across the whole block so the block varies two things and not three.
  {
    id: "q-mf-bounce_rate-unentered",
    metric: "bounce_rate",
    panel: "",
    dimension: "",
    range: "28d",
    grain: "",
    filter_set: "unentered",
    says: "The percentage of visitors who land on a page and leave without meaningfully engaging with your site.",
    reads:
      "Of the visits that ENTERED on a page matching the filter, the percentage whose only non-engagement hit was that one, rounded to a whole percent. The divisor is the entering visits and not the matching ones, so under a page no visit entered the divisor is empty and the answer is 0.",
    departs: "no",
    expects: "zero-by-ifNotFinite",
    hard_case: "H7",
    note:
      "The divisor is `sumIf(sign, entry-page matches)` in the vendor's own expression (lib/plausible/stats/sql/expression.ex), wrapped in `ifNotFinite(…, 0)`, so an empty divisor is 0 on both sides and not a NULL or a NaN. This row is the reason H7 is graded on `visits` and not here: 0 is also what a genuinely non-bouncing cohort gives.",
  },

  // ---- panel × detailed metric × 3 filter sets (72 = 4 × 6 × 3) --------------
  // A hard-coded column name in the fold fails here and nowhere else, because the
  // same six metrics are asked of four different dimension kinds. `dimension` is
  // empty: the block grades the panel's whole row set, and the value of any one
  // dimension is the sweep's business.
  {
    id: "q-pm-entry_page-visit_duration-contains",
    metric: "visit_duration",
    panel: "entry_page",
    dimension: "",
    range: "28d",
    grain: "",
    filter_set: "contains",
    says: "Average visit duration is the sum of all session lengths divided by the number of sessions, which includes those 0 second visits (bounces).",
    reads:
      "For each entry page, the sum over the matching visits of (last non-engagement hit minus first hit), divided by the count of those visits, rounded to whole seconds. Zero-duration visits stay in the divisor. An engagement ping holds the visit open but does not extend its duration.",
    departs: "no",
    expects: "nonzero",
    hard_case: "H6",
    note:
      "The published sentence says the quiet half out loud — `which includes those 0 second visits` — which is the divisor H6 plants twelve one-hit visits against. The engagement half is not in the sentence and comes from anchor A5, where the vendor asserts a duration of 0 for a pageview followed three seconds later by a ping.",
  },

  // ---- graph metric × legal pair (21 = 3 × 7) --------------------------------
  // Every granularity against every range. `filter_set` is `none` across the
  // block: what varies is the axis, and a filter would confound a bucket
  // cardinality failure with a matching failure.
  {
    id: "q-gp-visits-custom_dst_day-hour",
    metric: "visits",
    panel: "",
    dimension: "",
    range: "custom_dst_day",
    grain: "hour",
    filter_set: "none",
    says: "A session (also known as a visit) is a set of actions a user takes on your site.",
    reads:
      "One bucket per local hour the window intersects — 23 of them, because the site's clock skips 02:00 on this day — each holding the number of distinct visits that were OPEN during that local hour, whether or not a hit fell in it. These do not sum to the day's visit count and that is correct.",
    departs: "no",
    expects: "nonzero",
    hard_case: "H8",
    note:
      "Two rules meet in this one cell. The axis is H8: 23 buckets and not 24, asserted as cardinality before any value. The counting is H2: at hour granularity a visit is counted in every hour it was open, which is the vendor's behaviour asserted in anchor A6 — one visit of 12 000 s appearing in four consecutive hour buckets.",
  },

  // ---- range × metric (35 = 5 × 7) ------------------------------------------
  // Window arithmetic against every metric. `grain` is empty: the block is about
  // the window-level number, which is where a `back(m, k)` computed by
  // multiplication first shows up as a value rather than as a bucket count.
  {
    id: "q-rm-28d-visitors",
    metric: "visitors",
    panel: "",
    dimension: "",
    range: "28d",
    grain: "",
    filter_set: "none",
    says: "The number of people who visited your site.",
    reads:
      "The count of distinct `visitor` values over the hits whose epoch lies in [from, to), where `from` is 00:00 local on the 27th calendar day before the as-of day and `to` is `as_of_epoch` itself. Not the sum of the daily counts, and not `midnight(as_of) − 27 × 86400`.",
    departs: "no",
    expects: "nonzero",
    hard_case: "H3",
    note:
      "Two wrong readings land on this row and each is graded by its own probe: `visitors_summed` (the daily counts added up, which double-counts a returning visitor) and `window_by_multiplication` (an hour early over this fixture, because the 28 days span the spring-forward). Both are in the `wrong` column of the ground truth.",
  },

  // ---- bucket basis (13 = 3 × 3 bucketed cells + 4 declined metrics) ---------
  // One row per cell of ORACLE.md §2.1's basis table, so the axis anti-join can
  // ask "was every cell driven" rather than "was every metric driven". This row
  // is the cell whose answer surprises a reader.
  {
    id: "q-bb-visitors-hour",
    metric: "visitors",
    panel: "",
    dimension: "",
    range: "day",
    grain: "hour",
    filter_set: "none",
    says: "The number of people who visited your site.",
    reads:
      "In an hour bucket, the count of distinct visitors over the HITS that fell in that local hour — not over the visits that were open in it. `visits` in the same bucket is over the open visits, so a bucket can hold more visits than visitors.",
    departs: "no",
    expects: "nonzero",
    hard_case: "H2",
    note:
      "This is the asymmetry ORACLE.md §6 names as the shared-assumption risk: `visits` at hour granularity is over SessionHour while `visitors` and `pageviews` are over hits. Anchor A6 is the vendor asserting exactly this shape — hour 00 has one visit, one visitor and three pageviews from a visit that runs on for three more hours.",
  },

  // ---- pairwise covering array (48) -----------------------------------------
  // Every pair of levels across (panel, range, grain, filter_set) appears once.
  // A row of this block is the only place a panel, a non-default range, a
  // granularity and a filter shape are all moved at the same time, which is what
  // catches a cursor whose slots interfere.
  {
    id: "q-cv-source-custom_21d-week-disjunction",
    metric: "visitors",
    panel: "source",
    dimension: "",
    range: "custom_21d",
    grain: "week",
    filter_set: "disjunction",
    says: "The number of people who visited your site.",
    reads:
      "The per-source visitor counts over the 21-day window under a two-value browser filter, with the graph beside them cut into 4 Monday-start week buckets. The browser is the visit's, frozen at its first hit, so a visit matches on one value or the other and is counted once.",
    departs: "no",
    expects: "nonzero",
    hard_case: "",
    note:
      "The pair this row exists for is (custom_21d, week): 4 buckets and not 3, which is the only place `week_starts_sunday` is visible as a cardinality failure. It carries `disjunction` and `source` because the covering array needs those levels somewhere and this position is otherwise free.",
  },

  // ---- hard cases (40) -------------------------------------------------------
  // §4.1's ten, one or more rows each. A hard-case row is the only kind whose
  // `note` must name the wrong reading it discriminates against, because
  // coverage.test.ts's fourth anti-join reads exactly that.
  {
    id: "q-hc-H1-visits-boundary",
    metric: "visits",
    panel: "",
    dimension: "",
    range: "28d",
    grain: "",
    filter_set: "none",
    says: "A visit starts when a visitor first lands on your page and ends when no action is taken for 30 minutes.",
    reads:
      "A new visit begins iff the gap from that visitor's previous hit of ANY name reaches 1860 seconds. 1859 continues the visit and 1860 starts a new one. An `engagement` ping is an action and resets the clock. There is no maximum visit length and no cut at local midnight.",
    departs: "no",
    expects: "nonzero",
    hard_case: "H1",
    note:
      "1860 and not 1800: the vendor keeps a session while `NaiveDateTime.diff(t, session.timestamp, :minute) <= 30` (lib/plausible/session/cache_store.ex) and Elixir's `:minute` diff truncates, so 1859 s reads as 30 minutes. The published sentence says `30 minutes` and the truncation is what turns that into an integer. Discriminates against gap_ge_1800, gap_from_start and engagement_does_not_hold; the fixture plants consecutive gaps of exactly 1799, 1800, 1859 and 1860 for one visitor.",
  },

  // ---- declined (6) ----------------------------------------------------------
  // A question this app does not answer, with what declining costs. A `declined`
  // row satisfies an axis cell only with that cost in `note`, so the reverse
  // anti-join has something to point at instead of a silence.
  {
    id: "q-dc-visit_duration-hour",
    metric: "visit_duration",
    panel: "",
    dimension: "",
    range: "custom_dst_day",
    grain: "hour",
    filter_set: "none",
    says: "Average visit duration is the sum of all session lengths divided by the number of sessions, which includes those 0 second visits (bounces).",
    reads:
      "Not answered per bucket. `visit_duration` is a window-level number here; the graph carries `visitors`, `visits` and `pageviews` and nothing else.",
    departs: "declined",
    expects: "unanswered",
    hard_case: "H2",
    note:
      "The vendor does bucket it, by attributing a visit's whole duration to the hour of its LAST hit — anchor A6 asserts 12 000 s in hour 03 and 0 in hour 00 for a single visit open across all four. Declining costs that cell of the basis table and the one wrong reading it would catch (duration smeared across the hours a visit was open). Answering it would add a fourth bucketed metric and a second attribution rule with one anchor behind it.",
  },
];

/** What every seeded row must satisfy. Returns the reasons it does not, so the
 * caller reports all of a row's problems at once rather than the first. */
export function shape(q: Question): string[] {
  const bad: string[] = [];
  const m = /^q-(mf|pm|gp|rm|bb|cv|hc|dc)-/.exec(q.id);
  if (!m) bad.push(`id ${q.id} does not name a block`);
  if (!(METRICS as readonly string[]).includes(q.metric)) bad.push(`metric ${q.metric}`);
  if (q.panel !== "" && !(PANELS as readonly string[]).includes(q.panel)) bad.push(`panel ${q.panel}`);
  if (!(RANGES as readonly string[]).includes(q.range)) bad.push(`range ${q.range}`);
  if (q.grain !== "" && !(GRAINS as readonly string[]).includes(q.grain)) bad.push(`grain ${q.grain}`);
  if (!(FILTER_SETS as readonly string[]).includes(q.filter_set)) bad.push(`filter_set ${q.filter_set}`);
  if (q.grain !== "" && !(LEGAL_PAIRS as readonly string[]).includes(`${q.range}/${q.grain}`)) {
    bad.push(`(${q.range}, ${q.grain}) is not a legal pair`);
  }
  if (!["no", "approximates", "declined"].includes(q.departs)) bad.push(`departs ${q.departs}`);
  if (!["nonzero", "zero-by-ifNotFinite", "zero-by-empty-window", "zero-by-filter", "unanswered"].includes(q.expects)) {
    bad.push(`expects ${q.expects}`);
  }
  // A decline claims the app answers NOTHING there, and `questions.test.ts`
  // drives it as an absence. Any other declaration claims a number, which a
  // declined row does not have.
  if ((q.departs === "declined") !== (q.expects === "unanswered")) {
    bad.push(`departs ${q.departs} with expects ${q.expects}`);
  }
  if (q.hard_case !== "" && !(HARD_CASES as readonly string[]).includes(q.hard_case)) {
    bad.push(`hard_case ${q.hard_case}`);
  }
  // A departure with no stated cost is the failure mode `says`/`reads` exists to
  // prevent: the wording is on screen and the reason it differs is nowhere.
  if (q.departs !== "no" && q.note.trim() === "") bad.push("departs without a note");
  // `says` may be empty only where the vendor publishes no sentence, and then the
  // note has to say which source the reading rests on instead.
  if (q.says.trim() === "" && !/publishes no|no published/.test(q.note)) {
    bad.push("empty says without a note saying none is published");
  }
  if (q.reads.trim() === "") bad.push("empty reads");
  // Two columns that must never merge: a reads that repeats says grades nothing.
  if (q.says.trim() !== "" && q.says.trim() === q.reads.trim()) bad.push("reads repeats says");
  return bad;
}
