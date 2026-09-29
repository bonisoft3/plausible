// Where the clock steps BACK, an hour key is not a key — and both folds refuse.
//
// The spring step deletes a local hour, and a walk over UTC hours renders that
// correctly by producing no key for it. The autumn step repeats one: two UTC
// hours render the same local hour, so the same walk produces the same key
// twice. `oracle.sql` §11 refuses a grid that reaches an hour twice; these are
// the app's two sites of the same rule — the `session_hour` id `stitch` writes
// and the hour axis `rollup` draws.
//
// The committed log cannot carry the case. The Zone rows are witnessed against
// ICU's Europe/Berlin, whose next step back is 2026-10-25, six months past the
// log's last hit — so the two instants come from the ground truth, which derives
// them from those same Zone rows and never from a hit.
import { assertEquals } from "jsr:@std/assert@1";
import { appCollections, appSeed, mountApp, type Row } from "../../../plugins/omnishell/test/screen-harness.ts";
import { APP, groundTruth } from "./ground-truth.ts";
import { instantOf } from "../fixtures/clock.ts";

const txt = (v: unknown) => String(v ?? "");

const empties = async () => {
  const seeded = new Set(Object.keys(await appSeed(APP)));
  const out: Record<string, Row[]> = {};
  for (const t of await appCollections(APP)) if (!seeded.has(t)) out[t] = [];
  return out;
};

/** The one local hour of this clock two UTC hours reach. */
const step = async () => {
  const { clock_repeat } = await groundTruth();
  assertEquals(clock_repeat.length, 1, "the ground truth names one repeated local hour");
  return clock_repeat[0];
};

const errors = (rows: Row[]) =>
  rows.filter((r) => txt(r.error) !== "").map((r) => `${txt(r.id)}: ${txt(r.error)}`);

Deno.test("a visit open across the step is refused, not collapsed onto one hour row", async () => {
  const c = await step();
  const hit = (id: string, epoch: number, pathname: string) => ({
    id,
    epoch: instantOf(epoch),
    visitor: "vz",
    name: "pageview",
    interactive: false,
    pathname,
    source: "direct",
    browser: "Chrome",
  });
  // 1 200 s apart, so the 1860 rule keeps them in one visit, and one in each of
  // the two UTC hours that share the key. The local stamps run BACKWARDS across
  // the pair — 02:50 then 02:10 — which is what a step back means.
  const log = [hit("c1", c.first_slot + 3000, "/"), hit("c2", c.second_slot + 600, "/docs")];

  const m = await mountApp({
    appDir: APP,
    screen: "sessions",
    tables: { ...(await empties()), event: log },
    seed: 1,
  });
  await m.settle();
  const fold = errors(m.rows("fold"));
  const hours = m.rows("session_hour").map((r) => txt(r.id));
  const sessions = m.rows("session").map((r) => `${txt(r.id)} spans ${txt(r.hours_n)} hours`);
  await m.stop();

  // Without the refusal the walk puts twice to one id, the second put wins, and
  // `hours_n` says two where one row exists: the column disagrees with the rows
  // it counts, so the next wake writes the same pair again and the seat never
  // reaches a fixpoint.
  assertEquals(fold, [`stitch: two hours of this visit are the local hour ${c.bucket_key}`]);
  assertEquals(hours, [], "a refused world writes no hour row");
  assertEquals(sessions, [], "a refused world writes no visit");
});

Deno.test("an axis that would reach one local hour twice is refused, not drawn short", async () => {
  const c = await step();
  const base = await empties();
  const cursor = (await appSeed(APP)).filter.find((r) => txt(r.id) === "none");
  if (cursor === undefined) throw new Error("the seed carries no `none` cursor");

  // One hour past the step, at hour granularity: local 00, 01, 02 and 02 again.
  const m = await mountApp({
    appDir: APP,
    screen: "dash",
    params: { preset: "none" },
    tables: {
      ...base,
      event: [],
      filter: [{ ...cursor, range: "day", grain: "hour", as_of_epoch: instantOf(c.second_slot + 3600) }],
    },
    seed: 1,
  });
  await m.settle();
  const fold = errors(m.rows("fold"));
  // Without the refusal the two colliding steps land in one cell, whose `ord` is
  // the second one's, and the axis renders three bars for a four-hour window
  // with the ordinal b-02 missing.
  const buckets = m.rows("bucket").map((r) => txt(r.id));
  await m.stop();

  assertEquals(fold, [`rollup: the local hour ${c.bucket_key} is two hours of this window`]);
  assertEquals(buckets, [], "a refused axis draws no bar");
});
