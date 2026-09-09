// The interpretation parameter fields (Petrophysics Studio G2.3, per-zone
// PS3, zone table PT9c): one list shared by the Parameter panel and the
// zone parameter table, so both show the same fields, labels, options and
// visibility rules. Everything the pipeline applies is visible here — no
// silent constants (the plan's formula-parameter footgun defense).
//
// Entry shapes: { section } is a heading; { key, label, options?, show? }
// is a parameter (label may be a function of the draft, show hides the
// field when the current model does not use it); { hint, show } is a
// formula line.

export const FIELDS = [
  { section: 'Vsh (GR)' },
  { key: 'grClean', label: 'GR clean (API)' },
  { key: 'grClay', label: 'GR clay (API)' },
  { key: 'vshMethod', label: 'Model', options: ['linear', 'larionov-tertiary', 'larionov-older', 'clavier', 'steiber'] },
  { section: 'Porosity' },
  { key: 'phiSource', label: 'φt source', options: ['density', 'sonic', 'nd'] },
  // PT9: the selected tool's apparent porosity in 100 percent shale;
  // PHIE = PHIT - Vsh * φ shale feeds Sw, cutoffs, k and BVW
  { key: 'phiShale', label: 'φ shale (v/v)' },
  { key: 'rhoMa', label: 'ρ matrix (g/cc)' },
  { key: 'rhoFl', label: 'ρ fluid (g/cc)' },
  { key: 'dtMa', label: 'Δt matrix (µs/m)' },
  { key: 'dtFl', label: 'Δt fluid (µs/m)' },
  { key: 'sonicMethod', label: 'Sonic model', options: ['wyllie', 'rhg'] },
  { key: 'ndMethod', label: 'N-D combine', options: ['avg', 'rms'] },
  { section: 'Temperature' },
  { key: 'tempMode', label: 'Model', options: ['none', 'linear'] },
  { key: 'surfaceTempC', label: 'Surface T (°C)', show: (d) => d.tempMode === 'linear' },
  { key: 'bhtC', label: 'BHT (°C)', show: (d) => d.tempMode === 'linear' },
  { key: 'bhtDepthM', label: 'BHT depth (m)', show: (d) => d.tempMode === 'linear' },
  { section: 'Sw' },
  { key: 'swMethod', label: 'Model', options: ['archie', 'simandoux', 'indonesia', 'waxman-smits', 'dual-water', 'mod-simandoux'] },
  { key: 'a', label: 'a' },
  // Waxman-Smits exponents are measured on SHALY rock and are not
  // Archie's m/n — the labels say so whenever that model is selected
  { key: 'm', label: (d) => (d.swMethod === 'waxman-smits' ? 'm* (shaly rock)' : 'm') },
  { key: 'n', label: (d) => (d.swMethod === 'waxman-smits' ? 'n* (shaly rock)' : 'n') },
  { key: 'rw', label: (d) => (d.tempMode === 'linear' ? 'Rw @ ref T (ohm·m)' : 'Rw @ FT (ohm·m)') },
  { key: 'rwRefTempC', label: 'Rw ref T (°C)', show: (d) => d.tempMode === 'linear' || d.swMethod === 'waxman-smits' },
  { key: 'rsh', label: 'Rsh (ohm·m)', show: (d) => ['simandoux', 'indonesia', 'mod-simandoux'].includes(d.swMethod) },
  { key: 'qv', label: 'Qv (meq/cm³)', show: (d) => d.swMethod === 'waxman-smits' },
  { key: 'bMode', label: 'B source', options: ['juhasz', 'manual'], show: (d) => d.swMethod === 'waxman-smits' },
  { key: 'bValue', label: 'B (manual)', show: (d) => d.swMethod === 'waxman-smits' && d.bMode === 'manual' },
  { key: 'rwb', label: 'Rwb (ohm·m)', show: (d) => d.swMethod === 'dual-water' },
  { key: 'swb', label: 'Swb (v/v)', show: (d) => d.swMethod === 'dual-water' },
  { section: 'Permeability' },
  { key: 'permMethod', label: 'Model', options: ['none', 'timur', 'tixier', 'coates', 'wyllie-rose'] },
  {
    hint: (d) => ({
      timur: 'Timur 1968: k = 8581·φ^4.4/Swirr² (mD)',
      tixier: 'Tixier 1949: k = (250·φ³/Swirr)² (mD)',
      coates: 'Coates & Denoo 1981: k = (100·φ²(1−Swirr)/Swirr)² (mD)',
      'wyllie-rose': 'Wyllie-Rose: k = (c·φ^q/Swirr)²; Morris & Biggs: oil c=250, gas c=79, q=3',
    }[d.permMethod]),
    show: (d) => d.permMethod !== 'none',
  },
  // PT10a: none is a choice the row remembers; say what it costs
  {
    hint: () => 'Permeability model is none: no k track and no k gm in the zone summaries. This choice is kept on every later open.',
    show: (d) => d.permMethod === 'none',
    testId: 'petro-param-perm-none',
  },
  { key: 'swirrSource', label: 'Swirr source', options: ['buckles', 'manual'], show: (d) => d.permMethod !== 'none' },
  { key: 'bucklesConst', label: 'Buckles const', show: (d) => d.permMethod !== 'none' && d.swirrSource === 'buckles' },
  { key: 'swirrManual', label: 'Swirr (v/v)', show: (d) => d.permMethod !== 'none' && d.swirrSource === 'manual' },
  { key: 'wrC', label: 'c (Wyllie-Rose)', show: (d) => d.permMethod === 'wyllie-rose' },
  { key: 'wrQ', label: 'q (Wyllie-Rose)', show: (d) => d.permMethod === 'wyllie-rose' },
  { section: 'Cutoffs' },
  { key: 'cutPhi', label: 'φ ≥' },
  { key: 'cutVsh', label: 'Vsh ≤' },
  { key: 'cutSw', label: 'Sw ≤' },
];

/** Is this field shown for the given (merged) draft? */
export const visibleField = (f, draft) => !f.show || f.show(draft);

/** Parameter fields only (no headings, no hints). */
export const PARAM_FIELDS = FIELDS.filter((f) => f.key);

/** Field label for a draft (labels may depend on the selected model). */
export const fieldLabel = (f, draft) => (typeof f.label === 'function' ? f.label(draft) : f.label);
