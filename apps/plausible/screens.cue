// The six screens' markup, authored here and emitted to shell/screens/*.html.
//
// Two strings below are the app's architecture and are interpolated at every
// site rather than retyped: the seat key is
// [handler, ...data-reads in declared order, ...sorted data-read-*], so a
// reordered list or a stray space is two seats where the markup says one, and
// each would run its reduce over a world missing the other's writes.
//
// Every nested slot below states what it renders with no row, because a slot
// inside an item has no screen state to say it with and the build refuses one
// that says nothing. All but the dimension's header are pinned on seeded pk
// rows that only ever take an update, so `data-empty=""` — render nothing — is
// the honest reading of a case nothing reaches.
package plausible

import "strings"

// The two pickers, as charts rather than as prose. State names ARE the column
// values, so the chart is drawn from the same closed vocabularies `Filter.range`
// and `Filter.grain` declare their cel enums over.

// One LEAF SLOT per cursor slot, pinned on the declared unique `slot`. A slot
// hydrates no nested region, so its removal form is a static child that binds
// against the chip's own row and survives every refresh. dash.css states what
// an unoccupied slot looks like, and which of these elements decides it.
_chipSlots: strings.Join([for s in ["f_page", "f_entry_page", "f_source", "f_browser", "f_name"] {"""
	          <div class="chip chip-probe" data-live="chip" data-filter="slot=eq.\(s)" data-empty="">
	            <span class="chip-label" data-text="{label}"></span>
	            <form class="chip-remove" data-entity="filter" data-action="upsert">
	              <input type="hidden" name="id" data-value="{param.preset}">
	              <input type="hidden" name="f_page" data-value="{set_page}">
	              <input type="hidden" name="f_entry_page" data-value="{set_entry_page}">
	              <input type="hidden" name="f_source" data-value="{set_source}">
	              <input type="hidden" name="f_browser" data-value="{set_browser}">
	              <input type="hidden" name="f_name" data-value="{set_name}">
	              <button type="submit" aria-label="Remove this filter">×</button>
	            </form>
	          </div>
	"""}], "\n")

// The four panels of the dashboard, which differ only in the dimension they
// rank. Each states the dimension, BOTH units a row carries — the figure is
// visitors and the ring is the bounce rate, and a ring nothing names is nine
// unlabelled marks per panel — and the way to the screen that shows every value
// rather than the leading nine.
//
// `data-panel` is the dimension a block belongs to, and the hue is resolved
// from it by the shared stylesheet: the panel screen carries the same attribute
// off its route parameter, so one map serves both screens and a dimension
// cannot be one colour here and another there.
_dashPanels: strings.Join([for p in [
	{id: "page", title: "Top pages", all: "All pages"},
	{id: "entry_page", title: "Entry pages", all: "All entry pages"},
	{id: "source", title: "Sources", all: "All sources"},
	{id: "browser", title: "Browsers", all: "All browsers"},
] {"""
	          <section class="panel" data-panel="\(p.id)">
	            <header><h3>\(p.title)</h3><span class="unit">Visitors &middot; bounce rate</span></header>
	            <ul class="rows" data-live="breakdown" data-filter="panel=eq.\(p.id)&amp;limit=9"
	                data-order="ord.asc" data-template="brk-row"
	                data-empty="Nothing in this window."></ul>
	            <footer><a data-route="panel" data-param-preset="{id}" data-param-panel="\(p.id)">\(p.all)</a></footer>
	          </section>
	"""}], "\n")

// The range picker, verbatim on the two screens that carry the cursor. It
// submits the whole TRIPLE: `opens_on` is a column of the Range row, so a range
// and a granularity the Grain rows do not admit is not a pair any button can
// state, and the caret comes with them because a window that holds fewer points
// than the last one has no row at the point the caret was standing on.
//
// `aria-current` is the mark, and its only carrier: `rollup` stamps
// `Range.on_cursor`, the segment binds it, and a second attribute for the
// stylesheet's sake would be a second place for the mark to be wrong.
_rangePicker: """
	        <ul class="ranges" data-live="range" data-order="pos.asc" data-empty="No ranges.">
	          <template data-item>
	            <li>
	              <form data-entity="filter" data-action="upsert">
	                <input type="hidden" name="id" data-value="{param.preset}">
	                <input type="hidden" name="range" data-value="{id}">
	                <input type="hidden" name="grain" data-value="{opens_on}">
	                <input type="hidden" name="active_bucket" data-value="\(_caretHome)">
	                <button type="submit" aria-current="{on_cursor}" data-text="{label}"></button>
	              </form>
	            </li>
	          </template>
	        </ul>
	"""

// Seat S's world. `stitch` reads the log and the clock and writes the visits.
_readsS: "corpus,event,fold,session,session_hour,zone"

// Seat R's world. `filter` is deliberately absent: a whole-table read would put
// all eleven cursor rows in state.rows and give the reduce a second, wrong way
// to reach one. `data-read-cursor` is the only path to the live cursor, so
// picking the wrong row is not an available mistake.
_readsR: "breakdown,bucket,chip,event,fold,grain,panel,range,scale,session,session_hour,tick,topline,zone"

// The two seat regions of a `:preset` route, verbatim at both sites that carry
// them. They ride ONE-ROW LISTS rather than slots: a list region's seat fires
// on first paint unconditionally, where a slot's fires only when its row
// already exists.
_presetSeats: """
	        <!-- Seat S. Its own region's read is `corpus`, and a seat wakes when
	             that read changes and at no other time. -->
	        <div class="seat stitcher" data-live="corpus" data-filter="id=eq.the"
	             data-on-mutation="stitch" data-reads="\(_readsS)">
	          <template data-item>
	            <p class="seat-says"><span data-text="{hits}"></span> hits stitched into <span data-text="{visits}"></span> visits.</p>
	          </template>
	        </div>

	        <!-- Seat R's corpus ear, and the whole reason the graph closes: the
	             Corpus row is a signal, and this is the seat that hears it. -->
	        <div class="seat rollup-corpus" data-live="corpus" data-filter="id=eq.the"
	             data-on-mutation="rollup" data-reads="\(_readsR)"
	             data-read-cursor="filter?id=eq.{param.preset}">
	          <template data-item>
	            <p class="seat-says">over <span data-text="{visitors}"></span> visitors.</p>
	          </template>
	        </div>

	        <!-- Seat R's cursor ear. The same seat key as the region above, so
	             the two coalesce; this one is what a reader's gesture wakes. -->
	        <div class="seat rollup-cursor" data-live="filter" data-filter="id=eq.{param.preset}"
	             data-on-mutation="rollup" data-reads="\(_readsR)"
	             data-read-cursor="filter?id=eq.{param.preset}">
	          <template data-item>
	            <!-- The window it recomputed for, off the row it just wrote: the
	                 row this region is pinned on carries the cursor's IDS, and a
	                 screen binds a column and cannot translate one. The slot sits
	                 inside the sentence because `syncNested` hydrates an item's
	                 descendants and never the item root itself. -->
	            <p class="seat-says">recomputed over <span data-live="topline" data-filter="id=eq.the" data-empty=""><span class="window-range" data-text="{range_text}"></span>, by the <span class="window-grain" data-text="{grain_text}"></span></span>.</p>
	          </template>
	        </div>
	"""

_indexMarkup: """
	<section class="screen" data-screen="index">

	  <!-- Every screen's root is a LIST OF ONE over a seeded singleton, with the
	       whole screen inside its item template: a slot hydrates no nested
	       region, and a `[data-live]` sitting as a slot's static child hands its
	       template to the slot and turns it into a list of the child's shape. -->
	  <div class="root" data-live="corpus" data-filter="id=eq.the"
	       data-on-mutation="stitch" data-reads="\(_readsS)">
	    <template data-item>
	      <article class="index">

	        <header class="masthead">
	          <h1>The Answer Set</h1>
	          <p class="sub">One log, in the tab. Eleven ways of asking about it, each with an address.</p>
	        </header>

	        <dl class="figures">
	          <div class="fig"><dt>Hits</dt><dd data-text="{hits}"></dd></div>
	          <div class="fig"><dt>Visits</dt><dd data-text="{visits}"></dd></div>
	          <div class="fig"><dt>Visitors</dt><dd data-text="{visitors}"></dd></div>
	          <div class="fig"><dt>Days</dt><dd data-text="{days}"></dd></div>
	          <div class="fig"><dt>First hit</dt><dd data-text="{first_local}"></dd></div>
	          <div class="fig"><dt>Last hit</dt><dd data-text="{last_local}"></dd></div>
	        </dl>

	        <h2>The eleven shapes</h2>
	        <p class="note">There is no free-text filter box. A view has to be one of these eleven to be reachable by name, which is what makes the answerable set finite and enumerated.</p>
	        <ul class="shapes" data-live="filter_set" data-order="pos.asc"
	            data-empty="No filter shapes are seeded.">
	          <template data-item>
	            <li class="shape">
	              <a data-route="dash" data-param-preset="{id}" data-text="{name}"></a>
	              <p class="says" data-text="{says}"></p>
	              <code class="slots" data-text="{slots}"></code>
	            </li>
	          </template>
	        </ul>

	        <p class="note"><a data-route="sessions">The visits</a> · <a data-route="log">The log</a> · <a data-route="spec">The specification</a></p>
	      </article>
	    </template>
	  </div>
	</section>
	"""

_dashMarkup: """
	<section class="screen" data-screen="dash">

	  <!-- The breakdown row, declared once at screen ROOT and referenced by name
	       from all four panels. `namedTemplates` is collected before any region
	       hydrates, so the Map holds this node even after a region sweeps its own
	       children away.

	       The row IS a form, and it submits all FIVE slots: upsertBy PATCHES, so
	       a form naming one slot would leave the other four standing and a reader
	       would walk out of the graded space in one click. They are real columns
	       on the row because a nested item template binds against its OWN row —
	       `{f_source}` here would raise `binding {f_source} not in row`. -->
	  <template data-item data-name="brk-row">
	    <li class="row" data-dim="{dim_value}">
	      <form class="drill" data-entity="filter" data-action="upsert">
	        <input type="hidden" name="id" data-value="{param.preset}">
	        <input type="hidden" name="f_page" data-value="{set_page}">
	        <input type="hidden" name="f_entry_page" data-value="{set_entry_page}">
	        <input type="hidden" name="f_source" data-value="{set_source}">
	        <input type="hidden" name="f_browser" data-value="{set_browser}">
	        <input type="hidden" name="f_name" data-value="{set_name}">
	        <button type="submit" class="share" style="--share: {share}">
	          <span class="dim" data-text="{dim_value}"></span>
	          <span class="n" data-metric="visitors" data-text="{visitors}"></span>
	          <svg class="arc" viewBox="0 0 36 36" aria-hidden="true">
	            <circle cx="18" cy="18" r="15.9"></circle>
	            <circle class="cut" cx="18" cy="18" r="15.9" stroke-dasharray="{arc} 100"></circle>
	          </svg>
	        </button>
	      </form>
	    </li>
	  </template>

	  <!-- The root is the DECLARED cursor the route names. It hands {range},
	       {grain} and every f_* to every child of this screen for free, and it is
	       what a reset restores. -->
	  <div class="root" data-live="filter_set" data-filter="id=eq.{param.preset}">
	    <template data-item>
	      <article class="dash" data-preset="{id}">

	        <header class="masthead">
	          <h1 data-text="{name}"></h1>
	          <p class="says" data-text="{says}"></p>
	          <p class="note"><a data-route="index">All eleven shapes</a></p>
	        </header>

	\(_presetSeats)

	        <!-- A leaf slot over the fold's own row. A column no screen reads is
	             the fossil the reverse anti-join exists to find, and an error
	             nobody sees is worse than a wrong number. -->
	        <div class="fold" data-live="fold" data-filter="id=eq.rollup" data-empty="">
	          <p class="fold-error" data-text="{error}"></p>
	        </div>

	\(_rangePicker)

	        <!-- The granularity picker, on a LIST OF ONE over the live cursor: a
	             chart reads its state from `_prontoMachineRow ?? state.items[0]`,
	             so a list of one answers exactly as a slot would — while only a
	             list hydrates the nested region the granularity buttons need. It
	             is a second region over `filter`, beside Seat R's ear, so the
	             writer of this row and the reader of it stay visibly apart.
	             This screen carries no machine at all (ir decision-22): an
	             illegal pair has no button to narrow a transition to, so the
	             gesture is a form like every other mutation on this screen. -->
	        <div class="pickers" data-live="filter" data-filter="id=eq.{param.preset}">
	          <template data-item>
	            <!-- The wrapper is load-bearing: `syncNested` walks an item's
	                 DESCENDANTS, so a nested region that IS the item root is
	                 stamped and never hydrated — the markup stands there with its
	                 filter placeholder unresolved and no error anywhere. -->
	            <div class="picker-arms">
	            <!-- `{range}` is the ENCLOSING row's, which here is the live
	                 cursor, so `syncNested` re-hydrates this list whenever the
	                 reader moves the range. -->
	            <ul class="grains" data-live="grain" data-filter="range=eq.{range}"
	                data-order="pos.asc" data-empty="No granularities.">
	              <template data-item>
	                <li>
	                  <form data-entity="filter" data-action="upsert">
	                    <input type="hidden" name="id" data-value="{param.preset}">
	                    <input type="hidden" name="grain" data-value="{grain}">
	                    <input type="hidden" name="active_bucket" data-value="\(_caretHome)">
	                    <button type="submit" aria-current="{on_cursor}" data-text="{grain}"></button>
	                  </form>
	                </li>
	              </template>
	            </ul>
	            </div>
	          </template>
	        </div>

	        <!-- The reset, bound off the DECLARED cursor this route names. It is
	             the second reason the root region is the FilterSet row: a form
	             sitting in the root's item template binds every cursor column off
	             the row the URL means, so restoring the preset needs no columns
	             anywhere else. -->
	        <form class="reset" data-entity="filter" data-action="upsert">
	          <input type="hidden" name="id" data-value="{param.preset}">
	          <input type="hidden" name="range" data-value="{range}">
	          <input type="hidden" name="grain" data-value="{grain}">
	          <input type="hidden" name="active_bucket" data-value="{active_bucket}">
	          <input type="hidden" name="f_page" data-value="{f_page}">
	          <input type="hidden" name="f_entry_page" data-value="{f_entry_page}">
	          <input type="hidden" name="f_source" data-value="{f_source}">
	          <input type="hidden" name="f_browser" data-value="{f_browser}">
	          <input type="hidden" name="f_name" data-value="{f_name}">
	          <button type="submit">Back to this shape</button>
	        </form>

	        <h2>The filters in force</h2>
	        <!-- One leaf slot per cursor slot, pinned on the declared unique.
	             The "no filter" arm is a SIBLING of the probes: a control inside
	             a probe's template would bind against the probe's row. -->
	        <div class="chips">
	\(_chipSlots)
	          <p class="arm-none note">No filter is in force.</p>
	        </div>

	        <h2>The top line</h2>
	        <!-- A slot, pinned on the pk: one row, seven displays, and under a
	             figure that needs one, the sentence that qualifies it. -->
	        <!-- Every figure carries the metric it answers as an attribute, and
	             the value element holds the fold's string ALONE: the unit is a
	             static sibling, for the reason the fold's own rounding states. -->
	        <dl class="topline" data-live="topline" data-filter="id=eq.the" data-empty="">
	          <div class="cell"><dt>Visitors</dt><dd><span class="v" data-metric="visitors" data-text="{visitors_text}"></span></dd></div>
	          <div class="cell"><dt>Visits</dt><dd><span class="v" data-metric="visits" data-text="{visits_text}"></span></dd></div>
	          <div class="cell"><dt>Page views</dt><dd><span class="v" data-metric="pageviews" data-text="{pageviews_text}"></span></dd></div>
	          <div class="cell"><dt>Views per visit</dt><dd><span class="v" data-metric="views_per_visit" data-text="{views_per_visit_text}"></span><span class="divisor">over <span data-text="{sessions_n}"></span> visits</span></dd></div>
	          <div class="cell"><dt>Bounce rate</dt><dd><span class="v" data-metric="bounce_rate" data-text="{bounce_rate_text}"></span><span class="suffix">%</span><span class="divisor">over <span data-text="{bounce_denom}"></span> entered visits</span></dd></div>
	          <div class="cell"><dt>Visit duration</dt><dd><span class="v" data-metric="visit_duration" data-text="{visit_duration_text}"></span><span class="suffix">s</span><span class="divisor">over <span data-text="{sessions_n}"></span> visits</span></dd></div>
	          <div class="cell"><dt>Current visitors</dt><dd><span class="v" data-live-visitors data-text="{current_visitors}"></span><span class="divisor">over the last five minutes, unfiltered</span></dd></div>
	        </dl>

	        <section class="plot">
	          <h2>Visitors over the range</h2>
	          <!-- The drawing and the value axis are two regions in one box, and
	               the box is authored here because no stylesheet can superimpose
	               two siblings. -->
	          <div class="frame">
	            <!-- The chart's own leaf slot. A list sweeps its markup on every
	                 refresh; a slot binds attributes and texts without sweeping,
	                 so this authored SVG is stamped once for the life of the
	                 visit and both `d`s take the plain interpolate path. The floor
	                 is authored first so a column paints over a mark. -->
	            <div class="graph" data-live="scale" data-filter="id=eq.the" data-empty="">
	              <svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
	                <path class="floor" d="{floor_d}"></path>
	                <path class="columns" d="{path_d}"></path>
	              </svg>
	            </div>

	            <ul class="axis" data-live="tick" data-order="ord.asc"
	                data-empty="No axis yet.">
	              <template data-item>
	                <li class="tick" style="--at: {at}" data-text="{label}"></li>
	              </template>
	            </ul>
	          </div>
	        </section>

	        <h2>Every point, as a row</h2>
	        <p class="note">The table is what the graph means. At hourly granularity a visit is counted in every local hour it was open, so these do not add up to the day's figure — and that is the arithmetic, not a reconciliation waiting to happen.</p>
	        <!-- The caret's readout is also its ONE tabstop, and it hangs on the
	             chart's own singleton rather than on the point it names: a region
	             pinned on a row the window no longer holds is one the terminal
	             clears the bindings of — the filter placeholder stands there
	             unresolved and the forms write nothing, with no error anywhere.
	             `scale` is written on every pass, so what the arrows read is the
	             one row that cannot go away, and its filter interpolates nothing
	             so no gesture re-hydrates this region.

	             `data-rove` is declined for the same class of reason: it would put
	             the tabstop on the point, and the terminal counts a point on its
	             way out — the one gesture that shortens the axis past the caret
	             leaves the departing row reading `true` beside the arriving one
	             and the refresh throws on correct app code. `aria-activedescendant`
	             is APG's other model and the one this reaches: focus never leaves
	             this element and the point it names is a real id.

	             `data-key` is the platform's keyboard-gesture binding and its
	             value must parse as JSON, so a bucket's own key travels under a
	             name of its own. -->
	        <div class="caret-says" tabindex="0" data-live="scale" data-filter="id=eq.the" data-empty=""
	             aria-activedescendant="point-{caret_point}"
	             data-key='{"ArrowLeft": "caret-back", "ArrowRight": "caret-fwd"}'>
	          <span>The caret is on <span data-text="{caret_label}"></span>. Arrow keys walk the points.</span>
	          <form class="caret-step" id="caret-back" data-entity="filter" data-action="upsert">
	            <input type="hidden" name="id" data-value="{param.preset}">
	            <input type="hidden" name="active_bucket" data-value="{caret_prev}">
	          </form>
	          <form class="caret-step" id="caret-fwd" data-entity="filter" data-action="upsert">
	            <input type="hidden" name="id" data-value="{param.preset}">
	            <input type="hidden" name="active_bucket" data-value="{caret_next}">
	          </form>
	        </div>
	        <div class="points">
	          <!-- Three figures to a row are a table only with a row that says
	               which is which. It is static because it names columns rather
	               than reading any. -->
	          <div class="bucket-head">
	            <span class="when">Point</span>
	            <span>Share</span>
	            <span class="n">Visitors</span>
	            <span class="n">Visits</span>
	            <span class="n">Page views</span>
	          </div>
	          <!-- The caret mark is an ordinary bound attribute over a column the
	               fold maintains, so a point carrying it out of the list on its
	               way to being removed is a stale class on a node about to
	               vanish. -->
	          <ul class="buckets" data-live="bucket" data-order="ord.asc"
	              data-empty="No buckets for this window.">
	            <template data-item>
	              <li class="bucket" id="point-{id}" data-bucket="{bucket_key}" data-caret="{on_caret}">
	                <span class="when" data-text="{label}"></span>
	                <span class="bar" style="--share: {share}"></span>
	                <span class="n" data-metric="visitors" data-text="{visitors}"></span>
	                <span class="n" data-metric="visits" data-text="{visits}"></span>
	                <span class="n" data-metric="pageviews" data-text="{pageviews}"></span>
	              </li>
	            </template>
	          </ul>
	        </div>

	        <h2>The four panels</h2>
	        <div class="panels">
	\(_dashPanels)
	        </div>
	      </article>
	    </template>
	  </div>
	</section>
	"""

_panelMarkup: """
	<section class="screen" data-screen="panel">

	  <!-- One route, two parameters: the root pins :preset on the declared
	       cursor, and the region below pins :panel on the dimension. -->
	  <div class="root" data-live="filter_set" data-filter="id=eq.{param.preset}">
	    <template data-item>
	      <!-- The dimension rides the whole screen, because the hue it resolves
	           to belongs to the title as much as to the rows: `{param.panel}`
	           needs no row, so this attribute is stamped at mount. -->
	      <article class="full" data-preset="{id}" data-panel="{param.panel}">

	        <p class="back"><a data-route="dash" data-param-preset="{id}">‹ The dashboard</a></p>
	        <!-- The dimension's name, on a LEAF SLOT pinned on the pk: this
	             screen's title is its first line, and it cannot come out of the
	             list region below without the window control standing above it.

	             The pin is a ROUTE PARAMETER, which is URL text and not one of
	             the four seeded ids, so this is the one slot on the two screens
	             whose read really can come back empty — the `no_such_panel`
	             path. The copy is the whole empty state: the table below is a
	             list over the same read and says the same nothing, and one
	             sentence per condition is the rule. -->
	        <header class="dimension-head" data-live="panel" data-filter="id=eq.{param.panel}"
	                data-empty="No dimension by that name. The four are pages, entry pages, sources and browsers.">
	          <h1 data-text="{title}"></h1>
	          <p class="note" data-text="{note}"></p>
	        </header>

	        <p class="cursor-says" data-text="{says}"></p>

	        <!-- This screen draws no graph and still writes the cursor the graph
	             reads, which is why the picker resets the caret here too. -->
	\(_rangePicker)

	\(_presetSeats)

	        <div class="dimension" data-live="panel" data-filter="id=eq.{param.panel}">
	          <template data-item>
	            <section class="one">
	              <!-- Every value the range holds, in the dashboard's own order
	                   and cut at nothing. `{id}` here is the PANEL row's, which
	                   is what a nested region's filter interpolates. -->
	              <div class="rows">
	                <table>
	                  <thead>
	                    <tr>
	                      <th scope="col">Value</th><th scope="col">Visitors</th><th scope="col">Visits</th>
	                      <th scope="col">Page views</th><th scope="col">Events</th>
	                      <th scope="col">Bounce rate</th><th scope="col">Visit duration</th>
	                    </tr>
	                  </thead>
	                  <tbody data-live="breakdown" data-filter="panel=eq.{id}" data-order="ord.asc"
	                         data-empty="Nothing in this window.">
	                    <template data-item>
	                      <tr style="--share: {share}">
	                        <!-- The same drill-down as the dashboard's, on the
	                             screen that shows every value rather than the
	                             vendor's first nine: all five slots travel
	                             together, because upsertBy patches. -->
	                        <th scope="row">
	                          <form class="drill" data-entity="filter" data-action="upsert">
	                            <input type="hidden" name="id" data-value="{param.preset}">
	                            <input type="hidden" name="f_page" data-value="{set_page}">
	                            <input type="hidden" name="f_entry_page" data-value="{set_entry_page}">
	                            <input type="hidden" name="f_source" data-value="{set_source}">
	                            <input type="hidden" name="f_browser" data-value="{set_browser}">
	                            <input type="hidden" name="f_name" data-value="{set_name}">
	                            <button type="submit" data-text="{dim_value}"></button>
	                          </form>
	                        </th>
	                        <td data-metric="visitors" data-text="{visitors}"></td>
	                        <td data-metric="visits" data-text="{visits}"></td>
	                        <td data-metric="pageviews" data-text="{pageviews}"></td>
	                        <td data-metric="events" data-text="{events}"></td>
	                        <td data-metric="bounce_rate" data-text="{bounce_rate_text}"></td>
	                        <td data-metric="visit_duration" data-text="{visit_duration_text}"></td>
	                      </tr>
	                    </template>
	                  </tbody>
	                </table>
	              </div>
	            </section>
	          </template>
	        </div>
	      </article>
	    </template>
	  </div>
	</section>
	"""

_sessionsMarkup: """
	<section class="screen" data-screen="sessions">
	  <div class="root" data-live="corpus" data-filter="id=eq.the"
	       data-on-mutation="stitch" data-reads="\(_readsS)">
	    <template data-item>
	      <article class="visits-page">
	        <h1>The visits</h1>
	        <p class="count"><span data-text="{hits}"></span> hits became <span data-text="{visits}"></span> visits over <span data-text="{visitors}"></span> visitors.</p>
	        <p class="note">A visit ends when the gap from its last hit — an engagement ping included — reaches 1860 seconds. Nothing cuts a visit at midnight and nothing caps its length.</p>
	        <p class="note">Every visit is here and there is no page control: a window over the visits would be a second cursor, and the one this app grades is the filter. The table scrolls sideways inside its own box rather than the page sliding under it.</p>

	        <!-- One header for four hundred rows. The columns are the fold's own,
	             read down: a legend repeated per visit is fifteen labels against
	             fifteen values, and at that ratio no column can be scanned. -->
	        <div class="visits">
	          <table>
	            <thead>
	              <tr>
	                <th scope="col">Visit</th><th scope="col">Opened</th><th scope="col">Closed</th>
	                <th scope="col">Entry page</th><th scope="col">Exit page</th>
	                <th scope="col">Page views</th><th scope="col">Events</th>
	                <th scope="col">Bounced</th><th scope="col">Duration</th>
	                <th scope="col">Source</th><th scope="col">Browser</th>
	                <th scope="col">Local day</th><th scope="col">Local week</th>
	                <th scope="col">Pages</th><th scope="col">Names</th>
	                <th scope="col">Which hours</th>
	              </tr>
	            </thead>
	            <tbody data-live="session" data-order="start_epoch.asc,id.asc"
	                   data-empty="The log has not been stitched yet.">
	              <template data-item>
	                <tr class="visit" data-id="{id}">
	                  <th scope="row" data-text="{id}"></th>
	                  <td data-text="{start_local}"></td>
	                  <td data-text="{last_local}"></td>
	                  <td data-text="{entry_page}"></td>
	                  <td data-text="{exit_page}"></td>
	                  <td class="n" data-text="{pageviews}"></td>
	                  <td class="n" data-text="{events}"></td>
	                  <td data-text="{bounce}"></td>
	                  <td class="n" data-text="{duration}"></td>
	                  <td data-text="{source}"></td>
	                  <td data-text="{browser}"></td>
	                  <td data-text="{day_key}"></td>
	                  <td data-text="{week_key}"></td>
	                  <!-- The read form of the two set-valued columns, never the
	                       fenced one Session's fields explain. -->
	                  <td class="set" data-text="{pages_text}"></td>
	                  <td class="set" data-text="{names_text}"></td>
	                  <td class="set">
	                    <ul class="hours" data-live="session_hour" data-filter="session_id=eq.{id}"
	                        data-order="ord.asc" data-empty="No hours.">
	                      <template data-item>
	                        <li class="hour" data-text="{bucket_key}"></li>
	                      </template>
	                    </ul>
	                  </td>
	                </tr>
	              </template>
	            </tbody>
	          </table>
	        </div>
	      </article>
	    </template>
	  </div>
	</section>
	"""

_logMarkup: """
	<section class="screen" data-screen="log">
	  <div class="root" data-live="corpus" data-filter="id=eq.the"
	       data-on-mutation="stitch" data-reads="\(_readsS)">
	    <template data-item>
	      <article class="log-page">
	        <h1>The log</h1>
	        <p class="count"><span data-text="{hits}"></span> hits over <span data-text="{days}"></span> local days, from <span data-text="{first_local}"></span> to <span data-text="{last_local}"></span>.</p>
	        <p class="note">Every column the app reads is a column here. Nothing in this app writes to the log and no screen offers to: there is no form on this page at all. One of those days is the spring-forward, on which the local hour 02:00 never happens: it holds twenty-three, and it is the day every other screen is built to survive.</p>

	        <div class="hits">
	          <table>
	            <thead>
	              <tr>
	                <th scope="col">Id</th><th scope="col">Epoch</th><th scope="col">Visitor</th>
	                <th scope="col">Name</th><th scope="col">Interactive</th>
	                <th scope="col">Path</th><th scope="col">Source</th><th scope="col">Browser</th>
	              </tr>
	            </thead>
	            <tbody data-live="event" data-order="epoch.asc,id.asc"
	                   data-empty="The log is empty.">
	              <template data-item>
	                <tr>
	                  <th scope="row" data-text="{id}"></th>
	                  <td data-text="{epoch}"></td>
	                  <td data-text="{visitor}"></td>
	                  <td data-text="{name}"></td>
	                  <td data-text="{interactive}"></td>
	                  <td data-text="{pathname}"></td>
	                  <td data-text="{source}"></td>
	                  <td data-text="{browser}"></td>
	                </tr>
	              </template>
	            </tbody>
	          </table>
	        </div>
	      </article>
	    </template>
	  </div>
	</section>
	"""

_specMarkup: """
	<section class="screen" data-screen="spec">
	  <div class="root" data-live="corpus" data-filter="id=eq.the"
	       data-on-mutation="stitch" data-reads="\(_readsS)">
	    <template data-item>
	      <article class="spec-page">
	        <h1>The specification</h1>
	        <p class="note">The published sentence, the published formula and this app's own reading, in three columns that are never merged. Rewording the reading leaves the sentence alone, so a departure cannot be tidied away.</p>

	        <h2>The seven metrics</h2>
	        <!-- Each table gets a box of its own to scroll in; spec.css states
	             the floor and why this screen has one. -->
	        <div class="sheet">
	          <table class="metrics">
	            <thead>
	              <tr><th scope="col">Metric</th><th scope="col">The published sentence</th><th scope="col">The published formula</th><th scope="col">What this app reads it as</th></tr>
	            </thead>
	            <tbody data-live="metric" data-order="pos.asc" data-empty="No metrics.">
	              <template data-item>
	                <tr>
	                  <th scope="row" data-text="{id}"></th>
	                  <td data-text="{says}"></td>
	                  <td class="formula" data-text="{formula}"></td>
	                  <td data-text="{reads}"></td>
	                </tr>
	              </template>
	            </tbody>
	          </table>
	        </div>

	        <h2>The ranges, and the granularities each allows</h2>
	        <div class="sheet">
	          <table class="ranges">
	            <thead>
	              <tr><th scope="col">Range</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Granularities</th></tr>
	            </thead>
	            <tbody data-live="range" data-order="pos.asc" data-empty="No ranges.">
	              <template data-item>
	                <tr>
	                  <th scope="row" data-text="{label}"></th>
	                  <td data-text="{from_days_back}"></td>
	                  <td data-text="{to_days_back}"></td>
	                  <td>
	                    <!-- The legal pairs are rows, not a guard inside a
	                         handler: an illegal pair has no row, so nothing names
	                         it and nothing has to refuse it. -->
	                    <ul class="pairs" data-live="grain" data-filter="range=eq.{id}"
	                        data-order="pos.asc" data-empty="None.">
	                      <template data-item>
	                        <li class="pair" data-text="{grain}"></li>
	                      </template>
	                    </ul>
	                  </td>
	                </tr>
	              </template>
	            </tbody>
	          </table>
	        </div>

	        <h2>The question set</h2>
	        <div class="sheet">
	          <table class="questions">
	            <thead>
	              <tr><th scope="col">Question</th><th scope="col">The published sentence</th><th scope="col">What this app reads it as</th><th scope="col">Departs</th></tr>
	            </thead>
	            <tbody data-live="question" data-order="departs.asc,id.asc"
	                   data-empty="No questions are published.">
	              <template data-item>
	                <tr class="q" data-departs="{departs}">
	                  <th scope="row" data-text="{id}"></th>
	                  <td data-text="{says}"></td>
	                  <td data-text="{reads}"></td>
	                  <td class="mark"><span class="word" data-text="{departs}"></span> <span class="why" data-text="{note}"></span></td>
	                </tr>
	              </template>
	            </tbody>
	          </table>
	        </div>
	      </article>
	    </template>
	  </div>
	</section>
	"""
