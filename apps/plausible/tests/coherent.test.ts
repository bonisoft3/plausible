// The coherence guard, as the dashboard exercises it.
//
// The predicate is inlined in `rollup.js` — a Compartment takes no import, and a
// second module reached by any other route is smuggling — so it has no seam a
// test can call. What a test can do is what a reader does: stand on every
// declared position and read `Fold.error`, which is the guard's whole observable
// effect, and then assert the arithmetic each clause claims.
import { assertEquals } from "jsr:@std/assert@1";
import { appCollections, appSeed, mountApp, type Row } from "../../../plugins/omnishell/test/screen-harness.ts";
import { APP, groundTruth } from "./ground-truth.ts";
import { empties, pickRange } from "./drive.ts";

const txt = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v ?? 0);

Deno.test("no declared position refuses, and the top line each states is coherent", async () => {
  const base = await empties();
  const probe = await mountApp({ appDir: APP, screen: "dash", params: { preset: "none" }, tables: base, seed: 1 });
  await probe.settle();
  const presets = probe.rows("filter_set").map((r) => txt(r.id));
  const ranges = probe.rows("range").sort((a, b) => n(a.pos) - n(b.pos));
  await probe.stop();

  const refused: string[] = [];
  const incoherent: string[] = [];
  for (const preset of presets) {
    const m = await mountApp({ appDir: APP, screen: "dash", params: { preset }, tables: base, seed: 1 });
    await m.settle();
    for (const r of ranges) {
      await pickRange(m, txt(r.id), ranges);
      const err = m.rows("fold").find((f) => txt(f.id) === "rollup");
      if (err !== undefined && txt(err.error) !== "") {
        refused.push(`${preset} at ${txt(r.id)}: ${txt(err.error)}`);
        continue;
      }
      const t = m.rows("topline")[0];
      // The clause that compares two columns the fold reached by different
      // routes, restated here so the guard is not the only thing that believes
      // it. Scaled by 100 and compared in integers, which is the whole point:
      // `event-1` at 28d divides 147 pageviews by 56 visits, lands on 2.625, and
      // renders 2.63 — the float form `|vpv * n - pv| <= n * 0.005` exceeds its
      // own exact bound there and refuses a row the oracle itself computes.
      const sessions = n(t.sessions_n);
      const slack = Math.abs(Math.round(Number(t.views_per_visit_text) * 100) * sessions - n(t.pv_sum) * 100);
      if (slack > sessions * 0.5) {
        incoherent.push(`${preset} at ${txt(r.id)}: views_per_visit does not reproduce pv_sum (${slack})`);
      }
      if (n(t.bounce_n) > n(t.bounce_denom)) {
        incoherent.push(`${preset} at ${txt(r.id)}: bounce_n above its divisor`);
      }
      const rate = n(t.bounce_denom) === 0 ? 0 : (n(t.bounce_n) / n(t.bounce_denom)) * 100;
      if (rate < 0 || rate > 100) incoherent.push(`${preset} at ${txt(r.id)}: bounce_rate outside 0..100`);
    }
    await m.stop();
  }
  assertEquals(refused, [], "the guard refused a position the oracle answers");
  assertEquals(incoherent, [], "a stated top line is not internally coherent");
});

Deno.test("a row with more visitors than visits is one the oracle answers", async () => {
  // Why the guard has no `visitors <= visits` clause. A hit matches a window by
  // its own epoch and a visit matches by its START, so the hits of a visit open
  // across the window's opening count toward `visitors` while the visit counts
  // toward no `visits` at all. On a panel row reached by one such visitor that
  // reads as one visitor and no visits — which a clause of that shape would
  // refuse, and the oracle computes.
  const gt = await groundTruth();
  const seen = new Map<string, { visitors: number; visits: number }>();
  for (const r of gt.breakdown) {
    if (r.metric !== "visitors" && r.metric !== "visits") continue;
    const k = `${r.filter_set} ${r.range} ${r.panel} ${r.dim_value}`;
    const row = seen.get(k) ?? { visitors: 0, visits: 0 };
    row[r.metric] = r.value_num;
    seen.set(k, row);
  }
  const above = [...seen].filter(([, r]) => r.visitors > r.visits).map(([k]) => k).sort();
  assertEquals(above, [
    "negated day entry_page /about",
    "negated day page /changelog",
    "negated day source newsletter",
    "none day entry_page /about",
    "none day page /changelog",
    "none day source newsletter",
  ], "the panel rows the oracle answers with more visitors than visits");
});

Deno.test("the rounding boundary the guard must admit is really in this fixture", async () => {
  // If this stops being true the regression above stops being guarded, and the
  // float form of the clause would pass for the wrong reason.
  const gt = await groundTruth();
  // On the boundary means the quotient's third decimal is exactly 5, which is an
  // integer question and is asked as one: `147 * 1000 / 56` is 2625.
  const onBoundary = gt.topline.filter((t) => {
    if (t.metric !== "views_per_visit") return false;
    const den = t.value_den ?? 0;
    if (den === 0) return false;
    return (t.value_num * 1000) % den === 0 && ((t.value_num * 1000) / den) % 10 === 5;
  });
  assertEquals(
    onBoundary.map((t) => `${t.filter_set} ${t.range}`),
    ["event-1 28d", "event-1 day"],
    "the quotients that land exactly on the two-decimal rounding boundary",
  );
  // Sitting on the boundary is not by itself the case the integer form exists
  // for: `|vpv x n - pv| <= n x 0.005` is the exact bound, and the double error
  // can land on either side of it — 25/8 renders 3.13 and passes the float form
  // by 8.5e-16. The guarded row is the one where it lands outside, and it must be
  // in the fixture or the integer form is free to become the float one.
  const den = (t: typeof onBoundary[number]) => t.value_den ?? 0;
  assertEquals(
    onBoundary.filter((t) => Math.abs(Number(t.value_text) * den(t) - t.value_num) > den(t) * 0.005)
      .map((t) => `${t.filter_set} ${t.range}`),
    ["event-1 28d"],
    "the boundary row the float form of the coherence clause refuses",
  );
});
