// The machine rung of apps/plausible: a pronto.#App compiled from ir.html
// (pinned below). Nobody reviews this; it must merely be checkable — cue vet,
// the ir bijection, and the emitted surface are the contract.
//
// Every entity takes the `tab` path (ir decision-01), so this program emits no
// migration, no policy, no publication and no pipeline. The aggregation is two
// Jessie reduces at the `data-on-mutation` seat, which is the one seat an
// off-disk mount executes — and therefore the only seat an oracle can grade.
@extern(embed)

package plausible

import (
	pronto "bonisoft.org/plugins/pronto"
)

_designMd: _ @embed(file="DESIGN.md", type=text)

code: pronto.#App & {
	state: {
		entities: {
			// --- the log, and the clock it is read on -----------------------
			Event: {
				id: "0xba279baa3624f69b"
				table:      "event"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() <= 8"},
					{ordinal: 2, name: "epoch", type: "timestamp"},
					{ordinal: 3, name: "visitor", type: "string", cel: "this.size() <= 16"},
					{ordinal: 4, name: "name", type: "string", cel: "this in ['pageview', 'engagement', 'signup']"},
					// The hit's own column, never a reading of its name: a custom
					// event may declare itself non-interactive and then clears no
					// bounce.
					{ordinal: 5, name: "interactive", type: "bool"},
					{ordinal: 6, name: "pathname", type: "string", cel: "this.size() <= 40"},
					{ordinal: 7, name: "source", type: "string", cel: "this.size() <= 24"},
					{ordinal: 8, name: "browser", type: "string", cel: "this.size() <= 24"},
				]
				seed: _events
			}
			// The site's clock as three rows. A reduce has no Intl and no Date, so
			// a local day is arithmetic over the row with the greatest
			// starts_epoch at or before the instant.
			Zone: {
				id: "0xd99338a824a5da9a"
				table:      "zone"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() <= 16"},
					{ordinal: 2, name: "starts_epoch", type: "timestamp"},
					{ordinal: 3, name: "offset_seconds", type: "int32", cel: "this >= 0"},
					{ordinal: 4, name: "abbr", type: "string", cel: "this.size() <= 8"},
				]
				seed: _zones
			}

			// --- what `stitch` derives from the log alone --------------------
			Session: {
				id: "0xbf4c20537de4272b"
				table:      "session"
				durability: "tab"
				fields: [
					// <visitor>#<ord>. A reduce may only write where it can name
					// the key — there is no `post` — so a visit's identity is
					// arithmetic over the log, not a counter.
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() <= 24"},
					{ordinal: 2, name: "visitor", type: "string", cel: "this.size() <= 16"},
					{ordinal: 3, name: "ord", type: "int32", cel: "this >= 1"},
					{ordinal: 4, name: "start_epoch", type: "timestamp"},
					{ordinal: 5, name: "last_epoch", type: "timestamp"},
					{ordinal: 6, name: "start_local", type: "string", cel: "this.size() <= 20"},
					{ordinal: 7, name: "last_local", type: "string", cel: "this.size() <= 20"},
					{ordinal: 8, name: "entry_page", type: "string", cel: "this.size() <= 40"},
					{ordinal: 9, name: "exit_page", type: "string", cel: "this.size() <= 40"},
					{ordinal: 10, name: "pageviews", type: "int32", cel: "this >= 0"},
					{ordinal: 11, name: "events", type: "int32", cel: "this >= 0"},
					{ordinal: 12, name: "bounce", type: "string", cel: "this in ['yes', 'no']"},
					{ordinal: 13, name: "duration", type: "int32", cel: "this >= 0"},
					{ordinal: 14, name: "source", type: "string", cel: "this.size() <= 24"},
					{ordinal: 15, name: "browser", type: "string", cel: "this.size() <= 24"},
					// The visit-level page and name sets, delimiter-fenced so a
					// containment test cannot match across two of them. `rollup`
					// answers a page slot about a VISIT from this column rather
					// than by re-deriving the partition.
					{ordinal: 16, name: "pages", type: "string", cel: "this.size() <= 400"},
					{ordinal: 17, name: "names", type: "string", cel: "this.size() <= 200"},
					// The same two sets in a reader's punctuation. The fenced form is
					// a storage form — `|/|` on a screen is an encoding leaking into
					// a view — and a screen cannot re-punctuate a string, so the fold
					// states both: the fences for the containment tests `rollup`
					// runs, and these for the column a person reads.
					{ordinal: 18, name: "pages_text", type: "string", cel: "this.size() <= 400"},
					{ordinal: 19, name: "names_text", type: "string", cel: "this.size() <= 200"},
					{ordinal: 20, name: "day_key", type: "string", cel: "this.size() <= 10"},
					{ordinal: 21, name: "week_key", type: "string", cel: "this.size() <= 10"},
					{ordinal: 22, name: "hours_n", type: "int32", cel: "this >= 1"},
				]
			}
			// One row per visit per local hour it was open in, whether or not a
			// hit fell in that hour.
			SessionHour: {
				id: "0xf391a2c3bc6a61ee"
				table:      "session_hour"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() <= 40"},
					{ordinal: 2, name: "session_id", type: "string", cel: "this.size() <= 24"},
					{ordinal: 3, name: "bucket_key", type: "string", cel: "this.size() <= 16"},
					{ordinal: 4, name: "ord", type: "int32", cel: "this >= 0"},
				]
			}
			// The signal, not the summary. `stitch` states this row LAST, so a
			// corpus write means every Session and SessionHour row of this world
			// has already landed — which is the edge `rollup`'s second ear rides.
			Corpus: {
				id: "0x884ec50b9f94765a"
				table:      "corpus"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() <= 4"},
					{ordinal: 2, name: "hits", type: "int32", cel: "this >= 0"},
					{ordinal: 3, name: "visits", type: "int32", cel: "this >= 0"},
					{ordinal: 4, name: "visitors", type: "int32", cel: "this >= 0"},
					// An empty log has no first or last hit, and 1970 is not one.
					{ordinal: 5, name: "first_epoch", type: "timestamp", required: false},
					{ordinal: 6, name: "last_epoch", type: "timestamp", required: false},
					{ordinal: 7, name: "first_local", type: "string", cel: "this.size() <= 20"},
					{ordinal: 8, name: "last_local", type: "string", cel: "this.size() <= 20"},
					{ordinal: 9, name: "days", type: "int32", cel: "this >= 0"},
				]
				seed: [{id: "the", hits: 0, visits: 0, visitors: 0, first_local: "", last_local: "", days: 0}]
			}
			// Each reduce's own row. A refusal has to BE an update — a throw
			// loses the writes, because a reduce's writes are its return value.
			Fold: {
				id: "0xb9fa5abdb9fcf355"
				table:      "fold"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", cel: "this in ['stitch', 'rollup']", pk: true},
					{ordinal: 2, name: "note", type: "string", cel: "this.size() <= 200"},
					{ordinal: 3, name: "error", type: "string", cel: "this.size() <= 400"},
				]
				seed: [
					{id: "stitch", note: "the log becomes visits, and the visits become local hours", error: ""},
					{id: "rollup", note: "the live cursor becomes the numbers on the screen", error: ""},
				]
			}

			// --- the cursor, declared and live -------------------------------
			// The DECLARED cursor: what a URL means. Eleven rows, written by
			// nothing, and what a reset restores.
			FilterSet: {
				id: "0xaa0a90242779ec9f"
				table:      "filter_set"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() <= 24"},
					{ordinal: 2, name: "name", type: "string", cel: "this.size() > 0"},
					{ordinal: 3, name: "says", type: "string", cel: "this.size() > 0"},
					{ordinal: 4, name: "slots", type: "string", cel: "this.size() <= 80"},
					{ordinal: 5, name: "pos", type: "int32", cel: "this >= 1"},
					{ordinal: 6, name: "range", type: "string", cel: "this in ['day', '7d', '28d', 'custom_21d', 'custom_dst_day']"},
					{ordinal: 7, name: "grain", type: "string", cel: "this in ['hour', 'day', 'week']"},
					{ordinal: 8, name: "as_of_epoch", type: "timestamp"},
					// Carried on the declared cursor as well as the live one: a
					// reset binds every cursor column off this row, and a column
					// the reset cannot name is a column a reset cannot restore.
					{ordinal: 9, name: "active_bucket", type: "string", cel: "this.size() <= 8"},
					{ordinal: 10, name: "f_page", type: "string", cel: "this.size() <= 60"},
					{ordinal: 11, name: "f_entry_page", type: "string", cel: "this.size() <= 60"},
					{ordinal: 12, name: "f_source", type: "string", cel: "this.size() <= 60"},
					{ordinal: 13, name: "f_browser", type: "string", cel: "this.size() <= 60"},
					{ordinal: 14, name: "f_name", type: "string", cel: "this.size() <= 60"},
				]
				seed: _filterSets
			}
			// The LIVE cursor: what the reader has done to it. Eleven rows,
			// seeded identical to their declared twins and written only by forms.
			// `rollup` reads exactly one of them, through data-read-cursor, so
			// there is no overlay and therefore no precedence branch.
			Filter: {
				id: "0xb342c754449e3fb8"
				table:      "filter"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() <= 24"},
					{ordinal: 2, name: "range", type: "string", cel: "this in ['day', '7d', '28d', 'custom_21d', 'custom_dst_day']"},
					{ordinal: 3, name: "grain", type: "string", cel: "this in ['hour', 'day', 'week']"},
					{ordinal: 4, name: "as_of_epoch", type: "timestamp"},
					{ordinal: 5, name: "active_bucket", type: "string", cel: "this.size() <= 8"},
					{ordinal: 6, name: "f_page", type: "string", cel: "this.size() <= 60"},
					{ordinal: 7, name: "f_entry_page", type: "string", cel: "this.size() <= 60"},
					{ordinal: 8, name: "f_source", type: "string", cel: "this.size() <= 60"},
					{ordinal: 9, name: "f_browser", type: "string", cel: "this.size() <= 60"},
					{ordinal: 10, name: "f_name", type: "string", cel: "this.size() <= 60"},
				]
				seed: _liveCursors
			}

			// --- what `rollup` writes ----------------------------------------
			// One row. The six displays and the divisors they were reached by,
			// side by side: a wrong divisor cannot hide behind a quotient that
			// rounds the same.
			Topline: {
				id: "0xf3ff619043f60ad2"
				table:      "topline"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() <= 4"},
					{ordinal: 2, name: "visitors_n", type: "int32", cel: "this >= 0"},
					{ordinal: 3, name: "visits_n", type: "int32", cel: "this >= 0"},
					{ordinal: 4, name: "pageviews_n", type: "int32", cel: "this >= 0"},
					{ordinal: 5, name: "events_n", type: "int32", cel: "this >= 0"},
					// The divisors, graded columns rather than intermediates.
					// `sessions_n` divides views_per_visit and visit_duration;
					// `bounce_denom` is the entry-restricted count and divides
					// bounce_rate alone.
					{ordinal: 6, name: "sessions_n", type: "int32", cel: "this >= 0"},
					{ordinal: 7, name: "bounce_denom", type: "int32", cel: "this >= 0"},
					{ordinal: 8, name: "bounce_n", type: "int32", cel: "this >= 0"},
					{ordinal: 9, name: "pv_sum", type: "int32", cel: "this >= 0"},
					{ordinal: 10, name: "dur_sum", type: "int32", cel: "this >= 0"},
					// The rendered strings, because the rounding is part of the
					// metric definition and the graded artifact is what is read.
					{ordinal: 11, name: "visitors_text", type: "string", cel: "this.size() <= 12"},
					{ordinal: 12, name: "visits_text", type: "string", cel: "this.size() <= 12"},
					{ordinal: 13, name: "pageviews_text", type: "string", cel: "this.size() <= 12"},
					{ordinal: 14, name: "views_per_visit_text", type: "string", cel: "this.size() <= 12"},
					{ordinal: 15, name: "bounce_rate_text", type: "string", cel: "this.size() <= 12"},
					{ordinal: 16, name: "visit_duration_text", type: "string", cel: "this.size() <= 12"},
					// The window these figures were computed over, in the words the
					// pickers spell it in. `Filter.range` is an id — `28d`,
					// `custom_dst_day` — and a screen binds a column and cannot
					// translate one, so the read form is the fold's to write. It is
					// also the fold's ANSWER: on a refusal the cursor has moved and
					// these have not, and a line bound to the cursor would name a
					// window the figures beside it are not for.
					{ordinal: 17, name: "range_text", type: "string", cel: "this.size() <= 40"},
					{ordinal: 18, name: "grain_text", type: "string", cel: "this.size() <= 8"},
					// The last five minutes of the log, and the one number on the
					// screen no filter narrows.
					{ordinal: 19, name: "current_visitors", type: "int32", cel: "this >= 0"},
					// Unset until the fold has resolved a window.
					{ordinal: 20, name: "window_from", type: "timestamp", required: false},
					{ordinal: 21, name: "window_to", type: "timestamp", required: false},
				]
				seed: [{id: "the", visitors_n: 0, visits_n: 0, pageviews_n: 0, events_n: 0, sessions_n: 0, bounce_denom: 0, bounce_n: 0, pv_sum: 0, dur_sum: 0, visitors_text: "0", visits_text: "0", pageviews_text: "0", views_per_visit_text: "0", bounce_rate_text: "0", visit_duration_text: "0", range_text: "", grain_text: "", current_visitors: 0}]
			}
			// `b-00`…`b-27`: 28 is the largest bucket count any legal pair
			// produces (28d → day), stated as that maximum rather than a round
			// number.
			Bucket: {
				id: "0x871e0fb7227939a5"
				table:      "bucket"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() == 4"},
					{ordinal: 2, name: "ord", type: "int32", cel: "this >= 0"},
					{ordinal: 3, name: "bucket_key", type: "string", cel: "this.size() <= 16"},
					{ordinal: 4, name: "label", type: "string", cel: "this.size() <= 24"},
					{ordinal: 5, name: "grain", type: "string", cel: "this in ['hour', 'day', 'week']"},
					{ordinal: 6, name: "visitors", type: "int32", cel: "this >= 0"},
					{ordinal: 7, name: "visits", type: "int32", cel: "this >= 0"},
					{ordinal: 8, name: "pageviews", type: "int32", cel: "this >= 0"},
					// Per mille of the domain. Every geometry custom property
					// carries a fold-computed number, never a string out of the
					// log: nothing validates the channel, and a value carrying its
					// own `;` is a second declaration nobody wrote.
					{ordinal: 9, name: "share", type: "int32", cel: "this >= 0"},
					// Which point the caret is on, as a column of the point
					// rather than a projection over the set: a projection's
					// parameter is the cursor, and a region carrying one is
					// re-hydrated on every arrow press.
					{ordinal: 10, name: "on_caret", type: "bool"},
				]
			}
			// Five axis rows over the graph's own domain, each carrying `at` —
			// where it sits, per mille — because no stylesheet can divide a
			// value by a domain it cannot see.
			Tick: {
				id: "0xb47c30099578a482"
				table:      "tick"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() == 3"},
					{ordinal: 2, name: "ord", type: "int32", cel: "this >= 0"},
					{ordinal: 3, name: "value", type: "int32", cel: "this >= 0"},
					{ordinal: 4, name: "label", type: "string", cel: "this.size() <= 12"},
					{ordinal: 5, name: "at", type: "int32", cel: "this >= 0"},
				]
			}
			// The chart's one row. `path_d` is one closed column per bucket and
			// `floor_d` one mark per bucket that measured nothing, both strings the
			// fold computes; the region holding them is a leaf slot, which is the
			// only region kind that binds an attribute without sweeping its children.
			// Two strings and not one because a zero-height column paints nothing and
			// CSS cannot reach a subpath.
			Scale: {
				id: "0x98b48a3a9b3ac28f"
				table:      "scale"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() <= 4"},
					{ordinal: 2, name: "domain_max", type: "int32", cel: "this >= 0"},
					{ordinal: 3, name: "points", type: "int32", cel: "this >= 0"},
					{ordinal: 4, name: "path_d", type: "string", cel: "this.size() <= 4000"},
					{ordinal: 5, name: "floor_d", type: "string", cel: "this.size() <= 4000"},
					// The caret, on the one row of the one region that cannot go
					// away. It is columns of Scale rather than of Bucket because
					// the arrows have to outlive the point they name; the
					// readout's markup states what pinning them on it costs.
					{ordinal: 6, name: "caret_point", type: "string", cel: "this.size() <= 4"},
					{ordinal: 7, name: "caret_label", type: "string", cel: "this.size() <= 24"},
					{ordinal: 8, name: "caret_prev", type: "string", cel: "this.size() <= 4"},
					{ordinal: 9, name: "caret_next", type: "string", cel: "this.size() <= 4"},
				]
				seed: [{id: "the", domain_max: 0, points: 0, path_d: "", floor_d: "", caret_point: "", caret_label: "", caret_prev: "", caret_next: ""}]
			}
			// `<panel>|<value>`. `ord` is the row's place under
			// `visitors desc, dim_value asc` — the selection and the order are
			// graded, because ranked by the wrong metric a panel shows a
			// different set of nine and every number in it is still correct.
			Breakdown: {
				id: "0xbec76142cdb7e0e1"
				table:      "breakdown"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() <= 64"},
					{ordinal: 2, name: "panel", type: "string", cel: "this in ['page', 'entry_page', 'source', 'browser']"},
					{ordinal: 3, name: "dim_value", type: "string", cel: "this.size() <= 40"},
					{ordinal: 4, name: "ord", type: "int32", cel: "this >= 0"},
					{ordinal: 5, name: "visitors", type: "int32", cel: "this >= 0"},
					{ordinal: 6, name: "visits", type: "int32", cel: "this >= 0"},
					{ordinal: 7, name: "pageviews", type: "int32", cel: "this >= 0"},
					{ordinal: 8, name: "events", type: "int32", cel: "this >= 0"},
					{ordinal: 9, name: "bounce_n", type: "int32", cel: "this >= 0"},
					{ordinal: 10, name: "bounce_denom", type: "int32", cel: "this >= 0"},
					{ordinal: 11, name: "sessions_n", type: "int32", cel: "this >= 0"},
					{ordinal: 12, name: "dur_sum", type: "int32", cel: "this >= 0"},
					{ordinal: 13, name: "bounce_rate_text", type: "string", cel: "this.size() <= 12"},
					{ordinal: 14, name: "visit_duration_text", type: "string", cel: "this.size() <= 12"},
					{ordinal: 15, name: "share", type: "int32", cel: "this >= 0"},
					{ordinal: 16, name: "arc", type: "int32", cel: "this >= 0"},
					// The five slots of the cursor this row would write, with this
					// panel's slot replaced by this row's value. They are real
					// columns because a nested item template binds against its OWN
					// row — `{f_source}` inside a breakdown item raises
					// `binding {f_source} not in row` — and because upsertBy
					// PATCHES, so a form naming one slot would leave the other four
					// standing and a reader would walk out of the graded space.
					{ordinal: 17, name: "set_page", type: "string", cel: "this.size() <= 60"},
					{ordinal: 18, name: "set_entry_page", type: "string", cel: "this.size() <= 60"},
					{ordinal: 19, name: "set_source", type: "string", cel: "this.size() <= 60"},
					{ordinal: 20, name: "set_browser", type: "string", cel: "this.size() <= 60"},
					{ordinal: 21, name: "set_name", type: "string", cel: "this.size() <= 60"},
				]
			}
			// One row per slot in force. The id IS the slot name, because a click
			// carries no payload: design the row id to be the datum.
			Chip: {
				id: "0xb216f2e41cfb1e71"
				table:      "chip"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this in ['f_page', 'f_entry_page', 'f_source', 'f_browser', 'f_name']"},
					// Declared unique so a per-slot region can be a slot at all: a
					// slot's filter must pin a pk, a unique field, or every column
					// of a declared unique, and `limit=1` is not a witness.
					{ordinal: 2, name: "slot", type: "string", unique: true, cel: "this in ['f_page', 'f_entry_page', 'f_source', 'f_browser', 'f_name']"},
					{ordinal: 3, name: "label", type: "string", cel: "this.size() <= 80"},
					{ordinal: 4, name: "value", type: "string", cel: "this.size() <= 60"},
					{ordinal: 5, name: "set_page", type: "string", cel: "this.size() <= 60"},
					{ordinal: 6, name: "set_entry_page", type: "string", cel: "this.size() <= 60"},
					{ordinal: 7, name: "set_source", type: "string", cel: "this.size() <= 60"},
					{ordinal: 8, name: "set_browser", type: "string", cel: "this.size() <= 60"},
					{ordinal: 9, name: "set_name", type: "string", cel: "this.size() <= 60"},
				]
			}

			// --- the vocabularies, whose sizes are the claim ------------------
			Panel: {
				id: "0xd911e6d6d3021c35"
				table:      "panel"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this in ['page', 'entry_page', 'source', 'browser']"},
					{ordinal: 2, name: "title", type: "string", cel: "this.size() > 0"},
					{ordinal: 3, name: "note", type: "string", cel: "this.size() > 0"},
					{ordinal: 4, name: "slot", type: "string", cel: "this in ['f_page', 'f_entry_page', 'f_source', 'f_browser']"},
					{ordinal: 5, name: "column", type: "string", cel: "this.size() <= 16"},
					// Whether the dimension is a property of the HIT or of the
					// VISIT. It decides how a value is grouped and how a filter on
					// it matches, and it is the one column that makes `page` and
					// `entry_page` different questions rather than two spellings.
					{ordinal: 6, name: "on", type: "string", cel: "this in ['hit', 'visit']"},
					{ordinal: 7, name: "pos", type: "int32", cel: "this >= 1"},
				]
				seed: [
					{id: "page", title: "Top pages", note: "Every page viewed in the window, by the visitors who viewed it.", slot: "f_page", column: "pathname", on: "hit", pos: 1},
					{id: "entry_page", title: "Entry pages", note: "The first page each visit VIEWED — not the first hit it made.", slot: "f_entry_page", column: "entry_page", on: "visit", pos: 2},
					{id: "source", title: "Sources", note: "Frozen at the visit's first hit, so every later hit of that visit carries it.", slot: "f_source", column: "source", on: "visit", pos: 3},
					{id: "browser", title: "Browsers", note: "Frozen at the visit's first hit, like the source.", slot: "f_browser", column: "browser", on: "visit", pos: 4},
				]
			}
			// `says` is the published sentence; `reads` is this app's own wording
			// of what it computes; `formula` is the published expression,
			// verbatim, and only works as a mitigation if nobody tidies it —
			// `source` is where both were quoted from. The rows are in
			// questions.cue, beside the questions that carry the same sentences.
			Metric: {
				id: "0xc4961ace112bb6ff"
				table:      "metric"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() <= 20"},
					{ordinal: 2, name: "says", type: "string", cel: "this.size() > 0"},
					{ordinal: 3, name: "formula", type: "string", cel: "this.size() > 0"},
					{ordinal: 4, name: "source", type: "string", cel: "this.size() > 0"},
					{ordinal: 5, name: "reads", type: "string", cel: "this.size() > 0"},
					{ordinal: 6, name: "pos", type: "int32", cel: "this >= 1"},
				]
				seed: [for i, m in _metrics {m & {pos: i + 1}}]
			}
			Range: {
				id: "0xc5d96d21f63c11a7"
				table:      "range"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this in ['day', '7d', '28d', 'custom_21d', 'custom_dst_day']"},
					{ordinal: 2, name: "label", type: "string", cel: "this.size() > 0"},
					// Counted in LOCAL CIVIL DAYS back from the as-of day.
					// `back(midnight(as_of), k)` is a subtraction of dates and
					// never of `k × 86400` seconds: across the clock change the
					// two differ by an hour, and that hour holds a hit.
					{ordinal: 3, name: "from_days_back", type: "int32", cel: "this >= 0"},
					{ordinal: 4, name: "to_days_back", type: "int32", cel: "this >= 0"},
					// The app's one range branch, and it is one boolean in one
					// place. `to_days_back` exists on every row because every
					// column must; nothing reads it where this is true.
					{ordinal: 5, name: "to_is_as_of", type: "bool"},
					// The granularity this range opens on. It is a column because
					// picking a range has to state the whole pair: the granularity
					// chart cannot be assigned from a second chart — parallel charts
					// hold disjoint columns and the platform refuses it at derive —
					// so the legal-pairs rule is carried here, as a row, rather than
					// by a guard nobody can see.
					{ordinal: 6, name: "opens_on", type: "string", cel: "this in ['hour', 'day', 'week']"},
					// Whether the live cursor is standing on this range. A segment
					// binds a column and cannot compare two, so a picker that marks
					// nothing is the only picker markup alone can build; `rollup`
					// stamps it, which also means it is the ACTIVE cursor's mark and
					// not a per-preset one — the same scope every other row this fold
					// writes has.
					{ordinal: 7, name: "on_cursor", type: "bool"},
					{ordinal: 8, name: "pos", type: "int32", cel: "this >= 1"},
				]
				seed: [
					{id: "day", label: "the day", from_days_back: 0, to_days_back: 0, to_is_as_of: true, opens_on: "hour", on_cursor: false, pos: 1},
					{id: "7d", label: "the last seven days", from_days_back: 6, to_days_back: 0, to_is_as_of: true, opens_on: "day", on_cursor: false, pos: 2},
					{id: "28d", label: "the last twenty-eight", from_days_back: 27, to_days_back: 0, to_is_as_of: true, opens_on: "day", on_cursor: false, pos: 3},
					{id: "custom_21d", label: "a fixed twenty-one-day window", from_days_back: 24, to_days_back: 3, to_is_as_of: false, opens_on: "day", on_cursor: false, pos: 4},
					{id: "custom_dst_day", label: "the day the clock changed", from_days_back: 10, to_days_back: 9, to_is_as_of: false, opens_on: "hour", on_cursor: false, pos: 5},
				]
			}
			// The legal (range, granularity) pairs as rows. An illegal pair is not
			// merely hidden: its button does not exist, so no transition names it
			// and no guard has to refuse it.
			Grain: {
				id: "0xe740e5f59fcb6494"
				table:      "grain"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() <= 24"},
					{ordinal: 2, name: "range", type: "string", cel: "this in ['day', '7d', '28d', 'custom_21d', 'custom_dst_day']"},
					{ordinal: 3, name: "grain", type: "string", cel: "this in ['hour', 'day', 'week']"},
					{ordinal: 4, name: "buckets", type: "int32", cel: "this >= 1"},
					// The granularity picker's mark, on both legs of the pair: the
					// region already shows only the live range's rows, and a column
					// true on a row of some other range would be a mark waiting for
					// the day something renders the pairs unfiltered.
					{ordinal: 5, name: "on_cursor", type: "bool"},
					{ordinal: 6, name: "pos", type: "int32", cel: "this >= 1"},
				]
				seed: [
					{id: "day|hour", range: "day", grain: "hour", buckets: 15, on_cursor: false, pos: 1},
					{id: "7d|day", range: "7d", grain: "day", buckets: 7, on_cursor: false, pos: 2},
					{id: "28d|day", range: "28d", grain: "day", buckets: 28, on_cursor: false, pos: 3},
					{id: "28d|week", range: "28d", grain: "week", buckets: 5, on_cursor: false, pos: 4},
					{id: "custom_21d|day", range: "custom_21d", grain: "day", buckets: 21, on_cursor: false, pos: 5},
					{id: "custom_21d|week", range: "custom_21d", grain: "week", buckets: 4, on_cursor: false, pos: 6},
					{id: "custom_dst_day|hour", range: "custom_dst_day", grain: "hour", buckets: 23, on_cursor: false, pos: 7},
				]
			}
			// The published question set. Thirteen columns and NO expected value:
			// a seeded expected value is a golden file, and a golden file grades
			// the app against a number the same author wrote down while looking at
			// it. Every number comes from the ground truth at run time.
			Question: {
				id: "0xcedb40dcd7016075"
				table:      "question"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() <= 64"},
					{ordinal: 2, name: "metric", type: "string", cel: "this.size() <= 20"},
					{ordinal: 3, name: "panel", type: "string", cel: "this.size() <= 16"},
					{ordinal: 4, name: "dimension", type: "string", cel: "this.size() <= 40"},
					{ordinal: 5, name: "range", type: "string", cel: "this.size() <= 20"},
					{ordinal: 6, name: "grain", type: "string", cel: "this.size() <= 8"},
					{ordinal: 7, name: "filter_set", type: "string", cel: "this.size() <= 24"},
					{ordinal: 8, name: "says", type: "string", cel: "this.size() > 0"},
					{ordinal: 9, name: "reads", type: "string", cel: "this.size() > 0"},
					{ordinal: 10, name: "departs", type: "string", cel: "this in ['no', 'approximates', 'declined']"},
					{ordinal: 11, name: "expects", type: "string", cel: "this in ['nonzero', 'zero-by-ifNotFinite', 'zero-by-empty-window', 'zero-by-filter', 'unanswered']"},
					{ordinal: 12, name: "hard_case", type: "string", cel: "this.size() <= 4"},
					// The cap has to fit TWO notes: a row may state a departure and pin
					// one of the ten at once — eleven do — and each is owed its own
					// sentence. The widest note in the seed is 579 bytes.
					{ordinal: 13, name: "note", type: "string", cel: "this.size() <= 800"},
				]
				seed: _questions
			}
		}
		// No pipeline: a tab entity has no table to publish, and the browser tier
		// has no bloblang. The aggregation is at the mutation seat instead — the
		// one seat a fixture harness reaches.
		pipelines: {}
	}

	capabilities: {
		// No auth block, and the cost is stated: nothing here is per-person, and
		// the log is a checked-in artifact rather than anybody's traffic
		// (ir decision-19).
		blobs: false
		hatches: {}
		vendored: {}
	}

	surface: {
		screens: {
			// The served set is the union of what the screens reference, so naming
			// the shared stylesheet here is what builds it — for every screen,
			// because every screen imports it.
			[_]: files: shared: ["shell/shared/instrument.css"]

			index: {
				title:  "The Answer Set"
				route:  "/"
				markup: _indexMarkup
				forms: []
				states: ["loading", "empty", "populated", "populated-dark"]
				paths: {
					arrive: {states: ["loading", "empty", "populated"], accepts: ["accept-index-names-the-log", "accept-index-lists-the-shapes"]}
					choose_a_shape: {states: ["populated"], accepts: ["accept-shape-opens-dashboard", "accept-no-free-text-filter"]}
					night: {states: ["populated", "populated-dark"], accepts: ["accept-dark-twin"]}
				}
			}
			dash: {
				title:  "Dashboard"
				route:  "/f/:preset"
				markup: _dashMarkup
				// A parametrized route has no static href to put in the strip, and
				// a held instance per preset ever visited is pure cost — the
				// first-run state is the point.
				strip: false
				keep:  0
				forms: []
				states: ["loading", "empty", "populated", "drilled", "populated-dark", "network-error"]
				paths: {
					arrive: {states: ["loading", "empty", "populated"], accepts: ["accept-dashboard-settles-cold", "accept-topline-six-numbers", "accept-four-panels"]}
					drill: {states: ["populated", "drilled"], accepts: ["accept-drilldown-narrows-all", "accept-chips-removable"]}
					pick_window: {states: ["populated"], accepts: ["accept-range-and-grain-pickers", "accept-graph-drawn", "accept-graph-caret-walks"]}
					fold_refuses: {states: ["populated", "network-error"], accepts: ["accept-dashboard-settles-cold"]}
					night: {states: ["populated", "populated-dark"], accepts: ["accept-dark-twin", "accept-no-numeric-motion"]}
				}
			}
			panel: {
				title:  "Panel"
				route:  "/f/:preset/:panel"
				markup: _panelMarkup
				strip:  false
				keep:   0
				forms: []
				states: ["loading", "empty", "populated", "populated-dark"]
				paths: {
					arrive: {states: ["loading", "populated"], accepts: ["accept-panel-every-value", "accept-panel-detailed-metrics", "accept-panel-keeps-filter"]}
					no_such_panel: {states: ["empty"], accepts: ["accept-panel-every-value"]}
					night: {states: ["populated", "populated-dark"], accepts: ["accept-dark-twin"]}
				}
			}
			sessions: {
				title:  "The visits"
				route:  "/sessions"
				markup: _sessionsMarkup
				forms: []
				states: ["loading", "empty", "populated", "populated-dark"]
				paths: {
					arrive: {states: ["loading", "empty", "populated"], accepts: ["accept-visits-listed", "accept-visit-hours-shown", "accept-visit-spans-days"]}
					night: {states: ["populated", "populated-dark"], accepts: ["accept-dark-twin", "accept-tabular-figures"]}
				}
			}
			log: {
				title:  "The log"
				route:  "/log"
				markup: _logMarkup
				forms: []
				states: ["loading", "empty", "populated", "populated-dark"]
				paths: {
					arrive: {states: ["loading", "empty", "populated"], accepts: ["accept-log-shows-every-column", "accept-log-is-read-only", "accept-log-by-day"]}
					night: {states: ["populated", "populated-dark"], accepts: ["accept-dark-twin"]}
				}
			}
			spec: {
				title:  "The specification"
				route:  "/spec"
				markup: _specMarkup
				forms: []
				states: ["loading", "empty", "populated", "populated-dark"]
				paths: {
					arrive: {states: ["loading", "empty", "populated"], accepts: ["accept-spec-three-columns", "accept-formula-verbatim", "accept-spec-ranges-and-grains"]}
					read_the_departures: {states: ["populated"], accepts: ["accept-spec-question-set", "accept-departure-stated", "accept-departure-not-an-error"]}
					night: {states: ["populated", "populated-dark"], accepts: ["accept-dark-twin"]}
				}
			}
		}

		handlers: {
			stitch: {
				of:   "sessions"
				src:  "shell/handlers/stitch.js"
				note: "the log becomes visits and the visits become local hours: the 1860-second boundary, the entry page that waits for a view, the bounce that an interaction clears, and the local day walked arithmetically off the Zone rows"
			}
			rollup: {
				of:   "dash"
				src:  "shell/handlers/rollup.js"
				note: "one cursor row in, every number on the screen out: the window, the top-line figures with their divisors, the bucket grid, the axis, the two path strings and the four panels, each row carrying the whole cursor it would write"
			}
		}

		design: (pronto.#DesignMd & {text: _designMd}).design

		flows: {
			"open-shape": {of: "index", entity: "FilterSet", action: "navigate"}
			"stitch-visits": {of: "sessions", entity: "Session", action: "upsert"}
			"stitch-hours": {of: "sessions", entity: "SessionHour", action: "upsert"}
			"signal-corpus": {of: "sessions", entity: "Corpus", action: "update"}
			"roll-topline": {of: "dash", entity: "Topline", action: "update"}
			"roll-buckets": {of: "dash", entity: "Bucket", action: "upsert"}
			"draw-axis": {of: "dash", entity: "Tick", action: "upsert"}
			"draw-graph": {of: "dash", entity: "Scale", action: "update"}
			"rank-panels": {of: "dash", entity: "Breakdown", action: "upsert"}
			"raise-chips": {of: "dash", entity: "Chip", action: "upsert"}
			"mark-range": {of: "dash", entity: "Range", action: "update"}
			"mark-grain": {of: "dash", entity: "Grain", action: "update"}
			"report-refusal": {of: "dash", entity: "Fold", action: "update"}
			"pick-range": {of: "dash", entity: "Filter", action: "upsert"}
			"pick-grain": {of: "dash", entity: "Filter", action: "upsert"}
			"walk-the-graph": {of: "dash", entity: "Filter", action: "upsert"}
			"drill-down": {of: "dash", entity: "Filter", action: "upsert"}
			"remove-chip": {of: "dash", entity: "Filter", action: "upsert"}
			"reset-cursor": {of: "dash", entity: "Filter", action: "upsert"}
			"open-panel": {of: "dash", entity: "Panel", action: "navigate"}
			"back-to-dashboard": {of: "panel", entity: "FilterSet", action: "navigate"}
		}
	}

	meta: {
		name:        "plausible"
		description: "A web-analytics dashboard whose arithmetic is graded, one question at a time, against an oracle that never read its code."
		ir: {sha256: "160422c8ac39712be777b40dad29d84a3c97b3aea70d213c178668e93bd3fcdc"}
		targets: ["pages"]
		decisions: {
			"decision-01": {}
			"decision-02": {}
			"decision-03": {}
			"decision-04": {}
			"decision-05": {}
			"decision-06": {}
			"decision-07": {}
			"decision-08": {}
			"decision-09": {}
			"decision-10": {}
			"decision-11": {}
			"decision-12": {}
			"decision-13": {}
			"decision-14": {}
			"decision-15": {}
			"decision-16": {}
			"decision-17": {}
			"decision-18": {}
			"decision-19": {}
			"decision-20": {}
			"decision-21": {}
			"decision-22": {}
			"decision-23": {}
		}
		tests: {
			"test-ground-truth": {
				of: "Question"
				says:  "the ground truth answers every graded position in one DuckDB invocation, with no precondition degraded and every named wrong reading discriminating"
				given: {invocations: 1, preconditions: 25}
				when:  "run oracle.sql over the committed log"
				then:  "output.documents == 1 && output.violations == 0 && output.everyWrongReadingDiffers"
			}
			"test-fixture": {
				of: "Event"
				says:  "the committed log is the artifact its sha names, and three independent sessionizations of it agree column for column"
				given: {hits: 1200, visits: 400}
				when:  "compare the sidecar, DuckDB's window stitch and the manifest"
				then:  "output.shaMatches && output.partitionsAgree && output.columnsAgree && output.anchorsReproduce"
			}
			"test-stitch": {
				of: "Session"
				says:  "mounting a screen cold, with only the seed, stitches the log into exactly the visits DuckDB cuts it into, column for column"
				given: {screen: "sessions", seededOnly: true}
				when:  "mount and settle"
				then:  "output.sessions == output.duckdbSessions && output.everyColumnAgrees && output.entryPageWaits"
			}
			"test-boundary": {
				of: "Session"
				says:  "the session boundary is the integer 1860 and the four planted gaps walk it"
				given: {gaps: [1799, 1800, 1859, 1860]}
				when:  "stitch the planted visitors"
				then:  "output.visitsPerGap == [1, 1, 1, 2]"
			}
			"test-hours": {
				of: "SessionHour"
				says:  "a visit is materialized in every local hour it was open in, the hour the clock skips is absent rather than empty, and the hourly visit counts therefore do not sum to the day's"
				given: {dstDay: "2026-03-29"}
				when:  "stitch, then bucket at hour granularity"
				then:  "output.hoursOnDstDay == 23 && output.hourlyVisitsSum != output.dailyVisits"
			}
			"test-window": {
				of: "Range"
				says:  "each of the five ranges resolves to the pair of integers the arithmetic states, walked as civil dates and never as multiples of 86400"
				given: {ranges: 5, seconds: 1810800}
				when:  "resolve every range against the as-of day"
				then:  "output.windowSeconds == input.seconds && output.buckets == 103"
			}
			"test-topline": {
				of: "Topline"
				says:  "the six figures, their divisors and their rendered strings all agree with the ground truth, and only bounce rate restricts its divisor"
				given: {filterSet: "unentered"}
				when:  "mount the dashboard on each of the eleven presets"
				then:  "output.agreesWithOracle && output.bounceDenom != output.sessionsN && output.bounceRateText == \"0%\""
			}
			"test-panels": {
				of: "Breakdown"
				says:  "each panel ranks by visitors descending with ties broken by the value ascending, the dashboard keeps the first nine, and the full panel keeps them all"
				given: {maxItems: 9}
				when:  "read the four panels at every cursor"
				then:  "output.cardinalityFirst && output.ordAgrees && output.dashboardRows <= input.maxItems && output.fullPanelRows == output.oracleRows"
			}
			"test-drilldown": {
				of: "Filter"
				says:  "a drill-down submits all five slots, so the reachable cursor space is the graded one, and the eleven presets stay independent"
				given: {slots: 5, presets: 11}
				when:  "submit a breakdown row's own form, then remove the chip"
				then:  "output.slotsWritten == input.slots && output.backToStart && output.presetsIndependent"
			}
			"test-graph": {
				of: "Scale"
				says:  "the series is one column per bucket over one coordinate system, a bucket that measured nothing is a mark on the axis floor rather than a column of no height, the axis is five ticks from the stated rounding rule, every column is a row of the table beside it, and the arrows walk those rows without wrapping"
				given: {viewBox: "0 0 1000 300", ticks: 5}
				when:  "mount the dashboard, read the slot, and walk the caret past where a shorter axis reaches"
				then:  "output.columns == output.points && output.floorMarks == output.emptyBuckets && output.ticks == input.ticks && output.tableRows == output.points && output.caretMarked == 1 && output.caretWraps == false"
			}
			"test-coherent": {
				of: "Fold"
				says:  "an incoherent derived row is refused as one update naming the clause, with no sink written, so the last coherent numbers stay on screen beside a visible error"
				given: {clauses: 6}
				when:  "hand the guard a row failing each clause in turn"
				then:  "output.clausesNamed == input.clauses && output.sinkWrites == 0 && output.boundaryRowsPass"
			}
			"test-questions": {
				of: "Question"
				says:  "every published question is driven through the app's own forms and read off the rendered text, never off the row"
				given: {questions: 312}
				when:  "drive each one"
				then:  "output.driven == input.questions && output.readFromDom && output.saysAndReadsNeverMerged"
			}
			"test-sweep": {
				of: "Bucket"
				says:  "the mechanical cross of the vocabularies is generated from the app's own rows and swept with cardinality asserted before value"
				given: {requests: 0}
				when:  "walk the reachable cursor closure"
				then:  "output.cardinalityBeforeValue && output.networkRequests == input.requests"
			}
			"test-coverage": {
				of: "Metric"
				says:  "every anti-join closes: no published question went undriven, no number the app renders is graded by nothing, and no number the oracle answers went unshown"
				given: {antiJoins: 16}
				when:  "join the driven set against the published set, and walk the graded space from both sides"
				then:  "output.undriven == [] && output.ungraded == [] && output.unshown == [] && output.everySlotMovesANumber"
			}
			"test-appearance": {
				of: "dash"
				says:  "both appearances render, no figure animates and no bar grows from zero, every figure is set in a fixed advance, and no route is wider than the viewport it is read at"
				given: {minTarget: 24}
				when:  "photograph every static route at two widths"
				then:  "output.loopingAnimations == 0 && output.smallestTarget >= input.minTarget && output.tabularFigures && output.horizontalOverflow == 0"
			}
		}
	}
}

// --- the eleven cursors, stated once ---------------------------------------
//
// The declared cursor and the live cursor are the SAME eleven rows at birth,
// which is what lets `rollup` read one row with no presence branch and no
// precedence branch. They are generated from one list rather than typed twice:
// two lists would be two things to keep in step, and a drifted pair is a preset
// whose reset restores something the URL never named.
_asOf: "2026-04-08T12:20:00.000000Z"

_shapes: [
	{id: "none", pos: 1, name: "No filter", says: "The whole log, over the window.", slots: ""},
	{id: "visit-1", pos: 2, name: "One visit dimension", says: "Visits that began in Chrome — a property frozen at the visit's first hit.", slots: "browser is Chrome", f_browser: "is:Chrome"},
	{id: "event-1", pos: 3, name: "One event dimension", says: "Hits on /pricing, and the visits that contain one.", slots: "page is /pricing", f_page: "is:/pricing"},
	{id: "visit-visit", pos: 4, name: "Two visit dimensions", says: "Visits that arrived from google AND ran in Chrome.", slots: "source is google, browser is Chrome", f_source: "is:google", f_browser: "is:Chrome"},
	{id: "event-visit", pos: 5, name: "Mixed", says: "Hits on /blog/why belonging to visits that ran in Safari.", slots: "page is /blog/why, browser is Safari", f_page: "is:/blog/why", f_browser: "is:Safari"},
	{id: "negated", pos: 6, name: "Is not", says: "Everything that did not arrive from google.", slots: "source is not google", f_source: "not:google"},
	{id: "contains", pos: 7, name: "Contains", says: "Every page under /blog, matched by substring.", slots: "page contains /blog", f_page: "has:/blog"},
	{id: "disjunction", pos: 8, name: "One slot, two values", says: "Visits in Chrome or in Safari.", slots: "browser is Chrome or Safari", f_browser: "is:Chrome|Safari"},
	{id: "unentered", pos: 9, name: "The divergent divisors", says: "A page no visit entered on: the visit count is above zero and the bounce rate is exactly zero, because the two quotients divide by different counts.", slots: "page is /checkout", f_page: "is:/checkout"},
	{id: "entry-page", pos: 10, name: "The entry-page slot", says: "Visits whose first page VIEWED was /docs — which is not the same set as visits that reached /docs.", slots: "entry page is /docs", f_entry_page: "is:/docs"},
	{id: "goal", pos: 11, name: "The hit-name slot", says: "Hits named signup, and the visits that contain one.", slots: "event is signup", f_name: "is:signup"},
]

// The caret's home. A window can shrink — `7d` at day granularity holds seven
// points where `28d` holds twenty-eight — so a caret left standing at the
// twenty-first point would name a bucket the new window has no row for, and a
// tabstop set is one whose members are the rows now on screen. Every form that
// moves the window therefore states the caret with it, and this is the point it
// states: `ord` counts from zero and a window always intersects one grid step,
// so `b-00` is the one bucket id every legal pair has.
_caretHome: "b-00"

_cursorOf: {
	shape: {id: string, ...}
	out: {
		id:            shape.id
		range:         "28d"
		grain:         "day"
		as_of_epoch:   _asOf
		active_bucket: _caretHome
		f_page:        *"" | string
		f_entry_page:  *"" | string
		f_source:      *"" | string
		f_browser:     *"" | string
		f_name:        *"" | string
		if shape.f_page != _|_ {f_page: shape.f_page}
		if shape.f_entry_page != _|_ {f_entry_page: shape.f_entry_page}
		if shape.f_source != _|_ {f_source: shape.f_source}
		if shape.f_browser != _|_ {f_browser: shape.f_browser}
		if shape.f_name != _|_ {f_name: shape.f_name}
	}
}

_liveCursors: [for s in _shapes {(_cursorOf & {shape: s}).out}]

_filterSets: [for s in _shapes {
	(_cursorOf & {shape: s}).out & {
		name:  s.name
		says:  s.says
		slots: s.slots
		pos:   s.pos
	}
}]

// The terminal's statics ride the cluster's caddy image; without this wiring
// the image bakes only the ladder docs and every route 404s.
cluster: (pronto.#DefaultCluster & {"code": code, statics: terminal.surface.statics}).out
terminal: (pronto.#DefaultTerminal & {"code": code}).out
loop: (pronto.#DefaultLoop & {"code": code, "cluster": cluster, "terminal": terminal}).out

// The checks, one per test file, all ten of them.
//
// Nine are at the `test` verb: the verb follows what a check NEEDS, and each
// runs the app's behaviour against fixtures with no live service. `oracle` is on
// the list because it is the check that grades the ground truth itself — leaving
// it off means the app's only oracle-side red never runs. The tenth is
// `appearance`, and it is at `integrate` for the same rule: it measures computed
// style and laid-out boxes, which need a browser over the running cluster.
//
// `--allow-run=mise` is how a check reaches duckdb, and none of the nine asks
// for `--allow-write`, because the oracle reads the committed log directly
// through read_json_auto and writes nothing. `appearance` is the one that does:
// it launches a browser, and a browser writes its own profile.
loop: surface: checks: "oracle": {
	verb: "test"
	cmds: ["deno test --config tests/deno.json --no-lock --no-check --allow-env --allow-read --allow-run=mise tests/oracle.test.ts"]
	note: "the ground truth itself: one invocation, no precondition degraded, the window arithmetic exact, and every named wrong reading discriminating"
}

loop: surface: checks: "fixture": {
	verb: "test"
	cmds: ["deno test --config tests/deno.json --no-lock --no-check --allow-env --allow-read --allow-run=mise tests/fixture.test.ts"]
	note: "the committed log against its sha, its sidecar and DuckDB's own window stitch — three sessionizations compared pairwise, so regenerating cannot launder a break"
}

loop: surface: checks: "stitch": {
	verb: "test"
	cmds: ["deno test --config tests/deno.json --no-lock --no-check --allow-env --allow-read --allow-run=mise tests/stitch.test.ts"]
	note: "the derived visits and their local hours, mounted cold off the seed and compared to DuckDB — cardinality first, then every column, then the ten hard cases by name"
}

loop: surface: checks: "clock": {
	verb: "test"
	cmds: ["deno test --config tests/deno.json --no-lock --no-check --allow-env --allow-read --allow-run=mise tests/clock.test.ts"]
	note: "the step the committed log cannot reach: where the clock steps back two UTC hours render one local hour, and both folds refuse rather than writing a key that is not one"
}

loop: surface: checks: "coherent": {
	verb: "test"
	cmds: ["deno test --config tests/deno.json --no-lock --no-check --allow-env --allow-read --allow-run=mise tests/coherent.test.ts"]
	note: "the guard as the dashboard exercises it: no declared position refuses, every stated top line is internally coherent, and the two-decimal rounding boundary the clause must admit is still in the fixture"
}

loop: surface: checks: "svg": {
	verb: "test"
	cmds: ["deno test --config tests/deno.json --no-lock --no-check --allow-env --allow-read --allow-run=mise tests/svg.test.ts"]
	note: "the three namespace walls pinned executably: a bound `d` on a slot's authored svg, a bound geometry attribute inside an item template, and what linkedom cannot tell apart"
}

loop: surface: checks: "questions": {
	verb: "test"
	cmds: ["deno test --config tests/deno.json --no-lock --no-check --allow-env --allow-read --allow-run=mise tests/questions.test.ts"]
	note: "the 312 published questions, each driven through the app's own forms and read off the rendered text, then the three anti-joins that grade the roster"
}

loop: surface: checks: "sweep": {
	verb: "test"
	cmds: ["deno test --config tests/deno.json --no-lock --no-check --allow-env --allow-read --allow-run=mise tests/sweep.test.ts"]
	note: "the mechanical cross of the app's own vocabulary rows, cardinality asserted before value at every cursor position"
}

loop: surface: checks: "coverage": {
	verb: "test"
	cmds: ["deno test --config tests/deno.json --no-lock --no-check --allow-env --allow-read --allow-run=mise tests/coverage.test.ts"]
	note: "the anti-joins in both directions, each driven to red on a doctored input by its own case"
}

// ir test-appearance, driven. Four of this app's claims are properties of a
// rendered page and of nothing below it — a face resolved from a stack, a box a
// finger has to land on, an animation that never stops — so the nine checks
// above, which mount into linkedom and compute no style at all, cannot see any
// of them. This is the loop seat's declared override seam: the app adds a check,
// it does not invent a verb.
//
// It runs beside the platform's own visual battery rather than instead of it.
// That battery measures the terminal's rendering invariants — overflow, overlap,
// widgets mounted — and reports a tap target as advice; the floor, the fixed
// advance and the absence of looping motion are this app's design argument, and
// an app's argument is the app's to gate on.
loop: surface: checks: "appearance": {
	verb: "integrate"
	cmds: [
		"docker compose up -d --wait --build launch",
		"deno run --allow-read --allow-write --allow-net --allow-env --allow-run --allow-sys --unsafely-ignore-certificate-errors tests/appearance.ts .",
	]
	note: "every route at two widths in both appearances: no looping animation, no target under 24px, every figure on the page in a fixed advance, and no document wider than the viewport"
}

build: (pronto.#DefaultBuild & {"code": code, "loop": loop, "cluster": cluster}).out

out: pronto.#emit & {"code": code, "cluster": cluster, "terminal": terminal, "loop": loop, "build": build}
