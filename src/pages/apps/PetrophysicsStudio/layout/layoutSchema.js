// Layout templates (Petrophysics Studio PS4): the versioned JSON that
// lives in petro_projects.layouts. A template describes tracks by
// CURVE ADDRESS (input:GR through the controller's alias mapping,
// output:PHIE from the pipeline, facies for the strip), never by raw
// mnemonic, so one template works across wells with different
// inventories — resolveTracks drops what a well cannot supply.
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

export const LAYOUTS_VERSION = 1;

export const INPUT_SOURCES = ['input:GR', 'input:RHOB', 'input:NPHI', 'input:DT', 'input:RT'];
export const OUTPUT_SOURCES = ['output:PHIE', 'output:VSH', 'output:SW', 'output:PAY'];
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
          curves: [{ source: 'input:GR', label: 'GR', color: '#34d399' }],
          fills: [{ mode: 'threshold', a: 'input:GR', threshold: { param: 'grClean' }, side: 'above', color: '#a3a065', opacity: 0.22 }],
        },
        {
          id: 't-rt', title: 'RT (ohm·m)', type: 'curves', width: 1, scale: 'log', min: 0.2, max: 2000,
          curves: [{ source: 'input:RT', label: 'RT', color: '#f87171' }],
          fills: [],
        },
        {
          id: 't-dn', title: 'Density–Neutron', type: 'curves', width: 1.2, scale: 'linear', min: 1.95, max: 2.95,
          curves: [
            { source: 'input:RHOB', label: 'RHOB', color: '#eab308', min: 1.95, max: 2.95 },
            { source: 'input:NPHI', label: 'NPHI', color: '#3b82f6', min: 0.45, max: -0.15, style: 'dash' },
          ],
          fills: [{ mode: 'crossover', a: 'input:NPHI', b: 'input:RHOB', positiveColor: '#fbbf24', negativeColor: '#64748b', opacity: 0.3 }],
        },
        {
          id: 't-phi', title: 'Porosity (v/v)', type: 'curves', width: 1, scale: 'linear', min: 0, max: 0.5,
          curves: [{ source: 'output:PHIE', label: 'φe', color: '#22d3ee' }],
          fills: [{ mode: 'threshold', a: 'output:PHIE', threshold: { param: 'cutPhi' }, side: 'above', color: '#fde047', opacity: 0.25 }],
        },
        {
          id: 't-vsh', title: 'Vsh (v/v)', type: 'curves', width: 1, scale: 'linear', min: 0, max: 1,
          curves: [{ source: 'output:VSH', label: 'Vsh', color: '#a3a065', fillTo: 'right' }],
          fills: [],
        },
        {
          id: 't-sw', title: 'Sw (v/v)', type: 'curves', width: 1, scale: 'linear', min: 0, max: 1,
          curves: [{ source: 'output:SW', label: 'Sw', color: '#60a5fa' }],
          fills: [],
        },
        {
          id: 't-pay', title: 'Pay', type: 'curves', width: 0.7, scale: 'linear', min: 0, max: 1,
          curves: [{ source: 'output:PAY', label: 'pay', color: '#4ade80', fillTo: 'left' }],
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
          curves: [{ source: 'input:GR', label: 'GR', color: '#34d399' }], fills: [],
        },
        {
          id: 'q-rt', title: 'RT (ohm·m)', type: 'curves', width: 1, scale: 'log', min: 0.2, max: 2000,
          curves: [{ source: 'input:RT', label: 'RT', color: '#f87171' }], fills: [],
        },
        {
          id: 'q-dn', title: 'Density–Neutron', type: 'curves', width: 1.2, scale: 'linear', min: 1.95, max: 2.95,
          curves: [
            { source: 'input:RHOB', label: 'RHOB', color: '#eab308', min: 1.95, max: 2.95 },
            { source: 'input:NPHI', label: 'NPHI', color: '#3b82f6', min: 0.45, max: -0.15, style: 'dash' },
          ],
          fills: [],
        },
        {
          id: 'q-dt', title: 'DT (µs/m)', type: 'curves', width: 1, scale: 'linear', min: 650, max: 150,
          curves: [{ source: 'input:DT', label: 'DT', color: '#a78bfa' }], fills: [],
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
  if (!layouts.version) layouts.version = LAYOUTS_VERSION;
  // future versions migrate step-by-step here
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
