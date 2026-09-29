// The fixture, graded before anything is computed from it.
//
// ORACLE.md §5.1 makes this the first check of the apparatus, and its subject is
// the one step three separate computations must arrive at alike:
// sessionization. `fixtures/generate.ts` wrote `fixtures/sessions.json` from the
// partition it built the log to have, and never reads the log back;
// `fixtures/engine.ts` folds that log event by event; `oracle.sql` §5 recomputes
// it set-at-once with window functions. All three meet here, as two comparisons
// against the sidecar, and the suite makes them nowhere else: a rule spelled one
// way in two of the three is invisible outside this file. (fixtures/verify.ts
// runs the sidecar against the engine as well, as the transcript its own header
// describes — by hand, and not on any gate.)
//
// The assertions that need no fixture — the window integers, the bucket grid,
// whether any precondition was violated, the discrimination of the named wrong
// readings — are oracle.test.ts's. These read `fixtures/`, and oracle.sql's own
// text: the gate roster is a property of the file rather than of a run, and each
// gate is then run once more over a deliberately broken copy of it.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { APP, groundTruth, type Session } from "./ground-truth.ts";
import {
  type Ev,
  FILTER_SETS,
  parseLog,
  RULE,
  type Visit,
  type World,
  world,
  WRONG,
} from "../fixtures/engine.ts";

const read = async (n: string) => await Deno.readTextFile(new URL(`fixtures/${n}`, APP));
const readJson = async <T>(n: string): Promise<T> => JSON.parse(await read(n)) as T;

/** The partition `fixtures/generate.ts` constructed, as it wrote it. No entity
 * declares a table for this file (ORACLE.md §1.4), so the app cannot reach it:
 * it exists to be compared against, never to be answered from. */
type Sidecar = {
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
  source: string;
  browser: string;
  hours: string[];
};

/** The key all three computations reach a visit by. Matching on it is what makes
 * the column comparisons below comparisons of the same visit rather than of two
 * lists that happen to be the same length. */
const KEY = ["visitor", "ord"] as const;

/** A column one witness carries and the other does not, and why that is allowed.
 *
 * This map is the gate. Every other shared column is compared automatically, so
 * a rule added to either reader is either witnessed by both or is refused here
 * until someone writes down why one reader is alone with it. A declaration that
 * has stopped being true — the other side grew the column, or this side lost it
 * — fails from the opposite direction, so the map cannot rot into a permission
 * slip for whatever the two readers currently disagree about. */
const ONE_SIDED: Record<string, { side: "sidecar" | "oracle"; because: string }> = {
  session_id: {
    side: "oracle",
    because: "the same key as (visitor, ord) spelled as one string; the key sets are compared above",
  },
  hours: {
    side: "sidecar",
    because: "the visit's open hours, compared as a set against session_hour by the next test",
  },
};

/** A vendor case: the cohort's reserved visitor-id prefix and the numbers the
 * vendor's own test asserts. `asserts` is an object on the five cohort-level
 * cases and a list of one-key objects on A6, which the vendor states per hour
 * bucket. */
type Anchor = {
  id: string;
  test: string;
  prefix: string;
  asserts: Record<string, number> | Record<string, number[]>[];
};

type Plant = {
  case: string;
  rows: { visitors: string[]; events: string[] };
  wrong: string[];
};

/** `fixtures/engine.ts`'s `Visit` under the sidecar's column names, keyed by the
 * sidecar's own columns: a column added to the sidecar has to be given a reading
 * here before the comparison below will run at all. A third witness that
 * silently stopped covering a column would leave the other two agreeing about
 * that column alone, which is the shape of every finding this file exists for. */
const FROM_ENGINE: Record<keyof Sidecar, (v: Visit, w: World) => unknown> = {
  visitor: (v) => v.visitor,
  ord: (v) => v.ord,
  start_epoch: (v) => v.start,
  last_epoch: (v) => v.last,
  entry_page: (v) => v.entry_page,
  exit_page: (v) => v.exit_page,
  pageviews: (v) => v.pageviews,
  events: (v) => v.events,
  bounce: (v) => v.bounce,
  duration: (v) => v.duration,
  source: (v) => v.source,
  browser: (v) => v.browser,
  hours: (v, w) => w.hoursOf.get(v.key)!,
};

/** oracle.sql §11's gates, each with a counter-mutation that breaks the thing it
 * guards. Why a gate exists is written beside it there and is not repeated here.
 *
 * A NAME roster is not enough. `violation` coming back empty says only that no
 * gate that ran was violated, so a gate whose name is still in §11 and whose
 * predicate is `where false` gives the same clean bill of health as meeting the
 * precondition does — and every other assertion in this apparatus stays green
 * while it does. Deleting a gate is caught by the roster; hollowing one is not.
 *
 * So the roster carries a mutation instead, and the run makes both claims about
 * it: §11 asks exactly these gates, and each one FIRES when its subject is
 * broken. `from` must occur exactly once in the file, so a refactor that moves
 * the mutated text fails here rather than silently disarming the witness.
 *
 * A mutation may trip other gates as well — a wrong `7d` window also makes two
 * ranges agree — and that is not a defect: only the target gate's own rows are
 * read. `detail` is a substring one of those rows must carry, and it earns its
 * place on the gates that emit more than one shape of row: `anchor_cohort_empty`
 * has two clauses and `zone_vs_icu` a row per window, so without it the gate
 * could fire about something else the mutation disturbed. On a gate with one
 * shape of row it restates that row and adds nothing to presence. */
const GATES: { gate: string; from: string; to: string; detail: string }[] = [
  {
    gate: "zone_vs_icu",
    from: "union all select '7d',             day_start(d - 6),  as_of from m",
    to: "union all select '7d',             day_start(d - 5),  as_of from m",
    detail: "window 7d",
  },
  {
    gate: "local_stamp_vs_icu",
    from: "create or replace macro loc_hour(t) as ((loc_sec(t) % 86400) // 3600);",
    to: "create or replace macro loc_hour(t) as (((loc_sec(t) + 3600) % 86400) // 3600);",
    detail: "zone rows say",
  },
  {
    gate: "week_stamp_vs_icu",
    from: "create or replace macro loc_week(t) as (loc_day(t) - ((loc_day(t) + 3) % 7));",
    to: "create or replace macro loc_week(t) as (loc_day(t) - ((loc_day(t) + 4) % 7));",
    detail: "zone rows say week of",
  },
  {
    gate: "bucket_key_not_unique",
    from: "       hour_key(w.wfrom + i * 3600) as bucket_key,",
    to: "       substr(hour_key(w.wfrom + i * 3600), 1, 10) as bucket_key,",
    detail: "custom_dst_day/hour repeats",
  },
  {
    // The autumn row read as a second summer row: the clock then never steps
    // back, and `bucket_key_not_unique` above has nothing left to catch.
    gate: "clock_never_steps_back",
    from: "  ('z-cet-2026',  1792890000, 3600, 'CET');",
    to: "  ('z-cet-2026',  1792890000, 7200, 'CEST');",
    detail: "no local hour of these Zone rows is reached by two UTC hours",
  },
  {
    gate: "unknown_slot_operator",
    from: "'is:signup');",
    to: "'eq:signup');",
    detail: "filter set goal slot value eq:signup",
  },
  {
    gate: "has_with_disjunction",
    from: "('contains',    'has:/blog',",
    to: "('contains',    'has:/blog|/docs',",
    detail: "filter set contains slot value has:/blog|/docs",
  },
  {
    gate: "negated_event_slot",
    from: "('event-1',     'is:/pricing',",
    to: "('event-1',     'not:/pricing',",
    detail: "filter set event-1 negates an event-scoped slot",
  },
  {
    gate: "interactive_pageview",
    from: "  interactive::varchar as interactive,",
    to: "  (case when name = 'pageview' then 'true' else interactive end)::varchar as interactive,",
    detail: "hit ",
  },
  {
    gate: "interactive_not_boolean",
    from: "  interactive::varchar as interactive,",
    to: "  ('x' || interactive)::varchar as interactive,",
    detail: "has interactive=xfalse",
  },
  {
    // Splitting on a one-minute gap opens visits on hits the rule keeps inside
    // one, engagement pings among them.
    gate: "visit_opens_on_engagement",
    from: "or epoch - prev >= 1860 then 1 else 0 end)",
    to: "or epoch - prev >= 60 then 1 else 0 end)",
    detail: "visit ",
  },
  {
    gate: "visit_has_no_pageview",
    from: "  name::varchar        as name,",
    to: "  (case when name = 'pageview' then 'custom' else name end)::varchar as name,",
    detail: "visit ",
  },
  {
    gate: "anchor_cohort_empty",
    from: "select id, prefix from read_json('fixtures/anchors.json'",
    to: "select id, prefix || 'zz' as prefix from read_json('fixtures/anchors.json'",
    detail: "matches no hit under prefix",
  },
  {
    gate: "anchor_not_graded",
    from: "from published p join anchor_filter f on f.id = p.id;",
    to: "from published p join anchor_filter f on f.id = p.id where p.id <> 'A5';",
    detail: "anchor A5 is published and produces no row",
  },
  {
    gate: "slot_never_graded",
    from: "('entry-page',  '',                 'is:/docs', '',   '',              ''),",
    to: "('entry-page',  '',                 '', '',   '',              ''),",
    detail: "no declared filter shape occupies f_entry_page",
  },
  {
    gate: "reach_not_graded",
    from: "left join vv on vv.cursor = c.cursor and vv.range = w.range;",
    to: "left join vv on vv.cursor = c.cursor and vv.range = w.range where w.range <> 'day';",
    detail: "is reachable and has no top line at day",
  },
  {
    gate: "reach_vs_declared",
    from: "union all select cursor, range, 'pageviews', pageviews, null, pageviews from reach_agg",
    to: "union all select cursor, range, 'pageviews', pageviews, null, pageviews + 1 from reach_agg",
    detail: "pageviews: §7 says",
  },
  {
    // A drill-down on the page panel that drops the slot it pinned lands on a
    // cursor that is not the row's own.
    gate: "reach_vs_breakdown",
    from: "       c.set_page, c.set_entry_page, c.set_source, c.set_browser, c.set_name\nfrom brk_cursor c",
    to: "       '', c.set_entry_page, c.set_source, c.set_browser, c.set_name\nfrom brk_cursor c",
    detail: "and lands on",
  },
  {
    gate: "panel_never_truncates",
    from: "create or replace table panel_limit as select 9 as n;",
    to: "create or replace table panel_limit as select 9999 as n;",
    detail: "no panel holds more than 9999 rows",
  },
  {
    // Visitor counts made unique within a panel, so the dimension leg of the
    // ranking decides nothing.
    gate: "panel_tie_never_exercised",
    from: "       coalesce(hh.visitors, 0)  as visitors,",
    to: "       coalesce(hh.visitors, 0) * 100000 + row_number() over (partition by c.panel, c.filter_set," +
      " c.range order by c.dim_value) as visitors,",
    detail: "no panel holds two rows with equal visitors",
  },
  {
    // The tie broken at the cut alone: every other tie survives, so this fires
    // where `panel_tie_never_exercised` does not.
    gate: "panel_tie_never_cuts",
    from: "       coalesce(hh.visitors, 0)  as visitors,",
    to: "       coalesce(hh.visitors, 0) - case when row_number() over (partition by c.panel, c.filter_set," +
      " c.range order by coalesce(hh.visitors, 0) desc, c.dim_value asc) = (select n from panel_limit) + 1" +
      " then 1 else 0 end as visitors,",
    detail: "no panel is tied on visitors across row 9",
  },
  {
    // The one visit that opens before an hour-grain window and closes inside it,
    // moved wholly inside it.
    gate: "visit_open_across_opening_never_exercised",
    from: "  floor(epoch(strptime(epoch, '%Y-%m-%dT%H:%M:%S.%fZ')))::bigint as epoch,",
    to: "  (floor(epoch(strptime(epoch, '%Y-%m-%dT%H:%M:%S.%fZ'))) + case when visitor = 'v100' then 3600 else 0 end)::bigint as epoch,",
    detail: "no visit is open across the opening of an hour-grain window",
  },
  {
    gate: "custom_21d_span",
    from: "union all select 'custom_21d',     day_start(day_of(date '2026-03-15')),",
    to: "union all select 'custom_21d',     day_start(day_of(date '2026-03-16')),",
    detail: "1810800 is one hour short of 21 days",
  },
  {
    gate: "custom_dst_day_span",
    from: "union all select 'custom_dst_day', day_start(day_of(date '2026-03-29')),",
    to: "union all select 'custom_dst_day', day_start(day_of(date '2026-03-28')),",
    detail: "the 23-hour local day is 82800",
  },
  {
    // A constant column is a function of every other column.
    gate: "derivable_column",
    from: "  browser::varchar     as browser",
    to: "  'Chrome'::varchar    as browser",
    detail: "-> browser is a function over the log",
  },
  {
    gate: "ranges_agree",
    from: "union all select '7d',             day_start(d - 6),  as_of from m",
    to: "union all select '7d',             day_start(d - 27),  as_of from m",
    detail: "ranges 28d and 7d agree on every top-line row",
  },
  {
    gate: "no_discrimination",
    from: "or epoch - prev >= 1800 then 1 else 0 end)",
    to: "or epoch - prev >= 1860 then 1 else 0 end)",
    detail: "reading gap_ge_1800 does not discriminate",
  },
];

/** The column names a list of rows carries, refusing a list whose rows are not
 * all the same shape: a JSON list is not a table, and a comparison over the keys
 * of row 0 would silently stop covering a column some rows lack. */
function columnsOf(rows: readonly unknown[], what: string): string[] {
  assert(rows.length > 0, `${what} is empty`);
  const first = Object.keys(rows[0] as object).sort();
  for (const r of rows) {
    const got = Object.keys(r as object).sort();
    assertEquals(got, first, `${what} has rows of two different shapes`);
  }
  return first;
}

/** Classify every column of the two witnesses, and return the ones to compare.
 *
 * A column both carry is compared. A column one carries alone must be in
 * ONE_SIDED, on that side, with a reason; and a ONE_SIDED entry the other side
 * has caught up with is itself a finding. This is what makes the comparison a
 * gate on future definition changes rather than an assertion about the columns
 * that happened to be interesting the day it was written. */
function classify(
  side: readonly unknown[],
  gt: readonly unknown[],
): { compared: string[]; findings: string[] } {
  const a = new Set(columnsOf(side, "the sidecar"));
  const b = new Set(columnsOf(gt, "the ground truth's session list"));
  const findings: string[] = [];
  const compared: string[] = [];
  for (const c of [...new Set([...a, ...b])].sort()) {
    const both = a.has(c) && b.has(c);
    const declared = ONE_SIDED[c];
    if (both && declared) {
      findings.push(`${c} is declared one-sided (${declared.side}) and both witnesses carry it`);
      continue;
    }
    if (both) {
      if (!(KEY as readonly string[]).includes(c)) compared.push(c);
      continue;
    }
    const side = a.has(c) ? "sidecar" : "oracle";
    if (!declared) {
      findings.push(
        `${c} is carried only by the ${side}: compare it in both witnesses, or declare it in ONE_SIDED with why`,
      );
      continue;
    }
    if (declared.side !== side) findings.push(`${c} is declared one-sided on the ${declared.side} and is on the ${side}`);
    if (declared.because.trim().length < 20) findings.push(`${c} is declared one-sided with no reason given`);
  }
  for (const c of Object.keys(ONE_SIDED)) {
    if (!a.has(c) && !b.has(c)) findings.push(`${c} is declared one-sided and neither witness carries it`);
  }
  for (const k of KEY) {
    if (!a.has(k) || !b.has(k)) findings.push(`${k} is the shared key and one witness does not carry it`);
  }
  return { compared, findings };
}

/** The compared columns, or a raise naming what has to be decided first. */
function shared(side: readonly unknown[], gt: readonly unknown[]): string[] {
  const { compared, findings } = classify(side, gt);
  if (findings.length > 0) throw new Error(findings.join("\n"));
  return compared;
}

Deno.test("neither witness carries a column the other has no opinion about", async () => {
  // The gate every future definition change passes through. A rule added to
  // oracle.sql alone, or to fixtures/engine.ts alone, arrives here as a column
  // one side has and the other does not, and the run stops until it is either
  // witnessed twice or written down as deliberately single-sided.
  const gt = await groundTruth();
  const side = await readJson<Sidecar[]>("sessions.json");
  const { compared, findings } = classify(side, gt.session);
  assertEquals(findings, [], findings.join("\n"));
  // Not a restatement of the list: it is the assertion that the gate is load
  // bearing at all. A refactor that made `compared` empty would leave every
  // test below green while comparing nothing.
  assert(compared.length >= 8, `only ${compared.length} columns are compared`);
});

Deno.test("the two witnesses filter by the same vocabulary", async () => {
  // oracle.sql's `fset` and fixtures/engine.ts's FILTER_SETS are the same eleven
  // filter shapes written twice, each naming the slots it occupies. Two readers
  // whose filter vocabularies have drifted are not checking each other; they are
  // answering different questions and agreeing about neither.
  const gt = await groundTruth();
  const slots = { c_page: "page", c_entry_page: "entry_page", c_source: "source", c_browser: "browser", c_name: "name" } as const;
  const fromOracle: Record<string, Record<string, string>> = {};
  for (const r of gt.reach.filter((r) => r.origin_kind === "declared")) {
    const row: Record<string, string> = {};
    for (const [col, name] of Object.entries(slots)) {
      const v = (r as unknown as Record<string, string>)[col];
      if (v !== "") row[name] = v;
    }
    fromOracle[r.origin] = row;
  }
  const fromEngine: Record<string, Record<string, string>> = {};
  for (const [id, sl] of Object.entries(FILTER_SETS)) fromEngine[id] = { ...sl } as Record<string, string>;
  assertEquals(fromOracle, fromEngine);
});

Deno.test("the committed log is the log the sha256 names", async () => {
  // A hand-edited fixture is a different failure from a drifted one, and
  // `fixtures/**` is outside bayt's build fingerprint (decision D5), so nothing
  // upstream of this notices either.
  const body = await read("events.json");
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  assertEquals(digest, (await read("events.sha256")).trim().split(/\s+/)[0]);
});

Deno.test("the sidecar and the ground truth are the same partition", async () => {
  const gt = await groundTruth();
  const side = await readJson<Sidecar[]>("sessions.json");

  // Cardinality first, and by key rather than by count: two partitions of 1 200
  // hits into 400 visits can differ in every boundary and still agree on 400.
  const sideBy = new Map(side.map((s) => [`${s.visitor}#${s.ord}`, s]));
  const gtBy = new Map(gt.session.map((s) => [s.session_id, s]));
  assertEquals(sideBy.size, side.length, "the sidecar has a duplicate (visitor, ord)");
  assertEquals(gtBy.size, gt.session.length, "the ground truth has a duplicate session_id");
  const onlySide = [...sideBy.keys()].filter((k) => !gtBy.has(k));
  const onlyGt = [...gtBy.keys()].filter((k) => !sideBy.has(k));
  assertEquals(onlySide, [], "visits the sidecar has and the ground truth does not");
  assertEquals(onlyGt, [], "visits the ground truth has and the sidecar does not");

  // The compared columns are DERIVED from what the two witnesses carry, never
  // listed here. A hand-written list covers the columns its author thought of,
  // so a rule the two readers disagree about is compared only if someone already
  // suspected it — which is the opposite of what a witness is for.
  const columns = shared(side, gt.session);
  const drift: string[] = [];
  for (const [key, s] of sideBy) {
    const g = gtBy.get(key)! as unknown as Record<string, unknown>;
    const r = s as unknown as Record<string, unknown>;
    // No coercion: a boolean compared to 0 or 1 is a comparison that cannot
    // fail, and the two readers must agree on the type as well as the number.
    for (const c of columns) {
      if (r[c] !== g[c]) drift.push(`${key} ${c}: sidecar ${JSON.stringify(r[c])}, oracle ${JSON.stringify(g[c])}`);
    }
  }
  assertEquals(drift, [], `${drift.length} columns disagree:\n${drift.slice(0, 20).join("\n")}`);
});

Deno.test("the sidecar is the partition fixtures/engine.ts folds out of the log", async () => {
  // The third witness, and the only place in the suite that runs the engine over
  // the log. The sidecar was written by the generator's construction, so a rule
  // spelled one way in engine.ts and another way in the construction lands here —
  // and a rule broken in engine.ts alone turns THIS test red without the fixture
  // moving a byte, which is what makes engine.ts a witness rather than a file the
  // suite happens to import a constant from.
  const side = await readJson<Sidecar[]>("sessions.json");
  const w = world(parseLog(await read("events.json")), RULE);
  assertEquals(
    columnsOf(side, "the sidecar"),
    Object.keys(FROM_ENGINE).sort(),
    "a sidecar column with no reading in FROM_ENGINE, or a reading for a column the sidecar dropped",
  );

  const byKey = new Map(w.visits.map((v) => [v.key, v]));
  assertEquals(byKey.size, w.visits.length, "the engine reached a duplicate (visitor, ord)");
  const keys = new Set(side.map((s) => `${s.visitor}#${s.ord}`));
  assertEquals([...keys].filter((k) => !byKey.has(k)), [], "visits the sidecar has and the engine does not");
  assertEquals([...byKey.keys()].filter((k) => !keys.has(k)), [], "visits the engine reaches and the sidecar does not");

  const drift: string[] = [];
  for (const s of side) {
    const v = byKey.get(`${s.visitor}#${s.ord}`)!;
    const r = s as unknown as Record<string, unknown>;
    for (const [c, read] of Object.entries(FROM_ENGINE)) {
      // Encoded rather than compared with ===, because `hours` is a list; the
      // encoding keeps the types apart, so a boolean still cannot equal a 1.
      const got = JSON.stringify(read(v, w));
      if (got !== JSON.stringify(r[c])) drift.push(`${v.key} ${c}: sidecar ${JSON.stringify(r[c])}, engine ${got}`);
    }
  }
  assertEquals(drift, [], `${drift.length} columns disagree:\n${drift.slice(0, 20).join("\n")}`);
});

/** oracle.sql, cut short of §12 and asked for its `violation` rows alone. §12 is
 * one statement that assembles the whole ground truth; a run that only has to
 * report which preconditions were violated does not need it, and dropping it
 * makes 25 mutation runs cheap enough to be a gate rather than a hand exercise. */
async function violationsUnder(mutated: string): Promise<{ gate: string; detail: string }[]> {
  const p = new Deno.Command("mise", {
    args: ["x", "--", "duckdb", "-json"],
    cwd: APP,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const w = p.stdin.getWriter();
  await w.write(new TextEncoder().encode(
    mutated + "\nselect coalesce((select list({gate: gate, detail: detail}) from violation), []) as violation;\n",
  ));
  await w.close();
  const out = await p.output();
  // The exit code before the parse: a SQL error leaves stdout empty, and parsing
  // first turns "the mutation does not compile" into a JSON syntax error.
  if (!out.success) throw new Error(`mutated oracle failed:\n${new TextDecoder().decode(out.stderr).trim()}`);
  return JSON.parse(new TextDecoder().decode(out.stdout))[0].violation;
}

const ORACLE_SQL = await Deno.readTextFile(new URL("oracle.sql", APP));

/** oracle.sql through §11 — every step the gates read, and the gates. */
const THROUGH_GATES = ORACLE_SQL.slice(0, ORACLE_SQL.indexOf("-- 12. The output contract"));

Deno.test("oracle.sql asks every precondition the roster names", () => {
  const from = ORACLE_SQL.indexOf("-- 11. The preconditions");
  const to = ORACLE_SQL.indexOf("-- 12. The output contract");
  assert(from > 0 && to > from, "oracle.sql no longer has a §11 to read");
  const asked = [...ORACLE_SQL.slice(from, to).matchAll(/^(?:union all\s+)?select\s+'([a-z0-9_]+)'/gm)].map((m) => m[1]);
  assert(asked.length >= GATES.length, `§11 parsed to ${asked.length} gate names`);
  assertEquals([...new Set(asked)].sort(), GATES.map((g) => g.gate).sort());
});

Deno.test("every precondition fires when its subject is broken", async () => {
  // The half a name roster cannot make. Each gate is run against a file with the
  // thing it guards deliberately broken, and must report it — so a gate hollowed
  // into a no-op fails here while its name is still in §11 and `violation` is
  // still empty on the committed log.
  //
  // The clean run's own emptiness is oracle.test.ts's assertion and is not
  // repeated: this file's claim is only that each gate can fire at all.
  const witness = async ({ gate, from, to, detail }: (typeof GATES)[number]) => {
    const n = THROUGH_GATES.split(from).length - 1;
    if (n !== 1) return `${gate}: its mutation anchors on text that occurs ${n} times in oracle.sql`;
    const fired = await violationsUnder(THROUGH_GATES.replace(from, to));
    const mine = fired.filter((v) => v.gate === gate);
    if (mine.length === 0) {
      return `${gate}: silent under the mutation that breaks it; it fired ${
        [...new Set(fired.map((v) => v.gate))].join(", ") || "nothing"
      }`;
    }
    if (!mine.some((v) => v.detail.includes(detail))) {
      return `${gate}: fired, and no row says ${JSON.stringify(detail)}: ${mine[0].detail}`;
    }
    return "";
  };
  // Eight at a time. Every one of these is a whole duckdb run over the log, and
  // 25 at once is 25 ICU loads competing for one machine's memory.
  const bad: string[] = [];
  for (let i = 0; i < GATES.length; i += 8) {
    bad.push(...(await Promise.all(GATES.slice(i, i + 8).map(witness))).filter((x) => x !== ""));
  }
  assertEquals(bad, [], bad.join("\n"));
});

Deno.test("the plants, the engine and the oracle name the same wrong readings", async () => {
  // ORACLE.md §4.2 makes oracle.sql's `wrong` the authority, because it is the
  // artifact that computes both readings. A name only the manifest carries is a
  // plant guarding nothing; a name only the oracle computes is a graded reading
  // no plant is known to discriminate. Both are silent until the sets are held
  // equal here.
  const gt = await groundTruth();
  const oracle = [...new Set(gt.wrong.map((w) => w.reading))].sort();
  const plants = await readJson<Plant[]>("plants.json");
  assertEquals([...new Set(plants.flatMap((p) => p.wrong))].sort(), oracle, "fixtures/plants.json vs the oracle");
  assertEquals(Object.keys(WRONG).sort(), oracle, "fixtures/engine.ts's WRONG vs the oracle");
});

Deno.test("the sidecar and the ground truth span the same local hours", async () => {
  const gt = await groundTruth();
  const side = await readJson<Sidecar[]>("sessions.json");
  const want = new Set(side.flatMap((s) => s.hours.map((h) => `${s.visitor}#${s.ord}|${h}`)));
  const got = new Set(gt.session_hour.map((r) => `${r.session_id}|${r.bucket_key}`));
  assertEquals(got.size, gt.session_hour.length, "the ground truth repeats a (visit, hour) row");
  const onlySide = [...want].filter((k) => !got.has(k)).sort();
  const onlyGt = [...got].filter((k) => !want.has(k)).sort();
  assertEquals(onlySide, [], "hours the sidecar spans and the ground truth does not");
  assertEquals(onlyGt, [], "hours the ground truth spans and the sidecar does not");
});

Deno.test("every anchor cohort reproduces the vendor's own asserted numbers", async () => {
  const gt = await groundTruth();
  const published = await readJson<Anchor[]>("anchors.json");
  const got = new Map(gt.anchor.map((a) => [`${a.anchor}|${a.bucket_key ?? ""}`, a]));

  // The only numbers in the apparatus this author did not compute. They are read
  // from the same file oracle.sql takes the cohort prefixes from — one
  // transcription, so the numbers asserted and the rows they are asserted against
  // cannot come to be about different visitors.
  const check = (key: string, want: Record<string, number>) => {
    const row = got.get(key);
    assert(row, `anchor ${key} is absent from the ground truth`);
    for (const [metric, value] of Object.entries(want)) {
      assertEquals((row as unknown as Record<string, number>)[metric], value, `anchor ${key} ${metric}`);
    }
  };

  let expected = 0;
  for (const a of published) {
    if (!Array.isArray(a.asserts)) {
      check(`${a.id}|`, a.asserts);
      expected += 1;
      continue;
    }
    // A6 is asserted per hour bucket, keyed by the hour of a local day the
    // vendor's case does not name. The fixture chooses the day; the cohort must
    // occupy exactly one, or "the hour 01" is not a bucket. The tuple is the
    // vendor's own `metrics` order, `["visits", "visitors", "visit_duration",
    // "pageviews"]`, and index 2 is its hour-attributed duration, which this app
    // declines (ORACLE.md §3.5), so it is not asserted.
    const days = new Set([...got.values()].filter((r) => r.anchor === a.id).map((r) => r.bucket_key!.slice(0, 10)));
    assertEquals(days.size, 1, `the ${a.id} cohort spans ${days.size} local days`);
    const day = [...days][0];
    for (const bucket of a.asserts) {
      for (const [hour, tuple] of Object.entries(bucket)) {
        check(`${a.id}|${day} ${hour}`, { visits: tuple[0], visitors: tuple[1], pageviews: tuple[3] });
        expected += 1;
      }
    }
  }
  // Nothing may be added to the anchor column without a citation: an "anchor"
  // this author computed is a golden value wearing the one label that claims not
  // to be one.
  assertEquals(got.size, expected, "an anchor row with no vendor assertion behind it");
});

Deno.test("every plant the hard cases name is still in the log", async () => {
  const plants = await readJson<Plant[]>("plants.json");
  const log = await readJson<{ id: string; visitor: string }[]>("events.json");
  const ids = new Set(log.map((e) => e.id));
  const visitors = new Set(log.map((e) => e.visitor));
  // The manifest names the rows each hard case was built on. A regenerated
  // fixture that dropped one leaves the case's arithmetic intact and its
  // discrimination accidental, which is the failure that reads as a pass.
  const gone: string[] = [];
  for (const p of plants) {
    for (const v of p.rows.visitors) if (!visitors.has(v)) gone.push(`${p.case} visitor ${v}`);
    for (const e of p.rows.events) if (!ids.has(e)) gone.push(`${p.case} event ${e}`);
  }
  assertEquals(gone, [], gone.join("\n"));
});
