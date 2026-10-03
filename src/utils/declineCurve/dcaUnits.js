// Decline Curve Analysis on the Suite unit profile (DCA-U1, PL3 and RL7).
//
// State never changes unit. Wells, fits, forecasts and saved projects hold
// oil and water rates in bbl/d (stock-tank barrels a day), gas rates in
// Mscf/d, volumes in bbl and Mscf, time in days and the fitted decline Di
// per day (nominal). What changes is the unit a value is SHOWN and TYPED
// in. A value converts at the door (a typed limit, an imported column) and
// at the display, with the factors of the Suite registry
// (src/lib/units/registry.js) and none of its own.
//
// The decline rate is the one quantity with two bases. The registry converts
// its TIME basis (per day, per month, per year; a year is 365.25 days, a
// month a twelfth of that). Nominal or effective is a label: every Di this
// app prints is the nominal (instantaneous) decline at the start of the fit
// and says so; the effective decline is printed beside it with its period.
//
// Pure: no React. The studio holds the hook (useAppUnits).
import { convert, DAYS_PER_YEAR } from '@/lib/units/registry';

/** The key of this app's view override (useAppUnits, e2e/helpers/unitView.js). */
export const DCA_UNIT_APP = 'decline-curve-analysis';

/** What the unit control offers, each tied to its registry family. */
export const DCA_UNIT_SPEC = Object.freeze({
  liquidRate: { family: 'liquidRate', allowed: ['bbl/d', 'm3/d'] },
  gasRate: { family: 'gasRate', allowed: ['Mscf/d', '10^3 m3/d'] },
  decline: { family: 'declineRate', allowed: ['%/yr', '1/yr', '1/month', '1/d'] },
});

/** The units state is held in: the view without a profile. */
export const DCA_OILFIELD_VIEW = Object.freeze({ liquidRate: 'bbl/d', gasRate: 'Mscf/d', decline: '%/yr' });
export const DCA_METRIC_VIEW = Object.freeze({ liquidRate: 'm3/d', gasRate: '10^3 m3/d', decline: '%/yr' });

/** The engine's own units, by stream. */
export const ENGINE_RATE = Object.freeze({ oil: 'bbl/d', water: 'bbl/d', gas: 'Mscf/d' });
export const ENGINE_VOLUME = Object.freeze({ oil: 'bbl', water: 'bbl', gas: 'Mscf' });

const RATE_LABELS = Object.freeze({ 'bbl/d': 'bbl/d', 'm3/d': 'sm3/d', 'Mscf/d': 'Mscf/d', '10^3 m3/d': '10^3 sm3/d' });
const VOLUME_LABELS = Object.freeze({
  bbl: 'bbl', '10^3 bbl': 'Mbbl', MMbbl: 'MMbbl', m3: 'sm3', '10^3 m3': '10^3 sm3', '10^6 m3': '10^6 sm3',
  Mscf: 'Mscf', MMscf: 'MMscf', Bscf: 'Bscf', '10^9 m3': '10^9 sm3',
});
const DECLINE_LABELS = Object.freeze({ '%/yr': '%/yr', '1/yr': '1/yr', '1/month': '1/month', '1/d': '1/d' });

// volume ladders, smallest first
const LADDERS = Object.freeze({
  bbl: ['bbl', '10^3 bbl', 'MMbbl'],
  m3liq: ['m3', '10^3 m3', '10^6 m3'],
  Mscf: ['Mscf', 'MMscf', 'Bscf'],
  m3gas: ['10^3 m3', '10^6 m3', '10^9 m3'],
});

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const familyOfRate = (stream) => (stream === 'gas' ? 'gasRate' : 'liquidRate');
const familyOfVolume = (stream) => (stream === 'gas' ? 'gasVolume' : 'liquidVolume');

/** The year this app (and the registry) counts a decline over: 365.25 days. */
export const DCA_DAYS_PER_YEAR = DAYS_PER_YEAR;

/**
 * The unit view of the app.
 * @param {{liquidRate?: string, gasRate?: string, decline?: string}} [choice] from useAppUnits
 */
export function createDcaUnits(choice = {}) {
  const c = { ...DCA_OILFIELD_VIEW };
  for (const key of Object.keys(DCA_UNIT_SPEC)) {
    if (DCA_UNIT_SPEC[key].allowed.includes(choice?.[key])) c[key] = choice[key];
  }
  const rateUnit = (stream) => (stream === 'gas' ? c.gasRate : c.liquidRate);
  const metricRate = (stream) => rateUnit(stream) !== ENGINE_RATE[stream];
  const volumeUnit = (stream) => {
    if (stream === 'gas') return metricRate('gas') ? '10^3 m3' : 'Mscf';
    return metricRate(stream) ? 'm3' : 'bbl';
  };
  const ladderOf = (stream) => {
    const u = volumeUnit(stream);
    if (stream === 'gas') return u === 'Mscf' ? LADDERS.Mscf : LADDERS.m3gas;
    return u === 'bbl' ? LADDERS.bbl : LADDERS.m3liq;
  };

  const rateTo = (stream, v) => (finite(v) ? convert(familyOfRate(stream), v, ENGINE_RATE[stream], rateUnit(stream)) : null);
  const rateFrom = (stream, v) => (finite(v) ? convert(familyOfRate(stream), v, rateUnit(stream), ENGINE_RATE[stream]) : null);
  const volumeTo = (stream, v, unit = volumeUnit(stream)) => (finite(v) ? convert(familyOfVolume(stream), v, ENGINE_VOLUME[stream], unit) : null);

  /** A volume in the multiple that suits its size (the largest that keeps it at 1 or above). */
  const volumeScaled = (stream, maxAbsEngine) => {
    const ladder = ladderOf(stream);
    const base = volumeUnit(stream);
    const size = finite(maxAbsEngine) ? Math.abs(convert(familyOfVolume(stream), maxAbsEngine, ENGINE_VOLUME[stream], base)) : 0;
    let pick = ladder[0];
    for (const u of ladder) if (convert(familyOfVolume(stream), 1, u, base) <= size) pick = u;
    return { unit: pick, label: VOLUME_LABELS[pick] || pick, to: (v) => volumeTo(stream, v, pick) };
  };

  const declineUnit = c.decline;
  /** A per-day nominal Di in the view's decline unit. */
  const declineTo = (diPerDay) => (finite(diPerDay) ? convert('declineRate', diPerDay, '1/d', declineUnit) : null);
  const declineFrom = (v) => (finite(v) ? convert('declineRate', v, declineUnit, '1/d') : null);

  const system = ['liquidRate', 'gasRate'].every((k) => c[k] === DCA_OILFIELD_VIEW[k]) ? 'oilfield'
    : ['liquidRate', 'gasRate'].every((k) => c[k] === DCA_METRIC_VIEW[k]) ? 'metric' : 'mixed';
  const SYSTEM_WORDS = { oilfield: 'Oilfield', metric: 'SI / metric', mixed: 'Mixed' };

  return {
    choice: c,
    system,
    rateUnit,
    rateLabel: (stream) => RATE_LABELS[rateUnit(stream)] || rateUnit(stream),
    rateTo,
    rateFrom,
    volumeUnit,
    volumeLabel: (stream) => VOLUME_LABELS[volumeUnit(stream)] || volumeUnit(stream),
    volumeTo,
    volumeScaled,
    declineUnit,
    declineLabel: DECLINE_LABELS[declineUnit] || declineUnit,
    declineTo,
    declineFrom,
    /** The header line of a report and an export: the system word and the units in use. */
    displayUnits: () => `${SYSTEM_WORDS[system]} (${[
      RATE_LABELS[c.liquidRate], RATE_LABELS[c.gasRate], VOLUME_LABELS[volumeUnit('oil')], VOLUME_LABELS[volumeUnit('gas')],
      `Di nominal ${DECLINE_LABELS[declineUnit]}`,
    ].join(', ')})`,
  };
}

/** The view with nothing chosen: what state and a test are in. */
export const DCA_OILFIELD_UNITS = createDcaUnits(DCA_OILFIELD_VIEW);
