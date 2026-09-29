// The anti-joins of ORACLE.md §5.5, as functions over explicit inputs, plus the
// slot check the filter vocabulary needs.
//
// They are here rather than inline in coverage.test.ts for one reason: the two
// anti-joins over the graded space are the checks whose FAILURE matters, and a
// check that has never been seen to fail is a check nobody has tested. Each
// function below is exercised in both directions by coverage.test.ts, before the
// app exists, so the day one of them fires against real rendered rows it is
// already known to work.
import { BLOCKS, BLOCK_OF, FILTER_SETS, HARD_CASES, LEGAL_PAIRS, METRICS, PANELS, RANGES } from "./question-examples.ts";
import type { Question } from "./question-examples.ts";

export type Finding = { anti_join: string; detail: string };

/** A number the app rendered, as the sweep saw it.
 *
 * `screen` is the route that had to show it. Two screens answer the same
 * question about the same cursor — the dashboard's panel and the full-panel
 * screen both stack the page panel's leading rows — and a key without the screen
 * lets either one discharge the other's obligation: the panel screen renders
 * every ord of every panel, so keyed by position alone the dashboard's four
 * panels are read by nothing and deleting one of them leaves every check green.
 *
 * `cursor` is the whole five-slot filter the screen stands on, spelled the way
 * the route spells it, and it is what makes this a position rather than a
 * column name. Without it every number on /f/none and every number reached by a
 * drill-down share one key, and a dashboard that computes hundreds of cursors
 * against eleven graded ones reads as fully covered.
 * `dimension`/`dim_value` are '' for a top-line or bucket number;
 * `grain`/`bucket_key` are '' for anything that is not a graph bucket.
 *
 * `position` is where in its list this cell was stacked — which row of the
 * panel, or which bucket of the axis — as the ground truth ordinals it:
 * `Breakdown.ord` counts panel rows from one and `Bucket.ord` counts graph
 * buckets from zero, and this side spells neither a second way. It is 0 for a
 * top line, which stands in no list. It is what makes SELECTION and ORDER
 * gradable on both: every number a mis-ranked panel shows is a number the oracle
 * answers correctly at some other position, and a time axis rendered backwards
 * shows every bucket it should, so a key without it reports both as covered. */
export type Rendered = {
  screen: string;
  cursor: string;
  range: string;
  grain: string;
  bucket_key: string;
  dimension: string;
  dim_value: string;
  position: number;
  metric: string;
};

/** The two screens that carry graded numbers, as program.cue names them. Spelled
 * once, because the mount, the reader and the obligation below must agree and a
 * typo between them would move a whole screen's positions out of reach. */
export const DASH = "dash";
export const PANEL = "panel";

/** The metric `Breakdown.ord` ranks by, and so the one number the dashboard's
 * panel row carries: the row is a share bar of the panel's largest visitor
 * count, and there is nowhere else on it for a second figure to go. */
const RANKED_BY = "visitors";

/** Which screens owe one graded breakdown position.
 *
 * The dashboard keeps the vendor's first `panelRows` rows and shows the ranking
 * number on each; the full-panel screen shows every ord and all six metrics. So
 * the dashboard's obligation is a proper subset of the other's, which is exactly
 * why the screen must be in the key — a subset is discharged for free.
 *
 * Neither bound is a claim this file makes alone: a dashboard that drops a row
 * or a number fails `unrendered`, and one that shows a tenth row or a second
 * number fails `reverse`. */
export const breakdownScreens = (
  b: { ord: number; metric: string },
  panelRows: number,
): readonly string[] => (b.ord <= panelRows && b.metric === RANKED_BY ? [DASH, PANEL] : [PANEL]);

/** The five slots of a cursor, in the order the route spells them. */
export const SLOTS = ["f_page", "f_entry_page", "f_source", "f_browser", "f_name"] as const;

/** oracle.sql's `cursor_id`, spelled on this side. */
export const cursorId = (s: Record<(typeof SLOTS)[number], string>): string =>
  SLOTS.map((k) => `${k}=${s[k]}`).join("&");

/** The position a rendered number occupies, as the ground truth keys it. Three
 * shapes, and the prefix is part of the key: a top-line `visitors` and a panel's
 * `visitors` are different questions and must not collide. */
export function positionKey(r: Rendered): string {
  if (r.dimension !== "") {
    return key("brk", r.screen, r.cursor, r.range, r.dimension, String(r.position), r.dim_value, r.metric);
  }
  if (r.grain !== "") {
    return key("bucket", r.screen, r.cursor, r.range, r.grain, String(r.position), r.bucket_key, r.metric);
  }
  return key("top", r.screen, r.cursor, r.range, r.metric);
}

/** A key read back as the position it names. The two anti-joins over the graded
 * space differ only in which side they walk, and this is what lets the one that
 * walks the GRADED side report in the same units as the one that walks the
 * rendered side: a graded key nothing rendered is described by shape and cell
 * exactly as a rendered cell nothing grades is. */
export function position(k: string): Rendered {
  const p = k.split(SEP);
  const at = (i: number) => p[i] ?? "";
  if (p[0] === "brk") {
    return { screen: at(1), cursor: at(2), range: at(3), grain: "", bucket_key: "", dimension: at(4),
             dim_value: at(6), position: Number(at(5)), metric: at(7) };
  }
  if (p[0] === "bucket") {
    return { screen: at(1), cursor: at(2), range: at(3), grain: at(4), bucket_key: at(6), dimension: "",
             dim_value: "", position: Number(at(5)), metric: at(7) };
  }
  return { screen: at(1), cursor: at(2), range: at(3), grain: "", bucket_key: "", dimension: "",
           dim_value: "", position: 0, metric: at(4) };
}

/** The separator is a unit separator and not `|`, because a filter value may
 * itself hold a `|` — `is:Chrome|Safari` is one of the eleven declared shapes —
 * and a key a reader cannot split back apart is a key two positions can share. */
const SEP = "\u001f";
const key = (...parts: string[]) => parts.join(SEP);

/** The positions the ground truth answers, built from its own output. The
 * declared shapes reach this set through `reach`, so nothing here transcribes a
 * filter-set id into a cursor a second time.
 *
 * Every position names the screen that owes it. The top line and the graph live
 * on the dashboard alone; a breakdown row is owed by whichever screens
 * `breakdownScreens` says show it, which is both of them for the leading rows
 * and the full-panel screen alone below the cut. */
export function gradedSpace(gt: {
  reach: readonly { origin_kind: string; origin: string; cursor: string }[];
  topline: readonly { filter_set: string; range: string; metric: string }[];
  bucket: readonly {
    filter_set: string;
    range: string;
    grain: string;
    bucket_key: string;
    ord: number;
    metric: string;
  }[];
  breakdown: readonly {
    filter_set: string;
    range: string;
    panel: string;
    dim_value: string;
    ord: number;
    metric: string;
  }[];
  reach_topline: readonly { cursor: string; range: string; metric: string }[];
  panel_rows: number;
}): ReadonlySet<string> {
  const cursorOf = new Map(gt.reach.filter((r) => r.origin_kind === "declared").map((r) => [r.origin, r.cursor]));
  const at = (id: string) => {
    const c = cursorOf.get(id);
    if (c === undefined) throw new Error(`filter set ${id} is graded and is not in the closure`);
    return c;
  };
  const out = new Set<string>();
  for (const t of gt.topline) out.add(key("top", DASH, at(t.filter_set), t.range, t.metric));
  for (const t of gt.reach_topline) out.add(key("top", DASH, t.cursor, t.range, t.metric));
  for (const b of gt.bucket) {
    out.add(key("bucket", DASH, at(b.filter_set), b.range, b.grain, String(b.ord), b.bucket_key, b.metric));
  }
  for (const b of gt.breakdown) {
    for (const screen of breakdownScreens(b, gt.panel_rows)) {
      out.add(key("brk", screen, at(b.filter_set), b.range, b.panel, String(b.ord), b.dim_value, b.metric));
    }
  }
  return out;
}

/** What the closure does NOT grade, and what declining it costs.
 *
 * The bound is one gesture: the top line under any reachable cursor is graded at
 * every range, and nothing below it is. These entries are not documentation —
 * `reverse` matches a rendered number against them and reports the decline by
 * name, so a screen that starts showing one of these is a finding and not a
 * silence. */
export const DECLINED_REACH: {
  region: string;
  matches: (r: Rendered, declared: ReadonlySet<string>) => boolean;
  cost: string;
}[] = [
  {
    region: "the graph under a reached cursor",
    matches: (r, declared) => r.grain !== "" && !declared.has(r.cursor),
    cost:
      "89 919 numbers, at 291 reachable cursors x 103 buckets x 3 metrics. A bucket fold that reads a filter slot " +
      "wrongly escapes ONLY here: the same slot moves the top line under the same cursor, which is graded, so what " +
      "survives is a defect confined to the bucketing path and conditional on a slot the eleven declared shapes " +
      "leave empty. Grading it costs an oracle output four times its present size.",
  },
  {
    region: "the panels under a reached cursor",
    matches: (r, declared) => r.dimension !== "" && !declared.has(r.cursor),
    cost:
      "Not enumerable at this bound: a panel row under a reached cursor IS the next gesture's cursor, so grading " +
      "these is grading depth two, and the closure does not terminate at any size this oracle can emit. What " +
      "escapes is a breakdown fold that is correct from a declared shape and wrong from a drilled one.",
  },
];

/** ORACLE.md §2.1's basis table, as the cells the axis anti-join must see driven.
 * A bucketed cell is `metric@grain`; a metric the app declines to bucket is
 * `metric@window` and is satisfied only by a `declined` row with a cost. */
export const BASIS_CELLS = [
  "visitors@hour", "visitors@day", "visitors@week",
  "visits@hour", "visits@day", "visits@week",
  "pageviews@hour", "pageviews@day", "pageviews@week",
  "events@window", "views_per_visit@window", "bounce_rate@window", "visit_duration@window",
] as const;

/** ORACLE.md §4.2's named wrong readings, in full. Every one must be named by
 * some driven question, or a plant is discriminating against nothing anybody
 * published. */
export const WRONG_READINGS = [
  "gap_ge_1800",
  "gap_from_start",
  "engagement_does_not_hold",
  "hourly_visits_summed",
  "visitors_summed",
  "bounce_on_viewed_page",
  "events_count_every_hit",
  "duration_drops_zero",
  "duration_includes_engagement",
  "visit_row_filtered_on_page",
  "utc_day_buckets",
  "week_starts_sunday",
  "window_by_multiplication",
  "twenty_four_bars",
  "one_divisor_for_both",
  "current_visitors_filtered",
  "hours_from_nonengagement",
] as const;

/** FORWARD. A published question nothing drove fails the run and names it. Also
 * the two failures either side of it: a drive of an id nothing publishes, and a
 * seeded count that has drifted from the number the ir states. */
export function forward(seeded: readonly Question[], driven: ReadonlySet<string>): Finding[] {
  const out: Finding[] = [];
  const ids = new Set(seeded.map((q) => q.id));
  for (const q of seeded) {
    if (!driven.has(q.id)) out.push({ anti_join: "forward", detail: `seeded but never driven: ${q.id}` });
  }
  for (const d of driven) {
    if (!ids.has(d)) out.push({ anti_join: "forward", detail: `drives() names no seeded question: ${d}` });
  }
  const total = Object.values(BLOCKS).reduce((a, b) => a + b, 0);
  if (seeded.length !== total) {
    out.push({ anti_join: "forward", detail: `seeded ${seeded.length} questions; the blocks sum to ${total}` });
  }
  // Per block, so a block that lost rows is named as that block rather than as a
  // total that is 12 short.
  const per = new Map<string, number>();
  for (const q of seeded) {
    const b = BLOCK_OF[q.id.slice(2, 4)];
    if (!b) {
      out.push({ anti_join: "forward", detail: `id names no block: ${q.id}` });
      continue;
    }
    per.set(b, (per.get(b) ?? 0) + 1);
  }
  for (const [block, want] of Object.entries(BLOCKS)) {
    const got = per.get(block) ?? 0;
    if (got !== want) out.push({ anti_join: "forward", detail: `block ${block}: ${got} rows, expected ${want}` });
  }
  return out;
}

/** REVERSE. Every number the app RENDERED must be a position the ground truth
 * answers. A number the app can show that nothing grades is a finding: the
 * forward anti-join catches a question that stopped being asked, this one
 * catches an answer nobody ever asked for, and `unrendered` below catches an
 * answer nobody ever gave. Only the last two see the graded space at all.
 *
 * `graded` is keyed by POSITION — cursor, range, grain, bucket, panel, row
 * number, value, metric — and not by column name, so a number rendered under a
 * cursor the oracle has no opinion about is caught even when a number of the
 * same shape under `none` is graded. That is the whole difference: the closure
 * is 291 cursors and the declared vocabulary is 11, and a key that cannot tell
 * them apart reports the other 280 as covered. The row number is in the key for
 * the same reason one level down: a panel ranked by the wrong metric shows nine
 * rows whose every number the oracle answers, and answers correctly, so only the
 * POSITION each was shown at can tell the two panels apart.
 *
 * A position inside a DECLINED_REACH region is reported as its own kind, with
 * the cost, because "we chose not to grade this" and "nothing grades this" are
 * different findings and only one of them is a decision anybody made.
 *
 * This is the local stand-in for a platform lint that does not exist: nothing in
 * this tree catches a column no screen reads, and with nine reduce-written
 * entities this app has the largest fossil surface any app here has shipped. */
export function reverse(
  rendered: readonly Rendered[],
  graded: ReadonlySet<string>,
  declared: ReadonlySet<string>,
): Finding[] {
  const out: Finding[] = [];
  for (const { r, cells } of byShape(rendered.filter((r) => !graded.has(positionKey(r))))) {
    const declined = DECLINED_REACH.find((d) => d.matches(r, declared));
    if (declined) {
      out.push({
        anti_join: "declined",
        detail: `${r.screen} renders ${declined.region}: ${r.cursor} ${r.range} ` +
          `(${r.dimension || r.grain || "top line"}, ${r.metric}). ${declined.cost}`,
      });
      continue;
    }
    out.push({
      anti_join: "reverse",
      detail: `${r.screen} renders (${r.cursor}, ${r.range}, ${r.dimension || r.grain || "top line"}, ` +
        `${r.metric}) and nothing grades ${cells.join(", ")}`,
    });
  }
  return out;
}

/** UNRENDERED. Every position the ground truth answers must be a number the
 * sweep saw on screen. It is `reverse` walked from the other side, and without
 * it the pair is half an oracle: `reverse` can only fire on something the app
 * SHOWED, so an app that shows nothing, or drops a whole panel, or cuts a panel
 * to its top three rows, produces no finding anywhere in this file. The forward
 * anti-join does not close that gap — it grades the question ROSTER and never
 * sees a rendered or a graded position at all.
 *
 * There is no declined region on this side. `graded` is exactly what the oracle
 * chose to answer, and every one of those numbers is a number some screen of the
 * sweep must show; the regions nobody grades are absent from the set rather than
 * excused inside it. */
export function unrendered(graded: ReadonlySet<string>, rendered: readonly Rendered[]): Finding[] {
  const shown = new Set(rendered.map(positionKey));
  const missing = [...graded].filter((k) => !shown.has(k)).map(position);
  return byShape(missing).map(({ r, cells }) => ({
    anti_join: "unrendered",
    detail: `${r.screen} does not render (${r.cursor}, ${r.range}, ${r.dimension || r.grain || "top line"}, ` +
      `${r.metric}); the oracle answers ${cells.join(", ")}`,
  }));
}

/** Group positions into the shapes a finding is reported per.
 *
 * One finding per SHAPE and not per cell — the same defect across 28 buckets is
 * one defect, and a per-cell report buries the other findings under a wall of
 * the same sentence — but the finding NAMES every cell in the shape. That is
 * what a re-ranking needs: the shape is one defect and the report has to say
 * which rows moved. The screen opens the shape, so a panel the dashboard stopped
 * showing is its own finding and not one merged into the full-panel screen's. */
function byShape(rows: readonly Rendered[]): { r: Rendered; cells: string[] }[] {
  const shaped = new Map<string, { r: Rendered; cells: string[] }>();
  for (const r of rows) {
    const shape = `${r.screen}|${r.cursor}|${r.range}|${r.grain}|${r.dimension}|${r.metric}`;
    const at = shaped.get(shape) ?? { r, cells: [] };
    at.cells.push(cellName(r));
    shaped.set(shape, at);
  }
  return [...shaped.values()];
}

/** How one cell is named inside its shape's finding. A panel row and a graph
 * bucket are both named by the position they stand at as well as by their value,
 * because a value the oracle grades at another position is exactly the
 * mis-ordering case and a report naming the value alone reads as though the row
 * does not exist. */
const cellName = (r: Rendered): string =>
  r.dimension !== "" ? `#${r.position} ${r.dim_value}` : r.grain !== "" ? `#${r.position} ${r.bucket_key}` : "-";

/** SLOTS. Every slot of the cursor is occupied by some graded position. A slot
 * no graded number depends on is a column of the read grammar a rollup can
 * ignore entirely while producing byte-identical output on every assertion in
 * the apparatus, so this is the only check that can see it at all. */
export function slots(graded: ReadonlySet<string>): Finding[] {
  const out: Finding[] = [];
  for (const slot of SLOTS) {
    const driven = [...graded].some((k) => {
      const c = position(k).cursor;
      const at = c.indexOf(`${slot}=`);
      if (at < 0) return false;
      const rest = c.slice(at + slot.length + 1);
      return rest !== "" && rest[0] !== "&";
    });
    if (!driven) out.push({ anti_join: "slots", detail: `no graded number depends on ${slot}` });
  }
  return out;
}

/** AXIS. Every vocabulary row and every basis cell appears in at least one DRIVEN
 * question, not merely in the sweep. A `declined` row satisfies a cell only with
 * its cost stated in `note` — otherwise declining a cell and forgetting it are
 * the same green run. */
export function axis(seeded: readonly Question[], driven: ReadonlySet<string>): Finding[] {
  const out: Finding[] = [];
  const live = seeded.filter((q) => driven.has(q.id));
  const want = (kind: string, values: readonly string[], of: (q: Question) => string) => {
    for (const v of values) {
      if (!live.some((q) => of(q) === v)) out.push({ anti_join: "axis", detail: `no driven question for ${kind} ${v}` });
    }
  };
  want("metric", METRICS, (q) => q.metric);
  want("panel", PANELS, (q) => q.panel);
  want("range", RANGES, (q) => q.range);
  want("filter set", FILTER_SETS, (q) => q.filter_set);
  want("legal pair", LEGAL_PAIRS, (q) => (q.grain === "" ? "" : `${q.range}/${q.grain}`));
  for (const cell of BASIS_CELLS) {
    const [metric, grain] = cell.split("@");
    const hit = live.filter((q) => q.metric === metric && (grain === "window" ? q.grain === "" : q.grain === grain));
    if (hit.length === 0) {
      out.push({ anti_join: "axis", detail: `no driven question for basis cell ${cell}` });
      continue;
    }
    // A cell covered only by declined rows needs the cost, in one of them.
    if (hit.every((q) => q.departs === "declined") && !hit.some((q) => q.note.trim() !== "")) {
      out.push({ anti_join: "axis", detail: `basis cell ${cell} is declined with no cost stated` });
    }
  }
  return out;
}

/** HARD CASES. Every H1..H10 is named by at least one driven question, and every
 * named wrong reading of §4.2 is named by at least one. The second half is what
 * keeps a plant from discriminating against a reading no published question
 * mentions. */
export function hardCases(seeded: readonly Question[], driven: ReadonlySet<string>): Finding[] {
  const out: Finding[] = [];
  const live = seeded.filter((q) => driven.has(q.id));
  for (const h of HARD_CASES) {
    if (!live.some((q) => q.hard_case === h)) {
      out.push({ anti_join: "hard-cases", detail: `no driven question names ${h}` });
    }
  }
  const notes = live.map((q) => q.note).join("\n");
  for (const w of WRONG_READINGS) {
    if (!notes.includes(w)) {
      out.push({ anti_join: "hard-cases", detail: `no driven question names the wrong reading ${w}` });
    }
  }
  return out;
}
