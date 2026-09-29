// rollup — the live cursor becomes every number on the screen.
//
// Reads ONE cursor row, through `data-read-cursor="filter?id=eq.{param.preset}"`,
// so there is no precedence branch anywhere below: the window, the granularity
// and the five filter slots all come from that row and from nothing else. A
// route parameter reaches the arithmetic this way and never through a write.
//
// It computes only the ACTIVE cursor position and deletes every row it did not
// recompute, which is what makes the write total and keeps `Breakdown` bounded.
// It is live on none of its own sinks, so it never self-wakes; one run per input
// change is all it gets, and the differential write is what makes that correct.

const SLOTS = ["f_page", "f_entry_page", "f_source", "f_browser", "f_name"];

const txt = (v) => String(v === undefined || v === null ? "" : v);
const num = (v) => (Number(v) || 0);
const p2 = (n) => (n < 10 ? "0" + n : "" + n);

// The vendor wraps every quotient in `ifNotFinite(…, 0)`, so a zero divisor
// answers 0 — not an error, not a NaN.
const q = (n, d, digits) => {
  if (!d) return 0;
  const f = Math.pow(10, digits);
  return Math.round((n / d) * f) / f;
};
// The rendered strings carry the metric's own rounding and nothing else: no
// unit, no humanisation. A `%` inside one would put the oracle in the business
// of grading presentation, so the screens set their units beside them.
const t0 = (x) => String(Math.round(x));
const t2 = (x) => x.toFixed(2);

// --- the clock, as arithmetic over the Zone rows ----------------------------

const zonesOf = (rows) =>
  (rows.zone ?? []).map((z) => ({ s: sec(z.starts_epoch), o: num(z.offset_seconds) }))
    .sort((a, b) => a.s - b.s);

const offsetAt = (zs, epoch) => {
  let found = null;
  for (const z of zs) if (z.s <= epoch) found = z.o;
  if (found === null) throw new Error("no Zone row covers epoch " + epoch);
  return found;
};

// The offset at a local midnight is a different lookup from the offset at an
// instant: the instant is not known until the offset is chosen.
const offsetOfLocalDay = (zs, d) => {
  let found = null;
  for (const z of zs) if (z.s <= d * 86400 - z.o) found = z.o;
  if (found === null) throw new Error("no Zone row covers local day " + d);
  return found;
};

const civilFromDays = (z0) => {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return [y + (m <= 2 ? 1 : 0), m, d];
};

// Every instant this seat reads is a `timestamp` carrier — RFC 3339 in UTC with
// six fractional digits — and the clock above is whole UTC seconds, as the
// vendor's is: its NaiveDateTime diffs truncate, so an instant counts as the
// second it falls in. `sec` crosses that line (`num` would read the string as
// 0). An instant this seat writes is the one it read, never one rebuilt from its
// second, so a fraction is never lost; `instant` spells only the whole-second
// boundaries the clock computes.
const daysFromCivil = (y0, m, d) => {
  const y = y0 - (m <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
};
const sec = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.\d{6}Z$/.exec(txt(v));
  if (m === null) throw new Error("not a timestamp: " + txt(v));
  return daysFromCivil(Number(m[1]), Number(m[2]), Number(m[3])) * 86400 +
    Number(m[4]) * 3600 + Number(m[5]) * 60 + Number(m[6]);
};
const instant = (t) => {
  if (!Number.isInteger(t)) throw new Error("not a whole second: " + t);
  const day = Math.floor(t / 86400);
  const ymd = civilFromDays(day);
  const s = t - day * 86400;
  return ymd[0] + "-" + p2(ymd[1]) + "-" + p2(ymd[2]) + "T" +
    p2(Math.floor(s / 3600)) + ":" + p2(Math.floor(s / 60) % 60) + ":" + p2(s % 60) + ".000000Z";
};

const isoOfIndex = (d) => {
  const ymd = civilFromDays(d);
  return ymd[0] + "-" + p2(ymd[1]) + "-" + p2(ymd[2]);
};

const locSec = (zs, t) => t + offsetAt(zs, t);
const locDay = (zs, t) => Math.floor(locSec(zs, t) / 86400);
const locHour = (zs, t) => Math.floor((locSec(zs, t) % 86400) / 3600);
const locWeek = (zs, t) => locDay(zs, t) - ((locDay(zs, t) + 3) % 7);
// The UTC instant a local day begins. `back(m, k)` is this applied to a civil
// date index and never `m - k * 86400`: over the clock change the two differ by
// an hour, and that hour holds a hit.
const dayStart = (zs, d) => d * 86400 - offsetOfLocalDay(zs, d);
const dayKey = (zs, t) => isoOfIndex(locDay(zs, t));
const weekKey = (zs, t) => isoOfIndex(locWeek(zs, t));
const hourKey = (zs, t) => isoOfIndex(locDay(zs, t)) + " " + p2(locHour(zs, t));

// --- the slot grammar -------------------------------------------------------

// The operator rides inside the slot's value, so no filter value ever carries a
// `&` or an `=` and the whole vocabulary stays out of the read grammar's way.
// An unrecognised operator raises rather than reading as "no match".
const slotOk = (value, spec) => {
  if (spec === "") return true;
  const i = spec.indexOf(":");
  if (i < 0) throw new Error("filter slot has no operator: " + spec);
  const op = spec.slice(0, i);
  const arg = spec.slice(i + 1);
  if (op === "is") return arg.split("|").indexOf(value) !== -1;
  if (op === "not") return arg.split("|").indexOf(value) === -1;
  if (op === "has") {
    if (arg.indexOf("|") !== -1) throw new Error("has: takes one alternative: " + spec);
    return value.indexOf(arg) !== -1;
  }
  throw new Error("unknown filter operator in " + spec);
};

// A visit matches an EVENT-scoped slot by containment — any of its hits does.
// The fenced set `stitch` writes is that hit set, and splitting it back apart is
// what makes `not:` and `has:` mean on a visit what they mean on a hit.
const anyOk = (fenced, spec) => {
  if (spec === "") return true;
  for (const v of fenced.split("|")) {
    if (v === "") continue;
    if (slotOk(v, spec)) return true;
  }
  return false;
};

// The coherence guard: a derived row's own arithmetic, checked against itself
// before it is stated. It lives here because the browser tier has no store-side
// predicate to put it in — `write`/`add`/`patch`/`upsertBy` run none, and a
// refusal is a NonRetriableError off a mutation round trip an all-`tab` app never
// makes. It takes one row and answers a clause name or the empty string; a guard
// that reads anything but the row it is passed is a second reduce.
const coherent = (r) => {
  const rate = q(num(r.bounce_n) * 100, num(r.bounce_denom), 0);
  if (rate < 0 || rate > 100) return "bounce_rate out of 0..100";
  if (num(r.visit_duration_text) < 0) return "visit_duration below zero";
  if (num(r.sessions_n) < 0) return "sessions_n below zero";
  if (num(r.bounce_denom) < 0) return "bounce_denom below zero";
  if (num(r.bounce_n) > num(r.bounce_denom)) return "bounce_n above its divisor";
  // The one clause that compares two columns the fold reached by different
  // routes: the rendered quotient against the sum it was divided from. The
  // quotient carries two decimals, so both sides are scaled by 100 and the
  // comparison is over integers; the bound is half a rounding unit per visit,
  // which is the whole of what two decimals may lose. The float spelling of the
  // same bound is not equivalent, and coherent.test.ts says on which rows.
  if (r.views_per_visit_text !== undefined) {
    const n = num(r.sessions_n);
    if (Math.abs(Math.round(num(r.views_per_visit_text) * 100) * n - num(r.pv_sum) * 100) > n * 0.5) {
      return "views_per_visit does not reproduce pv_sum";
    }
  }
  return "";
};

(state, event) => {
  const rows = state.rows ?? {};
  const cursors = rows.cursor ?? [];

  try {
    // Eleven Filter rows are seeded and `/f/:preset` resolves only for a preset
    // whose twin exists, so this cannot happen — and if it does it is a broken
    // precondition and not a shape to degrade into.
    if (cursors.length !== 1) {
      throw new Error("the cursor read answered " + cursors.length + " rows, not one");
    }
    const cursor = cursors[0];
    const zs = zonesOf(rows);
    if (zs.length === 0) throw new Error("rollup has no Zone rows");

    const sessions = rows.session ?? [];
    const log = rows.event ?? [];
    const panels = [...(rows.panel ?? [])].sort((a, b) => num(a.pos) - num(b.pos));

    // --- the window ------------------------------------------------------
    const rangeRow = (rows.range ?? []).find((r) => txt(r.id) === txt(cursor.range));
    if (rangeRow === undefined) throw new Error("no Range row " + txt(cursor.range));
    const grain = txt(cursor.grain);
    const pairRow = (rows.grain ?? []).find((g) => txt(g.range) === txt(cursor.range) && txt(g.grain) === grain);
    if (pairRow === undefined) {
      throw new Error("(" + txt(cursor.range) + ", " + grain + ") is not a legal pair");
    }
    const asOf = sec(cursor.as_of_epoch);
    const asOfDay = locDay(zs, asOf);
    const from = dayStart(zs, asOfDay - num(rangeRow.from_days_back));
    const to = txt(rangeRow.to_is_as_of) === "true"
      ? asOf
      : dayStart(zs, asOfDay - num(rangeRow.to_days_back));

    // --- the cursor's five slots -----------------------------------------
    const slot = {};
    for (const s of SLOTS) slot[s] = txt(cursor[s]);

    // A hit belongs to the visit whose span covers it. The Session rows ARE the
    // partition, so it is never re-derived here.
    const spans = new Map();
    for (const v of sessions) {
      const list = spans.get(txt(v.visitor)) ?? [];
      // The span is read once here: the sort and the search below run per hit,
      // and a carrier is parsed, not compared as text.
      list.push({ v: v, start: sec(v.start_epoch), last: sec(v.last_epoch) });
      spans.set(txt(v.visitor), list);
    }
    for (const list of spans.values()) list.sort((a, b) => a.start - b.start);
    const visitOf = (h, at) => {
      const list = spans.get(txt(h.visitor));
      if (list === undefined) return undefined;
      let lo = 0;
      let hi = list.length - 1;
      let found;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid].start <= at) {
          found = list[mid];
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return found !== undefined && found.last >= at ? found.v : undefined;
    };

    // Every hit beside its visit, which is what carries the frozen attribution
    // down to hit level: a hit matches a VISIT dimension through its visit and
    // never through a column of its own.
    const facts = [];
    for (const h of log) {
      const at = sec(h.epoch);
      const v = visitOf(h, at);
      if (v === undefined) throw new Error("hit " + txt(h.id) + " belongs to no visit");
      facts.push({ h: h, v: v, at: at });
    }

    // A hit matches a window iff `from <= epoch < to`; a visit matches iff its
    // START does, so a visit open across `from` belongs to the earlier window
    // and contributes hits to the later one without being counted in it.
    const winFacts = facts.filter((f) => f.at >= from && f.at < to);
    const winVisits = sessions.filter((v) => sec(v.start_epoch) >= from && sec(v.start_epoch) < to);

    // `except` names the one slot a panel replaces, so the base sets below are
    // computed once per panel rather than once per dimension value.
    const hitOk = (f, s) =>
      slotOk(txt(f.h.pathname), s.f_page) && slotOk(txt(f.h.name), s.f_name) &&
      slotOk(txt(f.v.entry_page), s.f_entry_page) && slotOk(txt(f.v.source), s.f_source) &&
      slotOk(txt(f.v.browser), s.f_browser);
    const visitOkOf = (v, s) =>
      anyOk(txt(v.pages), s.f_page) && anyOk(txt(v.names), s.f_name) &&
      slotOk(txt(v.entry_page), s.f_entry_page) && slotOk(txt(v.source), s.f_source) &&
      slotOk(txt(v.browser), s.f_browser);
    const without = (s, key) => {
      const out = {};
      for (const k of SLOTS) out[k] = k === key ? "" : s[k];
      return out;
    };

    const matchedFacts = winFacts.filter((f) => hitOk(f, slot));
    const matchedVisits = winVisits.filter((v) => visitOkOf(v, slot));

    // --- the top line ------------------------------------------------------
    const who = new Set();
    let pageviews = 0;
    let events = 0;
    for (const f of matchedFacts) {
      who.add(txt(f.h.visitor));
      if (txt(f.h.name) === "pageview") pageviews += 1;
      if (txt(f.h.name) !== "engagement") events += 1;
    }
    let pvSum = 0;
    let durSum = 0;
    for (const v of matchedVisits) {
      pvSum += num(v.pageviews);
      durSum += num(v.duration);
    }
    // The bounce divisor is a SECOND divisor and not a narrowing of the first:
    // a page slot is answered here by the visit's ENTRY page rather than by
    // containment, so a page nobody entered on gives visits above zero and a
    // bounce rate of exactly zero.
    const entered = matchedVisits.filter((v) => slotOk(txt(v.entry_page), slot.f_page));
    let bounceN = 0;
    for (const v of entered) if (txt(v.bounce) === "yes") bounceN += 1;
    const sessionsN = matchedVisits.length;
    const bounceDenom = entered.length;

    // The one number on the screen no filter narrows, over the log and not over
    // the cursor's hits.
    const live = new Set();
    for (const f of facts) if (f.at >= asOf - 300 && f.at < asOf) live.add(txt(f.h.visitor));

    const topline = {
      id: "the",
      visitors_n: who.size,
      visits_n: sessionsN,
      pageviews_n: pageviews,
      events_n: events,
      sessions_n: sessionsN,
      bounce_denom: bounceDenom,
      bounce_n: bounceN,
      pv_sum: pvSum,
      dur_sum: durSum,
      visitors_text: String(who.size),
      visits_text: String(sessionsN),
      pageviews_text: String(pageviews),
      views_per_visit_text: t2(q(pvSum, sessionsN, 2)),
      bounce_rate_text: t0(q(bounceN * 100, bounceDenom, 0)),
      visit_duration_text: t0(q(durSum, sessionsN, 0)),
      // The window, in the words the pickers spell it in, off the vocabulary
      // rows this fold resolved the cursor against.
      range_text: txt(rangeRow.label),
      grain_text: txt(pairRow.grain),
      current_visitors: live.size,
      window_from: instant(from),
      window_to: instant(to),
    };

    // --- the bucket grid ---------------------------------------------------
    // Window arithmetic, never a group-by: a bucket the log has no hit in is
    // still a bucket.
    const grid = [];
    if (grain === "hour") {
      for (let i = 0; from + i * 3600 < to; i += 1) grid.push(hourKey(zs, from + i * 3600));
    } else if (grain === "day") {
      for (let d = locDay(zs, from); d <= locDay(zs, to - 1); d += 1) grid.push(isoOfIndex(d));
    } else {
      for (let d = locWeek(zs, from); d <= locDay(zs, to - 1); d += 7) grid.push(isoOfIndex(d));
    }
    if (grid.length > 28) throw new Error("a legal pair produced " + grid.length + " buckets");
    // A bucket key names exactly one hour of the window. The axis is keyed by
    // the rendered key, so where the clock steps back two of the steps above
    // reach one cell: the bar count would fall an ordinal short of the hours it
    // stands for, which is a picture no key set can label.
    const seenKey = new Set();
    for (const k of grid) {
      if (seenKey.has(k)) throw new Error("the local hour " + k + " is two hours of this window");
      seenKey.add(k);
    }

    const cell = new Map();
    for (let i = 0; i < grid.length; i += 1) {
      cell.set(grid[i], { ord: i, key: grid[i], visitors: 0, visits: 0, pageviews: 0, who: new Set() });
    }
    const keyOf = grain === "hour"
      ? (e) => hourKey(zs, e)
      : grain === "day"
      ? (e) => dayKey(zs, e)
      : (e) => weekKey(zs, e);
    for (const f of matchedFacts) {
      const c = cell.get(keyOf(f.at));
      if (c === undefined) continue;
      c.who.add(txt(f.h.visitor));
      if (txt(f.h.name) === "pageview") c.pageviews += 1;
    }
    for (const c of cell.values()) c.visitors = c.who.size;
    if (grain === "hour") {
      // At hour granularity a visit is counted in every local hour it was OPEN,
      // whether or not a hit fell in it — so the hourly visit counts do not sum
      // to the window count, and that asymmetry is the arithmetic rather than a
      // reconciliation waiting to happen.
      //
      // The BUCKET has to be in the window; the visit does not. "Open in that
      // hour" says nothing about where the visit began, so a visit open across
      // the window's own opening is counted in the hours of it the window holds
      // while `visits_n` — which counts by START — does not count it at all.
      // Narrowing this to `matchedVisits` would make the two the same function
      // everywhere except across an opening, which is the one place they differ.
      const okOf = new Set(sessions.filter((v) => visitOkOf(v, slot)).map((v) => txt(v.id)));
      const seen = new Set();
      for (const sh of rows.session_hour ?? []) {
        if (!okOf.has(txt(sh.session_id))) continue;
        const c = cell.get(txt(sh.bucket_key));
        if (c === undefined) continue;
        const k = txt(sh.session_id) + "|" + txt(sh.bucket_key);
        if (seen.has(k)) continue;
        seen.add(k);
        c.visits += 1;
      }
    } else {
      for (const v of matchedVisits) {
        const c = cell.get(keyOf(sec(v.start_epoch)));
        if (c !== undefined) c.visits += 1;
      }
    }

    // --- the axis and the two path strings ---------------------------------
    // The series is `visitors`. The step is the smallest 1/2/5 x 10^k with
    // 4 x step >= the largest bucket value, and the axis top is 4 x step;
    // written here and, independently, in oracle.sql.
    const cells = grid.map((k) => cell.get(k));
    let domainRaw = 0;
    for (const c of cells) if (c.visitors > domainRaw) domainRaw = c.visitors;
    const decade = domainRaw <= 0 ? 1 : Math.pow(10, Math.floor(Math.log10(domainRaw / 4)));
    let step = 0;
    for (const m of [1, 2, 5, 10]) {
      if (m * decade * 4 >= domainRaw) {
        step = m * decade;
        break;
      }
    }
    if (step === 0) throw new Error("no 1/2/5 step reaches " + domainRaw);
    const domainMax = step * 4;

    const ticks = [];
    for (let i = 0; i <= 4; i += 1) {
      ticks.push({
        id: "t-" + i,
        ord: i,
        value: step * i,
        label: String(step * i),
        at: domainMax === 0 ? 0 : Math.round((step * i * 1000) / domainMax),
      });
    }

    // x across the bucket ordinals and y up from the axis floor, both per mille
    // of one shared coordinate system. The authored viewBox is 1000 x 300, so
    // the y channel is that per mille projected onto 300 — the projection is the
    // picture's, and the per-mille numbers behind it are the graded ones.
    const last = grid.length - 1;
    const pts = cells.map((c) => ({
      x: last <= 0 ? 0 : Math.round((c.ord * 1000) / last),
      y: domainMax === 0 ? 1000 : Math.round(1000 - (c.visitors * 1000) / domainMax),
      // The floor mark keys on the COUNT, not on y === 1000. The two coincide
      // only while domain_max stays under 2000 — round(1000 - v*1000/D) reaches
      // 1000 for every v <= D/2000 — and the count is the fact the oracle's
      // bucket.value_num states.
      zero: c.visitors === 0,
    }));
    // A day is a bucket and not a sample, so the series is one column per bucket
    // and nothing is drawn between two of them. The oracle's x ANCHORS the
    // column: scaling the run by (1000 - barW) / 1000 is the only affine map of
    // that number leaving the first column on the left edge, the last on the
    // right, and every column one width inside the box. The width is solved so
    // that at even pitch neighbours clear each other by the gap; x is an integer
    // per mille, so the realized gap carries that number's own rounding.
    //
    // The gap is a FIFTH OF THE PITCH and not a constant, because the drawing is
    // not one width and no single per-mille number clears every bucket count at
    // both of them. svg.test.ts bounds the share against the two widths.
    const n = Math.max(pts.length, 1);
    const GAP_SHARE = 200;
    const gap = GAP_SHARE / n;
    const barW = (1000 - gap * (n - 1)) / n;
    const tenth = (v) => Math.round(v * 10) / 10;
    const left = (p) => tenth((p.x * (1000 - barW)) / 1000);
    const columnD = (p) => {
      const l = left(p);
      return "M " + l + " 300 V " + tenth(p.y * 0.3) + " H " + tenth(l + barW) + " V 300 Z";
    };
    const pathD = pts.map(columnD).join(" ");
    // A bucket that measured nothing, as a mark on the axis floor: the column's
    // own width, and a height that is not a quantity. Length is magnitude, so a
    // minimum COLUMN height would say zero is a small number — FLOOR_H must stay
    // under the shortest column any domain can draw, which at the fixture's
    // largest domain_max of 80 is one visitor at 3.6 units.
    const FLOOR_H = 3;
    const floorD = pts.filter((p) => p.zero).map((p) => {
      const l = left(p);
      return "M " + l + " 300 V " + (300 - FLOOR_H) + " H " + tenth(l + barW) + " V 300 Z";
    }).join(" ");

    const buckets = cells.map((c) => ({
      id: "b-" + p2(c.ord),
      ord: c.ord,
      bucket_key: c.key,
      label: grain === "hour" ? c.key.slice(11) + ":00" : c.key.slice(5),
      grain: grain,
      visitors: c.visitors,
      visits: c.visits,
      pageviews: c.pageviews,
      share: domainMax === 0 ? 0 : Math.round((c.visitors * 1000) / domainMax),
      on_caret: "b-" + p2(c.ord) === txt(cursor.active_bucket),
    }));

    // The caret, as columns of the chart's own singleton rather than as a
    // projection over the point rows — the readout's own markup states what the
    // arrows would lose if they hung on the point they name. `scale` is written
    // on every pass, so the row they do hang on cannot go away.
    //
    // An end names itself, so the walk stops at both ends rather than wrapping.
    const here = buckets.findIndex((b) => b.on_caret);
    const neighbour = (i) => txt(buckets[Math.min(Math.max(i, 0), buckets.length - 1)].id);
    const caret = buckets.length === 0 || here < 0
      ? { caret_point: "", caret_label: "", caret_prev: "", caret_next: "" }
      : {
        caret_point: txt(buckets[here].id),
        caret_label: txt(buckets[here].label),
        caret_prev: neighbour(here - 1),
        caret_next: neighbour(here + 1),
      };

    // --- the four panels ---------------------------------------------------
    // A breakdown row is the top line's arithmetic with the panel's own slot
    // pinned to the row's value, which is what makes the two divisors visible at
    // row level: under a page filter `bounce_denom` and `sessions_n` are
    // different numbers on the row itself.
    const breakdown = [];
    for (const p of panels) {
      const panel = txt(p.id);
      const pslot = txt(p.slot);
      const column = txt(p.column);
      const onVisit = txt(p.on) === "visit";

      // The values a panel offers are the values the window actually contains
      // UNDER THE CURSOR — from the data, never from a vocabulary.
      const offered = new Set();
      if (onVisit) for (const v of matchedVisits) offered.add(txt(v[column]));
      else for (const f of matchedFacts) offered.add(txt(f.h.pathname));

      const base = without(slot, pslot);
      const baseFacts = winFacts.filter((f) => hitOk(f, base));
      const baseVisits = winVisits.filter((v) => visitOkOf(v, base));

      const agg = new Map();
      const at = (k) => {
        const a = agg.get(k) ??
          { who: new Set(), pageviews: 0, events: 0, sessions: 0, pv: 0, dur: 0, bd: 0, bn: 0 };
        agg.set(k, a);
        return a;
      };
      for (const k of offered) at(k);

      for (const f of baseFacts) {
        const k = onVisit ? txt(f.v[column]) : txt(f.h.pathname);
        if (!agg.has(k)) continue;
        const a = agg.get(k);
        a.who.add(txt(f.h.visitor));
        if (txt(f.h.name) === "pageview") a.pageviews += 1;
        if (txt(f.h.name) !== "engagement") a.events += 1;
      }
      for (const v of baseVisits) {
        // A visit reaches a page panel through every distinct pathname ANY of
        // its hits carried, which is the containment slot fanned out; on the
        // other three the dimension IS the visit's own frozen column.
        const keys = onVisit
          ? [txt(v[column])]
          : txt(v.pages).split("|").filter((x) => x !== "");
        const done = new Set();
        for (const k of keys) {
          if (!agg.has(k) || done.has(k)) continue;
          done.add(k);
          const a = agg.get(k);
          a.sessions += 1;
          a.pv += num(v.pageviews);
          a.dur += num(v.duration);
          // The drilled cursor's page slot is `is:<k>` on the page panel and the
          // cursor's own elsewhere, so the entry test moves with it.
          const enteredHere = onVisit ? slotOk(txt(v.entry_page), slot.f_page) : txt(v.entry_page) === k;
          if (enteredHere) {
            a.bd += 1;
            if (txt(v.bounce) === "yes") a.bn += 1;
          }
        }
      }

      const made = [...agg.entries()].map(([k, a]) => ({ k: k, a: a, visitors: a.who.size }));
      // `visitors desc, dim_value asc`. The dimension leg decides membership and
      // not merely order: this window holds panels whose ninth and tenth rows
      // have equal visitors, where the tie alone settles which row is shown.
      made.sort((x, y) => y.visitors - x.visitors || (x.k < y.k ? -1 : x.k > y.k ? 1 : 0));
      let top = 0;
      for (const r of made) if (r.visitors > top) top = r.visitors;

      for (let i = 0; i < made.length; i += 1) {
        const r = made[i];
        const a = r.a;
        const row = {
          id: panel + "|" + r.k,
          panel: panel,
          dim_value: r.k,
          ord: i + 1,
          visitors: r.visitors,
          visits: a.sessions,
          pageviews: a.pageviews,
          events: a.events,
          bounce_n: a.bn,
          bounce_denom: a.bd,
          sessions_n: a.sessions,
          dur_sum: a.dur,
          bounce_rate_text: t0(q(a.bn * 100, a.bd, 0)),
          visit_duration_text: t0(q(a.dur, a.sessions, 0)),
          share: q(r.visitors * 1000, top, 0),
          arc: q(a.bn * 100, a.bd, 0),
          set_page: pslot === "f_page" ? "is:" + r.k : slot.f_page,
          set_entry_page: pslot === "f_entry_page" ? "is:" + r.k : slot.f_entry_page,
          set_source: pslot === "f_source" ? "is:" + r.k : slot.f_source,
          set_browser: pslot === "f_browser" ? "is:" + r.k : slot.f_browser,
          set_name: pslot === "f_name" ? "is:" + r.k : slot.f_name,
        };
        breakdown.push(row);
      }
    }

    // --- the chips ---------------------------------------------------------
    // One row per occupied slot, whose id IS the slot name because a click
    // carries no payload: the row id has to be the datum.
    const chips = [];
    for (const s of SLOTS) {
      const v = slot[s];
      if (v === "") continue;
      const i = v.indexOf(":");
      const said = v.slice(0, i) === "is" ? "is" : v.slice(0, i) === "not" ? "is not" : "contains";
      chips.push({
        id: s,
        slot: s,
        label: s.slice(2).split("_").join(" ") + " " + said + " " + v.slice(i + 1),
        value: v,
        set_page: s === "f_page" ? "" : slot.f_page,
        set_entry_page: s === "f_entry_page" ? "" : slot.f_entry_page,
        set_source: s === "f_source" ? "" : slot.f_source,
        set_browser: s === "f_browser" ? "" : slot.f_browser,
        set_name: s === "f_name" ? "" : slot.f_name,
      });
    }

    // --- the coherence guard -----------------------------------------------
    // Every refusal patches `error` alone. This fold states only the columns it
    // authors: `note` belongs to the seeded Fold row, and a put would carry a
    // second copy of its sentence through this file, where a copy is a thing to
    // keep in step.
    const bad = coherent(topline);
    if (bad !== "") {
      return {
        updates: [{ op: "patch", entity: "fold", id: "rollup", row: { error: "topline the: " + bad } }],
      };
    }
    for (const r of breakdown) {
      const why = coherent(r);
      if (why !== "") {
        return {
          updates: [{ op: "patch", entity: "fold", id: "rollup", row: { error: r.id + ": " + why } }],
        };
      }
    }

    // --- write differentially, and delete what is absent --------------------
    const updates = [];
    const diff = (entity, wanted, held) => {
      const by = new Map();
      for (const r of held) by.set(txt(r.id), r);
      for (const w of wanted) {
        const have = by.get(txt(w.id));
        by.delete(txt(w.id));
        if (have === undefined) {
          updates.push({ op: "put", entity: entity, id: w.id, row: w });
          continue;
        }
        let same = true;
        for (const k of Object.keys(w)) if (txt(have[k]) !== txt(w[k])) same = false;
        if (!same) updates.push({ op: "put", entity: entity, id: w.id, row: w });
      }
      for (const id of by.keys()) updates.push({ op: "delete", entity: entity, id: id });
    };
    diff("topline", [topline], rows.topline ?? []);
    diff("bucket", buckets, rows.bucket ?? []);
    diff("tick", ticks, rows.tick ?? []);
    diff("scale", [{
      id: "the",
      domain_max: domainMax,
      points: pts.length,
      path_d: pathD,
      floor_d: floorD,
      caret_point: caret.caret_point,
      caret_label: caret.caret_label,
      caret_prev: caret.caret_prev,
      caret_next: caret.caret_next,
    }], rows.scale ?? []);
    diff("breakdown", breakdown, rows.breakdown ?? []);
    diff("chip", chips, rows.chip ?? []);
    // The two pickers' marks, patched for the reason the guard above patches:
    // the mark is ONE column of a vocabulary row this fold does not author.
    // Written only where the mark moves, like everything above.
    const mark = (entity, held, wanted) => {
      for (const r of held) {
        const on = wanted(r);
        if (txt(r.on_cursor) === String(on)) continue;
        updates.push({ op: "patch", entity: entity, id: r.id, row: { on_cursor: on } });
      }
    };
    mark("range", rows.range ?? [], (r) => txt(r.id) === txt(cursor.range));
    mark("grain", rows.grain ?? [], (g) => txt(g.range) === txt(cursor.range) && txt(g.grain) === grain);
    const held = rows.fold ?? [];
    const mine = held.find((r) => txt(r.id) === "rollup");
    if (mine !== undefined && txt(mine.error) !== "") {
      updates.push({ op: "patch", entity: "fold", id: "rollup", row: { error: "" } });
    }
    return { updates: updates };
  } catch (err) {
    return {
      updates: [{
        op: "patch",
        entity: "fold",
        id: "rollup",
        row: { error: txt(err && err.message ? err.message : err) },
      }],
    };
  }
}
