/**
 * The figures of the Recovery Factor report (RF-U1-005, RL6): the list the
 * PDF draws and the Report tab lists. The reserves figure takes its bars from
 * series.js, the builder of the screen chart; a figure that does not apply
 * is still listed with the reason.
 *
 * Pure: returns Report Kit figure entries.
 */
import { reservesBars, analogRangeRows, exceedanceSeries } from './series.js';
import { displacementProfile } from '@/utils/recoveryFactorCalculations';

const g = (v, s = 3) => (Number.isFinite(v) ? String(parseFloat(Number(v).toPrecision(s))) : 'n/a');
const RGB = { low: [100, 116, 139], est: [5, 150, 105], high: [37, 99, 235], ref: [220, 38, 38], typical: [124, 58, 237] };
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; };

/**
 * @param {{model: object, state: {inputs: object, derived: object}}} a
 */
export function buildRfReportFigures({ model, state }) {
  if (!model || !state?.derived) return [];
  const { derived, inputs } = state;
  const r = derived.result;
  const u = model.u;
  const figs = [];

  // 1. recoverable volume: range edges and the estimate (the screen chart)
  const bars = reservesBars(r, derived.phase, u.system);
  if (bars.rows.length) {
    figs.push({
      id: 'reserves',
      title: 'Recoverable volume: analog range edges and the estimate',
      caption: `Bars in ${bars.unit}: the in-place volume times the low edge, the estimate and the high edge of the analog range of ${r.analog?.label || 'the drive named'}. The edges bound a screening range; they are not P90 and P10. ${bars.note}`.trim(),
      panels: [{ kind: 'bars', height: 62, spec: {
        yTitle: `Recoverable volume (${bars.unit})`,
        categories: bars.rows.map((b) => b.name),
        series: [{ name: 'Recoverable volume', values: bars.rows.map((b) => b.value), rgbs: bars.rows.map((b) => RGB[b.key]) }],
        valueText: (v) => g(v, 4),
      } }],
    });
  } else {
    figs.push({ id: 'reserves', title: 'Recoverable volume: analog range edges and the estimate', statement: 'Not drawn: there is no in-place volume, so no recoverable volume can be computed.' });
  }

  // 1b. RF-U2-002: the exceedance curve of the recoverable volume (only when the run is on)
  if (derived.uncertainty?.ok) {
    const ex = exceedanceSeries(derived.uncertainty, derived.phase, u.system);
    figs.push({
      id: 'exceedance',
      title: 'Recoverable volume: probability of exceedance',
      caption: `The seeded Monte Carlo of RF x ${derived.phase === 'gas' ? 'OGIP' : 'OOIP'} (seed ${derived.uncertainty.seed}, ${derived.uncertainty.accepted} realisations): the probability that the recoverable volume meets or exceeds each value. P90 (the low case) ${g(ex.marks[0].x, 4)}, P50 ${g(ex.marks[1].x, 4)}, P10 (the high case) ${g(ex.marks[2].x, 4)} ${ex.unit}.`,
      panels: [{ height: 62, spec: {
        xTitle: `Recoverable volume (${ex.unit})`, yTitle: 'Probability of exceedance (percent)', yInclude: [0, 100],
        series: [
          { name: 'Exceedance', type: 'line', rgb: RGB.high, pts: ex.pts.map((p) => [p.x, p.y]), width: 0.5 },
          { name: 'P90, P50, P10', type: 'scatter', rgb: RGB.ref, pts: ex.marks.map((m) => [m.x, m.y]), marker: 'circle' },
        ],
      } }],
    });
  }

  // 2. the analog ranges of the phase, with the estimate as a line
  const rows = analogRangeRows(derived.drives, r);
  if (rows.length) {
    const lines = Number.isFinite(r.rf) ? [{ y: r.rf * 100, label: `Estimate ${g(r.rf * 100, 3)}%`, rgb: RGB.ref, dash: [1.6, 1.0] }] : [];
    figs.push({
      id: 'analog',
      title: `Analog recovery ranges of ${derived.phase} drive mechanisms`,
      caption: `Low edge, typical value and high edge of each range, in percent of ${derived.phase === 'gas' ? 'OGIP' : 'OOIP'}; the drive named for this case is ${r.analog?.label || 'none'}. ${Number.isFinite(r.rf) ? `The dashed line is the estimate of ${g(r.rf * 100, 3)} percent.` : 'No estimate line: the method gave no recovery factor.'} Transcribed screening ranges, not validated in this build.`,
      panels: [{ kind: 'bars', height: 70, spec: {
        yTitle: 'Recovery factor (percent)',
        categories: rows.map((x) => (x.selected ? `${x.label} (this case)` : x.label)),
        series: [
          { name: 'Low edge', values: rows.map((x) => x.low), rgb: RGB.low },
          { name: 'Typical', values: rows.map((x) => x.typical), rgb: RGB.typical },
          { name: 'High edge', values: rows.map((x) => x.high), rgb: RGB.high },
        ],
        yInclude: [0, 100],
        valueText: (v) => g(v, 3),
        lines,
      } }],
    });
  }

  // 3. the method by its factors (API correlations) or p/z line (volumetric gas)
  const d = r.detail;
  if (d?.terms?.length) {
    figs.push({
      id: 'factors',
      title: 'The correlation by its factors',
      caption: `Each factor of the ${model.method === 'api_water_drive' ? 'water-drive' : 'solution-gas-drive'} correlation (Arps et al. 1967); the constant ${g(d.constant, 5)} times the factors gives ${g(d.rf, 4)}. A factor above 1 raises the estimate, below 1 lowers it. Permeability enters in darcies.`,
      panels: [{ kind: 'bars', height: 58, spec: {
        yTitle: 'Factor value',
        categories: d.terms.map((t) => t.key === 'storage' ? 'Storage' : t.key === 'mobility' ? 'Mobility (k in D)' : t.key === 'swi' ? 'Swi' : 'Pressure ratio'),
        series: [{ name: 'Factor', values: d.terms.map((t) => t.value), rgb: RGB.est }],
        valueText: (v) => g(v, 4),
        lines: [{ y: 1, label: '1', rgb: RGB.low, dash: [1, 1] }],
      } }],
    });
  } else if (model.method === 'displacement_sweep' && d && Number.isFinite(d.ed)) {
    // RF-U2-009: the displacement efficiency against pore volumes injected, the point used marked
    const pts = displacementProfile({ kr: d.kr, muoi: inputs.corr?.muoi, muwi: inputs.corr?.muwi }).filter(([q]) => q <= Math.max(3, (d.qi || 0) * 1.2));
    const xUsed = d.qi != null ? d.qi : pts[pts.length - 1][0];
    figs.push({
      id: 'factors',
      title: 'Displacement efficiency against pore volumes injected',
      caption: `Buckley-Leverett displacement efficiency ED of the kr-1 oil-water set (Welge construction, canonical engine) against pore volumes of water injected; breakthrough at ${g(d.qiBt, 3)} PV with ED ${g(d.edBt, 3)}, the end point ${g(d.edMax, 3)}. The marked point is the ED used, ${g(d.ed, 4)}; times the stated sweep ${g(d.ev, 3)} it gives the recovery factor ${g(d.rf, 4)}.`,
      panels: [{ height: 62, spec: {
        xTitle: 'Pore volumes of water injected, Qi', yTitle: 'Displacement efficiency ED', xInclude: [0], yInclude: [0, 1],
        series: [
          { name: 'ED (Welge)', type: 'line', rgb: RGB.high, pts, width: 0.5 },
          { name: 'ED used', type: 'scatter', rgb: RGB.ref, pts: [[xUsed, d.ed]], marker: 'circle' },
        ],
      } }],
    });
  } else if (model.method === 'gas_pz' && Number.isFinite(r.rfRaw)) {
    const c = inputs.corr || {};
    const pzi = u.show('pressure', num(c.pi) / num(c.zi));
    const pza = u.show('pressure', num(c.pa) / num(c.za));
    figs.push({
      id: 'factors',
      title: 'p/z against the fraction of gas produced',
      caption: `Volumetric depletion: p/z falls on a straight line from ${g(pzi, 5)} at Gp/G = 0 to ${g(pza, 5)} ${u.label('pressure')} at the abandonment pressure, where Gp/G is the recovery factor ${g(r.rfRaw, 4)}. Exact for a closed reservoir at constant temperature.`,
      panels: [{ height: 62, spec: {
        xTitle: 'Fraction of OGIP produced, Gp/G', yTitle: `p/z (${u.label('pressure')})`, xInclude: [0, 1], yInclude: [0],
        series: [
          { name: 'p/z line', type: 'both', rgb: RGB.high, pts: [[0, pzi], [r.rfRaw, pza]], marker: 'circle', width: 0.55 },
          { name: 'Extrapolation to p/z = 0', type: 'line', rgb: RGB.low, pts: [[r.rfRaw, pza], [1, 0]], dash: [1.2, 1], width: 0.35 },
        ],
      } }],
    });
  } else {
    const why = model.method === 'analog'
      ? 'Does not apply: the analog method reads the typical value of a range and has no factors.'
      : model.method === 'gas_water_drive'
        ? 'Does not apply as a plot: the trapped-gas estimate is a few factors, printed in the method table.'
        : 'Not drawn: the method gave no value.';
    figs.push({ id: 'factors', title: 'The method by its factors', statement: why });
  }
  return figs;
}
