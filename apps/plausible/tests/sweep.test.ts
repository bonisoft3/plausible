// The sweep: the app's own rendered numbers, driven through the app's own forms
// and read off the rendered DOM, joined against the ground truth through the
// coverage keys.
//
// Everything here is generated from the app's own vocabulary rows — `range`,
// `grain`, `panel`, `filter_set` come out of the mounted store — because a
// literal list in a test is a second copy of the vocabulary and it drifts.
//
// A cursor position is reached by a GESTURE and never by writing `Filter` from
// the test: the whole point of the cursor contract is that the reachable space
// is what the forms can reach, and a test that writes the row directly grades a
// cursor no reader has.
import { assertEquals } from "jsr:@std/assert@1";
import { type El, type Mounted, mountApp, type Row } from "../../../plugins/omnishell/test/screen-harness.ts";
import { APP, groundTruth } from "./ground-truth.ts";
import {
  attr,
  cursorOf,
  empties,
  markedGrain,
  markedRange,
  panelOf,
  pickGrain,
  pickRange,
  qa,
  seatWindow,
  submit,
  txt,
  vocabulary,
} from "./drive.ts";
import {
  breakdownScreens,
  cursorId,
  DASH,
  gradedSpace,
  PANEL,
  position,
  positionKey,
  type Rendered,
  reverse,
  SLOTS,
  slots,
  unrendered,
} from "./coverage.ts";

/** A number the sweep saw, read off the rendered text of the element that
 * carries the metric it answers. Never off the row: reading the row would grade
 * the arithmetic and leave the binding and the rounding ungraded. */
const numbersIn = (
  el: El,
  base: Omit<Rendered, "metric">,
): { r: Rendered; text: string }[] =>
  qa(el, "[data-metric]").map((n) => ({
    r: { ...base, metric: attr(n, "data-metric") },
    text: (n.textContent ?? "").trim(),
  }));

type Seen = { r: Rendered; text: string };

/** A number read off the DOM, or `null` where the element rendered nothing.
 * `Number("")` is 0, so converting the text directly makes an element that
 * failed to render at all satisfy every ground truth of zero — and zero is what
 * the closure answers wherever a filter selects nothing, so the silence would
 * read as the right answer. Only the numeric comparison needs this: the
 * declared half compares the rendered TEXT, where "" is already unequal to "0". */
const numberOf = (text: string): number | null => (text.trim() === "" ? null : Number(text));

/** Of the positions a value check could not compare — the ground truth holds no
 * value at their key — the ones the coverage check does not own either.
 *
 * Skipping an ungraded position is right only because `reverse` reports it, and
 * that holds because `truth` and `graded` are folded from the same ground-truth
 * tables through the same `positionKey`: a key missing from one is missing from
 * the other. This is what makes that a fact rather than a reading of two
 * constructions — drop one row from `truth` alone and the number it grades is
 * compared against nothing, named by nobody, and every anti-join stays green. */
const skippedButGraded = (ungraded: readonly Rendered[], graded: ReadonlySet<string>): string[] =>
  ungraded
    .filter((r) => graded.has(positionKey(r)))
    .map((r) =>
      `${r.screen} (${r.cursor}, ${r.range}, ${r.dimension || r.grain || "top line"}, ` +
      `#${r.position}${r.dim_value || r.bucket_key ? " " + (r.dim_value || r.bucket_key) : ""}, ${r.metric})`
    );

/** Each reader names the screen it reads rather than taking it as an argument:
 * the screen is half the position key now, and a caller that passed the other
 * one would hand a whole screen's numbers to the wrong obligation. */

/** Every top-line figure the dashboard is showing. */
const readTopline = (m: Mounted, cursor: string, range: string): Seen[] =>
  m.all(".topline [data-metric]").map((n) => ({
    r: {
      screen: DASH,
      cursor,
      range,
      grain: "",
      bucket_key: "",
      dimension: "",
      dim_value: "",
      position: 0,
      metric: attr(n, "data-metric"),
    },
    text: (n.textContent ?? "").trim(),
  }));

/** Every graph bucket, in the order the axis stacked them. `position` is the
 * bucket's place in that order and not a column read back — a time axis rendered
 * backwards renders every bucket it should, so only the position can see it. */
const readBuckets = (m: Mounted, cursor: string, range: string, grain: string): Seen[] => {
  const out: Seen[] = [];
  const rows = m.all(".buckets .bucket");
  for (let i = 0; i < rows.length; i += 1) {
    out.push(...numbersIn(rows[i], {
      screen: DASH,
      cursor,
      range,
      grain,
      bucket_key: attr(rows[i], "data-bucket"),
      dimension: "",
      dim_value: "",
      position: i,
    }));
  }
  return out;
};

/** Every number the dashboard's own four panels are showing, each row at the
 * rank it was stacked at. The dashboard keeps the vendor's leading rows where
 * the full-panel screen shows them all, so these are the same questions asked of
 * a different screen, and it is the screen in the key that keeps the one from
 * answering for the other. */
const readDashPanels = (m: Mounted, cursor: string, range: string): Seen[] => {
  const out: Seen[] = [];
  for (const section of m.all(".panels .panel")) {
    const [list] = qa(section, "ul.rows");
    if (list === undefined) throw new Error("a dashboard panel that rendered no rows list");
    const panel = panelOf(list);
    const rows = qa(section, "li.row");
    for (let i = 0; i < rows.length; i += 1) {
      out.push(...numbersIn(rows[i], {
        screen: DASH,
        cursor,
        range,
        grain: "",
        bucket_key: "",
        dimension: panel,
        dim_value: attr(rows[i], "data-dim"),
        position: i + 1,
      }));
    }
  }
  return out;
};

/** Every row of one panel, in the order it was stacked. `position` counts from
 * one because that is the ordinal the ground truth assigns a panel row. */
const readPanel = (m: Mounted, cursor: string, range: string, panel: string): Seen[] => {
  const out: Seen[] = [];
  const rows = m.all(".rows tbody tr");
  for (let i = 0; i < rows.length; i += 1) {
    const [head] = qa(rows[i], "th button");
    out.push(...numbersIn(rows[i], {
      screen: PANEL,
      cursor,
      range,
      grain: "",
      bucket_key: "",
      dimension: panel,
      dim_value: (head?.textContent ?? "").trim(),
      position: i + 1,
    }));
  }
  return out;
};

/** A ground-truth row keyed the way the sweep keys a rendered number, through
 * `positionKey` and never by spelling the separator here. The two spellings are
 * the whole value check: a key built by hand that misses is not a disagreement,
 * it is a silence that reads as agreement. */
const gtKey = (r: Partial<Rendered> & { screen: string; metric: string }): string =>
  positionKey({
    cursor: "",
    range: "",
    grain: "",
    bucket_key: "",
    dimension: "",
    dim_value: "",
    position: 0,
    ...r,
  });

Deno.test("the app's own numbers, against the ground truth, through the coverage keys", async () => {
  const gt = await groundTruth();
  const base = await empties();
  const seen: Seen[] = [];
  const t0 = performance.now();

  const { presets, ranges, pairs, panels } = await vocabulary(base);

  // --- the dashboard, at every legal (range, granularity) pair ------------
  let mounts = 0;
  for (const preset of presets) {
    const m = await mountApp({ appDir: APP, screen: DASH, params: { preset }, tables: base, seed: 1 });
    await m.settle();
    mounts += 1;
    for (const [range, grain] of pairs) {
      await pickRange(m, range, ranges);
      const opens = txt(ranges.find((r) => txt(r.id) === range)?.opens_on);
      if (opens !== grain) await pickGrain(m, grain);
      const cursor = cursorOf(m, preset);
      // The pickers are the app's only statement of which window is in force,
      // and the mark is a fold-written column: a rollup that stops stamping it,
      // or stamps the row it happened to read rather than the row the cursor
      // names, leaves five identically rendered segments and a reader with no
      // way at all to tell where they are standing. Asserted at every position
      // of the sweep, because the mark travels with the cursor.
      assertEquals(
        [markedRange(m), markedGrain(m)],
        [txt(ranges.find((r) => txt(r.id) === range)?.label), grain],
        `${preset}: the marked segments and the cursor disagree`,
      );
      // The seat states the same window the pickers do, in the same words. The
      // cursor's own columns are ids — `28d`, `custom_dst_day` — so a seat bound
      // to the row its region is pinned on prints a storage key on the landing
      // screen, directly under a control spelling that value in English.
      assertEquals(
        seatWindow(m),
        [markedRange(m), markedGrain(m)],
        `${preset}: the seat and the pickers name different windows`,
      );
      seen.push(...readTopline(m, cursor, range));
      seen.push(...readBuckets(m, cursor, range, grain));
    }
    // The panels answer the window and not the granularity, so they are read once
    // per range rather than once per pair.
    for (const r of ranges) {
      await pickRange(m, txt(r.id), ranges);
      seen.push(...readDashPanels(m, cursorOf(m, preset), txt(r.id)));
    }
    await m.stop();
  }

  // --- every panel, uncut, at every range ---------------------------------
  // The ground truth answers every ord, and this screen is where they are all on
  // screen, with all six metrics on each.
  for (const preset of presets) {
    for (const panel of panels) {
      const m = await mountApp({ appDir: APP, screen: PANEL, params: { preset, panel }, tables: base, seed: 1 });
      await m.settle();
      mounts += 1;
      for (const r of ranges) {
        await pickRange(m, txt(r.id), ranges);
        // This screen carries the same picker and writes the same cursor, so it
        // owes the same mark; it has no granularity picker to ask about.
        assertEquals(markedRange(m), txt(r.label), `${panel}: the marked range and the cursor disagree`);
        assertEquals(seatWindow(m)[0], markedRange(m), `${panel}: the seat and the picker name different windows`);
        seen.push(...readPanel(m, cursorOf(m, preset), txt(r.id), panel));
      }
      await m.stop();
    }
  }
  const declaredMs = performance.now() - t0;

  // --- the value check, before any coverage claim -------------------------
  // A number that disagrees is reported as a disagreement; the anti-joins below
  // are about which questions were asked, and a right question with a wrong
  // answer must not read as a covered position.
  const truth = new Map<string, string>();
  const declaredCursor = new Map(
    gt.reach.filter((r) => r.origin_kind === "declared").map((r) => [r.origin, r.cursor]),
  );
  const at = (id: string) => {
    const c = declaredCursor.get(id);
    if (c === undefined) throw new Error(`filter set ${id} is graded and is not in the closure`);
    return c;
  };
  for (const t of gt.topline) {
    truth.set(gtKey({ screen: DASH, cursor: at(t.filter_set), range: t.range, metric: t.metric }), t.value_text);
  }
  for (const b of gt.bucket) {
    truth.set(
      gtKey({
        screen: DASH,
        cursor: at(b.filter_set),
        range: b.range,
        grain: b.grain,
        bucket_key: b.bucket_key,
        position: b.ord,
        metric: b.metric,
      }),
      String(b.value_num),
    );
  }
  // A breakdown row the dashboard also shows is graded on both screens, at the
  // same value. `breakdownScreens` says which those are, and the graded space
  // below is built from the same call, so the value check and the coverage check
  // cannot come to disagree about what the dashboard owes.
  for (const b of gt.breakdown) {
    for (const screen of breakdownScreens(b, gt.panel_rows)) {
      truth.set(
        gtKey({
          screen,
          cursor: at(b.filter_set),
          range: b.range,
          dimension: b.panel,
          dim_value: b.dim_value,
          position: b.ord,
          metric: b.metric,
        }),
        b.value_text,
      );
    }
  }
  const wrong: string[] = [];
  const ungraded: Rendered[] = [];
  for (const s of seen) {
    const want = truth.get(positionKey(s.r));
    if (want === undefined) {
      ungraded.push(s.r); // the anti-joins own an ungraded position; asserted below
      continue;
    }
    if (want !== s.text) {
      wrong.push(
        `${s.r.screen} (${s.r.cursor}, ${s.r.range}, ${s.r.dimension || s.r.grain || "top line"}, ` +
          `#${s.r.position}${s.r.dim_value || s.r.bucket_key ? " " + (s.r.dim_value || s.r.bucket_key) : ""}, ` +
          `${s.r.metric}): the app renders ${s.text}, the oracle answers ${want}`,
      );
    }
  }
  assertEquals(wrong.slice(0, 12), [], `${wrong.length} rendered numbers disagree with the ground truth`);

  // --- the anti-joins, over the declared half of the graded space ---------
  const declaredKeys = new Set(declaredCursor.values());
  const graded = gradedSpace({
    reach: gt.reach,
    topline: gt.topline,
    bucket: gt.bucket,
    breakdown: gt.breakdown,
    // The reach closure's top line is stage 11's other half and is swept by the
    // case below; holding it out here keeps this case's red about the declared
    // vocabulary rather than about the closure's size.
    reach_topline: [],
    panel_rows: gt.panel_rows,
  });
  const rendered = seen.map((s) => s.r);
  assertEquals(
    skippedButGraded(ungraded, graded).slice(0, 6),
    [],
    "a graded position the value check compared against nothing",
  );
  assertEquals(reverse(rendered, graded, declaredKeys), [], "a number the app renders that nothing grades");
  assertEquals(unrendered(graded, rendered), [], "a number the oracle answers that no screen showed");
  assertEquals(slots(graded), [], "a cursor slot no graded number depends on");

  console.log("");
  console.log(`mounts:                   ${mounts}`);
  console.log(`numbers read off the DOM: ${seen.length}`);
  console.log(`graded positions covered: ${graded.size}`);
  console.log(`the declared closure:     ${(declaredMs / 1000).toFixed(1)}s`);
});

Deno.test("every cursor one gesture from a declared shape, at every range", async () => {
  const gt = await groundTruth();
  const base = await empties();
  const seen: Seen[] = [];
  const t0 = performance.now();

  const { presets, ranges } = await vocabulary(base);

  /** Put the screen back on this preset's declared shape, at one range. The
   * reset is the screen's own form, so the cursor comes back the way a reader
   * brings it back. */
  const resetTo = async (m: Mounted, range: string) => {
    await submit(m, m.one(".reset"));
    await pickRange(m, range, ranges);
  };

  /** The cursor a rendered gesture would state, taken from the app's own row.
   * A hidden input's `data-value` is resolved at SUBMIT and never bound into the
   * DOM, so there is nothing on the element to read; the row behind the element
   * is the app's own answer to the same question. It decides only WHICH gesture
   * to make — every number below is still read off the DOM after a real
   * submit. */
  const plannedCursor = (row: Row): string => {
    const slot = {} as Record<(typeof SLOTS)[number], string>;
    for (const s of SLOTS) slot[s] = txt(row[`set_${s.slice(2)}`]);
    return cursorId(slot);
  };

  /** Every gesture the dashboard is offering right now: one per breakdown row it
   * rendered, and one per chip in force. */
  const offered = (m: Mounted): { form: El; cursor: string }[] => {
    const out: { form: El; cursor: string }[] = [];
    const brk = new Map(m.rows("breakdown").map((r) => [`${txt(r.panel)}|${txt(r.dim_value)}`, r]));
    for (const section of m.all(".panels .panel")) {
      const [list] = qa(section, "ul.rows");
      if (list === undefined) throw new Error("a dashboard panel that rendered no rows list");
      const panel = panelOf(list);
      for (const li of qa(section, "li.row")) {
        const dim = attr(li, "data-dim");
        const row = brk.get(`${panel}|${dim}`);
        if (row === undefined) throw new Error(`the screen shows ${panel}/${dim} and the store has no such row`);
        const [form] = qa(li, "form.drill");
        if (form === undefined) throw new Error(`${panel}/${dim} renders no drill-down form`);
        out.push({ form, cursor: plannedCursor(row) });
      }
    }
    const chips = new Map(m.rows("chip").map((r) => [txt(r.slot), r]));
    for (const probeEl of m.all(".chip-probe")) {
      const [form] = qa(probeEl, "form.chip-remove");
      if (form === undefined) continue;
      const slot = attr(probeEl, "data-filter").replace(/^slot=eq\./, "");
      const row = chips.get(slot);
      if (row === undefined) continue; // the slot is unoccupied, so the probe is empty
      out.push({ form, cursor: plannedCursor(row) });
    }
    return out;
  };

  const done = new Set<string>();
  /** A cursor only the full-panel screen can offer: its breakdown row is ranked
   * below the vendor's nine, so the dashboard never renders its form. The
   * dashboard's own store holds the row — `rollup` writes every ord and only the
   * region's `limit` cuts what is shown — so these are found without a mount. */
  const belowTheCut: { preset: string; panel: string; dim: string; range: string; cursor: string }[] = [];
  let gestures = 0;
  let mounts = 0;
  for (const preset of presets) {
    const m = await mountApp({ appDir: APP, screen: DASH, params: { preset }, tables: base, seed: 1 });
    await m.settle();
    mounts += 1;
    for (const r of ranges) {
      const range = txt(r.id);
      await resetTo(m, range);
      // The declared shape is itself a member of the closure, and standing on it
      // is what a reader does before any gesture.
      const declared = cursorOf(m, preset);
      if (!done.has(declared)) {
        done.add(declared);
        for (const walk of ranges) {
          await pickRange(m, txt(walk.id), ranges);
          seen.push(...readTopline(m, cursorOf(m, preset), txt(walk.id)));
        }
        await resetTo(m, range);
      }
      const shown = offered(m);
      const onScreen = new Set(shown.map((g) => g.cursor));
      for (const row of m.rows("breakdown")) {
        const c = plannedCursor(row);
        if (onScreen.has(c) || done.has(c)) continue;
        belowTheCut.push({ preset, panel: txt(row.panel), dim: txt(row.dim_value), range, cursor: c });
      }
      const here = shown.filter((g) => !done.has(g.cursor));
      // One representative gesture per cursor: several gestures reach the same
      // five slots, and the numbers hang off the cursor rather than off the
      // gesture that reached it.
      const once = new Map(here.map((g) => [g.cursor, g] as const));
      for (const want of [...once.keys()]) {
        if (done.has(want)) continue;
        await resetTo(m, range);
        const g = offered(m).find((x) => x.cursor === want);
        if (g === undefined) throw new Error(`${preset} at ${range} stopped offering ${want}`);
        await submit(m, g.form);
        gestures += 1;
        const reached = cursorOf(m, preset);
        assertEquals(reached, want, "the gesture reached a cursor other than the one its row states");
        done.add(reached);
        for (const walk of ranges) {
          await pickRange(m, txt(walk.id), ranges);
          seen.push(...readTopline(m, reached, txt(walk.id)));
        }
      }
    }
    await m.stop();
  }

  // The rest of the closure, reached where a reader reaches it: the full-panel
  // screen shows every value, and the tab carries the cursor back to the
  // dashboard. The harness mounts one screen at a time and cannot navigate, so
  // the live `filter` rows the panel screen's own form wrote are handed to the
  // dashboard mount — that is the tab surviving a route change, not this test
  // writing a cursor.
  let carried = 0;
  for (const want of belowTheCut) {
    if (done.has(want.cursor)) continue;
    const pm = await mountApp({
      appDir: APP,
      screen: PANEL,
      params: { preset: want.preset, panel: want.panel },
      tables: base,
      seed: 1,
    });
    await pm.settle();
    mounts += 1;
    await pickRange(pm, want.range, ranges);
    const buttons = pm.all(".rows tbody tr th button");
    const at = buttons.findIndex((b) => (b.textContent ?? "").trim() === want.dim);
    if (at < 0) throw new Error(`the ${want.panel} panel does not show ${want.dim} at ${want.range}`);
    await submit(pm, pm.all(".rows tbody tr th form")[at]);
    gestures += 1;
    const tab = pm.rows("filter").map((r) => ({ ...r }));
    await pm.stop();

    const m = await mountApp({
      appDir: APP,
      screen: DASH,
      params: { preset: want.preset },
      tables: { ...base, filter: tab },
      seed: 1,
    });
    await m.settle();
    mounts += 1;
    carried += 1;
    const reached = cursorOf(m, want.preset);
    assertEquals(reached, want.cursor, "the full-panel gesture reached a cursor other than its row's");
    done.add(reached);
    for (const walk of ranges) {
      await pickRange(m, txt(walk.id), ranges);
      seen.push(...readTopline(m, reached, txt(walk.id)));
    }
    await m.stop();
  }
  const took = performance.now() - t0;

  // The reach closure answers `value_round` and never a rendered string, so the
  // comparison is numeric here where the declared half compares text. What that
  // costs is the rounding: `views_per_visit` renders "3.40" against a value_round
  // of 3.4, and only the declared half grades the trailing zero.
  const truth = new Map<string, number>(
    gt.reach_topline.map((t) =>
      [gtKey({ screen: DASH, cursor: t.cursor, range: t.range, metric: t.metric }), t.value_round] as const
    ),
  );
  const wrong: string[] = [];
  const ungraded: Rendered[] = [];
  for (const s of seen) {
    const want = truth.get(positionKey(s.r));
    if (want === undefined) {
      ungraded.push(s.r);
      continue;
    }
    const got = numberOf(s.text);
    if (got !== want) {
      wrong.push(
        `(${s.r.cursor}, ${s.r.range}, top line, ${s.r.metric}): ` +
          `the app renders ${got === null ? "nothing at all" : s.text}, the oracle answers ${want}`,
      );
    }
  }
  assertEquals(wrong.slice(0, 12), [], `${wrong.length} reached numbers disagree with the ground truth`);

  const graded = gradedSpace({
    reach: gt.reach,
    topline: [],
    bucket: [],
    breakdown: [],
    reach_topline: gt.reach_topline,
    panel_rows: gt.panel_rows,
  });
  const rendered = seen.map((s) => s.r);
  assertEquals(
    skippedButGraded(ungraded, graded).slice(0, 6),
    [],
    "a graded position the value check compared against nothing",
  );
  const missing = unrendered(graded, rendered);
  const shown = new Set(rendered.map(positionKey));
  const unreached = new Set([...graded].filter((k) => !shown.has(k)).map((k) => position(k).cursor));

  console.log("");
  console.log(`cursors reached by gesture: ${done.size}`);
  console.log(`drill-downs and removals:   ${gestures}`);
  console.log(`reached below the cut:      ${carried}`);
  console.log(`mounts:                     ${mounts}`);
  console.log(`top-line numbers read:      ${seen.length}`);
  console.log(`graded positions covered:   ${graded.size}`);
  console.log(`cursors nothing reached:    ${unreached.size}`);
  console.log(`the reach closure:          ${(took / 1000).toFixed(1)}s`);

  assertEquals(missing, [], "a cursor the oracle answers that no gesture reached");
});
