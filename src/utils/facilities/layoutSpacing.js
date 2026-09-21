/**
 * Layout Mapper spacing adapter (Facilities F8).
 *
 * Translates what the mapper holds (layers with icon names and
 * Leaflet latlngs) into what the vendored spacing engine expects
 * (items with equipment types and coordinates), and back. No physics
 * lives here: the table, the geometry and the radiation setbacks are
 * all the engine's.
 *
 * FC1-0 (2026-09-15):
 *  - The pool-fire source now uses the engine's radius FROM THE POOL
 *    CENTRE. checkLayout measures centre to centre, and the tank icon is
 *    the pool centre, so passing the setback from the pool EDGE made the
 *    check short by half the pool diameter (10 m on a 20 m bund: 56.1 m
 *    required where the true figure is 66.1 m). That failed open.
 *  - Flare and pool carry their own allowable radiation, heating value
 *    and fraction radiated; the pool burn rate is an input too.
 *  - A blank or invalid radiation input stays blank: the source is not
 *    computed, the missing inputs are named, and the result is marked
 *    incomplete instead of quietly dropping the source and passing.
 */

import {
  SPACING_TABLE_M, requiredSpacingM, checkLayout, nearestNeighbours,
  flareSetbackM, poolFireSetbackM, RADIATION_LEVELS,
} from '@/utils/facilities/engine/spacing';

export { SPACING_TABLE_M, requiredSpacingM, flareSetbackM, poolFireSetbackM, RADIATION_LEVELS };

/** Mapper icon names to the engine's equipment classes. */
export const ICON_TO_TYPE = {
  Wellhead: 'wellhead',
  Manifold: 'manifold',
  Separator: 'separator',
  'Heater-Treater': 'heaterTreater',
  Tank: 'tank',
  Flare: 'flare',
  Pump: 'pump',
  Compressor: 'compressor',
  Valve: 'valve',
  PSV: 'psv',
};

export const typeOfLayer = (layer) => ICON_TO_TYPE[layer?.iconName] || null;

/**
 * Radiation inputs as the panel holds them (strings, as typed). These are
 * the initial values of a new layout; they are saved with the layout.
 * The pool heating value, fraction radiated and burn rate are the
 * engine's own documented defaults (poolFireSetbackM), now shown.
 */
export const DEFAULT_SPACING_INPUTS = Object.freeze({
  flareEnabled: true,
  poolEnabled: false,
  reliefRateKgS: '20',
  flareLhvKjKg: '46000',
  flareFractionRadiated: '0.3',
  flareAllowableKwM2: '4.73',
  poolDiameterM: '20',
  poolBurnRateKgM2S: '0.055',
  poolLhvKjKg: '43000',
  poolFractionRadiated: '0.35',
  poolAllowableKwM2: '4.73',
});

/** Field labels, used both by the panel and by the missing-input messages. */
export const SPACING_INPUT_LABELS = {
  reliefRateKgS: 'Relief rate (kg/s)',
  flareLhvKjKg: 'Flare LHV (kJ/kg)',
  flareFractionRadiated: 'Flare fraction radiated',
  flareAllowableKwM2: 'Flare allowable radiation (kW/m2)',
  poolDiameterM: 'Bund pool diameter (m)',
  poolBurnRateKgM2S: 'Pool burn rate (kg/m2/s)',
  poolLhvKjKg: 'Pool LHV (kJ/kg)',
  poolFractionRadiated: 'Pool fraction radiated',
  poolAllowableKwM2: 'Pool allowable radiation (kW/m2)',
};

const FLARE_KEYS = ['reliefRateKgS', 'flareLhvKjKg', 'flareFractionRadiated', 'flareAllowableKwM2'];
const POOL_KEYS = ['poolDiameterM', 'poolBurnRateKgM2S', 'poolLhvKjKg', 'poolFractionRadiated', 'poolAllowableKwM2'];

const parseNum = (v) => {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || String(v).trim() === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Merge a stored or partial set of inputs over the defaults. A key the
 * store never had gets the default; a key stored blank stays blank.
 */
export const normaliseSpacingInputs = (stored) => {
  const out = { ...DEFAULT_SPACING_INPUTS };
  if (!stored || typeof stored !== 'object') return out;
  Object.keys(DEFAULT_SPACING_INPUTS).forEach((k) => {
    if (k in stored) out[k] = stored[k];
  });
  out.flareEnabled = Boolean(out.flareEnabled);
  out.poolEnabled = Boolean(out.poolEnabled);
  return out;
};

/** Panel inputs (strings) to numbers. Blank becomes NaN, never a default. */
export const spacingInputsToRadiation = (inputs) => {
  const src = inputs || {};
  const out = { flareEnabled: Boolean(src.flareEnabled), poolEnabled: Boolean(src.poolEnabled) };
  [...FLARE_KEYS, ...POOL_KEYS].forEach((k) => { out[k] = parseNum(src[k]); });
  return out;
};

const invalidKeys = (radiation, keys) => keys.filter((k) => {
  const v = radiation?.[k];
  if (!Number.isFinite(v) || !(v > 0)) return true;
  if (/FractionRadiated$/.test(k) && v > 1) return true;
  return false;
});

const namesOf = (keys) => keys.map((k) => SPACING_INPUT_LABELS[k] || k);

/**
 * Placed equipment as engine items. Pipelines and custom icons are
 * skipped: a drawn pipe run has no single position, and a custom icon
 * has no class the table knows, so judging either would be inventing
 * a rule the user never set.
 */
export const layersToItems = (layers = []) => layers
  .filter((l) => l?.type === 'icon' && !l.isCustom && l.latlng
    && Number.isFinite(l.latlng.lat) && Number.isFinite(l.latlng.lng))
  .map((l) => ({
    id: l.id,
    name: l.tag || l.iconName,
    type: typeOfLayer(l),
    lat: l.latlng.lat,
    lon: l.latlng.lng,
  }))
  .filter((it) => it.type !== null);

/**
 * Standard equipment the mapper holds that has no usable position. These
 * ARE passed to the engine (with no coordinates), so the engine skips them
 * as 'bad-coordinates' and marks the check incomplete itself, rather than
 * the adapter dropping them silently.
 */
export const unplacedItems = (layers = []) => layers
  .filter((l) => l?.type === 'icon' && !l.isCustom && typeOfLayer(l) !== null)
  .filter((l) => !(l.latlng && Number.isFinite(l.latlng.lat) && Number.isFinite(l.latlng.lng)))
  .map((l) => ({ id: l.id, name: l.tag || l.iconName, type: typeOfLayer(l) }));

/** Items the check had to skip, so the panel can say so honestly. */
export const skippedLayers = (layers = []) => layers.filter((l) => {
  if (!l || l.type !== 'icon') return l?.type === 'pipeline';
  if (l.isCustom) return true;
  return typeOfLayer(l) === null;
});

/**
 * What the ADAPTER leaves out of the check, in the engine's own
 * `{ id, reason }` shape so the two lists merge (FC1-0). A pipe run has no
 * single position and a custom icon has no class the table knows, so
 * judging either would invent a rule the user never set; neither makes the
 * check incomplete, because neither is in its scope.
 */
export const adapterSkipped = (layers = []) => skippedLayers(layers).map((l) => ({
  id: l?.id ?? null,
  reason: l?.type === 'pipeline' ? 'pipe-run' : (l?.isCustom ? 'custom-icon' : 'no-spacing-class'),
}));

/** Skip reasons in words, singular and plural. */
export const SKIP_REASON_TEXT = Object.freeze({
  'pipe-run': ['pipe run', 'pipe runs'],
  'custom-icon': ['custom icon', 'custom icons'],
  'no-spacing-class': ['icon with no spacing class', 'icons with no spacing class'],
  'bad-coordinates': ['item with no position on the map', 'items with no position on the map'],
  'radiation-source-not-placed': ['radiation source that is not placed', 'radiation sources that are not placed'],
});

/** "2 pipe runs, 1 custom icon", from a list of { id, reason }. */
export const describeSkipped = (skipped = []) => {
  const counts = new Map();
  skipped.forEach((sk) => counts.set(sk.reason, (counts.get(sk.reason) || 0) + 1));
  return [...counts.entries()]
    .map(([reason, n]) => {
      const words = SKIP_REASON_TEXT[reason] || [reason, reason];
      return `${n} ${n === 1 ? words[0] : words[1]}`;
    })
    .join(', ');
};

/** Why the check is incomplete, in words, for the panel and the report. */
export const incompleteReasons = (result) => {
  const out = [];
  (result?.sourceErrors || []).forEach((e) => out.push(e.message.replace(/\.$/, '')));
  const notJudged = (result?.skipped || []).filter((sk) => SKIP_REASON_TEXT[sk.reason]
    && (sk.reason === 'bad-coordinates' || sk.reason === 'radiation-source-not-placed'));
  if (notJudged.length) out.push(`${describeSkipped(notJudged)} could not be judged`);
  const unknown = result?.unknownPairs?.length || 0;
  if (unknown) out.push(`${unknown} equipment pair${unknown === 1 ? '' : 's'} the spacing table has no figure for`);
  return out;
};

const M_PER_FT = 0.3048;

/**
 * The pool-fire radius measured from the pool centre. The engine returns
 * it as radiusFromCentreM; if a later engine drops that name, rebuild it
 * from the edge setback (the engine clamps that at zero, so the rebuilt
 * figure can only be larger, never smaller).
 */
export const poolRadiusFromCentreM = (p, poolDiameterM) => {
  if (Number.isFinite(p?.radiusFromCentreM)) return p.radiusFromCentreM;
  if (Number.isFinite(p?.setbackFromEdgeM) && Number.isFinite(poolDiameterM)) {
    return p.setbackFromEdgeM + poolDiameterM / 2;
  }
  return NaN;
};

/**
 * Run the full check for the mapper. Radiation sources are built from
 * the user's flare and tank settings, so the setbacks are computed
 * from a stated duty rather than assumed.
 *
 * `radiation` is numeric (see spacingInputsToRadiation).
 */
export const runLayoutCheck = ({ layers, radiation }) => {
  const items = layersToItems(layers);
  if (items.length < 2) {
    return {
      error: 'place at least two pieces of standard equipment to check the spacing between them',
      items,
    };
  }
  const sources = [];
  const sourceErrors = [];

  const flares = items.filter((i) => i.type === 'flare');
  if (radiation?.flareEnabled && flares.length) {
    const bad = invalidKeys(radiation, FLARE_KEYS);
    if (bad.length) {
      sourceErrors.push({
        source: 'flare',
        missing: namesOf(bad),
        message: `Flare setback not computed. Missing or invalid: ${namesOf(bad).join(', ')}.`,
      });
    } else {
      const f = flareSetbackM({
        reliefRateKgS: radiation.reliefRateKgS,
        lhvKjKg: radiation.flareLhvKjKg,
        allowableKwM2: radiation.flareAllowableKwM2,
        fractionRadiated: radiation.flareFractionRadiated,
      });
      if (f.error) {
        sourceErrors.push({ source: 'flare', missing: [], message: `Flare setback not computed: ${f.error}.` });
      } else {
        flares.forEach((it) => sources.push({
          id: it.id,
          kind: 'flare',
          setbackM: f.distanceM,
          allowableKwM2: radiation.flareAllowableKwM2,
          label: `Flare radiation at ${radiation.flareAllowableKwM2} kW/m2, from the flare position`,
          detail: f,
        }));
      }
    }
  }

  const tanks = items.filter((i) => i.type === 'tank');
  if (radiation?.poolEnabled && tanks.length) {
    const bad = invalidKeys(radiation, POOL_KEYS);
    if (bad.length) {
      sourceErrors.push({
        source: 'pool',
        missing: namesOf(bad),
        message: `Pool fire setback not computed. Missing or invalid: ${namesOf(bad).join(', ')}.`,
      });
    } else {
      const p = poolFireSetbackM({
        poolDiameterM: radiation.poolDiameterM,
        burnRateKgM2S: radiation.poolBurnRateKgM2S,
        lhvKjKg: radiation.poolLhvKjKg,
        allowableKwM2: radiation.poolAllowableKwM2,
        fractionRadiated: radiation.poolFractionRadiated,
      });
      const radiusM = p.error ? NaN : poolRadiusFromCentreM(p, radiation.poolDiameterM);
      if (p.error || !Number.isFinite(radiusM)) {
        sourceErrors.push({
          source: 'pool', missing: [],
          message: `Pool fire setback not computed: ${p.error || 'the engine returned no radius'}.`,
        });
      } else {
        tanks.forEach((it) => sources.push({
          id: it.id,
          kind: 'pool',
          // checkLayout measures centre to centre, so the radius from the
          // pool centre is the figure it must compare against.
          setbackM: radiusM,
          setbackFromEdgeM: p.setbackFromEdgeM,
          allowableKwM2: radiation.poolAllowableKwM2,
          label: `Pool fire from a ${radiation.poolDiameterM} m pool at ${radiation.poolAllowableKwM2} kW/m2, radius from the tank centre`,
          detail: p,
        }));
      }
    }
  }

  // Unplaced standard equipment goes to the engine so IT reports the skip
  // and the incompleteness (FC1-0).
  const result = checkLayout({ items: [...items, ...unplacedItems(layers)], radiationSources: sources });
  const neighbours = nearestNeighbours({ items });
  return {
    ...result,
    items,
    sources,
    sourceErrors,
    // The engine owns completeness now; a radiation source the adapter could
    // not compute is the one thing it cannot see.
    complete: Boolean(result.complete) && sourceErrors.length === 0,
    neighbours: neighbours.error ? [] : neighbours.rows,
    // Both lists, neither lost: what the engine skipped and what the adapter
    // never sent it.
    skipped: [...(result.skipped || []), ...adapterSkipped(layers)],
  };
};

/** Metres to feet, for the panel's secondary readout. */
export const toFeet = (m) => (Number.isFinite(m) ? m / M_PER_FT : NaN);

const f0 = (v) => (Number.isFinite(v) ? v.toFixed(0) : '--');
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '--');

/**
 * The spacing result as plain rows for a document export (the PDF).
 * Returns { summary: string[], setbacks: string[][], violations: string[][], notes: string[] }.
 */
export const spacingReportSection = (result) => {
  if (!result || result.error) {
    return {
      summary: [`Spacing check not run: ${result?.error || 'no result'}.`],
      setbacks: [],
      violations: [],
      notes: [],
    };
  }
  const summary = [];
  if (result.pass === null) {
    const n = result.zeroRequirementPairs || 0;
    summary.push(`Nothing was checked: ${n === 1 ? '1 pair has' : `${n} pairs have`} no required spacing.`);
  } else {
    summary.push(result.pass
      ? `All ${result.checked} checks that ran pass.`
      : `${result.violations.length} of ${result.checked} checks fail.`);
  }
  (result.sourceErrors || []).forEach((e) => summary.push(e.message));
  incompleteReasons(result).forEach((reason) => {
    if (!(result.sourceErrors || []).some((e) => e.message.replace(/\.$/, '') === reason)) {
      summary.push(`Check incomplete: ${reason}.`);
    }
  });
  const setbacks = result.sources.map((s) => [
    s.label,
    f0(s.setbackM),
    s.kind === 'pool' ? f0(s.setbackFromEdgeM) : '',
  ]);
  const violations = result.violations.map((v) => [
    `${v.aName} to ${v.bName}`,
    v.kind === 'radiation' ? (v.label || 'radiation setback') : 'spacing table',
    f1(v.actualM),
    f0(v.requiredM),
    f1(v.shortfallM),
  ]);
  const notes = [
    'Distances are measured centre to centre between icon positions (great circle).',
    'Table spacings are customary onshore figures that have not yet been verified against the published literature.',
    'Radiation setbacks use a point source: unreliable close to the flame, stack height ignored, no wind tilt, no solar radiation added.',
  ];
  if (result.skipped?.length) {
    notes.push(`Not checked: ${describeSkipped(result.skipped)}.`);
  }
  if (result.worstAbsolute && result.worstRelative
    && result.worstAbsolute !== result.worstRelative) {
    notes.push('Two rankings are reported: the largest shortfall in metres and the largest shortfall as a fraction of its requirement. They are different pairs here.');
  }
  return { summary, setbacks, violations, notes };
};
