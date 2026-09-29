// `stitch`, mounted cold off the seed and compared to DuckDB's own window stitch
// column for column.
//
// Cardinality first, then every column, then the visits `plants.json` names —
// because a missing visit must fail as a missing visit and not as a value
// somewhere else.
import { assertEquals } from "jsr:@std/assert@1";
import { appCollections, appSeed, mountApp, type Row } from "../../../plugins/omnishell/test/screen-harness.ts";
import { APP, byKey, groundTruth } from "./ground-truth.ts";
import { empties } from "./drive.ts";
import { epochOf } from "../fixtures/clock.ts";

const txt = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v ?? 0);

let mounted: Promise<{ session: Row[]; hour: Row[]; corpus: Row[]; fold: Row[] }> | undefined;
/** One cold mount, shared: the whole file asks the same settled world different
 * questions, and mounting per case would fold 1 200 hits once per question. */
const app = () => {
  mounted ??= (async () => {
    const m = await mountApp({ appDir: APP, screen: "sessions", tables: await empties(), seed: 1 });
    await m.settle();
    const out = {
      session: m.rows("session").map((r) => ({ ...r })),
      hour: m.rows("session_hour").map((r) => ({ ...r })),
      corpus: m.rows("corpus").map((r) => ({ ...r })),
      fold: m.rows("fold").map((r) => ({ ...r })),
    };
    await m.stop();
    return out;
  })();
  return mounted;
};

Deno.test("the fold reports no refusal", async () => {
  const { fold } = await app();
  assertEquals(fold.filter((r) => txt(r.error) !== "").map((r) => `${txt(r.id)}: ${txt(r.error)}`), []);
});

Deno.test("mounting a screen cold cuts the log into exactly DuckDB's visits", async () => {
  const gt = await groundTruth();
  const { session, hour } = await app();
  // Cardinality before value, on both.
  assertEquals(session.length, gt.session.length, "Session rows");
  assertEquals(hour.length, gt.session_hour.length, "SessionHour rows");
  assertEquals(
    new Set(session.map((r) => txt(r.id))).size,
    session.length,
    "a session id that is not unique is not a key",
  );
});

Deno.test("every column of every visit agrees", async () => {
  const gt = await groundTruth();
  const { session } = await app();
  const truth = byKey(gt.session, (s) => s.session_id);
  const wrong: string[] = [];
  for (const r of session) {
    const g = truth.get(txt(r.id));
    if (g === undefined) {
      wrong.push(`the app stitched ${txt(r.id)} and DuckDB did not`);
      continue;
    }
    const cmp: [string, unknown, unknown][] = [
      ["visitor", txt(r.visitor), g.visitor],
      ["ord", n(r.ord), g.ord],
      ["start_epoch", epochOf(r.start_epoch), g.start_epoch],
      ["last_epoch", epochOf(r.last_epoch), g.last_epoch],
      ["entry_page", txt(r.entry_page), g.entry_page],
      ["exit_page", txt(r.exit_page), g.exit_page],
      ["pageviews", n(r.pageviews), g.pageviews],
      ["events", n(r.events), g.events],
      ["bounce", txt(r.bounce), g.bounce ? "yes" : "no"],
      ["duration", n(r.duration), g.duration],
      ["source", txt(r.source), g.source],
      ["browser", txt(r.browser), g.browser],
    ];
    for (const [col, app, truthValue] of cmp) {
      if (app !== truthValue) wrong.push(`${txt(r.id)}.${col}: the app says ${app}, DuckDB says ${truthValue}`);
    }
  }
  assertEquals(wrong.slice(0, 12), [], `${wrong.length} columns disagree`);
});

Deno.test("a visit is materialized in every local hour it was open", async () => {
  const gt = await groundTruth();
  const { hour } = await app();
  const app_ = new Set(hour.map((r) => `${txt(r.session_id)}|${txt(r.bucket_key)}`));
  const truth = new Set(gt.session_hour.map((r) => `${r.session_id}|${r.bucket_key}`));
  assertEquals([...truth].filter((k) => !app_.has(k)).slice(0, 8), [], "hours DuckDB cut that the app did not");
  assertEquals([...app_].filter((k) => !truth.has(k)).slice(0, 8), [], "hours the app cut that DuckDB did not");
});

Deno.test("the boundary is the integer 1860, walked over every gap in the log", async () => {
  const { session } = await app();
  const plants = JSON.parse(await Deno.readTextFile(new URL("fixtures/plants.json", APP))) as {
    case: string;
    present: unknown[][];
  }[];
  const h1 = plants.find((p) => p.case === "H1");
  if (h1 === undefined) throw new Error("plants.json names no H1");
  const gaps = h1.present.filter((p) => p[0] === "gap").map((p) => ({ from: String(p[1]), to: String(p[2]), s: Number(p[3]) }));
  // The four the plan names, walked at the literal: 1799 and 1800 and 1859 all
  // continue a visit, and only 1860 opens one. Reading "thirty minutes" as 1800
  // splits at the second of these and is what `gap_ge_1800` grades against.
  assertEquals(gaps.map((g) => g.s).slice(0, 3), [1799, 1800, 1859], "the planted gaps below the boundary");
  const hits = JSON.parse(await Deno.readTextFile(new URL("fixtures/events.json", APP))) as {
    id: string;
    epoch: string;
    visitor: string;
  }[];
  // Walked over every consecutive pair in the log, not only the planted ones: a
  // gap is BELOW the boundary exactly when the two hits share a visit. Asserting
  // that a planted gap reached some visit is true of any sessionization at all —
  // splitting on every hit, or on none — so it pins nothing.
  const byVisitor = new Map<string, number[]>();
  for (const h of hits) {
    const at = byVisitor.get(h.visitor) ?? [];
    at.push(epochOf(h.epoch));
    byVisitor.set(h.visitor, at);
  }
  const visits = new Map<string, { ord: number; from: number; to: number }[]>();
  for (const r of session) {
    const v = txt(r.visitor);
    const at = visits.get(v) ?? [];
    at.push({ ord: n(r.ord), from: epochOf(r.start_epoch), to: epochOf(r.last_epoch) });
    visits.set(v, at);
  }
  const ordAt = (v: string, epoch: number): number => {
    const held = (visits.get(v) ?? []).filter((s) => s.from <= epoch && epoch <= s.to);
    if (held.length !== 1) {
      throw new Error(`${v}'s hit at ${epoch} sits in ${held.length} visits; every hit sits in exactly one`);
    }
    return held[0].ord;
  };
  let below = 0;
  let above = 0;
  for (const [v, epochs] of byVisitor) {
    epochs.sort((a, b) => a - b);
    for (let i = 1; i < epochs.length; i += 1) {
      const gap = epochs[i] - epochs[i - 1];
      const same = ordAt(v, epochs[i - 1]) === ordAt(v, epochs[i]);
      assertEquals(
        same,
        gap < 1860,
        `${v}: a gap of ${gap}s ${same ? "continued" : "opened"} a visit, and 1860 is the boundary`,
      );
      if (gap < 1860) below += 1;
      else above += 1;
    }
  }
  // The boundary is only pinned if the log reaches both sides of it. It does:
  // 1859 and 1860 are both consecutive-hit gaps in the corpus.
  assertEquals(below > 0 && above > 0, true, `the log walks ${below} continuing and ${above} opening gaps`);
});

Deno.test("the corpus is stated last, and it counts the whole log", async () => {
  const gt = await groundTruth();
  const { corpus, session } = await app();
  assertEquals(corpus.length, 1, "Corpus is a singleton");
  assertEquals(n(corpus[0].visits), session.length, "the corpus visit count is the visits it signalled");
  assertEquals(n(corpus[0].visits), gt.session.length);
});

Deno.test("the corpus states the log's extremes, whatever order the read answers in", async () => {
  // The read behind `state.rows.event` declares no order, so the row the fold
  // sees first is the collection's load order and nothing else. A positional
  // first-and-last read answers a reversed load with a NEGATIVE day count and
  // no refusal — the seat writes it, and `days: cel: "this >= 0"` catches
  // nothing because an all-`tab` app evaluates CEL nowhere at write time.
  const log = (await appSeed(APP)).event;
  const epochs = log.map((h) => epochOf(h.epoch));
  const first = Math.min(...epochs);
  const last = Math.max(...epochs);

  const ends: Record<string, Row> = {};
  for (const [order, rows] of [["as loaded", log], ["reversed", [...log].reverse()]] as const) {
    const m = await mountApp({
      appDir: APP,
      screen: "sessions",
      tables: { ...(await empties()), event: rows.map((r) => ({ ...r })) },
      seed: 1,
    });
    await m.settle();
    ends[order] = { ...m.rows("corpus")[0] };
    assertEquals(
      m.rows("fold").filter((r) => txt(r.error) !== "").map((r) => txt(r.error)),
      [],
      `${order}: the fold refused`,
    );
    await m.stop();
  }
  for (const [order, row] of Object.entries(ends)) {
    assertEquals(epochOf(row.first_epoch), first, `${order}: the corpus's first hit`);
    assertEquals(epochOf(row.last_epoch), last, `${order}: the corpus's last hit`);
    assertEquals(n(row.days) > 0, true, `${order}: ${n(row.days)} local days`);
  }
  assertEquals(ends["reversed"], ends["as loaded"], "the same log in two load orders is the same corpus");
});
