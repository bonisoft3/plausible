// The gesture vocabulary: how a test moves this app the way a finger does, and
// how it reads what the app then shows.
//
// Every file that drives the app shares these, because a second copy of
// `pickGrain` is a second definition of what a legal pair is — and the one in
// the copy that drifts would reach a granularity the app does not offer while
// still reporting green.
import { type El, type Mounted, type Row, appCollections, appSeed, mountApp } from "../../../plugins/omnishell/test/screen-harness.ts";
import { APP } from "./ground-truth.ts";
import { cursorId, SLOTS } from "./coverage.ts";

export const txt = (v: unknown) => String(v ?? "");

/** `El` carries `querySelectorAll` and `getAttribute` and no more, so these are
 * the whole DOM vocabulary a driving test reads through. */
export const qa = (el: El, selector: string): El[] => [...el.querySelectorAll(selector)];
export const attr = (el: El, name: string): string => txt(el.getAttribute(name));
export const textOf = (el: El | undefined): string => (el?.textContent ?? "").trim();

/** The collections the app declares but does not seed, as empty tables. A mount
 * that omits one gets whatever the harness defaults to; naming them all keeps a
 * cold mount cold. */
export const empties = async (): Promise<Record<string, Row[]>> => {
  const seeded = new Set(Object.keys(await appSeed(APP)));
  const out: Record<string, Row[]> = {};
  for (const t of await appCollections(APP)) if (!seeded.has(t)) out[t] = [];
  return out;
};

/** Submit one form, the way a finger does. The button is inside the form, so the
 * gesture the interpreter hears is the form's own submit. */
export const submit = async (m: Mounted, form: El) => {
  m.fire(form, "submit");
  await m.settle();
};

/** Move the window by pressing the range row's own button, which states the
 * whole pair — the range and the granularity that range opens on. */
export const pickRange = async (m: Mounted, range: string, ranges: Row[]) => {
  const at = ranges.findIndex((r) => txt(r.id) === range);
  if (at < 0) throw new Error(`no Range row ${range}`);
  const forms = m.all(".ranges form");
  if (forms.length !== ranges.length) {
    throw new Error(`${forms.length} range buttons for ${ranges.length} Range rows`);
  }
  await submit(m, forms[at]);
};

/** Move the granularity by pressing a button the nested legal-pairs list
 * rendered. An illegal pair has no button, so this throws rather than reaching
 * one. */
export const pickGrain = async (m: Mounted, grain: string) => {
  const button = m.all(".grains form button").find((b) => textOf(b) === grain);
  if (button === undefined) {
    throw new Error(`no granularity button for ${grain}; the pair is not one the Grain rows admit`);
  }
  // The button's own form, not the form at the button's index: the two lists
  // correspond only while every form holds exactly one button, and a form that
  // grew a second would shift every later index onto a different granularity.
  const form = button.closest("form");
  if (form === null) throw new Error(`the granularity button for ${grain} stands in no form`);
  await submit(m, form);
};

/** The segment a picker has marked, read off the rendered control. Exactly one,
 * because the mark is a column the fold stamps over a whole vocabulary: none
 * marked is a picker that cannot say where it is standing, and two marked is
 * worse — it says two things. */
const marked = (m: Mounted, selector: string, what: string): string => {
  const on = m.all(selector).filter((b) => attr(b, "aria-current") === "true");
  if (on.length !== 1) throw new Error(`${on.length} ${what} segments carry the mark, not one`);
  return textOf(on[0]);
};

/** The range the range picker says is in force, as its own label. */
export const markedRange = (m: Mounted): string => marked(m, ".ranges button", "range");

/** The granularity the granularity picker says is in force. */
export const markedGrain = (m: Mounted): string => marked(m, ".grains button", "granularity");

/** The window the cursor seat says the figures on screen were computed over, as
 * the two words it prints. */
export const seatWindow = (m: Mounted): string[] =>
  [".window-range", ".window-grain"].map((s) => textOf(m.all(`.rollup-cursor ${s}`)[0]));

/** The cursor the screen is standing on, read off the live row the reader's
 * gestures have been moving. It is the app's own answer to "where am I", spelled
 * the way `oracle.sql`'s `cursor_id` spells it. */
export const cursorOf = (m: Mounted, preset: string): string => {
  const row = m.rows("filter").find((r) => txt(r.id) === preset);
  if (row === undefined) throw new Error(`no live cursor row for ${preset}`);
  const slot = {} as Record<(typeof SLOTS)[number], string>;
  for (const s of SLOTS) slot[s] = txt(row[s]);
  return cursorId(slot);
};

/** Which panel a rendered rows-list is showing, off the PostgREST filter the
 * region states. Readers ask the DOM rather than the loop index, because a panel
 * that rendered under the wrong heading is a defect and an index cannot see
 * it. */
export const panelOf = (list: El): string =>
  attr(list, "data-filter").replace(/^panel=eq\./, "").replace(/&.*$/, "");

export type Vocabulary = {
  presets: string[];
  ranges: Row[];
  /** the legal (range, granularity) pairs, in the order the rows state them */
  pairs: [string, string][];
  panels: string[];
};

/** The app's own vocabularies, off one settled mount. Never a literal list in a
 * test: a literal is a second copy of the vocabulary and it drifts. */
export const vocabulary = async (base: Record<string, Row[]>): Promise<Vocabulary> => {
  const m = await mountApp({ appDir: APP, screen: "dash", params: { preset: "none" }, tables: base, seed: 1 });
  await m.settle();
  const by = (rows: Row[]) => rows.slice().sort((a, b) => Number(a.pos) - Number(b.pos));
  const out: Vocabulary = {
    presets: by(m.rows("filter_set")).map((r) => txt(r.id)),
    ranges: by(m.rows("range")),
    pairs: by(m.rows("grain")).map((r) => [txt(r.range), txt(r.grain)] as [string, string]),
    panels: by(m.rows("panel")).map((r) => txt(r.id)),
  };
  await m.stop();
  return out;
};
