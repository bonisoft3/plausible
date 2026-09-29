// The three namespace walls, pinned executably, and what linkedom cannot tell
// apart.
//
// Two of the three narrow cases work and this app ships both: a bound `d` on the
// authored `<svg>` inside a LEAF SLOT, and a bound geometry attribute on an
// `<svg>` cloned as part of an item template. The third — one `<svg>` canvas
// whose CHILDREN are per-row — is the one nothing in this tree does, and the
// reason is below.
//
// What no tier under a real browser can see: linkedom serializes a
// wrong-namespace element, and one clipped to nothing, identically to a correct
// one. So a green run here is a claim about the STRING the region bound, never
// about a painted box. The painted box is a Playwright assertion at the
// workspace root and this app does not write it.
import { assertEquals } from "jsr:@std/assert@1";
import { appCollections, appSeed, mountApp, type Row } from "../../../plugins/omnishell/test/screen-harness.ts";
import { APP, groundTruth } from "./ground-truth.ts";
import { empties } from "./drive.ts";
import { pickGrain, pickRange, vocabulary } from "./drive.ts";

const txt = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v ?? 0);
const attr = (el: unknown, a: string) => (el as { getAttribute(a: string): string | null }).getAttribute(a);

const dash = async () => {
  const m = await mountApp({
    appDir: APP,
    screen: "dash",
    params: { preset: "none" },
    tables: await empties(),
    seed: 1,
  });
  await m.settle();
  return m;
};

Deno.test("a leaf slot binds `d` on an authored svg, and the element is stamped once", async () => {
  const m = await dash();
  const columns = m.one(".graph svg path.columns");
  const scale = m.rows("scale")[0];
  assertEquals(attr(columns, "d"), txt(scale.path_d), "the columns take the plain interpolate path");
  // Two bound attributes in ONE leaf slot. If the slot bound only the first
  // path, the floor marks would be a silent no-op everywhere.
  assertEquals(
    txt(attr(m.one(".graph svg path.floor"), "d")),
    txt(scale.floor_d),
    "the floor marks take their own bound d",
  );
  assertEquals(txt(scale.path_d).startsWith("M "), true, "a path string, not an empty binding");
  assertEquals(n(scale.points), m.all(".buckets .bucket").length, "one point per bucket the table shows");

  // The slot never sweeps, so a refresh does not restamp the svg. The identity
  // check is what makes that a claim rather than a hope: a list region would
  // have replaced this node.
  const before = m.one(".graph svg");
  const forms = m.all(".ranges form");
  m.fire(forms[0], "submit");
  await m.settle();
  assertEquals(m.one(".graph svg") === before, true, "the authored svg survived a refresh");
  await m.stop();
});

Deno.test("an item template clones an svg with its namespace, carrying bound geometry", async () => {
  const m = await dash();
  const arcs = m.all(".panels li.row svg.arc circle.cut");
  assertEquals(arcs.length > 0, true, "the panels rendered no bounce arcs at all");
  const brk = new Map(m.rows("breakdown").map((r) => [`${txt(r.panel)}|${txt(r.dim_value)}`, r]));
  for (const li of m.all(".panels li.row")) {
    const dim = txt(attr(li, "data-dim"));
    const cut = (li as unknown as { querySelector(s: string): unknown }).querySelector("svg.arc circle.cut");
    const panel = txt(attr(
      (li as unknown as { closest(s: string): unknown }).closest("ul.rows"),
      "data-filter",
    )).replace(/^panel=eq\./, "").replace(/&.*$/, "");
    const row = brk.get(`${panel}|${dim}`);
    if (row === undefined) throw new Error(`the screen shows ${panel}/${dim} and the store has no such row`);
    // `stroke-dasharray` travels the ordinary interpolate path, where a bound
    // `href` travels the URL-attribute stash — which is the step past what
    // chess's piece glyph proves.
    assertEquals(attr(cut, "stroke-dasharray"), `${txt(row.arc)} 100`, `${panel}/${dim}`);
  }
  await m.stop();
});

Deno.test("the axis is five ticks from the stated rounding rule", async () => {
  const gt = await groundTruth();
  const m = await dash();
  const ticks = m.rows("tick").sort((a, b) => n(a.ord) - n(b.ord));
  assertEquals(ticks.length, 5);
  const truth = gt.tick.filter((t) => t.filter_set === "none" && t.range === "28d" && t.grain === "day")
    .sort((a, b) => a.ord - b.ord);
  assertEquals(ticks.map((t) => n(t.value)), truth.map((t) => t.value_num), "the 1/2/5 x 10^k steps");
  assertEquals(ticks.map((t) => n(t.at)), truth.map((t) => t.at_permille), "where each is placed");
  // The axis is a list, so its rows are stamped rather than bound in place, and
  // the geometry rides a custom property the store validated as a number.
  assertEquals(
    m.all(".axis .tick").map((el) => txt(attr(el, "style"))),
    ticks.map((t) => `--at: ${n(t.at)}`),
  );
  await m.stop();
});

Deno.test("the columns the one path is drawn from are the oracle's", async () => {
  const gt = await groundTruth();
  const m = await dash();
  const scale = m.rows("scale")[0];
  const pts = gt.scale_point.filter((p) => p.filter_set === "none" && p.range === "28d" && p.grain === "day")
    .sort((a, b) => a.ord - b.ord);
  // The authored viewBox is 1000 x 300, so the y channel is the oracle's per
  // mille projected onto 300, and the x channel is its per mille scaled to leave
  // the last column's width inside the right edge. The width is taken off the
  // ORACLE's point count, so a window drawn with the wrong number of columns
  // fails on every coordinate here and not only on the count beside it. The
  // projection is the picture's; the per-mille numbers behind it are what is
  // graded.
  const gap = 200 / pts.length;
  const bar = (1000 - gap * (pts.length - 1)) / pts.length;
  const tenth = (v: number) => Math.round(v * 10) / 10;
  const want = pts.map((p) => {
    const l = tenth((p.x_permille * (1000 - bar)) / 1000);
    return `M ${l} 300 V ${tenth(p.y_permille * 0.3)} H ${tenth(l + bar)} V 300 Z`;
  }).join(" ");
  assertEquals(txt(scale.path_d), want);
  await m.stop();
});

Deno.test("every window's two strings are the oracle's points, at a gap that survives both widths", async () => {
  const gt = await groundTruth();
  const base = await empties();
  const v = await vocabulary(base);
  const m = await mountApp({ appDir: APP, screen: "dash", params: { preset: "none" }, tables: base, seed: 1 });
  await m.settle();
  // Re-spelled here rather than shared with rollup.js. A helper both sides
  // imported would compare the app against itself and there would be no seam.
  const tenth = (x: number) => Math.round(x * 10) / 10;
  const reached = new Set<string>();
  let marksCompared = 0;
  for (const [range, grain] of v.pairs) {
    await pickRange(m, range, v.ranges);
    const opens = txt(v.ranges.find((r) => txt(r.id) === range)?.opens_on);
    if (grain !== opens) await pickGrain(m, grain);
    const at = `${range}/${grain}`;
    const pts = gt.scale_point
      .filter((p) => p.filter_set === "none" && p.range === range && p.grain === grain)
      .sort((a, b) => a.ord - b.ord);
    // Which buckets measured nothing, off the oracle's own counts. NOT off
    // y_permille: y reaches 1000 for any value below domain_max / 2000, so that
    // reading would carry a precondition on the domain this app does not state.
    const empty = new Set(
      gt.bucket.filter((b) =>
        b.filter_set === "none" && b.range === range && b.grain === grain &&
        b.metric === "visitors" && b.value_num === 0
      ).map((b) => b.ord),
    );
    const gap = 200 / pts.length;
    const bar = (1000 - gap * (pts.length - 1)) / pts.length;
    const left = (p: { x_permille: number }) => tenth((p.x_permille * (1000 - bar)) / 1000);
    const wantPath = pts.map((p) =>
      `M ${left(p)} 300 V ${tenth(p.y_permille * 0.3)} H ${tenth(left(p) + bar)} V 300 Z`
    ).join(" ");
    const wantFloor = pts.filter((p) => empty.has(p.ord)).map((p) =>
      `M ${left(p)} 300 V 297 H ${tenth(left(p) + bar)} V 300 Z`
    ).join(" ");
    const scale = m.rows("scale")[0];
    assertEquals(txt(scale.path_d), wantPath, at);
    assertEquals(txt(scale.floor_d), wantFloor, at);
    // Neither string may absorb a bucket the other dropped. Columns are one per
    // point whatever the point measured, marks are one per point that measured
    // nothing, and both counts are the oracle's.
    assertEquals(n(scale.points), pts.length, at);
    assertEquals(txt(scale.path_d).split("Z").length - 1, pts.length, `${at}: one column per point`);
    assertEquals(txt(scale.floor_d).split("Z").length - 1, empty.size, `${at}: one mark per empty bucket`);
    // dash.css gives the drawing 1118px under the 78rem cap and 300px at a 390px
    // viewport. A CONSTANT gap is one number at every bucket count — 2.24px and
    // 0.6px — which is a solid field cut by hairlines at four buckets and a
    // sub-pixel seam at twenty-eight. A gap proportional to the pitch is what
    // clears both, and these are the two ends it has to clear.
    assertEquals(gap * 1.118 >= 4, true, `${at}: ${(gap * 1.118).toFixed(2)}px gap under the 78rem cap`);
    assertEquals(gap * 0.3 >= 1.5, true, `${at}: ${(gap * 0.3).toFixed(2)}px gap at a 390px viewport`);
    reached.add(at);
    marksCompared += empty.size;
  }
  // The sweep's window list comes from the app's own grain rows, so coverage is
  // the app's claim until it is held against the oracle's: a window dropped from
  // the seed would shrink the sweep in silence, and every window whose buckets
  // are all occupied compares floor_d as the empty string. These three bind the
  // sweep itself — the windows it mounted and the marks it compared — against
  // what the oracle holds. {#accept-dst-day-23-bars} {#accept-empty-bucket-marked}
  const isDst = (r: { filter_set: string; range: string; grain: string }) =>
    r.filter_set === "none" && r.range === "custom_dst_day" && r.grain === "hour";
  assertEquals(gt.scale_point.filter(isDst).length, 23, "the day the clock changed is twenty-three buckets");
  const oracleWindows = new Set(
    gt.scale_point.filter((p) => p.filter_set === "none").map((p) => `${p.range}/${p.grain}`),
  );
  assertEquals(
    [...oracleWindows].filter((w) => !reached.has(w)).sort(),
    [],
    "a window the oracle grades that the sweep never mounted",
  );
  assertEquals(
    marksCompared,
    gt.bucket.filter((b) =>
      b.filter_set === "none" && b.metric === "visitors" && b.value_num === 0
    ).length,
    "every empty bucket the oracle holds was compared as a mark",
  );
  await m.stop();
});

Deno.test("no region sits on an svg, which is the wall this app does not cross", async () => {
  // A <template> authored inside an <svg> is an SVGElement with no `.content`,
  // and hydrating that region throws a TypeError — an <svg data-live> does not
  // mis-render, it crashes. The rule is enforced on the emitted markup rather
  // than remembered.
  for (const screen of ["index", "dash", "panel", "sessions", "log", "spec"]) {
    const html = await Deno.readTextFile(new URL(`shell/screens/${screen}.html`, APP));
    const offending = [...html.matchAll(/<svg[^>]*>/g)].filter((m) => /data-live|data-item/.test(m[0]));
    assertEquals(offending.map((m) => m[0]), [], `${screen}.html puts a region on an svg`);
  }
});

Deno.test("arrow keys walk the points, and an end names itself", async () => {
  const m = await dash();
  const readout = () => (m.one(".caret-says").textContent ?? "").replace(/\s+/g, " ").trim();
  const marked = () => m.all('.bucket[data-caret="true"]').map((el) => attr(el, "data-bucket"));
  const column = () => txt(m.rows("filter").find((r) => txt(r.id) === "none")?.active_bucket);
  const press = async (key: string) => {
    m.fire(m.one(".caret-says"), "keydown", { key, cancelable: true });
    await m.settle();
  };
  const points = m.all(".buckets .bucket").map((el) => attr(el, "data-bucket"));

  // Exactly one point is marked, and the readout names it. Two would leave which
  // one the reader is on to document order.
  assertEquals(marked(), [points[0]], "cold, the caret is on the first point");
  assertEquals(attr(m.one(".caret-says"), "aria-activedescendant"), `point-${column()}`);
  assertEquals(readout().includes(txt(m.rows("bucket").find((r) => txt(r.id) === column())?.label)), true);

  await press("ArrowRight");
  await press("ArrowRight");
  assertEquals(marked(), [points[2]], "two presses walk two points");
  await press("ArrowLeft");
  assertEquals(marked(), [points[1]]);
  // An end names itself: the graph does not wrap, so the head absorbs a press.
  await press("ArrowLeft");
  await press("ArrowLeft");
  assertEquals(marked(), [points[0]], "the head does not wrap round to the tail");

  // The regression this shape exists for (ir decision-23). Walk the caret past
  // where a shorter axis reaches, then shorten the axis: with the tabstop on the
  // point row the departing row and the arriving one both read current and the
  // refresh throws, and with the readout pinned on that point the terminal
  // clears its bindings and the arrows go silent. Both are ordinary gestures.
  for (let i = 0; i < 12; i += 1) await press("ArrowRight");
  assertEquals(marked(), [points[12]]);
  const ranges = m.all(".ranges form");
  const shorter = m.all(".ranges form button").findIndex((b) => (b.textContent ?? "").includes("seven"));
  assertEquals(shorter >= 0, true, "no seven-day range button to shorten the axis with");
  m.fire(ranges[shorter], "submit");
  await m.settle();
  const short = m.all(".buckets .bucket").map((el) => attr(el, "data-bucket"));
  assertEquals(short.length < points.length, true, "the axis did not shorten, so this proves nothing");
  assertEquals(marked(), [short[0]], "a window that moved put the caret back on its first point");
  await press("ArrowRight");
  assertEquals(marked(), [short[1]], "and the arrows still walk in the new window");

  await m.stop();
});
