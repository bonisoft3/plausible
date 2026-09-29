# Acceptance

What "done" looks like, one check per line. Each id is cited by the ir test that
realizes it and by the program's own `accepts`; a claim nothing cites is a hole
the lint names, not a hope.

- [ ] Opening the app lands on what the log is — its events, its visits, its visitors and the thirty-five days it spans — with nothing to sign in to. {#accept-index-names-the-log}
- [ ] The eleven filter shapes are listed, each with the sentence saying what it narrows to. {#accept-index-lists-the-shapes}
- [ ] Opening a shape opens the dashboard on that shape, and the numbers on it are that shape's rather than the ones the previous reader left. {#accept-shape-opens-dashboard}
- [ ] Each of the eleven shapes has its own address, and two addresses that name different shapes never show the same six numbers. {#accept-routes-distinct}
- [ ] There is no free-text filter box, and the index says why: a view has to be one of the eleven to be reachable by name. {#accept-no-free-text-filter}
- [ ] Landing on the dashboard cold shows figures computed from the log, before a reader touches a control. {#accept-dashboard-settles-cold}
- [ ] Six numbers — visitors, visits, page views, views per visit, bounce rate, visit duration — each carrying the sentence that defines it. {#accept-topline-six-numbers}
- [ ] The range and the granularity are each a row of buttons, and a range offers only the granularities it allows. {#accept-range-and-grain-pickers}
- [ ] The graph draws visitors over the range at the granularity chosen, as one column per bucket against a labelled axis. {#accept-graph-drawn}
- [ ] Beside the graph every point is a row of a table, and the screen says the table is what the graph means. {#accept-graph-table-is-meaning}
- [ ] Arrow keys walk the points and a readout names the one the caret is on. {#accept-graph-caret-walks}
- [ ] A bucket that measured nothing is drawn as a mark on the axis floor, so an hour with no visitors is not read as an hour that is not there. {#accept-empty-bucket-marked}
- [ ] The day whose local clock loses an hour is drawn as twenty-three columns, not twenty-four with a hole. {#accept-dst-day-23-bars}
- [ ] Four panels — top pages, entry pages, sources, browsers — each row showing its share as a bar, its visitor count, its share of the whole, and a small arc for bounce rate. {#accept-four-panels}
- [ ] A panel shows the nine values with the most visitors and no more, most first. {#accept-panel-nine-by-visitors}
- [ ] Two panel values with the same visitor count are ordered by the value itself, ascending, and where that tie falls across the ninth row it decides which value is shown at all. {#accept-panel-ties-by-value}
- [ ] Clicking a panel row narrows the whole dashboard to it, and every number on the screen moves together. {#accept-drilldown-narrows-all}
- [ ] Every filter in force is a chip, and removing a chip widens the dashboard back. {#accept-chips-removable}
- [ ] Current visitors is the count in the last five minutes of the log, and the screen says it ignores every filter. {#accept-current-visitors-unfiltered}
- [ ] Views per visit reads to two decimals, bounce rate to a whole percent, visit duration to a whole number of seconds. {#accept-rounding-as-defined}
- [ ] Under a page filter, views per visit and bounce rate are divided by different counts, and both divisors are on the screen beside their quotients. {#accept-two-divisors-shown}
- [ ] Filtering to a page nobody entered on gives a visit count above zero and a bounce rate of exactly zero, and the screen says why. {#accept-unentered-page-zero-bounce}
- [ ] Visitors over a week is not the sum of its days, in either direction, and nothing on the screen presents it as one. {#accept-visitors-not-summed}
- [ ] At hourly granularity the visit counts do not add up to the day's figure, and the screen states that rather than reconciling it. {#accept-hourly-visits-overlap}
- [ ] A panel opens on its own screen carrying every value of its dimension the range holds — twelve pages, eleven entry pages, nine sources or five browsers — rather than the nine rows the dashboard collapses to, in the same order. {#accept-panel-every-value}
- [ ] Each row of a panel in full carries all six detailed metrics, rather than the visitor count, the share bar and the bounce arc the dashboard collapses a row to. {#accept-panel-detailed-metrics}
- [ ] A panel in full answers the same filter the dashboard was on, and says which. {#accept-panel-keeps-filter}
- [ ] Every visit the log was cut into is listed: when it opened and closed, its entry and exit pages, its counts, whether it bounced, how long it lasted. {#accept-visits-listed}
- [ ] Beneath each visit are the clock hours it was open in — a visit spanning four hours shows four — and the hour the clock skips is not among them. {#accept-visit-hours-shown}
- [ ] A gap of thirty minutes and fifty-nine seconds leaves one visit; thirty-one minutes makes two. {#accept-visit-gap-boundary}
- [ ] A visit spans days where the log spans days: nothing cuts it at midnight and nothing caps its length. {#accept-visit-spans-days}
- [ ] A visit that opens on something other than a page view has no entry page until it views one. {#accept-entry-page-waits}
- [ ] A visit of one page view and three liveness pings shows one view and one event, and lasted no time. {#accept-views-vs-events}
- [ ] A one-hit visit lasts zero seconds, is shown as zero, and stays in the divisor of the average. {#accept-zero-duration-counts}
- [ ] A visit that viewed one page and did nothing interactive is marked bounced; a second view, or an interaction, clears the mark. {#accept-bounce-rule}
- [ ] The raw hits are shown a day at a time, on the site's clock. {#accept-log-by-day}
- [ ] Every column the app reads is a column on the log screen. {#accept-log-shows-every-column}
- [ ] Nothing anywhere in the app writes to the log, and no screen offers to. {#accept-log-is-read-only}
- [ ] Each hit says which local day and which local hour it fell in, and those are the cuts every bucket is made on. {#accept-local-day-stamped}
- [ ] The seven metrics appear with the published sentence, the published formula and this app's reading in three separate columns, never merged into one. {#accept-spec-three-columns}
- [ ] The published formula is verbatim and set as an identifier rather than tidied into prose. {#accept-formula-verbatim}
- [ ] The ranges are listed with the granularities each allows, and the list is the one the pickers obey. {#accept-spec-ranges-and-grains}
- [ ] The whole published question set is on the screen, grouped by whether this app answers it as published, approximately, or not at all. {#accept-spec-question-set}
- [ ] A row where this app departs from the published definition says so, says which way, and says it in its own words rather than a reworded copy of the sentence. {#accept-departure-stated}
- [ ] A departure is marked as a stated choice and never as an error. {#accept-departure-not-an-error}
- [ ] Every published question is asked of the app by something that runs, every number the app shows answers one, and every number the oracle answers is shown by some screen. {#accept-every-anti-join}
- [ ] Once loaded, a filter change is answered without a network request: the log and the arithmetic are already in the tab. {#accept-answers-without-network}
- [ ] No figure animates and no bar grows from zero, so two readings of the same number look the same. {#accept-no-numeric-motion}
- [ ] Under reduced motion the caret arrives without travelling, and nothing else in the app moves. {#accept-reduced-motion}
- [ ] Every figure is set in a fixed advance, so a column of them is read by the shape of the column. {#accept-tabular-figures}
- [ ] Every screen renders correctly in both light and dark appearance. {#accept-dark-twin}
