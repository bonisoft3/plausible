#!/usr/bin/env -S deno run --no-lock --allow-sys --allow-read --allow-write
//
// generate — the hit log and its four sidecars, built once by hand.
//
//   cd apps/plausible && mise exec -- deno run --no-lock --allow-sys \
//     --allow-read --allow-write fixtures/generate.ts
//
// `--no-lock` because this is run from an app subdirectory of a repo whose root
// deno.lock these files are not part of; without it a hand run dirties it.
//
// No test ever runs this. The artifacts it writes are the fixture; this file is
// how they can be argued with. It is the only file in the app that may hold a
// real `Date` or `Intl`, and it holds neither: the calendar comes from
// fixtures/clock.ts, which is integer arithmetic over the three `Zone` rows, so
// nothing here can bake a local day into a column the app is then graded
// against reproducing.
//
// Nothing is drawn from a PRNG. Every attribute is a walk over a list at a
// stride coprime to its length — the discipline of apps/jsfb/shell/handlers/
// bench.js — because a fixture reproducible only through a generator's internal
// state is reproducible by nobody who reads it. Re-running this file on any
// machine writes the same bytes.
//
// The three quantities ORACLE.md states as integers — 1 200 hits, the
// 750/350/100 name split, and 400 visits — are asserted here, not aimed at. A
// budget that does not come out exactly raises.

import {
  backDays,
  civilFromDays,
  dayKey,
  daysFromCivil,
  hourKey,
  instantOf,
  isoDate,
  localEpoch,
  localMidnight,
  localParts,
  midnightOf,
  nextHour,
  nextMidnight,
  ZONES,
} from "./clock.ts";

const HERE = new URL(".", import.meta.url);

// ---------------------------------------------------------------------------
// 0. The window, and the vocabulary
// ---------------------------------------------------------------------------

const AS_OF = 1775650800; // 2026-04-08T14:20 local — the app's entire clock.
const FIRST_DAY = [2026, 3, 5] as const; // Thursday: mid-week, so the week rule bites.
const LAST_DAY = [2026, 4, 8] as const;
const DST_DAY = "2026-03-29"; // 23 local hours; local 02:xx does not exist.

const TOTAL_HITS = 1200;
const BUDGET = { pageview: 750, engagement: 350, signup: 100 } as const;
const TOTAL_VISITS = 400;

/** `/checkout` is last on purpose: H7 needs a page no visit ever entered on. */
const PATHS = [
  "/",
  "/pricing",
  "/blog/why",
  "/blog/how",
  "/blog/ship",
  "/docs",
  "/docs/api",
  "/about",
  "/contact",
  "/changelog",
  "/signup",
  "/checkout",
];
const ENTRY_PATHS = PATHS.slice(0, 11);
const SOURCES = [
  "direct",
  "google",
  "bing",
  "duckduckgo",
  "twitter",
  "hn",
  "reddit",
  "newsletter",
  "github",
];
const BROWSERS = ["Chrome", "Safari", "Firefox", "Edge", "Brave"];

type Name = "pageview" | "engagement" | "signup";

type Hit = {
  epoch: number;
  visitor: string;
  name: Name;
  interactive: boolean;
  pathname: string;
  source: string;
  browser: string;
};

/**
 * A visit as *constructed*. The sidecar is written from these, so it carries the
 * partition the generator intended rather than a partition re-derived by the
 * same rule the app uses — which is what makes `sidecar ≡ DuckDB` a check
 * instead of a tautology (ORACLE.md §3.3).
 */
type Visit = { visitor: string; origin: string; hits: Hit[] };

const visits: Visit[] = [];

// ---------------------------------------------------------------------------
// 1. Builders
// ---------------------------------------------------------------------------

/** Every local instant a plant names is spelled out, and raises if it is inside
 * the hour the clock skips. */
const at = (day: string, hh: number, mm: number, ss = 0): number => {
  const [y, m, d] = day.split("-").map(Number);
  return localEpoch(y, m, d, hh, mm, ss);
};

type Step =
  | { n: "pv"; t: number; path: string; source?: string }
  | { n: "eng"; t: number }
  | { n: "sig"; t: number; interactive: boolean; path?: string };

function visit(
  visitor: string,
  origin: string,
  source: string,
  browser: string,
  steps: Step[],
): Visit {
  let lastPath = "";
  const hits: Hit[] = steps.map((s) => {
    if (s.n === "pv") lastPath = s.path;
    const path = s.n === "pv" ? s.path : s.n === "sig" ? (s.path ?? lastPath) : lastPath;
    if (path === "") throw new Error(`${origin}: a non-pageview opens the visit with no path`);
    return {
      epoch: s.t,
      visitor,
      name: s.n === "pv" ? "pageview" : s.n === "eng" ? "engagement" : "signup",
      interactive: s.n === "sig" ? s.interactive : false,
      pathname: path,
      source: s.n === "pv" && s.source !== undefined ? s.source : source,
      browser,
    };
  });
  const v = { visitor, origin, hits };
  visits.push(v);
  return v;
}

// ---------------------------------------------------------------------------
// 2. The six vendor cohorts (ORACLE.md §3.5)
// ---------------------------------------------------------------------------
//
// Transcribed with the vendor's inter-hit gaps preserved exactly, each on its
// own reserved visitor-id prefix so oracle.sql can isolate it, and each wholly
// inside one local day that is neither the clock-change day nor a window edge.
// The numbers these must reproduce are the only ones in the apparatus this
// author did not compute, so nothing here may be adjusted to make a total come
// out.

const anchors: {
  id: string;
  test: string;
  cohort: string;
  prefix: string;
  filter: string | null;
  asserts: Record<string, number> | Record<string, number[]>[];
}[] = [];

{
  // A1 — "aggregates all metrics in a single query"
  const t = at("2026-03-06", 9, 0);
  visit("anc1-v1", "anchor:A1", "direct", "Chrome", [
    { n: "pv", t, path: "/" },
    { n: "pv", t: t + 1500, path: "/pricing" },
  ]);
  visit("anc1-v2", "anchor:A1", "direct", "Chrome", [{ n: "pv", t, path: "/" }]);
  anchors.push({
    id: "A1",
    test: "test/plausible_web/controllers/api/external_stats_controller/query_test.exs :: aggregates all metrics in a single query",
    cohort: "3 pageviews: v1 at +0 and +1500, v2 at +0",
    prefix: "anc1-",
    filter: null,
    asserts: {
      pageviews: 3,
      visits: 2,
      views_per_visit: 1.5,
      visitors: 2,
      bounce_rate: 50,
      visit_duration: 750,
    },
  });

  // A2 — "aggregate views_per_visit rounds to two decimal places"
  const u = at("2026-03-07", 9, 0);
  visit("anc2-v1", "anchor:A2", "direct", "Chrome", [
    { n: "pv", t: u, path: "/" },
    { n: "pv", t: u + 1500, path: "/docs" },
  ]);
  visit("anc2-v2", "anchor:A2", "direct", "Chrome", [
    { n: "pv", t: u, path: "/" },
    { n: "pv", t: u + 1500, path: "/docs" },
  ]);
  visit("anc2-v3", "anchor:A2", "direct", "Chrome", [{ n: "pv", t: u, path: "/" }]);
  anchors.push({
    id: "A2",
    test: "same file :: aggregate views_per_visit rounds to two decimal places",
    cohort: "5 pageviews: v1 at +0 and +1500, v2 at +0 and +1500, v3 at +0",
    prefix: "anc2-",
    filter: null,
    asserts: { views_per_visit: 1.67 },
  });

  // A3 — "can filter by source". The second hit names no source; `direct` is
  // how this log spells that, and the visit still matches because its source is
  // frozen at its first hit.
  const w = at("2026-03-09", 9, 0);
  visit("anc3-v1", "anchor:A3", "google", "Chrome", [
    { n: "pv", t: w, path: "/" },
    { n: "pv", t: w + 1500, path: "/docs", source: "direct" },
  ]);
  visit("anc3-v2", "anchor:A3", "direct", "Chrome", [{ n: "pv", t: w, path: "/" }]);
  anchors.push({
    id: "A3",
    test: "same file :: can filter by source",
    cohort: "3 pageviews: v1 at +0 with source=google then +1500 with none, v2 at +0 with none",
    prefix: "anc3-",
    filter: "visit:source is google",
    asserts: { pageviews: 2, visitors: 1, bounce_rate: 0, visit_duration: 1500 },
  });

  // A4 — "can filter by page". One anchor pins three of the four facts most
  // easily misread: the entry-restricted bounce divisor, the unrestricted
  // duration divisor, and hit-level page matching.
  const x = at("2026-03-10", 9, 0);
  visit("anc4-v1", "anchor:A4", "direct", "Chrome", [
    { n: "pv", t: x, path: "/" },
    { n: "pv", t: x + 1500, path: "/blog/why" },
  ]);
  visit("anc4-v2", "anchor:A4", "direct", "Chrome", [{ n: "pv", t: x, path: "/" }]);
  visit("anc4-v3", "anchor:A4", "direct", "Chrome", [{ n: "pv", t: x, path: "/blog/why" }]);
  anchors.push({
    id: "A4",
    test: "same file :: can filter by page",
    cohort:
      "4 pageviews: v1 at +0 on / then +1500 on /blog/why, v2 at +0 on /, v3 at +0 on /blog/why",
    prefix: "anc4-",
    filter: "event:page is /blog/why",
    asserts: { pageviews: 2, visitors: 2, bounce_rate: 100, visit_duration: 750 },
  });

  // A5 — the engagement rule, in two hits.
  const y = at("2026-03-13", 9, 0);
  visit("anc5-v1", "anchor:A5", "direct", "Chrome", [
    { n: "pv", t: y, path: "/" },
    { n: "eng", t: y + 3 },
  ]);
  anchors.push({
    id: "A5",
    test:
      "same file :: does not count engagement events towards the events metric; engagement events do not affect bounce rate and visit duration",
    cohort: "2 hits: a pageview at +0 and an engagement at +3",
    prefix: "anc5-",
    filter: null,
    asserts: { events: 1, bounce_rate: 100, visit_duration: 0 },
  });

  // A6 — hour smearing. v1 is open across four local hours; the vendor puts its
  // whole 12 000 s into the hour it *ended* in, which is the reading this app
  // declines (§2.1's four `departs: declined` rows).
  const z = at("2026-03-23", 0, 0);
  visit(
    "anc6-v1",
    "anchor:A6",
    "direct",
    "Chrome",
    Array.from({ length: 11 }, (_, i) => ({
      n: "pv" as const,
      t: z + i * 1200,
      path: PATHS[i % 12],
    })),
  );
  visit("anc6-v2", "anchor:A6", "direct", "Chrome", [
    { n: "pv", t: z + 65 * 60, path: "/" },
    { n: "pv", t: z + 70 * 60, path: "/docs" },
  ]);
  visit("anc6-v3", "anchor:A6", "direct", "Chrome", [
    { n: "pv", t: z + 130 * 60, path: "/" },
    { n: "pv", t: z + 140 * 60, path: "/docs" },
  ]);
  anchors.push({
    id: "A6",
    test:
      "same file :: visitors and visits are smeared across time:hour buckets but visit_duration is not",
    cohort:
      "15 pageviews in one local day: v1 every 20 min from 00:00 to 03:20, v2 at 01:05 and 01:10, v3 at 02:10 and 02:20",
    prefix: "anc6-",
    filter: null,
    asserts: [
      { "00": [1, 1, 0, 3] },
      { "01": [2, 2, 300, 5] },
      { "02": [2, 2, 600, 5] },
      { "03": [1, 1, 12000, 2] },
    ],
  });
}

// ---------------------------------------------------------------------------
// 3. The plants (ORACLE.md §4.1)
// ---------------------------------------------------------------------------
//
// Each plant is a configuration and nothing else. No plant carries a number:
// what a plant is worth is computed from the log, by two readings, at check
// time. plants.json is written from the `PLANTS` table at the bottom of this
// section, and every row of it names visitors this section actually created.

// --- H1: the session boundary is the integer 1860 -------------------------
// A consecutive walk of 1799 / 1800 / 1859 / 1860. Only the last one splits.
// Every other gap in the whole log avoids [1800, 1860), so the delta a wrong
// boundary produces is attributable to this walk and to nothing else.
{
  const t = at("2026-03-18", 10, 0);
  const walk = [0, 1799, 1799 + 1800, 1799 + 1800 + 1859];
  visit("v001", "plant:H1a", "google", "Chrome", [
    { n: "pv", t: t + walk[0], path: "/docs" },
    { n: "pv", t: t + walk[1], path: "/docs/api" },
    { n: "pv", t: t + walk[2], path: "/about" },
    { n: "pv", t: t + walk[3], path: "/contact" },
  ]);
  visit("v001", "plant:H1a", "google", "Chrome", [
    { n: "pv", t: t + walk[3] + 1860, path: "/changelog" },
  ]);

  // The 50-minute span an engagement ping holds open at its midpoint.
  const u = at("2026-03-19", 9, 0);
  visit("v002", "plant:H1b", "bing", "Safari", [
    { n: "pv", t: u, path: "/pricing" },
    { n: "eng", t: u + 1500 },
    { n: "pv", t: u + 3000, path: "/docs" },
  ]);
}

// --- H2: a visit is counted in every local hour it was open ----------------
// One on each of the two days an hour axis ever covers, because hour
// granularity is legal only for `custom_dst_day` and `day` (§2.1).
{
  const a = at(DST_DAY, 4, 10);
  visit(
    "v003",
    "plant:H2a",
    "twitter",
    "Firefox",
    Array.from({ length: 8 }, (_, i) => ({
      n: "pv" as const,
      t: a + i * 1500,
      path: PATHS[(i * 3) % 12],
    })),
  );
  const b = at("2026-04-08", 6, 10);
  visit(
    "v004",
    "plant:H2b",
    "hn",
    "Edge",
    Array.from({ length: 8 }, (_, i) => ({
      n: "pv" as const,
      t: b + i * 1500,
      path: PATHS[(i * 5) % 12],
    })),
  );
}

// --- H3: visitors are counted, not summed ---------------------------------
{
  visit("v005", "plant:H3a", "reddit", "Chrome", [
    { n: "pv", t: at("2026-03-17", 11, 0), path: "/" },
  ]);
  visit("v005", "plant:H3a", "reddit", "Chrome", [
    { n: "pv", t: at("2026-03-24", 15, 0), path: "/pricing" },
  ]);

  // One visit, one local day, two UTC days: 00:50 CET is 23:50 UTC.
  const u = at("2026-03-18", 0, 50);
  visit("v006", "plant:H3b", "google", "Safari", [
    { n: "pv", t: u, path: "/blog/why" },
    { n: "pv", t: u + 1200, path: "/blog/how" },
  ]);

  // Two visitor keys whose hits interleave. Under the rule that is two
  // visitors and two visits; §4.2 names no wrong reading for it, so it is a
  // present-only plant and plants.json says so.
  const w = at("2026-03-20", 14, 0);
  visit("v007", "plant:H3c", "direct", "Brave", [
    { n: "pv", t: w, path: "/docs" },
    { n: "pv", t: w + 900, path: "/docs/api" },
  ]);
  visit("v008", "plant:H3c", "direct", "Brave", [
    { n: "pv", t: w + 300, path: "/docs" },
    { n: "pv", t: w + 1200, path: "/docs/api" },
  ]);
}

// --- H4 and H9: the two divisors, under a page filter ----------------------
// Filter shape `event-1` is `f_page=is:/pricing`. These eight visits make the
// entering set and the viewing set differ in size by more than one and differ
// in bounce fraction, which is the whole of H4 and the whole of H9.
{
  const d = "2026-03-21";
  visit("v010", "plant:H4", "google", "Chrome", [
    { n: "pv", t: at(d, 8, 0), path: "/about" },
    { n: "pv", t: at(d, 8, 10), path: "/pricing" },
  ]);
  visit("v011", "plant:H4", "bing", "Safari", [
    { n: "pv", t: at(d, 9, 0), path: "/docs" },
    { n: "pv", t: at(d, 9, 10), path: "/pricing" },
  ]);
  visit("v012", "plant:H4", "direct", "Firefox", [{ n: "pv", t: at(d, 10, 0), path: "/pricing" }]);
  visit("v013", "plant:H4", "twitter", "Chrome", [
    { n: "pv", t: at(d, 11, 0), path: "/pricing" },
    { n: "pv", t: at(d, 11, 10), path: "/docs/api" },
  ]);
  visit("v014", "plant:H9", "direct", "Edge", [{ n: "pv", t: at(d, 12, 0), path: "/pricing" }]);
  visit("v015", "plant:H9", "google", "Safari", [
    { n: "pv", t: at(d, 13, 0), path: "/blog/why" },
    { n: "pv", t: at(d, 13, 10), path: "/pricing" },
  ]);
  visit("v016", "plant:H9", "hn", "Brave", [
    { n: "pv", t: at(d, 14, 0), path: "/blog/how" },
    { n: "pv", t: at(d, 14, 10), path: "/pricing" },
  ]);
  visit("v017", "plant:H9", "github", "Chrome", [
    { n: "pv", t: at(d, 15, 0), path: "/pricing" },
    { n: "pv", t: at(d, 15, 10), path: "/blog/ship" },
    { n: "pv", t: at(d, 15, 20), path: "/docs" },
  ]);
}

// --- H5: a view is a view, a ping is neither ------------------------------
{
  const d = "2026-03-22";
  visit("v020", "plant:H5a", "newsletter", "Chrome", [
    { n: "pv", t: at(d, 9, 0), path: "/blog/ship" },
    { n: "eng", t: at(d, 9, 10) },
    { n: "eng", t: at(d, 9, 20) },
    { n: "eng", t: at(d, 9, 30) },
  ]);
  visit("v021", "plant:H5b", "github", "Safari", [
    { n: "pv", t: at(d, 14, 0), path: "/changelog" },
    { n: "pv", t: at(d, 14, 10), path: "/changelog" },
  ]);
}

// --- H6: a visit that lasted no time still counts -------------------------
{
  const d = "2026-03-25";
  for (let i = 0; i < 12; i += 1) {
    visit(`v0${30 + i}`, "plant:H6a", SOURCES[i % 9], BROWSERS[(i * 2) % 5], [
      { n: "pv", t: at(d, 8 + i, 5), path: ENTRY_PATHS[(i * 3) % 11] },
    ]);
  }
  // The last hit is a ping, so a duration read to the last hit of any name is
  // 1 200 where the rule gives 600.
  visit("v042", "plant:H6b", "duckduckgo", "Edge", [
    { n: "pv", t: at(d, 21, 0), path: "/" },
    { n: "pv", t: at(d, 21, 10), path: "/docs" },
    { n: "eng", t: at(d, 21, 20) },
  ]);
}

// --- H7: a page viewed by several visits and entered by none --------------
{
  const d = "2026-03-26";
  visit("v050", "plant:H7", "google", "Chrome", [
    { n: "pv", t: at(d, 9, 0), path: "/pricing" },
    { n: "pv", t: at(d, 9, 10), path: "/checkout" },
  ]);
  visit("v051", "plant:H7", "direct", "Safari", [
    { n: "pv", t: at(d, 11, 0), path: "/docs" },
    { n: "pv", t: at(d, 11, 10), path: "/checkout" },
  ]);
  visit("v052", "plant:H7", "bing", "Firefox", [
    { n: "pv", t: at(d, 13, 0), path: "/" },
    { n: "pv", t: at(d, 13, 10), path: "/checkout" },
    { n: "pv", t: at(d, 13, 20), path: "/pricing" },
  ]);
}

// --- H8: buckets are cut on the site's clock ------------------------------
{
  // 2026-03-11 23:30 local sits in [1773266400, 1773270000) — the hour that a
  // 28-day window start computed as midnight(as_of) − 27 × 86400 wrongly
  // includes, and that the calendar rule excludes.
  visit("v060", "plant:H8a", "google", "Chrome", [
    { n: "pv", t: at("2026-03-11", 23, 30), path: "/pricing" },
  ]);
  // Sunday. A Sunday-start week moves it out of the 2026-03-09 bucket.
  visit("v061", "plant:H8b", "twitter", "Safari", [
    { n: "pv", t: at("2026-03-15", 12, 0), path: "/blog/why" },
  ]);
  // 2026-04-02 00:30 CEST is 2026-04-01 22:30 UTC: a UTC day cut moves it out
  // of the 7-day window entirely.
  visit("v062", "plant:H8c", "reddit", "Firefox", [
    { n: "pv", t: at("2026-04-02", 0, 30), path: "/docs" },
  ]);
  // One visit open across the hour the clock skips: local hours 01 and 03, 20
  // real minutes apart, and no hour 02 to be open in.
  visit("v063", "plant:H8d", "direct", "Chrome", [
    { n: "pv", t: at(DST_DAY, 0, 20), path: "/" },
    { n: "pv", t: at(DST_DAY, 0, 49), path: "/about" },
  ]);
  visit("v063", "plant:H8d", "direct", "Chrome", [
    { n: "pv", t: at(DST_DAY, 1, 45), path: "/contact" },
    { n: "pv", t: at(DST_DAY, 3, 5), path: "/changelog" },
  ]);
}

// --- H10: current visitors, filter-independent ----------------------------
// Inside [as_of − 300, as_of), with the log's last hit at as_of − 60. Two of
// the six are Chrome, so applying a filter set changes the count.
{
  // Offsets from the interval's own opening, so the last hit is as_of − 60 and
  // the whole burst is inside [as_of − 300, as_of).
  const burst: [string, string, number][] = [
    ["v070", "Chrome", 10],
    ["v071", "Chrome", 50],
    ["v072", "Safari", 100],
    ["v073", "Firefox", 150],
    ["v074", "Edge", 200],
    ["v075", "Brave", 240],
  ];
  for (const [who, browser, off] of burst) {
    visit(who, "plant:H10", "direct", browser, [
      { n: "pv", t: AS_OF - 300 + off, path: "/" },
    ]);
  }
}

// --- The entry page is the first page VIEWED ------------------------------
// The visit opens on a custom event at /signup and its entry page is /pricing.
{
  const d = "2026-03-27";
  visit("v080", "plant:entry-page", "hn", "Chrome", [
    { n: "sig", t: at(d, 10, 0), interactive: true, path: "/signup" },
    { n: "pv", t: at(d, 10, 10), path: "/pricing" },
  ]);
  // Attribution frozen at the first hit: the second hit names no source and the
  // visit is still a `google` visit. Outside the anchor cohorts, so the main
  // corpus grades the rule too.
  visit("v081", "plant:frozen-source", "google", "Safari", [
    { n: "pv", t: at(d, 16, 0), path: "/blog/how" },
    { n: "pv", t: at(d, 16, 10), path: "/docs", source: "direct" },
  ]);
}

// --- A visit open across a window's own opening ----------------------------
// The `day` range opens at local midnight on 2026-04-08. This visit opened
// before that midnight and was still open after it, which is the only shape that
// tells the two hourly visit readings apart: "open in that hour" counts it in the
// 00 bucket and "open in that hour AND started in this window" does not. Every
// other visit in this log lies inside one local day, so without this one the two
// readings are the same function over the fixture — which is why oracle.sql §11
// refuses a log that carries none.
{
  const t = at("2026-04-07", 23, 50);
  visit("v100", "plant:open-across-edge", "newsletter", "Firefox", [
    { n: "pv", t: t, path: "/about" },
    { n: "pv", t: t + 900, path: "/contact" },
    { n: "pv", t: t + 1500, path: "/changelog" },
  ]);
}

// --- The non-degeneracy floor, at hour granularity ------------------------
// `visitors < visits < pageviews` strictly, in three hour buckets of each of
// the two days an hour axis covers. Two visits of one visitor inside one hour
// is the only shape that makes visits exceed visitors in an hour bucket, and
// two is the most that fits: three would need 2 × 1 860 s of separation inside
// 3 600.
const NONDEG_HOURS: Record<string, number[]> = {
  [DST_DAY]: [10, 14, 18],
  "2026-04-08": [8, 10, 12],
};
{
  let who = 90;
  for (const [day, hours] of Object.entries(NONDEG_HOURS)) {
    const cohort = [`v0${who}`, `v0${who + 1}`, `v0${who + 2}`];
    who += 3;
    for (const hour of hours) {
      cohort.forEach((v, k) => {
        visit(v, `plant:nondeg-${day}`, SOURCES[k % 9], BROWSERS[k % 5], [
          { n: "pv", t: at(day, hour, 0, k * 5), path: ENTRY_PATHS[(hour + k) % 11] },
          { n: "pv", t: at(day, hour, 8, k * 5), path: PATHS[(hour + k * 5) % 12] },
        ]);
        visit(v, `plant:nondeg-${day}`, SOURCES[k % 9], BROWSERS[k % 5], [
          { n: "pv", t: at(day, hour, 40, k * 5), path: ENTRY_PATHS[(hour + k + 4) % 11] },
          { n: "pv", t: at(day, hour, 48, k * 5), path: PATHS[(hour + k * 7) % 12] },
        ]);
      });
    }
  }
}

const PLACED = visits.length;

// ---------------------------------------------------------------------------
// 4. The filler
// ---------------------------------------------------------------------------
//
// Whatever the anchors and the plants did not spend. The shape multiset is
// solved once, here, so the three stated totals come out exactly; the packing
// then only decides which day each visit lands on.

type Shape = { id: string; steps: ("pv" | "eng" | "sig")[]; count: number };

const SHAPES: Shape[] = [
  { id: "X", steps: ["pv", "eng", "pv", "eng", "pv", "sig"], count: 40 },
  { id: "S", steps: ["pv", "sig"], count: 59 },
  { id: "Z", steps: ["pv", "eng", "eng"], count: 132 },
  { id: "P3", steps: ["pv", "pv", "pv"], count: 29 },
  { id: "P4", steps: ["pv", "pv", "pv", "pv"], count: 40 },
];

/** The name split each cohort so far has spent, so the filler's is a residue. */
const spent = { pageview: 0, engagement: 0, signup: 0 };
for (const v of visits) for (const h of v.hits) spent[h.name] += 1;

{
  const want = {
    pageview: BUDGET.pageview - spent.pageview,
    engagement: BUDGET.engagement - spent.engagement,
    signup: BUDGET.signup - spent.signup,
  };
  const got = { pageview: 0, engagement: 0, signup: 0 };
  for (const s of SHAPES) {
    for (const step of s.steps) {
      got[step === "pv" ? "pageview" : step === "eng" ? "engagement" : "signup"] += s.count;
    }
  }
  for (const k of ["pageview", "engagement", "signup"] as const) {
    if (got[k] !== want[k]) {
      throw new Error(
        `filler shape multiset spends ${got[k]} ${k} where ${want[k]} is left; adjust SHAPES`,
      );
    }
  }
  const fillerVisits = SHAPES.reduce((n, s) => n + s.count, 0);
  if (PLACED + fillerVisits !== TOTAL_VISITS) {
    throw new Error(`${PLACED} placed + ${fillerVisits} filler visits is not ${TOTAL_VISITS}`);
  }
}

/** Every local day of the window, in order. */
const DAYS: string[] = (() => {
  const out: string[] = [];
  const last = daysFromCivil(LAST_DAY[0], LAST_DAY[1], LAST_DAY[2]);
  for (let d = daysFromCivil(FIRST_DAY[0], FIRST_DAY[1], FIRST_DAY[2]); d <= last; d += 1) {
    const [y, m, dd] = civilFromDays(d);
    out.push(isoDate(y, m, dd));
  }
  return out;
})();

/**
 * The two days an hour axis covers carry ≈90 hits each; the rest carry ≈31.
 * The three days trimmed to 30 are the last three, so the trim is stated rather
 * than distributed into the walk.
 */
const DENSE = [DST_DAY, "2026-04-08"];
const dayTarget: Record<string, number> = {};
{
  const normal = DAYS.filter((d) => !DENSE.includes(d));
  const forNormal = TOTAL_HITS - DENSE.length * 90;
  const base = Math.floor(forNormal / normal.length);
  const short = normal.length * (base + 1) - forNormal;
  normal.forEach((d, i) => (dayTarget[d] = i >= normal.length - short ? base : base + 1));
  for (const d of DENSE) dayTarget[d] = 90;
  const total = DAYS.reduce((n, d) => n + dayTarget[d], 0);
  if (total !== TOTAL_HITS) throw new Error(`day targets sum to ${total}, not ${TOTAL_HITS}`);
}

/** What the anchors and plants already put on each day. */
const placedPerDay: Record<string, number> = {};
for (const d of DAYS) placedPerDay[d] = 0;
for (const v of visits) {
  for (const h of v.hits) {
    const k = dayKey(h.epoch);
    if (!(k in placedPerDay)) throw new Error(`a placed hit falls on ${k}, outside the window`);
    placedPerDay[k] += 1;
  }
}

/**
 * Which shapes each day gets. An exact partition of the day's remaining hits
 * over the remaining shape sizes — searched, and it raises rather than leaving a
 * day short, because a day quietly one hit light is a fixture that no longer
 * matches the totals the documents assert.
 */
const perDayShapes: Record<string, string[]> = {};
{
  const left = new Map(SHAPES.map((s) => [s.id, s.count]));
  const size = new Map(SHAPES.map((s) => [s.id, s.steps.length]));
  const order = SHAPES.map((s) => s.id);

  // Candidates in descending order of the hits they still have to place, so a
  // day drains every shape class in proportion and the last days are not left
  // holding only 6-hit visits for a 31-hit quota. The rotation is a tiebreak
  // only, so consecutive days do not open with the same shape.
  const partition = (need: number, pool: Map<string, number>, rot: number): string[] | null => {
    if (need === 0) return [];
    const cands = order
      .filter((id) => pool.get(id)! > 0 && size.get(id)! <= need)
      .map((id, i) => ({ id, mass: pool.get(id)! * size.get(id)!, i }))
      .sort((a, b) => b.mass - a.mass || ((a.i + rot) % order.length) - ((b.i + rot) % order.length));
    for (const { id } of cands) {
      const n = pool.get(id)!;
      pool.set(id, n - 1);
      const rest = partition(need - size.get(id)!, pool, rot + 1);
      pool.set(id, n);
      if (rest !== null) return [id, ...rest];
    }
    return null;
  };

  DAYS.forEach((d, i) => {
    const need = dayTarget[d] - placedPerDay[d];
    if (need < 0) throw new Error(`${d} already holds ${placedPerDay[d]} hits, over its ${dayTarget[d]}`);
    const pick = partition(need, left, i);
    if (pick === null) throw new Error(`no exact filler partition for ${d}: ${need} hits left`);
    for (const id of pick) left.set(id, left.get(id)! - 1);
    perDayShapes[d] = pick;
  });
  for (const [id, n] of left) if (n !== 0) throw new Error(`${n} unplaced ${id} filler visits`);
}

/**
 * Inter-hit gaps. Every value is outside [1800, 1860), so H1's walk is the only
 * place in the log where a wrong session boundary can change the partition, and
 * the delta it produces is therefore attributable. The per-length lists keep
 * every visit's span under 3 000 s, so a visit started in the last allowed hour
 * still ends inside its own local day.
 */
const GAPS: Record<number, number[]> = {
  2: [240, 420, 600, 780, 960, 1140, 1320, 1500, 1740],
  3: [240, 420, 600, 780, 960, 1140, 1320, 1500],
  4: [240, 420, 600, 780, 960],
  6: [240, 420, 600],
};

/** Start hours. The last hours of a day are excluded so no filler visit spills
 * across local midnight; 2026-04-08 stops at 12 because the log ends at 14:19,
 * which leaves hour 13 of the `day` range an empty bucket on purpose. */
const startHours = (day: string): number[] => {
  const hours: number[] = [];
  const end = day === "2026-04-08" ? 12 : 22;
  for (let e = localMidnight(...(day.split("-").map(Number) as [number, number, number]));;) {
    const p = localParts(e);
    if (p.hour > end) break;
    hours.push(p.hour);
    const next = nextHour(e);
    if (dayKey(next) !== day) break;
    e = next;
  }
  return hours;
};

const GENERIC = Array.from({ length: 184 }, (_, i) => `v${String(102 + i).padStart(3, "0")}`);
let cursor = 0;
let fillerIndex = 0;

for (const day of DAYS) {
  const hours = startHours(day);
  const shapes = perDayShapes[day];

  // Placed first, sorted, so the day's earliest visit is the one a later visit
  // reuses the visitor of — a reuse is what makes a day's visits outnumber its
  // visitors, and it must not land within 1 860 s of what it reuses.
  const draft = shapes.map((id, j) => {
    const shape = SHAPES.find((s) => s.id === id)!;
    const i = fillerIndex + j;
    const hour = hours[(i * 7) % hours.length];
    const gap = GAPS[shape.steps.length][(i * 3) % GAPS[shape.steps.length].length];
    return { shape, i, start: at(day, hour, (i * 13) % 55), gap };
  });
  fillerIndex += shapes.length;
  draft.sort((a, b) => a.start - b.start || a.i - b.i);

  const firstVisitor = GENERIC[cursor % GENERIC.length];
  draft.forEach((v, j) => {
    const reuse = j >= 3 && j % 3 === 2;
    const who = reuse ? firstVisitor : GENERIC[cursor++ % GENERIC.length];
    let pvSeen = 0;
    const steps: Step[] = v.shape.steps.map((s, k) => {
      const t = v.start + k * v.gap;
      if (s === "pv") {
        const path = pvSeen === 0
          ? ENTRY_PATHS[(v.i * 5) % 11]
          : PATHS[(v.i * 5 + pvSeen * 3) % 12];
        pvSeen += 1;
        return { n: "pv", t, path };
      }
      if (s === "eng") return { n: "eng", t };
      return { n: "sig", t, interactive: v.i % 2 === 0 };
    });
    visit(who, "filler", SOURCES[v.i % 9], BROWSERS[(v.i * 2) % 5], steps);
  });
}

// ---------------------------------------------------------------------------
// 5. The invariants the construction owes
// ---------------------------------------------------------------------------
//
// These are not the fixture's properties — verify.ts proves those from
// events.json alone. These are the four things that must hold for the log to be
// a log at all, and the generator refuses to write a file that breaks one.

{
  const byVisitor = new Map<string, Visit[]>();
  for (const v of visits) {
    if (v.hits.length === 0) throw new Error(`${v.origin}: a visit with no hits`);
    for (let i = 1; i < v.hits.length; i += 1) {
      const gap = v.hits[i].epoch - v.hits[i - 1].epoch;
      if (gap <= 0) throw new Error(`${v.origin}/${v.visitor}: hits out of order (gap ${gap})`);
      if (gap >= 1860) {
        throw new Error(`${v.origin}/${v.visitor}: gap ${gap} inside a constructed visit`);
      }
    }
    const list = byVisitor.get(v.visitor) ?? [];
    list.push(v);
    byVisitor.set(v.visitor, list);
  }
  for (const [who, list] of byVisitor) {
    list.sort((a, b) => a.hits[0].epoch - b.hits[0].epoch);
    for (let i = 1; i < list.length; i += 1) {
      const gap = list[i].hits[0].epoch - list[i - 1].hits.at(-1)!.epoch;
      if (gap < 1860) {
        throw new Error(
          `${who}: consecutive visits ${gap}s apart (${list[i - 1].origin} → ${list[i].origin}) — the 1860 rule would join them`,
        );
      }
    }
  }
  for (const v of visits) {
    const entry = v.hits.find((h) => h.name === "pageview");
    if (entry === undefined) throw new Error(`${v.origin}/${v.visitor}: a visit with no pageview`);
    if (entry.pathname === "/checkout") {
      throw new Error(`${v.origin}/${v.visitor}: entered on /checkout, which H7 forbids`);
    }
  }
  const opens = localMidnight(FIRST_DAY[0], FIRST_DAY[1], FIRST_DAY[2]);
  for (const v of visits) {
    for (const h of v.hits) {
      if (h.epoch < opens) throw new Error(`${v.origin}: hit at ${h.epoch} before the window opens`);
      if (h.epoch >= AS_OF) throw new Error(`${v.origin}: hit at ${h.epoch} at or after as_of`);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Emit
// ---------------------------------------------------------------------------

/** Sorted by (epoch, construction order); the id is then assigned in that order,
 * so `order by epoch, id` is the file's own order on every reader. */
const flat: { hit: Hit; visit: Visit; built: number }[] = [];
visits.forEach((v) =>
  v.hits.forEach((hit) => flat.push({ hit, visit: v, built: flat.length }))
);
flat.sort((a, b) => a.hit.epoch - b.hit.epoch || a.built - b.built);

if (flat.length !== TOTAL_HITS) throw new Error(`${flat.length} hits, not ${TOTAL_HITS}`);

const ids = new Map<Hit, string>();
const events = flat.map(({ hit }, i) => {
  const id = `e${String(i + 1).padStart(4, "0")}`;
  ids.set(hit, id);
  return {
    id,
    epoch: hit.epoch,
    visitor: hit.visitor,
    name: hit.name,
    interactive: hit.interactive,
    pathname: hit.pathname,
    source: hit.source,
    browser: hit.browser,
  };
});

{
  const tally = { pageview: 0, engagement: 0, signup: 0 } as Record<Name, number>;
  for (const e of events) tally[e.name] += 1;
  for (const k of ["pageview", "engagement", "signup"] as const) {
    if (tally[k] !== BUDGET[k]) throw new Error(`${tally[k]} ${k} hits, not ${BUDGET[k]}`);
  }
}

/** The sidecar: the partition the generator *intended*, by construction — the
 * one witness of the three fixture.test.ts compares that never re-reads
 * events.json. No entity declares a table for it and nothing in the app can
 * reach it. */
const perVisitorOrd = new Map<string, number>();
const sessions = visits
  .slice()
  .sort((a, b) =>
    a.visitor < b.visitor ? -1 : a.visitor > b.visitor ? 1 : a.hits[0].epoch - b.hits[0].epoch
  )
  .map((v) => {
    const ord = (perVisitorOrd.get(v.visitor) ?? 0) + 1;
    perVisitorOrd.set(v.visitor, ord);
    const views = v.hits.filter((h) => h.name === "pageview");
    const lastReal = v.hits.filter((h) => h.name !== "engagement").at(-1)!;
    // Open from the first hit to the last of any name: a ping holds the visit
    // open, so it holds the hour open too.
    const last = v.hits.at(-1)!.epoch;
    const hours: string[] = [];
    for (let e = v.hits[0].epoch;; e = nextHour(e)) {
      const k = hourKey(e);
      if (hours.at(-1) !== k) hours.push(k);
      if (nextHour(e) > last) break;
    }
    return {
      visitor: v.visitor,
      ord,
      start_epoch: v.hits[0].epoch,
      last_epoch: v.hits.at(-1)!.epoch,
      entry_page: views[0].pathname,
      exit_page: views.at(-1)!.pathname,
      pageviews: views.length,
      events: v.hits.filter((h) => h.name !== "engagement").length,
      bounce: views.length === 1 && !v.hits.some((h) => h.interactive),
      duration: lastReal.epoch - v.hits[0].epoch,
      // Frozen at the first hit, and carried here so the rule has a second
      // witness: every visit-scoped filter reads these two columns, and without
      // them fixture.test.ts compares the visit's identity and not where it
      // came from.
      source: v.hits[0].source,
      browser: v.hits[0].browser,
      hours,
    };
  });

// The plant manifest. A configuration and a pair of name lists per case; never
// a number, because a number here would be a golden value by another route.
const idsOf = (origin: string) =>
  flat.filter(({ visit: v }) => v.origin === origin).map(({ hit }) => ids.get(hit)!);
const whoOf = (origin: string) => [
  ...new Set(visits.filter((v) => v.origin === origin).map((v) => v.visitor)),
];

const gapsOf = (origin: string) => {
  const out: [string, string, string, number][] = [];
  for (const v of visits.filter((v) => v.origin === origin)) {
    for (let i = 1; i < v.hits.length; i += 1) {
      out.push([
        "gap",
        ids.get(v.hits[i - 1])!,
        ids.get(v.hits[i])!,
        v.hits[i].epoch - v.hits[i - 1].epoch,
      ]);
    }
  }
  return out;
};

type Probe = {
  metric: string;
  filter_set: string;
  range: string;
  grain: string | null;
  panel: string | null;
  dim_value: string | null;
};

type Plant = {
  case: string;
  rule: string;
  /** Where the case is read off. More than one because a case's named wrong
   * readings need not all bite on the same number: H8's four each change a
   * bucket *count* on a different legal pair, which is why they are caught as
   * cardinality (ORACLE §2.1), and H9's changes the two averages and not the
   * bounce rate. Each named wrong reading must differ from the rule on at least
   * one of these. */
  probes: Probe[];
  rows: { visitors: string[]; events: string[] };
  present: (string | number)[][];
  wrong: string[];
  note?: string;
};

const plants: Plant[] = [
  {
    case: "H1",
    rule: "a visit ends when the gap from its last hit reaches 1860 seconds; a hit of any name resets it",
    probes: [{ metric: "visits", filter_set: "none", range: "28d", grain: "day", panel: null, dim_value: null }],
    rows: {
      visitors: [...whoOf("plant:H1a"), ...whoOf("plant:H1b")],
      events: [...idsOf("plant:H1a"), ...idsOf("plant:H1b")],
    },
    present: [
      ...gapsOf("plant:H1a"),
      ...gapsOf("plant:H1b"),
      // The walk itself puts two gaps inside [1800, 1860) — 1800 and 1859 — and
      // nothing else in the log has one. That is what makes the delta a wrong
      // boundary produces attributable to this plant instead of to the filler.
      ["boundary-band-holds-only-this-plant", 1800, 1860, 2],
    ],
    wrong: ["gap_ge_1800", "gap_from_start", "engagement_does_not_hold"],
  },
  {
    case: "H2",
    rule: "at hour granularity a visit is counted in every local hour it was open",
    probes: [
      { metric: "visits", filter_set: "none", range: "custom_dst_day", grain: "hour", panel: null, dim_value: null },
      { metric: "session_hours", filter_set: "none", range: "28d", grain: null, panel: null, dim_value: null },
    ],
    rows: {
      visitors: [...whoOf("plant:H2a"), ...whoOf("plant:H2b")],
      events: [...idsOf("plant:H2a"), ...idsOf("plant:H2b")],
    },
    present: [["spans-local-hours", "v003", 4], ["spans-local-hours", "v004", 4]],
    wrong: ["hourly_visits_summed", "hours_from_nonengagement"],
    note:
      "the second probe is over the whole log and reads neither range nor grain, which is ORACLE §4.2's `SessionHour rows over the log`: ending a visit's open span at its last non-engagement hit moves that count and moves no window aggregate, because `visits` counts visits and not the hours they were open in.",
  },
  {
    case: "H3",
    rule: "visitors is a distinct count over the window, never a sum of the buckets'",
    probes: [{ metric: "visitors", filter_set: "none", range: "28d", grain: "day", panel: null, dim_value: null }],
    rows: {
      visitors: [...whoOf("plant:H3a"), ...whoOf("plant:H3b"), ...whoOf("plant:H3c")],
      events: [...idsOf("plant:H3a"), ...idsOf("plant:H3b"), ...idsOf("plant:H3c")],
    },
    present: [
      ["visitor-on-two-local-days", "v005", "2026-03-17", "2026-03-24"],
      ["visit-straddles-utc-midnight", "v006"],
      ["interleaved-visitor-keys", "v007", "v008"],
    ],
    wrong: ["visitors_summed"],
  },
  {
    case: "H4",
    rule: "bounce rate under a page filter is over the visits that entered a matching page",
    probes: [{ metric: "bounce_rate", filter_set: "event-1", range: "28d", grain: null, panel: null, dim_value: null }],
    rows: { visitors: whoOf("plant:H4"), events: idsOf("plant:H4") },
    present: [["viewed-not-entered", "v010", "/pricing"], ["viewed-not-entered", "v011", "/pricing"], ["entered", "v012", "/pricing"], ["entered", "v013", "/pricing"]],
    wrong: ["bounce_on_viewed_page"],
  },
  {
    case: "H5",
    rule: "pageviews counts hits named pageview; events counts every hit except engagement",
    probes: [{ metric: "events", filter_set: "none", range: "28d", grain: null, panel: null, dim_value: null }],
    rows: {
      visitors: [...whoOf("plant:H5a"), ...whoOf("plant:H5b")],
      events: [...idsOf("plant:H5a"), ...idsOf("plant:H5b")],
    },
    present: [["one-view-three-pings", "v020"], ["same-page-twice", "v021"]],
    wrong: ["events_count_every_hit"],
  },
  {
    case: "H6",
    rule: "visit duration is the last non-engagement hit minus the first, over all matching visits",
    probes: [{ metric: "visit_duration", filter_set: "none", range: "28d", grain: null, panel: null, dim_value: null }],
    rows: {
      visitors: [...whoOf("plant:H6a"), ...whoOf("plant:H6b")],
      events: [...idsOf("plant:H6a"), ...idsOf("plant:H6b")],
    },
    present: [["one-hit-visits", 12], ["last-hit-is-a-ping", "v042"]],
    wrong: ["duration_drops_zero", "duration_includes_engagement"],
  },
  {
    case: "H7",
    rule: "an event-dimension filter matches hits and then answers about their visits",
    probes: [{ metric: "visits", filter_set: "unentered", range: "28d", grain: null, panel: null, dim_value: null }],
    rows: { visitors: whoOf("plant:H7"), events: idsOf("plant:H7") },
    present: [["viewed-by", "/checkout", 3], ["entered-by", "/checkout", 0]],
    wrong: ["visit_row_filtered_on_page"],
  },
  {
    case: "H8",
    rule: "buckets are cut on the site's clock and read in UTC; N days back is N calendar days back",
    // All four of H8's wrong readings change a bucket *count*, each on a
    // different legal pair, so the case is graded on cardinality. The fifth
    // probe is the one value-level one: only a multiplied window start moves
    // the 28-day window, and the hour it wrongly admits holds a hit.
    probes: [
      { metric: "bucket_count", filter_set: "none", range: "custom_dst_day", grain: "hour", panel: null, dim_value: null },
      { metric: "bucket_count", filter_set: "none", range: "custom_21d", grain: "week", panel: null, dim_value: null },
      { metric: "bucket_count", filter_set: "none", range: "28d", grain: "day", panel: null, dim_value: null },
      { metric: "visitors", filter_set: "none", range: "28d", grain: "day", panel: null, dim_value: null },
    ],
    rows: {
      visitors: [...whoOf("plant:H8a"), ...whoOf("plant:H8b"), ...whoOf("plant:H8c"), ...whoOf("plant:H8d")],
      events: [...idsOf("plant:H8a"), ...idsOf("plant:H8b"), ...idsOf("plant:H8c"), ...idsOf("plant:H8d")],
    },
    present: [
      ["local-day-has-23-hours", DST_DAY],
      ["no-hit-in-the-skipped-hour", `${DST_DAY} 02`],
      ["hit-in-the-hour-a-multiplied-window-start-includes", "2026-03-11 23"],
      ["hit-on-a-sunday", "2026-03-15"],
      ["hit-whose-utc-day-precedes-its-local-day", "2026-04-02 00"],
      ["visit-open-across-the-skipped-hour", "v063"],
    ],
    wrong: ["utc_day_buckets", "week_starts_sunday", "window_by_multiplication", "twenty_four_bars"],
  },
  {
    case: "H9",
    rule: "views per visit and visit duration divide by the matching visits; bounce rate does not",
    probes: [
      { metric: "views_per_visit", filter_set: "event-1", range: "28d", grain: null, panel: null, dim_value: null },
      { metric: "visit_duration", filter_set: "event-1", range: "28d", grain: null, panel: null, dim_value: null },
    ],
    rows: { visitors: whoOf("plant:H9"), events: idsOf("plant:H9") },
    present: [["divisors-diverge-by-at-least", 2]],
    wrong: ["one_divisor_for_both"],
    note:
      "graded on the two averages, not on the bounce rate: reusing the entry-restricted divisor for all three is what 'one divisor' means, and the bounce rate is the one number it leaves alone. H4 is the other direction.",
  },
  {
    case: "H10",
    rule: "current visitors is [as_of − 300, as_of) and ignores every filter",
    probes: [{ metric: "current_visitors", filter_set: "visit-1", range: "day", grain: null, panel: null, dim_value: null }],
    rows: { visitors: whoOf("plant:H10"), events: idsOf("plant:H10") },
    present: [["distinct-visitors-in-the-last-300s", 6], ["last-hit-at", AS_OF - 60]],
    wrong: ["current_visitors_filtered"],
  },
];

/** `--digest` prints each artifact's sha256 and writes nothing, which is how
 * verify.ts proves a re-run is byte-identical without needing write access to
 * anywhere. */
const artifacts = new Map<string, string>();
const write = (name: string, body: string) => artifacts.set(name, body);

const sha = async (body: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

async function emit() {
  if (Deno.args[0] === "--digest") {
    const out: Record<string, string> = {};
    for (const [name, body] of artifacts) out[name] = await sha(body);
    console.log(JSON.stringify(out));
    return;
  }
  console.log("wrote:");
  for (const [name, body] of artifacts) {
    await Deno.writeTextFile(new URL(name, HERE), body);
    console.log(`  ${name}  ${new TextEncoder().encode(body).length} bytes`);
  }
}

/** One row per line: a diff on this file names the hit that moved. */
const rows = (list: readonly unknown[]) => `[\n${list.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`;

const eventsJson = rows(events.map((e) => ({ ...e, epoch: instantOf(e.epoch) })));

write("events.json", eventsJson);
write("events.sha256", `${await sha(eventsJson)}  events.json\n`);
write("sessions.json", rows(sessions));
write("zones.json", rows(ZONES.map((z) => ({ ...z, starts_epoch: instantOf(z.starts_epoch) }))));
write("plants.json", `${JSON.stringify(plants, null, 2)}\n`);
write("anchors.json", `${JSON.stringify(anchors, null, 2)}\n`);

await emit();
if (Deno.args[0] === "--digest") Deno.exit(0);

console.log(
  `\n${events.length} hits · ${visits.length} visits · ` +
    `${new Set(events.map((e) => e.visitor)).size} visitors · ` +
    `${DAYS.length} local days · window [${events[0].epoch}, ${AS_OF})`,
);
