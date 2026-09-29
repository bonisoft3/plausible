// The 312 published questions, each one driven through the app's own forms and
// read off the rendered text — and then the three anti-joins that grade the
// roster rather than the numbers, run against what this file actually drove.
//
// The roster comes off the app's own `question` rows, never off a list in this
// file: a second copy of the question set would answer with the old vocabulary
// and stay green. What this file adds is the DRIVE — the gestures that put the
// screen on a row's coordinates, and the read of the number the screen then
// shows. `driven` is written only by `drives()`, called after a comparison has
// happened, so `forward` below sees a drive and never an intention.
//
// Three of the six anti-joins live here because these three are the ones that
// need a driven set at all. `reverse`, `unrendered` and `slots` walk the graded
// space and belong to the sweep.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { type El, type Mounted, mountApp } from "../../../plugins/omnishell/test/screen-harness.ts";
import { APP, type Breakdown, type Bucket, byKey, groundTruth, type Topline } from "./ground-truth.ts";
import { attr, empties, panelOf, pickGrain, pickRange, qa, textOf, txt, vocabulary } from "./drive.ts";
import { axis, forward, hardCases } from "./coverage.ts";
import { shape } from "./question-examples.ts";
import type { Question } from "./question-examples.ts";

/** The ids this run actually drove. */
const driven = new Set<string>();
const drives = (...ids: string[]) => {
  for (const id of ids) driven.add(id);
};

/** The app's own `Question` rows, as the anti-joins read them. */
const roster = (m: Mounted): Question[] =>
  m.rows("question").map((r) => ({
    id: txt(r.id),
    metric: txt(r.metric),
    panel: txt(r.panel),
    dimension: txt(r.dimension),
    range: txt(r.range),
    grain: txt(r.grain),
    filter_set: txt(r.filter_set),
    says: txt(r.says),
    reads: txt(r.reads),
    departs: txt(r.departs) as Question["departs"],
    expects: txt(r.expects) as Question["expects"],
    hard_case: txt(r.hard_case),
    note: txt(r.note),
  }));

/** The unit separator, for the same reason `coverage.ts` uses it: a dimension
 * value may hold any printable character and a `|` key would collide with one.
 * Spelled as an escape and never as the byte itself, which is invisible in a
 * listing and reads as no separator at all. */
const SEP = "\u001f";
const k = (...parts: (string | number)[]) => parts.join(SEP);

const group = <T>(rows: readonly T[], key: (r: T) => string, ord: (r: T) => number): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const r of rows) (out.get(key(r)) ?? out.set(key(r), []).get(key(r))!).push(r);
  for (const list of out.values()) list.sort((a, b) => ord(a) - ord(b));
  return out;
};

/** What the ground truth answers at a question's position, as the two facts the
 * `expects` declaration is about: the values, and the divisors under them. */
type Answer = { values: number[]; dens: (number | null)[] };

/** The non-degeneracy declaration, checked against the ground truth BEFORE the
 * app's own number is looked at. Zero equals zero passes while the filter is
 * entirely broken, so a row declared `nonzero` whose ground truth is zero is a
 * fixture failure and not a pass — and the three ways a position is allowed to
 * answer zero are different claims that must not be spelled the same way.
 *
 * `windowLives` is whether the same cursor and range has visits at all: it is
 * what separates "the filter selected nothing" from "the filter selected hits
 * that are not page views", which both render `0`. */
const degenerate = (q: Question, a: Answer, windowLives: boolean): string | null => {
  const rows = a.values.length;
  const allZero = a.values.every((v) => v === 0);
  switch (q.expects) {
    case "nonzero":
      return rows > 0 && a.values.some((v) => v !== 0) ? null : `declares nonzero and the oracle answers ${rows === 0 ? "no row at all" : "zero everywhere"}`;
    case "zero-by-ifNotFinite":
      if (rows === 0) return "declares zero-by-ifNotFinite and the oracle answers no row at all";
      if (!allZero) return "declares zero-by-ifNotFinite and the oracle answers a number";
      return a.dens.every((d) => d === 0) ? null : "declares zero-by-ifNotFinite and the divisor is not zero";
    case "zero-by-empty-window":
      return rows === 0 ? null : "declares zero-by-empty-window and the oracle answers rows";
    case "zero-by-filter":
      if (rows === 0 || !allZero) return "declares zero-by-filter and the oracle does not answer zero";
      return windowLives ? null : "declares zero-by-filter and the window holds no visit either";
    case "unanswered":
      return rows === 0 ? null : "declares unanswered and the oracle answers rows";
  }
};

/** One disagreement, named by the question that found it. */
type Bad = { id: string; detail: string };

Deno.test("every published question, driven through the app's own forms", async () => {
  const gt = await groundTruth();
  const base = await empties();
  const v = await vocabulary(base);
  const t0 = performance.now();

  const spec = await mountApp({ appDir: APP, screen: "spec", params: {}, tables: base, seed: 1 });
  await spec.settle();
  const seeded = roster(spec);
  await spec.stop();

  // The closed vocabularies, over the app's own rows and not only over the eight
  // worked examples. The examples are what makes the other 304 mechanical, and
  // until the 304 are held to the same shape that is a claim about them rather
  // than a check on them — an empty note under a departure, or a decline that
  // declares a number, is invisible everywhere else in the ladder.
  assertEquals(seeded.flatMap((q) => shape(q).map((why) => `${q.id}: ${why}`)), []);

  const topline = byKey(gt.topline, (t: Topline) => k(t.filter_set, t.range, t.metric));
  const series = group(gt.bucket, (b: Bucket) => k(b.filter_set, b.range, b.grain, b.metric), (b) => b.ord);
  const column = group(gt.breakdown, (b: Breakdown) => k(b.filter_set, b.range, b.panel, b.metric), (b) => b.ord);
  /** Whether a cursor and range hold any visit at all. `zero-by-filter` is the
   * only declaration that turns on it. */
  const lives = (fs: string, range: string) => (topline.get(k(fs, range, "visits"))?.value_num ?? 0) > 0;

  const bad: Bad[] = [];
  let numbers = 0;
  const wrong = (q: Question, detail: string) => bad.push({ id: q.id, detail });
  /** Grade one question's declaration, then its numbers. The declaration comes
   * first: a value comparison that passes on a position the oracle answers zero
   * everywhere has graded nothing. */
  const grade = (q: Question, a: Answer, cells: { got: string; want: string; at: string }[]) => {
    const degen = degenerate(q, a, lives(q.filter_set, q.range));
    if (degen !== null) {
      wrong(q, degen);
      return;
    }
    const off = cells.filter((c) => c.got !== c.want);
    for (const c of off) wrong(q, `${c.at}: the app renders ${c.got}, the oracle answers ${c.want}`);
    // A question whose number disagreed was not DRIVEN, it was failed, and
    // `driven` is the only input the three anti-joins below have. Counting a
    // failure as a drive is why that matters: silence the value assertion while
    // triaging — the first thing anyone silences — and `forward`, `axis` and
    // `hardCases` all report green over a roster nothing correctly answered.
    if (off.length > 0) return;
    numbers += cells.length;
    drives(q.id);
  };

  // --- the four kinds of read ----------------------------------------------
  // Each reads the number off the element that carries the metric it answers.
  // Reading the row instead would grade the arithmetic and leave the binding and
  // the rounding — which is where a metric's own rounding rule lives — ungraded.

  const readTopline = (m: Mounted, q: Question) => {
    const cells = m.all(`.topline [data-metric="${q.metric}"]`);
    if (cells.length !== 1) return wrong(q, `the top line shows ${cells.length} ${q.metric} cells`);
    const t = topline.get(k(q.filter_set, q.range, q.metric));
    grade(q, { values: t ? [t.value_num] : [], dens: t ? [t.value_den] : [] }, t === undefined ? [] : [{ at: "top line", got: textOf(cells[0]), want: t.value_text }]);
  };

  /** H10's figure. The column vocabulary cannot name it — it is not one of the
   * seven metrics and it answers a five-minute window rather than the range — so
   * the hard case is what names it, and its three rows are exactly the claim that
   * it ignores every filter. */
  const readCurrentVisitors = (m: Mounted, q: Question) => {
    const cells = m.all(".topline [data-live-visitors]");
    if (cells.length !== 1) return wrong(q, `the top line shows ${cells.length} current-visitor cells`);
    grade(q, { values: [gt.current_visitors], dens: [null] }, [
      { at: "current visitors", got: textOf(cells[0]), want: String(gt.current_visitors) },
    ]);
  };

  const readBuckets = (m: Mounted, q: Question) => {
    const want = series.get(k(q.filter_set, q.range, q.grain, q.metric)) ?? [];
    const rows = m.all(".buckets .bucket");
    // Cardinality before value, and on the KEYS: a bucket fold that quietly stops
    // emitting a bucket, or emits one for a key the grid does not have, is a
    // missing bucket and must fail as one rather than as a value mismatch on some
    // later row.
    const got = rows.map((r) => attr(r, "data-bucket"));
    if (got.join(",") !== want.map((b) => b.bucket_key).join(",")) {
      return wrong(q, `the axis shows ${got.length} buckets [${got.slice(0, 4)}…] and the oracle cuts ${want.length} [${want.map((b) => b.bucket_key).slice(0, 4)}…]`);
    }
    const cells = rows.map((r, i) => {
      const [n] = qa(r, `[data-metric="${q.metric}"]`);
      return { at: `bucket #${want[i].ord} ${want[i].bucket_key}`, got: n === undefined ? "(absent)" : textOf(n), want: String(want[i].value_num) };
    });
    grade(q, { values: want.map((b) => b.value_num), dens: want.map(() => null) }, cells);
  };

  /** A panel, wherever it is on screen. `rows` is the panel's rendered rows in
   * the order it stacked them, each paired with the dimension value it names. */
  const readColumn = (q: Question, rows: { dim: string; cell: El | undefined }[], want: Breakdown[], where: string) => {
    const got = rows.map((r) => r.dim);
    if (got.join(SEP) !== want.map((b) => b.dim_value).join(SEP)) {
      return wrong(q, `${where} shows ${got.length} rows [${got.slice(0, 4)}…] and the oracle ranks ${want.length} [${want.map((b) => b.dim_value).slice(0, 4)}…]`);
    }
    const pick = q.dimension === "" ? want.map((_, i) => i) : want.flatMap((b, i) => b.dim_value === q.dimension ? [i] : []);
    if (q.dimension !== "" && pick.length !== 1) return wrong(q, `${where} does not rank ${q.dimension}`);
    const cells = pick.map((i) => ({
      at: `${where} #${want[i].ord} ${want[i].dim_value}`,
      got: rows[i].cell === undefined ? "(absent)" : textOf(rows[i].cell),
      want: want[i].value_text,
    }));
    grade(q, { values: pick.map((i) => want[i].value_num), dens: pick.map((i) => want[i].value_den) }, cells);
  };

  /** The dashboard's own copy of a panel, cut to the vendor's leading rows and
   * carrying one metric. It is the screen a question with a granularity has to be
   * read on, because the full-panel screen offers no granularity to state. */
  const readDashPanel = (m: Mounted, q: Question) => {
    const [section] = m.all(".panels .panel").filter((s) => {
      const [list] = qa(s, "ul.rows");
      return list !== undefined && panelOf(list) === q.panel;
    });
    if (section === undefined) return wrong(q, `the dashboard shows no ${q.panel} panel`);
    const rows = qa(section, "li.row").map((li) => ({ dim: attr(li, "data-dim"), cell: qa(li, `[data-metric="${q.metric}"]`)[0] }));
    const want = (column.get(k(q.filter_set, q.range, q.panel, q.metric)) ?? []).filter((b) => b.ord <= gt.panel_rows);
    readColumn(q, rows, want, `the dashboard's ${q.panel} panel`);
  };

  const readPanelScreen = (m: Mounted, q: Question) => {
    const rows = m.all(".rows tbody tr").map((tr) => ({
      dim: textOf(qa(tr, "th button")[0]),
      cell: qa(tr, `[data-metric="${q.metric}"]`)[0],
    }));
    readColumn(q, rows, column.get(k(q.filter_set, q.range, q.panel, q.metric)) ?? [], `the ${q.panel} panel`);
  };

  // --- what a declined row's drive asserts ----------------------------------
  // A declined row is driven like any other, and its drive asserts the ABSENCE
  // it claims. Declining and forgetting are otherwise the same green run.

  /** The cursor slots the dashboard is offering, off its own chip probes. */
  const renderedSlots = (m: Mounted) =>
    new Set(m.all(".chip-probe").map((c) => attr(c, "data-filter").replace(/^slot=eq\./, "")));

  const noDimension = (m: Mounted, q: Question, names: string[]) => {
    const slots = renderedSlots(m);
    for (const n of names) {
      if (v.panels.includes(n)) return wrong(q, `declined, and a ${n} panel exists`);
      if (slots.has(`f_${n}`)) return wrong(q, `declined, and the cursor carries an f_${n} slot`);
    }
    drives(q.id);
  };

  const declined: Record<string, (m: Mounted, q: Question) => void> = {
    "q-dc-locations": (m, q) => noDimension(m, q, ["country", "region", "city", "location"]),
    "q-dc-operating-system": (m, q) => noDimension(m, q, ["os", "operating_system"]),
    "q-dc-screen-size": (m, q) => noDimension(m, q, ["device", "screen", "screen_size"]),
    "q-dc-exit-pages": (m, q) => noDimension(m, q, ["exit_page"]),
    "q-dc-minute-grain": (m, q) => {
      if (v.pairs.some(([, g]) => g === "minute")) return wrong(q, "declined, and a minute Grain row exists");
      const offered = m.all(".grains form button").map(textOf);
      if (offered.includes("minute")) return wrong(q, "declined, and the granularity picker offers minute");
      drives(q.id);
    },
    "q-dc-two-conditions": (m, q) => {
      // The absence is structural: a slot is one input on one form, so a second
      // clause on one dimension has nowhere to be written. A form that grew a
      // second input for a slot is where that stops being true.
      for (const form of m.all("form.drill")) {
        const names = qa(form, "input").map((i) => attr(i, "name")).filter((n) => n.startsWith("f_"));
        const twice = names.filter((n, i) => names.indexOf(n) !== i);
        if (twice.length > 0) return wrong(q, `a drill-down form states ${twice[0]} twice`);
      }
      drives(q.id);
    },
  };

  /** A metric the graph declines to bucket: no bucket carries a cell for it, and
   * the oracle answers no bucket row for it either. Both halves, because a screen
   * that stopped showing a number the oracle still answers is `unrendered`'s
   * finding and not this one. */
  const noSeries = (m: Mounted, q: Question) => {
    const shown = m.all(".buckets .bucket").flatMap((r) => qa(r, `[data-metric="${q.metric}"]`));
    if (shown.length > 0) return wrong(q, `declined, and the axis shows ${shown.length} ${q.metric} cells`);
    const want = series.get(k(q.filter_set, q.range, q.grain, q.metric)) ?? [];
    grade(q, { values: want.map((b) => b.value_num), dens: [] }, []);
  };

  // --- the plan -------------------------------------------------------------
  // Grouped by the mount each question needs, so the run costs one mount per
  // (screen, cursor) rather than one per question. Which screen a row is read on
  // is fixed by the row: a granularity can only be stated on the dashboard, and
  // `events` and every ord above the vendor's cut are only shown on the full
  // panel.
  const onPanelScreen = (q: Question) => q.departs !== "declined" && q.panel !== "" && q.grain === "";
  const dashPlan = new Map<string, Question[]>();
  const panelPlan = new Map<string, Question[]>();
  for (const q of seeded) {
    const into = onPanelScreen(q) ? panelPlan : dashPlan;
    const key = onPanelScreen(q) ? k(q.filter_set, q.panel) : q.filter_set;
    (into.get(key) ?? into.set(key, []).get(key)!).push(q);
  }
  // Within a mount, the questions are walked in cursor order so a (range,
  // granularity) is stated once and answered many times.
  const inOrder = (qs: Question[]) => qs.slice().sort((a, b) => k(a.range, a.grain).localeCompare(k(b.range, b.grain)));

  let mounts = 0;
  for (const [preset, qs] of dashPlan) {
    const m = await mountApp({ appDir: APP, screen: "dash", params: { preset }, tables: base, seed: 1 });
    await m.settle();
    mounts += 1;
    let at = "";
    for (const q of inOrder(qs)) {
      const here = k(q.range, q.grain);
      if (here !== at) {
        await pickRange(m, q.range, v.ranges);
        const opens = txt(v.ranges.find((r) => txt(r.id) === q.range)?.opens_on);
        if (q.grain !== "" && q.grain !== opens) await pickGrain(m, q.grain);
        at = here;
      }
      if (q.departs === "declined") {
        if (q.grain !== "") noSeries(m, q);
        else if (q.id in declined) declined[q.id](m, q);
        // A declined row with no absence named here is a decline nobody wrote a
        // drive for, which is the failure this whole lane exists to refuse.
        else wrong(q, "declined with no absence to assert");
      } else if (q.hard_case === "H10") readCurrentVisitors(m, q);
      else if (q.panel !== "") readDashPanel(m, q);
      else if (q.grain !== "") readBuckets(m, q);
      else readTopline(m, q);
    }
    await m.stop();
  }

  for (const [, qs] of panelPlan) {
    const { filter_set: preset, panel } = qs[0];
    const m = await mountApp({ appDir: APP, screen: "panel", params: { preset, panel }, tables: base, seed: 1 });
    await m.settle();
    mounts += 1;
    let at = "";
    for (const q of inOrder(qs)) {
      if (q.range !== at) {
        await pickRange(m, q.range, v.ranges);
        at = q.range;
      }
      readPanelScreen(m, q);
    }
    await m.stop();
  }

  assertEquals(bad.slice(0, 10).map((b) => `${b.id}: ${b.detail}`), [], `${bad.length} of ${seeded.length} questions disagree`);
  assertEquals(driven.size, seeded.length, "a seeded question no case drove");

  console.log("");
  console.log(`published questions:  ${seeded.length}`);
  console.log(`driven:               ${driven.size}`);
  console.log(`numbers read off the DOM: ${numbers}`);
  console.log(`mounts:               ${mounts}`);
  console.log(`the drive:            ${((performance.now() - t0) / 1000).toFixed(1)}s`);

  // --- the three anti-joins that need a driven set -------------------------
  assertEquals(forward(seeded, driven), [], "a published question nothing drove, or a drive nothing publishes");
  assertEquals(axis(seeded, driven), [], "a vocabulary row or basis cell no driven question reaches");
  assertEquals(hardCases(seeded, driven), [], "one of the ten, or a named wrong reading, that no driven question names");
});

Deno.test("the strict chain holds per range and in three buckets of every granularity", async () => {
  // At 1 200 hits over 35 local days many buckets would otherwise have
  // `visitors == visits`, and a fold that counts visits where it should count
  // distinct visitors is invisible in exactly those buckets. The fixture plants
  // the inequality; this asserts it landed, on the rendered numbers rather than
  // on the rows.
  const base = await empties();
  const v = await vocabulary(base);
  const m = await mountApp({ appDir: APP, screen: "dash", params: { preset: "none" }, tables: base, seed: 1 });
  await m.settle();
  /** A figure off the DOM. An element that rendered nothing reads as 0 through
   * `Number`, and 0 satisfies `visitors < visits`, so the chain this case exists
   * to pin would hold on a top line that lost its first figure entirely. */
  const n = (el: El | undefined) => {
    const text = textOf(el);
    if (text === "") throw new Error("the chain read an element that rendered nothing");
    return Number(text);
  };
  const strict = (row: Record<string, number>) => row.visitors < row.visits && row.visits < row.pageviews;

  for (const r of v.ranges) {
    await pickRange(m, txt(r.id), v.ranges);
    const top = Object.fromEntries(
      ["visitors", "visits", "pageviews"].map((metric) => [metric, n(m.all(`.topline [data-metric="${metric}"]`)[0])]),
    );
    assert(strict(top), `${txt(r.id)}: the top line reads ${JSON.stringify(top)}`);
  }
  for (const grain of new Set(v.pairs.map(([, g]) => g))) {
    const [range] = v.pairs.find(([, g]) => g === grain)!;
    await pickRange(m, range, v.ranges);
    const opens = txt(v.ranges.find((x) => txt(x.id) === range)?.opens_on);
    if (grain !== opens) await pickGrain(m, grain);
    const strictBuckets = m.all(".buckets .bucket").filter((b) =>
      strict(Object.fromEntries(
        ["visitors", "visits", "pageviews"].map((metric) => [metric, n(qa(b, `[data-metric="${metric}"]`)[0])]),
      ))
    );
    assert(strictBuckets.length >= 3, `${range}/${grain}: ${strictBuckets.length} buckets read visitors < visits < pageviews`);
  }
  await m.stop();
});

Deno.test("the specification shows the sentence, the formula and the reading in three cells", async () => {
  // The one rung of this apparatus that grades the READING rather than the
  // arithmetic, and it only works if the three never merge: rewording the reading
  // leaves the sentence alone, so a departure stays on screen.
  const base = await empties();
  const m = await mountApp({ appDir: APP, screen: "spec", params: {}, tables: base, seed: 1 });
  await m.settle();

  const metrics = m.rows("metric");
  const rows = m.all("table.metrics tbody tr");
  assertEquals(rows.length > 0, true, "the metrics roster is empty, so the cells below assert nothing");
  assertEquals(rows.length, metrics.length, "the metrics table shows a row per Metric");
  for (const tr of rows) {
    const id = textOf(qa(tr, "th")[0]);
    const row = metrics.find((r) => txt(r.id) === id);
    assert(row !== undefined, `the metrics table shows ${id} and there is no such Metric row`);
    const [says, formula, reads] = qa(tr, "td").map(textOf);
    assertEquals(says, txt(row.says), `${id}: the published sentence`);
    // Verbatim, because a tidied expression is no longer a quote and the quote is
    // the whole of what a reviewer diffs the reading against.
    assertEquals(formula, txt(row.formula), `${id}: the published formula`);
    assertEquals(reads, txt(row.reads), `${id}: this app's reading`);
    assert(says !== reads, `${id}: the reading repeats the sentence and grades nothing`);
  }

  const grains = m.rows("grain");
  assertEquals(m.all("table.ranges tbody tr").length, m.rows("range").length, "a row per Range");
  assertEquals(m.all("table.ranges ul.pairs li.pair").length, grains.length, "a granularity chip per legal pair");

  const questions = m.rows("question");
  const qrows = m.all("table.questions tbody tr.q");
  assertEquals(qrows.length, questions.length, "the question table shows every published question");
  for (const tr of qrows) {
    const id = textOf(qa(tr, "th")[0]);
    const q = questions.find((r) => txt(r.id) === id);
    assert(q !== undefined, `the question table shows ${id} and there is no such Question row`);
    const [says, reads, mark] = qa(tr, "td").map(textOf);
    assertEquals(says, txt(q.says), `${id}: the published sentence`);
    assertEquals(reads, txt(q.reads), `${id}: this app's reading`);
    // Reflected as an attribute and styled, so the value is on the row rather
    // than in a template per value.
    assertEquals(attr(tr, "data-departs"), txt(q.departs), `${id}: departs`);
    // A departure with its cost off screen is a departure nobody can weigh.
    if (txt(q.departs) !== "no") assert(mark.includes(txt(q.note)), `${id}: the departure's cost is not shown`);
  }
  await m.stop();
});
