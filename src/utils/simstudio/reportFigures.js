/**
 * The figures of the Reservoir Simulation report (SIM-U1, RL6): the list
 * the PDF draws and the Report tab lists. Every plotted figure takes its
 * points from series.js, the builder the Results charts use, on the
 * calendar. A figure that does not apply is still listed with the reason.
 *
 * Pure: returns Report Kit figure entries.
 */
import { fieldRows, wellRows, pairs, dayToMs, aquiferRows } from './series.js';

const dayMs = (summary, day) => dayToMs(summary, day);
import { simUnits } from './simUnits.js';
import { compareSeries } from './runCompare.js';

export const COLORS = Object.freeze({
  oil: [22, 101, 52], water: [37, 99, 235], gas: [220, 38, 38], pressure: [124, 58, 237],
  injWater: [14, 116, 144], injGas: [190, 24, 93], cut: [37, 99, 235], gor: [217, 119, 6],
});
const WELL_RGB = [[22, 101, 52], [29, 78, 216], [180, 83, 9], [185, 28, 28], [124, 58, 237], [14, 116, 144], [190, 24, 93], [77, 124, 15]];
const PANEL = 62;
const AXIS = { xTitle: 'Date (run start plus simulator days)', xDate: true };

/** A divisor that keeps axis numbers under 10^5 (the kit's tick text), and its words. */
function scaleOf(values) {
  const max = Math.max(0, ...values.filter(Number.isFinite).map(Math.abs));
  if (max >= 1e8) return { k: 1e6, words: '10^6 ' };
  if (max >= 1e5) return { k: 1e3, words: '10^3 ' };
  return { k: 1, words: '' };
}
const scaled = (pts, k) => pts.map(([x, y]) => [x, y / k]);

const has = (summary, key) => Array.isArray(summary?.field?.[key]);
const missing = (keys) => `Not plotted: the summary holds none of ${keys.join(', ')} (the deck's SUMMARY section does not request them).`;

/**
 * @param {{summary: object, opts: {deckSystem: string, system: string}, historyEnd?: ?string, bhp?: ?object, aquiferDeck?: boolean}} a
 *   `historyEnd` the ISO date the history phase ends (the deck's last DATES entry); `bhp` the
 *   bottomhole pressure match (bhpMatch.js) when it applies
 */
export function buildSimReportFigures({ summary, opts, historyEnd = null, bhp = null, aquiferDeck = false }) {
  const u = simUnits(opts.system);
  const F = (key) => (has(summary, key) ? pairs(fieldRows(summary, key, opts), 'value') : []);
  const figures = [];

  // 1. production rates
  {
    const oil = F('FOPR'); const water = F('FWPR'); const gas = F('FGPR');
    if (oil.length || water.length || gas.length) {
      const liq = scaleOf([...oil, ...water].map((p) => p[1]));
      const gs = scaleOf(gas.map((p) => p[1]));
      const series = [];
      if (oil.length) series.push({ name: 'Oil (FOPR)', type: 'line', rgb: COLORS.oil, pts: scaled(oil, liq.k) });
      if (water.length) series.push({ name: 'Water (FWPR)', type: 'line', rgb: COLORS.water, pts: scaled(water, liq.k) });
      if (gas.length) series.push({ name: 'Gas (FGPR)', type: 'line', rgb: COLORS.gas, dash: [1.5, 1], axis: 'y2', pts: scaled(gas, gs.k) });
      figures.push({
        id: 'rates',
        title: 'Field production rates',
        caption: `Field oil and water rates (left, ${liq.words}${u.label('oilRate')}) and gas rate (right, ${gs.words}${u.label('gasRate')}) as the simulator wrote them at each time step.${!water.length ? ' FWPR is not in the summary.' : ''}${!gas.length ? ' FGPR is not in the summary.' : ''}`,
        panels: [{ height: PANEL, spec: { ...AXIS, yTitle: `Liquid rate (${liq.words}${u.label('oilRate')})`, ...(gas.length ? { y2Title: `Gas rate (${gs.words}${u.label('gasRate')})` } : {}), yInclude: [0], series } }],
      });
    } else figures.push({ id: 'rates', title: 'Field production rates', statement: missing(['FOPR', 'FWPR', 'FGPR']) });
  }

  // 2. cumulatives
  {
    const nz = (pts) => (pts.some((p) => p[1] !== 0) ? pts : []);
    const np = F('FOPT'); const wi = nz(F('FWIT')); const gi = nz(F('FGIT'));
    if (np.length || wi.length || gi.length) {
      const liq = scaleOf([...np, ...wi].map((p) => p[1]));
      const gs = scaleOf(gi.map((p) => p[1]));
      const series = [];
      if (np.length) series.push({ name: 'Oil produced (FOPT)', type: 'line', rgb: COLORS.oil, pts: scaled(np, liq.k) });
      if (wi.length) series.push({ name: 'Water injected (FWIT)', type: 'line', rgb: COLORS.injWater, pts: scaled(wi, liq.k) });
      if (gi.length) series.push({ name: 'Gas injected (FGIT)', type: 'line', rgb: COLORS.injGas, dash: [1.5, 1], axis: 'y2', pts: scaled(gi, gs.k) });
      figures.push({
        id: 'cumulative',
        title: 'Field cumulative volumes',
        caption: `Cumulative oil produced${wi.length ? ' and water injected' : ''} (left, ${liq.words}${u.label('oilVolume')})${gi.length ? `, gas injected (right, ${gs.words}${u.label('gasVolume')})` : ''}. Surface volumes.${!np.length ? ' FOPT is not in the summary.' : ''}${has(summary, 'FWIT') && !wi.length ? ' No water was injected.' : ''}${has(summary, 'FGIT') && !gi.length ? ' No gas was injected.' : ''}`,
        panels: [{ height: PANEL, spec: { ...AXIS, yTitle: `Liquid (${liq.words}${u.label('oilVolume')})`, ...(gi.length ? { y2Title: `Gas (${gs.words}${u.label('gasVolume')})` } : {}), yInclude: [0], series } }],
      });
    } else figures.push({ id: 'cumulative', title: 'Field cumulative volumes', statement: missing(['FOPT', 'FWIT', 'FGIT']) });
  }

  // 3. pressure: field average and well BHP
  {
    const fpr = F('FPR');
    const bhpRows = wellRows(summary, 'WBHP', opts);
    const wells = Object.keys(summary?.wells || {}).filter((w) => Array.isArray(summary.wells[w].WBHP));
    const series = [];
    if (fpr.length) series.push({ name: 'Field average (FPR)', type: 'line', rgb: COLORS.pressure, pts: fpr });
    wells.slice(0, 8).forEach((w, i) => series.push({ name: `BHP ${w}`, type: 'line', rgb: WELL_RGB[i % WELL_RGB.length], dash: [1.2, 0.8], pts: pairs(bhpRows, w) }));
    if (series.length) {
      figures.push({
        id: 'pressure',
        title: 'Reservoir and bottomhole pressure',
        caption: `${fpr.length ? 'Field average pressure (FPR, hydrocarbon pore volume weighted) and the' : 'FPR is not in the summary. The'} bottomhole pressure of ${wells.length > 8 ? 'the first 8 of ' : ''}${wells.length} well${wells.length === 1 ? '' : 's'} (WBHP), ${u.label('pressure')} absolute.`,
        panels: [{ height: PANEL, spec: { ...AXIS, yTitle: `Pressure (${u.label('pressure')})`, series } }],
      });
    } else figures.push({ id: 'pressure', title: 'Reservoir and bottomhole pressure', statement: missing(['FPR', 'WBHP']) });
  }

  // 4. water cut and GOR
  {
    const wct = F('FWCT'); const gor = F('FGOR');
    if (wct.length || gor.length) {
      const series = [];
      if (wct.length) series.push({ name: 'Water cut (FWCT)', type: 'line', rgb: COLORS.cut, pts: wct });
      if (gor.length) series.push({ name: 'GOR (FGOR)', type: 'line', rgb: COLORS.gor, dash: [1.5, 1], axis: wct.length ? 'y2' : undefined, pts: gor });
      figures.push({
        id: 'cut-gor',
        title: 'Water cut and gas-oil ratio',
        caption: `${wct.length ? 'Field water cut (fraction of the liquid rate)' : 'FWCT is not in the summary'}${gor.length ? ` and producing GOR (${u.label('gor')})` : '; FGOR is not in the summary'}.`,
        panels: [{ height: PANEL, spec: { ...AXIS, yTitle: wct.length ? 'Water cut (fraction)' : `GOR (${u.label('gor')})`, ...(wct.length && gor.length ? { y2Title: `GOR (${u.label('gor')})` } : {}), yInclude: wct.length ? [0, 0.1] : [0], series } }],
      });
    } else figures.push({ id: 'cut-gor', title: 'Water cut and gas-oil ratio', statement: missing(['FWCT', 'FGOR']) });
  }

  // 5. injection rates
  {
    const wir = F('FWIR'); const gir = F('FGIR');
    const any = [...wir, ...gir].some((p) => p[1] > 0);
    if (any) {
      const ws = scaleOf(wir.map((p) => p[1]));
      const gs = scaleOf(gir.map((p) => p[1]));
      const series = [];
      if (wir.some((p) => p[1] > 0)) series.push({ name: 'Water (FWIR)', type: 'line', rgb: COLORS.injWater, pts: scaled(wir, ws.k) });
      if (gir.some((p) => p[1] > 0)) series.push({ name: 'Gas (FGIR)', type: 'line', rgb: COLORS.injGas, dash: [1.5, 1], axis: series.length ? 'y2' : undefined, pts: scaled(gir, gs.k) });
      figures.push({
        id: 'injection',
        title: 'Field injection rates',
        caption: `${series.map((x) => (x.name.startsWith('Water') ? `Water injection (${ws.words}${u.label('waterRate')})` : `gas injection (${gs.words}${u.label('gasRate')})`)).join(' and ').replace(/^g/, 'G')} at surface conditions.${series.length === 1 ? ` No ${series[0].name.startsWith('Water') ? 'gas' : 'water'} was injected.` : ''}`,
        panels: [{ height: PANEL, spec: { ...AXIS, yTitle: series[0].name.startsWith('Water') ? `Water (${ws.words}${u.label('waterRate')})` : `Gas (${gs.words}${u.label('gasRate')})`, ...(series.length > 1 ? { y2Title: `Gas (${gs.words}${u.label('gasRate')})` } : {}), yInclude: [0], series } }],
      });
    } else {
      figures.push({ id: 'injection', title: 'Field injection rates', statement: has(summary, 'FWIR') || has(summary, 'FGIR') ? 'Not plotted: no injection in this run (FWIR and FGIR are zero throughout).' : missing(['FWIR', 'FGIR']) });
    }
  }

  // 6. history match: observed against simulated, field level
  {
    const pairsOf = [['FOPR', 'Oil rate', 'oilRate'], ['FWPR', 'Water rate', 'waterRate'], ['FGPR', 'Gas rate', 'gasRate']]
      .filter(([k]) => has(summary, `${k}H`) && has(summary, k));
    if (pairsOf.length) {
      // the history phase ends at the deck's last DATES entry (the history end
      // date the builder writes); after it the H vectors are no observation
      const histEnd = historyEnd ? Date.parse(`${historyEnd}T00:00:00Z`) : null;
      const t0 = pairs(fieldRows(summary, pairsOf[0][0], opts), 'value')[0]?.[0];
      const panels = pairsOf.map(([k, label, kind]) => {
        const rows = fieldRows(summary, k, opts);
        const sim = pairs(rows, 'value');
        const obs = pairs(rows, 'observed').filter(([t]) => histEnd == null || t <= histEnd);
        const s = scaleOf([...sim, ...obs].map((p) => p[1]));
        return {
          height: 48,
          spec: {
            ...AXIS, yTitle: `${label} (${s.words}${u.label(kind)})`, yInclude: [0],
            ...(histEnd != null && t0 != null ? { bands: [{ x0: t0, x1: histEnd, label: 'history phase', rgb: [148, 163, 184] }] } : {}),
            series: [
              { name: `Simulated (${k})`, type: 'line', rgb: COLORS.oil, pts: scaled(sim, s.k) },
              { name: `Observed (${k}H)`, type: 'line', rgb: COLORS.gas, dash: [1.5, 1], pts: scaled(obs, s.k) },
            ],
          },
        };
      });
      figures.push({
        id: 'history',
        title: 'History match: observed against simulated',
        caption: `Observed rates the deck carries (WCONHIST, the ${pairsOf.map(([k]) => `${k}H`).join(', ')} vectors) against the simulated field rates; ${historyEnd ? `the history phase (to ${historyEnd}) is shaded and the observed lines end with it.` : 'the deck states no history end date, so the observed lines run to the end.'} In the history phase the producers run on their observed rates, so a gap shows where a well could not deliver its observed rate; after the history end the run is a prediction. ${bhp?.applies ? 'The bottomhole pressure match is the next figure.' : 'The deck carries no observed bottomhole pressure (WBHPH), so no pressure is matched.'}`,
        panels,
      });
    } else {
      figures.push({ id: 'history', title: 'History match: observed against simulated', statement: 'Does not apply: the deck carries no observed rates (no WCONHIST history and no FOPRH, FWPRH or FGPRH vectors). Add a production history on the Builder tab to run one.' });
    }
  }

  // SIM-U2-004: the analytical aquifer, when the deck has one
  if (aquiferDeck) {
    const aq = summary?.aquifers?.['1'];
    if (aq && Array.isArray(aq.AAQT)) {
      const we = pairs(aquiferRows(summary, 'AAQT', opts), 'value');
      const s = scaleOf(we.map((p) => p[1]));
      const pa = Array.isArray(aq.AAQP) ? pairs(aquiferRows(summary, 'AAQP', opts), 'value') : [];
      const fpr = F('FPR');
      figures.push({
        id: 'aquifer',
        title: 'Aquifer influx and pressure',
        caption: `Cumulative influx of aquifer 1 (AAQT, ${s.words}${u.label('resVolume')}, in the volume units of the aquifer's initial volume) and its pressure (AAQP) against the field average pressure (FPR), ${u.label('pressure')} absolute.`,
        panels: [
          { height: 44, spec: { ...AXIS, yTitle: `Influx (${s.words}${u.label('resVolume')})`, yInclude: [0], series: [{ name: 'Cumulative influx (AAQT)', type: 'line', rgb: COLORS.water, pts: scaled(we, s.k) }] } },
          ...(pa.length ? [{ height: 44, spec: { ...AXIS, yTitle: `Pressure (${u.label('pressure')})`, series: [{ name: 'Aquifer (AAQP)', type: 'line', rgb: COLORS.injWater, pts: pa }, ...(fpr.length ? [{ name: 'Field average (FPR)', type: 'line', rgb: COLORS.pressure, dash: [1.5, 1], pts: fpr }] : [])] } }] : []),
        ],
      });
    } else {
      figures.push({ id: 'aquifer', title: 'Aquifer influx and pressure', statement: 'Not plotted: the deck has an aquifer, but the run\'s summary holds no aquifer vectors (the worker build that ran it did not keep AAQT and AAQP). Run the case again once the worker is redeployed.' });
    }
  }

  // 7. SIM-U2-001: bottomhole pressure, observed against simulated, by well
  if (bhp?.applies) {
    const histEnd = historyEnd ? Date.parse(`${historyEnd}T00:00:00Z`) : null;
    const bhpRows = wellRows(summary, 'WBHP', opts);
    const t0 = bhpRows[0]?.t;
    const shown = bhp.wells.slice(0, 4);
    const panels = shown.map((w, i) => ({
      height: 44,
      spec: {
        ...AXIS, yTitle: `${w.well} BHP (${bhp.unit})`,
        ...(histEnd != null && t0 != null ? { bands: [{ x0: t0, x1: histEnd, label: 'history phase', rgb: [148, 163, 184] }] } : {}),
        series: [
          { name: `Simulated (WBHP:${w.well})`, type: 'line', rgb: WELL_RGB[i % WELL_RGB.length], pts: pairs(bhpRows, w.well) },
          { name: 'Observed', type: 'scatter', rgb: COLORS.gas, markerSize: 0.7, pts: w.pairs.map((p) => [dayMs(summary, p.day), p.obs]).filter(([t]) => Number.isFinite(t)) },
        ],
      },
    }));
    figures.push({
      id: 'bhp-match',
      title: 'Bottomhole pressure match',
      caption: `Simulated bottomhole pressure (WBHP, line) against the observed pressure of each history period (points, ${bhp.source === 'WBHPH' ? 'the WBHPH the simulator reported' : 'from the builder form that made the deck'}), ${bhp.unit} absolute, for ${bhp.wells.length > 4 ? 'the first 4 of ' : ''}${bhp.wells.length} well${bhp.wells.length === 1 ? '' : 's'}; RMS ${Number(bhp.overall.rms).toFixed(1)} ${bhp.unit} over ${bhp.overall.points} points (the table above).${historyEnd ? ` The history phase (to ${historyEnd}) is shaded.` : ''}`,
      panels,
    });
  } else {
    figures.push({ id: 'bhp-match', title: 'Bottomhole pressure match', statement: `Does not apply: ${bhp?.reason || 'the deck carries no observed bottomhole pressure (no WBHPH).'}` });
  }
  return figures;
}

/**
 * SIM-U2-005: the compared runs overlaid on the calendar axis, oil rate and
 * field pressure (each panel drawn when a run holds the vector).
 */
export function buildCompareFigure({ entries, system = 'oilfield' }) {
  const panels = [];
  const said = [];
  for (const [key, title] of [['FOPR', 'Oil rate'], ['FPR', 'Field pressure']]) {
    const { unit, series } = compareSeries(entries, key, system);
    if (!series.length) { said.push(`${key} is in none of the runs`); continue; }
    const s = scaleOf(series.flatMap((x) => x.pts.map((p) => p[1])));
    panels.push({
      height: 52,
      spec: {
        ...AXIS, yTitle: `${title} (${s.words}${unit})`, ...(key === 'FOPR' ? { yInclude: [0] } : {}),
        series: series.map((x, i) => ({ name: `${i === 0 ? 'Base ' : ''}${x.name}`, type: 'line', rgb: WELL_RGB[i % WELL_RGB.length], ...(i ? { dash: [1.5, 1] } : {}), pts: scaled(x.pts, s.k) })),
      },
    });
  }
  if (!panels.length) return { id: 'compare', title: 'Run comparison', statement: `Not plotted: ${said.join('; ')}.` };
  return {
    id: 'compare',
    title: 'Run comparison',
    caption: `${entries.length} runs of the case on the calendar axis, the base solid and the others dashed: ${panels.map((p) => p.spec.yTitle).join(' and ')}.${said.length ? ` ${said.join('; ')}.` : ''} The difference table is in the run comparison section.`,
    panels,
  };
}
