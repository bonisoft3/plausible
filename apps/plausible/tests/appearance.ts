// The appearance check: ir test-appearance, driven.
//
//   deno run -A --unsafely-ignore-certificate-errors tests/appearance.ts .
//
// Declared as an integrate check in program.cue, because these claims can
// only be measured on a laid-out page and the app's other eight checks run
// against a linkedom mount, which computes no style and lays nothing out. The
// platform's own visual battery runs beside it and answers a different
// question: it measures the terminal's rendering invariants — overflow,
// overlap, mounted widgets — and says nothing about a face, an appearance or a
// bar that grows from zero, which is the whole of what this app's design
// argument rests on.
//
//   loopingAnimations == 0   a bar that grows on every refresh makes two
//                            readings of one number look different, and this
//                            app refreshes every panel whenever a filter moves
//   smallestTarget >= 24     WCAG 2.5.8, and the floor the terminal's chrome
//                            is already built to
//   tabularFigures           every figure in a fixed advance: a column of
//                            proportional digits is read one number at a time
//   horizontalOverflow == 0  the document is never wider than the viewport
//
// The fourth is the only one of the four that is a claim about the PAGE. The
// other three are quantified over elements, and every one of them holds of every
// element on a page that is sliding sideways under the reader, so without it a
// screen whose widest table runs off the right of a phone is photographed and
// reported ok. A sheet too wide for a phone is not a defect; a sheet that takes
// the document with it is, so what is measured is `documentElement.scrollWidth`
// and the blame names the boxes that reach past the viewport without a scroll
// container over them.
//
// Every route, at two widths, in both appearances. The appearance is the
// system's to decide and the app ships no control for it, so `colorScheme` on
// the context is how the twin is reached — the same resolution a reader's
// system performs.
//
// The probe below runs in the page, so this file is typed against the DOM as
// well as against Deno.
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { parse as parseYaml } from "jsr:@std/yaml@1.0.5";
import { baseUrl } from "../../../plugins/omnishell/base-url.ts";

const { chromium } = await import("npm:playwright@1.59.1");

const APP = Deno.args[0] ?? ".";
const TOUCH_MIN = 24;
/** Long enough for a cold mount to stitch 1200 hits and roll the panels. */
const SETTLE_MS = 4000;

type Route = { path: string; screen: string };
type Shell = { routes: Route[]; seed: Record<string, { id: string }[]> };

const shell = parseYaml(await Deno.readTextFile(`${APP}/shell/shell.yaml`)) as Shell;

/** A parametrized route needs a value per `:param`, and the app's own seed is
 * where they come from: a literal here would be a second copy of a vocabulary
 * the program already declares, and it would go on passing after the first one
 * changed. */
const PARAM_SEED: Record<string, string> = { preset: "filter_set", panel: "panel" };
const fill = (path: string): string =>
  path.split("/").map((seg) => {
    if (!seg.startsWith(":")) return seg;
    const table = PARAM_SEED[seg.slice(1)];
    const row = table === undefined ? undefined : shell.seed[table]?.[0];
    if (row === undefined) throw new Error(`no seeded row to resolve :${seg.slice(1)}`);
    return encodeURIComponent(row.id);
  }).join("/");

/** What the page reports about itself, measured in the page because each of
 * these is a computed value the DOM alone does not carry. */
function probe() {
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // A figure is any leaf whose whole text is a quantity — digits and the
  // punctuation a quantity is written with. Probing the shape of the text
  // rather than a list of class names is what keeps this check honest as the
  // screens grow: a figure that arrives in new markup is measured the day it
  // arrives. The two graded attributes are figures whatever they hold.
  const isQuantity = (t: string) => /\d/.test(t) && /^[\d.,:%+\-\s/]+$/.test(t);
  const figures: Element[] = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const graded = el.hasAttribute("data-metric") || el.hasAttribute("data-live-visitors");
    if (el.children.length > 0 && !graded) continue;
    const text = (el.textContent ?? "").trim();
    if (!graded && !isQuantity(text)) continue;
    figures.push(el);
  }
  // The face is the app's own token, read off the root: a family named here
  // would be a second copy of a value the shared stylesheet already declares,
  // and it would go on passing after that one changed.
  const face = getComputedStyle(document.documentElement)
    .getPropertyValue("--face-figure").split(",")[0].trim();
  const notTabular = figures
    .filter((el) => {
      const cs = getComputedStyle(el);
      return !cs.fontVariantNumeric.includes("tabular-nums") ||
        cs.fontFamily.split(",")[0].trim() !== face;
    })
    .map((el) => `${el.tagName.toLowerCase()}.${el.className}="${(el.textContent ?? "").trim().slice(0, 12)}"`);

  // Pointer and keyboard targets both: a focus ring smaller than the floor is
  // as hard to land on with a key as a button is with a thumb.
  let smallest = Infinity;
  let smallestAt = "";
  for (const el of document.querySelectorAll("a[href], button, [tabindex], input:not([type=hidden]), select, textarea")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const side = Math.min(r.width, r.height);
    if (side < smallest) {
      smallest = side;
      smallestAt = `${el.tagName.toLowerCase()}.${el.className}`;
    }
  }

  const looping = document.getAnimations().filter((a) => {
    const it = (a.effect as KeyframeEffect | null)?.getTiming().iterations ?? 1;
    return it === Infinity || it > 100;
  }).length;

  // The document against the viewport, and then the boxes to blame for it. A
  // box under a scroll container is not one of them: a wide sheet inside
  // `overflow-x: auto` reaches past the viewport by design and contributes
  // nothing to the document's own width, so accusing it would make this check
  // unusable on the three screens that carry a sheet.
  const vw = document.documentElement.clientWidth;
  const overflow = Math.max(0, document.documentElement.scrollWidth - vw);
  const clipped = (el: Element): boolean => {
    for (let p = el.parentElement; p !== null; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== "visible") return true;
    }
    return false;
  };
  const past: string[] = [];
  if (overflow > 0) {
    for (const el of document.querySelectorAll("body *")) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right <= vw + 1 || clipped(el)) continue;
      past.push(`${el.tagName.toLowerCase()}.${el.className}@${Math.round(r.right)}px`);
    }
  }

  return {
    figures: figures.length,
    notTabular,
    smallest: smallest === Infinity ? null : Math.round(smallest * 10) / 10,
    smallestAt,
    looping,
    overflow,
    past: past.slice(0, 4),
  };
}

const base = await baseUrl(APP);
const b = await chromium.launch();
/** The two widths the design was reviewed at, which is what makes a green run
 * here mean the same thing a reviewer's screenshot means. 390 is the narrower of
 * the two common phone widths, and the screens' one breakpoint is at 60rem, so a
 * viewport even ten pixels wider answers for a width nobody reads at. */
const VIEWPORTS: [number, number][] = [[1400, 900], [390, 900]];
const SCHEMES = ["light", "dark"] as const;

async function sweep(
  vw: number,
  vh: number,
  scheme: (typeof SCHEMES)[number],
): Promise<{ lines: string[]; findings: number }> {
  const lines: string[] = [];
  let findings = 0;
  const c = await b.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: vw, height: vh },
    colorScheme: scheme,
  });
  const p = await c.newPage();
  for (const route of shell.routes) {
    const path = fill(route.path);
    // Every claim below is a claim about what rendered, and each of them holds
    // vacuously of a page that rendered nothing: no animation, no figure to be
    // proportional, no content to overflow, and a `smallest` of null the fourth
    // disjunct excuses. A 502 from caddy hands back a document, so the response
    // status and a floor on what the page carries are what separate an empty
    // pass from a real one.
    const res = await p.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
    if (res !== null && !res.ok()) {
      throw new Error(`${path} answered ${res.status()}; the appearance of an error page is not this app's`);
    }
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    const got = await p.evaluate(probe);
    const bare = got.figures === 0 || got.smallest === null;
    const bad = bare || got.looping > 0 || got.notTabular.length > 0 || got.overflow > 0 ||
      (got.smallest !== null && got.smallest < TOUCH_MIN);
    if (bad) findings += 1;
    lines.push(
      `${bad ? "FAIL" : "ok  "} ${bare ? "BARE " : ""}${String(vw).padStart(4)}x${vh} ${scheme.padEnd(5)} ${path.padEnd(16)}` +
        ` figures=${String(got.figures).padStart(4)}` +
        ` smallest=${got.smallest === null ? "none" : `${got.smallest}px ${got.smallestAt}`}` +
        ` looping=${got.looping}` +
        ` overflow=${got.overflow}px` +
        (got.past.length ? ` past=[${got.past.join(", ")}]` : "") +
        (got.notTabular.length ? `  proportional=[${got.notTabular.slice(0, 4).join(", ")}]` : ""),
    );
  }
  await c.close();
  return { lines, findings };
}

const swept = await Promise.all(
  VIEWPORTS.flatMap(([vw, vh]) => SCHEMES.map((s) => sweep(vw, vh, s))),
);
for (const s of swept) for (const line of s.lines) console.log(line);
const findings = swept.reduce((n, s) => n + s.findings, 0);
// A sweep over no routes reports no findings, which is the same output as a sweep
// that passed. The count of rows walked is what tells them apart.
const walked = swept.reduce((n, s) => n + s.lines.length, 0);
if (walked === 0) {
  console.log("\nappearance: no route was swept, so nothing was checked");
  Deno.exit(1);
}
await b.close();
console.log(
  findings === 0
    ? "\nappearance: both appearances render, no figure animates, every figure is in a fixed advance, no document is wider than its viewport"
    : `\nappearance: ${findings} route/viewport/appearance combinations failed`,
);
Deno.exit(findings === 0 ? 0 : 1);
