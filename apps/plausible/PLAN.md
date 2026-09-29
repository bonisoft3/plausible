# The build plan

Fourteen stages, numbered from zero. Each one names what it produces, what
proves it, and the trap-ledger rules that bite inside it. A stage is a unit
one agent can execute and verify without holding the next stage in its head.

The whole app is `durability: "tab"`: no Postgres, no Electric, no conduit, no
bloblang, no migrations, no RLS, no auth, no blobs, no hatches, no vendored
units. `state.pipelines` is `{}`. The compose is `caddy + launch`, the two-service
shape five apps in this tree already ship green.

That is not a shortcut, it is the load-bearing decision. A raw pipeline has no
browser-tier form at all, and the only check any app in this tree declares over
a bloblang mapping is `redpanda-connect lint`; `tests/pairs.yaml` has no runner.
For an app whose oracle **is** arithmetic, putting the arithmetic in the one
seat no fixture harness reaches destroys the grader before it is written. The
aggregation therefore lives in two Jessie reduces at the `data-on-mutation`
seat, which `mountApp` executes off disk — so the graded assertions run at
`just test` with no cluster up.

How fast is a **budget**, not a claim, and stage 4 proves it (below). The two
numbers measured so far, in this tree, on this machine:

```
$ cd apps/chess && time mise x -- deno test --config tests/deno.json \
    --no-lock --no-check --allow-env --allow-read tests/board.test.ts
ok | 27 passed | 0 failed (7s)          # 4.21s user, 7.6s wall
# the 26 printed per-case timings, sorted:
n=26 min=75 median=134 max=513 sum=4449ms
```

Each case is one `mountApp` + `settle()` of chess's board — 64 squares, 32
pieces, four regions carrying one fold seat — over a 4 031-byte `shell.yaml`. And
the part the fixture is blamed for is not the expensive part:

```
$ mise x -- deno run -A --no-lock --no-check yml2.ts   # js-yaml, the harness's own
cold  4x read+parse (189 129 bytes, seed.event = 1 200 rows): 38 ms
warm                                                          19 ms
warm2                                                         18 ms
```

`mountApp` reads and parses the whole `shell.yaml` **five** times — `appRoutes`,
`appI18n`, `appUnits`, `appSeed` and `appCluster` each do their own
`Deno.readTextFile` + `parseYaml` (screen-harness.ts:449, 458, 1216, 1227, 1236)
— and the parses of a 1 200-row seed cost under 40 ms, not seconds. The unmeasured
cost is the store seeding 1 200 rows and `stitch` folding them inside `settle()`,
and nothing in this tree folds 1 200 rows at this tier. Until stage 4 measures
it, the plan states no total.

---

## Stage 0 — the scaffold *(done; verify only)*

**Produces.** `apps/plausible/` with `.mise.toml`, `mise.lock`, `brief.md`,
`brief.html`, `ORACLE.md`, `PLAN.md`, `DESIGN.md`, `acceptance.md`, and
placeholder `compose.yaml`, `bayt.cue`, `bayt.json`, `docker/Caddyfile`,
`docker/shell.Dockerfile`.

**Proves it.** `cd apps/plausible && just setup` installs the toolchain;
`mise x -- duckdb -c "select 1"` answers; `mise exec -- cue vet ./...` and
`cue vet -c ./...` both exit 0, which is what gates the directory before
`program.cue` exists. `just setup` runs `mise install` and nothing else — the two
mkcert cmds a pronto app needs live in the emitted `.say.yaml`'s `setup.builtin`
rule (`libraries/mecha/cluster.cue`, `apps/chess/.say.yaml`), and this app has no
`.say.yaml` until stage 2, so the TLS pair is stage 2's to produce.

**Traps.**

- The directory name, the CUE package name and `code.meta.name` must be
  identical, and must contain no hyphen: the build resolves the project at
  `apps/<meta.name>` and the emitted `bayt.cue` declares `package <meta.name>`.
  `plausible` satisfies all three.
- `.mise.toml` and `mise.lock` are **scaffold-owned and never emitted**. Both
  were copied byte-identical from `apps/chess`: `.mise.toml` is md5 `c5b0fbb8…`,
  shared by chess, jsfb, shadcnui, truco, w3caria, xpense and this app;
  `mise.lock` is md5 `c82370aa…`, shared by chess, jsfb, truco, w3caria and this
  app — shadcnui's lock is `4d86f668…` and is a different pin. Do **not** take
  `apps/realworld`'s variant: its `asset_pattern` override exists because the
  default redpanda-connect release rejects fold pipelines, and this app
  declares none.
- The `http:duckdb` pin in that file is load-bearing twice over: `just lint`'s
  most important rule shells `mise x -- duckdb`, and so does this app's oracle.
- `compose.yaml`, `bayt.cue`, `bayt.json`, `docker/Caddyfile` and
  `docker/shell.Dockerfile` are **emitted artifacts**. They are placed here so
  `just launch` has a shape before the first build and so a reader can see what
  the app compiles to; the first `just build` overwrites them from `program.cue`
  and its file list. Do not hand-edit them. `docker/Caddyfile` is md5
  `66516eba…`, byte-identical in all nine apps that ship one.
- The placeholder `bayt.cue` deliberately omits the emitted form's `cluster`,
  `terminal` and `loop` redeclarations, and says so in its own header. They are
  bare schemas only `program.cue` makes concrete, so restoring them by hand
  leaves every instance in the directory incomplete and turns `cue vet ./...`
  red — the rule that gates the package. Stage 2 emits them, with a real
  `bayt.json`; the placeholder `bayt.json` is `{"dir": "apps/plausible"}`.

**Ports — the evidence.**

Every app in this tree publishes exactly one host port and it is the same
string in all nine: `'${CADDY_TLS_HOST_PORT:-8443}:8443'`, emitted from
`libraries/mecha/cluster.cue:149`. There is no per-app port table anywhere. No
app compose publishes a plain-HTTP host port — the `:8080` listener is bound
inside the container for the healthcheck and is deliberately unpublished — so
`CADDY_HOST_PORT` appears in no `apps/*/compose.yaml` and in no `libraries/`
file. (It is not absent from the whole repo: `guis/snapcards`, which is not a
pronto app, publishes one under that name.)

```
$ grep -rn "CADDY_TLS_HOST_PORT" apps/*/compose.yaml libraries/mecha/cluster.cue
apps/chess/compose.yaml:10        '${CADDY_TLS_HOST_PORT:-8443}:8443'
apps/jsfb/compose.yaml:10         '${CADDY_TLS_HOST_PORT:-8443}:8443'
apps/plausible/compose.yaml:10    '${CADDY_TLS_HOST_PORT:-8443}:8443'
apps/shadcnui/compose.yaml:10     '${CADDY_TLS_HOST_PORT:-8443}:8443'
apps/truco/compose.yaml:10        '${CADDY_TLS_HOST_PORT:-8443}:8443'
apps/w3caria/compose.yaml:10      '${CADDY_TLS_HOST_PORT:-8443}:8443'
apps/xpense/compose.yaml:112      '${CADDY_TLS_HOST_PORT:-8443}:8443'   (+ WEBAUTHN_ORIGIN:104)
apps/realworld/compose.yaml:122   '${CADDY_TLS_HOST_PORT:-8443}:8443'   (+ WEBAUTHN_ORIGIN:114)
apps/thenote/compose.yaml:120     '${CADDY_TLS_HOST_PORT:-8443}:8443'   (+ WEBAUTHN_ORIGIN:112)
libraries/mecha/cluster.cue:149   "${CADDY_TLS_HOST_PORT:-8443}:8443",  (+ WEBAUTHN_ORIGIN:122)

$ grep -rn "84[0-9][0-9]:" apps/ plugins/ libraries/ guis/ services/
(no output — nothing in the tree claims any port in 8400–8499 by literal)

$ lsof -nP -iTCP -sTCP:LISTEN | grep -oE ':84[0-9][0-9]' | sort -u
:8443        (docker — the shared default, in use on this machine now)
:8444        (docker)
:8470        (docker)

$ for p in 8443 8444 8451 8452 8470; do nc -z 127.0.0.1 $p && echo BUSY || echo free; done
8443 BUSY · 8444 BUSY · 8451 free · 8452 free · 8470 BUSY
```

The `grep -oE` pattern carries **no `$` anchor**: an `lsof` LISTEN line ends in
` (LISTEN)`, so an anchored pattern matches nothing and the transcript comes
back empty rather than wrong.

**Assignment: `CADDY_TLS_HOST_PORT=8451`.** `compose.yaml` ships the emitted
default unchanged, because it is emitted and deviating from it would be
overwritten; 8451 is the value to export when running this app beside another,
and it is recorded here because there is nowhere else in the tree that records
one. 8443 is busy on this machine right now, so `just launch` will collide
until the variable is set. This app declares no `auth` capability, so
`WEBAUTHN_ORIGIN` does not have to move with the port — an auth-carrying app
would have to move both together.

---

## Stage 1 — the fixture, its sidecar, and the ground truth

**Produces.** `fixtures/generate.ts`, and its six committed outputs:
`fixtures/events.json` (**1 200 hits**, 8 columns, sorted by `(epoch, id)`),
`fixtures/events.sha256`, `fixtures/sessions.json` (the sidecar, 400 visits),
`fixtures/zones.json` (the three `Zone` rows), `fixtures/plants.json` (the
manifest of what was planted where) and `fixtures/anchors.json` (the transcribed
vendor cohorts). Then `oracle.sql`, `tests/deno.json`
(`{"nodeModulesDir": "none"}`), `tests/ground-truth.ts` (the module-level lazy
promise every test file shares), `tests/fixture.test.ts` and
`tests/oracle.test.ts`.

And, because the ground-truth checks already need them, the two files stages 10
and 11 were going to introduce: `tests/question-examples.ts` — the closed
vocabularies, the eight blocks with the row count each owes, and one fully
written worked example per block — and `tests/coverage.ts` + its
`coverage.test.ts`, the anti-join functions with a case per anti-join driving it
to red on a doctored input. `oracle.test.ts`'s "every filter slot moves a graded
number" is the `slots` anti-join run against the ground truth, which is why the
machinery lands here rather than at stage 11.

**Proves it.** `deno test --config tests/deno.json --no-lock --allow-env
--allow-read --allow-run=mise tests/` green — 35 cases in well under a second,
because every one of them shares one `duckdb` invocation.
`fixture.test.ts`: the two witnesses are comparable at all; the sha matches; the
sidecar and DuckDB's window stitch agree on the partition key set and then on
every column of every visit, and on the `SessionHour` key set; every anchor
cohort reproduces the vendor's asserted numbers; every row the plant manifest
names is still in the log. `oracle.test.ts`: no precondition was degraded; the
window arithmetic comes to exactly `1810800` seconds; the bucket grid is 103 keys
over the seven legal pairs; every named wrong reading discriminates; every filter
slot moves a graded number; the reach closure agrees with the panel it was
clicked from. ORACLE.md §5.1 owns the split.

Do this stage **before any app code exists**. It is the only stage whose
failure means the oracle itself is wrong, and everything after it is graded
against it.

**Traps.**

- The generator is run **by a human, once**, and never by a test. It is the
  only file in the app allowed a real `Date` or `Intl`, and it uses them only
  to *check* the `Zone` rows, never to write a column the app must reproduce.
- Walk arithmetically rather than drawing from a PRNG — the discipline in
  `apps/jsfb/shell/handlers/bench.js`. A fixture reproducible only through a
  generator's internal state is reproducible by nobody who reads it.
- `oracle.sql` is authored and reviewed and never generated. One document, one
  invocation per run, cached behind a module-level lazy promise in
  `tests/ground-truth.ts`. Measured here: the whole file answers in **0.50 s**,
  while a bare `mise x -- duckdb -c "select 1"` costs ~77 ms (five in 0.387 s) —
  so one call per graded position, each also re-reading the log, is minutes
  against half a second.
- `fixtures/**`, `oracle.sql` and `tests/**` are **not in bayt's build
  fingerprint** — the build target's srcs are the literal list
  `["program.cue", "ir.html", "acceptance.md", "shell/**", "pipelines/**"]`
  and the test target's srcs are `["program.cue"]` alone. Nothing breaks
  today, because `.say.yaml` checks run on the host through nushell, but a
  rewritten oracle can ship from a warm container cache. Every test file
  therefore re-runs the cheap sha check itself rather than trusting `.say.yaml`
  rule order, which is a priority list and not a dependency graph. See D5.
- DuckDB's `AT TIME ZONE 'Europe/Berlin'` needs ICU, which loads lazily from
  `extensions.duckdb.org`. The grader runs at the **test** verb on the host,
  where `check-facts.ts` already shells duckdb, and never inside the preview
  cluster, which has no outbound network. If ICU turns out to be unavailable
  on a given machine, the fallback is stated in the fixture header: the three
  offsets become a literal CTE and DuckDB checks the app's local columns
  against arithmetic rather than a tz database — which is one rung weaker,
  because the tz database stops being an independent witness, and must be said
  so in the Decision.

---

## Stage 2 — the ladder, and the first green build

**Produces.** `ir.html`, `acceptance.md`, `program.cue` (the five seats wired
from `#DefaultCluster` / `#DefaultTerminal` / `#DefaultLoop` / `#DefaultBuild`
plus `out: pronto.#emit`), and a hand-written `program_derived.cue` stub.

**Proves it.** `just build` runs to a fixpoint and emits `.say.yaml`,
`.vscode/tasks.json`, `bayt.cue`, `bayt.json`, `compose.yaml`,
`docker/Caddyfile`, `docker/shell.Dockerfile`, `shell/*`, `tests/pairs.yaml`.
Then `just lint` green, which is the ir↔program bijection.

**Traps.**

- **The bootstrap deadlock.** The first `cue export` needs every decision's
  `note`, and notes come from derivation, so `program_derived.cue` must exist
  as a stub with one line per decision *before* the first `just build`. Write
  the stub in the same commit as `program.cue` and let the first run replace
  it.
- The build also needs, or it fails: `ir.html` carrying an
  `id="decision-NN" data-kind="decision"` element per declared decision,
  `acceptance.md`, `DESIGN.md`, `brief.md` + `brief.html`, and a local TLS pair
  from `just setup`.
- **`write.ts` derives from the *emitted* markup, re-emits, then re-derives to
  a fixpoint.** The first run after a markup change reports errors about the
  *previous* markup. Run it twice before believing an error.
- **Never delete `shell/screens/*.html` to clear a stale error.** Manifest
  cleanup removes anything in the last manifest that is absent from the current
  bundle, and with the emitted markup gone your hand-authored handler stops
  being referenced and goes with it. Patch the emitted file instead. Recovery
  is `docker compose exec caddy cat /srv/shell/handlers/<name>.js`.
- The bijection compares **ten** kinds — entity, pipeline, screen, state, flow,
  test, decision, handler, hatch, unit (`plugins/pronto/objects.ts:13-24`) — in
  both directions, plus each screen's `data-route` against `#Screen.route`.
  There is no `validation` kind, which is D10's first symptom. Ids must be unique within
  each side. A storyboard frame has no object of its own: its ir id is composed
  as `<screen.ir>-<state>` and compared whole, so every `states:` entry needs a
  frame with that exact id and vice versa.
- Every `{#accept-…}` in `acceptance.md` must be cited by some `data-accepts`,
  and every `data-accepts` value must resolve. Uncovered claims are warnings,
  not errors — do not let that soften them.
- `#Design.dark` is `close()`d to exactly the keys of `colors`. A missing twin
  and a twin nothing reads are both hard errors. `DESIGN.md` declares every
  colour in both palettes; keep them in step.
- The ir must carry the mandatory *escape hatches* decision even though the
  answer is "none", and a decision declining `auth` with its cost stated.
- `meta.ir.sha256` is a required field and is verified by nothing. Declare it,
  do not rely on it; the real staleness gate is the artifact-hash re-check at
  lint, so the cycle is regenerate-and-relint.

---

## Stage 3 — the entities and the vocabularies

**Produces.** Nineteen entities, all `durability: "tab"`, in `program.cue`,
plus `fixture.cue`'s single line pulling the log in:

```cue
@extern(embed)
_events: _ @embed(file="fixtures/events.json")
```

*(verified in this tree: `@embed` of a JSON array from an app subdirectory
resolves relative to the package directory and exports all 1 200 rows in 0.04 s
— 381 166 bytes as JSON, 208 329 as YAML.)*

| Entity | Written by | Notes |
|---|---|---|
| `Event` | seed | `id, epoch, visitor, name, interactive, pathname, source, browser` |
| `Zone` | seed, 3 rows | `id, starts_epoch, offset_seconds, abbr` |
| `Session` | `stitch` | the visit, with entry/exit page, counts, bounce, duration, and the attribution frozen from its first hit |
| `SessionHour` | `stitch` | one row per visit per local hour spanned |
| `Corpus` | `stitch` | singleton, seeded zero |
| `Fold` | seed, 2 rows | `id ∈ {stitch, rollup}`, `note`, `error` |
| `Filter` | forms only, 11 seeded rows | the **live** cursor, one row per preset, `id` equal to its `FilterSet` id and seeded from it: `range, grain, as_of_epoch, active_bucket, f_page, f_entry_page, f_source, f_browser, f_name`. See *The cursor contract* |
| `Topline` | `rollup` | the divisors **and** the displays |
| `Bucket` | `rollup` | `b-00`…`b-27`; 28 is the largest bucket count any legal pair produces (`28d` → day), and the ir states it as that maximum rather than a round number. `on_caret` marks the point the caret is on |
| `Tick` | `rollup` | `t-0`…`t-4` |
| `Scale` | `rollup` | singleton: `domain_max, points, path_d, floor_d`, and the caret — `caret_point, caret_label, caret_prev, caret_next` — because the readout is the one region a shortening window cannot take away (ir decision-23) |
| `Breakdown` | `rollup` | `<panel>\|<value>`, with `ord` — the row's place under `visitors desc, dim_value asc`, ORACLE.md §2.2 — and `bounce_n`/`bounce_denom`/`dur_sum`/`sessions_n` beside the quotients, plus the five `set_*` columns the drill-down form submits (*The cursor contract*) |
| `Chip` | `rollup` | id **is** the slot name; `slot` declared `unique`; carries the same five `set_*` columns with its own slot emptied |
| `Panel` | seed, 4 rows | `page, entry_page, source, browser` |
| `Metric` | seed, 7 rows | `says`, `formula`, `reads` in three columns |
| `Range` | seed, 5 rows | `id, label, from_days_back, to_days_back, to_is_as_of` — see *The five `Range` rows* below |
| `Grain` | seed, 7 rows | the legal `(range, granularity)` pairs, ORACLE.md §2.1 |
| `FilterSet` | seed, 11 rows | the eleven **declared** cursors, never written: `name, range, grain, as_of_epoch, active_bucket, f_page, f_entry_page, f_source, f_browser, f_name`. Its id **is** the `:preset` route parameter, and it is what a reset restores |
| `Question` | seed, 312 rows | thirteen columns — `id, metric, panel, dimension, range, grain, filter_set, says, reads, departs, expects, hard_case, note`. **No row carries an expected value**, and there is no `external` column: the vendor's numbers are assertions on the ground truth (ORACLE.md §3.5), not question rows |

**The five `Range` rows.** Three ranges are rolling and two are pinned, and a row
has to express both without a second table. The whole row is below: the `label`
the button reads, then `from_days_back` and `to_days_back` counted in **local
civil days back from the as-of day**, plus one boolean saying whether `to` is
`as_of` itself. `resolves to` is not a column — it is what the other three
produce:

| id | `label` | `from_days_back` | `to_days_back` | `to_is_as_of` | resolves to |
|---|---|---|---|---|---|
| `day` | the day | 0 | 0 | true | `[1775599200, 1775650800)` |
| `7d` | the last seven days | 6 | 0 | true | `[1775080800, 1775650800)` |
| `28d` | the last twenty-eight | 27 | 0 | true | `[1773270000, 1775650800)` |
| `custom_21d` | a fixed twenty-one-day window | 24 | 3 | false | `[1773529200, 1775340000)` |
| `custom_dst_day` | the day the clock changed | 10 | 9 | false | `[1774738800, 1774821600)` |

`back(midnight(as_of), k)` is a subtraction of **dates**, never of `k × 86400`
seconds (ORACLE.md §2.1). `to_is_as_of` is the app's one range branch and it is
one boolean in one place; `to_days_back` is `0` on the rolling rows because every
column must exist on every row, and nothing reads it there. All five resolve to
the integers ORACLE.md §2.1 tabulates, and `oracle.sql`'s `windows` CTE asserts
each against ICU.

**Proves it.** `just build` then `just lint` green; `cue vet -c ./...` (which
is what `just test`'s builtin runs) proves every seed row is concrete.

**Traps.**

- `access` is `_|_` — a hard error, not merely ignored — on any `tab` or
  `device` entity. Declare none.
- Nothing is at `device`. A `device` collection persists in `localStorage`
  across program versions and **nothing backfills a new column**, so a returning
  reader gets `binding {x} not in row` and it reproduces on no fresh browser.
  This app's schema will move; `tab` makes that harmless.
- `seed:` is silently forced to `[]` on a `device` entity. Program-owned rows
  belong at `tab`. Every seeded row here is program-owned.
- Every row a region pins must be **seeded**: `Corpus`, `Topline` and `Scale`
  one row each, `Filter` eleven. This is the same rule the schema states for a
  pipeline-written singleton and it applies verbatim to a reduce-written one, but
  the reasons here are three and they are not the same reason. `Topline` and
  `Scale` are slots, and a slot with no row binds nothing and, decisively, does
  not fire its seat. `Corpus` is every screen's root or its seat-bearing ear, and
  a root with no row poses `empty` for the whole screen. `Filter`'s eleven rows are
  what let `rollup` read the cursor with no presence branch and let a machine's
  first write have a key.
- Every column any item template binds must exist on **every** row, including
  `required: false` ones. Declare the derived entities' columns `required` and
  have the fold write a zero rather than omitting them.
- `writers` stays at its default `forms` on the reduce-written entities.
  `writers: "pipeline"` is a SQL role convention that does not exist at the
  browser tier, and `apps/chess`'s `Legal` does exactly the same. See D7.
- `entityOrder`, if declared, must list **every** entity, parents before
  children.
- Timestamps are `bigint` UTC seconds and nothing else. The terminal's only
  formatter is a fixed `Intl.DateTimeFormat` pinned to UTC, and a reduce has no
  `Date` — so a local day is arithmetic over `Zone`, never a rendered string.
- `views_per_visit`, `bounce_rate` and `visit_duration` ship a `text` display
  column beside their numeric divisors, because the **rounding is part of the
  metric definition** and the graded artifact is the rendered string.
- On a `tab` entity, every write of a column must use one JS spelling, and a
  non-string may only go into `int`/`bigint`/`bool` — a browser tier passes
  through no Postgres to reconcile spellings or coerce types. Route every
  comparison in both reduces through one `txt = (v) => String(v ?? "")`.

---

## The screen shape, the wake graph, and the cursor contract

Three artifacts that are not a stage because every stage from 4 on reads them.
Each fact below cites the line that establishes it; a builder who changes one
of these attribute strings has changed the app's architecture.

### Every region is either a list or a leaf

A region with **no** item template is a slot (`opts.singleton = true`,
screen.js:2080; "An empty set read back off the DOM is how a SLOT is spelled",
screen.js:2026). A slot never sweeps its children, so its static subtree
persists and its texts and attributes bind — `apps/truco`'s `.matchbox` is a
slot holding `data-text="{us_score}"` and it works.

But a slot **hydrates no nested region**, and neither does the screen-level
loop: `if (region.parentElement.closest("[data-live]")) continue`
(screen.js:2727) skips every nested `[data-live]`, and the only thing that ever
hydrates one is `syncNested`, called from exactly one place — inside the *items*
loop, per row (screen.js:2494). A `[data-live]` sitting under a slot is found,
skipped, and never hydrated. `apps/truco/shell/screens/arena.html:63` and
`apps/chess/shell/screens/board.html:63` both say so in the tree.

And the failure is worse than blank, because item templates are collected with
`region.querySelectorAll("template[data-item]")` — **scoped to the region's
subtree**, which does not descend into another `<template>`'s content. Verified
with the harness's own linkedom:

```
$ mise x -- deno run -A --node-modules-dir=none tpl.js
root, nested region INSIDE its own item template -> 1
slot, nested region as STATIC child             -> 1
screen-level [data-live] found: [ "root", "slot", "staticChild" ]
staticChild skipped by 2727? true
```

So a region intended as a slot with a `[data-live]` static child is not a slot
at all: it collects that child's `<li>` template, becomes a **list**, stamps one
`<li>` per row of its own table, and sweeps the child region away with every
other non-row child (screen.js:2527-2530). No error, no empty state, no panel.

Hence the two rules this app follows without exception:

1. **Every screen's root is a list of one row over a seeded singleton**, whose
   single `<template data-item>` wraps the whole screen. Nested regions live
   inside that template, which is the proven shape: `arena.html`'s
   `data-live="play"` at :159 sits inside `data-live="round"`'s template at
   :135, and `board.html`'s four nested regions sit inside `data-live="game"`'s
   template at :73. It also settles the `data-state` hazard properly — nested
   regions hydrate with `top=false` and cannot call `setState` at all — and it
   hands `{range}`, `{grain}` and every `f_*` to every child of the dashboard
   for free.
2. **A slot is always a leaf.** `Topline`, `Scale` and each per-slot `Chip`
   region are slots and contain no `[data-live]`. Anything that would nest goes
   under a list.

**What the slot was wanted for, and where it is recovered.** The design wanted
the root to be a slot so its static children would persist across refreshes —
which is what the chart needs, since a list sweeps its markup. That is lost at
the root and recovered one level down: the graph's authored
`<svg viewBox="0 0 1000 300">` lives in its **own** nested slot over
`scale?id=eq.the`, a leaf, which never sweeps. Across a root refresh the root's
item node survives (keyed by row id, screen.js:2445-2447), `syncNested` finds
the slot held with an unmoved filter and calls `restate()` rather than
re-hydrating (screen.js:2358-2364), so the `<svg>` element is stamped once for
the life of the visit.

**Named templates.** A nested list may carry its own inline template, because
the parent cannot see into it. Where a template is shared between regions it is
declared at screen root as `<template data-item data-name="…">` and referenced
with `data-template="…"`; `namedTemplates` is collected once before any region
hydrates (screen.js:1074-1080), so the Map holds the node even after a sweep
detaches it. `apps/shadcnui/shell/screens/calendar.html` is the reference.

### The wake graph

**A `data-on-mutation` seat wakes when its own region's read changes, and at no
other time.** `data-reads` and `data-read-*` fill `state.rows` through
`store.query` (screen.js:1476-1487) and subscribe to nothing; the only
subscription is `store.subscribe(table, guarded, opts)` over the region's own
`data-live` narrowed by its own `data-filter` (screen.js:2676, maintained-view
semantics at data-crud.js:632-640). `board.html:55-58` states the rule in the
tree: *"A mutation wake is a region's OWN read changing, so a beat wakes nothing
unless some region over `tick` carries the referee's seat."*

Two further facts the graph is built on:

- **The seat also runs on first paint.** `wireEvents` is called at the end of
  every `refresh()`, in the list branch (screen.js:2571) and in the slot branch
  (screen.js:2611), and a region's `ready` is its first `refresh()`. A list
  region fires unconditionally even with zero rows; a **slot fires only if its
  row exists** — it returns early when `row === undefined` (screen.js:2597-2604).
  That is a second reason every seat here rides a list.
- **A seat's world is complete at its first run.** `worldOf()` awaits
  `store.query` for every declared read before the reduce is called
  (screen.js:1600), and `read` awaits `ensurePrepared(table)`
  (data-crud.js:544 → 217 → 236), which is what writes a `tab` collection's
  seed. So the seed cannot be missing from `state.rows` on the first run. At the
  test tier the question does not arise at all: `mountApp` hands
  `memoryStore(spec.tables)` the seed rows before the mount
  (screen-harness.ts:926, 1082-1093), with no `ensurePrepared` in the path. See
  the open question at the end of this section for the one link in the browser
  half that is read, not run.

The graph, therefore, is small. Two seats, and each rides a **one-row list**:

| screen | route | root region | Seat S rides | Seat R rides |
|---|---|---|---|---|
| `index` | `/` | `corpus?id=eq.the` | the root | — |
| `dash` | `/f/:preset` | `filter_set?id=eq.{param.preset}` | a nested `corpus?id=eq.the` | a nested `corpus?id=eq.the` **and** a nested `filter?id=eq.{param.preset}` |
| `panel` | `/f/:preset/:panel` | `filter_set?id=eq.{param.preset}` | as `dash` | as `dash` |
| `sessions` | `/sessions` | `corpus?id=eq.the` | the root | — |
| `log` | `/log` | `corpus?id=eq.the` | the root | — |
| `spec` | `/spec` | `corpus?id=eq.the` | the root | — |

Every region above is `<div data-live="…" data-filter="…">` with one
`<template data-item>`. On `dash` and `panel` the two `corpus?id=eq.the`
regions are **siblings** — one carrying Seat S, one carrying Seat R — which is
`board.html:52-60`'s shape exactly: two regions over `tick?id=eq.tick`, one the
writer and one the ear, *"a second region rather than the machine's own so that
the writer and the reader of this row stay visibly apart."*

The two seat strings, generated once in CUE and interpolated at every site.
**Seat S:**

```
data-on-mutation="stitch"
data-reads="corpus,event,fold,session,session_hour,zone"
```

**Seat R:**

```
data-on-mutation="rollup"
data-reads="breakdown,bucket,chip,event,fold,grain,panel,range,scale,session,session_hour,tick,topline,zone"
data-read-cursor="filter?id=eq.{param.preset}"
```

`filter` is deliberately **absent** from that list even though a region carries
it: a whole-table read would put all eleven cursor rows in `state.rows.filter` and
give the reduce a second, wrong way to reach one. `data-read-cursor` is the only
path, so picking the wrong row is not an available mistake. `filter_set` is
absent for the same reason — the declared cursor is the reset form's business,
not the reduce's — and `corpus` because `rollup` is corpus-independent. Each
name in `data-reads` costs one whole-table `store.query` per run
(screen.js:1477-1479), so the list is the reduce's world and not a courtesy.

The seat key is `[dataset.onMutation, ...reads, ...data-read-* as "name=value"
sorted]` NUL-joined (screen.js:1951-1957). So the `data-reads` list is keyed in
**declared order** — the alphabetical order above is a convention for
reviewability, and reordering it splits one seat into two that each conclude
from a world missing the other's writes. Only the `data-read-*` attributes are
sorted, and they are keyed as `name=value`, so the name matters as much as the
spec.

Seat R carries `{param.preset}`, which is why it exists on the two `:preset`
routes and nowhere else. `data-read-*` is a region attribute
(`regionAttr`, screen.js:281) so the placeholder is never bound away, and it is
re-resolved against the region's context on every step (screen.js:1477-1484);
`lookup` **throws** `unknown route param` on a route that does not declare the
param (screen.js:299-301), so this string is illegal on any other screen. The
read is free: it goes to `query` in the same shape a region's own read carries,
so the `filter?id=eq.{param.preset}` ear's own maintained view serves it
(screen.js:1465-1470) — the ear and the cursor read are the same read, which is
why the ear is filtered rather than whole-table.

**Why the graph closes, in order.**

1. Mount `/f/:preset`. Every top-level region's `ready` starts; the root
   hydrates its item and `syncNested` hydrates the nested regions, each firing
   its own first `refresh()`.
2. Seat S runs. `state.rows.event` is the 1 200 seeded hits, `state.rows.zone`
   the three `Zone` rows; `state.rows.session` is empty. It recomputes absolutely
   and states its writes **in this order: `session`, then `session_hour`, then
   `corpus` last**. That order is the invariant the graph hangs on — a `corpus`
   write means every `Session` and `SessionHour` row for this world has already
   landed — and `applyUpdates` preserves it, batching only *consecutive*
   same-op-same-entity runs (screen.js:1560-1573).
3. Seat R runs **twice**, concurrently with step 2 and over an empty session
   set, and writes zeros into `Topline`, `Bucket`, `Tick`, `Scale`, `Breakdown`
   and `Chip`. Twice, because Seat R rides two sibling regions that share one
   seat key — the key is `[handler, ...reads, ...data-read-*]` and carries
   neither region's own `data-live` — so the second region's `wireEvents` finds
   `seat.running` true, sets `seat.again`, and the `.finally` **re-runs** the
   seat rather than coalescing it away (screen.js:1960-1976). This is not a
   wasted pass to be avoided: it is what makes the dashboard's first paint a
   real screen rather than a blank one.
4. **The second-order edge.** Seat S's `corpus` write wakes both sibling
   `corpus?id=eq.the` regions. Seat R re-runs, now over the complete session
   set, and recomputes every graded number. This edge is the whole reason the
   `corpus` ear on Seat R exists, and it is the one the design was missing.
5. Seat S also re-runs, from its own `corpus` write. Recomputing absolutely over
   an unchanged world, it writes nothing, so it produces no mutation and the
   fixpoint is structural (screen.js:1936-1942). That second pass is not
   redundant: it is the executable proof that `stitch` is absolute, and
   `stitch.test.ts` fails if it is not.
6. A reader changes the range picker, or drills into a breakdown row. Either is
   a form write to this preset's `Filter` row, which wakes the
   `filter?id=eq.{param.preset}` ear. Seat R re-runs; Seat S does not read
   `filter` and does not move.

So each mount settles at **two runs of `stitch` and three of `rollup`** — two of
the three from first paint, because Seat R rides two sibling regions on one seat
key (step 3), and the third from the `corpus` write (step 4). Each reader gesture
costs one run of `rollup`. Stage 4 counts them; an assertion written to any other
pair of numbers goes red on correct code.

**Why there are no other ears, stated rather than left to be discovered.**

- No ear on `event`, `zone`, `panel`, `range`, `grain` or `filter_set`: they are
  seed-only, and a seat's first run already sees the seed (above).
- No ear on `session` or `session_hour`, even though `rollup` reads both: the
  `corpus`-last invariant in step 2 is what replaces them, and it costs one
  one-row region instead of two regions that would stamp 400 and 526 nodes
  into the dashboard.
- No ear on `fold`: only the reduces write it, and an ear on it would turn every
  error report into a wake.
- No ear on anything `rollup` writes. `rollup` is live on none of its own sinks,
  so it never self-wakes, and one run per input change is all it gets. The
  differential-write discipline is what makes that correct.
- The display regions — `Topline`, `Bucket`, `Tick`, `Scale`, `Breakdown`,
  `Chip`, `Session`, `SessionHour`, `Event` — carry **no seat**. They subscribe
  to their own tables and re-render when a reduce writes them. That is the whole
  read path.

**The bound.** The throw `the store never went quiet` is raised after 500
macrotask turns inside `quiet()`, not `settle()` (screen-harness.ts:964), and
each wake is one `setTimeout(…, 0)` (data-crud.js:648-656). Five reduce runs and
their re-renders are far inside that, but the fold over 1 200 events is
unmeasured; stage 4 measures it. `STEPS = 8` (screen.js:1526) bounds a reduce's
`then` chain, not its wakes — neither reduce returns a `then`, so it does not
apply here.

**Open question.** In the browser half, `seed()` awaits `client.insert` and
`read` then returns from the collection (data-crud.js:236-246, 544-556). That
a just-awaited insert is visible to the read in the same turn is read from the
code, not run. The command that settles it is `just launch`, then in the console
`(await window.__prontoStore?.query?.("event")).length` on `/f/all-28d-day`
before any gesture; a 0 there and 1 200 in the tests means the seed lands after
the first run, and Seat S needs an ear on `event` narrowed to one pinned hit.

### The cursor contract

A **cursor** is `(range, grain, as_of_epoch, active_bucket, f_page,
f_entry_page, f_source, f_browser, f_name)`. Eleven of them are materialized and
each is named by a URL, which is PLAN's own correction #2 — the key must name a
materialized row, so the answerable set is finite and enumerated.

Nothing else in this app connects a route to arithmetic, so all of it is stated
here. **The route parameter selects which cursor row is live; it never composes
with a second source.** There are two tables, and each holds eleven rows under
the same eleven ids:

- **`FilterSet` is the declared cursor** — what the URL *means*. Eleven seeded
  rows, written by nothing.
- **`Filter` is the live cursor** — what the reader has done to it. Eleven seeded
  rows, each seeded identical to its `FilterSet` twin, written only by forms.
- **`rollup` reads exactly one row.**
  `data-read-cursor="filter?id=eq.{param.preset}"` puts it in
  `state.rows.cursor`, and every cursor field comes from there. No overlay, no
  composition, and therefore **no precedence branch inside the reduce** — which
  is the whole reason for two tables rather than one singleton plus a
  discriminator, since a discriminator is a branch and a stale discriminator is a
  silently dead picker. A route parameter cannot write; this is the seam that
  means it does not have to.

The precedence a reader can observe is therefore about *time*, not about two
sources:

- **`/f/:preset` re-entry restores the reader's cursor, not the preset's.** The
  drill-down lives on that preset's own `Filter` row and nothing clears it, so a
  back button, a bookmark and a second visit all agree. Eleven presets means eleven
  independent cursors: drilling on `/f/all-28d-day` cannot move
  `/f/berlin-7d-hour`.
- **A `Reset` form at screen root restores the preset.** It is an `upsert` on
  `filter` with `id` bound from `{param.preset}` and every cursor column bound
  from the enclosing row. That is the second reason the root region is the
  `FilterSet` row: a form sitting directly inside the root's item template binds
  `{range}`, `{grain}`, `{f_page}` and the rest off the declared cursor, so the
  reset needs no columns anywhere else.
- **A drill-down writes every slot, not one.** `upsertBy` **patches** an existing
  row with only the submitted fields (data-crud.js:832-853), so a form carrying
  one `f_*` would leave the other four standing and a reader could reach a
  two-slot cursor no `Question` grades. So every `Breakdown` and `Chip` row
  carries five graded `set_*` columns — the live cursor's five slots with this
  panel's slot replaced by this row's value — and the form submits all five plus
  `id`. They must be real columns because a nested item template binds against
  **its own** row: `{f_source}` inside a breakdown item raises
  `binding {f_source} not in row`, and the enclosing row is not reachable from
  there. A chip removal is the same form with the chip's own slot emptied.
- The `id` input is `<input type="hidden" name="id"
  data-value="{param.preset}">`. `resolveHidden` resolves `{param.x}` against
  the form's context (screen.js:1285-1286, 587-591), and
  `apps/thenote/shell/screens/note.html:23` ships the shape.
- **`range` and `grain` need no restating on a drill-down or a chip removal**,
  because there is only one source: they are already this row's, and a form that
  does not name a column leaves it where the reader put it. That is what
  collapsing the overlay bought. `active_bucket` is the exception, and only on
  the forms that MOVE THE WINDOW: a window holding fewer points than the last one
  has no row where the caret was standing, so the range and granularity pickers
  state the caret's home with the pair. `_caretHome` is that point, `b-00`,
  spelled once in CUE and interpolated into the seed and into all three picker
  forms — the dashboard's two and the full panel's one, which writes the same
  cursor the dashboard's graph reads.
- **The reachable space is enumerable, and it is strictly larger than the space
  the declared filter sets grade.** The closure is: one cursor per preset, one
  one-slot drill-down per breakdown value per panel, one `active_bucket` per
  bucket, and the legal `(range, grain)` pairs the `Grain` rows admit.
  `sweep.test.ts` enumerates that closure and nothing outside it is reachable —
  but a declared filter set is only its own starting point, and after one
  drill-down gesture the cursor is a shape no `FilterSet` row names. What grades
  a drilled position is `oracle.sql` §7.5's **reach closure** — every cursor one
  gesture from a declared shape, whether the gesture is a drill-down or a chip
  removal, with the six top-line metrics computed for each at every range. The
  bound is one gesture and it is a bound rather than a fixpoint: the graph and
  the four panels **under** a reached cursor are not computed, because the panels
  under a reached cursor are the next gesture's cursors and the closure does not
  terminate at a size the file can emit. That cost is declared in
  `tests/coverage.ts`'s `DECLINED_REACH`, which the reverse anti-join reads, and
  ORACLE.md §6 carries it as a named ceiling.
- **The eleven routes are distinct on a cold mount**, which is what every test
  and the manual pass in stage 12 read: a fresh tab holds eleven seeded `Filter` rows
  equal to their `FilterSet` twins, so `/f/x` renders x's arithmetic and nothing
  else. `tab` durability is what makes that reliable — nothing survives the tab,
  so no earlier visit's drill-down can leak into a case.

**The route parameter is not lintable by the visual battery, and that is a
finding rather than a defect to hide.** `check-visual` resolves each param by
reading its planned table over PostgREST — `GET {base}/crud/{table}?select=…`
(check-visual.ts:99-102, 168-178). An all-`tab` app has no such table, so both
`:preset` and `:panel` come back `unresolved`, each as a `major` finding, and
the route is dropped from `live` (check-visual.ts:349-365). Only `critical`
exits non-zero (check-visual.ts:15, 530-535), so `just integrate` stays green
and the two routes go unphotographed. `apps/chess` already has this: its `Game`
is `durability: "device"` and `/game/:id` pins `id=eq.{param.id}`. See D11 and
stage 12.

---

## Stage 4 — `stitch`, and the two screens that prove it

**Produces.** `shell/handlers/stitch.js`; `shell/screens/sessions.html|css`
(`/sessions`) and `shell/screens/log.html|css` (`/log`);
`tests/stitch.test.ts`.

`stitch` reads `event, zone, session, session_hour, corpus, fold` and writes
`session, session_hour, corpus`. It implements, from the log alone:

- **the boundary as the integer `1860`.** A visit ends when the gap from its
  **last hit** — a hit of any name, an `engagement` ping included — reaches
  `1860` seconds. Not `1800`, and not the phrase "thirty minutes": the literal is
  the rule, it is the same literal in `oracle.sql`, in `Metric.reads` for
  `visits` and in every `Question.reads` that mentions the boundary, and
  `stitch.test.ts` walks the four planted gaps (1799, 1800, 1859, 1860) at it.
- **page views count only `name === "pageview"`; events count every hit
  *except* `engagement`.** "Events count everything" is `events_count_every_hit`,
  a named wrong reading the oracle grades against — it answers 983 where the rule
  answers 751 on the `(none, 28d)` probe.
- **entry page is the first page *viewed* and exit page the last page viewed.** A
  hit that is not a page view moves neither, so a visit a custom event opened has
  no entry page until it views one (ORACLE.md §3.5, the vendor's own
  `cache_store.ex`).
- **bounce**: a visit bounces iff it viewed at most one page **and** carried no
  interactive hit that was not a page view. Interaction is the hit's own
  `interactive` column and never a reading of its name — a custom event may
  declare itself non-interactive and then clears nothing.
- **duration** is the last **non-`engagement`** hit minus the first, so a ping
  never extends it and a one-hit visit lasts zero seconds.
- **attribution** — `source` and `browser` — frozen from the first hit.
- the local day/week/hour from a civil-from-days integer algorithm over the
  `Zone` row with the greatest `starts_epoch <= epoch`.

**Proves it.** Three things, and the third is a number, not a green tick.

1. `stitch.test.ts`: cardinality of `Session` then of `SessionHour` against
   DuckDB, **before** any column is compared; then every column; then the ten
   hard cases by the visit ids `plants.json` names.
2. Mounting `/sessions` cold, with only the seed, settles to the DuckDB
   cardinality — which is the assertion that the wake graph closes at all, and
   the one whose absence would have made every later number zero.
3. **The runtime budget, and the reduce-run count.** One `performance.now()`
   pair around a single `mountApp({appDir: APP, screen: "sessions"})` +
   `settle()`, run three times, and the median written into this file below;
   plus a counter per reduce, asserted at **`stitch` 2 and `rollup` 3** on a
   cold dashboard (*The wake graph*). The comparison already in hand is chess's
   board at min 75 ms / median 134 ms / max 513 ms (preamble). If a plausible
   mount+settle over the 1 200-hit seed lands within ~5× of chess's median,
   stage 11's sweep is seconds and one mount per case is fine. Past that,
   stage 11 drives one mount through forms across all cursor positions instead
   of remounting, and the decision belongs **here**, not at stage 11 where the
   sweep is already written. Record the measurement even when it is comfortable:
   stage 5's rollup adds four panels and a projection on top of it.

**Traps.**

- **The seat wakes when its own region's read changes, and at no other time.**
  The whole graph is above, in *The wake graph*; do not derive a second one
  here. What bites inside this stage: `stitch` rides one `corpus?id=eq.the`
  list-of-one per screen, and `state.items` on that region is the `Corpus` row
  — so the reduce must read the log out of `state.rows.event` and never out of
  `state.items`. The same handler on a different region gets different `items`,
  which is exactly how a reduce comes to work on one screen and not another.
- Put the seat **on** the `[data-live]` region, never one level above it:
  `bindTree` starts at the region and walks down (screen.js:1668-1676), so a
  handler one level up still resolves and the control is silently dead under the
  finger. That bug shipped in `apps/truco`.
- Regions sharing a seat must agree **byte for byte** on the
  `data-on-mutation` value, on `data-reads` **in declared order**, and on every
  `data-read-*` name and value: the key is `[handler, ...reads,
  ...sorted("name=value")]` NUL-joined (screen.js:1951-1957). Only the
  `data-read-*` set is sorted. A reordered `data-reads` and a stray space are
  the same bug — two seats where the markup says one — and each runs the reduce
  over a world missing the other's writes. Generate the string once in CUE and
  interpolate it.
- **Recompute absolutely, write differentially, and delete what is absent.** A
  pass that changes nothing writes nothing and therefore does not re-wake — the
  fixpoint is structural. `apps/chess/shell/handlers/referee.js` is the
  reference. `STEPS = 8` caps a reduce's `then` chain, not its wakes; neither
  reduce here returns a `then`, so `handler chain did not settle` cannot be this
  app's failure. The wake bound is `settle()`'s 500 turns.
- **State `corpus` last.** `applyUpdates` walks the `updates` array in order,
  batching only *consecutive* runs of the same op against the same collection
  (screen.js:1560-1573), so the order stated is the order written. `session`,
  then `session_hour`, then `corpus` — because *The wake graph* spends the
  `corpus` write as the signal that every derived visit row has landed, and
  `rollup` re-runs on it. Reordering these three silently gives `rollup` a
  partial world with no second wake to correct it.
- `op` is required on every update and is never inferred. There is **no
  `post`**: a reduce may only write where it can name the key, which is why a
  session's id is `<visitor>#<ord>` and a session-hour's is
  `<session_id>@<hour>`.
- Neither reduce gets an `if (event.type === "refused")` branch, because at
  `tab` tier nothing can refuse. A refusal is a `NonRetriableError` off the
  mutation round trip (screen.js:1586-1591, data-crud.js:135); a browser-tier
  collection makes no round trip and runs no predicate, so the branch would be a
  dead path nobody notices. Each reduce instead wraps its own arithmetic in a
  `try`/`catch` and, on a catch, **returns** a single `Fold.error` patch and no
  sink writes — a throw would lose the update, since a reduce's writes *are* its
  return value. See stage 9.
- Denied in the compartment: `window document globalThis fetch XMLHttpRequest
  WebSocket eval Function import require Date Math.random plv8 this`. `Math`
  itself is available — only `Math.random` is denied — so `Math.floor`,
  `Math.round` and `Math.max` are the arithmetic.
- The module's **last top-level expression is its value**, and it must be an
  arrow function. `const reduce = (s, e) => …;` with no trailing bare
  expression fails as `completion:other`.
- `stitch.js` must never read the sidecar, and structurally cannot: no entity
  declares it, so it is in no `state.rows`.
- `/log` renders every column of `Event` and `/sessions` renders every column
  of `Session` and `SessionHour`. This is the no-test-only-surface property —
  DuckDB grades exactly the rows the app shows — and it is also what keeps a
  column from becoming the fossil nothing lints.

---

## Stage 5 — `rollup`'s numeric half, and the dashboard's skeleton

**Produces.** `shell/handlers/rollup.js` (top line, buckets, ticks, scale,
corpus-independent); `shell/screens/index.html|css` (`/`) and
`shell/screens/dash.html|css` (`/f/:preset`), with the seven top-line cells, the
range and granularity pickers, and the bucket table — but not yet the drawing,
not yet the panels.

`rollup` reads the fourteen tables *The wake graph* spells in Seat R's
`data-reads`, plus the one `Filter` row `data-read-cursor` puts in
`state.rows.cursor`, and writes `topline, bucket, tick, scale, breakdown, chip`.
It computes only the **active** cursor position and deletes every row it did not
recompute, which is what makes the write total and keeps `Breakdown` bounded.

The active position is `state.rows.cursor[0]` and nothing else — every field of
it, with no composition and no branch (*The cursor contract*). That is the whole
of how a route parameter reaches the arithmetic: there is no write on route
entry, and `rollup` never writes `Filter`. A run where `state.rows.cursor` is
not exactly one row is a broken precondition and throws; it cannot happen,
because the eleven rows are seeded and `/f/:preset` only resolves for a route whose
`filter_set` twin exists.

The arithmetic, each transcribed beside the published expression it implements:
visitors as a distinct count of `visitor` over the matching hits; visits as a
distinct count of matching sessions, bucketed by **start** at day/week and
counted from `SessionHour` at hour granularity; page views and events as sums;
`views_per_visit` from `pv_sum / sessions_n` at two decimals; `bounce_rate`
from `bounce_n / bounce_denom` at a whole percent with the divisor rebuilt on
entry page under a page filter; `visit_duration` from `dur_sum / sessions_n` at
whole seconds with zero-duration visits kept in.

**Proves it.** `questions.test.ts` restricted to the top-line and graph
blocks; `sweep.test.ts` restricted to `Topline`, `Bucket` and `Tick`,
cardinality first.

**Traps.**

- **One top-level region per screen, always.** `data-state` is set by whichever
  top-level region refreshed last, and two of them overwrite each other
  last-writer-wins — `apps/xpense` shipped a first-run pose reading "every
  category deleted" over four visible categories. The shape that gives it is in
  *The screen shape*: a **list of one row** as the root, everything else nested
  inside its item template. On `/f/:preset` the root row is the `FilterSet` row
  the route names, which hands `{range}`, `{grain}` and every `f_*` to every
  child for free; on `/` it is the `Corpus` row.
- Never key a runtime pose on `data-state`. Key it on the region's own DOM.
- A **slot** is a region with no item template and binds at most one row; its
  filter must pin a pk, a unique field, or every column of a declared unique.
  `limit=1` is **not** a witness. `Topline` and `Scale` are pinned `id=eq.the`;
  `Chip`'s per-slot regions are pinned on the declared unique `slot`. Each is a
  **leaf** — a slot hydrates no nested region, so nothing may nest inside one.
  `Filter` and `Corpus` are *not* slots here: they are the one-row lists that
  carry the seats, because a slot fires its seat only when its row exists
  (screen.js:2597-2604) while a list fires unconditionally.
- Item templates are collected with `region.querySelectorAll(…)` — **scoped to
  the region's subtree, and it does not descend into another `<template>`'s
  content**. So a region nested inside an item template is invisible to its
  parent and costs nothing, while a `[data-live]` sitting as a *static child*
  hands its template to the parent and turns the parent into a list of the
  child's shape. Both readings are measured in *The screen shape*; the
  consequence is the same rule either way — nothing nests except inside an item
  template.
- Where a template is shared between regions, declare it at screen root as
  `<template data-item data-name="…">` and reference it with `data-template="…"`.
  A region's render sweeps every child that is not one of its rows, its own
  inline template included, but `namedTemplates` is collected before any region
  hydrates (screen.js:1074-1080), so the Map survives the sweep.
- An item template holds **exactly one** element.
- `data-filter` may only sit on a tag that also carries `data-live` or
  `data-entity`; every filter column must be a field of its table; every table
  a screen reads must be a declared entity and must be in the screen's `reads`.
- A region's own `data-filter` / `data-order` / `data-project` `eq` value
  interpolates the **enclosing** row, not its own. This is the single largest
  source of both false positives and real bugs.
- `data-order` is read **raw** — no column interpolates into it. The only
  variable order is the closed map form `{"by":"{col}","of":{…}}`, and only a
  key interpolates.
- `data-project`'s lane clauses (`next`/`prev`/`first`/`last`) answer **ids and
  positions, never the neighbour's columns**. The graph line's next-bucket
  height is therefore a real column the fold maintains, not a projection.
- A region carrying `data-project` forces `dirty = null`, so it re-binds every
  row on every pass (screen.js:2432-2433). At ≤28 buckets and ≤9 collapsed panel
  rows that is small — against the mount cost stage 4 measured, not in the
  abstract. If stage 4's number was uncomfortable, re-measure with the panels on.
- `/f/:preset` and `/f/:preset/:panel` carry `strip: false` (a parametrized route
  has no static href) and `keep: 0` (a held instance per param ever visited is
  pure cost, and the first-run state is the point).
- `shell/screens/<name>.css` is **always** author-owned and must exist —
  `write.ts` fails the build without it even for a CUE-authored screen. Every
  rule in it is nested under `[data-screen="<name>"]`, because a screen's
  stylesheet is injected into the head and outlives the screen that brought it.
  An `@import` inside it resolves against `/shell/` and the file must be listed
  in `files.shared` or it is never copied into the image.
- A `var()` naming a token that does not exist makes the **whole declaration**
  invalid and it is dropped silently — a screen with no layout and no error.
  The tokens are `--primary`, not `--color-primary`.

---

## Stage 6 — the panels, the chips, and the drill-down

**Produces.** `rollup`'s breakdown and chip half, including the five `set_*`
columns per `Breakdown` and `Chip` row; the four panel regions on `/f/:preset`;
`shell/screens/panel.html|css` (`/f/:preset/:panel`).

Each breakdown row is a form whose submit button is the row:
`data-entity="filter" data-action="upsert"`, with
`<input name="id" data-value="{param.preset}">` and one hidden input per cursor
slot bound from the row's own `set_*` column. Six inputs, not one — *The cursor
contract* says why: `upsertBy` patches, so a form naming one slot leaves the
other four standing and a reader walks out of the graded space. The drill-down is
a form, not a click. This app has **no
`data-on-click` reduce anywhere** — every mutation is a form and every derivation
is a fold — which removes the whole class of silently dead controls.

`/f/:preset/:panel` is one route with two parameters. `matchRoute` splits both
pattern and path on `/` and fills every `:name` segment
(shell.js:277-287), and `paramPlans` walks each `:` segment independently
(lint.ts:135-166), so the root region pins `id=eq.{param.preset}` on `filter_set`
and the panel region pins `id=eq.{param.panel}` on `panel`. No route in this tree
carries two parameters today; that the matcher takes them is read from the code
above, and stage 12's first act is to open the route and see it fill.

**Proves it.** `questions.test.ts`'s panel block; `sweep.test.ts`'s
`Breakdown` and `Chip` cardinality and values, divisors included.

**Traps.**

- Every button must be reached by one of exactly three seams: a
  `form[data-action]` it can submit, a `data-on-*` at or inside its enclosing
  `[data-live]`, or a region machine that answers its click. A `type="button"`
  reaches no submit listener however deep in a form it sits.
- `data-action="update"` writes to the **enclosing item's** id and an
  `<input name="id">` is ignored for the target. The drill-down forms are
  `upsert` against `Filter` with `id` supplied as `{param.preset}`, precisely to
  avoid this: inside a breakdown item the enclosing id is the *breakdown row's*,
  which is the wrong table entirely.
- `upsertBy` **patches** an existing row with exactly the submitted fields
  (data-crud.js:832-853). It is not a replace, and treating it as one is how the
  reachable cursor space grows past the graded one.
- A hidden input's `data-value` resolves `{param.x}` against the form's context
  (screen.js:1285-1286, 587-591) — `apps/thenote/shell/screens/note.html:23`
  ships it. Every other placeholder in a nested item template resolves against
  **that item's own row**: `{f_source}` inside a breakdown item raises
  `binding {f_source} not in row`, which is why the five slots are `set_*`
  columns the fold writes rather than bindings reached upward.
- A region that declares `data-empty` **always has a child**, so `:empty` never
  matches it — `:has(.rows:empty)` is a predicate the platform can never
  satisfy. Key on `:has(.rows > .empty)`. The chip regions therefore declare
  `data-empty-row` and **no** `data-empty`, so `:empty` is a real probe, and
  their arms are **siblings** of the probe, never children: a control inside a
  probe's template binds against the probe's row.
- A probe reads `:not(:empty)` for one frame before its first sweep, so the
  screen writes `[data-state="loading"] .arms { visibility: hidden }` or an arm
  flashes wrong on first paint.
- A region owns its children absolutely; anything that must survive the sweep
  (a static heading, a `<select>` prompt option) lives outside it.
- A bound **boolean** attribute is absent when the value is empty, so a
  drill-down whose target does not exist binds `disabled` off an empty column
  and reads as an inert row.
- `data-when` values are literals matched against the row; there is no
  expression grammar. If any `data-when` equality is on a discriminant, either
  every enum value has an arm or a default template exists — and a
  DB-defaulted discriminant **requires** the default template.
- `limit=` is a cap applied after ordering, not a column, and `offset` is
  refused.
- The `Chip` id **is** the slot name, because a click carries no payload:
  `event.id` is the row's id and `event.from` is the nearest ancestor DOM id.
  Design the row id to be the datum.

---

## Stage 7 — the chart

**Produces.** the graph region on `/f/:preset`; `rollup`'s `Scale` and `Tick`
writes; `tests/svg.test.ts`.

Four mechanisms, three proven in this tree and one the app is here to
establish:

1. **One column per bucket, on one shared coordinate system.** The region is a
   **leaf slot** over `scale?id=eq.the`, nested inside the root's item template
   — no item template of its own, so nothing is ever cloned into it, and no
   `[data-live]` inside it, because a slot hydrates no nested region. Its static
   child is an authored
   `<svg viewBox="0 0 1000 300" aria-hidden="true">` holding
   `<path class="floor" d="{floor_d}"/>` and then `<path class="columns" d="{path_d}"/>`,
   in that order because a column paints over a mark. `path_d` is one closed column
   per bucket and `floor_d` one mark per bucket that measured nothing, both strings
   the fold computes. This is the design's one
   real bet and it is well-founded: a slot takes the branch that binds
   attributes and texts without sweeping children; `<svg>` in HTML content is the
   parser's own breakout into foreign content, so the subtree is SVG-namespaced;
   `d` is neither a region attribute nor a URL attribute, so it takes the plain
   interpolate path. The `<svg>` element survives every root refresh: the root's
   item node is keyed by row id and survives, so `syncNested` finds this slot
   held with an unmoved filter and calls `restate()` instead of re-hydrating
   (screen.js:2358-2364). **Nothing in the tree has a bound `d` yet.** Write
   `svg.test.ts` first.
2. **The per-row bounce arc.** Inside each breakdown item template,
   `<svg viewBox="0 0 36 36" aria-hidden="true"><circle stroke-dasharray="{arc} 100"/></svg>`.
   A template whose item root *contains* an `<svg>` clones with its namespace
   intact — `apps/chess`'s piece glyph proves it with a bound `href`. What is
   one step past chess here is that the bound attribute carries **geometry**
   rather than a URL reference: `href` travels the URL-attribute stash path,
   `stroke-dasharray` travels the ordinary one. `arc` is a graded `Breakdown`
   column, so even the picture's geometry is on the oracle.
3. **The axis.** Five `Tick` rows from a stated 1/2/5 × 10ᵏ rounding rule over
   `domain_max`, placed absolutely at `bottom: calc(var(--at) * 0.1%)`. The
   rule is written once in `rollup.js` and once, independently, in
   `oracle.sql`. This closes the "computed axis ticks" wall the component
   gallery declares still-not-drawn.
4. **The bars.** `width: calc(var(--share) / 1000 * 100%)` with `--share` bound
   per row and the domain a bound column rather than a compile-time constant.

**Proves it.** `svg.test.ts`; the graph block of `questions.test.ts`; and — the
part no test tier below a browser can see — the platform playwright check in
D6.

**Traps.**

- **A `<template>` authored inside an `<svg>` is an `SVGElement` with no
  `.content`**, and hydrating that region throws a `TypeError`. An
  `<svg data-live>` region does not mis-render; it crashes. Never put
  `data-live` on an `<svg>`.
- A bare `<rect>`/`<g>`/`<circle>` as an HTML template's item root parses as
  `HTMLUnknownElement` in the XHTML namespace and, cloned into an `<svg>`, has
  a 0×0 box and paints nothing. Only a whole `<svg>` as (or inside) the item
  root works.
- **linkedom serializes a wrong-namespace element and a clipped-to-nothing
  element identically to a correct one.** The whole-screen tier and the visual
  battery both pass on a blank chart. This is why D6 exists.
- The renderer role cannot rescue any of it: its tag allowlist excludes
  `svg`/`math` by decision and it refuses `style` and every `data-*`.
- Under `grid-auto-flow: column` + `grid-auto-columns: 1fr`, a `display: none`
  child removes a **track** and every surviving cell widens. Nothing on the
  graph row may be conditionally hidden.
- Use container queries, not viewport units: `container-type: inline-size`
  establishes no block-axis container, so `vh` inside a storybook frame
  resolves against the board.
- **No perpetual animation.** A perpetually moving element makes the visual
  battery report the route as still moving after 2500 ms, blinding every check
  below it, because `settle()` fingerprints the geometry of every element. The
  current-visitors pulse runs on a **pseudo-element**, which the fingerprint
  does not walk.
- **The caret rides `Scale`, not the point it is on** (ir decision-23). Both
  obvious spellings hit a wall, and both were found by performing them.
  `data-rove` puts the tabstop on the point row and `rove()` counts a row on its
  way out (screen.js:2502-2517, 2548): pick a range whose axis is shorter than
  the caret's ordinal and the departing row still reads `data-rove="true"` beside
  the arriving one, so the refresh throws *a set has one current member* on
  correct app code. Pinning the readout on `bucket?id=eq.{active_bucket}` fails
  the other way: when the window stops holding that point the slot branch calls
  `clearBindings`, which restores the region's attribute templates — the filter
  placeholder stands there unresolved, the hidden inputs lose their
  `data-value`, and the arrows write nothing with no error anywhere. So the
  readout is the **one** tabstop, hung on `scale?id=eq.the` whose read
  interpolates nothing; `caret_prev` and `caret_next` are fold-written columns
  and an end names itself, so the graph does not wrap; and the points carry
  `on_caret` as an ordinary bound attribute. `aria-activedescendant` names the
  point's element, which is APG's other focus model.
- Decline `data-focus`: it requires a chart hearing `focusin`, and without one a
  reader who tabs away is dragged back on every refresh.
- The shared layer owns the palette; a screen may only **consume** a token with
  `var()`. Two copies of a colour is a fork finding, and it counts inside a
  dark-appearance block, which is where a fork hides.
- Every geometry custom property carries a fold-computed, store-validated
  number, never a string out of the log. Nothing validates the channel, and a
  value carrying its own `;` is a second declaration nobody wrote.

---

## Stage 8 — the two pickers, and the machine they cannot be

**Produces.** the two window pickers. The design was two parallel `data-machine`
charts on one `filter?id=eq.{param.preset}` **list-of-one** region, nested inside
the dashboard's root item template: one chart over `range`, one over `grain`,
with state names that ARE the column values and each transition
`click@<dom-id>`-narrowed to a sibling button's id.

**The app ships no chart at all, and that is the stage's finding** (ir
decision-22). A chart's `click@<dom-id>` is resolved by the wiring lint as a
LITERAL id, so no chart can answer a button GENERATED from rows — and "the legal
pairs are rows" (ir decision-17) and "the transitions are narrowed to
affordances" turn out to be mutually exclusive at this tier. The rows win: an
illegal pair has no button to narrow to, and both pickers are forms over the live
cursor row like every other mutation in the app. What it costs is the platform's
own `machines` check, named under *Proves it* below, which the app forfeits
whole. Everything from here to the traps is the shape the region keeps whether or
not a chart sits on it, and it is why the region is still a list of one.

It is a *second* region over `filter`, beside Seat R's ear —
`board.html:52-60`'s reason: the writer of this row and the reader of it stay
visibly apart. A list rather than a slot for two reasons that both matter.
`wireEvents` wires machines on every refresh in both branches, and a chart reads
its current state from `_prontoMachineRow ?? state.items[0]` (screen.js:1802,
1830), so a list of one answers exactly as a slot does — while only a list
hydrates the nested region the granularity buttons need. Its item template holds
the range buttons, generated from the **five** `Range` rows — the fifth is
`custom_dst_day`, and it is the only way a reader reaches the 23-hour day on an
hourly axis — and a nested `grain?range=eq.{range}` list over the **seven**
`Grain` rows whose items are the granularity buttons: `{range}`
interpolates the **enclosing** row, which here is the live `Filter` row, and
`syncNested` re-hydrates that list whenever the value moves
(screen.js:2344-2363). That is how the legal-pairs rule stays a row and not a
guard.

**Proves it.** `just test` runs the platform's `machines` check, which walks
every arrow of every emitted chart and cross-checks where it lands against
XState. With no chart emitted it has nothing to walk, so it passes on an empty
set: that is the cost decision-22 states, and the reason the check's green here
is not evidence of anything. What replaces it is the sweep, which reaches every
legal `(range, grain)` pair by pressing the buttons the rows generated.

**Traps.**

- `data-machine` requires `data-live` on the **same tag** and is read from
  `region.dataset` and nowhere else. It is vetted against the published
  `#Machine` by `cue vet` at derive; a local restatement is not accepted.
- Parallel charts on one region must hold **disjoint** columns — the state
  field counts. `range` and `grain` are disjoint.
- `fallbackRow` synthesis is the **slot** branch's alone (screen.js:2093-2111),
  so a machine on a list region has no fallback and its row must be seeded.
  These eleven are. The corollary is that `data-empty-row` has no job here and
  declaring one would be a second statement of the seed.
- `context` may never carry the machine's own field; `initial:` is the
  declaration.
- Every machine state name must be inside the CEL enum of the column it writes.
  Declare `Filter.range` and `Filter.grain` with `cel` enums and keep them in
  step with `Range` and `Grain`.
- Every `raise` must be handled by some state or root `on:`; every guard and
  non-numeric `after` key must name a module under `shell/handlers/`.
- Derived (`data-project`) columns never reach a transition — the region keeps
  the stored rows for the machine to read.
- Which granularities a range allows is enforced by the `Grain` rows and the
  nested `grain?range=eq.{range}` region's filter, not by a guard. A rule inside
  a handler is not a coverage axis; rows are. An illegal `(range, grain)` pair is
  therefore not merely hidden — its button does not exist, so no transition
  names it.

---

## Stage 9 — the coherence guard

**Produces.** `coherent`, a predicate over one derived row, called by `rollup`
on every row it is about to state, and `tests/coherent.test.ts`.

It asserts a derived row's own arithmetic is internally consistent:
`0 ≤ bounce_rate ≤ 100`; `visitors ≤ visits`; `visit_duration ≥ 0`;
`sessions_n ≥ 0`; `bounce_denom ≥ 0`; and the cross-check
`|views_per_visit × sessions_n − pv_sum| ≤ sessions_n × 0.005`, which compares
two columns the fold reaches by different routes. On a violation `rollup` returns
**one** update — a patch of `Fold.error` naming the row and the failed clause —
and no sink writes at all, so the last coherent numbers stay on screen beside a
visible error rather than being replaced by incoherent ones.

**It lives in the reduce, because there is no store-side predicate to put it
in.** The platform has exactly three Jessie roles — `handler`, `renderer`,
`fold` (jessie.js:37-63) — `#Entity` declares no `validations` field
(schema.cue:125-227), the string "validations" occurs nowhere under `plugins/`,
and `apps/realworld` has no `shell/validations/` directory. Nor could a `tab`
entity reach one: a refusal is a `NonRetriableError` off the mutation round
trip (data-crud.js:135, screen.js:1586-1591), and `write`/`add`/`patch`/
`upsertBy` run no predicate of their own. The fifth rung is a server-tier rung.

So the same guarantee is bought by the writer guarding its own writes. It fails
at the same moment — at write time, in the seat where it happened, before any
test runs — and it costs nothing but a call. What is genuinely lost is the part
a store-side predicate would also cover: a **form's** write. `Filter` is
form-written and ungated, so a malformed cursor is caught by `rollup`'s
arithmetic rather than refused at the door. That is the honest cost and it is
what D10 now asks for.

**Proves it.** `coherent.test.ts` calls the predicate directly over hand-built
rows, one case per clause, including the two boundary rows (`bounce_rate` at 0
and at 100) that must pass. Then: break `rollup`'s divisor in a scratch edit and
mount `/f/:preset`; `Fold.error` names the row and the clause on the dashboard,
and `sweep.test.ts` is still red for the *arithmetic* reason — which is the
point, because a guard that hides a wrong number is worse than no guard.

**Traps.**

- The predicate is called by `rollup`, so it is not a separate served file and
  needs no terminal seam. Inlining it in `rollup.js` is what makes that true: a
  Compartment takes no `import`, and a second module reached by any other route
  is the smuggling D10 describes.
- **Return the error, never throw it.** A reduce's writes are its return value,
  so a throw loses them: it propagates to the seat's `wake`, which logs and sets
  `network-error` (screen.js:1963-1967), and `Fold.error` is never written. The
  refusal has to *be* the update.
- Returning only the `Fold.error` patch means the pass writes no sink, so it
  produces no mutation on any sink and does not re-wake. The fixpoint holds, and
  the error stands until an input changes.
- `Fold` needs a region to be seen on: a leaf slot over `fold?id=eq.rollup`
  inside the dashboard's root item template, rendering `error`. A column no
  screen reads is exactly the fossil D4's reverse anti-join is for.
- A guard that reads anything but the row it is passed is a second reduce. It
  takes one row and returns a clause name or the empty string.

---

## Stage 10 — the specification screen and the question set

**Produces.** the 312 seeded `Question` rows; `shell/screens/spec.html|css`
(`/spec`) with three regions — metrics, ranges × grains, and the questions
grouped by `departs`; `tests/questions.test.ts`; and the eight
`loop: surface: checks:` entries — one per test file: `oracle`, `fixture`,
`stitch`, `coherent`, `svg`, `questions`, `sweep`, `coverage` — declared after
the `#DefaultLoop` unification. `oracle` is on that list because it is the check
that grades the ground truth itself; leaving it off means the app's only
oracle-side red never runs at `just test`. ORACLE.md §5 names the same eight.

**Proves it.** `just test` runs the app's own checks alongside the builtin
`cue vet -c ./...` and the platform's `machines`.

**What driving the roster found.** The value of this stage is not that the 312
rows pass — they did on the first run — it is the four wrong readings that
driving them turned up, each of which had been green in every other check:

1. The 48 covering-array rows read as *"one bucket per local day, per page
   row"*, a **bucketed breakdown this app does not compute**. A panel answers
   the window; where a row names both a panel and a granularity the granularity
   is the cursor's state, and the reading now says so.
2. The four declined bucket-basis rows read as though the app bucketed the
   metric they exist to say it does not. A `declined` row states the absence.
3. H10's three rows described the top line's `visitors` cell and quoted its
   sentence. The figure they are about is **current visitors**, which the
   seven-metric vocabulary cannot name: it has no `Metric` row, and it answers
   `[as_of − 300, as_of)` rather than the range. They now quote the vendor's
   *Current Visitors* paragraph and read the figure the reader sees.
4. `Question.expects` had five values in `program.cue`, four in
   `question-examples.ts` and three in ORACLE.md §2.5. The fifth is
   `unanswered`, and it is the one a `declined` row needs: spelling a decline as
   `zero-by-empty-window` claims the app answers `0`, which is a different claim
   and a checkable one. `shape()` now holds `departs == "declined"` and
   `expects == "unanswered"` equivalent — and runs over the app's own 312 rows
   rather than over the eight worked examples alone, which is where the empty
   note under a departure had been invisible.

And one departure this document did not know it had, in ORACLE.md §6's own
mitigation: the `visitors` sentence had been quoted to its first sentence, and
the paragraph's third says a person visiting on multiple days is counted as
separate visitors. See §6.

**Traps.**

- `cmds` are **argv-shaped and run through nushell**: no `&&`, no shell
  operators. One command per entry.
- In the emitted `.say.yaml`, `builtin: {stop: false}` **alone** silently
  resolves the builtin with **no** cmds — every cmd the builtin should keep must
  be re-declared beside it. `setup` declarations must **append** to the
  builtin's cmds rather than sit as a sibling rule.
- The verb follows what the check **needs**, never what it is about: `lint`
  fails in seconds without executing the app, `test` runs the app's behaviour
  against fixtures with no live service, `integrate` needs the cluster up. All
  eight of these files are `test`.
- Each check is its own rule, so a red `coverage` names itself rather than
  hiding inside a rule that also ran the sweep.
- The command needs `--allow-run=mise` (to reach duckdb) beyond the tree's usual
  shape, and **no `--allow-write` at all**: nothing is written, because the
  oracle reads the committed log directly through `read_json_auto`
  (ORACLE.md §3.1, §5). That is not only economy. `cmds` are argv-shaped and run
  through nushell, which does not expand `$env.TMPDIR` inside a bare word — it
  passes the token through unchanged, and the interpolating spellings are
  `--flag=($env.TMPDIR)` or `$"--flag=($env.TMPDIR)"` — so a temp-directory flag
  is a trap the design does not have to step in. Run the emitted `.say.yaml` rule
  once here rather than trusting any such string.
- `says` and `reads` are rendered in **adjacent cells and never merged**.
  `departs` is reflected as an attribute (`data-departs="{departs}"`) and
  styled, rather than being a `data-when` arm — an attribute plus CSS has
  neither the discriminant-default hazard nor a template per value.
- `Metric.formula` is verbatim and monospace. It is the mitigation named in
  ORACLE.md §6 and it only works if nobody tidies it.
- Drive each question **through the app's own forms** and read the number **off
  the rendered DOM text**, not off the row — that grades the binding and the
  rounding along with the arithmetic.

---

## Stage 11 — the sweep and the coverage anti-joins

**Produces.** `tests/sweep.test.ts`. `tests/coverage.test.ts` and the anti-join
functions in `tests/coverage.ts` are already written (stage 1's ground-truth
half needs them); this stage wires the real `driven` set into them.

**Proves it.** Both green — and the rehearsal is not a manual step here, because
`coverage.test.ts` already **drives each anti-join to red on a doctored input**
and asserts the finding it names. Sixteen of them: a published question nothing
drove, a drive of a question nothing publishes, a rendered number nothing grades,
a number the same shape grades under a different cursor, a panel ranked by the
wrong metric, a panel showing a tenth row, a declined region with no cost stated,
a basis cell declined and forgotten, a vocabulary row no driven question reaches,
a wrong reading no question names, one of the ten going undriven, and a filter
slot no graded number depends on — and four that arrived with `unrendered`, the
third anti-join, which walks the graded space from the oracle's side (ir
decision-21): an app that shows nothing at all, a whole panel that was never
shown, a panel cut to its top three rows, and a time axis rendered in the wrong
order, which both directions catch and neither alone would. Do not add a second
hand-run rehearsal; add a case to that file when a new anti-join arrives.

**The gate witness.** Those sixteen run on a doctored stand-in. What makes the
gate real is that the sweep reads the dashboard's **own** panel copies through
`readDashPanels`, and `breakdownScreens` puts the same breakdown row in the
graded space under both screens — so a panel deleted from `screens.cue` is a
finding rather than a silence. That is the escape this stage was measured
against: before it, deleting the page panel from the source and rebuilding left
the build at a fixpoint, `cue vet` clean, the lint at zero findings, every unit
test passing and the sweep's own numbers byte-identical. Perform it whenever the
sweep's readers change; it is the one rehearsal that runs against the app rather
than against an input.

**Traps.**

- Cardinality is asserted **before** value, per cursor position, on every one
  of `Bucket`, `Breakdown`, `Tick` and `Chip`. A missing row must fail as a
  missing row.
- A cursor position is reached by `mountApp({… screen: "dash", params: {preset}})`
  and then, for a drill-down, by submitting the breakdown row's own form. Never
  by writing `Filter` from the test: the whole point of *The cursor contract* is
  that the reachable space is what the forms can reach, and a test that writes
  the row directly grades a cursor no reader has.
- Whether each position gets its own mount or one mount is driven through forms
  across all of them is **stage 4's measurement**, not a choice made here. If the
  budget said remount, remount; the reachable-closure enumeration is identical
  either way, and only the wall clock differs.
- The sweep is generated from the app's **own** vocabulary rows
  (`m.rows("metric")`, `m.rows("panel")`, …), never from a literal list in the
  test. A literal list is a second copy of the vocabulary and it will drift.
- The `driven` set is module-level and populated through a `drives(...ids)`
  helper, so the forward anti-join sees only questions a case actually ran.
- The reverse anti-join is the app-level stand-in for the platform lint that
  does not exist. Offer it back — see D4.
- Do not let the sweep's coverage substitute for the axis assertion: every
  vocabulary member must appear in at least one **driven** question, not merely
  in the mechanical cross.

---

## Stage 12 — integrate, and the battery's blind spots

**Produces.** a green `just integrate`, and the app's own answer to what the
battery cannot see.

**Proves it.** Two claims, and the second is smaller than the design assumed.

1. The visual battery photographs the four **static** routes — `/`, `/sessions`,
   `/log`, `/spec` — at 1280×900 and 400×900 with no criticals.
2. The two parametrized routes are opened **by hand**, once each:
   `/f/all-28d-day` and `/f/all-28d-day/page`, with the console open. That is
   where the two-parameter route and the `data-read-cursor` seat are seen to
   work in a real browser at all — nothing below the browser can see either —
   and it is the only place D6's geometry question and D11's route question can
   both be answered in one sitting.

**Traps.**

- **The battery cannot resolve a browser-tier route parameter, so neither
  `:preset` nor `:panel` is photographed.** `paramPlans` finds the plan off the
  markup (lint.ts:135-166), but `resolveParams` then fetches the value over
  PostgREST — `GET {base}/crud/{table}?select=…` (check-visual.ts:99-102,
  168-178). An all-`tab` app has no such table, so both params come back
  `unresolved`, each as a `major` finding, and the route is dropped from `live`
  (check-visual.ts:349-365). Only `critical` exits non-zero
  (check-visual.ts:15, 530-535), so `just integrate` is **green with two
  advisories**, and reading that green as coverage is the mistake this trap
  exists to prevent. `apps/chess` has it already: `Game` is
  `durability: "device"` and `/game/:id` pins `id=eq.{param.id}`. See D11.
- A `:param` must still be pinned by some region's `data-filter` as
  `<col>=<op>.{param.x}` terminated by `&` or end-of-string, or it is
  `unplanned` — the same advisory one step earlier. `data-read-*` does **not**
  count: `paramPlans` requires `data-live` and `data-filter` on the same tag.
  Prefer an **`eq`** plan: it is the only one a reader can answer by echoing a
  row's value. `/f/:preset` and `/f/:preset/:panel` pin
  `id=eq.{param.preset}` on the root `filter_set` region, and
  `/f/:preset/:panel` also pins `id=eq.{param.panel}` on its `panel` region.
- A route whose root list-of-one matches no row poses **`empty`**, not `gone`:
  `base = rows.length === 0 ? "empty" : "populated"` in the items branch
  (screen.js:2579), while `gone` is set only in the slot branch
  (screen.js:2603). So every screen declares `empty` in its `states:` and none
  declares `gone`, and the ir needs a storyboard frame per `states:` entry or
  the stage-2 bijection fails.
- A param is scoped to one route. `:preset` and `:panel` are different names on
  purpose, and `lookup` throws `unknown route param` on a screen that does not
  declare the one its markup names (screen.js:299-301).
- `just integrate` on this shape re-declares nothing of its builtin
  (`builtin: {stop: false}`) because the builtin would drive an `integrate`
  service pronto never emits; the visual check drives `compose up -d --wait
  --build launch` itself.
- The emitted visual rule hardcodes `docker compose -p plausible`. **From a git
  worktree that targets the main checkout's stack.** Export
  `COMPOSE_PROJECT_NAME` when running from one.
- 8443 is busy on this machine; export `CADDY_TLS_HOST_PORT=8451` (stage 0).
- What the battery **does** catch that nothing else does: `placeholder-leak` (a
  `{binding}` painted into text), console and page errors, interactive overlap,
  horizontal overflow, constrained images, viewport bounds, touch targets
  ≥ 24 px, focus order, CLS.
- What it does **not**: it measures one settled moment per route, never hovers,
  computes no contrast, and cannot see a control clipped by an
  `overflow: hidden` ancestor. Every chart mechanism in this app is
  namespace-dependent and therefore invisible to it. That is D6.
- The fixture storybook renders `islands: false` and synthesizes no numeric
  values, so the CSS-arithmetic geometry poses approximately there. Do not gate
  a geometry claim on a storybook frame.

---

## Stage 13 — the findings

**Produces.** the write-up the app exists to produce: the ir Decisions naming
each platform question below, the corrections to the record, and the proposed
edits to `plugins/pronto/PENDING.md` — **proposed**, not applied, since this
app does not write outside its own directory.

Three corrections that must be made because the current record is wrong:

1. The browser-tier fold projection is **not** hardcoded to a literal column
   name; `p.projects` is generic and `fold.projects` is a declared schema
   field. The real defects are that `evaluateFold` has **no caller anywhere in
   the tree** and that the projection is a ±1 membership computation which can
   only ever project a *count*. A finding built on a wrong premise is worse
   than no finding.
2. "Dashboard state cannot live in the URL" is wrong as stated. The round trip
   works: a route splits the hash on `/` and *then* decodes each `:param`, the
   navigate form encodes on the way out, and the filter parser decodes on the
   way back — so an arbitrary opaque key survives `%26`, `%3D` and `%2F`. And a
   parameter reaches a reduce without a write, through
   `data-read-<name>="<table>?id=eq.{param.x}"`, which no app in this tree uses
   today. The costs are two: **the key must name a materialized row**, so the
   answerable set is finite and enumerated; and at the browser tier the
   parameter is **unlintable** (D11).
3. "A region cannot render SVG" is one imprecise sentence covering three
   different walls. This app pins all three executably and ships the two narrow
   cases that work, so the line should be rewritten as three.

---

# The platform decisions this app forces

Each is a question the app cannot answer by itself, with the answer this build
recommends.

### D1 — Is `#Pipeline.fold` retired, or wired to the consumer that now exists?

**Recommend: wire it, and record the law-level finding separately.**

`evaluateFold` has exactly one occurrence in `plugins/` and `apps/` — its own
definition. The projection the browser tier actually runs computes
`others + intent` where `intent` is a ±1 membership test, so `result()` never
runs and a duration fold's quotient is unreachable. Wiring it is about sixty
lines: load the module through `evaluateFold`, compute
`result(combine(sinkRow, foldOver(uncounted)))`, and let the existing count
case become that fold's own `step`.

Separately, and worth more than the consumer: **the seat's stated law cannot
express the most important metric in analytics.** The law is that the
accumulator *is* the sink row, so a sink reads back as a partial fold.
`visitors` is a distinct count; a distinct accumulator is a set; a bounded row
cannot carry one. This app is the worked case, and the finding costs one
Decision to state.

Note also which seat is which. "The browser-tier fold seat has no consumer" is
ambiguous between the `data-on-mutation` reduce — which is alive, and which
chess, truco and jsfb already consume — and `#Pipeline.fold`, which is dead.
This app consumes the first and declares the second unreachable.

### D2 — Does `#Entity` want a `fixture: {src, sha256}` seat?

**Recommend: yes, ~50 lines.** `#Entity.seed` lives inside `program.cue` and is
the only declared home for rows a store holds before anyone writes. This app
gets a single artifact via `@embed`, which works, but the 1 200 rows still land
in `shell.yaml` — measured here, `cue export --out yaml` of the embedded log is
208 329 bytes, about fifty times chess's whole 4 031-byte manifest — and are
restated on every open. A declared `fixture` seat would emit a numbered `COPY` migration at
server tiers, a `fixtures:` entry in `shell.yaml` the harness reads at the
browser tier, and a lint on the hash — one file for both tiers, for every
future oracle app.

### D3 — Does `#Pipeline.trigger` want a `batch` value?

**Recommend: yes, but this app only states it.** `trigger` has two values.
`cdc` fires per bus event, which for an event log is quadratic and, when the
fixture rides initdb, fires for nothing at all because the migrations run
before the CDC connector attaches. `schedule` only DELETEs or PATCHes rows a
filter matches and cannot aggregate. Neither describes a periodic recompute
over an absolute re-read, which is what all four aggregate-carrying apps in this
tree actually do. `batch` with an `interval`, emitting the ordinary pipeline
shape with a `generate` input, is about thirty lines. This app declares no
pipelines, so it contributes the finding and not the change.

### D4 — Should the reverse anti-join become a platform lint?

**Recommend: yes, ~20 warning-severity lines.** Derivation already knows every
`{col}` binding per screen and every entity's field set, so "a materialized
column no screen reads" is an anti-join in `invariants.sql` at warning
severity. The tree's standing example is a chart's neighbour-value column
seeded on every row of a table that declares no such field. With nineteen
entities and nine of them reduce-written, this app has the largest fossil
surface any app here has shipped, and `coverage.test.ts` is only its local
answer.

### D5 — Should the build fingerprint grow `fixtures/**`?

**Recommend: yes for the build target; state the hole either way.** The build
target's srcs are the literal list `["program.cue", "ir.html",
"acceptance.md", "shell/**", "pipelines/**"]` and the test target's are
`["program.cue"]` alone. `@embed`ing a file outside that list means a fixture
change does not invalidate the container build, and a rewritten `oracle.sql`
does not invalidate the test target. Nothing breaks today because these checks
run on the host, but the fingerprint is wrong and the next person will find it
as a stale cached pass.

### D6 — Where does a browser-tier geometry assertion live?

**Recommend: `plugins/omnishell/playwright-tests/`, as a platform file, and
this app does not write it.** linkedom cannot tell a wrong-namespace element,
or one clipped to nothing, from a correct one, so every chart mechanism in this
app is green at every tier below a real browser. The assertion is small — a
line segment, a tick and an arc each have a non-zero painted box — and
Playwright lives at the workspace root only. If that placement is refused, the
fallback is an app-declared `integrate` check running a small script beside the
existing battery, which is worse because it duplicates the battery's setup.

### D7 — Does `#Entity.writers` want a third value?

**Recommend: yes, eventually; state it now.** The enum is `forms | pipeline`,
so `Session`, `SessionHour`, `Corpus`, `Topline`, `Bucket`, `Tick`, `Scale`,
`Breakdown` and `Chip` are indistinguishable in the schema from tables a reader
can write, and nothing at the browser tier enforces that a fold sink is
fold-only. Nine reduce-written entities in one app is the clearest case this
tree will have produced.

### D8 — Does a region need a namespace-aware clone?

**Recommend: no, not yet — rewrite the line instead.** The fix is real and
small (re-parse a pseudo-template's content into an `<svg>` shim at the two
`.content` sites, detach the non-inert original, and branch the `data-empty`
path onto `createElementNS` because `className` on an `SVGElement` is a
read-only `SVGAnimatedString` and a `<p>` inside an `<svg>` is invisible). But
this app draws a real polyline, a real area fill and a real labelled axis over
one shared coordinate system **with no platform change**, by putting the
`<svg>` in a slot region and binding its `d`. The wall that remains is
narrower: one `<svg>` per row is available, one `<svg>` canvas whose *children*
are per-row is not. Rewrite PENDING's one sentence as three and let a genuine
consumer force the clone.

### D9 — Does the terminal want a per-app timezone?

**Recommend: no.** The only timestamp formatter is fixed to UTC, deliberately,
so that the date-time connector cannot vary between engines. A per-app timezone
in a binding would be a second spelling of a fact the app already states as
`Zone` rows — and the rows are the better answer, because they are *graded*
against a real tz database while a formatter's output would not be. Record the
decision; change nothing.

### D10 — The browser tier has no validation seam, and the terminal cannot serve one

**Recommend: add the role, the entity field, the store hook and the static
branch together — and until then, an app's writer guards its own writes.**
Stage 9 ships on that; nothing here blocks it.

Three separate absences, each verified:

1. **No role.** `ROLES` in `plugins/omnishell/interpreter/jessie.js:37-63`
   declares `handler`, `renderer` and `fold`. `evaluateRole` throws
   `unknown Jessie role` on anything else.
2. **No field.** `#Entity` (`plugins/pronto/schema.cue:125-227`) declares
   `invariant`, `checks` and `uniques`, and no `validations`. The string
   "validations" occurs **nowhere** under `plugins/`, and `apps/realworld` has
   no `shell/validations/` directory, no `validations:` key in its
   `shell/shell.yaml` (353 lines total, so no line 359), and no such entry in
   its `.pronto/manifest.json`.
3. **No store hook.** `write`, `add`, `patch` and `upsertBy`
   (`data-crud.js:759-853`) run no predicate. A refusal is a
   `NonRetriableError` off the mutation round trip (`data-crud.js:135`), and an
   all-`tab` app makes no round trip. So even with a role and a field, the
   optimistic check has nowhere to run.

**And the terminal could not carry the module if the other three landed**, which
is the finding's sharpest half. `#DefaultTerminal` (`plugins/pronto/emit.cue:634-657`)
sets `screens`, `handlers`, `shared`, `folds` and `units` **concretely**, so an
app cannot append to any of them — CUE refuses on list length:

```
$ mise exec -- cue eval t.cue     # #DefaultTerminal's shape, then an app appending
a.shared: incompatible list lengths (0 and 1)
```

`renderers` is appendable only because `#DefaultTerminal` leaves it unset, which
is why `apps/chess/program.cue:721` can write
`terminal: surface: renderers: [...]`. And `#Screen.files.shared` is typed
`[...string & =~"^shell/shared/.*\\.css$"]` (`schema.cue:428`) — CSS only, so a
`.js` cannot ride it either.

The one seam that does work, verified, is the cluster's: `#DefaultCluster` takes
`statics` as an input and concatenates it with the ladder
(`emit.cue:682-686`), and `X.meta.statics` drives both the Dockerfile `COPY`
lines (`libraries/mecha/cluster.cue:390-397`) and the compose develop-watch
entries (`cluster.cue:168`). Every app already passes
`statics: terminal.surface.statics`, so an app appends:

```cue
cluster: (pronto.#DefaultCluster & {"code": code, statics: terminal.surface.statics + [{
	source: "validation-coherent"
	file:   "shell/validations/coherent.js"
	target: "/srv/shell/validations/coherent.js"
	watch:  true
}]}).out
```

That an app must reach around the *terminal* into the *cluster's* static list to
serve a Jessie module the terminal is the authority on is the shape of the
finding: the terminal's `statics` list is closed to the app while the cluster's
is open, and the two are the same list. `renderers` proves the same gap from the
other side — it is served only because it is *ungathered*, so an app that
declares `files.renderers` on a screen and forgets the terminal line gets a
404 with nothing to catch it. The fix is one shape for all of them:
`#DefaultTerminal` gathers `e.validations[*].src` and `s.files.renderers` the
way it already gathers `s.files.handlers`, and the surface lists stay open for
an app to extend.

Stage 9 needs none of it: `coherent` is a predicate `rollup` calls, so there is
no module to serve. What is lost is what only a store-side predicate could
cover — a **form's** write — and that is the cost this decision is asking to
buy back.

### D11 — How does a browser-tier route parameter get linted?

**Recommend: resolve a browser-tier param from `shell.yaml`'s own `seed:`,
~15 lines, and this app does not write it.**

`check-visual` plans every `:param` off the markup and then resolves its value
over PostgREST: `GET {base}/crud/{table}?select=…&limit=1`
(`check-visual.ts:99-102, 168-178`). A `tab` or `device` entity has no table
there, so the fetch throws, the param lands in `unresolved`, and the route is
dropped from `live` (`check-visual.ts:349-365`). Because only `critical` exits
non-zero (`check-visual.ts:15, 530-535`), the check reports two advisories and
stays green — so the app's most important routes go unphotographed and the
transcript says so in a line nobody reads.

`apps/chess` has carried this since it shipped: `Game` is
`durability: "device"` and `/game/:id` pins `id=eq.{param.id}`, so `/game/:id`
has never been in the battery. This app has eleven cursors and four panels behind
two parameters, which makes it the case that forces the question.

The value is already in the tree the check is reading: `shell.yaml` carries
`seed:` for every browser-tier collection, and `appSeed`
(`screen-harness.ts:1110`) is the existing reader. The rule is the same as the
PostgREST one — take the first seeded row whose planned column is set — and the
severity should rise with it: once a browser-tier param *can* be resolved, an
unresolved one is a real hole rather than a tier mismatch.
