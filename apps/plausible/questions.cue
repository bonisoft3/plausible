// The seven metrics as the vendor publishes them, and the 312 published
// questions asked about them.
//
// WHAT IS AUTHORED, and it is the whole of what a reviewer reads: the vendor's
// seven sentences and seven expressions with a citation each (`_metrics`), one
// clause per metric saying what this app computes (`_reading`), one phrase per
// filter shape, ten notes for the ten hard cases, and one note per declined
// question. Sixty-odd sentences.
//
// WHAT IS DERIVED, because 312 rows of transcription is 312 places for a wrong
// sentence to hide: every row's id, metric, panel, range, grain and filter set,
// generated from the same vocabulary rows the app is built out of, and every
// `says`, which is the Metric row's own sentence rather than a second copy of
// it. A retyped sentence could differ from the metric's by a word, and the one
// rung of this apparatus that grades the READING would be grading a typo.
//
// No row carries an expected value (ir decision-18). `expects` is the
// non-degeneracy DECLARATION — what shape of answer the ground truth must have
// for a green run to mean anything — and every number comes from ORACLE.md §3
// at run time.
package plausible

import (
	"list"
	"strings"
)

// --- the vendor's own words -------------------------------------------------
//
// `says` is quoted from the vendor's published metric definitions, `formula`
// from the vendor's own aggregation expression, and `source` says where each
// came from. A `?` inside a formula is the vendor's placeholder for a bound
// column; what it binds is stated in `source` rather than substituted into the
// quote, because a tidied formula is no longer a quote (ORACLE.md §6).
//
// `says` is the whole of the vendor's DEFINITIONAL paragraph and stops where its
// prose turns to analogy, benchmark ranges or a link. Quoting less is how a
// departure disappears: the sentence that puts this app's `visitors` at odds
// with the published reading is the third of that metric's five, and a quote cut
// after the first would have left `departs: "no"` looking true.
//
// A line number is only a citation against a stated revision, so the revision is
// stated once here rather than seven times.
_vendorRev: "plausible/analytics@b787d17"

_metrics: [
	{
		id:      "visitors"
		says:    "The number of people who visited your site. We are privacy-friendly so we don't use cookies and other persistent identifiers. If a person visits from multiple devices or on multiple days, they are counted as separate visitors. Within the same day, a person counts as one unique visitor even if they have multiple sessions."
		formula: "uniq(?)"
		source:  "says: plausible.io/docs/metrics-definitions, Unique Visitors, less its closing link sentence. formula: lib/plausible/stats/sql/expression.ex:308-310 at \(_vendorRev), event_metric(:visitors), where ? is e.user_id."
		reads:   "A distinct count of `visitor` over the hits matching the window and the cursor. A visit-scoped slot matches a hit through its visit, so a hit carrying no source of its own still matches `source is google` when the visit it belongs to began on google. This DEPARTS from the sentence on every window longer than one local day: the vendor's `user_id` is a hash under a salt it rotates and discards inside 48 h (lib/plausible/session/salts.ex), so a person who returns on a later day is a second visitor to it and the same visitor here. The log can express the published reading — it is a distinct count of (visitor, local day) — and this app counts the person instead, so every multi-day `visitors` figure it shows is the smaller number."
	},
	{
		id:      "visits"
		says:    "A session (also known as a visit) is a set of actions a user takes on your site. A visit starts when a visitor first lands on your page and ends when no action is taken for 30 minutes."
		formula: "greatest(sum(?), 0)"
		source:  "says: plausible.io/docs/metrics-definitions, Total Visits (or Sessions), less its shopping-trip analogy. formula: expression.ex:450-452 at \(_vendorRev), session_metric(:visits), where ? is s.sign; at hour granularity the vendor smears instead, uniq(?) over s.session_id at :444-446. The 30 minutes of the sentence is NaiveDateTime.diff(event.timestamp, session.timestamp, :minute) <= 30 in lib/plausible/session/cache_store.ex."
		reads:   "A distinct count of the visits whose START instant falls in the window. Elixir's `:minute` diff truncates, so the boundary is the integer 1860 seconds and not 1800: 1859 s continues a visit, 1860 s opens a new one."
	},
	{
		id:      "pageviews"
		says:    "The total number of times your pages were loaded by your visitors. A single visitor loading 5 pages counts as 5 pageviews but 1 unique visitor."
		formula: "countIf(? = 'pageview')"
		source:  "says: plausible.io/docs/metrics-definitions, Total Pageviews, less its closing ratio sentence. formula: expression.ex:296-298 at \(_vendorRev), event_metric(:pageviews), where ? is e.name."
		reads:   "A count of the matching hits whose name is exactly `pageview`. This is not `pv_sum`: `pageviews` counts hits in the window while `pv_sum` sums the pageview counts of the visits that STARTED in it, and a visit straddling either edge belongs to exactly one of the two."
	},
	{
		id:      "events"
		says:    "The number of events (pageviews + custom events). When filtering by a goal, this metric corresponds to \"Total Conversions\" in the dashboard."
		formula: "countIf(? != 'engagement')"
		source:  "says: plausible.io/docs/stats-api, the metrics table — the metric-definitions page publishes no sentence for this one. formula: expression.ex:302-304 at \(_vendorRev), event_metric(:events), where ? is e.name."
		reads:   "A count of every matching hit of any name but `engagement`, which is the tracker's own liveness ping and neither a page view nor a custom event. \"Events count every hit\" is a named wrong reading this oracle grades against: it answers 983 where this rule answers 751 on the (none, 28d) probe."
	},
	{
		id:      "views_per_visit"
		says:    "Views per visit (also known as pages per session) shows the average number of pageviews per visit. Repeated views of a single page are included."
		formula: "greatest(ifNotFinite(round(sum(? * ?) / sum(?), 2), 0), 0)"
		source:  "says: plausible.io/docs/metrics-definitions, Views Per Visit. formula: expression.ex:482-491 at \(_vendorRev), session_metric(:views_per_visit), where the ?s are s.sign, s.pageviews and s.sign."
		reads:   "`pv_sum / sessions_n` to two decimals, with a zero divisor answering 0 rather than a NULL or a NaN. The numerator is each matching VISIT's own page-view count and not the window's `pageviews`, so the two disagree over any visit that straddles a window edge. The divisor is every matching visit — under a page filter it is NOT re-restricted, which is what makes it disagree with bounce rate."
	},
	{
		id:      "bounce_rate"
		says:    "The percentage of visitors who land on a page and leave without meaningfully engaging with your site."
		formula: "toUInt32(greatest(ifNotFinite(round(sumIf(is_bounce * sign, ?) / sumIf(sign, ?) * 100), 0), 0))"
		source:  "says: plausible.io/docs/metrics-definitions, Bounce Rate, less its list of what counts as engagement and its benchmark ranges. formula: expression.ex:419-434 at \(_vendorRev), session_metric(:bounce_rate), where both ?s are the entry-page condition the dashboard's filter builds."
		reads:   "`bounce_n / bounce_denom` at a whole percent. A visit bounces iff it viewed at most one page AND carried no interactive hit that was not a page view. It is the only one of the three quotients whose divisor is conditional: under a page filter the divisor is rebuilt on ENTRY page, so a page nobody entered on gives visits above zero and a bounce rate of exactly zero."
	},
	{
		id:      "visit_duration"
		says:    "The amount of time visitors spend on your site. Visitors who only view one page are counted with a duration of 0 seconds rather than excluded. Average visit duration is the sum of all session lengths divided by the number of sessions, which includes those 0 second visits (bounces)."
		formula: "toUInt32(greatest(ifNotFinite(round(sum(duration * sign) / sum(sign)), 0), 0))"
		source:  "says: plausible.io/docs/metrics-definitions, Visit Duration. formula: expression.ex:474-478 at \(_vendorRev), session_metric(:visit_duration)."
		reads:   "`dur_sum / sessions_n` at whole seconds. A visit lasts from its first hit to its last NON-engagement hit, so a ping never extends it and a one-hit visit lasts zero seconds — and stays in the divisor."
	},
]

// --- the vocabularies, read off the app's own rows ---------------------------
//
// Never a second list: a level added to the app arrives here as new questions,
// where a roll-call typed out again would answer with the old vocabulary and
// stay green.
_metricIds: [for m in _metrics {m.id}]
// The published sentences, keyed by what they define. Six of the seven metrics
// and the one figure that has no `Metric` row: no aggregation expression of the
// vendor's answers current visitors, and the top line shows it beside the seven
// rather than among them, so its sentence lives here with theirs and nowhere
// else.
_says: {
	for m in _metrics {(m.id): m.says}
	current_visitors: _currentSays
}
_panelIds: [for p in code.state.entities.Panel.seed {p.id}]
_rangeIds: [for r in code.state.entities.Range.seed {r.id}]
_rangeLabel: {for r in code.state.entities.Range.seed {(r.id): r.label}}
_pairs: [for g in code.state.entities.Grain.seed {{range: g.range, grain: g.grain}}]
_shapeIds: [for s in _shapes {s.id}]
_under: {for s in _shapes {(s.id): [if s.slots == "" {"with no slot filled"}, "under \(s.slots)"][0]}}

// The six a breakdown row carries and the three the graph buckets. They are
// facts about the SCREENS rather than about the rows, which is why they are
// here and not read off an entity.
_detailed: ["visitors", "visits", "pageviews", "events", "bounce_rate", "visit_duration"]
_bucketed: ["visitors", "visits", "pageviews"]
// The three shapes every dimension is asked under: nothing, a substring over
// pages, and the page no visit entered on — which is where a panel's bounce
// divisor parts company with its visit divisor.
_panelShapes: ["none", "contains", "unentered"]

// --- what this app reads each metric as, in one clause -----------------------
_reading: {
	visitors:        "A distinct count of `visitor` over the matching hits, the same person counted once however many days the window spans"
	visits:          "A count of the visits whose start instant falls in the window, cut at the 1860-second boundary"
	pageviews:       "A count of the matching hits named `pageview`"
	events:          "A count of the matching hits of any name but `engagement`"
	views_per_visit: "`pv_sum / sessions_n` to two decimals, summing each matching visit's own page-view count"
	bounce_rate:     "`bounce_n / bounce_denom` at a whole percent, the divisor rebuilt on the entry page"
	visit_duration:  "`dur_sum / sessions_n` at whole seconds, zero-duration visits kept in the divisor"
}

// A panel row answers the WINDOW, so where a row names both a panel and a
// granularity the granularity is the cursor's state and not the answer's: the
// covering array moves all four levers at once, and a reading that said "one
// bucket per local day, per page row" would claim a bucketed breakdown this app
// does not compute.
_readingOf: {
	metric: string
	panel:  string
	range:  string
	grain:  string
	shape:  string
	out:    _reading[metric] + ", " + _under[shape] + ", over " + _rangeLabel[range] + [
		if panel == "" && grain == "" {""},
		if panel == "" {", one bucket per local " + grain},
		if grain == "" {", per " + panel + " row"},
		", per " + panel + " row, which answers the whole window while the graph beside it stands at one bucket per local " + grain,
	][0] + "."
}

/// The first of `xs`, or the empty string when nothing matched. A struct keyed
/// by a pair cannot be indexed by a key it does not carry, so a sparse map is
/// spelled as a filtered list.
_first: {
	xs: [...string]
	out: list.Concat([xs, [""]])[0]
}

// --- the notes --------------------------------------------------------------
//
// A note is owed wherever the row departs from the sentence or pins one of the
// ten. The ten name the wrong readings they discriminate against, because the
// coverage anti-join reads exactly that: a plant discriminating against a
// reading no published question mentions is grading something nothing claimed.
_vpvNote: "The published sentence divides pageviews by visits; this app divides `pv_sum` by `sessions_n`, following the vendor's own expression, whose numerator is each visit's stored page-view count. The two differ over any visit straddling a window edge, and the sentence permits either."

// The other departure, and it is a property of the metric and the width of the
// window rather than of any block, which is why it is applied in `_question`
// once instead of restated in six places. The full statement is on the
// `visitors` Metric row, which /spec renders above these; this points at it.
_visitorsNote: "This app counts a person once however many days the window spans; the published sentence counts them again on each new day, the vendor's id riding a salt it rotates away. They agree only on a single-day window — the `visitors` row above reads it in full."

// How many local days each range's window spans, from the Range row's own
// arithmetic — `[back(midnight, from), back(midnight, to))`, closed on the as-of
// instant when `to_is_as_of`, which is what makes `day` one day rather than
// none. Derived rather than listed, so a sixth range arrives here instead of
// being silently exempt from the departure above.
_spanDays: {for r in code.state.entities.Range.seed {
	(r.id): r.from_days_back - r.to_days_back + [if r.to_is_as_of {1}, 0][0]
}}
_multiDay: {for id, n in _spanDays {(id): n > 1}}

_caseNote: {
	H1: "1860 and not 1800: the vendor keeps a session while `NaiveDateTime.diff(t, session.timestamp, :minute) <= 30` (lib/plausible/session/cache_store.ex) and Elixir's `:minute` diff truncates, so 1859 s reads as 30 minutes. Discriminates against gap_ge_1800, gap_from_start and engagement_does_not_hold; the fixture plants consecutive gaps of exactly 1799, 1800, 1859 and 1860 for one visitor."
	H2: "At hour granularity a visit is counted in every local hour it was OPEN, which is the vendor's own smear branch (expression.ex:444-446) and its asserted anchor A6. The hourly counts therefore do not sum to the day's, and the hours come from every hit, the pings included. Discriminates against hourly_visits_summed and hours_from_nonengagement."
	H3: "Visitors is a distinct count over the whole window and never a sum of the buckets': a visit crossing midnight keeps the key it opened with, and a returning visitor is one visitor. The window is walked as civil days. Discriminates against visitors_summed and window_by_multiplication."
	H4: "Under a page filter the bounce divisor counts the visits that ENTERED a matching page and not those that viewed one — the vendor's `sumIf(sign, ?)` over the entry-page condition (expression.ex:419-434), asserted by anchor A4 at 100 and not 50. Discriminates against bounce_on_viewed_page."
	H5: "An `engagement` hit is the tracker's liveness ping: it holds the visit open and contributes to nothing else, which anchor A5 asserts directly. Page views count only hits named `pageview`, and repeat views of one page are not de-duplicated. Discriminates against events_count_every_hit."
	H6: "A visit lasts from its first hit to its last NON-engagement hit, and every matching visit is in the divisor, the zero-duration ones included — the published sentence says so out loud, and anchor A5 asserts a duration of 0 for a page view followed by a ping. Discriminates against duration_drops_zero and duration_includes_engagement."
	H7: "An event-scoped filter on a visit-level metric matches the hits and then answers about their visits, so a page no visit entered on has visits above zero and a bounce rate of exactly zero — a zero by the vendor's `ifNotFinite` over an empty divisor, not by an empty cohort. Discriminates against visit_row_filtered_on_page, which is why the case is graded on `visits`."
	H8: "Buckets are cut on the site's clock and then read in UTC: a local day, a Monday-start week, and N CALENDAR days back. The spring-forward day is 23 buckets and the hour that does not exist is absent rather than empty. Discriminates against twenty_four_bars, utc_day_buckets, week_starts_sunday and window_by_multiplication."
	H9: "Views per visit and visit duration divide by the matching visits; bounce rate divides by the visits that entered a matching page. Under a page filter these are different divisors, and both are on screen beside their quotients. Discriminates against one_divisor_for_both."
	H10: "The three rows put the same figure under three different cursors, which is the claim: the published sentence beside them says the metric does not depend on the filters, and the only way to grade that is to move the filter and watch the number stay. Discriminates against current_visitors_filtered."
}

// --- the shape of a row ------------------------------------------------------
//
// `departs` is COMPUTED and no block spells it but the declined ones: a
// departure that a block could spell is one a block can spell wrong, and a row
// reading `departs: "no"` beside a sentence it contradicts is the exact failure
// the two columns exist to make impossible. `note` is composed the same way —
// the departure's own note, then whatever the row has to add — because a row may
// both depart and pin one of the ten, and each is owed a sentence.
_question: {
	id:         string
	metric:     string
	panel:      *"" | string
	dimension:  *"" | string
	range:      string
	grain:      *"" | string
	filter_set: string
	hard_case:  *"" | string
	// H10's rows answer `[as_of − 300, as_of)` and never the range, so the
	// window-width departure does not reach them.
	_departs: [
		if metric == "views_per_visit" {"approximates"},
		if metric == "visitors" && hard_case != "H10" && _multiDay[range] {"approximates"},
		"no",
	][0]
	_head: [
		if _departs != "approximates" {""},
		if metric == "views_per_visit" {_vpvNote},
		_visitorsNote,
	][0]
	// What the row adds beyond the departure: the hard case's note, or a
	// decline's cost.
	_note:      *"" | string
	departs:    *_departs | string
	expects:    *"nonzero" | string
	note:       *[if _head == "" {_note}, if _note == "" {_head}, _head + " " + _note][0] | string
	// Which published sentence the row is asked against — the metric's, except
	// for the figure that has no metric. Never a free string: a retyped sentence
	// could differ from the table's by a word, and the one rung of this apparatus
	// that grades the READING would be grading a typo.
	_saysKey:   *metric | string
	says:       _says[_saysKey]
	reads:      *(_readingOf & {"metric": metric, "panel": panel, "range": range, "grain": grain, shape: filter_set}).out | string
}

// --- metric × filter set (77) ------------------------------------------------
//
// The axis that genuinely interacts: a filter changes WHICH rows a metric is
// over and, for bounce rate, what it divides by. The range is pinned so the
// block varies two things and not three. `events` has no top-line cell and is
// asked on the full-panel screen instead, which is what gives all seven metrics
// a driven question.
_mfHard: [
	{metric: "bounce_rate", shape:    "unentered", case: "H7"},
	{metric: "bounce_rate", shape:    "event-1", case:   "H4"},
	{metric: "visit_duration", shape: "event-1", case:   "H9"},
	{metric: "visit_duration", shape: "none", case:      "H6"},
	{metric: "events", shape:         "none", case:      "H5"},
	{metric: "visits", shape:         "none", case:      "H1"},
	{metric: "visitors", shape:       "none", case:      "H3"},
]
_mf: [for m in _metricIds for f in _shapeIds {(_question & {
	id:         "q-mf-\(m)-\(f)"
	metric:     m
	panel:      [if m == "events" {"page"}, ""][0]
	range:      "28d"
	filter_set: f
	expects: [
		if m == "pageviews" && f == "goal" {"zero-by-filter"},
		if m == "bounce_rate" && f == "unentered" {"zero-by-ifNotFinite"},
		"nonzero",
	][0]
	// A views-per-visit row pins no hard case: none of the ten is graded on it,
	// and its departure is what its note is for.
	hard_case: [
		if m == "views_per_visit" {""},
		(_first & {xs: [for h in _mfHard if h.metric == m && h.shape == f {h.case}]}).out,
	][0]
	_note: [if hard_case != "" {_caseNote[hard_case]}, ""][0]
})}]

// --- panel × detailed metric × three shapes (72) -----------------------------
//
// A column name hard-coded in the fold fails here and nowhere else, because the
// same six questions are put to four different kinds of dimension.
_pm: [for p in _panelIds for m in _detailed for f in _panelShapes {(_question & {
	id:         "q-pm-\(p)-\(m)-\(f)"
	metric:     m
	panel:      p
	range:      "28d"
	filter_set: f
	expects:    [if m == "bounce_rate" && f == "unentered" {"zero-by-ifNotFinite"}, "nonzero"][0]
	hard_case:  [if f == "unentered" && m == "visits" {"H7"}, if m == "visit_duration" {"H6"}, ""][0]
	_note:      [if hard_case != "" {_caseNote[hard_case]}, ""][0]
})}]

// --- graph metric × legal pair (21) ------------------------------------------
//
// Every granularity against every range, unfiltered: what varies is the axis,
// and a filter would confound a bucket-cardinality failure with a matching one.
_gp: [for m in _bucketed for pr in _pairs {(_question & {
	id:         "q-gp-\(m)-\(pr.range)-\(pr.grain)"
	metric:     m
	range:      pr.range
	grain:      pr.grain
	filter_set: "none"
	hard_case: [
		if pr.range == "custom_dst_day" {"H8"},
		if pr.grain == "hour" {"H2"},
		if m == "visitors" && pr.grain == "week" {"H3"},
		"",
	][0]
	_note: [if hard_case != "" {_caseNote[hard_case]}, ""][0]
})}]

// --- range × metric (35) -----------------------------------------------------
//
// Window arithmetic against every metric: the block where a window start
// computed by multiplication shows up as a value rather than as a bucket count.
_rm: [for r in _rangeIds for m in _metricIds {(_question & {
	id:         "q-rm-\(r)-\(m)"
	metric:     m
	panel:      [if m == "events" {"page"}, ""][0]
	range:      r
	filter_set: "none"
	hard_case: [
		if m == "views_per_visit" {""},
		if m == "visitors" && r == "28d" {"H3"},
		if r == "custom_dst_day" {"H8"},
		"",
	][0]
	_note: [if hard_case != "" {_caseNote[hard_case]}, ""][0]
})}]

// --- the basis table (13) ----------------------------------------------------
//
// One row per cell, so the axis anti-join asks "was every cell driven" rather
// than "was every metric driven" — and one declined row per metric the graph
// does not bucket, because declining a cell and forgetting it are the same green
// run unless the cost is written down.
_bbGrainRange: {hour: "day", day: "28d", week: "28d"}
_bbDeclined: [
	{metric: "events", range:          "28d", grain:            "day"},
	{metric: "views_per_visit", range: "28d", grain:            "day"},
	{metric: "bounce_rate", range:     "28d", grain:            "day"},
	{metric: "visit_duration", range:  "custom_dst_day", grain: "hour"},
]
_declineBucket: {
	events:          "The graph carries visitors, visits and page views and nothing else. Bucketing this one costs a fourth series on one axis and a second attribution rule — a hit's own bucket — for a number the top line already answers over the window."
	views_per_visit: "Not answered per bucket. A quotient of two bucketed sums is not the bucketed quotient, and answering it would need `pv_sum` and `sessions_n` carried per bucket as graded columns of their own."
	bounce_rate:     "Not answered per bucket. The divisor is conditional on the entry page, so a bucketed bounce rate needs a second bucketed divisor beside it or it is a percentage of an unstated cohort."
	visit_duration:  "The vendor DOES bucket it, attributing a visit's whole duration to the hour of its LAST hit — anchor A6 asserts 12000 s in hour 03 and 0 in hour 00 for one visit open across all four. Declining costs that cell of the basis table and the one wrong reading it would catch: a duration smeared across the hours a visit was open."
}
_bb: list.Concat([
	[for m in _bucketed for g in ["hour", "day", "week"] {(_question & {
		id:         "q-bb-\(m)-\(g)"
		metric:     m
		range:      _bbGrainRange[g]
		grain:      g
		filter_set: "none"
		hard_case:  [if g == "hour" {"H2"}, if g == "week" {"H8"}, ""][0]
		_note:      [if hard_case != "" {_caseNote[hard_case]}, ""][0]
	})}],
	// A declined row states the absence, because the derived reading would
	// otherwise read as an answer: "one bucket per local day" on a row whose whole
	// claim is that there is no such bucket.
	[for u in _bbDeclined {(_question & {
		id:         "q-bb-\(u.metric)-\(u.grain)"
		metric:     u.metric
		range:      u.range
		grain:      u.grain
		filter_set: "none"
		departs:    "declined"
		expects:    "unanswered"
		note:       _declineBucket[u.metric]
		reads:      "Not answered per bucket: no bucket on the axis carries a `\(u.metric)` cell. " + _reading[u.metric] + " is a window-level number here, and the note says what declining costs."
	})}],
])

// --- the covering array (48) -------------------------------------------------
//
// The only rows that move a panel, a range, a granularity and a filter shape at
// once, which is what catches a cursor whose slots interfere. Twelve rows per
// dimension: every filter shape once, then a return to the unfiltered shape at
// another granularity. Between them every (panel, filter shape) and every
// (panel, legal pair) appears — 44 and 28 combinations in 48 rows, which is the
// most an array this size can carry: (range, filter shape) alone is 55 pairs and
// does not fit. `questions.test.ts` asserts the two claims this block makes
// rather than the one it cannot.
_cv: [for pi, p in _panelIds for i in list.Range(0, 12, 1)
	let f = [if i < 11 {_shapeIds[i]}, "none"][0]
	let pr = _pairs[mod(i+pi, 7)] {(_question & {
		id:         "q-cv-\(p)-\(pr.range)-\(pr.grain)-\(f)"
		metric:     "visitors"
		panel:      p
		range:      pr.range
		grain:      pr.grain
		filter_set: f
		// Two shapes match nothing at all in one window each. A question over an
		// empty cohort is not a degenerate question — it is the one that grades
		// the empty state — but it has to say so, or a fold answering zero to
		// everything passes it.
		expects: [
			if f == "event-visit" && pr.range == "custom_dst_day" {"zero-by-empty-window"},
			if f == "visit-visit" && pr.range == "day" {"zero-by-empty-window"},
			"nonzero",
		][0]
	})}]

// --- the ten (40) ------------------------------------------------------------
_hcRow: {
	id:         string
	metric:     string
	panel:      *"" | string
	dimension:  *"" | string
	range:      string
	grain:      *"" | string
	filter_set: *"none" | string
	expects:    *"nonzero" | string
}
_hcRows: [..._hcRow] & [
	{id: "H1-visits-boundary", metric: "visits", range: "28d"},
	{id: "H1-visits-7d", metric: "visits", range: "7d"},
	{id: "H1-visits-day", metric: "visits", range: "day"},
	{id: "H1-visits-visit-1", metric: "visits", range: "28d", filter_set: "visit-1"},
	{id: "H2-visits-hour", metric: "visits", range: "day", grain: "hour"},
	{id: "H2-visits-dst-hour", metric: "visits", range: "custom_dst_day", grain: "hour"},
	{id: "H2-visitors-hour", metric: "visitors", range: "day", grain: "hour"},
	{id: "H2-pageviews-hour", metric: "pageviews", range: "day", grain: "hour"},
	{id: "H3-visitors-28d", metric: "visitors", range: "28d"},
	{id: "H3-visitors-28d-day", metric: "visitors", range: "28d", grain: "day"},
	{id: "H3-visitors-21d", metric: "visitors", range: "custom_21d"},
	{id: "H3-visitors-7d", metric: "visitors", range: "7d"},
	{id: "H4-bounce-event-1", metric: "bounce_rate", range: "28d", filter_set: "event-1"},
	{id: "H4-bounce-event-1-7d", metric: "bounce_rate", range: "7d", filter_set: "event-1"},
	{id: "H4-bounce-event-1-21d", metric: "bounce_rate", range: "custom_21d", filter_set: "event-1"},
	{id: "H4-bounce-blog-why", metric: "bounce_rate", range: "28d", filter_set: "contains", panel: "page", dimension: "/blog/why"},
	{id: "H5-events-page", metric: "events", range: "28d", panel: "page"},
	{id: "H5-events-browser", metric: "events", range: "28d", panel: "browser"},
	{id: "H5-pageviews-none", metric: "pageviews", range: "28d"},
	{id: "H5-events-source", metric: "events", range: "28d", panel: "source"},
	{id: "H6-duration-none", metric: "visit_duration", range: "28d"},
	{id: "H6-duration-7d", metric: "visit_duration", range: "7d"},
	{id: "H6-duration-visit-1", metric: "visit_duration", range: "28d", filter_set: "visit-1"},
	{id: "H6-duration-21d", metric: "visit_duration", range: "custom_21d"},
	{id: "H7-visits-unentered", metric: "visits", range: "28d", filter_set: "unentered"},
	{id: "H7-visits-checkout", metric: "visits", range: "28d", filter_set: "unentered", panel: "page", dimension: "/checkout"},
	{id: "H7-bounce-unentered", metric: "bounce_rate", range: "28d", filter_set: "unentered", expects: "zero-by-ifNotFinite"},
	{id: "H7-duration-unentered", metric: "visit_duration", range: "28d", filter_set: "unentered"},
	{id: "H8-visitors-dst-hour", metric: "visitors", range: "custom_dst_day", grain: "hour"},
	{id: "H8-visitors-28d-day", metric: "visitors", range: "28d", grain: "day"},
	{id: "H8-visitors-21d-week", metric: "visitors", range: "custom_21d", grain: "week"},
	{id: "H8-visits-dst-hour", metric: "visits", range: "custom_dst_day", grain: "hour"},
	{id: "H8-pageviews-28d-week", metric: "pageviews", range: "28d", grain: "week"},
	{id: "H8-visitors-dst", metric: "visitors", range: "custom_dst_day"},
	{id: "H9-duration-contains", metric: "visit_duration", range: "28d", filter_set: "contains"},
	{id: "H9-bounce-contains", metric: "bounce_rate", range: "28d", filter_set: "contains"},
	{id: "H9-visits-contains", metric: "visits", range: "28d", filter_set: "contains"},
	{id: "H10-current-none", metric: "visitors", range: "28d"},
	{id: "H10-current-goal", metric: "visitors", range: "28d", filter_set: "goal"},
	{id: "H10-current-unentered", metric: "visitors", range: "28d", filter_set: "unentered"},
]
// Current visitors is the one figure the seven-metric vocabulary cannot name:
// it answers a five-minute window rather than the range, and it has no `Metric`
// row. Its three rows carry the coordinates of the cursor they are asked under
// — which is the whole of what H10 claims, that the cursor does not reach it —
// and quote the definition of the figure actually on screen rather than the
// `visitors` row's, which describes the cell beside it.
_currentSays: "The number of people currently on your site. This metric does not depend on the filters applied to the dashboard. It includes all visitors who have loaded a page in the last 5 minutes."
_currentReads: "The current-visitors figure, not the top line's `visitors` cell: a distinct count of `visitor` over `[as_of − 300, as_of)`, ignoring every slot of the cursor and the range alike. It reads the as-of instant off the row and never a real clock."

_hc: [for r in _hcRows {(_question & {
	id:         "q-hc-\(r.id)"
	metric:     r.metric
	panel:      r.panel
	dimension:  r.dimension
	range:      r.range
	grain:      r.grain
	filter_set: r.filter_set
	expects:    r.expects
	hard_case:  strings.Split(r.id, "-")[0]
	_note:      _caseNote[hard_case]
	if hard_case == "H10" {
		_saysKey: "current_visitors"
		reads:    _currentReads
	}
})}]

// --- what this app declines (6) ----------------------------------------------
//
// The coordinates say where the question WOULD have been put; the reading and
// the note say what is not there, because the columns cannot name a dimension
// the app has no row for. A declined row is driven like any other: the drive
// asserts the ABSENCE it claims, so declining and forgetting are different runs.
_dcRows: [
	{
		id:    "locations"
		reads: "Not answered. There is no country, region or city panel: the log carries no location column, and one would be a fifth dimension family with a vocabulary of its own."
		note:  "The vendor publishes Locations as three dimensions over a GeoIP database this app has no equivalent of. Declining costs the reader every geographic question and costs the apparatus nothing it can grade: a location column invented for this fixture would be graded against arithmetic one author wrote on both sides, which is the one thing ORACLE.md §6 refuses to add more of."
	},
	{
		id:    "operating-system"
		reads: "Not answered. The log carries the browser and not the operating system, so there is no OS panel and no OS slot on the cursor."
		note:  "The vendor derives it from the User-Agent it then discards. This app's log carries the browser alone: a second frozen visit attribute would double the visit-scoped slot vocabulary and change nothing about how a visit-scoped slot MATCHES, which is what `visit-1` and `visit-visit` already grade."
	},
	{
		id:    "screen-size"
		reads: "Not answered. There is no device or screen-size panel; the log carries no viewport column."
		note:  "The vendor buckets a viewport width into four names at ingest. Declining costs a fourth kind of dimension whose only new question is the bucketing of a number this log does not carry — and a bucketing rule invented here would be graded against itself."
	},
	{
		id:    "exit-pages"
		reads: "Not answered as a panel. `Session.exit_page` is stitched and shown on the visits screen, but no panel ranks it and no cursor slot narrows by it."
		note:  "This is the cheapest of the four to have added, so the cost is worth stating plainly: a fifth panel over a column the stitch already writes, ranked and cut exactly as the other four. What it would grade that `entry_page` does not is the exit rule — the last page VIEWED — and that rule is already graded column-for-column by stitch.test.ts."
	},
	{
		id:    "minute-grain"
		reads: "Not answered. The granularities are hour, day and week; there is no minute button, because there is no `Grain` row for one and an illegal pair therefore has nothing to refuse."
		note:  "The vendor offers minute granularity on its realtime view. Over a 35-day log a minute axis is 50400 buckets, fifteen times the whole graph space this oracle grades, and it answers no question the hour axis does not: the two rules that make an axis hard — the local cut and the smear — are both graded at hour granularity already, by H8 and H2."
	},
	{
		id:    "two-conditions"
		reads: "Not answered. The operator rides inside the slot's value (`is:`, `not:`, `has:`, and `|` for a disjunction), so a slot holds one clause and `page is /a AND page is /b` cannot be stated."
		note:  "The bound is deliberate and it is what keeps `&` and `=` out of every filter value, so the read grammar never has to escape one. What it costs is a conjunction on one dimension. A disjunction on one dimension is not lost — `|` rides inside the value, and the `disjunction` shape grades it."
	},
]
_dc: [for r in _dcRows {(_question & {
	id:         "q-dc-\(r.id)"
	metric:     "visitors"
	range:      "28d"
	filter_set: "none"
	departs:    "declined"
	expects:    "unanswered"
	note:       r.note
	reads:      r.reads
})}]

_questions: list.Concat([_mf, _pm, _gp, _rm, _bb, _cv, _hc, _dc])
