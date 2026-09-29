// stitch — the log becomes visits, and the visits become local hours.
//
// Recomputed absolutely from `event` and `zone` on every wake, written
// differentially, so a second wake over an unchanged world writes nothing and
// the seat reaches a fixpoint structurally.
//
// `corpus` is stated LAST, and Corpus's own declaration says why that is a
// signal. applyUpdates preserves the order, batching only consecutive
// same-op-same-entity runs, so reordering these three hands `rollup` a partial
// world with no second wake to correct it.

// The boundary is the integer, not the phrase. The vendor keeps a session while
// `NaiveDateTime.diff(t, session.t, :minute) <= 30` and Elixir's :minute diff
// truncates, so 1859 s continues a visit and 1860 s opens a new one.
const GAP = 1860;

const txt = (v) => String(v === undefined || v === null ? "" : v);
const num = (v) => (Number(v) || 0);

const zonesOf = (rows) =>
  (rows.zone ?? []).map((z) => ({ s: secOf(micros(z.starts_epoch)), o: num(z.offset_seconds) }))
    .sort((a, b) => a.s - b.s);

const offsetAt = (zs, epoch) => {
  let found = null;
  for (const z of zs) if (z.s <= epoch) found = z.o;
  if (found === null) throw new Error("no Zone row covers epoch " + epoch);
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

const p2 = (n) => (n < 10 ? "0" + n : "" + n);
const isoDate = (y, m, d) => y + "-" + p2(m) + "-" + p2(d);

// Every instant this seat reads is a `timestamp` carrier — RFC 3339 in UTC with
// six fractional digits — and the clock above is whole UTC seconds, as the
// vendor's is: its NaiveDateTime diffs truncate, so an instant counts as the
// second it falls in. `sec` crosses that line (`num` would read the string as
// 0). An instant this seat writes is the one it read, never one rebuilt from its
// second, so a fraction is never lost.
const daysFromCivil = (y0, m, d) => {
  const y = y0 - (m <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
};
const micros = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/.exec(txt(v));
  if (m === null) throw new Error("not a timestamp: " + txt(v));
  const whole = daysFromCivil(Number(m[1]), Number(m[2]), Number(m[3])) * 86400 +
    Number(m[4]) * 3600 + Number(m[5]) * 60 + Number(m[6]);
  return whole * 1000000 + Number(m[7]);
};
// The second an instant falls in, for the calendar below. A DIFFERENCE is
// truncated after it is taken, never before: the vendor's rule is
// NaiveDateTime.diff, and truncating each side first splits a visit at 1859.1
// seconds that the vendor keeps whole.
const secOf = (t) => Math.floor(t / 1000000);

const locSec = (zs, t) => t + offsetAt(zs, t);
const locDay = (zs, t) => Math.floor(locSec(zs, t) / 86400);
const locHour = (zs, t) => Math.floor((locSec(zs, t) % 86400) / 3600);
// 1970-01-01 was a Thursday, so the Monday-based weekday of day index d is
// (d + 3) % 7 and the Monday of its week is d minus that.
const locWeek = (zs, t) => locDay(zs, t) - ((locDay(zs, t) + 3) % 7);
// The start of the local hour holding t, as a UTC instant.
const hourSlot = (zs, t) => t - (locSec(zs, t) % 3600);

const dayKeyOfIndex = (d) => {
  const ymd = civilFromDays(d);
  return isoDate(ymd[0], ymd[1], ymd[2]);
};
const hourKey = (zs, t) => dayKeyOfIndex(locDay(zs, t)) + " " + p2(locHour(zs, t));
const stamp = (zs, t) => {
  const ls = locSec(zs, t);
  const sod = ((ls % 86400) + 86400) % 86400;
  return dayKeyOfIndex(Math.floor(ls / 86400)) + " " + p2(Math.floor(sod / 3600)) +
    ":" + p2(Math.floor((sod % 3600) / 60));
};

(state, event) => {
  const rows = state.rows ?? {};
  // The log rides `state.rows.event` and never `state.items`: this seat is the
  // same handler on a `corpus` region of every screen, and `items` there is the
  // Corpus row.
  const log = rows.event ?? [];
  const zs = zonesOf(rows);

  try {
    // A local day is arithmetic over the Zone rows and there is no second way to
    // reach one, so an empty clock is a refusal rather than a UTC day.
    if (zs.length === 0) throw new Error("stitch has no Zone rows");

    // --- the partition -----------------------------------------------------
    const byVisitor = new Map();
    for (const e of log) {
      const list = byVisitor.get(txt(e.visitor)) ?? [];
      list.push(e);
      byVisitor.set(txt(e.visitor), list);
    }
    const visitors = [...byVisitor.keys()].sort();
    const visits = [];
    for (const visitor of visitors) {
      const all = byVisitor.get(visitor);
      // The carrier's string order is its value order, fraction included.
      all.sort((a, b) => (txt(a.epoch) < txt(b.epoch) ? -1 : txt(a.epoch) > txt(b.epoch) ? 1 : txt(a.id) < txt(b.id) ? -1 : 1));
      let group = [];
      let prev = 0;
      let ord = 0;
      const flush = () => {
        if (group.length === 0) return;
        ord += 1;
        visits.push({ visitor: visitor, ord: ord, hits: group });
        group = [];
      };
      for (const e of all) {
        const at = micros(e.epoch);
        // The gap is measured from the visitor's PREVIOUS HIT OF ANY NAME — an
        // engagement ping holds the visit open — and never from the visit's
        // start.
        if (group.length > 0 && Math.floor((at - prev) / 1000000) >= GAP) flush();
        prev = at;
        group.push(e);
      }
      flush();
    }

    // --- the rows ----------------------------------------------------------
    const sessions = [];
    const hours = [];
    for (const v of visits) {
      const hits = v.hits;
      const views = hits.filter((h) => txt(h.name) === "pageview");
      const start = micros(hits[0].epoch);
      const last = micros(hits[hits.length - 1].epoch);
      // A ping extends the visit's open span without extending its duration, so
      // the two closes are different columns rather than one read twice.
      let liveLast = start;
      for (const h of hits) if (txt(h.name) !== "engagement") liveLast = micros(h.epoch);
      let interactions = 0;
      for (const h of hits) {
        if (txt(h.interactive) === "true" && txt(h.name) !== "pageview") interactions += 1;
      }
      // The id is `<visitor>#<ord>` with the ordinal unpadded and counted from
      // one: it is the key the sidecar was generated with, and two witnesses
      // whose keys differ cannot be compared row by row at all.
      const id = v.visitor + "#" + v.ord;
      const slot0 = hourSlot(zs, secOf(start));
      const slotN = hourSlot(zs, secOf(last));
      const spanned = Math.floor((slotN - slot0) / 3600);
      // The walk steps 3600 UTC seconds, so the local hour a step FORWARD skips
      // yields no key at all: a spring-forward day has 23 hour keys and not 24
      // with a hole, here and on every axis drawn over one. Across a step BACK
      // two of these steps render one local hour, and then the key is not a key:
      // the second put would win, and `hours_n` would count a row that no longer
      // exists. oracle.sql refuses the same clock at §11 rather than answering
      // for it.
      const keys = new Set();
      for (let i = 0; i <= spanned; i += 1) {
        const at = slot0 + i * 3600;
        const key = hourKey(zs, at);
        if (keys.has(key)) throw new Error("two hours of this visit are the local hour " + key);
        keys.add(key);
        hours.push({ id: id + "|" + key, session_id: id, bucket_key: key, ord: i });
      }
      sessions.push({
        id: id,
        visitor: v.visitor,
        ord: v.ord,
        start_epoch: txt(hits[0].epoch),
        last_epoch: txt(hits[hits.length - 1].epoch),
        start_local: stamp(zs, secOf(start)),
        last_local: stamp(zs, secOf(last)),
        // Entry and exit are the first and last page VIEWED. A hit of any other
        // name moves neither, so a visit a custom event opened has no entry page
        // until it views one.
        entry_page: views.length === 0 ? "" : txt(views[0].pathname),
        exit_page: views.length === 0 ? "" : txt(views[views.length - 1].pathname),
        pageviews: views.length,
        events: hits.filter((h) => txt(h.name) !== "engagement").length,
        // The vendor's `not (pageviews >= 2 or (interactive? and not
        // pageview?))`, carried over the whole visit. Counting non-engagement
        // hits instead would let a custom event that declares itself
        // non-interactive clear a bounce.
        bounce: views.length <= 1 && interactions === 0 ? "yes" : "no",
        duration: Math.floor((liveLast - start) / 1000000),
        source: txt(hits[0].source),
        browser: txt(hits[0].browser),
        // The visit-level page and name sets, fenced, for the reason Session's
        // fields state. Over every hit and not every view: a containment slot on
        // a visit is `exists a hit`, whatever the hit is named.
        pages: "|" + [...new Set(hits.map((h) => txt(h.pathname)))].join("|") + "|",
        names: "|" + [...new Set(hits.map((h) => txt(h.name)))].join("|") + "|",
        // The read form of the two sets, for the reason Session's fields state.
        pages_text: [...new Set(hits.map((h) => txt(h.pathname)))].join(", "),
        names_text: [...new Set(hits.map((h) => txt(h.name)))].join(", "),
        day_key: dayKeyOfIndex(locDay(zs, secOf(start))),
        week_key: dayKeyOfIndex(locWeek(zs, secOf(start))),
        hours_n: spanned + 1,
      });
    }

    // The read behind `state.rows.event` declares no order — the row that
    // arrives first is whatever the collection's load order put there — so the
    // log's two ends are its MIN and MAX epoch, folded, and never a positional
    // read. Nothing downstream would refuse one either: an all-`tab` app
    // evaluates the `days >= 0` constraint nowhere.
    // Folded over the carrier strings, whose order is the instants' order.
    let firstAt = log.length === 0 ? "" : txt(log[0].epoch);
    let lastAt = firstAt;
    for (const e of log) {
      const at = txt(e.epoch);
      // Read for its refusal: an instant the carrier does not spell is this
      // seat's to reject, and the fold below compares the strings.
      micros(at);
      if (at < firstAt) firstAt = at;
      if (at > lastAt) lastAt = at;
    }
    const first = log.length === 0 ? 0 : micros(firstAt);
    const lastHit = log.length === 0 ? 0 : micros(lastAt);
    const corpus = {
      id: "the",
      hits: log.length,
      visits: sessions.length,
      visitors: visitors.length,
      first_epoch: log.length === 0 ? null : firstAt,
      last_epoch: log.length === 0 ? null : lastAt,
      first_local: log.length === 0 ? "" : stamp(zs, secOf(first)),
      last_local: log.length === 0 ? "" : stamp(zs, secOf(lastHit)),
      days: log.length === 0 ? 0 : locDay(zs, secOf(lastHit)) - locDay(zs, secOf(first)) + 1,
    };

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

    diff("session", sessions, rows.session ?? []);
    diff("session_hour", hours, rows.session_hour ?? []);
    diff("corpus", [corpus], rows.corpus ?? []);
    return { updates: updates };
  } catch (err) {
    // A reduce's writes ARE its return value, so a refusal has to be an update:
    // a throw propagates to the seat's wake and Fold.error is never written.
    // A patch and not a put: `note` is the seeded row's own column, and a put
    // would have to carry a second copy of that sentence through this file.
    return {
      updates: [{
        op: "patch",
        entity: "fold",
        id: "stitch",
        row: { error: txt(err && err.message ? err.message : err) },
      }],
    };
  }
}
