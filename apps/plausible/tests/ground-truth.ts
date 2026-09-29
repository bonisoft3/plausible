// The ground truth, as this side sees it: one duckdb invocation per test run,
// cached behind a module-level lazy promise and shared by every test file.
//
// Three thousand separate `duckdb -c` calls at ~200 ms would be ten minutes; one
// is well under a second. Nothing here computes an answer — the arithmetic is all
// in oracle.sql, and a helper in this file that "adjusted" a number would put the
// app's author back on both sides of the comparison.
import { assertEquals } from "jsr:@std/assert@1";

/** The app directory. oracle.sql reads `fixtures/events.json` relative to the
 * process cwd, so the command runs from here and not from `tests/`. */
export const APP = new URL("../", import.meta.url);

export type Topline = {
  filter_set: string;
  range: string;
  metric: string;
  value_num: number;
  value_den: number | null;
  value_round: number;
  value_text: string;
};

export type Bucket = {
  filter_set: string;
  range: string;
  grain: string;
  bucket_key: string;
  ord: number;
  metric: string;
  value_num: number;
};

export type Breakdown = {
  filter_set: string;
  range: string;
  panel: string;
  dim_value: string;
  /** The row's 1-based position in its panel under `visitors desc, dim_value
   * asc`. The dashboard shows `ord <= panel_rows`; the full-panel screen shows
   * every ord in the same order. */
  ord: number;
  metric: string;
  value_num: number;
  value_den: number | null;
  value_round: number;
  value_text: string;
  /** per mille of the panel's largest visitor count; only on the visitors row */
  share: number | null;
  /** the bounce percentage as a dash length out of 100; only on the bounce row */
  arc: number | null;
  set_page: string;
  set_entry_page: string;
  set_source: string;
  set_browser: string;
  set_name: string;
};

export type Tick = {
  filter_set: string;
  range: string;
  grain: string;
  ord: number;
  value_num: number;
  at_permille: number;
};

export type Scale = {
  filter_set: string;
  range: string;
  grain: string;
  domain_raw: number;
  domain_max: number;
  step: number;
};

/** The coordinates path_d and floor_d are built from. Their exact strings are a
 * rendering decision svg.test.ts pins; these are the numbers behind them. */
export type ScalePoint = {
  filter_set: string;
  range: string;
  grain: string;
  ord: number;
  x_permille: number;
  y_permille: number;
};

export type Chip = {
  filter_set: string;
  slot: string;
  label: string;
  set_page: string;
  set_entry_page: string;
  set_source: string;
  set_browser: string;
  set_name: string;
};

export type Session = {
  session_id: string;
  visitor: string;
  ord: number;
  start_epoch: number;
  /** The visit's close: its last hit of any name, pings included. */
  last_epoch: number;
  entry_page: string;
  exit_page: string;
  pageviews: number;
  events: number;
  bounce: boolean;
  duration: number;
  source: string;
  browser: string;
};

export type SessionHour = { session_id: string; bucket_key: string };

export type Grid = {
  range: string;
  grain: string;
  ord: number;
  bucket_key: string;
  b_from: number;
};

/** One gesture that reaches a cursor: picking a declared shape, clicking a
 * breakdown row, or removing a chip. Several gestures reach the same `cursor`,
 * which is why the numbers hang off the cursor and not off this row. */
export type Reach = {
  origin_kind: "declared" | "drilldown" | "chip";
  /** the filter set the gesture started from, or the shape it picked */
  origin: string;
  /** the panel drilled, or the slot the chip removed; '' for `declared` */
  origin_panel: string;
  /** the range the drill-down happened at; '' unless `drilldown` */
  origin_range: string;
  /** the dimension value clicked, or the chip's label; '' for `declared` */
  origin_value: string;
  cursor: string;
  c_page: string;
  c_entry_page: string;
  c_source: string;
  c_browser: string;
  c_name: string;
};

/** The top line under a reachable cursor, at every range. The declared shapes
 * are in here too, computed by a second route, and oracle.sql §11 holds the two
 * equal. */
export type ReachTopline = {
  cursor: string;
  range: string;
  metric: string;
  value_num: number;
  value_den: number | null;
  value_round: number;
};

/** One of the vendor's own published assertions. `bucket_key` is null on the five
 * cohort-level cases and set on A6's four hour buckets, where the vendor asserts
 * per bucket instead. A null metric is one the case does not assert. */
export type Anchor = {
  anchor: string;
  bucket_key: string | null;
  visitors: number;
  visits: number;
  pageviews: number;
  events: number | null;
  views_per_visit: number | null;
  bounce_rate: number | null;
  visit_duration: number | null;
};

export type Wrong = {
  reading: string;
  hard_case: string;
  probe: string;
  value_rule: number;
  value_wrong: number;
};

export type Dependency = { determinant: string; dependent: string; independent: boolean };

/** A precondition oracle.sql could not meet. The list is asserted empty. */
export type Violation = { gate: string; detail: string };

/** A local hour two UTC hours reach, off the Zone rows alone: where the clock
 * steps back, `bucket_key` is not a key. The two slots are the hour-aligned UTC
 * instants that share it. */
export type ClockRepeat = { bucket_key: string; first_slot: number; second_slot: number };

export type Window = { range: string; wfrom: number; wto: number; span: number };

export type GroundTruth = {
  topline: Topline[];
  bucket: Bucket[];
  breakdown: Breakdown[];
  tick: Tick[];
  scale: Scale[];
  scale_point: ScalePoint[];
  chip: Chip[];
  session: Session[];
  session_hour: SessionHour[];
  grid: Grid[];
  reach: Reach[];
  reach_topline: ReachTopline[];
  anchor: Anchor[];
  wrong: Wrong[];
  dependency: Dependency[];
  violation: Violation[];
  clock_repeat: ClockRepeat[];
  windows: Window[];
  current_visitors: number;
  /** The vendor's MAX_ITEMS: how many rows the dashboard panel keeps. Echoed, like
   * `session_gap_seconds`, so this side never spells the number a second time. */
  panel_rows: number;
  /** Echoed by oracle.sql so the literal cannot drift on the SQL side unseen. */
  session_gap_seconds: number;
};

/** Every column of the output, in the order §12 emits them. A column that
 * appears in one place and not the other is a contract change, and it fails here
 * rather than as an `undefined` a hundred assertions later. */
export const COLUMNS: readonly (keyof GroundTruth)[] = [
  "topline",
  "bucket",
  "breakdown",
  "tick",
  "scale",
  "scale_point",
  "chip",
  "session",
  "session_hour",
  "grid",
  "reach",
  "reach_topline",
  "anchor",
  "wrong",
  "dependency",
  "violation",
  "clock_repeat",
  "windows",
  "current_visitors",
  "panel_rows",
  "session_gap_seconds",
] as const;

let pending: Promise<GroundTruth> | undefined;

/** The one invocation. `duckdb -json` writes one JSON document per
 * result-producing statement, and oracle.sql has exactly one, so stdout is a
 * single array holding a single row: `JSON.parse(stdout)[0]` is everything.
 *
 * The exit code is checked before the parse, because a SQL error goes to stderr
 * and leaves stdout empty — parsing first turns "the oracle is broken" into
 * "Unexpected end of JSON input", which is the wrong sentence to debug. */
export function groundTruth(): Promise<GroundTruth> {
  pending ??= (async () => {
    const run = await new Deno.Command("mise", {
      args: ["x", "--", "duckdb", "-json", "-c", ".read oracle.sql"],
      cwd: APP,
      stdout: "piped",
      stderr: "piped",
    }).output();
    const err = new TextDecoder().decode(run.stderr).trim();
    if (!run.success) throw new Error(`oracle.sql failed (exit ${run.code}):\n${err}`);
    const docs = JSON.parse(new TextDecoder().decode(run.stdout)) as GroundTruth[];
    // A second document means someone added a result-producing statement, and the
    // parse above would have thrown on the concatenation. Assert the shape anyway,
    // so a future `-json` that wraps documents in an array is caught here.
    assertEquals(docs.length, 1, "oracle.sql must produce exactly one row");
    const gt = docs[0];
    for (const c of COLUMNS) {
      if (!(c in gt)) throw new Error(`ground truth is missing column ${c}`);
    }
    return gt;
  })();
  return pending;
}

/** Index a list by a composite key, for the cardinality-then-value comparisons.
 * Duplicate keys throw: a key that is not unique is not a key, and a silent
 * last-wins would make a cardinality check compare the wrong sets. */
export function byKey<T>(rows: readonly T[], key: (r: T) => string): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) {
    const k = key(r);
    if (m.has(k)) throw new Error(`duplicate ground-truth key ${k}`);
    m.set(k, r);
  }
  return m;
}
