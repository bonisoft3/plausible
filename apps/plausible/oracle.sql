-- The ground truth. Authored and reviewed; never generated.
--
-- Invoked as `mise x -- duckdb -json -c ".read oracle.sql"` with the process's
-- cwd set to the app directory. It reads fixtures/events.json directly through
-- read_json_auto, writes nothing, and ends in exactly one result-producing
-- statement. The output contract is stated at §12.
--
-- WHAT THIS DELIBERATELY DOES NOT REUSE. The whole value of this file is that a
-- defect in the app cannot reach it, so it shares with the app under test:
--
--   * no code. Nothing here is generated from program.cue and nothing under
--     shell/handlers is generated from here. `stitch` folds event by event in the
--     shape a session store uses; §5 is a set-at-once window function. `rollup`
--     accumulates per bucket as rows arrive; §7 is a complete grid left-joined to
--     a group-by.
--   * no clock and no locale from the host. §2's three rows are transcribed
--     integers, so the app's civil-from-days arithmetic is graded against
--     arithmetic rather than against a library both sides could be reading the
--     same way. tzdata enters exactly once, as an independent witness: every
--     window integer §3 derives from those rows is derived a second time through
--     ICU's `AT TIME ZONE 'Europe/Berlin'`, and §11 compares them. A
--     disagreement fails here, before the app runs at all.
--   * no intermediate of the app's. It never reads Session, SessionHour, Corpus,
--     Topline, Bucket, Breakdown, Tick, Scale or Chip. It reads the eight columns
--     of the log and recomputes the visit partition from them.
--   * not even the generator's own answer. fixtures/sessions.json — the partition
--     the generator intended — is never opened here. It is the third witness on
--     the stitch, and fixture.test.ts compares it to §5's partition: two results,
--     not a shared input.
--
-- The one thing it does share is the reading: one author's understanding of one
-- product's definitions, implemented twice. ORACLE.md §6 states that ceiling and
-- §3.5's six anchor cohorts push against it — the `anchor` column of the output
-- carries the only numbers here this author did not compute, which is why
-- fixture.test.ts checks them before anything else.
--
-- Every threshold is an integer literal spelled once. The session boundary is
-- 1860, it lives in §5, and it is echoed as `session_gap_seconds` so it cannot
-- drift on this side without a test seeing it.


-- ===========================================================================
-- 1. The log
-- ===========================================================================

-- Every column is pinned to a type here rather than inferred, and the instant
-- most of all: `epoch()` answers a DOUBLE and the cast to bigint ROUNDS, where
-- the app and fixtures/clock.ts take the second an instant falls in — so a hit
-- at .9 would be graded one second later than it was counted. The file spells
-- the instant as the app's timestamp carrier, which
-- read_json_auto would take for a naive TIMESTAMP and a cast to timestamptz would
-- then shift by the session's own zone. Read as text, parsed only in the
-- carrier's form, it becomes whole UTC seconds, and everything below is integer
-- arithmetic on those.
create or replace table hit as
select
  id::varchar          as id,
  floor(epoch(strptime(epoch, '%Y-%m-%dT%H:%M:%S.%fZ')))::bigint as epoch,
  visitor::varchar     as visitor,
  name::varchar        as name,
  interactive::varchar as interactive,
  pathname::varchar    as pathname,
  source::varchar      as source,
  browser::varchar     as browser
from read_json('fixtures/events.json', columns = {
  id: 'VARCHAR', epoch: 'VARCHAR', visitor: 'VARCHAR', name: 'VARCHAR',
  interactive: 'BOOLEAN', pathname: 'VARCHAR', source: 'VARCHAR', browser: 'VARCHAR'
});


-- ===========================================================================
-- 2. The clock, as three integer rows
-- ===========================================================================

-- ORACLE.md §1.5. Transcribed, never queried. The third row is after the log's
-- last hit and it is not decoration: it is what makes the `starts_epoch <= t`
-- bound do work, because a lookup that takes the table's last row instead yields
-- +3600 everywhere and turns the 23-hour local day into a 24-hour one.
create or replace table zone(
  id varchar, starts_epoch bigint, offset_seconds bigint, abbr varchar
);
insert into zone values
  ('z-cet-2025',  1761440400, 3600, 'CET'),
  ('z-cest-2026', 1774746000, 7200, 'CEST'),
  ('z-cet-2026',  1792890000, 3600, 'CET');

-- The offset in force at an instant.
create or replace macro off_at(t) as (
  select z.offset_seconds from zone z
  where z.starts_epoch <= t
  order by z.starts_epoch desc limit 1
);

-- The offset in force at a local midnight, which is a different lookup: the
-- instant is not known until the offset is chosen, so the zone must satisfy
-- `starts_epoch <= d * 86400 - its own offset`.
create or replace macro off_local_day(d) as (
  select z.offset_seconds from zone z
  where z.starts_epoch <= d * 86400 - z.offset_seconds
  order by z.starts_epoch desc limit 1
);

-- Local seconds since the epoch, and the civil stamps read off them by integer
-- division. 1970-01-01 was a Thursday, so the Monday-based weekday of day index
-- d is (d + 3) % 7 and the Monday of its week is d minus that.
create or replace macro loc_sec(t)  as (t + off_at(t));
create or replace macro loc_day(t)  as (loc_sec(t) // 86400);
create or replace macro loc_hour(t) as ((loc_sec(t) % 86400) // 3600);
create or replace macro loc_week(t) as (loc_day(t) - ((loc_day(t) + 3) % 7));

-- The UTC instant a local day begins, and the start of the local hour holding t.
create or replace macro day_start(d) as (d * 86400 - off_local_day(d));
create or replace macro hour_slot(t) as (t - (loc_sec(t) % 3600));

-- A bucket key is a rendered string on both sides, because the graded artifact
-- is what a reader sees on an axis.
create or replace macro day_key(d)  as (strftime(date '1970-01-01' + d::int, '%Y-%m-%d'));
create or replace macro hour_key(t) as (day_key(loc_day(t)) || ' ' || lpad(loc_hour(t)::varchar, 2, '0'));

-- Day index of a literal civil date, for the two pinned custom ranges.
create or replace macro day_of(dt) as (date_diff('day', date '1970-01-01', dt));

-- Where the clock steps BACK, two UTC hours render one local hour, so
-- `hour_key` is not a key there. Derived from the Zone rows and from nothing
-- else — the log is not read here — because the ambiguity is a property of the
-- calendar and exists whether or not a hit falls in it. §11 refuses a grid that
-- reaches such an hour twice, and refuses a Zone table that carries no step back
-- at all, which would leave that refusal grading nothing.
create or replace table clock_repeat as
with candidate as (
  select distinct hour_slot(zn.starts_epoch + i * 3600) as slot
  -- `zn` and not `z`: an argument expression is substituted INTO `off_at`'s body,
  -- which says `from zone z`, so a caller aliasing its own row `z` has the macro
  -- correlate on its own row and answer NULL.
  from zone zn, generate_series(-4, 3) g(i)
  -- Before the first Zone row no offset is in force, and every instant there
  -- would arrive as one NULL slot rather than as a repeated hour.
  where zn.starts_epoch + i * 3600 >= (select min(starts_epoch) from zone)
)
select hour_key(slot) as bucket_key, count(*) as slots,
       min(slot) as first_slot, max(slot) as second_slot
from candidate group by 1 having count(*) > 1;


-- ===========================================================================
-- 3. The five windows
-- ===========================================================================

-- `as_of_epoch` is data — seeded onto the Filter row. Nothing here reads a real
-- clock, so a run in 2030 grades the same numbers.
create or replace table as_of as select 1775650800::bigint as t;

-- A range is `[from, to)` in UTC seconds. `back(m, k)` subtracts k from the
-- local CIVIL DATE of m, which is not `m - k * 86400`: over this fixture the
-- multiplied form opens the 28-day window an hour early and puts a 29th bucket
-- on a 28-bucket axis (H8).
create or replace table win as
with m as (select loc_day(t) as d, t as as_of from as_of)
select 'day' as range, day_start(d) as wfrom, as_of as wto from m
union all select '7d',             day_start(d - 6),  as_of from m
union all select '28d',            day_start(d - 27), as_of from m
union all select 'custom_21d',     day_start(day_of(date '2026-03-15')),
                                   day_start(day_of(date '2026-04-05')) from m
union all select 'custom_dst_day', day_start(day_of(date '2026-03-29')),
                                   day_start(day_of(date '2026-03-30')) from m;

-- The same five windows a second way, through ICU's real tz database, so §2's
-- rows are witnessed rather than trusted. §11 compares them.
create or replace table win_icu as
with l as (select t as as_of, to_timestamp(t) at time zone 'Europe/Berlin' as loc from as_of)
select 'day' as range,
       epoch(date_trunc('day', loc) at time zone 'Europe/Berlin')::bigint as wfrom,
       as_of as wto from l
union all select '7d',
       epoch((date_trunc('day', loc) - interval 6 day) at time zone 'Europe/Berlin')::bigint, as_of from l
union all select '28d',
       epoch((date_trunc('day', loc) - interval 27 day) at time zone 'Europe/Berlin')::bigint, as_of from l
union all select 'custom_21d',
       epoch(timestamp '2026-03-15 00:00:00' at time zone 'Europe/Berlin')::bigint,
       epoch(timestamp '2026-04-05 00:00:00' at time zone 'Europe/Berlin')::bigint from l
union all select 'custom_dst_day',
       epoch(timestamp '2026-03-29 00:00:00' at time zone 'Europe/Berlin')::bigint,
       epoch(timestamp '2026-03-30 00:00:00' at time zone 'Europe/Berlin')::bigint from l;


-- ===========================================================================
-- 4. The bucket grid
-- ===========================================================================

-- The seven legal (range, granularity) pairs, as rows rather than as a rule
-- inside a handler, so "every legal pair was driven" is an assertion
-- coverage.test.ts can make. ORACLE.md §2.1.
create or replace table pair(range varchar, grain varchar);
insert into pair values
  ('day', 'hour'),
  ('7d', 'day'),
  ('28d', 'day'), ('28d', 'week'),
  ('custom_21d', 'day'), ('custom_21d', 'week'),
  ('custom_dst_day', 'hour');

-- A bucket exists for every grid step the window intersects, whether or not a
-- hit falls in it: the grid is window arithmetic, never a group-by over the
-- data. That is what puts an empty bucket on both sides, and it is what makes a
-- missing bucket fail as cardinality rather than as a value somewhere else.
--
-- The hour walk steps 3600 UTC seconds from a locally hour-aligned `wfrom`, so
-- the spring-forward day yields 23 rows with local hour 02 absent — not 24 with
-- a hole. A fall-back day would yield 25 rows with a repeated key; no window
-- here contains one, and §11 asserts the keys are unique per pair rather than
-- leaving that to the reader.
create or replace table grid as
select w.range, 'hour' as grain, i as ord,
       hour_key(w.wfrom + i * 3600) as bucket_key,
       w.wfrom + i * 3600 as b_from
from win w join pair p on p.range = w.range and p.grain = 'hour',
     generate_series(0, ((w.wto - w.wfrom - 1) // 3600)::int) g(i)
union all
select w.range, 'day', (d - loc_day(w.wfrom))::int, day_key(d), day_start(d)
from win w join pair p on p.range = w.range and p.grain = 'day',
     generate_series(loc_day(w.wfrom), loc_day(w.wto - 1)) g(d)
union all
select w.range, 'week', ((d - loc_week(w.wfrom)) // 7)::int, day_key(d), day_start(d)
from win w join pair p on p.range = w.range and p.grain = 'week',
     generate_series(loc_week(w.wfrom), loc_week(w.wto - 1), 7) g(d);

-- The same grid under H8's four named wrong readings, so §10's discrimination
-- compares two executable formulations and not SQL against prose.
create or replace table grid_wrong as
select 'week_starts_sunday' as reading, w.range, 'week' as grain, day_key(d) as bucket_key
from win w join pair p on p.range = w.range and p.grain = 'week',
     generate_series(loc_day(w.wfrom) - ((loc_day(w.wfrom) + 4) % 7), loc_day(w.wto - 1), 7) g(d)
union all
select 'utc_day_buckets', w.range, 'day', day_key(d)
from win w join pair p on p.range = w.range and p.grain = 'day',
     generate_series(w.wfrom // 86400, (w.wto - 1) // 86400) g(d)
union all
select 'window_by_multiplication', w.range, 'day', day_key(d)
from win w join pair p on p.range = w.range and p.grain = 'day',
     generate_series(loc_day(w.wfrom - 3600), loc_day(w.wto - 1)) g(d)
union all
select 'twenty_four_bars', w.range, 'hour', day_key(loc_day(w.wfrom)) || ' ' || lpad(i::varchar, 2, '0')
from win w join pair p on p.range = w.range and p.grain = 'hour',
     generate_series(0, 23) g(i)
where w.range = 'custom_dst_day';


-- ===========================================================================
-- 5. The visit partition
-- ===========================================================================

-- A new visit begins iff the gap from that visitor's previous hit OF ANY NAME
-- reaches 1860 seconds. 1860 and not 1800: the vendor keeps a session while
-- `NaiveDateTime.diff(t, session.t, :minute) <= 30`, and Elixir's :minute diff
-- truncates, so 1859 s reads as 30 minutes and continues while 1860 s reads as
-- 31 and splits. ORACLE.md §3.5 cites the expression.
--
-- Three of H1's named wrong readings are partitions too, and they are computed
-- here beside the rule so a run can say whether the fixture distinguishes them:
--   gap_ge_1800               the naive reading of "thirty minutes"
--   engagement_does_not_hold  a ping that does not hold the visit open — the gap
--                             measured from the previous NON-engagement hit
--   gap_from_start            the gap timed from the visit's start, so a visit is
--                             capped at 1860 s. Alone among the four this cannot
--                             be a window function: where the next split falls
--                             depends on where the last one did.
create or replace table seq as
select h.*,
       row_number() over (partition by h.visitor order by h.epoch, h.id) as rn,
       lag(h.epoch) over (partition by h.visitor order by h.epoch, h.id) as prev,
       max(case when h.name <> 'engagement' then h.epoch end) over (
         partition by h.visitor order by h.epoch, h.id
         rows between unbounded preceding and 1 preceding) as prev_live
from hit h;

-- `ord` counts a visitor's visits from ONE, because that is the base the sidecar
-- was generated with and `session_id` is built from it: two witnesses whose keys
-- differ by one cannot be compared row by row at all.
create or replace table assign as
select 'rule' as reading, id, visitor,
       sum(case when prev is null or epoch - prev >= 1860 then 1 else 0 end)
         over (partition by visitor order by epoch, id) as ord
from seq
union all
select 'gap_ge_1800', id, visitor,
       sum(case when prev is null or epoch - prev >= 1800 then 1 else 0 end)
         over (partition by visitor order by epoch, id)
from seq
union all
select 'engagement_does_not_hold', id, visitor,
       sum(case when prev_live is null or epoch - prev_live >= 1860 then 1 else 0 end)
         over (partition by visitor order by epoch, id)
from seq;

-- gap_from_start, by the recursive walk it needs.
insert into assign
with recursive r as (
  select visitor, rn, epoch, 1::bigint as ord, epoch as vstart, id
  from seq where rn = 1
  union all
  select s.visitor, s.rn, s.epoch,
         case when s.epoch - r.vstart >= 1860 then r.ord + 1 else r.ord end,
         case when s.epoch - r.vstart >= 1860 then s.epoch else r.vstart end,
         s.id
  from r join seq s on s.visitor = r.visitor and s.rn = r.rn + 1
)
select 'gap_from_start', id, visitor, ord from r;

-- The visit. Attribution — source and browser — is frozen at the visit's FIRST
-- hit, the hit that created it, whatever its name. The entry and exit pages are
-- the first and last PAGE VIEWED, and a hit of any other name moves neither:
-- the vendor writes both as `if(pageview?, event.pathname, …)` and initialises
-- both to the empty string on a session a custom event opened
-- (plausible/analytics lib/plausible/session/cache_store.ex, 17cfe6d9,
-- new_session_from_event 158-159 and update_session 128-138). §11 refuses a
-- visit with no page view at all, so the empty string is unreachable here and
-- is not spelled.
--
-- `last_epoch` is the visit's close: the last hit of ANY name, so the hours a
-- visit was open include the ones a ping held it through. `live_last` excludes
-- pings and is read by nothing but `duration`. Two names because the asymmetry is
-- real in the vendor — a ping extends the session's clock without extending its
-- duration (anchor A5) — and §10's `hours_from_nonengagement` probe says whether
-- this fixture distinguishes them. An engagement hit cannot be a visit's only
-- non-ping hit, because §11 refuses a visit that opens on one.
create or replace table sess as
select
  a.reading,
  a.visitor,
  a.ord,
  a.visitor || '#' || a.ord                                               as session_id,
  min(h.epoch)                                                            as start_epoch,
  max(h.epoch)                                                            as last_epoch,
  max(h.epoch) filter (where h.name <> 'engagement')                      as live_last,
  arg_min(h.pathname, s.rn) filter (where h.name = 'pageview')            as entry_page,
  arg_max(h.pathname, s.rn) filter (where h.name = 'pageview')            as exit_page,
  arg_min(h.name,     s.rn)                                               as first_name,
  arg_min(h.source,   s.rn)                                               as src,
  arg_min(h.browser,  s.rn)                                               as brw,
  count(*) filter (where h.name = 'pageview')                                   as pageviews,
  count(*) filter (where h.name <> 'engagement')                                as events,
  count(*) filter (where h.interactive = 'true' and h.name <> 'pageview')       as interactions,
  count(*)                                                                as hits_all
from assign a
join hit h on h.id = a.id
join seq s  on s.id = a.id
group by a.reading, a.visitor, a.ord;

-- The derived columns, kept out of the aggregate above so each is one
-- expression a reviewer can read on its own line.
--
-- A bounce is the vendor's `not (pageviews >= 2 or (interactive? and not
-- pageview?))`, carried over the whole visit (cache_store.ex 141-145, with
-- new_session_from_event's `is_bounce: name == "pageview" or not interactive?`
-- as its first term). Counting non-engagement hits instead would let a custom
-- event that declares itself non-interactive clear a bounce, which is the one
-- thing brief.md's "whether a hit counts as an interaction is a property of the
-- hit and not of its name" forbids.
create or replace table visit as
select *,
       live_last  - start_epoch                    as duration,
       last_epoch - start_epoch                    as duration_incl,
       (pageviews <= 1 and interactions = 0)::int  as bounce
from sess;

-- One row per visit per local hour it was open. A materialized table and not a
-- branch inside an aggregation, because "this visit appears in four hour rows,
-- two of which contain no hit" is then an artifact a human can grade on screen.
create or replace table visit_hour as
select v.reading, v.session_id, v.visitor,
       hour_slot(v.start_epoch) + i * 3600 as slot,
       hour_key(hour_slot(v.start_epoch) + i * 3600) as bucket_key
from visit v,
     generate_series(0, ((hour_slot(v.last_epoch) - hour_slot(v.start_epoch)) // 3600)::int) g(i);

-- The same, under the reading that ends a visit's open span at its last
-- non-engagement hit. §10 probes whether the fixture tells them apart.
create or replace table visit_hour_live as
select v.session_id,
       hour_key(hour_slot(v.start_epoch) + i * 3600) as bucket_key
from visit v,
     generate_series(0, ((hour_slot(v.live_last) - hour_slot(v.start_epoch)) // 3600)::int) g(i)
where v.reading = 'rule';

-- Each hit beside the visit it belongs to, which is what carries the frozen
-- attribution down to hit level. Anchor A3 is why this join exists: the vendor's
-- own test asserts 2 pageviews for a source filter where only the first hit
-- carries the source, so a hit matches a VISIT dimension through its visit and
-- not through its own column.
create or replace table fact as
select a.reading, h.id, h.epoch, h.visitor, h.name, h.pathname,
       v.session_id, v.start_epoch, v.entry_page, v.src as visit_source, v.brw as visit_browser
from assign a
join hit h   on h.id = a.id
join visit v on v.reading = a.reading and v.visitor = a.visitor and v.ord = a.ord;


-- ===========================================================================
-- 6. The declared filter shapes
-- ===========================================================================

-- ORACLE.md §2.4, plus the two shapes §11's `slot_never_graded` requires. The
-- operator rides inside the slot's value, so no filter value ever contains `&`
-- or `=` and the whole vocabulary stays out of the read grammar's way. An empty
-- string is an unoccupied slot.
create or replace table fset(
  id varchar, f_page varchar, f_entry_page varchar,
  f_source varchar, f_browser varchar, f_name varchar
);
insert into fset values
  ('none',        '',                 '', '',           '',              ''),
  ('visit-1',     '',                 '', '',           'is:Chrome',     ''),
  ('event-1',     'is:/pricing',      '', '',           '',              ''),
  ('visit-visit', '',                 '', 'is:google',  'is:Chrome',     ''),
  ('event-visit', 'is:/blog/why',     '', '',           'is:Safari',     ''),
  ('negated',     '',                 '', 'not:google', '',              ''),
  ('contains',    'has:/blog',        '', '',           '',              ''),
  ('disjunction', '',                 '', '',           'is:Chrome|Safari', ''),
  ('unentered',   'is:/checkout',     '', '',           '',              ''),
  -- The two slots no other shape occupies. Without them `f_entry_page` and
  -- `f_name` are columns of the cursor that no graded number depends on, and a
  -- rollup that never reads either produces byte-identical output on every
  -- assertion in this file. `entry-page` is not a spelling of `event-1`: a page
  -- slot matches a visit by CONTAINMENT and an entry-page slot by the visit's
  -- own first viewed page, so the two disagree on every visit that reached
  -- /docs without entering on it.
  ('entry-page',  '',                 'is:/docs', '',   '',              ''),
  ('goal',        '',                 '', '',           '',              'is:signup');

-- Match one value against one slot spec. An unrecognised operator yields NULL,
-- which fails every WHERE it appears in; §11 raises on it rather than letting it
-- read as "no match".
--
-- `has` takes exactly one alternative. `|` is defined for `is` and `not`, where a
-- disjunction is a set membership; a substring disjunction is a shape this file
-- does not implement, so §11 raises on `has:` with a `|` in it rather than
-- answering something narrower than the spec. None of the declared shapes needs it.
--
-- No lambda appears anywhere below. Inside a macro body DuckDB reads `x -> …` as
-- its JSON-extract operator and the expression binds as
-- `json_extract(VARCHAR, BOOLEAN)`, which is a confusing error a long way from
-- its cause.
create or replace macro slot_arg(s) as (substr(s, position(':' in s) + 1));
create or replace macro slot_op(s)  as (substr(s, 1, position(':' in s) - 1));
create or replace macro slot_ok(v, s) as (
  case
    when s = '' then true
    when slot_op(s) = 'is'  then list_contains(str_split(slot_arg(s), '|'), v)
    when slot_op(s) = 'not' then not list_contains(str_split(slot_arg(s), '|'), v)
    when slot_op(s) = 'has' then contains(v, slot_arg(s))
  end
);

-- A hit matches a filter set when its own column satisfies each EVENT-scoped
-- slot and its visit's frozen attribution satisfies each VISIT-scoped one.
-- `page` and `name` are event-scoped; `source`, `browser` and `entry_page` are
-- the visit's.
create or replace table hit_match as
select f.reading, s.id as filter_set, f.id, f.epoch, f.visitor, f.name, f.pathname, f.session_id
from fact f cross join fset s
where slot_ok(f.pathname,       s.f_page)
  and slot_ok(f.name,           s.f_name)
  and slot_ok(f.entry_page,     s.f_entry_page)
  and slot_ok(f.visit_source,   s.f_source)
  and slot_ok(f.visit_browser,  s.f_browser);

-- A visit matches an event-scoped slot by CONTAINMENT — any of its hits does —
-- and a visit-scoped slot by its own frozen column. `entered` is the same test
-- applied to the visit's entry page instead, and it is what restricts
-- bounce_rate's divisor and nothing else's.
--
-- `entry_only` is H7's named wrong reading, computed here beside the rule: the
-- visit row filtered on `page` as though `page` were its entry page.
create or replace table visit_match as
select v.reading, s.id as filter_set, v.session_id, v.visitor, v.ord,
       v.start_epoch, v.pageviews, v.duration, v.duration_incl, v.bounce,
       slot_ok(v.entry_page, s.f_page) as entered,
       'rule' as mode
from visit v cross join fset s
where (s.f_page = '' or exists (
         select 1 from fact f where f.reading = v.reading and f.session_id = v.session_id
                                and slot_ok(f.pathname, s.f_page)))
  and (s.f_name = '' or exists (
         select 1 from fact f where f.reading = v.reading and f.session_id = v.session_id
                                and slot_ok(f.name, s.f_name)))
  and slot_ok(v.entry_page, s.f_entry_page)
  and slot_ok(v.src,        s.f_source)
  and slot_ok(v.brw,        s.f_browser)
union all
select v.reading, s.id, v.session_id, v.visitor, v.ord,
       v.start_epoch, v.pageviews, v.duration, v.duration_incl, v.bounce,
       slot_ok(v.entry_page, s.f_page), 'entry_only'
from visit v cross join fset s
where slot_ok(v.entry_page, s.f_page)
  and (s.f_name = '' or exists (
         select 1 from fact f where f.reading = v.reading and f.session_id = v.session_id
                                and slot_ok(f.name, s.f_name)))
  and slot_ok(v.entry_page, s.f_entry_page)
  and slot_ok(v.src,        s.f_source)
  and slot_ok(v.brw,        s.f_browser);


-- ===========================================================================
-- 7. The aggregate, and the answers read off it
-- ===========================================================================

-- Every component of every metric, and every component a named wrong reading
-- needs, in one table keyed by (reading, mode, filter_set, range). Computing the
-- alternatives as extra COLUMNS rather than as a second pipeline is what keeps
-- them from drifting away from the rule they are supposed to be wrong about.
--
--   a hit matches a window iff `from <= epoch < to`
--   a visit matches a window iff its START does, so a visit open across `from`
--   belongs to the earlier window and contributes hits to the later one without
--   being counted in it
create or replace table agg as
with h as (
  select m.reading, m.filter_set, w.range,
         count(distinct m.visitor)                    as visitors,
         count(*) filter (where m.name = 'pageview')        as pageviews,
         count(*) filter (where m.name <> 'engagement')     as events,
         count(*)                                     as hits_all
  from hit_match m join win w on m.epoch >= w.wfrom and m.epoch < w.wto
  group by 1, 2, 3
),
v as (
  select vm.reading, vm.mode, vm.filter_set, w.range,
         count(*)                                          as sessions_n,
         sum(vm.pageviews)                                 as pv_sum,
         sum(vm.duration)                                  as dur_sum,
         sum(vm.duration_incl)                             as dur_sum_incl,
         count(*) filter (where vm.duration > 0)                 as nonzero_dur_n,
         count(*) filter (where vm.entered)                      as bounce_denom,
         sum(vm.bounce) filter (where vm.entered)                as bounce_n,
         sum(vm.bounce)                                    as bounce_n_viewed
  from visit_match vm join win w on vm.start_epoch >= w.wfrom and vm.start_epoch < w.wto
  group by 1, 2, 3, 4
),
-- The frame is the full product of (reading, mode, filter set, range), not
-- whatever the data happened to populate: a cursor position with no matching
-- visit and no matching hit is a row of zeros, because an absent row would make
-- the cardinality check unable to see a fold that stopped emitting one.
--
-- In mode `entry_only` the hit-side columns are the rule's. That mode exists to
-- recompute the visit-side divisors for H7's probe and nothing reads anything else
-- from it; §10 takes `sessions_n` and no other column.
grade as (
  select r.reading, m.mode, s.id as filter_set, w.range
  from (select unnest(['rule', 'gap_ge_1800', 'gap_from_start', 'engagement_does_not_hold']) as reading) r
  cross join (select unnest(['rule', 'entry_only']) as mode) m
  cross join fset s cross join win w
)
select
  g.reading, g.mode, g.filter_set, g.range,
  coalesce(h.visitors, 0)       as visitors,
  coalesce(h.pageviews, 0)      as pageviews,
  coalesce(h.events, 0)         as events,
  coalesce(h.hits_all, 0)       as hits_all,
  coalesce(v.sessions_n, 0)     as sessions_n,
  coalesce(v.pv_sum, 0)         as pv_sum,
  coalesce(v.dur_sum, 0)        as dur_sum,
  coalesce(v.dur_sum_incl, 0)   as dur_sum_incl,
  coalesce(v.nonzero_dur_n, 0)  as nonzero_dur_n,
  coalesce(v.bounce_denom, 0)   as bounce_denom,
  coalesce(v.bounce_n, 0)       as bounce_n,
  coalesce(v.bounce_n_viewed, 0) as bounce_n_viewed
from grade g
left join h on h.reading = g.reading and h.filter_set = g.filter_set and h.range = g.range
left join v on v.reading = g.reading and v.mode = g.mode and v.filter_set = g.filter_set and v.range = g.range;

-- The vendor wraps every quotient in `ifNotFinite(…, 0)`, so a zero divisor is
-- 0 on both sides: not an error, not a NULL, not a NaN. ORACLE.md §3.5 cites the
-- three expressions. `q` is that rule, spelled once.
create or replace macro q(num, den, digits) as (
  case when den is null or den = 0 then 0.0 else round(num::double / den, digits) end
);

-- `value_text` is the value AFTER the metric's own rounding, as a plain decimal
-- string. It carries the rounding and nothing else — no unit, no humanisation.
-- A screen that renders `12m 30s` or a trailing `%` is graded on value_round
-- plus its own rendering test; putting the decoration here would make the oracle
-- an author of presentation.
create or replace macro txt(x, digits) as (
  case when digits = 0 then round(x)::bigint::varchar
       else format('{:.2f}', x) end
);

-- The top line: six metrics, and `events` is not one of them. ORACLE.md §2.1.
create or replace table topline as
select filter_set, range, 'visitors' as metric,
       visitors::double as value_num, null::double as value_den,
       visitors::double as value_round, visitors::varchar as value_text
from agg where reading = 'rule' and mode = 'rule'
union all select filter_set, range, 'visits',
       sessions_n, null, sessions_n, sessions_n::varchar
from agg where reading = 'rule' and mode = 'rule'
union all select filter_set, range, 'pageviews',
       pageviews, null, pageviews, pageviews::varchar
from agg where reading = 'rule' and mode = 'rule'
union all select filter_set, range, 'views_per_visit',
       pv_sum, sessions_n, q(pv_sum, sessions_n, 2), txt(q(pv_sum, sessions_n, 2), 2)
from agg where reading = 'rule' and mode = 'rule'
union all select filter_set, range, 'bounce_rate',
       bounce_n, bounce_denom, q(bounce_n * 100, bounce_denom, 0), txt(q(bounce_n * 100, bounce_denom, 0), 0)
from agg where reading = 'rule' and mode = 'rule'
union all select filter_set, range, 'visit_duration',
       dur_sum, sessions_n, q(dur_sum, sessions_n, 0), txt(q(dur_sum, sessions_n, 0), 0)
from agg where reading = 'rule' and mode = 'rule';

-- The graph. Three bucketed metrics over the complete grid, so an empty bucket
-- is a zero and not an absent row.
--
-- `visits` at hour granularity is over visit_hour and the other two are over
-- hits, which is why the hourly visit counts DO NOT sum to the daily figure and
-- that is correct. ORACLE.md §2.1's basis table states the asymmetry; anchor A6
-- is the vendor's own numbers for exactly this shape.
create or replace table hit_bucket as
select m.filter_set, g.range, g.grain, g.bucket_key,
       count(distinct m.visitor)                    as visitors,
       count(*) filter (where m.name = 'pageview')  as pageviews
from hit_match m
join win w on m.epoch >= w.wfrom and m.epoch < w.wto
join grid g on g.range = w.range
           and g.bucket_key = case g.grain when 'hour' then hour_key(m.epoch)
                                           when 'day'  then day_key(loc_day(m.epoch))
                                           else day_key(loc_week(m.epoch)) end
where m.reading = 'rule'
group by 1, 2, 3, 4;

create or replace table visit_bucket as
-- day and week: the bucket of the visit's START
select vm.filter_set, g.range, g.grain, g.bucket_key, count(*) as visits
from visit_match vm
join win w on vm.start_epoch >= w.wfrom and vm.start_epoch < w.wto
join grid g on g.range = w.range
           and g.grain in ('day', 'week')
           and g.bucket_key = case g.grain when 'day' then day_key(loc_day(vm.start_epoch))
                                           else day_key(loc_week(vm.start_epoch)) end
where vm.reading = 'rule' and vm.mode = 'rule'
group by 1, 2, 3, 4
union all
-- hour: every local hour the visit was open, whether or not a hit fell in it.
-- The bucket must be in the window; the visit need not have started in it, which
-- is what "open in that hour" means and is why these do not sum to the daily
-- figure.
select vm.filter_set, g.range, g.grain, g.bucket_key, count(distinct vh.session_id)
from visit_match vm
join visit_hour vh on vh.reading = vm.reading and vh.session_id = vm.session_id
join grid g on g.grain = 'hour' and g.bucket_key = vh.bucket_key
where vm.reading = 'rule' and vm.mode = 'rule'
group by 1, 2, 3, 4;

create or replace table bucket as
select s.id as filter_set, g.range, g.grain, g.bucket_key, g.ord,
       'visitors' as metric, coalesce(b.visitors, 0)::double as value_num
from grid g cross join fset s
left join hit_bucket b on b.filter_set = s.id and b.range = g.range
                      and b.grain = g.grain and b.bucket_key = g.bucket_key
union all
select s.id, g.range, g.grain, g.bucket_key, g.ord,
       'pageviews', coalesce(b.pageviews, 0)::double
from grid g cross join fset s
left join hit_bucket b on b.filter_set = s.id and b.range = g.range
                      and b.grain = g.grain and b.bucket_key = g.bucket_key
union all
select s.id, g.range, g.grain, g.bucket_key, g.ord,
       'visits', coalesce(b.visits, 0)::double
from grid g cross join fset s
left join visit_bucket b on b.filter_set = s.id and b.range = g.range
                        and b.grain = g.grain and b.bucket_key = g.bucket_key;

-- The four panels, each one extra slot on the cursor. A breakdown row is
-- therefore the same arithmetic as the top line with one more clause, which is
-- what makes H4 gradable at row level: under a page filter `bounce_denom` and
-- `sessions_n` are different numbers on the row itself.
create or replace table panel(id varchar, slot varchar);
insert into panel values ('page','f_page'), ('entry_page','f_entry_page'),
                         ('source','f_source'), ('browser','f_browser');

-- How many rows the dashboard panel keeps, and the order it keeps them in. The
-- vendor's dashboard issues its panel query as
--   order_by: [['visitors','desc'], ...dimensionOrderBy(dimensions)]
--   pagination: { limit: MAX_ITEMS, offset: 0 }        MAX_ITEMS = 9
-- (plausible/analytics assets/js/dashboard/stats/reports/index-breakdown.tsx:42,
-- :87, :89), where `dimensionOrderBy` appends `[dimension, 'asc']` for every
-- dimension outside CANNOT_ORDER_BY_DIMENSIONS = ['event:goal'] (stats/
-- breakdowns.tsx:235-241) and lib/plausible/stats/sql/query_builder.ex:217-226
-- turns each entry into a plain ORDER BY on the selected name. None of these four
-- panels is `event:goal`, so all four are ranked `visitors desc, dim_value asc`.
-- The full-panel screen orders the same way (stats/modals/details-breakdown.tsx
-- :131-134 over defaultOrderBy [['visitors','desc']]) and does not cut at nine.
--
-- The dimension leg decides membership and not merely order: this window holds
-- panels whose ninth and tenth rows have equal visitors, where the tie alone
-- settles which row the dashboard shows. §11 refuses a fixture that has lost
-- that, and `dim_value` is unique within a panel so the two legs together are a
-- total order. Both engines compare an uncollated string by its bytes, so the
-- ascending leg means the same thing here as it does in ClickHouse.
create or replace table panel_limit as select 9 as n;

-- The dimension values a panel offers are the values the window actually
-- contains under the cursor — from the data, never from the vocabulary.
create or replace table dimval as
select 'page' as panel, m.filter_set, w.range, m.pathname as dim_value
from hit_match m join win w on m.epoch >= w.wfrom and m.epoch < w.wto
where m.reading = 'rule'
group by 1, 2, 3, 4
union all
select 'entry_page', vm.filter_set, w.range, v.entry_page
from visit_match vm join visit v on v.reading = vm.reading and v.session_id = vm.session_id
                    join win w on vm.start_epoch >= w.wfrom and vm.start_epoch < w.wto
where vm.reading = 'rule' and vm.mode = 'rule'
group by 1, 2, 3, 4
union all
select 'source', vm.filter_set, w.range, v.src
from visit_match vm join visit v on v.reading = vm.reading and v.session_id = vm.session_id
                    join win w on vm.start_epoch >= w.wfrom and vm.start_epoch < w.wto
where vm.reading = 'rule' and vm.mode = 'rule'
group by 1, 2, 3, 4
union all
select 'browser', vm.filter_set, w.range, v.brw
from visit_match vm join visit v on v.reading = vm.reading and v.session_id = vm.session_id
                    join win w on vm.start_epoch >= w.wfrom and vm.start_epoch < w.wto
where vm.reading = 'rule' and vm.mode = 'rule'
group by 1, 2, 3, 4;

-- The cursor a drill-down writes: the enclosing filter set with the panel's own
-- slot set to `is:<value>`. All five slots travel together, because a form that
-- submits one slot PATCHes only that slot and leaves the other four standing,
-- which is how a reader reaches a two-slot cursor nothing grades.
create or replace table brk_cursor as
select d.panel, d.filter_set, d.range, d.dim_value,
       case when p.slot = 'f_page'       then 'is:' || d.dim_value else s.f_page       end as set_page,
       case when p.slot = 'f_entry_page' then 'is:' || d.dim_value else s.f_entry_page end as set_entry_page,
       case when p.slot = 'f_source'     then 'is:' || d.dim_value else s.f_source     end as set_source,
       case when p.slot = 'f_browser'    then 'is:' || d.dim_value else s.f_browser    end as set_browser,
       case when p.slot = 'f_name'       then 'is:' || d.dim_value else s.f_name       end as set_name
from dimval d join panel p on p.id = d.panel join fset s on s.id = d.filter_set;

-- The breakdown aggregate: the cursor's own slots, plus the panel's slot pinned
-- to the row's value.
create or replace table brk_agg as
with hh as (
  select c.panel, c.filter_set, c.range, c.dim_value,
         count(distinct f.visitor)                    as visitors,
         count(*) filter (where f.name = 'pageview')        as pageviews,
         count(*) filter (where f.name <> 'engagement')     as events
  from brk_cursor c
  join win w on w.range = c.range
  join fact f on f.reading = 'rule' and f.epoch >= w.wfrom and f.epoch < w.wto
  where slot_ok(f.pathname,      c.set_page)
    and slot_ok(f.name,          c.set_name)
    and slot_ok(f.entry_page,    c.set_entry_page)
    and slot_ok(f.visit_source,  c.set_source)
    and slot_ok(f.visit_browser, c.set_browser)
  group by 1, 2, 3, 4
),
vv as (
  select c.panel, c.filter_set, c.range, c.dim_value,
         count(*)                                     as sessions_n,
         sum(v.pageviews)                             as pv_sum,
         sum(v.duration)                              as dur_sum,
         count(*) filter (where slot_ok(v.entry_page, c.set_page))                   as bounce_denom,
         sum(v.bounce) filter (where slot_ok(v.entry_page, c.set_page))              as bounce_n
  from brk_cursor c
  join win w on w.range = c.range
  join visit v on v.reading = 'rule' and v.start_epoch >= w.wfrom and v.start_epoch < w.wto
  where (c.set_page = '' or exists (
           select 1 from fact f where f.reading = 'rule' and f.session_id = v.session_id
                                  and slot_ok(f.pathname, c.set_page)))
    and (c.set_name = '' or exists (
           select 1 from fact f where f.reading = 'rule' and f.session_id = v.session_id
                                  and slot_ok(f.name, c.set_name)))
    and slot_ok(v.entry_page, c.set_entry_page)
    and slot_ok(v.src,        c.set_source)
    and slot_ok(v.brw,        c.set_browser)
  group by 1, 2, 3, 4
)
select c.panel, c.filter_set, c.range, c.dim_value,
       c.set_page, c.set_entry_page, c.set_source, c.set_browser, c.set_name,
       row_number() over (partition by c.panel, c.filter_set, c.range
                          order by coalesce(hh.visitors, 0) desc, c.dim_value asc) as ord,
       coalesce(hh.visitors, 0)  as visitors,
       coalesce(hh.pageviews, 0) as pageviews,
       coalesce(hh.events, 0)    as events,
       coalesce(vv.sessions_n, 0) as sessions_n,
       coalesce(vv.pv_sum, 0)     as pv_sum,
       coalesce(vv.dur_sum, 0)    as dur_sum,
       coalesce(vv.bounce_denom, 0) as bounce_denom,
       coalesce(vv.bounce_n, 0)     as bounce_n
from brk_cursor c
left join hh on hh.panel = c.panel and hh.filter_set = c.filter_set and hh.range = c.range and hh.dim_value = c.dim_value
left join vv on vv.panel = c.panel and vv.filter_set = c.filter_set and vv.range = c.range and vv.dim_value = c.dim_value;

-- Six detailed metrics per row, `events` among them and `views_per_visit` not.
-- Between this and the top line every one of the seven Metric rows is a rendered
-- aggregate, which is what coverage.test.ts's axis anti-join needs.
--
-- `ord` is the row's POSITION in its panel under the vendor's ranking, carried on
-- all six metric rows because it is a property of the row and not of the number.
-- Without it a panel's selection and its order are graded by nothing: an app that
-- ranks by pageviews renders nine rows whose every number this file grades and
-- grades correctly, and both anti-joins stay silent. `ord <= panel_limit.n` is
-- the dashboard's nine; the full-panel screen renders every ord in the same
-- order.
--
-- `share` and `arc` are the geometry the picture is drawn from, and they are
-- graded like any other column: `share` is per-mille of the panel's largest
-- visitor count (the bar's width rule) and `arc` is the bounce percentage (the
-- circle's stroke-dasharray out of 100). They ride the rows they are derived
-- from rather than being repeated on all six.
create or replace table breakdown as
with mx as (
  select panel, filter_set, range, max(visitors) as top from brk_agg group by 1, 2, 3
)
select b.filter_set, b.range, b.panel, b.dim_value, b.ord, 'visitors' as metric,
       b.visitors::double as value_num, null::double as value_den,
       b.visitors::double as value_round, b.visitors::varchar as value_text,
       q(b.visitors * 1000, mx.top, 0) as share, null::double as arc,
       b.set_page, b.set_entry_page, b.set_source, b.set_browser, b.set_name
from brk_agg b join mx on mx.panel = b.panel and mx.filter_set = b.filter_set and mx.range = b.range
union all select filter_set, range, panel, dim_value, ord, 'visits',
       sessions_n, null, sessions_n, sessions_n::varchar, null, null,
       set_page, set_entry_page, set_source, set_browser, set_name from brk_agg
union all select filter_set, range, panel, dim_value, ord, 'pageviews',
       pageviews, null, pageviews, pageviews::varchar, null, null,
       set_page, set_entry_page, set_source, set_browser, set_name from brk_agg
union all select filter_set, range, panel, dim_value, ord, 'events',
       events, null, events, events::varchar, null, null,
       set_page, set_entry_page, set_source, set_browser, set_name from brk_agg
union all select filter_set, range, panel, dim_value, ord, 'bounce_rate',
       bounce_n, bounce_denom, q(bounce_n * 100, bounce_denom, 0),
       txt(q(bounce_n * 100, bounce_denom, 0), 0), null, q(bounce_n * 100, bounce_denom, 0),
       set_page, set_entry_page, set_source, set_browser, set_name from brk_agg
union all select filter_set, range, panel, dim_value, ord, 'visit_duration',
       dur_sum, sessions_n, q(dur_sum, sessions_n, 0),
       txt(q(dur_sum, sessions_n, 0), 0), null, null,
       set_page, set_entry_page, set_source, set_browser, set_name from brk_agg;

-- The axis. Five ticks from the 1/2/5 × 10^k rule over the graph's domain: the
-- step is the smallest such number with 4 × step >= the largest bucket value,
-- and the axis top is 4 × step. Written once here and once, independently, in
-- rollup.js.
--
-- The graph's series is `visitors`. Nothing in PLAN.md pins it, so the oracle
-- pins it: Scale and Tick are over the visitor counts of the displayed pair.
create or replace table scale as
with dom as (
  select filter_set, range, grain, max(value_num) as raw
  from bucket where metric = 'visitors' group by 1, 2, 3
),
stepped as (
  select *,
         case when raw <= 0 then 1.0 else pow(10, floor(log10(raw / 4.0))) end as decade
  from dom
),
nice as (
  select d.*,
         (select min(t.m) * d.decade
          from (select unnest([1.0, 2.0, 5.0, 10.0]) as m) t
          where t.m * d.decade * 4 >= d.raw) as step
  from stepped d
)
select filter_set, range, grain, raw as domain_raw, (step * 4) as domain_max, step
from nice;

create or replace table tick as
select s.filter_set, s.range, s.grain, i as ord,
       (s.step * i) as value_num,
       -- the position the row is placed at, per mille of the axis height
       case when s.domain_max = 0 then 0 else round(s.step * i * 1000.0 / s.domain_max) end as at_permille
from scale s, generate_series(0, 4) g(i);

-- The point list the columns are drawn from: x across the bucket ordinals, y
-- up from the axis floor, both per mille of one shared coordinate system.
-- path_d's exact string is stage 7's rendering decision and is pinned by
-- svg.test.ts; these are the numbers it must be built from, so the picture's
-- geometry is on the oracle even though its spelling is not.
create or replace table scale_point as
select b.filter_set, b.range, b.grain, b.ord,
       case when n.last = 0 then 0 else round(b.ord * 1000.0 / n.last) end as x_permille,
       case when s.domain_max = 0 then 1000 else round(1000 - b.value_num * 1000.0 / s.domain_max) end as y_permille
from bucket b
join scale s on s.filter_set = b.filter_set and s.range = b.range and s.grain = b.grain
join (select range, grain, max(ord) as last from grid group by 1, 2) n
  on n.range = b.range and n.grain = b.grain
where b.metric = 'visitors';

-- One chip per occupied slot, whose id IS the slot name because a click carries
-- no payload. Its five set_* columns are the cursor a removal writes: the same
-- filter set with this one slot emptied.
create or replace table chip as
select s.id as filter_set, p.slot, v.val as label,
       case when p.slot = 'f_page'       then '' else s.f_page       end as set_page,
       case when p.slot = 'f_entry_page' then '' else s.f_entry_page end as set_entry_page,
       case when p.slot = 'f_source'     then '' else s.f_source     end as set_source,
       case when p.slot = 'f_browser'    then '' else s.f_browser    end as set_browser,
       case when p.slot = 'f_name'       then '' else s.f_name       end as set_name
from fset s
cross join (select 'f_page' as slot union all select 'f_entry_page' union all
            select 'f_source' union all select 'f_browser' union all select 'f_name') p
cross join lateral (select case p.slot when 'f_page' then s.f_page
                                      when 'f_entry_page' then s.f_entry_page
                                      when 'f_source' then s.f_source
                                      when 'f_browser' then s.f_browser
                                      else s.f_name end as val) v
where v.val <> '';

-- Current visitors: `[as_of - 300, as_of)`, and filter-INDEPENDENT. H10.
create or replace table current as
select count(distinct visitor) as visitors
from hit, as_of where epoch >= as_of.t - 300 and epoch < as_of.t;


-- ===========================================================================
-- 7.5 The reachable closure
-- ===========================================================================

-- Every cursor a reader can stand on after ONE gesture from a declared shape:
-- pick a shape, click a breakdown row, or remove a chip. The dashboard's top
-- line is computed for all of them, so a number the reader lands on is graded
-- rather than compared to nothing.
--
-- The bound is one gesture, and it is a bound rather than a fixpoint: the graph
-- and the four panels under a reached cursor are NOT computed here, because the
-- panels under a reached cursor are the next gesture's cursors and the closure
-- does not terminate at any size this file can emit. What that costs is stated
-- and enforced in tests/coverage.ts's DECLINED_REACH, whose entries the reverse
-- anti-join reads.
create or replace table reach as
select 'declared' as origin_kind, s.id as origin, '' as origin_panel,
       '' as origin_range, '' as origin_value,
       s.f_page as c_page, s.f_entry_page as c_entry_page, s.f_source as c_source,
       s.f_browser as c_browser, s.f_name as c_name
from fset s
union all
select 'drilldown', c.filter_set, c.panel, c.range, c.dim_value,
       c.set_page, c.set_entry_page, c.set_source, c.set_browser, c.set_name
from brk_cursor c
union all
select 'chip', k.filter_set, k.slot, '', k.label,
       k.set_page, k.set_entry_page, k.set_source, k.set_browser, k.set_name
from chip k;

-- The cursor's identity is the five slots, spelled the way the route spells
-- them. Two gestures that reach the same five slots reach the same screen, so
-- the numbers are computed once per cursor and not once per gesture.
create or replace macro cursor_id(p, e, s, b, n) as (
  'f_page=' || p || '&f_entry_page=' || e || '&f_source=' || s ||
  '&f_browser=' || b || '&f_name=' || n
);

create or replace table reach_cursor as
select distinct cursor_id(c_page, c_entry_page, c_source, c_browser, c_name) as cursor,
       c_page, c_entry_page, c_source, c_browser, c_name
from reach;

-- The same six top-line metrics, under an arbitrary cursor. This is a SECOND
-- path to every declared shape's top line — §7's runs through `hit_match` and
-- `visit_match`, this one applies the slot predicates directly — and §11 asserts
-- the two agree on all 330 declared numbers.
create or replace table reach_agg as
with hh as (
  select c.cursor, w.range,
         count(distinct f.visitor)                       as visitors,
         count(*) filter (where f.name = 'pageview')      as pageviews
  from reach_cursor c
  cross join win w
  join fact f on f.reading = 'rule' and f.epoch >= w.wfrom and f.epoch < w.wto
  where slot_ok(f.pathname,      c.c_page)
    and slot_ok(f.name,          c.c_name)
    and slot_ok(f.entry_page,    c.c_entry_page)
    and slot_ok(f.visit_source,  c.c_source)
    and slot_ok(f.visit_browser, c.c_browser)
  group by 1, 2
),
vv as (
  select c.cursor, w.range,
         count(*)                                        as sessions_n,
         sum(v.pageviews)                                as pv_sum,
         sum(v.duration)                                 as dur_sum,
         count(*) filter (where slot_ok(v.entry_page, c.c_page))      as bounce_denom,
         sum(v.bounce) filter (where slot_ok(v.entry_page, c.c_page)) as bounce_n
  from reach_cursor c
  cross join win w
  join visit v on v.reading = 'rule' and v.start_epoch >= w.wfrom and v.start_epoch < w.wto
  where (c.c_page = '' or exists (
           select 1 from fact f where f.reading = 'rule' and f.session_id = v.session_id
                                  and slot_ok(f.pathname, c.c_page)))
    and (c.c_name = '' or exists (
           select 1 from fact f where f.reading = 'rule' and f.session_id = v.session_id
                                  and slot_ok(f.name, c.c_name)))
    and slot_ok(v.entry_page, c.c_entry_page)
    and slot_ok(v.src,        c.c_source)
    and slot_ok(v.brw,        c.c_browser)
  group by 1, 2
)
-- The frame is the full product of cursor and range, for the reason §7's is: the
-- closure's cardinality is a property of the vocabulary and must not move with
-- the data.
select c.cursor, w.range,
       coalesce(hh.visitors, 0)     as visitors,
       coalesce(hh.pageviews, 0)    as pageviews,
       coalesce(vv.sessions_n, 0)   as sessions_n,
       coalesce(vv.pv_sum, 0)       as pv_sum,
       coalesce(vv.dur_sum, 0)      as dur_sum,
       coalesce(vv.bounce_denom, 0) as bounce_denom,
       coalesce(vv.bounce_n, 0)     as bounce_n
from reach_cursor c cross join win w
left join hh on hh.cursor = c.cursor and hh.range = w.range
left join vv on vv.cursor = c.cursor and vv.range = w.range;

create or replace table reach_topline as
select cursor, range, 'visitors' as metric, visitors::double as value_num,
       null::double as value_den, visitors::double as value_round
from reach_agg
union all select cursor, range, 'visits', sessions_n, null, sessions_n from reach_agg
union all select cursor, range, 'pageviews', pageviews, null, pageviews from reach_agg
union all select cursor, range, 'views_per_visit', pv_sum, sessions_n, q(pv_sum, sessions_n, 2) from reach_agg
union all select cursor, range, 'bounce_rate', bounce_n, bounce_denom,
       q(bounce_n * 100, bounce_denom, 0) from reach_agg
union all select cursor, range, 'visit_duration', dur_sum, sessions_n, q(dur_sum, sessions_n, 0) from reach_agg;


-- ===========================================================================
-- 8. The vendor's own worked examples
-- ===========================================================================

-- ORACLE.md §3.5. Each cohort is isolated by a reserved visitor-id prefix and is
-- computed over its own hits with no window at all, because the vendor's cases
-- are about a metric and not about a range. Their asserted values live in
-- fixtures/anchors.json and are compared by fixture.test.ts BEFORE anything else
-- runs: a ground truth that disagrees with the vendor's own assertions is wrong
-- regardless of what the app does.
-- The prefix is READ from anchors.json rather than transcribed a second time: a
-- cohort isolated by a prefix that matches nothing produces no rows and no error,
-- so a second spelling of it is a way for the apparatus's only external witness to
-- disappear while every other assertion stays green. §11's `anchor_cohort_empty`
-- refuses that outcome; this join is what stops it from arising.
--
-- The filter is transcribed, because anchors.json states it in the vendor's own
-- prose ("visit:source is google") and the slot vocabulary is this app's.
create or replace table anchor_filter(id varchar, filter_slot varchar, filter_spec varchar);
-- A6 is absent: the vendor asserts it per hour bucket and not over the cohort, so
-- it has its own arm below. A cohort-level A6 row would be a number nothing
-- published, sitting in the one column of the output that is supposed to hold
-- only numbers this author did not write.
insert into anchor_filter values
  ('A1', '',         ''),
  ('A2', '',         ''),
  ('A3', 'f_source', 'is:google'),
  ('A4', 'f_page',   'is:/blog/why'),
  ('A5', '',         '');

create or replace table published as
select id, prefix from read_json('fixtures/anchors.json', columns={id: 'VARCHAR', prefix: 'VARCHAR'});

create or replace table anchor_cohort as
select p.id, p.prefix, f.filter_slot, f.filter_spec
from published p join anchor_filter f on f.id = p.id;

create or replace table anchor as
with hh as (
  select c.id as anchor, count(distinct f.visitor) as visitors,
         count(*) filter (where f.name = 'pageview')    as pageviews,
         count(*) filter (where f.name <> 'engagement') as events
  from anchor_cohort c
  join fact f on f.reading = 'rule' and f.visitor like c.prefix || '%'
  where (c.filter_slot <> 'f_page'   or slot_ok(f.pathname, c.filter_spec))
    and (c.filter_slot <> 'f_source' or slot_ok(f.visit_source, c.filter_spec))
  group by 1
),
vv as (
  select c.id as anchor, count(*) as sessions_n, sum(v.pageviews) as pv_sum,
         sum(v.duration) as dur_sum,
         count(*) filter (where c.filter_slot <> 'f_page' or slot_ok(v.entry_page, c.filter_spec)) as bounce_denom,
         sum(v.bounce) filter (where c.filter_slot <> 'f_page' or slot_ok(v.entry_page, c.filter_spec)) as bounce_n
  from anchor_cohort c
  join visit v on v.reading = 'rule' and v.visitor like c.prefix || '%'
  where (c.filter_slot <> 'f_page' or exists (
           select 1 from fact f where f.reading = 'rule' and f.session_id = v.session_id
                                  and slot_ok(f.pathname, c.filter_spec)))
    and (c.filter_slot <> 'f_source' or slot_ok(v.src, c.filter_spec))
  group by 1
)
select hh.anchor, null::varchar as bucket_key,
       hh.visitors, vv.sessions_n as visits, hh.pageviews, hh.events,
       q(vv.pv_sum, vv.sessions_n, 2)                  as views_per_visit,
       q(vv.bounce_n * 100, vv.bounce_denom, 0)        as bounce_rate,
       q(vv.dur_sum, vv.sessions_n, 0)                 as visit_duration
from hh join vv on vv.anchor = hh.anchor
union all
-- A6 is asserted per hour bucket rather than over the cohort, so it gets its own
-- arm. Its visit_duration column is the vendor's hour attribution, which this app
-- declines (§2.1's basis table), so the anchor grades visits, visitors and
-- pageviews and leaves duration null: an anchor for a decline, not for a number.
select 'A6', vh.bucket_key,
       (select count(distinct f.visitor) from fact f
        where f.reading = 'rule' and f.visitor like (select prefix from published where id = 'A6') || '%' and hour_key(f.epoch) = vh.bucket_key),
       count(distinct vh.session_id),
       (select count(*) from fact f
        where f.reading = 'rule' and f.visitor like (select prefix from published where id = 'A6') || '%' and f.name = 'pageview'
          and hour_key(f.epoch) = vh.bucket_key),
       null, null, null, null
from visit_hour vh
where vh.reading = 'rule' and vh.visitor like (select prefix from published where id = 'A6') || '%'
group by vh.bucket_key;


-- ===========================================================================
-- 9. The 30 functional-dependency probes
-- ===========================================================================

-- No column of the log is a function of another: for every ordered pair drawn
-- from the six dimension columns the log must contain two rows that agree on the
-- first and differ on the second. This is what keeps `interactive` from being a
-- spelling of `name`. A pair with no such witness is a finding, and it is a
-- finding about a whole CLASS of defect rather than about one instance.
create or replace table col(name varchar);
insert into col values ('visitor'), ('name'), ('interactive'), ('pathname'), ('source'), ('browser');

create or replace macro colval(h, c) as (
  case c when 'visitor' then h.visitor when 'name' then h.name
         when 'interactive' then h.interactive when 'pathname' then h.pathname
         when 'source' then h.source else h.browser end
);

create or replace table dependency as
select a.name as determinant, b.name as dependent,
       (select count(*) from (
          select 1 from hit h
          group by colval(h, a.name)
          having count(distinct colval(h, b.name)) > 1
          limit 1)) > 0 as independent
from col a cross join col b
where a.name <> b.name;


-- ===========================================================================
-- 10. The named wrong readings
-- ===========================================================================

-- ORACLE.md §4.2. A hard case on which the rule and every one of its named wrong
-- readings coincide over this fixture is NOT a hard case, and the run must say
-- so. Every probe below is therefore a pair of numbers computed by two
-- executable formulations, never SQL against prose, and fixture.test.ts asserts
-- the two differ.
create or replace table wrong as
-- H1: three alternative partitions, probed on the total visit count
select 'gap_ge_1800' as reading, 'H1' as hard_case, 'visits over the log' as probe,
       (select count(*) from visit where reading = 'rule')        as value_rule,
       (select count(*) from visit where reading = 'gap_ge_1800') as value_wrong
union all select 'gap_from_start', 'H1', 'visits over the log',
       (select count(*) from visit where reading = 'rule'),
       (select count(*) from visit where reading = 'gap_from_start')
union all select 'engagement_does_not_hold', 'H1', 'visits over the log',
       (select count(*) from visit where reading = 'rule'),
       (select count(*) from visit where reading = 'engagement_does_not_hold')
union all
-- H2: the hourly visit counts summed, against the windows' own visit counts.
-- Both hour-grain ranges at once, because H2's plant is one multi-hour visit and
-- only these two days carry an hour axis: a probe pinned to one of them cannot
-- see a plant that landed on the other.
select 'hourly_visits_summed', 'H2', 'visits over the two hour-grain ranges',
       (select sum(value_num) from topline t join pair p on p.range = t.range and p.grain = 'hour'
        where t.filter_set = 'none' and t.metric = 'visits'),
       (select sum(value_num) from bucket where filter_set = 'none' and grain = 'hour' and metric = 'visits')
union all
-- H3: the daily visitor counts summed, against the range's distinct count
select 'visitors_summed', 'H3', '(none, 28d, day) visitors',
       (select value_num from topline where filter_set = 'none' and range = '28d' and metric = 'visitors'),
       (select sum(value_num) from bucket where filter_set = 'none' and range = '28d'
                                            and grain = 'day' and metric = 'visitors')
union all
-- H4: bounce rate over the visits that ENTERED a matching page, against the
-- visits that merely viewed one
select 'bounce_on_viewed_page', 'H4', '(event-1, 28d) bounce_rate',
       (select q(bounce_n * 100, bounce_denom, 0) from agg
        where reading = 'rule' and mode = 'rule' and filter_set = 'event-1' and range = '28d'),
       (select q(bounce_n_viewed * 100, sessions_n, 0) from agg
        where reading = 'rule' and mode = 'rule' and filter_set = 'event-1' and range = '28d')
union all
-- H5: events counting every hit, engagement pings included
select 'events_count_every_hit', 'H5', '(none, 28d) events',
       (select events   from agg where reading = 'rule' and mode = 'rule' and filter_set = 'none' and range = '28d'),
       (select hits_all from agg where reading = 'rule' and mode = 'rule' and filter_set = 'none' and range = '28d')
union all
-- H6: zero-duration visits dropped from the divisor
select 'duration_drops_zero', 'H6', '(none, 28d) visit_duration',
       (select q(dur_sum, sessions_n, 0)    from agg where reading = 'rule' and mode = 'rule' and filter_set = 'none' and range = '28d'),
       (select q(dur_sum, nonzero_dur_n, 0) from agg where reading = 'rule' and mode = 'rule' and filter_set = 'none' and range = '28d')
union all
-- H6: an engagement ping extending the duration
select 'duration_includes_engagement', 'H6', '(none, 28d) visit_duration',
       (select q(dur_sum, sessions_n, 0)      from agg where reading = 'rule' and mode = 'rule' and filter_set = 'none' and range = '28d'),
       (select q(dur_sum_incl, sessions_n, 0) from agg where reading = 'rule' and mode = 'rule' and filter_set = 'none' and range = '28d')
union all
-- H7: the visit row filtered on `page` as though `page` were its entry page.
-- Graded on `visits`, because the rule and this reading agree on bounce_rate:
-- the divisor is empty under `unentered`, and an empty divisor is 0 on both
-- sides by the vendor's own ifNotFinite coalesce.
select 'visit_row_filtered_on_page', 'H7', '(unentered, 28d) visits',
       (select sessions_n from agg where reading = 'rule' and mode = 'rule'       and filter_set = 'unentered' and range = '28d'),
       (select coalesce(max(sessions_n), 0) from agg where reading = 'rule' and mode = 'entry_only' and filter_set = 'unentered' and range = '28d')
union all
-- H8: the four grid readings, probed on a bucket count
select 'utc_day_buckets', 'H8', '28d day buckets',
       (select count(*) from grid where range = '28d' and grain = 'day'),
       (select count(*) from grid_wrong where reading = 'utc_day_buckets' and range = '28d' and grain = 'day')
union all select 'week_starts_sunday', 'H8', 'custom_21d week buckets',
       (select count(*) from grid where range = 'custom_21d' and grain = 'week'),
       (select count(*) from grid_wrong where reading = 'week_starts_sunday' and range = 'custom_21d' and grain = 'week')
union all select 'window_by_multiplication', 'H8', '28d day buckets',
       (select count(*) from grid where range = '28d' and grain = 'day'),
       (select count(*) from grid_wrong where reading = 'window_by_multiplication' and range = '28d' and grain = 'day')
union all select 'twenty_four_bars', 'H8', 'custom_dst_day hour buckets',
       (select count(*) from grid where range = 'custom_dst_day' and grain = 'hour'),
       (select count(*) from grid_wrong where reading = 'twenty_four_bars' and range = 'custom_dst_day' and grain = 'hour')
union all
-- H9: one divisor reused for all three averages, probed on the two divisors
select 'one_divisor_for_both', 'H9', '(event-1, 28d) bounce divisor vs visit divisor',
       (select bounce_denom from agg where reading = 'rule' and mode = 'rule' and filter_set = 'event-1' and range = '28d'),
       (select sessions_n   from agg where reading = 'rule' and mode = 'rule' and filter_set = 'event-1' and range = '28d')
union all
-- H10: current visitors with the filter set applied
select 'current_visitors_filtered', 'H10', 'current visitors',
       (select visitors from current),
       (select count(distinct m.visitor) from hit_match m, as_of
        where m.reading = 'rule' and m.filter_set = 'visit-1'
          and m.epoch >= as_of.t - 300 and m.epoch < as_of.t)
union all
-- H2: a visit's open span ended at its last non-engagement hit rather than at
-- its last hit of any name. Not one of ORACLE.md §4.2's sixteen: it is the
-- alternative this file's own reading of "the hours it was open" rules out, and
-- it is emitted so a run says whether the fixture distinguishes them at all.
select 'hours_from_nonengagement', 'H2', 'SessionHour rows over the log',
       (select count(*) from visit_hour where reading = 'rule'),
       (select count(*) from visit_hour_live);


-- ===========================================================================
-- 11. The preconditions, raised rather than degraded
-- ===========================================================================

-- A precondition this file cannot meet is a row here, and fixture.test.ts
-- asserts the list empty. Nothing below has a fallback: a violated precondition
-- does not make the oracle answer differently, it makes the oracle refuse.
create or replace table violation as
select 'zone_vs_icu' as gate,
       'window ' || w.range || ' from=' || w.wfrom || ' to=' || w.wto ||
       '; ICU says from=' || i.wfrom || ' to=' || i.wto as detail
from win w join win_icu i on i.range = w.range
where w.wfrom <> i.wfrom or w.wto <> i.wto
union all
-- the stamps the app must reproduce, computed a second way through ICU
select 'local_stamp_vs_icu',
       'hit ' || h.id || ' at ' || h.epoch || ': zone rows say ' || hour_key(h.epoch) ||
       ', ICU says ' || strftime(to_timestamp(h.epoch) at time zone 'Europe/Berlin', '%Y-%m-%d %H')
from hit h
where hour_key(h.epoch) <> strftime(to_timestamp(h.epoch) at time zone 'Europe/Berlin', '%Y-%m-%d %H')
union all
select 'week_stamp_vs_icu',
       'hit ' || h.id || ': zone rows say week of ' || day_key(loc_week(h.epoch)) ||
       ', ICU says ' || strftime(date_trunc('week', to_timestamp(h.epoch) at time zone 'Europe/Berlin'), '%Y-%m-%d')
from hit h
where day_key(loc_week(h.epoch))
   <> strftime(date_trunc('week', to_timestamp(h.epoch) at time zone 'Europe/Berlin'), '%Y-%m-%d')
union all
-- a bucket key repeated within one pair would make the key set a lie
select 'bucket_key_not_unique', range || '/' || grain || ' repeats ' || bucket_key
from grid group by range, grain, bucket_key having count(*) > 1
union all
-- and the case that would produce one: a Zone table with no step back never
-- reaches a local hour twice, so the refusal above would grade nothing and an
-- app that renders a 25-hour day as 24 buckets would agree with this file
select 'clock_never_steps_back', 'no local hour of these Zone rows is reached by two UTC hours'
from (select 1) where not exists (select 1 from clock_repeat)
union all
-- an operator outside the closed vocabulary reads as "no match" and would
-- silently empty a filter set
select 'unknown_slot_operator', 'filter set ' || id || ' slot value ' || v
from fset, lateral (select unnest([f_page, f_entry_page, f_source, f_browser, f_name]) as v)
where v <> '' and slot_op(v) not in ('is', 'not', 'has')
union all
-- a substring disjunction, which slot_ok does not implement
select 'has_with_disjunction', 'filter set ' || id || ' slot value ' || v
from fset, lateral (select unnest([f_page, f_entry_page, f_source, f_browser, f_name]) as v)
where slot_op(v) = 'has' and contains(v, '|')
union all
-- a negated event-scoped slot means two different things depending on whether the
-- negation is inside or outside the containment quantifier, and this file only
-- implements one of them
select 'negated_event_slot', 'filter set ' || id || ' negates an event-scoped slot'
from fset where slot_op(f_page) = 'not' or slot_op(f_name) = 'not'
union all
-- a visit opened by an engagement ping would make "the visit's first hit" and
-- "its first non-engagement hit" two different rows
select 'visit_opens_on_engagement', 'visit ' || session_id
from visit where reading = 'rule' and first_name = 'engagement'
union all
-- a visit with no page view has no entry or exit page, and the vendor answers
-- the empty string. This file does not spell that answer, so it refuses the case
-- instead of emitting a null the comparison would read as "any value".
select 'visit_has_no_pageview', 'visit ' || session_id
from visit where reading = 'rule' and pageviews = 0
union all
-- an interactive page view would separate "did nothing interactive" from "no
-- interactive hit that was not a page view", which is the difference between the
-- sidecar's bounce and the vendor's
select 'interactive_pageview', 'hit ' || id
from hit where name = 'pageview' and interactive = 'true'
union all
-- `interactive` is compared as text, so a fixture that starts writing it as 1/0
-- or "yes" would read as false on every hit and clear no bounce anywhere
select 'interactive_not_boolean', 'hit ' || id || ' has interactive=' || interactive
from hit where interactive not in ('true', 'false')
union all
-- a cohort isolated by a prefix that matches nothing is the ground truth's own
-- external witness gone, and every other assertion here stays green without it
select 'anchor_cohort_empty', 'anchor ' || c.id || ' matches no hit under prefix ' || c.prefix
from anchor_cohort c
where not exists (select 1 from hit h where h.visitor like c.prefix || '%')
union all
select 'anchor_cohort_empty', 'anchor ' || p.id || ' matches no hit under prefix ' || p.prefix
from published p
where p.id not in (select id from anchor_cohort)
  and not exists (select 1 from hit h where h.visitor like p.prefix || '%')
union all
-- a published case this file computes nothing for is an assertion the run never makes
select 'anchor_not_graded', 'anchor ' || p.id || ' is published and produces no row'
from published p
where not exists (select 1 from anchor a where a.anchor = p.id)
union all
-- a cursor slot no declared shape occupies is a column of the read grammar that
-- no graded number depends on: a rollup that never reads it produces identical
-- output on every assertion in this file, and the escape is invisible because
-- every number still agrees
select 'slot_never_graded', 'no declared filter shape occupies ' || slot
from (select unnest(['f_page', 'f_entry_page', 'f_source', 'f_browser', 'f_name']) as slot) s
where not exists (
  select 1 from fset f
  where case s.slot when 'f_page' then f.f_page when 'f_entry_page' then f.f_entry_page
                    when 'f_source' then f.f_source when 'f_browser' then f.f_browser
                    else f.f_name end <> '')
union all
-- a reachable cursor the closure computes no top line for. §7.5's frame is the
-- full product of cursor and range, so this fires only if the closure and the
-- gesture set have come apart
select 'reach_not_graded', 'cursor ' || c.cursor || ' is reachable and has no top line at ' || w.range
from reach_cursor c cross join win w
where not exists (select 1 from reach_topline t where t.cursor = c.cursor and t.range = w.range)
union all
-- §7.5 and §7 must agree on every declared shape. They compute the same six
-- numbers by different routes — §7 through `hit_match` and `visit_match`, §7.5
-- by applying the slot predicates to `fact` and `visit` directly — so this is
-- the one place the declared top line is checked against a second reader
select 'reach_vs_declared',
       'shape ' || s.id || ' ' || t.range || ' ' || t.metric || ': §7 says ' || tl.value_round ||
       ', the closure says ' || t.value_round
from fset s
join reach_topline t on t.cursor = cursor_id(s.f_page, s.f_entry_page, s.f_source, s.f_browser, s.f_name)
join topline tl on tl.filter_set = s.id and tl.range = t.range and tl.metric = t.metric
where tl.value_round <> t.value_round
union all
-- clicking a breakdown row must land on the number the row showed. The panel's
-- arithmetic and the landed cursor's arithmetic are written separately, and a
-- reader who sees 42 visitors on a row and 41 after the click is looking at two
-- different definitions of the same filter
select 'reach_vs_breakdown',
       'clicking ' || r.origin_panel || ' ' || r.origin_value || ' from ' || r.origin ||
       ' at ' || r.origin_range || ' shows ' || b.value_round || ' ' || b.metric ||
       ' and lands on ' || t.value_round
from reach r
join reach_topline t on t.cursor = cursor_id(r.c_page, r.c_entry_page, r.c_source, r.c_browser, r.c_name)
                    and t.range = r.origin_range
join breakdown b on b.filter_set = r.origin and b.range = r.origin_range
                and b.panel = r.origin_panel and b.dim_value = r.origin_value
                and b.metric = t.metric
where r.origin_kind = 'drilldown' and b.value_round <> t.value_round
union all
-- a panel that never overflows nine rows never exercises the cut, and an app that
-- renders every row it has agrees with one that ranks them wrongly
select 'panel_never_truncates', 'no panel holds more than ' || (select n from panel_limit) || ' rows'
from (select 1) where not exists (
  select 1 from brk_agg group by panel, filter_set, range
  having count(*) > (select n from panel_limit))
union all
-- a fixture with no visitors tie inside a panel grades the ranking's first leg
-- and nothing else: `visitors desc` alone is then a total order, and an app that
-- omits the dimension leg is byte-identical to one that has it
select 'panel_tie_never_exercised', 'no panel holds two rows with equal visitors'
from (select 1) where not exists (
  select 1 from brk_agg group by panel, filter_set, range, visitors having count(*) > 1)
union all
-- and the case where the tie decides MEMBERSHIP rather than order: rows n and
-- n+1 tied across the cut. Lose this and the tie rule can only reorder rows the
-- dashboard was going to show anyway
select 'panel_tie_never_cuts', 'no panel is tied on visitors across row ' || (select n from panel_limit)
from (select 1) where not exists (
  select 1 from brk_agg a join brk_agg b
    on b.panel = a.panel and b.filter_set = a.filter_set and b.range = a.range
   and b.ord = a.ord + 1 and b.visitors = a.visitors
  where a.ord = (select n from panel_limit))
union all
-- a visit open across an hour-grain window's own opening. `visit_bucket`'s hour
-- arm asks only that the BUCKET be in the window; without such a visit that
-- reading and the narrower one which also requires the visit to have STARTED in
-- the window are the same function over this fixture, and an app that implements
-- either agrees with this file
select 'visit_open_across_opening_never_exercised',
       'no visit is open across the opening of an hour-grain window'
from (select 1) where not exists (
  select 1 from win w join pair p on p.range = w.range and p.grain = 'hour'
  join visit v on v.reading = 'rule' and v.start_epoch < w.wfrom and v.last_epoch >= w.wfrom)
union all
-- the fixture's clock change, asserted as the integer it is: 21 twenty-four-hour
-- days would be 1814400
select 'custom_21d_span',
       'custom_21d spans ' || (wto - wfrom) || 's; 1810800 is one hour short of 21 days'
from win where range = 'custom_21d' and (wto - wfrom) <> 1810800
union all
select 'custom_dst_day_span',
       'custom_dst_day spans ' || (wto - wfrom) || 's; the 23-hour local day is 82800'
from win where range = 'custom_dst_day' and (wto - wfrom) <> 82800
union all
-- a column of the log that IS a function of another
select 'derivable_column',
       determinant || ' -> ' || dependent || ' is a function over the log'
from dependency where not independent
union all
-- two ranges that produce the same top line grade nothing new between them
select 'ranges_agree',
       'ranges ' || a.range || ' and ' || b.range || ' agree on every top-line row for filter set ' || a.filter_set
from (select filter_set, range, list({m: metric, v: value_round} order by metric) as sig
      from topline group by 1, 2) a
join (select filter_set, range, list({m: metric, v: value_round} order by metric) as sig
      from topline group by 1, 2) b
  on b.filter_set = a.filter_set and b.range > a.range and b.sig = a.sig
union all
-- a wrong reading that agrees with the rule is not a wrong reading, and the case
-- it belongs to is not a hard case
select 'no_discrimination',
       hard_case || ' reading ' || reading || ' does not discriminate: both give ' || value_rule || ' on ' || probe
from wrong where value_rule = value_wrong;


-- ===========================================================================
-- 12. The output contract
-- ===========================================================================

-- `duckdb -json` emits one JSON document per RESULT-PRODUCING statement, so a
-- script ending in several SELECTs writes several concatenated arrays and
-- JSON.parse throws at the start of the second. Verified: `select 1 as a; select
-- 2 as b;` prints `[{"a":1}]` then `[{"b":2}]`. CREATE and INSERT print nothing,
-- which is what lets the steps above be named tables instead of one nested CTE
-- chain: the file is a sequence a reviewer can read and re-run a step of, AND a
-- single document.
--
-- So there is exactly one statement below. It returns exactly one row whose
-- columns are the answer sets, each a `list` of structs with its own column list,
-- so nothing is null-padded into a shared shape and every set keeps its types. A
-- discriminant-column UNION would have cost both.
--
-- `JSON.parse(stdout)[0]` is the whole ground truth. A SQL error goes to stderr
-- and exits 1, so the caller checks the exit code before parsing.
--
-- Every list is wrapped in `coalesce(…, [])`, and that is not decoration: `list()`
-- over an empty relation returns NULL, not an empty list. Unwrapped, the one
-- column whose emptiness is the SUCCESS case — `violation` — arrives as null on a
-- clean run, and a cardinality check that cannot tell "no rows" from "no opinion"
-- is a check that passes when the oracle has stopped answering.
select
  coalesce((select list({filter_set: filter_set, range: range, metric: metric,
                value_num: value_num, value_den: value_den,
                value_round: value_round, value_text: value_text}
               order by filter_set, range, metric) from topline), []) as topline,
  coalesce((select list({filter_set: filter_set, range: range, grain: grain,
                bucket_key: bucket_key, ord: ord, metric: metric, value_num: value_num}
               order by filter_set, range, grain, metric, ord) from bucket), []) as bucket,
  -- Ordered by `ord` rather than by `dim_value`, so the emitted list IS the panel
  -- as the reader sees it and a diff of two runs shows a re-ranking as movement.
  coalesce((select list({filter_set: filter_set, range: range, panel: panel, dim_value: dim_value,
                ord: ord, metric: metric, value_num: value_num, value_den: value_den,
                value_round: value_round, value_text: value_text,
                share: share, arc: arc,
                set_page: set_page, set_entry_page: set_entry_page, set_source: set_source,
                set_browser: set_browser, set_name: set_name}
               order by filter_set, range, panel, ord, metric) from breakdown), []) as breakdown,
  coalesce((select list({filter_set: filter_set, range: range, grain: grain, ord: ord,
                value_num: value_num, at_permille: at_permille}
               order by filter_set, range, grain, ord) from tick), []) as tick,
  coalesce((select list({filter_set: filter_set, range: range, grain: grain,
                domain_raw: domain_raw, domain_max: domain_max, step: step}
               order by filter_set, range, grain) from scale), []) as scale,
  coalesce((select list({filter_set: filter_set, range: range, grain: grain, ord: ord,
                x_permille: x_permille, y_permille: y_permille}
               order by filter_set, range, grain, ord) from scale_point), []) as scale_point,
  coalesce((select list({filter_set: filter_set, slot: slot, label: label,
                set_page: set_page, set_entry_page: set_entry_page, set_source: set_source,
                set_browser: set_browser, set_name: set_name}
               order by filter_set, slot) from chip), []) as chip,
  -- `bounce` is an integer inside this file because bounce_n sums it, and a
  -- boolean here because that is what the sidecar carries and fixture.test.ts
  -- compares the two column by column with no coercion of its own.
  coalesce((select list({session_id: session_id, visitor: visitor, ord: ord,
                start_epoch: start_epoch, last_epoch: last_epoch,
                entry_page: entry_page, exit_page: exit_page,
                pageviews: pageviews, events: events, bounce: bounce = 1, duration: duration,
                source: src, browser: brw}
               order by visitor, ord) from visit where reading = 'rule'), []) as session,
  coalesce((select list({session_id: session_id, bucket_key: bucket_key}
               order by session_id, bucket_key) from visit_hour where reading = 'rule'), []) as session_hour,
  coalesce((select list({range: range, grain: grain, ord: ord, bucket_key: bucket_key, b_from: b_from}
               order by range, grain, ord) from grid), []) as grid,
  -- The closure, as its gestures and then as its numbers. `reach` is what a
  -- reader can be standing on after one gesture; `reach_topline` is what the
  -- oracle says the top line reads there. Every declared shape is in both, so
  -- `topline` is a subset of `reach_topline` by value and the two are held equal
  -- by §11 rather than by construction.
  coalesce((select list({origin_kind: origin_kind, origin: origin, origin_panel: origin_panel,
                origin_range: origin_range, origin_value: origin_value,
                cursor: cursor_id(c_page, c_entry_page, c_source, c_browser, c_name),
                c_page: c_page, c_entry_page: c_entry_page, c_source: c_source,
                c_browser: c_browser, c_name: c_name}
               order by origin_kind, origin, origin_panel, origin_range, origin_value) from reach), []) as reach,
  coalesce((select list({cursor: cursor, range: range, metric: metric,
                value_num: value_num, value_den: value_den, value_round: value_round}
               order by cursor, range, metric) from reach_topline), []) as reach_topline,
  coalesce((select list({anchor: anchor, bucket_key: bucket_key, visitors: visitors, visits: visits,
                pageviews: pageviews, events: events, views_per_visit: views_per_visit,
                bounce_rate: bounce_rate, visit_duration: visit_duration}
               order by anchor, bucket_key) from anchor), []) as anchor,
  coalesce((select list({reading: reading, hard_case: hard_case, probe: probe,
                value_rule: value_rule, value_wrong: value_wrong}
               order by hard_case, reading) from wrong), []) as wrong,
  coalesce((select list({determinant: determinant, dependent: dependent, independent: independent}
               order by determinant, dependent) from dependency), []) as dependency,
  coalesce((select list({gate: gate, detail: detail} order by gate, detail) from violation), []) as violation,
  coalesce((select list({bucket_key: bucket_key, first_slot: first_slot, second_slot: second_slot}
               order by bucket_key) from clock_repeat), []) as clock_repeat,
  coalesce((select list({range: range, wfrom: wfrom, wto: wto, span: wto - wfrom}
               order by range) from win), []) as windows,
  (select visitors from current) as current_visitors,
  (select n from panel_limit) as panel_rows,
  1860 as session_gap_seconds;
