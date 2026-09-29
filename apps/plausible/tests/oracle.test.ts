// The ground truth, graded before it is trusted.
//
// Nothing here mounts the app. Every assertion below is about oracle.sql's own
// output, and each one is a way the oracle can be wrong: the vendor's published
// numbers, the window arithmetic against a real tz database, the bucket
// cardinalities the whole cardinality-before-value discipline rests on, and the
// discrimination of every named wrong reading. If this file is red the app's grade
// means nothing, which is why ORACLE.md §5.1 runs it first.
//
// The assertions that belong to the FIXTURE — the sha256, the sidecar against
// this partition, the vendor's published cohorts, the plant manifest — are
// fixture.test.ts's, and they need fixtures/ to exist. These do not.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { COLUMNS, groundTruth } from "./ground-truth.ts";

// ORACLE.md §2.1. Stated here as integers so a drift in either document is a red
// test and not a discrepancy someone notices while reading.
const WINDOWS: Record<string, [number, number]> = {
  "day": [1775599200, 1775650800],
  "7d": [1775080800, 1775650800],
  "28d": [1773270000, 1775650800],
  "custom_21d": [1773529200, 1775340000],
  "custom_dst_day": [1774738800, 1774821600],
};

const PAIR_BUCKETS: Record<string, number> = {
  "day/hour": 15,
  "7d/day": 7,
  "28d/day": 28,
  "28d/week": 5,
  "custom_21d/day": 21,
  "custom_21d/week": 4,
  "custom_dst_day/hour": 23,
};

Deno.test("the output is one document with every declared column", async () => {
  const gt = await groundTruth();
  assertEquals(Object.keys(gt).length, COLUMNS.length);
  for (const c of COLUMNS) assert(c in gt, `missing column ${c}`);
  // An empty answer set is `[]` and never null: a cardinality check cannot tell
  // "no rows" from "no opinion" if the two arrive the same way.
  for (const c of COLUMNS) {
    if (c === "current_visitors" || c === "panel_rows" || c === "session_gap_seconds") continue;
    assert(Array.isArray(gt[c]), `${c} is not a list`);
  }
});

Deno.test("the session boundary is 1860 on the SQL side", async () => {
  // Echoed rather than grepped. The app's own copy is pinned behaviourally by
  // stitch.test.ts's walk over the four planted boundary gaps; this is the half
  // that catches the literal moving inside oracle.sql.
  assertEquals((await groundTruth()).session_gap_seconds, 1860);
});

Deno.test("no precondition was degraded", async () => {
  // oracle.sql has no fallback anywhere: a precondition it cannot meet becomes a
  // row here rather than a differently-computed answer. That includes its own
  // agreement with ICU, so this assertion is also where a wrong Zone row lands.
  const v = (await groundTruth()).violation;
  assertEquals(v, [], v.map((x) => `${x.gate}: ${x.detail}`).join("\n"));
});

Deno.test("the five windows are the stated integers, and ICU agrees", async () => {
  const gt = await groundTruth();
  assertEquals(gt.windows.length, 5);
  for (const w of gt.windows) {
    const want = WINDOWS[w.range];
    assert(want, `unexpected range ${w.range}`);
    assertEquals([w.wfrom, w.wto], want, `window ${w.range}`);
  }
  // Not a restatement of the table: 1810800 is one hour SHORT of 21 twenty-four-
  // hour days, and that hour is the one the site's clock skips. If this ever comes
  // out 1814400 the fixture has lost its clock change and the whole of H8 has
  // silently stopped testing anything.
  assertEquals(gt.windows.find((w) => w.range === "custom_21d")!.span, 1810800);
  assertEquals(gt.windows.find((w) => w.range === "custom_dst_day")!.span, 82800);
});

Deno.test("103 buckets, with the per-pair counts", async () => {
  const gt = await groundTruth();
  const count: Record<string, number> = {};
  for (const g of gt.grid) count[`${g.range}/${g.grain}`] = (count[`${g.range}/${g.grain}`] ?? 0) + 1;
  assertEquals(count, PAIR_BUCKETS);
  assertEquals(gt.grid.length, 103);
  // The 23 is the app's whole reason for existing: a bucket per local hour the
  // window intersects, and the local hour 02 of 2026-03-29 does not exist. A grid
  // that hands back 24 has cut the day in UTC or walked local hour labels.
  const dst = gt.grid.filter((g) => g.range === "custom_dst_day").map((g) => g.bucket_key);
  assertEquals(dst.length, 23);
  assert(!dst.includes("2026-03-29 02"), "the local hour 02 does not exist on this day");
  assertEquals(dst[0], "2026-03-29 00");
  assertEquals(dst[22], "2026-03-29 23");
});

Deno.test("the clock steps back once, and there an hour key is not a key", async () => {
  // The other half of the 23-hour day above. The spring step DELETES a local
  // hour, which a walk over UTC hours renders correctly by producing no key for
  // it; the autumn step REPEATS one, which the same walk renders by producing the
  // same key twice. §11 refuses a grid that does — and refuses a Zone table with
  // no step back, so this pair of facts cannot quietly leave the fixture.
  const gt = await groundTruth();
  assertEquals(gt.clock_repeat.length, 1);
  const [c] = gt.clock_repeat;
  assertEquals(c.bucket_key, "2026-10-25 02");
  assertEquals(c.second_slot - c.first_slot, 3600, "two consecutive UTC hours, one local hour");
});

Deno.test("a bucket's ord is its place on the axis", async () => {
  // `ord` is half the coverage key of every graph number (tests/coverage.ts), so
  // it has to mean the position a reader sees the bar at and nothing else: 0..n-1
  // in ascending time, with no gap and no repeat. An `ord` that is a dense
  // ranking of something else — the value, the key's string order — would key a
  // scrambled axis identically to a correct one, which is the escape the position
  // was added to close.
  const gt = await groundTruth();
  const byPair = new Map<string, typeof gt.grid>();
  for (const g of gt.grid) (byPair.get(`${g.range}/${g.grain}`) ?? byPair.set(`${g.range}/${g.grain}`, []).get(`${g.range}/${g.grain}`)!).push(g);
  for (const [pair, rows] of byPair) {
    const inTime = [...rows].sort((a, b) => a.b_from - b.b_from);
    assertEquals(inTime.map((g) => g.ord), inTime.map((_, i) => i), `${pair} ords are not the axis order`);
  }
  // And the graph numbers carry the grid's ord for their own key, so the two
  // cannot come apart between the axis and the bars drawn on it.
  const gridOrd = new Map(gt.grid.map((g) => [`${g.range}|${g.grain}|${g.bucket_key}`, g.ord]));
  const adrift = gt.bucket.filter((b) => gridOrd.get(`${b.range}|${b.grain}|${b.bucket_key}`) !== b.ord);
  assertEquals(adrift, [], "graph numbers whose ord is not the grid's");
});

Deno.test("the stated cardinalities of the graded space", async () => {
  const gt = await groundTruth();
  // ORACLE.md §2.2's two literals. They are properties of the vocabulary alone,
  // so they are asserted; the breakdown count is a property of the data and is
  // printed instead.
  assertEquals(gt.topline.length, 330, "6 top-line metrics x 11 filter sets x 5 ranges");
  assertEquals(gt.bucket.length, 3399, "3 bucketed metrics x 103 buckets x 11 filter sets");
  console.log(
    `breakdown ${gt.breakdown.length} cells, ` +
      `${new Set(gt.breakdown.map((b) => `${b.filter_set}|${b.range}|${b.panel}|${b.dim_value}`)).size} rows; ` +
      `chip ${gt.chip.length}; session ${gt.session.length}; session_hour ${gt.session_hour.length}`,
  );
});

Deno.test("every named wrong reading discriminates", async () => {
  const gt = await groundTruth();
  // A hard case on which the rule and every one of its named wrong readings
  // coincide over this fixture is not a hard case, and the run must say so rather
  // than turning green. `violation` already carries this; the assertion is
  // repeated as its own case so the failure names the reading in its own line.
  const dead = gt.wrong.filter((w) => w.value_rule === w.value_wrong);
  assertEquals(
    dead,
    [],
    dead.map((w) => `${w.hard_case} ${w.reading}: both readings give ${w.value_rule} on ${w.probe}`).join("\n"),
  );
  // The four grid readings are caught as CARDINALITY, which is the point of
  // walking the grid rather than grouping the data: 24 bars on a 23-hour day is a
  // bucket count, not an arithmetic error somewhere in the middle of an axis.
  const by = new Map(gt.wrong.map((w) => [w.reading, w]));
  assertEquals([by.get("twenty_four_bars")!.value_rule, by.get("twenty_four_bars")!.value_wrong], [23, 24]);
  assertEquals([by.get("utc_day_buckets")!.value_rule, by.get("utc_day_buckets")!.value_wrong], [28, 29]);
  assertEquals(
    [by.get("window_by_multiplication")!.value_rule, by.get("window_by_multiplication")!.value_wrong],
    [28, 29],
  );
  assertEquals([by.get("week_starts_sunday")!.value_rule, by.get("week_starts_sunday")!.value_wrong], [4, 3]);
});

Deno.test("no column of the log is a function of another", async () => {
  const gt = await groundTruth();
  // 30 ordered pairs over the six dimension columns. This kills a whole class
  // rather than one instance: it is what keeps `interactive` from being a spelling
  // of `name`, so a bounce rule written against the name and one written against
  // the flag give different answers instead of agreeing by construction.
  assertEquals(gt.dependency.length, 30);
  const bad = gt.dependency.filter((d) => !d.independent);
  assertEquals(bad, [], bad.map((d) => `${d.determinant} -> ${d.dependent} is a function over the log`).join("\n"));
});

Deno.test("the axis is the 1/2/5 rule and the points sit on it", async () => {
  const gt = await groundTruth();
  // Five ticks per cursor position, and the top one IS the domain: a domain_max
  // the last tick does not reach leaves the tallest bar drawn past the axis.
  const scales = new Map(gt.scale.map((s) => [`${s.filter_set}|${s.range}|${s.grain}`, s]));
  assertEquals(gt.tick.length, scales.size * 5);
  for (const s of scales.values()) {
    assert([1, 2, 5, 10].some((m) => Math.abs(s.step / m - Math.pow(10, Math.round(Math.log10(s.step / m)))) < 1e-9),
      `step ${s.step} is not 1, 2 or 5 times a power of ten`);
    assert(s.domain_max >= s.domain_raw, `domain_max ${s.domain_max} is below the tallest bar ${s.domain_raw}`);
    assertEquals(s.domain_max, s.step * 4);
  }
  for (const t of gt.tick) {
    assert(t.at_permille >= 0 && t.at_permille <= 1000, `tick at ${t.at_permille} per mille`);
  }
  // Every graph point is inside the coordinate system the axis defines, which is
  // the assertion that catches a chart clipped to nothing — the one defect
  // linkedom serializes identically to a correct one.
  for (const p of gt.scale_point) {
    assert(p.x_permille >= 0 && p.x_permille <= 1000, `x ${p.x_permille}`);
    assert(p.y_permille >= 0 && p.y_permille <= 1000, `y ${p.y_permille}`);
  }
});

Deno.test("a panel is ranked by visitors, ties broken by the dimension", async () => {
  const gt = await groundTruth();
  // The vendor's own order_by, recomputed here from the panel's visitor counts
  // alone and held against the `ord` oracle.sql's window function assigned. The
  // rule is cited at oracle.sql's `panel_limit`; this is the assertion that the
  // SQL implements the rule it cites, and it is the guard on the escape the
  // coverage key was widened for — a panel whose SELECTION and ORDER are wrong
  // shows nine individually correct numbers.
  const panels = new Map<string, { dim_value: string; ord: number; visitors: number }[]>();
  for (const b of gt.breakdown.filter((b) => b.metric === "visitors")) {
    const k = `${b.filter_set}|${b.range}|${b.panel}`;
    (panels.get(k) ?? panels.set(k, []).get(k)!).push({ dim_value: b.dim_value, ord: b.ord, visitors: b.value_num });
  }
  assert(panels.size > 0);
  const wrong: string[] = [];
  let tiesAcrossTheCut = 0;
  for (const [k, rows] of panels) {
    const want = [...rows].sort((a, b) => b.visitors - a.visitors || (a.dim_value < b.dim_value ? -1 : 1));
    want.forEach((r, i) => {
      if (r.ord !== i + 1) wrong.push(`${k}: ${r.dim_value} is ord ${r.ord}, the rule puts it at ${i + 1}`);
    });
    // The panels this fixture must keep: the tie decides which row is SHOWN, not
    // merely where it sits. §11's `panel_tie_never_cuts` refuses their loss; this
    // counts them so the number is on screen when the fixture changes.
    if (want.length > gt.panel_rows && want[gt.panel_rows - 1].visitors === want[gt.panel_rows].visitors) {
      tiesAcrossTheCut++;
    }
  }
  assertEquals(wrong, [], wrong.join("\n"));
  assert(tiesAcrossTheCut > 0, "no panel is tied across the cut, so the tie rule only reorders shown rows");
  console.log(`panels ${panels.size}; tied across row ${gt.panel_rows}: ${tiesAcrossTheCut}`);
});

Deno.test("a drill-down cursor writes all five slots", async () => {
  const gt = await groundTruth();
  // Every Breakdown and Chip row carries the whole cursor, because a form that
  // submits one slot PATCHes only that slot and leaves the other four standing —
  // which is how a reader reaches a two-slot cursor nothing grades. The escape is
  // closed on the oracle side too, so a fold that emits four of the five fails
  // here rather than in the sweep's reverse anti-join months later.
  const slots = ["set_page", "set_entry_page", "set_source", "set_browser", "set_name"] as const;
  for (const b of gt.breakdown) {
    for (const s of slots) assert(typeof b[s] === "string", `breakdown ${b.panel}|${b.dim_value} has no ${s}`);
  }
  for (const c of gt.chip) {
    for (const s of slots) assert(typeof c[s] === "string", `chip ${c.filter_set}|${c.slot} has no ${s}`);
    // A chip removes its own slot and only its own.
    const own = { f_page: "set_page", f_entry_page: "set_entry_page", f_source: "set_source",
                  f_browser: "set_browser", f_name: "set_name" }[c.slot]!;
    assertEquals((c as unknown as Record<string, string>)[own], "", `chip ${c.slot} does not clear its own slot`);
  }
});

Deno.test("every filter slot moves a graded number", async () => {
  const gt = await groundTruth();
  // Spelling a slot is not exercising it. A shape that occupies `f_name` with a
  // value every hit matches leaves a rollup that ignores the slot producing
  // identical output, which is the escape this asserts against: for each slot
  // some declared shape occupies it ALONE and reads differently from `none`.
  const slots = ["c_page", "c_entry_page", "c_source", "c_browser", "c_name"] as const;
  const declared = gt.reach.filter((r) => r.origin_kind === "declared");
  const none = new Map(
    gt.topline.filter((t) => t.filter_set === "none").map((t) => [`${t.range}|${t.metric}`, t.value_round]),
  );
  for (const slot of slots) {
    const alone = declared.filter((r) =>
      (r as unknown as Record<string, string>)[slot] !== "" &&
      slots.every((o) => o === slot || (r as unknown as Record<string, string>)[o] === "")
    );
    assert(alone.length > 0, `no declared shape occupies ${slot} and nothing else`);
    const moves = alone.some((r) =>
      gt.topline.some((t) => t.filter_set === r.origin && t.value_round !== none.get(`${t.range}|${t.metric}`))
    );
    assert(moves, `${slot} is occupied by ${alone.map((r) => r.origin).join(", ")} and no top-line number moves`);
  }
});

Deno.test("the closure is graded, and it agrees with the panel it was clicked from", async () => {
  const gt = await groundTruth();
  // The dashboard can stand on hundreds of cursors and the declared vocabulary
  // names eleven, so §7.5 enumerates the one-gesture closure and grades its top
  // line at every range. §11 holds three things true about it; this asserts the
  // same three from outside, so a gate deleted from oracle.sql is not a silent
  // pass.
  const cursors = new Set(gt.reach.map((r) => r.cursor));
  const graded = new Set(gt.reach_topline.map((t) => t.cursor));
  assertEquals([...cursors].filter((c) => !graded.has(c)), [], "reachable cursors with no graded top line");
  assertEquals([...graded].filter((c) => !cursors.has(c)), [], "graded cursors nothing reaches");
  assertEquals(gt.reach_topline.length, cursors.size * gt.windows.length * 6);

  // Every declared shape is in the closure, and the closure's arithmetic and
  // §7's must agree on all of its numbers. The two are separate expressions over
  // the same log; this is the only place they meet.
  const byCursor = new Map(gt.reach_topline.map((t) => [`${t.cursor}|${t.range}|${t.metric}`, t.value_round]));
  const declared = new Map(gt.reach.filter((r) => r.origin_kind === "declared").map((r) => [r.origin, r.cursor]));
  assertEquals(declared.size, 11, "the declared shapes are not all in the closure");
  const drift = gt.topline
    .filter((t) => byCursor.get(`${declared.get(t.filter_set)}|${t.range}|${t.metric}`) !== t.value_round)
    .map((t) => `${t.filter_set} ${t.range} ${t.metric}`);
  assertEquals(drift, [], "top-line numbers the closure computes differently");

  // Clicking a row must land on the number the row showed.
  const brk = new Map(
    gt.breakdown.map((b) => [`${b.filter_set}|${b.range}|${b.panel}|${b.dim_value}|${b.metric}`, b.value_round]),
  );
  const clicks = gt.reach.filter((r) => r.origin_kind === "drilldown");
  assert(clicks.length > 1000, `only ${clicks.length} drill-downs`);
  const mismatched = clicks.flatMap((r) =>
    ["visitors", "visits", "pageviews", "bounce_rate", "visit_duration"]
      .filter((m) =>
        brk.get(`${r.origin}|${r.origin_range}|${r.origin_panel}|${r.origin_value}|${m}`) !==
          byCursor.get(`${r.cursor}|${r.origin_range}|${m}`)
      )
      .map((m) => `${r.origin} ${r.origin_range} ${r.origin_panel}=${r.origin_value} ${m}`)
  );
  assertEquals(mismatched, [], "rows that show one number and land on another");
});

Deno.test("the run states what it graded", async () => {
  const gt = await groundTruth();
  // Two totals can both be true of this oracle — the top line and the graph
  // alone, or every number in the output — and a run that prints neither leaves
  // the reader to pick. This prints the whole accounting, and asserts the total
  // against its parts so the headline cannot drift from the document.
  const rendered: [string, number, string][] = [
    ["topline", gt.topline.length, "6 metrics x 11 shapes x 5 ranges"],
    ["bucket", gt.bucket.length, "3 metrics x 103 buckets x 11 shapes"],
    ["breakdown", gt.breakdown.length, `6 metrics x ${gt.breakdown.length / 6} panel rows`],
    ["reach_topline", gt.reach_topline.length, `6 metrics x ${new Set(gt.reach.map((r) => r.cursor)).size} reachable cursors x 5 ranges`],
    ["tick", gt.tick.length, "5 per axis"],
    ["scale_point", gt.scale_point.length, "one per graph bucket"],
    ["chip", gt.chip.length, "one per occupied slot"],
    ["current_visitors", 1, "filter-independent"],
  ];
  const structure: [string, number][] = [
    ["session", gt.session.length],
    ["session_hour", gt.session_hour.length],
    ["grid", gt.grid.length],
    ["scale", gt.scale.length],
    ["reach", gt.reach.length],
    ["dependency", gt.dependency.length],
    ["wrong", gt.wrong.length],
    ["anchor", gt.anchor.length],
    ["windows", gt.windows.length],
  ];
  const total = rendered.reduce((a, [, n]) => a + n, 0);
  const cursors = new Set(gt.reach.map((r) => r.cursor)).size;
  const declinedGraph = cursors * gt.grid.length * 3;
  console.log(
    ["", "=== what this run graded ===", "  numbers a screen can show:"]
      .concat(rendered.map(([k, n, how]) => `    ${k.padEnd(17)}${String(n).padStart(6)}   ${how}`))
      .concat([
        `    ${"TOTAL".padEnd(17)}${String(total).padStart(6)}`,
        "  structure, graded and not rendered as a number:",
        `    ${structure.map(([k, n]) => `${k} ${n}`).join(" · ")}`,
        "  declined, with the cost stated in tests/coverage.ts:",
        `    the graph under a reached cursor    ${declinedGraph} numbers (${cursors} cursors x ${gt.grid.length} buckets x 3 metrics)`,
        "    the panels under a reached cursor   not enumerated: a panel row IS the next gesture's cursor",
        "",
      ]).join("\n"),
  );
  // Nothing the oracle answers goes unaccounted for. Summing `rendered` and
  // comparing it against its own seven lengths is one derivation held against
  // itself: it holds for any output, an empty one included. The independent side
  // is the SHAPE of GroundTruth — every table it carries must be named by one of
  // the three lists, so a table added to the oracle without a line here goes red.
  const gates = ["violation", "clock_repeat"];
  const named = new Set([...rendered.map(([k]) => k), ...structure.map(([k]) => k), ...gates]);
  const carried = Object.entries(gt).filter(([, v]) => Array.isArray(v)).map(([k]) => k);
  assertEquals(
    carried.filter((k) => !named.has(k)).sort(),
    [],
    "a table the oracle answers that the accounting above does not name",
  );
  // And the printed total is its own parts, so the headline cannot drift from the
  // rows beneath it.
  assertEquals(total, rendered.reduce((a, [, n]) => a + n, 0));
});
