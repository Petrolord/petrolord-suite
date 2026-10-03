// Forecast Scenario Hub: the annual CSV (HUB-U1-001, RL1 and RL7).
//
// The file used to be two bare columns, `year,production_bbl`, with no case,
// parameter, unit, start date or source. It now opens with '#' lines that
// say what the case is (its parameters with the decline basis, its start,
// its limit, where it came from) and its columns carry their units and the
// calendar dates each forecast year covers.
import { DAYS_PER_YEAR } from '@/utils/forecastScenarioCalculations';
import { caseSourceText } from '@/utils/forecastScenarioIntake';
import { convert } from '@/lib/units/registry';

/** The start a case takes when neither it nor the set names one (the hub's old fixed start). */
export const HUB_DEFAULT_START = '2026-01-01';

const n = (v, d = 6) => (typeof v === 'number' && Number.isFinite(v) ? String(parseFloat(v.toPrecision(d))) : 'n/a');
const csvCell = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

/**
 * @param {object} summary a compareCases summary
 * @param {object} c the case definition
 * @param {{econ?: object, setStart?: string, build?: string, metric?: boolean}} o
 */
export function buildHubCsv(summary, c, { econ = null, setStart = HUB_DEFAULT_START, build = null, metric = false } = {}) {
  const start = (c?.startDate || summary.startDate || setStart || HUB_DEFAULT_START).slice(0, 10);
  const rateU = metric ? 'sm3/d' : 'bbl/d';
  const volU = metric ? 'sm3' : 'bbl';
  const rate = (v) => (metric ? convert('liquidRate', v, 'bbl/d', 'm3/d') : v);
  const vol = (v) => (metric ? convert('liquidVolume', v, 'bbl', 'm3') : v);
  const source = caseSourceText(c);
  const lines = [
    `# Forecast Scenario Hub annual profile, Petrolord Suite${build ? ` build ${build}` : ''}`,
    `# Case: ${summary.name}; model ${summary.model}; oil at stock-tank conditions`,
    `# qi ${n(rate(c?.qi))} ${rateU}; decline ${n(c?.declineAnnualPct)} %/yr nominal at the case start (a year of ${DAYS_PER_YEAR} days); b ${n(c?.b)}`,
    `# Start ${start}; horizon ${n(c?.years)} years; economic limit ${c?.economicLimit > 0 ? `${n(rate(c.economicLimit))} ${rateU}` : 'none'}`,
    `# EUR ${n(vol((summary.eurMMbbl || 0) * 1e6))} ${volU}${summary.eurCapped ? ` (stopped at the ${50} year maximum life)` : ''}; cumulative to horizon ${n(vol((summary.cumHorizonMMbbl || 0) * 1e6))} ${volU}`,
    econ ? `# Indicative economics: price ${n(econ.pricePerBbl)} $/bbl, opex ${n(econ.opexPerBbl)} $/bbl, discount ${n(econ.discountRatePct)}% at year end` : null,
    source ? `# Source: ${source.replace(/\n/g, ' ')}` : '# Source: entered in Forecast Scenario Hub',
    '# Forecast year 1 runs from the start date for 365.25 days; volumes are the daily rates summed.',
  ].filter(Boolean);
  const t0 = Date.parse(`${start}T00:00:00Z`);
  const rows = (summary.annual || []).map((v, i) => {
    const from = new Date(t0 + Math.round(i * DAYS_PER_YEAR) * 86400000).toISOString().slice(0, 10);
    return [i + 1, from, Math.round(vol(v))].map(csvCell).join(',');
  });
  return [...lines, `forecast_year,starts,production_${volU}`, ...rows].join('\n');
}
