// The coverage anti-joins, and the worked question rows they read.
//
// Two halves. The first grades the eight example rows against the closed
// vocabularies, so the 304 rows written from them are mechanical rather than
// hopeful. The second exercises every anti-join in BOTH directions — clean input
// passes, and each planted defect is caught and named — because an anti-join
// that has never been seen to fail is a check nobody has tested, and the pair
// over the graded space is the whole reason this file exists.
//
// When the seeded rows land, `SEEDED` below becomes the app's own `Question` rows
// read off the mounted store, `DRIVEN` becomes the ids the sweep drove, and the
// two stand-in rendered sets — `RENDERED` and `PERFECT` — become the one set the
// sweep recorded. The functions do not change.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { BLOCKS, EXAMPLES, FILTER_SETS, LEGAL_PAIRS, METRICS, PANELS, RANGES, shape } from "./question-examples.ts";
import type { Question } from "./question-examples.ts";
import { axis, BASIS_CELLS, breakdownScreens, cursorId, DASH, DECLINED_REACH, forward, gradedSpace, hardCases, PANEL, positionKey, reverse, slots, unrendered, WRONG_READINGS } from "./coverage.ts";
import type { Rendered } from "./coverage.ts";
import { groundTruth } from "./ground-truth.ts";

Deno.test("every worked example satisfies the closed vocabularies", () => {
  for (const q of EXAMPLES) {
    const bad = shape(q);
    assertEquals(bad, [], `${q.id}: ${bad.join("; ")}`);
  }
});

Deno.test("there is exactly one worked example per block", () => {
  // The examples are what makes the rest mechanical, so a block with no example
  // is a block someone will invent a shape for.
  const blocks = EXAMPLES.map((q) => q.id.slice(2, 4));
  assertEquals(new Set(blocks).size, Object.keys(BLOCKS).length);
  assertEquals(blocks.length, Object.keys(BLOCKS).length);
});

Deno.test("`says` is quoted and `reads` answers it", () => {
  for (const q of EXAMPLES) {
    // The one rung of this apparatus that grades the READING rather than the
    // arithmetic. A `reads` that echoes `says` grades nothing, and a departure
    // reworded into agreement is what the two columns exist to make impossible.
    assert(q.reads.trim() !== q.says.trim(), `${q.id}: reads repeats says`);
    if (q.departs !== "no") {
      assert(q.note.length > 40, `${q.id}: a departure needs its cost stated, not a phrase`);
    }
  }
});

// ---------------------------------------------------------------------------
// A clean, self-consistent input for the anti-joins.
// ---------------------------------------------------------------------------

/** The eight examples plus the rows the axis and hard-case anti-joins need to be
 * satisfiable at all: every metric, panel, range, filter set, legal pair, basis
 * cell and named wrong reading. It is not the seeded 312 — those are program.cue's
 * — it is the smallest input on which every anti-join is green, which is what
 * makes a planted defect below unambiguous. */
const SEEDED: Question[] = (() => {
  const rows: Question[] = [...EXAMPLES];
  const base = EXAMPLES[0];
  const add = (id: string, over: Partial<Question>) =>
    rows.push({ ...base, id, hard_case: "", departs: "no", expects: "nonzero", note: "filler", ...over });
  // Every loop below walks a closed vocabulary rather than a list typed out
  // here. A level added to METRICS or FILTER_SETS has to arrive as a missing
  // driven question, and a second copy of the levels in this file would answer
  // that question with the old list and stay green.
  for (const m of METRICS) add(`q-mf-${m}-none`, { metric: m, filter_set: "none", panel: "", grain: "" });
  for (const p of PANELS) add(`q-pm-${p}`, { panel: p, grain: "" });
  for (const r of RANGES) add(`q-rm-${r}`, { range: r, panel: "", grain: "" });
  for (const f of FILTER_SETS) add(`q-mf-none-${f}`, { filter_set: f, panel: "", grain: "" });
  for (const pair of LEGAL_PAIRS) {
    const [range, grain] = pair.split("/");
    add(`q-gp-${range}-${grain}`, { range, grain, panel: "" });
  }
  for (const cell of BASIS_CELLS) {
    const [metric, grain] = cell.split("@");
    if (grain === "window") add(`q-bb-${metric}-window`, { metric, grain: "", panel: "" });
    else {
      const range = grain === "hour" ? "day" : "28d";
      add(`q-bb-${metric}-${grain}`, { metric, grain, range, panel: "" });
    }
  }
  for (const h of ["H2", "H3", "H4", "H5", "H8", "H9", "H10"]) {
    add(`q-hc-${h}`, { hard_case: h, panel: "", grain: "" });
  }
  // Every named wrong reading must be mentioned by some driven question's note.
  add("q-hc-readings", { hard_case: "H1", panel: "", grain: "", note: WRONG_READINGS.join(" ") });
  return rows;
})();

const DRIVEN = new Set(SEEDED.map((q) => q.id));

/** The graded space and the eleven declared cursors, read off the oracle's own
 * output. Nothing here transcribes a cursor: a hand-written cursor in this file
 * would be the same defect as the hand-written column list that let entry_page
 * be read two ways. */
const GT = await groundTruth();
const GRADED = gradedSpace(GT);
const DECLARED = new Set(GT.reach.filter((r) => r.origin_kind === "declared").map((r) => r.cursor));
const CURSOR = new Map(GT.reach.filter((r) => r.origin_kind === "declared").map((r) => [r.origin, r.cursor]));

const at = (id: string) => CURSOR.get(id)!;
const blank = { grain: "", bucket_key: "", dimension: "", dim_value: "", position: 0 };

/** The rows of one panel as the oracle ranks them, in order. Read off the ground
 * truth rather than typed here, so a re-ranking on the SQL side arrives as a
 * moved row and not as a stale copy that still agrees with itself. */
const panelRows = (filter_set: string, range: string, panel: string, metric: string) =>
  GT.breakdown
    .filter((b) => b.filter_set === filter_set && b.range === range && b.panel === panel && b.metric === metric)
    .sort((a, b) => a.ord - b.ord);

/** The panel the escape below is measured on, and the one the RENDERED sample
 * draws its graded row from. */
const PAGES = panelRows("none", "28d", "page", "visitors");

/** The first bucket of one graph, with the position it stands at. A bucket's
 * `ord` is its place on the time axis, and it is half its key. */
const GOAL_BUCKET = GT.bucket
  .filter((b) => b.filter_set === "goal" && b.range === "7d" && b.grain === "day" && b.metric === "pageviews")
  .sort((a, b) => a.ord - b.ord)[0];

/** Four numbers the app really can show, at four positions the oracle really
 * does answer. */
const RENDERED: Rendered[] = [
  { screen: DASH, cursor: at("none"), range: "28d", ...blank, metric: "visitors" },
  { screen: DASH, cursor: at("none"), range: "28d", ...blank, metric: "bounce_rate" },
  {
    screen: PANEL,
    cursor: at("none"),
    range: "28d",
    grain: "",
    bucket_key: "",
    dimension: "page",
    dim_value: PAGES[0].dim_value,
    position: PAGES[0].ord,
    metric: "visitors",
  },
  {
    screen: DASH,
    cursor: at("goal"),
    range: "7d",
    grain: "day",
    bucket_key: GOAL_BUCKET.bucket_key,
    dimension: "",
    dim_value: "",
    position: GOAL_BUCKET.ord,
    metric: "pageviews",
  },
];

/** Every graded position, rendered where the app renders it: the input a perfect
 * sweep would record. `RENDERED` above is four numbers because the reverse
 * rehearsals add ONE bad cell to a clean sample and count the findings; this one
 * exists because the anti-join in the other direction has nothing to say until
 * its input is the whole graded space, and building it from the oracle's own
 * rows is what makes "the app must show all of this" mechanical rather than a
 * list somebody maintains. */
const PERFECT: Rendered[] = [
  // The declared shapes' top lines are graded twice by two routes and land on
  // one key, so walking the closure alone covers all 330 of them.
  ...GT.reach_topline.map((t) => ({ screen: DASH, cursor: t.cursor, range: t.range, ...blank, metric: t.metric })),
  ...GT.bucket.map((b) => ({
    screen: DASH,
    cursor: at(b.filter_set),
    range: b.range,
    grain: b.grain,
    bucket_key: b.bucket_key,
    dimension: "",
    dim_value: "",
    position: b.ord,
    metric: b.metric,
  })),
  // A breakdown row is owed by every screen that shows it, so a leading row is
  // two positions and not one: the dashboard's copy and the full-panel screen's
  // are distinct obligations, and neither discharges the other.
  ...GT.breakdown.flatMap((b) =>
    breakdownScreens(b, GT.panel_rows).map((screen) => ({
      screen,
      cursor: at(b.filter_set),
      range: b.range,
      grain: "",
      bucket_key: "",
      dimension: b.panel,
      dim_value: b.dim_value,
      position: b.ord,
      metric: b.metric,
    }))
  ),
];

/** One whole panel of PERFECT, as the cells a sweep would record for it, on both
 * screens that show it. */
const panelCells = (filter_set: string, range: string, panel: string) =>
  PERFECT.filter((r) => r.cursor === at(filter_set) && r.range === range && r.dimension === panel);

/** The page-panel rows the screen an `unrendered` finding names is owed. The
 * dashboard is owed the rows above the vendor's cut and the full-panel screen
 * every one, so a finding against the dashboard that named a tenth row would be
 * asking for a row no reader can see there. */
const owedRows = (f: { detail: string }) =>
  f.detail.startsWith(`${DASH} `) ? PAGES.filter((b) => b.ord <= GT.panel_rows) : PAGES;

// ---------------------------------------------------------------------------
// Green, then each direction of red.
// ---------------------------------------------------------------------------

Deno.test("every anti-join is green on a consistent input", () => {
  const seeded = SEEDED;
  // `forward` also checks the block totals against the block table, which this
  // stand-in input deliberately does not have, so that one finding is expected and
  // is filtered here by name rather than by count.
  const f = forward(seeded, DRIVEN).filter((x) => !/^seeded \d+ questions|^block /.test(x.detail));
  assertEquals(f, [], f.map((x) => x.detail).join("\n"));
  assertEquals(reverse(RENDERED, GRADED, DECLARED), []);
  // A sweep that shows every graded number and nothing else is clean in both
  // directions at once. What the pair witnesses is that the two sides spell one
  // position the SAME way: a position `positionKey` builds one way and
  // `gradedSpace` another fails as a finding on one side and a finding on the
  // other. What it cannot witness is the ground truth's own construction —
  // `PERFECT` and `GRADED` are two folds of ONE `groundTruth()` call, so an
  // oracle.sql table that dropped a whole class of rows would drop from both and
  // this stays green. That defect is owned elsewhere and twice: oracle.test.ts
  // asserts the top-line and bucket cardinalities against products of the
  // vocabulary, and sweep.test.ts walks the graded space against numbers read off
  // the DOM, where a dropped class fires as `reverse` — the app goes on rendering
  // what nothing grades any more.
  const u = unrendered(GRADED, PERFECT);
  assertEquals(u, [], u.slice(0, 5).map((x) => x.detail).join("\n"));
  assertEquals(reverse(PERFECT, GRADED, DECLARED), []);
  const a = axis(seeded, DRIVEN);
  assertEquals(a, [], a.map((x) => x.detail).join("\n"));
  const h = hardCases(seeded, DRIVEN);
  assertEquals(h, [], h.map((x) => x.detail).join("\n"));
  const sl = slots(GRADED);
  assertEquals(sl, [], sl.map((x) => x.detail).join("\n"));
});

Deno.test("slots catches a filter slot no graded number depends on", () => {
  // The escape this exists for: if every graded number is computed under a
  // cursor whose `f_name` is empty, a rollup that never reads the slot is
  // byte-identical to one that does, and no other check in the apparatus can
  // tell them apart.
  const without = new Set([...GRADED].filter((k) => !k.includes("f_name=is:")));
  const out = slots(without);
  assertEquals(out.map((f) => f.detail), ["no graded number depends on f_name"]);
  // And the same list on the real space is empty, which is the claim: the eleven
  // declared shapes occupy all five slots between them.
  assertEquals(slots(GRADED), []);
});

Deno.test("forward catches a published question nothing drove", () => {
  // PLAN.md stage 11 rehearses this by deleting a drives() call. Here it is the
  // same defect, run every time rather than once by hand.
  const driven = new Set(DRIVEN);
  driven.delete("q-hc-H1-visits-boundary");
  const out = forward(SEEDED, driven);
  assert(out.some((f) => f.detail === "seeded but never driven: q-hc-H1-visits-boundary"), out.map((f) => f.detail).join("\n"));
});

Deno.test("forward catches a drive of a question nothing publishes", () => {
  const driven = new Set(DRIVEN).add("q-mf-invented");
  const out = forward(SEEDED, driven);
  assert(out.some((f) => f.detail === "drives() names no seeded question: q-mf-invented"));
});

Deno.test("unrendered catches an app that shows nothing at all", () => {
  // The complement of `reverse`, and the reason it had to be written: `reverse`
  // walks the RENDERED rows, so on an empty sweep it has nothing to walk and
  // reports a clean run. `forward` cannot cover for it — it grades the question
  // roster and is never handed a rendered or a graded position.
  const out = unrendered(GRADED, []);
  assert(out.length > 0);
  assert(out.every((f) => f.anti_join === "unrendered"));
  // Nothing is lost in the grouping: every graded position is named in some
  // finding, so the report a reader gets accounts for the whole graded space and
  // not for the shapes that happened to group first.
  const named = out.reduce((n, f) => n + f.detail.split("the oracle answers ")[1].split(", ").length, 0);
  assertEquals(named, GRADED.size);
  console.log(`an app that renders nothing: ${out.length} findings over ${GRADED.size} graded positions`);
});

Deno.test("unrendered catches a whole panel that was never shown", () => {
  // The measured escape. Without this anti-join, deleting an entire panel from
  // the sweep produces zero findings in this file: every number the app still
  // shows is graded, and the ones it stopped showing are nobody's.
  const gone = new Set(panelCells("none", "28d", "page"));
  assert(gone.size > 0);
  const out = unrendered(GRADED, PERFECT.filter((r) => !gone.has(r)));
  // One finding per SCREEN and metric of the panel, and each names every row
  // that screen is owed.
  assertEquals(
    out.length,
    new Set([...gone].map((r) => `${r.screen}|${r.metric}`)).size,
    out.map((f) => f.detail).join("\n"),
  );
  for (const f of out) {
    assert(f.detail.includes(`(${at("none")}, 28d, page, `), f.detail);
    for (const b of owedRows(f)) {
      assert(f.detail.includes(`#${b.ord} ${b.dim_value}`), `${b.ord} ${b.dim_value}: ${f.detail}`);
    }
  }
  console.log(`a deleted panel: ${out.length} findings over ${gone.size} graded numbers`);
});

Deno.test("unrendered catches the dashboard's copy of a panel the full-panel screen still shows", () => {
  // The measured escape this key was widened for. Delete a panel from the
  // dashboard's markup and the full-panel screen goes on rendering every ord of
  // it, so keyed by position alone the graded space stays fully covered: the
  // build fixpoints, cue vet passes, lint finds nothing and every test is green
  // while a quarter of the dashboard is gone. The screen in the key is what makes
  // the dashboard's copy an obligation of its own.
  const gone = new Set(PERFECT.filter((r) => r.screen === DASH && r.dimension === "page"));
  assert(gone.size > 0);
  const left = PERFECT.filter((r) => !gone.has(r));
  const out = unrendered(GRADED, left);
  assert(out.length > 0, "the dashboard lost a panel and nothing said so");
  for (const f of out) {
    assert(f.detail.startsWith(`${DASH} does not render`), f.detail);
    assert(f.detail.includes(", page, "), f.detail);
  }
  // Nothing else moved: the full-panel screen's rows are all still there, so this
  // is a missing SCREEN's number and not a missing number.
  assertEquals(reverse(left, GRADED, DECLARED), []);
  assertEquals(new Set([...gone].map((r) => r.metric)), new Set(["visitors"]));
});

Deno.test("unrendered catches a panel cut to its top three rows", () => {
  // Under-rendering that is not a deletion: every row shown is right, at the
  // right position, with the right number. What is wrong is the rows below the
  // cut, and only a walk from the graded side can see them.
  const kept = 3;
  assert(PAGES.length > kept, "the page panel is too short to be cut");
  const gone = new Set(panelCells("none", "28d", "page").filter((r) => r.position > kept));
  const out = unrendered(GRADED, PERFECT.filter((r) => !gone.has(r)));
  assertEquals(out.length, new Set([...gone].map((r) => `${r.screen}|${r.metric}`)).size);
  for (const f of out) {
    for (const b of PAGES) {
      const named = f.detail.includes(`#${b.ord} ${b.dim_value}`);
      assertEquals(named, b.ord > kept && owedRows(f).includes(b), `#${b.ord} ${b.dim_value}: ${f.detail}`);
    }
  }
});

Deno.test("both directions catch a time axis rendered in the wrong order", () => {
  // A bucket's coverage key carries its POSITION for the same reason a panel
  // row's does: an axis rendered backwards shows every bucket it should, with
  // every number the oracle answers, and answers correctly. Rotate the positions
  // by one and the SET of buckets, the SET of numbers and the cardinality are all
  // untouched — which is what makes this a pure ordering defect, and what a key
  // of (grain, bucket_key, metric) alone reports as fully covered.
  const axis28 = PERFECT.filter((r) =>
    r.cursor === at("none") && r.range === "28d" && r.grain === "day" && r.metric === "visitors"
  );
  assertEquals(axis28.length, 28);
  const rolled = axis28.map((r, i) => ({ ...r, bucket_key: axis28[(i + 1) % axis28.length].bucket_key }));
  assertEquals(
    new Set(rolled.map((r) => r.bucket_key)),
    new Set(axis28.map((r) => r.bucket_key)),
    "the rotation dropped or invented a bucket, so this is not an ordering defect alone",
  );

  const moved = new Set(axis28);
  const rendered = PERFECT.filter((r) => !moved.has(r)).concat(rolled);
  const shown = reverse(rendered, GRADED, DECLARED);
  assertEquals(shown.length, 1, shown.map((f) => f.detail).join("\n"));
  assertEquals(shown[0].anti_join, "reverse");
  const missed = unrendered(GRADED, rendered);
  assertEquals(missed.length, 1, missed.map((f) => f.detail).join("\n"));
  // Every bucket is named at the position it was shown at on one side and at the
  // position it belongs at on the other, which is what tells a reader the axis
  // moved rather than that it lost a bar.
  for (const r of rolled) assert(shown[0].detail.includes(`#${r.position} ${r.bucket_key}`), shown[0].detail);
  for (const r of axis28) assert(missed[0].detail.includes(`#${r.position} ${r.bucket_key}`), missed[0].detail);
});

Deno.test("reverse catches a number the app renders that nothing grades", () => {
  // The direction that matters. PLAN.md stage 11 rehearses it by adding an
  // ungraded Breakdown column; this is that column arriving on screen. The panel
  // has no `views_per_visit` row — the six detailed metrics carry `events`
  // instead — so this is a fold writing a column no oracle has an opinion about.
  const rendered = [...RENDERED, {
    screen: PANEL,
    cursor: at("none"),
    range: "28d",
    grain: "",
    bucket_key: "",
    dimension: "browser",
    dim_value: "Chrome",
    position: 1,
    metric: "views_per_visit",
  }];
  const out = reverse(rendered, GRADED, DECLARED);
  assertEquals(out.length, 1, out.map((f) => f.detail).join("\n"));
  assertEquals(out[0].anti_join, "reverse");
  assert(out[0].detail.startsWith(`${PANEL} renders (`), out[0].detail);
  assert(out[0].detail.includes("browser, views_per_visit) and nothing grades #1 Chrome"), out[0].detail);
});

Deno.test("reverse catches a panel ranked by the wrong metric", () => {
  // THE escape this key exists for, reproduced on the panel it was measured on.
  // Ranked by pageviews instead of visitors, the top nine of the page panel are a
  // different SET and a different ORDER — and every number in them is a number
  // this oracle grades, and grades correctly, so nothing but the POSITION each
  // was shown at can tell the two panels apart. A key without `position` reports
  // this whole screen as covered.
  const wrong = panelRows("none", "28d", "page", "pageviews")
    .map((b) => ({ dim_value: b.dim_value, value: b.value_num }))
    .sort((a, b) => b.value - a.value || (a.dim_value < b.dim_value ? -1 : 1))
    .slice(0, GT.panel_rows);
  const right = PAGES.slice(0, GT.panel_rows).map((b) => b.dim_value);
  assert(wrong.length === GT.panel_rows && right.length === GT.panel_rows);
  // The two really do disagree on membership and not only on order, which is what
  // makes this stronger than a sort test: an app can be wrong here while showing
  // a set of rows that is individually beyond reproach.
  assert(wrong.some((w) => !right.includes(w.dim_value)), "the two rankings show the same rows");

  const rendered = [
    ...RENDERED,
    ...wrong.map((w, i) => ({
      screen: DASH,
      cursor: at("none"),
      range: "28d",
      grain: "",
      bucket_key: "",
      dimension: "page",
      dim_value: w.dim_value,
      position: i + 1,
      metric: "visitors",
    })),
  ];
  const out = reverse(rendered, GRADED, DECLARED);
  assertEquals(out.length, 1, out.map((f) => f.detail).join("\n"));
  assertEquals(out[0].anti_join, "reverse");
  // Every row the wrong ranking put somewhere the oracle does not, named at the
  // position it was shown at.
  const moved = wrong
    .map((w, i) => [i + 1, w.dim_value] as const)
    .filter(([pos, v]) => PAGES.find((p) => p.dim_value === v)!.ord !== pos);
  assert(moved.length > 0);
  for (const [pos, v] of moved) assert(out[0].detail.includes(`#${pos} ${v}`), `${pos} ${v}: ${out[0].detail}`);
  // And the rows the two rankings agree on are NOT named: a report that flags a
  // correctly placed row teaches its reader to ignore it.
  for (const b of PAGES) {
    const pos = wrong.findIndex((w) => w.dim_value === b.dim_value) + 1;
    if (pos === b.ord) assert(!out[0].detail.includes(`#${pos} ${b.dim_value}`), out[0].detail);
  }
});

Deno.test("reverse catches a panel showing a tenth row", () => {
  // The cut, on its own. The dashboard keeps `panel_rows` of them and the row
  // below is a real row of the full-panel screen with real numbers, so the only
  // thing wrong with rendering it here is that it is the tenth.
  const tenth = PAGES.find((b) => b.ord === GT.panel_rows + 1)!;
  const out = reverse([...RENDERED, {
    screen: DASH,
    cursor: at("none"),
    range: "28d",
    grain: "",
    bucket_key: "",
    dimension: "page",
    dim_value: tenth.dim_value,
    // shown one row above where it belongs, which is where a tenth row lands on a
    // panel that dropped a row above it rather than one that shows ten
    position: GT.panel_rows,
    metric: "visitors",
  }], GRADED, DECLARED);
  assertEquals(out.length, 1, out.map((f) => f.detail).join("\n"));
  assert(out[0].detail.includes(`#${GT.panel_rows} ${tenth.dim_value}`), out[0].detail);
});

Deno.test("reverse catches a number the SAME shape grades under a different cursor", () => {
  // The failure a column-name key cannot express, and the one a drill-down
  // actually produces: `(source, google, visitors)` IS graded — under the eleven
  // declared shapes — and the app is showing it after two clicks, under a cursor
  // that pins a source, a browser and a goal. A key of dimension and metric
  // alone reports it as covered, and every number behind a drill-down with it.
  const twoSlots = cursorId({
    f_page: "",
    f_entry_page: "",
    f_source: "is:google",
    f_browser: "is:Chrome",
    f_name: "is:signup",
  });
  const google = GT.breakdown.find((b) =>
    b.filter_set === "none" && b.range === "28d" && b.panel === "source" && b.dim_value === "google" &&
    b.metric === "visitors"
  )!;
  assert(GRADED.has(positionKey({
    screen: PANEL,
    cursor: at("none"),
    range: "28d",
    grain: "",
    bucket_key: "",
    dimension: "source",
    dim_value: "google",
    position: google.ord,
    metric: "visitors",
  })));
  assert(!DECLARED.has(twoSlots));
  const rendered = [...RENDERED, {
    screen: DASH,
    cursor: twoSlots,
    range: "28d",
    grain: "",
    bucket_key: "",
    dimension: "source",
    dim_value: "google",
    position: google.ord,
    metric: "visitors",
  }];
  const out = reverse(rendered, GRADED, DECLARED);
  assertEquals(out.length, 1, out.map((f) => f.detail).join("\n"));
  // It lands in the declined region rather than the ungraded one, because the
  // panels under a reached cursor are a decision somebody made and wrote a cost
  // for. The two are different findings and the run must not merge them.
  assertEquals(out[0].anti_join, "declined");
  assert(out[0].detail.includes("the panels under a reached cursor"), out[0].detail);
  assert(out[0].detail.includes("depth two"), out[0].detail);
});

Deno.test("every declined region states its cost", () => {
  // Declining a region and forgetting it are the same green run unless the cost
  // is written down beside the predicate that hides it.
  for (const d of DECLINED_REACH) {
    assert(d.cost.length > 120, `${d.region} is declined in a phrase`);
    assert(/escape|survives|What escapes|costs/.test(d.cost), `${d.region} states no consequence`);
  }
});

Deno.test("reverse reports one finding per ungraded shape, not per cell", () => {
  // The same ungraded column across 28 buckets is one defect. A per-cell report
  // buries the other findings under a wall of the same sentence, which is how a
  // coverage failure gets read as noise and suppressed.
  const rendered = [...RENDERED];
  for (const g of GT.grid.filter((g) => g.range === "28d" && g.grain === "day")) {
    rendered.push({
      screen: DASH,
      cursor: at("none"),
      range: "28d",
      grain: "day",
      bucket_key: g.bucket_key,
      dimension: "",
      dim_value: "",
      position: 0,
      metric: "views_per_visit",
    });
  }
  assertEquals(rendered.length, RENDERED.length + 28);
  assertEquals(reverse(rendered, GRADED, DECLARED).length, 1);
});

Deno.test("axis catches a basis cell declined with no cost stated", () => {
  // Declining a cell and forgetting it are the same green run unless the cost is
  // written down, which is the whole function of the `declined` vocabulary.
  //
  // EVERY row covering the cell must be declined, because one row that still
  // answers it means the cell is answered — which is why the plant reaches for the
  // metric and the grain rather than for one id.
  const seeded = SEEDED.map((q) =>
    q.metric === "visit_duration" && q.grain === "" ? { ...q, departs: "declined" as const, note: "" } : q
  );
  const out = axis(seeded, DRIVEN);
  assert(out.some((f) => f.detail === "basis cell visit_duration@window is declined with no cost stated"),
    out.map((f) => f.detail).join("\n"));
});

Deno.test("axis catches a vocabulary row no driven question reaches", () => {
  const driven = new Set(SEEDED.filter((q) => q.filter_set !== "negated").map((q) => q.id));
  const out = axis(SEEDED, driven);
  assert(out.some((f) => f.detail === "no driven question for filter set negated"));
});

Deno.test("WRONG_READINGS is exactly the set the oracle discriminates", () => {
  // The list is the hard-case anti-join's whole notion of what a plant may
  // discriminate against, and it is written out on this side. Held equal to the
  // oracle's own `wrong` rather than counted in a header comment: a reading added
  // to oracle.sql and not here is a plant nothing requires a question for, and one
  // here that the oracle does not compute is a question requirement nothing can
  // ever satisfy.
  assertEquals([...WRONG_READINGS].sort(), GT.wrong.map((w) => w.reading).sort());
});

Deno.test("hard cases catch a wrong reading no question names", () => {
  // A plant that discriminates against a reading no published question mentions
  // is a plant grading something the specification never claimed.
  //
  // `one_divisor_for_both` is dropped and not `week_starts_sunday`, because the
  // covering-array example's own note names that one: the reading has to vanish
  // from EVERY driven note, and picking one an example already cites would have
  // tested nothing.
  const dropped = "one_divisor_for_both";
  const seeded = SEEDED.map((q) =>
    q.id === "q-hc-readings" ? { ...q, note: WRONG_READINGS.filter((w) => w !== dropped).join(" ") } : q
  );
  const out = hardCases(seeded, DRIVEN);
  assert(out.some((f) => f.detail === `no driven question names the wrong reading ${dropped}`),
    out.map((f) => f.detail).join("\n"));
});

Deno.test("hard cases catch one of the ten going undriven", () => {
  const driven = new Set(SEEDED.filter((q) => q.hard_case !== "H8").map((q) => q.id));
  const out = hardCases(SEEDED, driven);
  assert(out.some((f) => f.detail === "no driven question names H8"));
});
