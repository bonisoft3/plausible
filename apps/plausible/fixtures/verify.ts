#!/usr/bin/env -S deno run --no-lock --allow-sys --allow-read --allow-run=mise
//
// verify — the fixture's properties, computed rather than asserted.
//
//   cd apps/plausible && mise exec -- deno run --no-lock --allow-sys \
//     --allow-read --allow-run=mise fixtures/verify.ts
//
// Run by hand, like the generator. tests/fixture.test.ts (PLAN.md stage 1) is
// what makes these properties a gate; this file is what makes them a transcript,
// and it is the evidence the fixture ships with. Every line it prints is
// derived from fixtures/events.json — never from the generator, whose
// intentions are exactly what is under test.
//
// Two witnesses are external to this author: DuckDB's ICU, which is a real tz
// database, and the six transcribed vendor cohorts, whose numbers the vendor
// publishes and executes.

import {
  civilFromDays,
  dayKey,
  daysFromCivil,
  gridOf,
  hourKey,
  isoDate,
  localMidnight,
  localParts,
  mondayKey,
  nextHour,
  offsetAt,
  utcDayKey,
  weekdayOf,
  ZONES,
} from "./clock.ts";
import {
  AS_OF,
  aggregate,
  buckets,
  Cfg,
  Ev,
  FILTER_SETS,
  parseLog,
  grid,
  LEGAL,
  Metric,
  Range,
  RANGES,
  RULE,
  SUMMED,
  windowOf,
  world,
  World,
  WRONG,
} from "./engine.ts";

const HERE = new URL(".", import.meta.url);
const APP = new URL("../", import.meta.url).pathname;
const read = async (n: string) => await Deno.readTextFile(new URL(n, HERE));
const sha256 = async (body: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

let failures = 0;
const ok = (pass: boolean, line: string) => {
  if (!pass) failures += 1;
  console.log(`  ${pass ? "ok  " : "FAIL"}  ${line}`);
};
const head = (n: string) => console.log(`\n${"=".repeat(76)}\n${n}\n${"=".repeat(76)}`);

async function duck(sql: string): Promise<Record<string, unknown>[]> {
  const { code, stdout, stderr } = await new Deno.Command("mise", {
    args: ["exec", "--", "duckdb", "-json", "-c", sql],
    cwd: APP,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const err = new TextDecoder().decode(stderr);
  if (code !== 0) throw new Error(`duckdb exit ${code}: ${err}`);
  return JSON.parse(new TextDecoder().decode(stdout));
}

// ---------------------------------------------------------------------------
head("1 · the artifact");
// ---------------------------------------------------------------------------

const eventsText = await read("events.json");
const log: Ev[] = parseLog(eventsText);
const bytes = new TextEncoder().encode(eventsText).length;
const digest = [...new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(eventsText)),
)].map((b) => b.toString(16).padStart(2, "0")).join("");
const stated = (await read("events.sha256")).split(/\s+/)[0];

console.log(`  events.json      ${log.length} rows, ${bytes} bytes (${(bytes / 1024).toFixed(1)} KiB)`);
console.log(`  sha256           ${digest}`);
ok(digest === stated, `events.sha256 matches the file it names`);
ok(log.length === 1200, `1200 rows (ORACLE §1.1)`);

const sorted = log.every((e, i) =>
  i === 0 || e.epoch > log[i - 1].epoch || (e.epoch === log[i - 1].epoch && e.id > log[i - 1].id)
);
ok(sorted, `sorted by (epoch, id)`);
ok(
  log.every((e) => Object.keys(e).join(",") === "id,epoch,visitor,name,interactive,pathname,source,browser"),
  `eight columns, in the stated order, on every row`,
);

const names = { pageview: 0, engagement: 0, signup: 0 } as Record<string, number>;
for (const e of log) names[e.name] += 1;
console.log(`  name split       ${JSON.stringify(names)}`);
ok(
  names.pageview === 750 && names.engagement === 350 && names.signup === 100,
  `750 pageview · 350 engagement · 100 signup`,
);

const W = world(log, RULE);
const visitors = new Set(log.map((e) => e.visitor));
console.log(`  derived          ${W.visits.length} visits, ${visitors.size} distinct visitors`);
ok(W.visits.length === 400, `400 visits under the 1860 rule`);
ok(visitors.size === 251, `251 distinct visitors`);

const days = [...new Set(log.map((e) => dayKey(e.epoch)))].sort();
console.log(`  local days       ${days.length}: ${days[0]} … ${days[days.length - 1]}`);
ok(days.length === 35, `35 local days`);
ok(
  new Set(log.map((e) => e.pathname)).size === 12 &&
    new Set(log.map((e) => e.source)).size === 9 &&
    new Set(log.map((e) => e.browser)).size === 5,
  `12 pathnames · 9 sources · 5 browsers`,
);

// The oracle's own reader must see the same file.
const dback = await duck(
  `select count(*) n,
          min(floor(epoch(strptime(epoch, '%Y-%m-%dT%H:%M:%S.%fZ'))))::bigint lo,
          max(floor(epoch(strptime(epoch, '%Y-%m-%dT%H:%M:%S.%fZ'))))::bigint hi
     from read_json('fixtures/events.json', columns = {
       id: 'VARCHAR', epoch: 'VARCHAR', visitor: 'VARCHAR', name: 'VARCHAR',
       interactive: 'BOOLEAN', pathname: 'VARCHAR', source: 'VARCHAR', browser: 'VARCHAR'
     });`,
);
console.log(`  read_json        ${JSON.stringify(dback[0])}`);
ok(dback[0].n === 1200, `DuckDB reads the committed file directly, 1200 rows`);
ok(
  dback[0].lo === log[0].epoch && dback[0].hi === log[log.length - 1].epoch,
  `DuckDB reads the log's two ends as the same UTC seconds this side does`,
);

// ---------------------------------------------------------------------------
head("2 · every window epoch, resolved to a civil time — computed, not asserted");
// ---------------------------------------------------------------------------

const claims: [string, number, string][] = [
  ["the log's first hit", log[0].epoch, "2026-03-05 00:00:00 +01:00 Thu"],
  ["the clock moves forward (−1s)", 1774745999, "2026-03-29 01:59:59 +01:00 Sun"],
  ["the clock moves forward", 1774746000, "2026-03-29 03:00:00 +02:00 Sun"],
  ["the log's last hit", log[log.length - 1].epoch, "2026-04-08 14:19:00 +02:00 Wed"],
  ["as_of_epoch", AS_OF, "2026-04-08 14:20:00 +02:00 Wed"],
  ["day from", windowOf("day", RULE)[0], "2026-04-08 00:00:00 +02:00 Wed"],
  ["7d from", windowOf("7d", RULE)[0], "2026-04-02 00:00:00 +02:00 Thu"],
  ["28d from", windowOf("28d", RULE)[0], "2026-03-12 00:00:00 +01:00 Thu"],
  ["custom_21d from", windowOf("custom_21d", RULE)[0], "2026-03-15 00:00:00 +01:00 Sun"],
  ["custom_21d to", windowOf("custom_21d", RULE)[1], "2026-04-05 00:00:00 +02:00 Sun"],
  ["custom_dst_day from", windowOf("custom_dst_day", RULE)[0], "2026-03-29 00:00:00 +01:00 Sun"],
  ["custom_dst_day to", windowOf("custom_dst_day", RULE)[1], "2026-03-30 00:00:00 +02:00 Mon"],
  ["zone z-cet-2025", 1761440400, "2025-10-26 02:00:00 +01:00 Sun"],
  ["zone z-cest-2026", 1774746000, "2026-03-29 03:00:00 +02:00 Sun"],
  ["zone z-cet-2026 (−1s)", 1792889999, "2026-10-25 02:59:59 +02:00 Sun"],
  ["zone z-cet-2026", 1792890000, "2026-10-25 02:00:00 +01:00 Sun"],
];

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const p2 = (n: number) => String(n).padStart(2, "0");
const civil = (e: number) => {
  const p = localParts(e);
  const off = offsetAt(e);
  return `${isoDate(p.y, p.m, p.d)} ${p2(p.hour)}:${p2(p.minute)}:${p2(p.second)} ` +
    `+${p2(Math.floor(off / 3600))}:00 ${WD[weekdayOf(e)]}`;
};

// The same seventeen instants, read by a real tz database that this author did
// not write. A `Zone` row that is wrong fails here and nowhere later.
const icu = await duck(
  `select e,
          strftime(to_timestamp(e) AT TIME ZONE 'Europe/Berlin', '%Y-%m-%d %H:%M:%S') as s,
          (epoch(to_timestamp(e) AT TIME ZONE 'Europe/Berlin') - e)::bigint as offs,
          strftime(to_timestamp(e) AT TIME ZONE 'Europe/Berlin', '%a') as wd
     from (values ${claims.map(([, e]) => `(${e})`).join(",")}) t(e);`,
);
const icuAt = new Map(icu.map((r) => [Number(r.e), r]));

console.log(`  ${"instant".padEnd(31)} ${"epoch".padEnd(11)} ${"Zone rows".padEnd(31)} tzdata (DuckDB ICU)`);
for (const [label, e, want] of claims) {
  const mine = civil(e);
  const r = icuAt.get(e)!;
  const theirs = `${r.s} +${p2(Math.floor(Number(r.offs) / 3600))}:00 ${r.wd}`;
  console.log(`  ${label.padEnd(31)} ${String(e).padEnd(11)} ${mine.padEnd(31)} ${theirs}`);
  ok(mine === want && mine === theirs, `${label}: documents ≡ Zone rows ≡ tzdata`);
}

// The table opens at its first row and has nothing before it. One second
// earlier is not a wrong offset, it is no offset, and asking raises — which is
// what makes `greatest starts_epoch <= epoch` the rule being exercised rather
// than a description of one.
{
  let raised = false;
  try {
    offsetAt(1761440399);
  } catch {
    raised = true;
  }
  const before = await duck(
    `select (epoch(to_timestamp(1761440399) AT TIME ZONE 'Europe/Berlin') - 1761440399)::bigint as offs;`,
  );
  ok(raised, `one second before z-cet-2025 the Zone table raises rather than guessing`);
  ok(
    Number(before[0].offs) === 7200,
    `tzdata reads +02:00 there, so the row's boundary is exactly where it says (${
      Number(before[0].offs)
    } s)`,
  );
  ok(
    ZONES[0].starts_epoch < log[0].epoch,
    `the table opens ${ZONES[0].starts_epoch} < the log's first hit ${log[0].epoch}, so every hit resolves`,
  );
  ok(
    ZONES[2].starts_epoch > log[log.length - 1].epoch,
    `the third row (${ZONES[2].starts_epoch}) is after the last hit — it is what makes the <= bound load-bearing`,
  );
  const lastRow = ZONES[ZONES.length - 1].offset_seconds;
  const widest = Math.max(...ZONES.map((z) => z.offset_seconds));
  ok(
    offsetAt(1774821599) !== lastRow && offsetAt(1774738800) !== widest,
    `neither a lookup taking the last row (+${lastRow}) nor one taking the widest offset (+${widest}) agrees with it`,
  );
}

// ---------------------------------------------------------------------------
head("3 · the clock change is interior, and its local day has 23 hours");
// ---------------------------------------------------------------------------

const FWD = 1774746000;
const [dFrom, dTo] = windowOf("custom_dst_day", RULE);
ok(log[0].epoch < FWD && FWD < log[log.length - 1].epoch, `the log opens before the change and closes after it`);
ok(dFrom < FWD && FWD < dTo, `the change is strictly inside custom_dst_day [${dFrom}, ${dTo})`);
ok(dayKey(FWD) === "2026-03-29", `the change falls on 2026-03-29, the day the hard case names`);
console.log(
  `  interior by      ${((FWD - log[0].epoch) / 86400).toFixed(2)} local-ish days after the first hit, ` +
    `${((log[log.length - 1].epoch - FWD) / 86400).toFixed(2)} before the last`,
);

const dstSpan = dTo - dFrom;
ok(dstSpan === 82800, `the local day is ${dstSpan} s = ${dstSpan / 3600} hours (not 86400)`);
const dstHours = gridOf(dFrom, dTo, "hour");
ok(dstHours.length === 23, `23 hour buckets: ${dstHours[0]} … ${dstHours[dstHours.length - 1]}`);
ok(!dstHours.includes("2026-03-29 02"), `local hour 02 is absent from the grid, not empty in it`);
ok(
  log.every((e) => hourKey(e.epoch) !== "2026-03-29 02"),
  `no hit in the log carries local hour 2026-03-29 02`,
);
let raised = false;
try {
  const { localEpoch } = await import("./clock.ts");
  localEpoch(2026, 3, 29, 2, 30);
} catch {
  raised = true;
}
ok(raised, `asking the calendar for 2026-03-29 02:30 local raises rather than sliding`);

const icuSpan = await duck(
  `select (epoch(timestamp '2026-03-30 00:00:00' AT TIME ZONE 'Europe/Berlin')
         - epoch(timestamp '2026-03-29 00:00:00' AT TIME ZONE 'Europe/Berlin'))::bigint span;`,
);
ok(Number(icuSpan[0].span) === 82800, `tzdata agrees the day is 82800 s long`);

// ---------------------------------------------------------------------------
head("4 · no two ranges cover the same window");
// ---------------------------------------------------------------------------

console.log(`  ${"range".padEnd(15)} ${"from".padEnd(11)} ${"to".padEnd(11)} ${"seconds".padEnd(9)} local`);
const wins = new Map<Range, [number, number]>();
for (const r of RANGES) {
  const [f, t] = windowOf(r, RULE);
  wins.set(r, [f, t]);
  console.log(
    `  ${r.padEnd(15)} ${String(f).padEnd(11)} ${String(t).padEnd(11)} ${String(t - f).padEnd(9)}` +
      ` ${civil(f).slice(0, 16)} → ${civil(t).slice(0, 16)}`,
  );
}
for (const a of RANGES) {
  for (const b of RANGES) {
    if (a >= b) continue;
    const [af, at_] = wins.get(a)!;
    const [bf, bt] = wins.get(b)!;
    ok(af !== bf || at_ !== bt, `${a} and ${b} are different intervals`);
  }
}
const c21 = wins.get("custom_21d")!;
ok(c21[1] - c21[0] === 1810800, `custom_21d is 1810800 s — exactly one hour short of 21 × 86400`);
const w28 = wins.get("28d")!;
ok(
  w28[0] < c21[0] && c21[1] < w28[1],
  `custom_21d is a strict interior subwindow of 28d (${w28[0]} < ${c21[0]}, ${c21[1]} < ${w28[1]})`,
);

// Two ranges answering identically is invisible to cardinality and to
// `expects: nonzero`, so it is checked where it lives: on the ground truth, over
// every filter set, before any app code.
const TOPLINE: (keyof ReturnType<typeof aggregate>)[] = [
  "visitors",
  "visits",
  "pageviews",
  "views_per_visit",
  "bounce_rate",
  "visit_duration",
];
let collisions = 0;
for (const a of RANGES) {
  for (const b of RANGES) {
    if (a >= b) continue;
    for (const fs of Object.keys(FILTER_SETS)) {
      const [af, at_] = wins.get(a)!;
      const [bf, bt] = wins.get(b)!;
      const x = aggregate(W, FILTER_SETS[fs], af, at_);
      const y = aggregate(W, FILTER_SETS[fs], bf, bt);
      if (TOPLINE.every((m) => x[m] === y[m])) {
        collisions += 1;
        console.log(`  FAIL  ${a} and ${b} agree on every top-line metric for filter set ${fs}`);
      }
    }
  }
}
ok(collisions === 0, `no two ranges produce the same top-line row for any declared filter set (${
  (RANGES.length * (RANGES.length - 1) / 2) * Object.keys(FILTER_SETS).length
} pairs checked)`);

// ---------------------------------------------------------------------------
head("5 · the bucket grid");
// ---------------------------------------------------------------------------

let total = 0;
console.log(`  ${"pair".padEnd(26)} ${"buckets".padEnd(8)} first          last`);
for (const [r, g] of LEGAL) {
  const b = grid(r, g, RULE);
  total += b.length;
  console.log(`  ${`${r} → ${g}`.padEnd(26)} ${String(b.length).padEnd(8)} ${b[0].padEnd(14)} ${b[b.length - 1]}`);
}
ok(total === 103, `103 buckets over the 7 legal pairs (ORACLE §2.1)`);

// ---------------------------------------------------------------------------
head("6 · the six vendor cohorts reproduce the vendor's own asserted numbers");
// ---------------------------------------------------------------------------

type Anchor = {
  id: string;
  prefix: string;
  filter: string | null;
  asserts: Record<string, number> | Record<string, number[]>[];
};
const anchorRows: Anchor[] = JSON.parse(await read("anchors.json"));

/** A cohort's own world: the vendor's case is about its rows and no others. */
const cohort = (prefix: string) => {
  const rows = log.filter((e) => e.visitor.startsWith(prefix));
  return { rows, w: world(rows, RULE) };
};

const FILTER_OF: Record<string, Parameters<typeof aggregate>[1]> = {
  "visit:source is google": { source: "is:google" },
  "event:page is /blog/why": { page: "is:/blog/why" },
};

for (const a of anchorRows) {
  const { rows, w } = cohort(a.prefix);
  const slots = a.filter === null ? {} : FILTER_OF[a.filter];
  if (Array.isArray(a.asserts)) {
    // A6: per hour bucket, [visits, visitors, visit_duration, pageviews].
    const day = dayKey(rows[0].epoch);
    const from = localMidnight(...(day.split("-").map(Number) as [number, number, number]));
    const cells = new Map<string, { visits: number; visitors: number; pageviews: number }>();
    for (const [k, c] of buckets(w, slots, "custom_dst_day", "hour")) void k, void c;
    // The cohort's own day, at hour granularity, computed directly.
    const hours = new Map<string, { visits: Set<string>; visitors: Set<string>; pv: number; dur: number }>();
    for (const v of w.visits) {
      for (const h of w.hoursOf.get(v.key)!) {
        const cell = hours.get(h) ?? { visits: new Set(), visitors: new Set(), pv: 0, dur: 0 };
        cell.visits.add(v.key);
        hours.set(h, cell);
      }
      const endCell = hours.get(hourKey(v.last))!;
      endCell.dur += v.duration;
    }
    for (const e of rows) {
      const cell = hours.get(hourKey(e.epoch))!;
      cell.visitors.add(e.visitor);
      if (e.name === "pageview") cell.pv += 1;
    }
    void cells, void from;
    for (const row of a.asserts as Record<string, number[]>[]) {
      const [hh, want] = Object.entries(row)[0];
      const c = hours.get(`${day} ${hh}`)!;
      const got = [c.visits.size, c.visitors.size, c.dur, c.pv];
      ok(
        got.join(",") === want.join(","),
        `${a.id} hour ${hh}: [visits,visitors,visit_duration,pageviews] = [${got}] (vendor asserts [${want}])`,
      );
    }
    continue;
  }
  const agg = aggregate(w, slots, 0, AS_OF);
  for (const [metric, want] of Object.entries(a.asserts)) {
    const got = agg[metric as keyof typeof agg];
    ok(got === want, `${a.id} ${metric} = ${got} (vendor asserts ${want})`);
  }
}

// ---------------------------------------------------------------------------
head("7 · the sidecar and the re-derived partition agree");
// ---------------------------------------------------------------------------

type Side = {
  visitor: string;
  ord: number;
  start_epoch: number;
  last_epoch: number;
  entry_page: string;
  exit_page: string;
  pageviews: number;
  events: number;
  bounce: boolean;
  duration: number;
  hours: string[];
};
const side: Side[] = JSON.parse(await read("sessions.json"));
ok(side.length === W.visits.length, `${side.length} sidecar visits, ${W.visits.length} re-derived`);

const sideBy = new Map(side.map((s) => [`${s.visitor}#${s.ord}`, s]));
let drift = 0;
for (const v of W.visits) {
  const s = sideBy.get(v.key);
  if (s === undefined) {
    drift += 1;
    console.log(`  FAIL  ${v.key} is in the re-derived partition and not the sidecar`);
    continue;
  }
  const same = s.start_epoch === v.start && s.last_epoch === v.last &&
    s.entry_page === v.entry_page && s.exit_page === v.exit_page &&
    s.pageviews === v.pageviews && s.events === v.events && s.bounce === v.bounce &&
    s.duration === v.duration &&
    s.hours.join(",") === W.hoursOf.get(v.key)!.join(",");
  if (!same) {
    drift += 1;
    console.log(`  FAIL  ${v.key}: sidecar ${JSON.stringify(s)} vs derived ${JSON.stringify(v)}`);
  }
}
ok(drift === 0, `every visit agrees on start, last, entry, exit, counts, bounce, duration and hours`);
const sideHours = side.reduce((n, s) => n + s.hours.length, 0);
console.log(`  SessionHour      ${sideHours} rows over ${side.length} visits`);
ok(
  W.visits.every((v) => v.entry_page !== "" && v.exit_page !== ""),
  `under the rule every visit has a pageview, so entry and exit page are never absent`,
);
ok(
  W.visits.some((v) => v.hits[0].name !== "pageview" && v.entry_page !== v.hits[0].pathname),
  `and at least one visit opens on a non-pageview, so "the first page VIEWED" is graded`,
);

// A SessionHour row with no hit in it cannot exist, and this is why: the widest
// legal gap is 1859 s, which is under an hour, so two consecutive hits can skip
// at most a boundary and never a whole hour. The claim is checked over the log
// rather than argued, because three documents state the opposite.
{
  const empty: string[] = [];
  for (const v of W.visits) {
    const held = new Set(v.hits.map((h) => hourKey(h.epoch)));
    for (const k of W.hoursOf.get(v.key)!) if (!held.has(k)) empty.push(`${v.key}@${k}`);
  }
  const widest = Math.max(
    ...W.visits.flatMap((v) => v.hits.slice(1).map((h, i) => h.epoch - v.hits[i].epoch)),
  );
  ok(
    empty.length === 0,
    `every one of the ${sideHours} SessionHour rows contains a hit of its own visit ` +
      `(widest intra-visit gap ${widest} s < 3600, so an hour cannot be skipped)`,
  );
  const spanning = W.visits.filter((v) => W.hoursOf.get(v.key)!.length > 1).length;
  console.log(
    `  ${spanning} visits span more than one local hour, up to ${
      Math.max(...W.visits.map((v) => W.hoursOf.get(v.key)!.length))
    } — which is what makes hourly visits exceed the daily figure`,
  );
}

// ---------------------------------------------------------------------------
head("8 · no column of the log is a function of another");
// ---------------------------------------------------------------------------

const COLS = ["visitor", "name", "interactive", "pathname", "source", "browser"] as const;
let functional = 0;
const witnesses: string[] = [];
for (const x of COLS) {
  for (const y of COLS) {
    if (x === y) continue;
    const seen = new Map<string, string>();
    let witness: string | null = null;
    for (const e of log) {
      const kx = String(e[x]);
      const ky = String(e[y]);
      const prev = seen.get(kx);
      if (prev === undefined) seen.set(kx, ky);
      else if (prev !== ky) {
        witness = `${x}=${kx} → ${y} is both ${prev} and ${ky}`;
        break;
      }
    }
    if (witness === null) {
      functional += 1;
      console.log(`  FAIL  ${y} is a function of ${x} over this log`);
    } else if (x === "name" && y === "interactive") witnesses.push(witness);
  }
}
ok(functional === 0, `all ${COLS.length * (COLS.length - 1)} ordered pairs are non-functional`);
console.log(`  the one that matters: ${witnesses[0]}`);

// ---------------------------------------------------------------------------
head("9 · the non-degeneracy floor: visitors < visits < pageviews, strictly");
// ---------------------------------------------------------------------------

for (const r of RANGES) {
  const [f, t] = windowOf(r, RULE);
  const a = aggregate(W, {}, f, t);
  ok(
    a.visitors < a.visits && a.visits < a.pageviews,
    `${r}: ${a.visitors} < ${a.visits} < ${a.pageviews}`,
  );
}
for (const g of ["hour", "day", "week"] as const) {
  const strict: string[] = [];
  for (const [r, gg] of LEGAL) {
    if (gg !== g) continue;
    for (const [k, c] of buckets(W, {}, r, g)) {
      if (c.visitors < c.visits && c.visits < c.pageviews) strict.push(`${k}(${c.visitors}<${c.visits}<${c.pageviews})`);
    }
  }
  ok(strict.length >= 3, `${g}: ${strict.length} strict buckets — ${strict.slice(0, 4).join(" ")}`);
}

// ---------------------------------------------------------------------------
head("10 · every plant: present, and discriminating");
// ---------------------------------------------------------------------------

type Plant = {
  case: string;
  rule: string;
  probes: { metric: Metric; filter_set: string; range: Range; grain: "hour" | "day" | "week" | null }[];
  rows: { visitors: string[]; events: string[] };
  present: (string | number)[][];
  wrong: string[];
};
const plants: Plant[] = JSON.parse(await read("plants.json"));

const byId = new Map(log.map((e) => [e.id, e]));
const worldCache = new Map<string, World>();
const worldFor = (name: string): World => {
  if (!worldCache.has(name)) {
    const cfg: Cfg = { ...RULE, ...(WRONG[name] ?? {}) };
    worldCache.set(name, world(log, cfg));
  }
  return worldCache.get(name)!;
};

const { probe } = await import("./engine.ts");

for (const p of plants) {
  console.log(`\n  ── ${p.case} — ${p.rule}`);

  // Presence: every row the manifest names is in the log.
  ok(
    p.rows.events.every((id) => byId.has(id)) && p.rows.events.length > 0,
    `${p.rows.events.length} named hits present, ${p.rows.visitors.length} named visitors`,
  );
  for (const claim of p.present) {
    const [kind, ...rest] = claim;
    let pass: boolean;
    let detail = "";
    switch (kind) {
      case "gap": {
        const [a, b, want] = rest as [string, string, number];
        const got = byId.get(b)!.epoch - byId.get(a)!.epoch;
        pass = got === want;
        detail = `gap(${a}→${b}) = ${got}`;
        break;
      }
      case "boundary-band-holds-only-this-plant": {
        // A gap in [1800, 1860) anywhere else in the log would make the delta a
        // wrong boundary produces unattributable to this plant.
        const [lo, hi, want] = rest as [number, number, number];
        const named = new Set(p.rows.events);
        const band: string[] = [];
        const stray: string[] = [];
        for (const v of W.visits) {
          for (let i = 1; i < v.hits.length; i += 1) {
            const g = v.hits[i].epoch - v.hits[i - 1].epoch;
            if (g < lo || g >= hi) continue;
            const label = `${v.hits[i - 1].id}→${v.hits[i].id}:${g}`;
            band.push(label);
            if (!named.has(v.hits[i - 1].id) || !named.has(v.hits[i].id)) stray.push(label);
          }
        }
        pass = band.length === want && stray.length === 0;
        detail = `${band.length} gap(s) in [${lo},${hi}): ${band.join(" ")}${
          stray.length ? ` — STRAY ${stray.join(" ")}` : ", all inside this plant"
        }`;
        break;
      }
      case "spans-local-hours": {
        const [who, want] = rest as [string, number];
        const hours = W.visits.filter((v) => v.visitor === who).map((v) => W.hoursOf.get(v.key)!.length);
        pass = hours.some((n) => n === want);
        detail = `${who} visit spans ${hours.join("/")} local hours`;
        break;
      }
      case "visitor-on-two-local-days": {
        const [who, ...ds] = rest as string[];
        const got = [...new Set(log.filter((e) => e.visitor === who).map((e) => dayKey(e.epoch)))].sort();
        pass = ds.every((d) => got.includes(d));
        detail = `${who} appears on ${got.join(", ")}`;
        break;
      }
      case "visit-straddles-utc-midnight": {
        const [who] = rest as string[];
        const v = W.visits.find((x) => x.visitor === who)!;
        pass = utcDayKey(v.start) !== utcDayKey(v.last) && dayKey(v.start) === dayKey(v.last);
        detail = `${who}: local ${dayKey(v.start)} throughout, UTC ${utcDayKey(v.start)} → ${utcDayKey(v.last)}`;
        break;
      }
      case "interleaved-visitor-keys": {
        const [a, b] = rest as string[];
        const va = W.visits.find((v) => v.visitor === a)!;
        const vb = W.visits.find((v) => v.visitor === b)!;
        pass = va.start < vb.start && vb.start < va.last;
        detail = `${a} [${va.start},${va.last}] interleaves ${b} [${vb.start},${vb.last}]`;
        break;
      }
      case "viewed-not-entered":
      case "entered": {
        const [who, path] = rest as string[];
        const v = W.visits.find((x) => x.visitor === who)!;
        const viewed = v.hits.some((h) => h.pathname === path);
        pass = kind === "entered" ? v.entry_page === path : viewed && v.entry_page !== path;
        detail = `${who}: entry ${v.entry_page}, viewed ${path}: ${viewed}`;
        break;
      }
      case "one-view-three-pings": {
        const [who] = rest as string[];
        const v = W.visits.find((x) => x.visitor === who)!;
        pass = v.pageviews === 1 && v.hits.filter((h) => h.name === "engagement").length === 3;
        detail = `${who}: ${v.pageviews} view, ${v.hits.length} hits, ${v.events} events, duration ${v.duration}`;
        break;
      }
      case "same-page-twice": {
        const [who] = rest as string[];
        const v = W.visits.find((x) => x.visitor === who)!;
        pass = v.pageviews === 2 && v.entry_page === v.exit_page;
        detail = `${who}: ${v.pageviews} views, both ${v.entry_page}`;
        break;
      }
      case "one-hit-visits": {
        const [want] = rest as [number];
        const n = W.visits.filter((v) => v.hits.length === 1 && v.duration === 0).length;
        pass = n >= want;
        detail = `${n} one-hit zero-duration visits in the log`;
        break;
      }
      case "last-hit-is-a-ping": {
        const [who] = rest as string[];
        const v = W.visits.find((x) => x.visitor === who)!;
        pass = v.hits[v.hits.length - 1].name === "engagement" && v.duration < v.last - v.start;
        detail = `${who}: last hit ${v.hits[v.hits.length - 1].name}, duration ${v.duration}, span ${v.last - v.start}`;
        break;
      }
      case "viewed-by": {
        const [path, want] = rest as [string, number];
        const n = W.visits.filter((v) => v.hits.some((h) => h.pathname === path)).length;
        pass = n >= want;
        detail = `${path} viewed by ${n} visits`;
        break;
      }
      case "entered-by": {
        const [path, want] = rest as [string, number];
        const n = W.visits.filter((v) => v.entry_page === path).length;
        pass = n === want;
        detail = `${path} entered by ${n} visits`;
        break;
      }
      case "divisors-diverge-by-at-least": {
        const [want] = rest as [number];
        const [f, t] = windowOf("28d", RULE);
        const a = aggregate(W, FILTER_SETS["event-1"], f, t);
        pass = a.sessions_n - a.bounce_denom >= want;
        detail = `event-1/28d: sessions_n ${a.sessions_n}, bounce_denom ${a.bounce_denom}`;
        break;
      }
      case "local-day-has-23-hours": {
        const [day] = rest as string[];
        const [y, m, d] = day.split("-").map(Number);
        const span = localMidnight(...(civilFromDays(daysFromCivil(y, m, d) + 1) as [number, number, number])) -
          localMidnight(y, m, d);
        pass = span === 82800;
        detail = `${day} is ${span} s long`;
        break;
      }
      case "no-hit-in-the-skipped-hour": {
        const [key] = rest as string[];
        pass = log.every((e) => hourKey(e.epoch) !== key);
        detail = `${key} carries 0 hits and is not a grid step`;
        break;
      }
      case "hit-in-the-hour-a-multiplied-window-start-includes": {
        const [key] = rest as string[];
        const hits = log.filter((e) => hourKey(e.epoch) === key);
        const mult = windowOf("28d", { ...RULE, windowMultiplied: true })[0];
        const real = windowOf("28d", RULE)[0];
        pass = hits.length > 0 && hits.every((h) => h.epoch >= mult && h.epoch < real);
        detail = `${hits.length} hit(s) in ${key}, inside [${mult}, ${real}) — the hour only the wrong start includes`;
        break;
      }
      case "hit-on-a-sunday": {
        const [day] = rest as string[];
        const hits = log.filter((e) => dayKey(e.epoch) === day);
        pass = hits.length > 0 && weekdayOf(hits[0].epoch) === 0;
        detail = `${day} is a ${WD[weekdayOf(hits[0].epoch)]} with ${hits.length} hits; Monday week ${
          mondayKey(hits[0].epoch)
        }`;
        break;
      }
      case "hit-whose-utc-day-precedes-its-local-day": {
        const [key] = rest as string[];
        const hits = log.filter((e) => hourKey(e.epoch) === key);
        pass = hits.length > 0 && hits.every((h) => utcDayKey(h.epoch) < dayKey(h.epoch));
        detail = `${hits.length} hit(s) in local ${key}, UTC day ${
          hits.length ? utcDayKey(hits[0].epoch) : "—"
        }`;
        break;
      }
      case "visit-open-across-the-skipped-hour": {
        const [who] = rest as string[];
        const v = W.visits.filter((x) => x.visitor === who).find((x) =>
          W.hoursOf.get(x.key)!.includes("2026-03-29 01")
        )!;
        const hours = W.hoursOf.get(v.key)!;
        pass = hours.includes("2026-03-29 01") && hours.includes("2026-03-29 03") &&
          !hours.includes("2026-03-29 02") && v.last - v.start < 1860;
        detail = `${who}: open in ${hours.join(", ")} over ${v.last - v.start} real seconds`;
        break;
      }
      case "distinct-visitors-in-the-last-300s": {
        const [want] = rest as [number];
        const n = new Set(log.filter((e) => e.epoch >= AS_OF - 300).map((e) => e.visitor)).size;
        pass = n === want;
        detail = `${n} distinct visitors in [as_of−300, as_of)`;
        break;
      }
      case "last-hit-at": {
        const [want] = rest as [number];
        pass = log[log.length - 1].epoch === want;
        detail = `last hit at ${log[log.length - 1].epoch}`;
        break;
      }
      default:
        throw new Error(`plants.json names an unknown presence claim: ${kind}`);
    }
    ok(pass, `present · ${kind}: ${detail}`);
  }

  // Discrimination: for each named wrong reading, the rule's answer and its
  // answer must differ on at least one of the case's probes. A plant on which
  // they agree everywhere is not a hard case, and the run says so by name.
  for (const name of p.wrong) {
    if (!(name in WRONG)) throw new Error(`plants.json names an unimplemented wrong reading: ${name}`);
    const lines: string[] = [];
    let differs = false;
    for (const pr of p.probes) {
      const right = probe(W, pr);
      const got = SUMMED.has(name)
        ? probe(W, pr, name as "hourly_visits_summed" | "visitors_summed")
        : probe(worldFor(name), pr);
      const at_ = `${pr.metric}(${pr.filter_set}, ${pr.range}${pr.grain ? ", " + pr.grain : ""})`;
      if (got !== right) {
        differs = true;
        lines.push(`${at_}: rule ${right} vs ${got}`);
      } else lines.push(`${at_}: both ${right}`);
    }
    ok(differs, `discriminates · ${name} — ${lines.join(" · ")}`);
  }
}

// The 24-bar and week-count readings are caught as cardinality, not value, so
// they are checked on the grid as well as through a probe.
head("11 · the cardinality-only wrong readings");
for (const [name, pair] of [
  ["twenty_four_bars", ["custom_dst_day", "hour"]],
  ["week_starts_sunday", ["custom_21d", "week"]],
  ["window_by_multiplication", ["28d", "day"]],
  ["utc_day_buckets", ["28d", "day"]],
] as [string, [Range, "hour" | "day" | "week"]][]) {
  const r = grid(pair[0], pair[1], RULE).length;
  const x = grid(pair[0], pair[1], { ...RULE, ...WRONG[name] }).length;
  ok(r !== x, `${pair[0]} → ${pair[1]}: rule gives ${r} buckets, ${name} gives ${x}`);
}

// ---------------------------------------------------------------------------
head("12 · the shape of the corpus");
// ---------------------------------------------------------------------------

const perDay = new Map<string, number>();
for (const e of log) perDay.set(dayKey(e.epoch), (perDay.get(dayKey(e.epoch)) ?? 0) + 1);
const dense = [...perDay].filter(([, n]) => n >= 80).map(([d, n]) => `${d}:${n}`);
const rest = [...perDay].filter(([, n]) => n < 80).map(([, n]) => n);
console.log(`  dense days       ${dense.join("  ")}`);
console.log(
  `  the other ${rest.length}    ${Math.min(...rest)}–${Math.max(...rest)} hits a day, ` +
    `${rest.reduce((a, b) => a + b, 0)} in total`,
);
ok(dense.length === 2, `exactly two days carry ≈90 hits, and they are the two an hour axis covers`);
ok(
  dense.every((d) => d.startsWith("2026-03-29") || d.startsWith("2026-04-08")),
  `they are 2026-03-29 and 2026-04-08`,
);

const empties = [...grid("day", "hour", RULE)].filter((k) =>
  !log.some((e) => hourKey(e.epoch) === k)
);
ok(
  empties.length > 0,
  `${empties.length} hour bucket(s) of the day range hold no hit (${empties.join(", ")}) — a bucket ` +
    `is window arithmetic, so an empty one is a row`,
);

// ---------------------------------------------------------------------------
head("13 · the generator is deterministic");
// ---------------------------------------------------------------------------
{
  const { code, stdout, stderr } = await new Deno.Command("mise", {
    args: [
      "exec", "--", "deno", "run", "--no-lock", "--allow-sys", "--allow-read",
      new URL("generate.ts", HERE).pathname, "--digest",
    ],
    cwd: APP,
    stdout: "piped",
    stderr: "piped",
  }).output();
  ok(code === 0, `a second run of the generator completes (writing nothing)`);
  if (code !== 0) console.log(new TextDecoder().decode(stderr));
  const again: Record<string, string> = JSON.parse(new TextDecoder().decode(stdout));
  for (const [name, want] of Object.entries(again)) {
    const got = await sha256(await read(name));
    ok(got === want, `${name} is byte-identical on a re-run (${got.slice(0, 16)}…)`);
  }
}

// ---------------------------------------------------------------------------
head(failures === 0 ? "GREEN — every property holds" : `RED — ${failures} properties failed`);
if (failures > 0) Deno.exit(1);
