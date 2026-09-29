---
preset: press
colors:
  neutral: "#EEF1F4"
  surface: "#FFFFFF"
  surface-muted: "#E2E7EC"
  border: "#C9D1D9"
  primary: "#0D1216"
  secondary: "#56626D"
  accent: "var(--series-1)"
  danger: "#C0261C"
  attention: "#8A5A00"
  series-1: "#2A78D6"
  series-2: "#EB6834"
  series-3: "#1BAF7A"
  series-4: "#EDA100"
  block-ink: "#000000"
dark:
  neutral: "#0C1013"
  surface: "#151B21"
  surface-muted: "#1D242B"
  border: "#2A333B"
  primary: "#EAF0F4"
  secondary: "#8B99A5"
  accent: "var(--series-1)"
  danger: "#E8837A"
  attention: "#D9A64A"
  series-1: "#3987E5"
  series-2: "#D95926"
  series-3: "#199E70"
  series-4: "#C98500"
  block-ink: "#000000"
rounded:
  sm: "3px"
  md: "5px"
  full: "999px"
spacing:
  sm: "0.25rem"
  md: "0.5rem"
  lg: "1rem"
  xl: "1.75rem"
---

# The Answer Set — Grid

The identity is **Grid**: a dense, aligned, cool-grey reading surface where
identity is a block of colour and every magnitude is a length. Nothing here is
decorated. Everything here is aligned, and everything coloured is a block.

## What the subject demands

An analytics dashboard is not a document. A document is read once, front to
back, and it can afford a warm ground and a serif face and generous air,
because it wants you to settle in. This is read a hundred times, always the
same way: land on a number, find the number beside it, decide whether they
differ, and then go one level down.

That is a **comparison** task, and comparison is destroyed by three things —
misalignment, a hue that means a quantity, and motion. So the whole design is
the absence of those three, plus enough contrast that a hairline rule can carry
the structure a box would otherwise have to.

It also rejects, deliberately, the two looks this kind of page defaults to. It
is not the warm cream-and-serif essay ground — paper says "read me once", and
a warmed white under a column of figures makes the figures look like a
quotation rather than a measurement. And it is not the card grid: a row of
rounded, shadowed tiles is the house style of every analytics product shipped
since 2019, and it wastes the one axis that makes numbers comparable, which is
vertical alignment down a shared left edge.

## Type: two faces, one of them for digits only

- **Prose is the system sans**, at reading size, for headings, labels,
  sentences, and every column of the specification screen that holds English.
- **Every figure is monospace**, with `font-variant-numeric: tabular-nums`
  everywhere it can be set. This is not an aesthetic. A column of proportional
  digits cannot be scanned, because `1 111` is narrower than `8 888` and the
  eye has to re-find the decimal point on every row. Once digits are in a fixed
  advance, a panel of eight rows is read by the shape of the column and not by
  reading eight numbers.
- **A metric's units ride at the secondary colour, one step smaller, on the
  same baseline.** `41%`, `2.14`, `3m 24s` — the figure is ink, the suffix is
  not, so the digits are what the column is made of.
- **A label is heavy, upper case and widely tracked; a figure is neither.**
  Weight and case are what separate the naming layer from the measured one, so
  the two never compete for the same reading even where they share a cell — a
  heading that looked like a number would be read as one. Tracking is what
  makes upper case at ten pixels legible: set solid it is a row of verticals.
- Prose is never upper case. A seat's sentence carries figures inside it, and
  upper case is the mark of a label; putting it on a sentence claims the
  sentence is one.
- Anything that is an identifier rather than prose — a path, a source, a
  browser string, a filter slot name, a metric's published formula — is
  monospace. `/blog/why-we-left` is not prose and setting it as prose invites a
  reader to parse it as one.

## Density: the panel is a table

Every breakdown is a real `<table>` with a header row, hairline rules, and no
vertical rules at all. Rows are tight — one line of type plus a quarter of it
in padding — because eight rows that fit in one glance are worth more than
eight rows that are comfortable one at a time.

Anything with a row per record is that table, and the header is stated **once**:
four hundred visits under a fifteen-label legend apiece is fifteen labels for
every fifteen values, and at that ratio there is no column to scan. Where the
columns do not fit a phone the sheet scrolls in a box of its own; none of these
screens pages, because a window over the rows would be a second cursor and the
one this app grades is the filter.

Cards exist only where a thing genuinely is a single number: the top-line
figures. Even there they are not cards. They are seven cells of one row, divided
by hairlines and sharing a baseline, so they read as one instrument rather than
as seven unrelated boxes. A shadow would separate them; a hairline joins them.
The lead figure is a filled cell inside that band rather than a bigger number on
the ground, because it is the band's own edges that hold the row together.

The radius scale is deliberately tiny — 3px on insets, 5px on every other
corner. A dense surface with a 12px radius spends four pixels of every corner on
nothing, and eight corners into a panel that is real space. The one pill in the
app is not a third step of that scale: it is a round target, and the radius is
what says its glyph is the centre of one.

## Colour: hue is identity, length is magnitude

There are four categorical hues, `--series-1` to `--series-4`, and each one
belongs to one of the four breakdown dimensions — pages, sources, browsers,
entry pages, in that order. The pairing is declared once, as four rules keyed on
the dimension a block names, so the dashboard's panel and the screen that opens
it cannot disagree about what colour a source is.

A dimension's hue fills its panel's header and rides at low mix behind each
row's label, so a panel is a block of one colour and a reader who has seen
sources once recognises them anywhere. `--accent` is the interface's colour — a
link's rule, a focus ring, the segment in force, the graph — and it is
`--series-1` by reference rather than a second copy of it, so the leading
dimension and the chrome cannot drift apart.

**A hue never says how large a value is.** Inside a panel the quantity is the
LENGTH of the block behind the label, never its colour, which is what makes a
filter safe: narrowing a panel changes which rows survive and can never repaint
the ones that do. It is also what keeps two panels honest — a page's bar and a
source's bar are different colours because they are different questions, and
nothing invites the reader to compare their hues.

The four are computed as a set rather than chosen one at a time — re-stepping
one alone breaks the separation the other three were solved against — and both
appearances pass the same five gates: a lightness band, a chroma floor,
separation from the neighbouring hue under dichromatic vision, separation under
normal vision, and contrast against the surface. `--series-3` and `--series-4`
sit under 3:1 against the light surface, which is why **no hue is ever ink**: a
role that held in one appearance and not the other would be a token meaning two
things. A hue fills a header or a bar, and every block it fills carries its
dimension's name in words, so the colour is never the only carrier. What rides
ON a filled hue is `--block-ink`, and its twin is the same value: all four hues
are mid-tones in both appearances, so the ink that reads on one does not invert.
It is pure black rather than `--primary`, because `--accent` refers to
`--series-1`, so the light blue fill carries most of the app's small text — the
picker segment in force, both lead figures, a panel header and its unit — and
`--primary` on that fill is 4.26:1, under AA. Black holds every fill over
4.5:1: 4.76 / 6.56 / 7.46 / 9.70 light, 5.77 / 5.41 / 6.17 / 6.84 dark, and
re-steps no hue.

Two colours are reserved and never carry a dimension:

- **`--danger`** marks nothing on the dashboard at all. It is for the fold's
  refusal slot and for a screen state that failed. A red number in an analytics
  product means "bad", and "bad" is a judgement this app has no basis for — a
  bounce rate of 70% is a fact, not an alarm.
- **`--attention`** marks a `departs` row on the specification screen, and the
  bounce ring on a panel row. A departure from the published definition is a
  **stated choice**, so colouring it as an error would be lying about it. It is
  the same argument the keyboard-contract app makes about its own departures,
  and it is worth making twice.

  The ring is the one quantity in the app not drawn in its panel's hue, and for
  the reason the hues have: a bounce rate is a share of a divisor of its own,
  and drawing it in the colour the panel was ranked in would invite a reader to
  compare it with the block beside it. Its stroke is pulled back towards the
  surface, because nine of them ride in one panel and at the token's own value
  they are the brightest objects on the dark twin's page — which would put the
  loudest mark in the app on the number nothing was ranked by.

## A control says which alternative is in force

The two pickers are segmented strips, and a segmented strip whose segments all
render alike is a control that cannot say where the reader is standing. The
window in force would then be stated nowhere on the dashboard except in one seat
line of prose in another row, which is not where anyone looks for it.

So the mark is a **column**: `Range.on_cursor` and `Grain.on_cursor`, stamped by
the same fold that computes every number on the screen, and the segment binds it
through `aria-current`. That is one carrier, in the picture and in the
accessibility tree at once. The CSS-only route is not available and should not
be: a stylesheet cannot compare the row it is drawing with the row the cursor
names, so it would have to name the five ranges and the three granularities
itself, and a forked enum drifts from the rows the buttons are built out of.

The mark changes no metric of the type — not the weight, not the padding.
A mark that made the current segment wider would move the four beside it every
time a reader picked one.

## The series is columns, because a day is a bucket and not a sample

The graph draws one column per bucket against a labelled axis, and the table
under it lists every point. **The table is the meaning; the drawing is a summary
of it.** A line between two buckets asserts a value at an instant nobody
measured; a column asserts only what the bucket holds. So the columns are
anchored to the axis floor and sized to clear their neighbours by two per mille,
and the whole run is scaled by one column's width so the first sits on the left
edge and the last on the right — the bucket's graded position anchors its column and nothing
about the picture moves it.

The drawing is still one step down from the table: it carries one series where
every row carries three counts, it runs 13.5rem where the table runs the page,
and the gridlines and axis labels stay at border and secondary. Its geometry is
a **graded answer** — the oracle computes every bucket's position per mille and
the test rebuilds the whole path string from those numbers, character for
character.

The drawing and the value axis share one box. They share one geometry exactly,
and a column at the top of the domain reaches the frame's own edge. Sharing it
is the axis's — a gridline labelled with the domain's top has to sit on the
point it labels, so an inset one of them did not have would be a picture
disagreeing with its own scale.

This ordering is what makes the picture safe to be decorative. The picture
carries no text of its own and is hidden from assistive technology; the table
is what a reader who cannot see it gets, and the table is not a fallback — it
is what is being shown, drawn twice.

The caret is a position, not a quantity, so it is marked as one: the point a
reader has walked to with the arrow keys takes a wash of the accent, full ink,
and a mark in the margin, and the readout beside the graph names it. Current and
looks-current are one column, so a point cannot be one without the other.

## Motion: none on anything numeric

A bar that grows from zero on every refresh makes two readings of the same
number look different, and this app refreshes every panel whenever a filter
changes. So no bar animates its width, no number counts up, no panel fades in.
The only motion in the app is the caret's mark, which arrives in
`--motion-base` because a caret is a position and a position may move.

There is a second, harder reason. A perpetually moving element makes the visual
battery report a route as still settling, which blinds every check below it. So
nothing in this app loops: the caret's single arrival is the whole of the
motion, and it rides a pseudo-element the geometry fingerprint does not walk.
The appearance check counts looping animations on every route in both
appearances, and the count it accepts is zero. It measures one thing that is not
about motion and not about any element: at 1400 and at 390, the widths this
design was reviewed at, the document is never wider than the viewport. A sheet
too wide for a phone is not a defect — the log, the visits and the specification
all carry one, and each scrolls inside a box of its own — but a page that slides
sideways under the reader is, and every other claim in that check can hold of
every element while it does.

Under `prefers-reduced-motion` the motion tokens collapse to zero and the caret
simply arrives. There is no app-level `animation-duration` override anywhere:
a blanket sweep of that kind runs a clock-driven surface at infinite speed for
precisely the readers who asked for calm.

## The dark twin

The same instrument on a dark ground, and two things move rather than invert.

Each of the four hues lifts, because on a dark surface the light column's tone
disappears at the mixes the bars use and every panel goes flat — and each lifts
to the value its own gates pass in that appearance, so the set stays as separable
there as it is here. The ground is a cool near-black with a blue cast rather than
a neutral one, so that the hairlines — which are doing all of the structural
work — stay visible at a weight that does not read as a border.

There is no theme control anywhere in the app. Appearance is a token
resolution the reader's system decides, and the storyboard's `-dark` frames are
where the twin is reviewed. Every colour is declared in both palettes: a colour
that exists in only one appearance cannot be expressed here at all, and a twin
that nothing reads is a hard error rather than dead weight.

## What a screen may paint with

Tokens, and nothing else. A screen's stylesheet consumes `var(--accent)`,
`var(--border)`, `var(--sp-md)`; it never restates a colour. A second copy of a
colour is two things that will not stay equal, and the lint says so — including
inside a dark-appearance block, which is where a fork usually hides.

A screen's own private custom properties are welcome and are how the whole
chart works: `--v` is a bound column, `--max` is a bound domain, and the
geometry is `calc()` over the two. But **a property whose value a reader typed
never reaches a stylesheet.** Every geometry property in this app carries a
number a fold computed and the store validated, never a string from the log, so
there is no path by which a value could carry its own semicolon into a
declaration nobody wrote.
