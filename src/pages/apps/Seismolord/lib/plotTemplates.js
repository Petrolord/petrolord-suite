// Prospect-ready picture (upgrade U2-001). Plot templates, the legend of
// what the picture really shows, and the company and analyst a reviewer
// signs against. Pure: SliceView and MapView report what they drew
// (sectionDrawn / the map's own summary), PlotDialog reads the template
// check, the legend and the identity from here.
//
// PL4 (no claim without the event): the legend lists only objects that
// are drawn in the picture being plotted, never the explorer's visible
// list, and a template that is not satisfied says what is missing.

import { EMPTY_VALUE } from '@/lib/emptyValue';
import { wellSectionMarks, DEFAULT_CORRIDOR_CELLS } from './wellDisplay';

const NULL_F32 = Math.fround(1.0e30);

export const PLOT_TEMPLATES = Object.freeze([
  {
    key: 'current',
    label: 'Current view',
    source: null,
    help: 'Plots the chosen window as it is on screen.',
  },
  {
    key: 'section_well',
    label: 'Section with a well',
    source: 'section',
    orientation: 'landscape',
    help: 'An inline, crossline or traverse through a well, with the horizons and faults it crosses.',
  },
  {
    key: 'map_contours_wells',
    label: 'Map with contours and wells',
    source: 'map',
    orientation: 'portrait',
    help: 'A contoured structure map with the well spots and names.',
  },
]);

export const templateByKey = (key) => PLOT_TEMPLATES.find((t) => t.key === key) || PLOT_TEMPLATES[0];

/** Unique by name, first colour wins, drafts and nameless entries dropped. */
function uniqueNamed(list) {
  const seen = new Set();
  const out = [];
  for (const x of list || []) {
    const name = String(x?.name || '').trim();
    if (!name || x.id === '__draft' || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, color: x.color || '#94a3b8', dash: Boolean(x.dash) });
  }
  return out;
}

/**
 * What a section window draws: horizons with at least one live pick on
 * the line, faults with sticks on the line, wells whose path crosses the
 * corridor. Same tests SliceView's overlay pass uses.
 * @param {{overlays: object, orientation: string, sliceIndex: number,
 *   geom: {nIl: number, nXl: number}, positions?: ?Array,
 *   corridor?: ?number}} p
 * @returns {{horizons: Array, faults: Array, wells: Array}}
 */
export function sectionDrawn({
  overlays, orientation, sliceIndex, geom, positions = null, corridor = null,
}) {
  const out = { horizons: [], faults: [], wells: [] };
  if (!overlays || !geom || orientation === 'time') return out;
  const idx = sliceIndex;
  const cellsOnLine = () => {
    if (orientation === 'inline') {
      const a = [];
      for (let x = 0; x < geom.nXl; x++) a.push(idx * geom.nXl + x);
      return a;
    }
    if (orientation === 'xline') {
      const a = [];
      for (let i = 0; i < geom.nIl; i++) a.push(i * geom.nXl + idx);
      return a;
    }
    return (positions || []).map((q) => q.il * geom.nXl + q.xl);
  };
  const cells = cellsOnLine();
  const live = (grid) => {
    if (!grid) return false;
    for (const c of cells) {
      const z = grid[c];
      if (z !== undefined && z !== NULL_F32 && Number.isFinite(z)) return true;
    }
    return false;
  };
  const grids = [...(overlays.horizons || []), ...(overlays.surfaces || [])];
  out.horizons = uniqueNamed(grids.filter((h) => live(h.grid)));

  const nearLine = (q) => {
    if (orientation === 'inline') return Math.abs(q.il - idx) <= 1;
    if (orientation === 'xline') return Math.abs(q.xl - idx) <= 1;
    return (positions || []).some((p) => Math.hypot(p.il - q.il, p.xl - q.xl) <= 1.5);
  };
  out.faults = uniqueNamed((overlays.faults || []).filter((f) => (f.sticks || [])
    .some((st) => (st.points || st).filter(nearLine).length > 1)));

  out.wells = uniqueNamed((overlays.wells || []).filter((w) => {
    if (orientation === 'traverse') {
      return (w.points || []).some((q) => q.s != null && nearLine(q));
    }
    const { path } = wellSectionMarks(w, orientation, idx, corridor ?? DEFAULT_CORRIDOR_CELLS);
    return Boolean(path && path.some((q) => q && q.s != null));
  }));
  return out;
}

/**
 * Does the snapshot satisfy the template? Problems name what is missing
 * and how to get it, in the words of the window.
 * @param {string} key template key
 * @param {?{kind: string, drawn?: object}} snap window snapshot
 * @returns {{ok: boolean, problems: string[]}}
 */
export function templateCheck(key, snap) {
  const t = templateByKey(key);
  const problems = [];
  if (!snap) {
    return {
      ok: false,
      problems: [t.source === 'map' || (!t.source && key === 'map')
        ? 'Open the Map window with a volume loaded first.'
        : 'Open the Section window with a line on screen first.'],
    };
  }
  const d = snap.drawn || {};
  if (t.key === 'section_well') {
    if (snap.kind !== 'section') problems.push('Show an inline, crossline or traverse in the Section window (a time slice has no well track).');
    else if (!d.wells || d.wells.length === 0) {
      problems.push('No well is drawn on this line. Show a well (Wells in the explorer) and move to a line through it, or draw a traverse through it.');
    }
  }
  if (t.key === 'map_contours_wells') {
    if (snap.kind !== 'map') problems.push('The Map window is not open.');
    else {
      if (!d.contours) problems.push('No contours are drawn. Pick a horizon or surface layer in the Map window and turn Contours on in its Layers menu.');
      if (!d.wells || d.wells.length === 0) problems.push('No well is drawn on the map. Show wells in the explorer and turn Wells on in the Layers menu.');
    }
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Legend entries for the picture: horizons, faults, wells, and the
 * contour layer with its interval.
 * @returns {{kind: string, label: string, color: string, dash: boolean}[]}
 */
export function legendEntries(drawn) {
  if (!drawn) return [];
  const rows = [];
  for (const h of drawn.horizons || []) rows.push({ kind: 'horizon', label: h.name, color: h.color, dash: h.dash });
  for (const f of drawn.faults || []) rows.push({ kind: 'fault', label: f.name, color: f.color, dash: false });
  for (const w of drawn.wells || []) rows.push({ kind: 'well', label: w.name, color: w.color, dash: false });
  if (drawn.contours) {
    const c = drawn.contours;
    const step = Number.isFinite(c.step) ? `${Number(c.step).toLocaleString('en-US', { maximumFractionDigits: 3 })}${c.unit ? ` ${c.unit}` : ''}` : EMPTY_VALUE;
    rows.push({
      kind: 'contours', label: `${c.name || 'Contours'}, interval ${step}`, color: '#0f172a', dash: false,
    });
  }
  return rows;
}

export const LEGEND_MM = 46;
export const LEGEND_ROW_MM = 4.2;
const LEGEND_TITLES = {
  horizon: 'Horizons', fault: 'Faults', well: 'Wells', contours: 'Contours',
};

/**
 * Legend layout in paper mm inside its box: a heading per kind, one row
 * per entry, and a count of the rows that do not fit.
 * @returns {{items: {type: 'heading'|'row', y: number, text: string,
 *   color?: string, kind?: string, dash?: boolean}[], omitted: number}}
 */
export function legendLayout(entries, box) {
  const items = [];
  let y = box.y + 5;
  let omitted = 0;
  let lastKind = null;
  const bottom = box.y + box.h - 2;
  for (const e of entries) {
    const needHeading = e.kind !== lastKind;
    const need = (needHeading ? LEGEND_ROW_MM + 1 : 0) + LEGEND_ROW_MM;
    if (y + need > bottom) { omitted += 1; continue; }
    if (needHeading) {
      items.push({ type: 'heading', y, text: LEGEND_TITLES[e.kind] || e.kind });
      y += LEGEND_ROW_MM + 1;
      lastKind = e.kind;
    }
    items.push({
      type: 'row', y, text: e.label, color: e.color, kind: e.kind, dash: e.dash,
    });
    y += LEGEND_ROW_MM;
  }
  return { items, omitted };
}

// ---- company and analyst, saved per user --------------------------------
// Stored in the signed-in user's auth metadata (key below), the existing
// per-user store the Profile page already writes. No schema change; the
// fields follow the user to any machine.

export const PLOT_IDENTITY_KEY = 'seismolord_plot_identity';
const MAX_FIELD = 80;

/** Trim, collapse spaces, drop control characters, cap the length. */
export function normalizePlotIdentity(raw) {
  const clean = (v) => String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FIELD);
  return { company: clean(raw?.company), analyst: clean(raw?.analyst) };
}

/**
 * The saved identity for a user object ({user_metadata}), with the
 * profile display name as the analyst when none was saved yet.
 */
export function identityFromUser(user) {
  const md = user?.user_metadata || {};
  const saved = normalizePlotIdentity(md[PLOT_IDENTITY_KEY] || {});
  return {
    company: saved.company,
    analyst: saved.analyst || normalizePlotIdentity({ analyst: md.display_name }).analyst,
  };
}

/** The default store: supabase auth metadata. Injectable for harnesses. */
export function authIdentityStore(supabase) {
  return {
    async load() {
      const { data } = await supabase.auth.getUser();
      return data?.user ? identityFromUser(data.user) : { company: '', analyst: '' };
    },
    async save(identity) {
      const clean = normalizePlotIdentity(identity);
      const { error } = await supabase.auth.updateUser({ data: { [PLOT_IDENTITY_KEY]: clean } });
      if (error) throw new Error(`Could not save the company and analyst: ${error.message}`);
      return clean;
    },
  };
}
