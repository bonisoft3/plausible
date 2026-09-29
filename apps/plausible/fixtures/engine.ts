// engine — the fixture's own reading of the log, and every named wrong reading
// beside it, as one function of a config.
//
// This is NOT the app's oracle. oracle.sql is (ORACLE.md §3.1), and ORACLE.md
// §3.2 rejects a TypeScript reference implementation as the primary ground truth
// for exactly the right reason: same language, same author, same file shape as
// the reduce. What this file is for is narrower and is something SQL cannot do
// cheaply — deciding, before any app code exists, whether a *plant*
// discriminates: whether the rule and a named wrong reading give different
// answers over this log. That question is about two readings, so both readings
// have to be expressible as one parameter change, which is what `Cfg` is.
//
// It reads events.json and nothing else. In particular it never reads
// sessions.json: the sidecar's whole value is that it was written by a different
// computation, and a prover that consulted it would destroy that.

import {
  dayKey,
  epochOf,
  gridOf,
  hourKey,
  mondayKey,
  nextHour,
  sundayKey,
  utcDayKey,
  utcHourKey,
  weekGrid,
} from "./clock.ts";

export type Ev = {
  id: string;
  epoch: number;
  visitor: string;
  name: "pageview" | "engagement" | "signup";
  interactive: boolean;
  pathname: string;
  source: string;
  browser: string;
};

/** events.json as the engine reads it: every instant as whole UTC seconds. */
export const parseLog = (text: string): Ev[] =>
  (JSON.parse(text) as (Omit<Ev, "epoch"> & { epoch: string })[]).map((e) => ({ ...e, epoch: epochOf(e.epoch) }));

export type Grain = "hour" | "day" | "week";
export type Metric =
  | "visitors"
  | "visits"
  | "pageviews"
  | "events"
  | "views_per_visit"
  | "bounce_rate"
  | "visit_duration"
  | "current_visitors"
  /** Not a metric the app renders: the number of buckets a legal pair covers.
   * H8's four wrong readings are each caught here rather than on a value, which
   * is what ORACLE §2.1 means by cardinality-not-arithmetic. */
  | "bucket_count"
  /** Not a metric the app renders either: the (visit, local hour) rows the whole
   * log produces, which is ORACLE §4.2's probe for `hours_from_nonengagement`.
   * That reading moves no window aggregate — `visits` counts visits, not the
   * hours they were open in — so it is probed on the row count or nowhere. */
  | "session_hours";

/** One knob per named wrong reading of ORACLE.md §4.2, plus the rule's own
 * values as the defaults. Nothing here has a default that is not the rule. */
export type Cfg = {
  /** H1 — the session boundary, as the integer it is. */
  boundary: number;
  /** H1 — the gap is measured from the last hit, not from the visit's start. */
  gapFrom: "last" | "start";
  /** H1 — a ping resets the clock. */
  engHolds: boolean;
  /** H2 — the visit's open span ends at its last hit of ANY name: a ping holds
   * the visit open, so it holds the hour open too. */
  openSpan: "close" | "live";
  /** H5 — events counts every hit except `engagement`. */
  eventsAll: boolean;
  /** H6 — duration runs to the last non-engagement hit. */
  durToLastAny: boolean;
  /** H6 — a zero-duration visit stays in the divisor. */
  durDropZero: boolean;
  /** H4 — bounce rate divides by the visits that ENTERED a matching page. */
  bounceDenom: "entry" | "matched";
  /** H9 — the other two averages keep the unrestricted divisor. */
  avgDenom: "matched" | "entry";
  /** H7 — a visit matches a page slot iff any of its hits does. */
  pageOnVisit: "contains" | "entry";
  /** H8 — a day is a local day. */
  dayKeyer: "local" | "utc";
  /** H8 — a week starts on the local Monday. */
  weekKeyer: "monday" | "sunday";
  /** H8 — N days back is N calendar days back, never N × 86 400. */
  windowMultiplied: boolean;
  /** H8 — the 23-hour day has 23 hour buckets. */
  hourGrid: "real" | "twentyfour";
  /** H10 — current visitors ignores the filter set. */
  currentFiltered: boolean;
};

export const RULE: Cfg = {
  boundary: 1860,
  gapFrom: "last",
  engHolds: true,
  openSpan: "close",
  eventsAll: false,
  durToLastAny: false,
  durDropZero: false,
  bounceDenom: "entry",
  avgDenom: "matched",
  pageOnVisit: "contains",
  dayKeyer: "local",
  weekKeyer: "monday",
  windowMultiplied: false,
  hourGrid: "real",
  currentFiltered: false,
};

/** Each named wrong reading is one switch. The roster is ORACLE.md §4.2's, and
 * fixture.test.ts holds these keys equal to the readings oracle.sql computes and
 * to the ones fixtures/plants.json claims: a reading nobody grades and a graded
 * reading no plant discriminates are the same defect from two ends. */
export const WRONG: Record<string, Partial<Cfg>> = {
  gap_ge_1800: { boundary: 1800 },
  gap_from_start: { gapFrom: "start" },
  engagement_does_not_hold: { engHolds: false },
  hours_from_nonengagement: { openSpan: "live" },
  events_count_every_hit: { eventsAll: true },
  duration_drops_zero: { durDropZero: true },
  duration_includes_engagement: { durToLastAny: true },
  bounce_on_viewed_page: { bounceDenom: "matched" },
  one_divisor_for_both: { avgDenom: "entry" },
  visit_row_filtered_on_page: { pageOnVisit: "entry" },
  utc_day_buckets: { dayKeyer: "utc" },
  week_starts_sunday: { weekKeyer: "sunday" },
  window_by_multiplication: { windowMultiplied: true },
  twenty_four_bars: { hourGrid: "twentyfour" },
  current_visitors_filtered: { currentFiltered: true },
  // The two readings that are not a per-row rule but a way of totalling
  // buckets. They are applied at the probe, not in the config.
  hourly_visits_summed: {},
  visitors_summed: {},
};

export const SUMMED = new Set(["hourly_visits_summed", "visitors_summed"]);

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export type Visit = {
  key: string;
  visitor: string;
  ord: number;
  start: number;
  last: number;
  hits: Ev[];
  entry_page: string;
  exit_page: string;
  pageviews: number;
  events: number;
  bounce: boolean;
  duration: number;
  /** Frozen at the first hit. */
  source: string;
  browser: string;
};

export function sessionize(log: Ev[], cfg: Cfg): Visit[] {
  const byVisitor = new Map<string, Ev[]>();
  for (const e of log) {
    const list = byVisitor.get(e.visitor) ?? [];
    list.push(e);
    byVisitor.set(e.visitor, list);
  }
  const out: Visit[] = [];
  const split = (gap: number) => gap >= cfg.boundary;

  for (const [visitor, all] of [...byVisitor].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    all.sort((a, b) => a.epoch - b.epoch || (a.id < b.id ? -1 : 1));
    let group: Ev[] = [];
    let ref = 0;
    let ord = 0;
    const flush = () => {
      if (group.length === 0) return;
      ord += 1;
      out.push(build(visitor, ord, group, cfg));
      group = [];
    };
    for (const e of all) {
      const counts = cfg.engHolds || e.name !== "engagement";
      if (group.length > 0 && counts && split(e.epoch - ref)) flush();
      if (group.length === 0) ref = e.epoch;
      else if (counts && cfg.gapFrom === "last") ref = e.epoch;
      group.push(e);
    }
    flush();
  }
  return out;
}

function build(visitor: string, ord: number, hits: Ev[], cfg: Cfg): Visit {
  const views = hits.filter((h) => h.name === "pageview");
  // A visit with no pageview, or one whose hits are all pings, cannot arise
  // under the rule — verify.ts asserts that of the log directly. It can arise
  // under a wrong reading, whose partition is not required to be well formed,
  // and the honest answer there is an absent entry page and a zero duration
  // rather than a raise that would report the wrong reading as a bug.
  const lastReal = cfg.durToLastAny
    ? hits[hits.length - 1]
    : ([...hits].reverse().find((h) => h.name !== "engagement") ?? hits[0]);
  return {
    key: `${visitor}#${ord}`,
    visitor,
    ord,
    start: hits[0].epoch,
    last: hits[hits.length - 1].epoch,
    hits,
    entry_page: views.length === 0 ? "" : views[0].pathname,
    exit_page: views.length === 0 ? "" : views[views.length - 1].pathname,
    pageviews: views.length,
    events: hits.filter((h) => cfg.eventsAll || h.name !== "engagement").length,
    // The vendor's closed form, spelled its way: cache_store.ex clears is_bounce
    // on `pageviews >= 2 or (interactive? and not pageview?)`. Over this log the
    // `<= 1` and the name test are both unobservable — §11's
    // visit_has_no_pageview and interactive_pageview refuse the only cases that
    // would read differently — so nothing but this line holds the spelling.
    bounce: views.length <= 1 && !hits.some((h) => h.interactive && h.name !== "pageview"),
    duration: lastReal.epoch - hits[0].epoch,
    source: hits[0].source,
    browser: hits[0].browser,
  };
}

// ---------------------------------------------------------------------------
// Filter sets
// ---------------------------------------------------------------------------

export type Slots = Partial<
  Record<"page" | "entry_page" | "source" | "browser" | "name", string>
>;

/** The declared filter shapes, spelled a second time. The operator rides inside
 * the value, so no filter value ever contains `&` or `=`.
 *
 * fixture.test.ts holds this map equal to oracle.sql's `fset` rows slot for
 * slot: two witnesses whose filter vocabularies have drifted apart are not
 * checking each other, they are answering different questions. */
export const FILTER_SETS: Record<string, Slots> = {
  none: {},
  "visit-1": { browser: "is:Chrome" },
  "event-1": { page: "is:/pricing" },
  "visit-visit": { source: "is:google", browser: "is:Chrome" },
  "event-visit": { page: "is:/blog/why", browser: "is:Safari" },
  negated: { source: "not:google" },
  contains: { page: "has:/blog" },
  disjunction: { browser: "is:Chrome|Safari" },
  unentered: { page: "is:/checkout" },
  "entry-page": { entry_page: "is:/docs" },
  goal: { name: "is:signup" },
};

const matchOp = (spec: string, value: string): boolean => {
  const i = spec.indexOf(":");
  const op = spec.slice(0, i);
  const arg = spec.slice(i + 1);
  if (op === "is") return arg.split("|").includes(value);
  if (op === "not") return !arg.split("|").includes(value);
  if (op === "has") return value.includes(arg);
  throw new Error(`unknown filter operator in ${spec}`);
};

/** A visit-dimension slot is answered by the visit; an event-dimension slot by
 * the hit's own column. That is why A3's second hit — which names no source —
 * still counts as a matching hit: its visit is a `google` visit. */
export function hitMatches(h: Ev, v: Visit, s: Slots): boolean {
  if (s.page !== undefined && !matchOp(s.page, h.pathname)) return false;
  if (s.name !== undefined && !matchOp(s.name, h.name)) return false;
  if (s.source !== undefined && !matchOp(s.source, v.source)) return false;
  if (s.browser !== undefined && !matchOp(s.browser, v.browser)) return false;
  if (s.entry_page !== undefined && !matchOp(s.entry_page, v.entry_page)) return false;
  return true;
}

export function visitMatches(v: Visit, s: Slots, cfg: Cfg): boolean {
  if (s.page !== undefined) {
    const ok = cfg.pageOnVisit === "entry"
      ? matchOp(s.page, v.entry_page)
      : v.hits.some((h) => matchOp(s.page!, h.pathname));
    if (!ok) return false;
  }
  if (s.name !== undefined && !v.hits.some((h) => matchOp(s.name!, h.name))) return false;
  if (s.source !== undefined && !matchOp(s.source, v.source)) return false;
  if (s.browser !== undefined && !matchOp(s.browser, v.browser)) return false;
  if (s.entry_page !== undefined && !matchOp(s.entry_page, v.entry_page)) return false;
  return true;
}

/** The bounce divisor: the same slots, with a page slot answered by the visit's
 * entry page instead of by containment. */
function enteredMatches(v: Visit, s: Slots, cfg: Cfg): boolean {
  if (s.page !== undefined && !matchOp(s.page, v.entry_page)) return false;
  return visitMatches(v, { ...s, page: undefined }, cfg);
}

// ---------------------------------------------------------------------------
// The world: one sessionization, indexed
// ---------------------------------------------------------------------------

export type World = {
  cfg: Cfg;
  log: Ev[];
  visits: Visit[];
  visitOf: Map<string, Visit>;
  /** The local hours each visit was open in, under this config's calendar. */
  hoursOf: Map<string, string[]>;
};

export function world(log: Ev[], cfg: Cfg): World {
  const visits = sessionize(log, cfg);
  const visitOf = new Map<string, Visit>();
  const hoursOf = new Map<string, string[]>();
  const hk = cfg.dayKeyer === "utc" ? utcHourKey : hourKey;
  for (const v of visits) {
    for (const h of v.hits) visitOf.set(h.id, v);
    const close = cfg.openSpan === "live"
      ? ([...v.hits].reverse().find((h) => h.name !== "engagement") ?? v.hits[0]).epoch
      : v.last;
    const hours: string[] = [];
    for (let e = v.start;; e = nextHour(e)) {
      const k = hk(e);
      if (hours[hours.length - 1] !== k) hours.push(k);
      if (nextHour(e) > close) break;
    }
    hoursOf.set(v.key, hours);
  }
  return { cfg, log, visits, visitOf, hoursOf };
}

// ---------------------------------------------------------------------------
// Windows and grids
// ---------------------------------------------------------------------------

import { backDays, localMidnight, midnightOf } from "./clock.ts";

export const AS_OF = 1775650800;
export type Range = "day" | "7d" | "28d" | "custom_21d" | "custom_dst_day";
export const RANGES: Range[] = ["day", "7d", "28d", "custom_21d", "custom_dst_day"];

export function windowOf(range: Range, cfg: Cfg): [number, number] {
  const mid = midnightOf(AS_OF);
  const back = (k: number) => (cfg.windowMultiplied ? mid - k * 86400 : backDays(mid, k));
  if (range === "day") return [back(0), AS_OF];
  if (range === "7d") return [back(6), AS_OF];
  if (range === "28d") return [back(27), AS_OF];
  if (range === "custom_21d") return [localMidnight(2026, 3, 15), localMidnight(2026, 4, 5)];
  return [localMidnight(2026, 3, 29), localMidnight(2026, 3, 30)];
}

export const LEGAL: [Range, Grain][] = [
  ["day", "hour"],
  ["7d", "day"],
  ["28d", "day"],
  ["28d", "week"],
  ["custom_21d", "day"],
  ["custom_21d", "week"],
  ["custom_dst_day", "hour"],
];

export function grid(range: Range, grain: Grain, cfg: Cfg): string[] {
  const [from, to] = windowOf(range, cfg);
  if (grain === "week") {
    return weekGrid(from, to, cfg.weekKeyer === "sunday" ? sundayKey : mondayKey);
  }
  if (grain === "hour" && cfg.hourGrid === "twentyfour") {
    // The naive reading: 24 labels for a local day, whether the clock skipped
    // one or not.
    const day = dayKey(from);
    return Array.from({ length: 24 }, (_, h) => `${day} ${String(h).padStart(2, "0")}`);
  }
  if (grain === "day" && cfg.dayKeyer === "utc") {
    const out: string[] = [];
    for (let e = Math.floor(from / 86400) * 86400; e < to; e += 86400) out.push(utcDayKey(e));
    return out;
  }
  if (grain === "hour" && cfg.dayKeyer === "utc") {
    const out: string[] = [];
    for (let e = Math.floor(from / 3600) * 3600; e < to; e += 3600) out.push(utcHourKey(e));
    return out;
  }
  return gridOf(from, to, grain);
}

const keyerFor = (grain: Grain, cfg: Cfg) =>
  grain === "hour"
    ? cfg.dayKeyer === "utc" ? utcHourKey : hourKey
    : grain === "day"
    ? cfg.dayKeyer === "utc" ? utcDayKey : dayKey
    : cfg.weekKeyer === "sunday"
    ? sundayKey
    : mondayKey;

// ---------------------------------------------------------------------------
// The metrics
// ---------------------------------------------------------------------------

const r2 = (x: number) => Math.round(x * 100) / 100;

export type Agg = {
  visitors: number;
  visits: number;
  pageviews: number;
  events: number;
  views_per_visit: number;
  bounce_rate: number;
  visit_duration: number;
  sessions_n: number;
  bounce_n: number;
  bounce_denom: number;
  pv_sum: number;
  dur_sum: number;
};

/** The window-level answer for one filter set. */
export function aggregate(w: World, slots: Slots, from: number, to: number): Agg {
  const { cfg } = w;
  const inWindow = (e: number) => from <= e && e < to;

  const hits = w.log.filter((h) => inWindow(h.epoch) && hitMatches(h, w.visitOf.get(h.id)!, slots));
  const matched = w.visits.filter((v) => inWindow(v.start) && visitMatches(v, slots, cfg));
  const entered = w.visits.filter((v) => inWindow(v.start) && enteredMatches(v, slots, cfg));

  const sessions_n = matched.length;
  const bounce_denom = cfg.bounceDenom === "entry" ? entered.length : sessions_n;
  const bounceSet = cfg.bounceDenom === "entry" ? entered : matched;
  const bounce_n = bounceSet.filter((v) => v.bounce).length;
  const pv_sum = matched.reduce((n, v) => n + v.pageviews, 0);
  const dur_sum = matched.reduce((n, v) => n + v.duration, 0);

  const avgDen = cfg.avgDenom === "entry" ? entered.length : sessions_n;
  const durDen = cfg.durDropZero
    ? (cfg.avgDenom === "entry" ? entered : matched).filter((v) => v.duration > 0).length
    : avgDen;

  return {
    visitors: new Set(hits.map((h) => h.visitor)).size,
    visits: sessions_n,
    pageviews: hits.filter((h) => h.name === "pageview").length,
    events: hits.filter((h) => cfg.eventsAll || h.name !== "engagement").length,
    views_per_visit: avgDen === 0 ? 0 : r2(pv_sum / avgDen),
    bounce_rate: bounce_denom === 0 ? 0 : Math.round((bounce_n / bounce_denom) * 100),
    visit_duration: durDen === 0 ? 0 : Math.round(dur_sum / durDen),
    sessions_n,
    bounce_n,
    bounce_denom,
    pv_sum,
    dur_sum,
  };
}

/** The three bucketed counts, per bucket of a legal pair. */
export function buckets(
  w: World,
  slots: Slots,
  range: Range,
  grain: Grain,
): Map<string, { visitors: number; visits: number; pageviews: number }> {
  const { cfg } = w;
  const [from, to] = windowOf(range, cfg);
  const keyer = keyerFor(grain, cfg);
  const out = new Map<string, { visitors: number; visits: number; pageviews: number }>();
  for (const k of grid(range, grain, cfg)) out.set(k, { visitors: 0, visits: 0, pageviews: 0 });

  const seen = new Map<string, Set<string>>();
  for (const h of w.log) {
    if (h.epoch < from || h.epoch >= to) continue;
    const v = w.visitOf.get(h.id)!;
    if (!hitMatches(h, v, slots)) continue;
    const k = keyer(h.epoch);
    const cell = out.get(k);
    if (cell === undefined) continue;
    if (h.name === "pageview") cell.pageviews += 1;
    const set = seen.get(k) ?? new Set();
    set.add(h.visitor);
    seen.set(k, set);
  }
  for (const [k, set] of seen) out.get(k)!.visitors = set.size;

  for (const v of w.visits) {
    if (!visitMatches(v, slots, cfg)) continue;
    if (grain === "hour") {
      // SessionHour: the visit is counted in every local hour it was open that
      // the window covers.
      for (const k of w.hoursOf.get(v.key)!) {
        const cell = out.get(k);
        if (cell !== undefined) cell.visits += 1;
      }
    } else {
      if (v.start < from || v.start >= to) continue;
      const cell = out.get(keyer(v.start));
      if (cell !== undefined) cell.visits += 1;
    }
  }
  return out;
}

export function currentVisitors(w: World, slots: Slots): number {
  const hits = w.log.filter((h) => h.epoch >= AS_OF - 300 && h.epoch < AS_OF);
  const kept = w.cfg.currentFiltered
    ? hits.filter((h) => hitMatches(h, w.visitOf.get(h.id)!, slots))
    : hits;
  return new Set(kept.map((h) => h.visitor)).size;
}

/** One probe, as plants.json states it. `summed` is how the two totalling
 * readings are expressed: not a different rule per row, but a different way of
 * arriving at the window figure. */
export function probe(
  w: World,
  p: { metric: Metric; filter_set: string; range: Range; grain: Grain | null },
  summed?: "hourly_visits_summed" | "visitors_summed",
): number {
  const slots = FILTER_SETS[p.filter_set];
  if (slots === undefined) throw new Error(`no filter set ${p.filter_set}`);
  if (p.metric === "current_visitors") return currentVisitors(w, slots);
  if (p.metric === "bucket_count") {
    if (p.grain === null) throw new Error(`bucket_count needs a grain`);
    return grid(p.range, p.grain, w.cfg).length;
  }
  // Over the whole log, so the probe reads neither `range` nor `grain`.
  if (p.metric === "session_hours") return [...w.hoursOf.values()].reduce((n, h) => n + h.length, 0);
  if (summed !== undefined) {
    if (p.grain === null) throw new Error(`${summed} needs the probe to name a grain`);
    const grain: Grain = summed === "hourly_visits_summed" ? "hour" : p.grain;
    const cells = [...buckets(w, slots, p.range, grain).values()];
    return summed === "hourly_visits_summed"
      ? cells.reduce((n, c) => n + c.visits, 0)
      : cells.reduce((n, c) => n + c.visitors, 0);
  }
  const [from, to] = windowOf(p.range, w.cfg);
  return aggregate(w, slots, from, to)[p.metric];
}
