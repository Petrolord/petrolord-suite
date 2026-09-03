// Layout templates (Petrophysics Studio PS4): the versioned JSON that
// lives in petro_projects.layouts. A template describes tracks by
// CURVE ADDRESS (input:GR through the controller's alias mapping,
// output:PHIE from the pipeline, facies for the strip), so one template
// works across wells with different inventories — resolveTracks drops
// what a well cannot supply. Since 2026-09-03 a curve may also be
// addressed by raw registry mnemonic, `log:A34H`, for measurements the
// alias table does not know or when several logs of one type (say five
// resistivity depths) belong on one track; such curves resolve only on
// wells that carry that mnemonic.
//
// Data shape (version 1):
//   { version, activeTemplateId, templates: [{ id, name, builtin,
//     tracks: [{ id, title, type: 'curves'|'strip', width, scale,
//       min, max,
//       curves: [{ source, label?, color, min?, max?, scale?,
//                  style?, lineWidth?, fillTo? }],
//       fills:  [{ mode: 'crossover', a, b, positiveColor,
//                  negativeColor, opacity }
//               |{ mode: 'threshold', a, threshold: {param}|{value},
//                  side, color, opacity }] }] }] }
// Fill refs a/b are curve ADDRESSES; thresholds bind to a live
// parameter ({param: 'cutPhi'}) or a literal ({value: 0.08}).
//
// Built-in templates are immutable: editing one forks it (the
// clone-on-edit rule lives in updateTemplate).

// v2 (PT6, 2026-09-03): fills gain `ramp` (colour by the curve's own value
// between stops) and threshold gains an optional `color2` for the other
// side; both additive, so v1 templates resolve unchanged. Built-ins:
// density-neutron crossover in the standard colours (gas yellow, shale
// gray) and a new Lithology quicklook.
export const LAYOUTS_VERSION = 2;
export const FILL_MODES = ['threshold', 'crossover', 'ramp'];
export const RAMP_PRESETS = {
  lithology: { label: 'Lithology (clean sand to shale)', stops: [{ value: 15, color: '#f5e6a8' }, { value: 150, color: '#5c3a1e' }] },
};

export const INPUT_SOURCES = ['input:GR', 'input:RHOB', 'input:NPHI', 'input:DT', 'input:RT'];
export const OUTPUT_SOURCES = ['output:PHIE', 'output:VSH', 'output:SW', 'output:PAY', 'output:TEMP', 'output:KPERM', 'output:BVW'];
export const THRESHOLD_PARAMS = ['cutPhi', 'cutVsh', 'cutSw', 'grClean', 'grClay'];

/** The PS1 default set, codified. */
export function buildDefaultTemplates() {
  return [
    {
      id: 'std-triple-combo',
      name: 'Standard triple combo',
      builtin: true,
      tracks: [
        {
          id: 't-gr', title: 'GR (API)', type: 'curves', width: 1, scale: 'linear', min: 0, max: 150,
          curves: [{ source: 'input:GR', label: 'GR', color: '#059669' }],
          fills: [{ mode: 'threshold', a: 'input:GR', threshold: { param: 'grClean' }, side: 'above', color: '#a3a065', opacity: 0.22 }],
        },
        {
          id: 't-rt', title: 'RT (ohm·m)', type: 'curves', width: 1, scale: 'log', min: 0.2, max: 2000,
          curves: [{ source: 'input:RT', label: 'RT', color: '#dc2626' }],
          fills: [],
        },
        {
          id: 't-dn', title: 'Density–Neutron', type: 'curves', width: 1.2, scale: 'linear', min: 1.95, max: 2.95,
          curves: [
            { source: 'input:RHOB', label: 'RHOB', color: '#dc2626', min: 1.95, max: 2.95 },
            { source: 'input:NPHI', label: 'NPHI', color: '#3b82f6', min: 0.45, max: -0.15, style: 'dash' },
          ],
          // crossoverPolys.pos = NPHI plotted right of RHOB = gas (yellow);
          // neg = neutron left of density = shale (gray). The global
          // standard scales (1.95-2.95, 0.45 to -0.15) overlay in water-
          // filled limestone; the fills read the separation.
          fills: [{ mode: 'crossover', a: 'input:NPHI', b: 'input:RHOB', positiveColor: '#facc15', negativeColor: '#9ca3af', opacity: 0.35 }],
        },
        {
          id: 't-phi', title: 'Porosity (v/v)', type: 'curves', width: 1, scale: 'linear', min: 0, max: 0.5,
          curves: [{ source: 'output:PHIE', label: 'φe', color: '#0891b2' }],
          fills: [{ mode: 'threshold', a: 'output:PHIE', threshold: { param: 'cutPhi' }, side: 'above', color: '#fde047', opacity: 0.25 }],
        },
        {
          id: 't-vsh', title: 'Vsh (v/v)', type: 'curves', width: 1, scale: 'linear', min: 0, max: 1,
          curves: [{ source: 'output:VSH', label: 'Vsh', color: '#a3a065', fillTo: 'right' }],
          fills: [],
        },
        {
          id: 't-sw', title: 'Sw (v/v)', type: 'curves', width: 1, scale: 'linear', min: 0, max: 1,
          curves: [{ source: 'output:SW', label: 'Sw', color: '#2563eb' }],
          fills: [],
        },
        {
          id: 't-kperm', title: 'k (mD)', type: 'curves', width: 1, scale: 'log', min: 0.01, max: 10000,
          curves: [{ source: 'output:KPERM', label: 'k', color: '#db2777' }],
          fills: [],
        },
        {
          id: 't-pay', title: 'Pay', type: 'curves', width: 0.7, scale: 'linear', min: 0, max: 1,
          curves: [{ source: 'output:PAY', label: 'pay', color: '#16a34a', fillTo: 'left' }],
          fills: [],
        },
        { id: 't-facies', title: 'Facies', type: 'strip', width: 0.5, source: 'facies' },
      ],
    },
    {
      id: 'quicklook',
      name: 'Raw quicklook',
      builtin: true,
      tracks: [
        {
          id: 'q-gr', title: 'GR (API)', type: 'curves', width: 1, scale: 'linear', min: 0, max: 150,
          curves: [{ source: 'input:GR', label: 'GR', color: '#059669' }], fills: [],
        },
        {
          id: 'q-rt', title: 'RT (ohm·m)', type: 'curves', width: 1, scale: 'log', min: 0.2, max: 2000,
          curves: [{ source: 'input:RT', label: 'RT', color: '#dc2626' }], fills: [],
        },
        {
          id: 'q-dn', title: 'Density–Neutron', type: 'curves', width: 1.2, scale: 'linear', min: 1.95, max: 2.95,
          curves: [
            { source: 'input:RHOB', label: 'RHOB', color: '#dc2626', min: 1.95, max: 2.95 },
            { source: 'input:NPHI', label: 'NPHI', color: '#3b82f6', min: 0.45, max: -0.15, style: 'dash' },
          ],
          fills: [{ mode: 'crossover', a: 'input:NPHI', b: 'input:RHOB', positiveColor: '#facc15', negativeColor: '#9ca3af', opacity: 0.35 }],
        },
        {
          id: 'q-dt', title: 'DT (µs/m)', type: 'curves', width: 1, scale: 'linear', min: 650, max: 150,
          curves: [{ source: 'input:DT', label: 'DT', color: '#7c3aed' }], fills: [],
        },
      ],
    },
    {
      id: 'lithology-quicklook',
      name: 'Lithology quicklook',
      builtin: true,
      tracks: [
        {
          // GR with a two-colour cut-off: below the cut-off is sand (yellow),
          // above is shale (gray). The cut-off is a fixed value the user edits
          // in the fill row (75 API by default).
          id: 'l-gr', title: 'GR (API)', type: 'curves', width: 1, scale: 'linear', min: 0, max: 150,
          curves: [{ source: 'input:GR', label: 'GR', color: '#059669' }],
          fills: [{ mode: 'threshold', a: 'input:GR', threshold: { value: 75 }, side: 'below', color: '#fde047', color2: '#9ca3af', opacity: 0.35 }],
        },
        {
          // lithology ramp: the whole track coloured by GR from clean sand
          // (pale yellow) to shale (dark brown)
          id: 'l-litho', title: 'Lithology', type: 'curves', width: 0.6, scale: 'linear', min: 0, max: 150,
          curves: [{ source: 'input:GR', label: 'GR', color: '#475569', lineWidth: 0.8 }],
          fills: [{ mode: 'ramp', a: 'input:GR', fillTo: 'track', stops: RAMP_PRESETS.lithology.stops, opacity: 0.9 }],
        },
        {
          id: 'l-rt', title: 'RT (ohm·m)', type: 'curves', width: 1, scale: 'log', min: 0.2, max: 2000,
          curves: [{ source: 'input:RT', label: 'RT', color: '#dc2626' }],
          fills: [],
        },
        {
          id: 'l-dn', title: 'Density–Neutron', type: 'curves', width: 1.2, scale: 'linear', min: 1.95, max: 2.95,
          curves: [
            { source: 'input:RHOB', label: 'RHOB', color: '#dc2626', min: 1.95, max: 2.95 },
            { source: 'input:NPHI', label: 'NPHI', color: '#3b82f6', min: 0.45, max: -0.15, style: 'dash' },
          ],
          fills: [{ mode: 'crossover', a: 'input:NPHI', b: 'input:RHOB', positiveColor: '#facc15', negativeColor: '#9ca3af', opacity: 0.35 }],
        },
      ],
    },
  ];
}

export function buildDefaultLayouts() {
  return {
    version: LAYOUTS_VERSION,
    activeTemplateId: 'std-triple-combo',
    templates: buildDefaultTemplates(),
  };
}

/** Bring a stored layouts object up to the current version; anything
 *  unusable falls back to the defaults (never crash on user rows). */
export function migrateLayouts(stored) {
  if (!stored || typeof stored !== 'object' || !Array.isArray(stored.templates) || !stored.templates.length) {
    return buildDefaultLayouts();
  }
  const layouts = { ...stored };
  if (!layouts.version) layouts.version = 1;
  // v1 -> v2 (PT6): additive fill fields only; a stamp is the whole step
  if (layouts.version < 2) layouts.version = 2;
  // built-ins refresh from code so template fixes reach saved rows;
  // user copies are untouched
  const defaults = buildDefaultTemplates();
  layouts.templates = [
    ...defaults,
    ...layouts.templates.filter((t) => !defaults.some((d) => d.id === t.id)),
  ];
  if (!layouts.templates.some((t) => t.id === layouts.activeTemplateId)) {
    layouts.activeTemplateId = layouts.templates[0].id;
  }
  return layouts;
}

export const activeTemplate = (layouts) => layouts.templates.find((t) => t.id === layouts.activeTemplateId)
  || layouts.templates[0];

let uid = 0;
export const newId = (prefix) => { uid += 1; return `${prefix}-${Date.now().toString(36)}-${uid}`; };

// templates are pure JSON by construction, so a JSON clone is exact
const cloneTemplate = (t) => JSON.parse(JSON.stringify(t));

/**
 * Apply `updater(template) -> template` to the template with the given
 * id, forking built-ins first (clone-on-edit): the fork becomes a new
 * user template named "<name> (edited)" and the active id moves to it.
 * Returns the next layouts object.
 */
export function updateTemplate(layouts, templateId, updater) {
  const t = layouts.templates.find((x) => x.id === templateId);
  if (!t) return layouts;
  if (t.builtin) {
    const fork = { ...updater(cloneTemplate(t)), id: newId('tpl'), name: `${t.name} (edited)`, builtin: false };
    return {
      ...layouts,
      activeTemplateId: fork.id,
      templates: [...layouts.templates, fork],
    };
  }
  return {
    ...layouts,
    templates: layouts.templates.map((x) => (x.id === templateId ? updater(cloneTemplate(x)) : x)),
  };
}

// ---- top (marker) display preferences (PT3, 2026-09-03) --------------------
// Ride inside the layouts object as an optional sibling of `templates`
// (migrateLayouts spreads unknown keys, so no migration): which tops show
// and any colour a user picked, keyed by normalised name so the choice
// applies to every well.
//   topStyles?: { showAll?: boolean, byName?: { [topKey]: { color?, hidden? } } }

import { topKey } from '@/components/wells/topColors';

export function getTopStyles(layouts) {
  const t = layouts?.topStyles || {};
  return { showAll: t.showAll !== false, byName: t.byName || {} };
}

export function setTopStyle(layouts, name, patch) {
  const cur = getTopStyles(layouts);
  const k = topKey(name);
  const next = { ...(cur.byName[k] || {}), ...patch };
  if (next.hidden === false) delete next.hidden;
  if (!next.color) delete next.color;
  const byName = { ...cur.byName };
  if (Object.keys(next).length) byName[k] = next; else delete byName[k];
  return { ...layouts, topStyles: { showAll: cur.showAll, byName } };
}

export function setShowAllTops(layouts, showAll) {
  const cur = getTopStyles(layouts);
  return { ...layouts, topStyles: { showAll: !!showAll, byName: cur.byName } };
}

/** Tops the viewer draws, with their colour; hidden ones are dropped. */
export function visibleTops(tops, layouts, theme = 'light') {
  const st = getTopStyles(layouts);
  if (!st.showAll) return [];
  return (tops || []).filter((t) => !st.byName[topKey(t.name)]?.hidden);
}
