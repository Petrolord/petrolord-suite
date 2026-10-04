/**
 * The figures of the Voidage Replacement report (VRR-U1, RL6): the list the
 * PDF draws and the Report tab lists. Every plotted figure takes its points
 * from the builders the screen charts use (series.js). A figure that does
 * not apply is still listed, with the reason.
 *
 * Pure: returns Report Kit figure entries ({ id, title, caption, panels } or
 * { id, title, statement }).
 */
import {
  trendRows, termRows, pressureRows, rateRows, fvfRows, datedPeriods, monthSpan, midMonthMs,
} from './series.js';
import { vrrUnits } from './units.js';
import { sizeClasses } from './wellMap.js';

export const COLORS = Object.freeze({
  inst: [37, 99, 235], cum: [5, 150, 105], roll: [217, 119, 6], ref: [220, 38, 38], band: [16, 185, 129],
  oil: [22, 101, 52], water: [37, 99, 235], gas: [220, 38, 38], injWater: [14, 116, 144], injGas: [190, 24, 93],
  pressure: [124, 58, 237], survey: [76, 29, 149],
});
const PANEL = 64;
const g = (v, s = 3) => (Number.isFinite(v) ? String(parseFloat(Number(v).toPrecision(s))) : 'n/a');
const xy = (rows, key) => rows.filter((r) => Number.isFinite(r[key])).map((r) => [r.x, r[key]]);

/**
 * @param {{model: object, inputs: object, d: object, system?: string}} a
 */
export function buildVrrReportFigures({ model, inputs, d, system = 'oilfield' }) {
  if (!model) return [];
  const u = vrrUnits(system);
  const dated = datedPeriods(d);
  const axis = dated ? { xTitle: 'Date (each period plotted at the middle of its month)', xDate: true, xInclude: monthSpan(d) } : { xTitle: 'Period (as typed, no calendar date)', xDate: false };
  const figures = [];

  // 1. instantaneous, rolling and cumulative VRR with the 1.0 line and the band
  const trend = trendRows(d);
  if (trend.length) {
    figures.push({
      id: 'vrr',
      title: 'Voidage replacement ratio by period',
      caption: `Instantaneous VRR (each period alone), rolling VRR over ${d.windowPeriods} periods and cumulative VRR, with VRR = 1 (voidage replaced) and the target band ${g(d.targetBand.min)} to ${g(d.targetBand.max)} shaded. Cumulative VRR at the cut-off ${g(d.summary?.cumulativeVRR, 4)}.${d.fillUp && !d.fillUp.startedAbove ? ` Fill-up (cumulative VRR first reaches 1): ${d.fillUp.label}.` : ''}`,
      panels: [{
        height: PANEL,
        spec: {
          ...axis, yTitle: 'VRR (reservoir volume injected / produced)', yInclude: [0, 1.05, d.targetBand.max],
          series: [
            { name: 'Instantaneous', type: 'both', rgb: COLORS.inst, pts: xy(trend, 'instantaneous') },
            { name: `Rolling (${d.windowPeriods})`, type: 'line', rgb: COLORS.roll, dash: [1.2, 0.8], pts: xy(trend, 'rolling') },
            { name: 'Cumulative', type: 'both', rgb: COLORS.cum, marker: 'square', pts: xy(trend, 'cumulative') },
          ],
          yBands: [{ y0: d.targetBand.min, y1: d.targetBand.max, label: 'target band', rgb: COLORS.band }],
          lines: [{ y: 1, label: 'VRR = 1', rgb: COLORS.ref, dash: [1.5, 1] }],
          notesAt: 'top-left',
        },
      }],
    });
  } else {
    figures.push({ id: 'vrr', title: 'Voidage replacement ratio by period', statement: d.withheld ? `Not plotted: ${d.withheld}` : 'Not plotted: no period has produced voidage, so no ratio is defined.' });
  }

  // 2. voidage terms, stacked: produced (oil, water, free gas) and injected (water, gas)
  const terms = termRows(d, system);
  const hasInj = terms.some((t) => t.injWater > 0 || t.injGas > 0);
  const resUnit = u.label('reservoir');
  // the kit prints one significant figure from 1e5 up: thousands of RB, named in the axis title
  const scale = Math.max(...terms.map((t) => Math.max(t.oil + t.water + t.freeGas, t.injWater + t.injGas)), 0) >= 1e5 ? 1000 : 1;
  const sc = (rows, key) => rows.map((r) => [r.x, r[key] / scale]);
  const scaled = scale === 1 ? resUnit : `10^3 ${resUnit}`;
  figures.push({
    id: 'terms',
    title: 'Reservoir voidage by term',
    caption: `Top: produced voidage of each period, stacked oil, water and free gas. Bottom: injected volume, stacked water and gas. Both in ${scaled} at the reservoir pressure of the period; the stacks are the Produced and Injected columns of the ledger table.`,
    panels: [
      {
        height: 50,
        spec: {
          ...axis, yTitle: `Produced (${scaled})`, yInclude: [0],
          series: [
            { name: 'Oil', type: 'bar', rgb: COLORS.oil, pts: sc(terms, 'oil') },
            { name: 'Water', type: 'bar', rgb: COLORS.water, pts: sc(terms, 'water') },
            { name: 'Free gas', type: 'bar', rgb: COLORS.gas, pts: sc(terms, 'freeGas') },
          ],
        },
      },
      ...(hasInj ? [{
        height: 50,
        spec: {
          ...axis, yTitle: `Injected (${scaled})`, yInclude: [0],
          series: [
            { name: 'Water injected', type: 'bar', rgb: COLORS.injWater, pts: sc(terms, 'injWater') },
            { name: 'Gas injected', type: 'bar', rgb: COLORS.injGas, pts: sc(terms, 'injGas') },
          ],
        },
      }] : []),
    ],
  });

  // 3. pressure history
  const pr = pressureRows(d, inputs.pressureSurveys, system);
  const attached = pr.periods.filter((p) => Number.isFinite(p.p));
  if (attached.length) {
    figures.push({
      id: 'pressure',
      title: 'Reservoir pressure history',
      caption: `Average reservoir pressure surveys (${u.label('pressure')}, absolute) and the pressure attached to each period by linear interpolation at mid-month, held flat outside the surveyed span, beside cumulative VRR on the right axis.${inputs.datum?.depth ? ` Datum ${inputs.datum.depth} ft${inputs.datum.reference ? ` ${inputs.datum.reference}` : ''}, stated; no correction applied.` : ' Datum not stated.'}`,
      panels: [{
        height: PANEL,
        spec: {
          ...axis, yTitle: `Pressure (${u.label('pressure')})`, y2Title: 'Cumulative VRR',
          series: [
            ...(pr.survey.length ? [{ name: 'Survey', type: 'scatter', rgb: COLORS.survey, marker: 'square', markerSize: 0.8, pts: pr.survey.map((s) => [s.x, s.p]) }] : []),
            { name: 'Period pressure', type: 'line', rgb: COLORS.pressure, pts: attached.map((p) => [p.x, p.p]) },
            ...(trend.length ? [{ name: 'Cumulative VRR', type: 'line', rgb: COLORS.cum, axis: 'y2', dash: [1.2, 0.8], pts: xy(trend, 'cumulative') }] : []),
          ],
        },
      }],
    });
  } else {
    figures.push({ id: 'pressure', title: 'Reservoir pressure history', statement: !dated ? 'Does not apply: the periods are not calendar months, so no survey can be placed on them.' : 'Not plotted: no pressure survey is attached to this project.' });
  }

  // 4. production and injection rates
  const rates = rateRows(d, system);
  if (rates?.length) {
    const lu = `${u.label('water')}/d`;
    const gu = `${u.label('gas')}/d`;
    const hasGas = rates.some((r) => r.gas > 0 || r.injGas > 0);
    figures.push({
      id: 'rates',
      title: 'Production and injection rates',
      caption: `Calendar-day rates of each month (the month's volume over its days): oil, water produced and water injected in ${u.system === 'si' ? 'sm3' : 'STB or bbl'} per day${hasGas ? `; gas produced and injected in ${gu} on the right axis` : ''}.`,
      panels: [{
        height: PANEL,
        spec: {
          ...axis, yTitle: `Liquid rate (${lu})`, ...(hasGas ? { y2Title: `Gas rate (${gu})` } : {}), yInclude: [0],
          series: [
            { name: 'Oil', type: 'line', rgb: COLORS.oil, pts: xy(rates, 'oil') },
            { name: 'Water produced', type: 'line', rgb: COLORS.water, pts: xy(rates, 'water') },
            { name: 'Water injected', type: 'line', rgb: COLORS.injWater, dash: [1.2, 0.8], pts: xy(rates, 'injWater') },
            ...(hasGas ? [
              { name: 'Gas produced', type: 'line', rgb: COLORS.gas, axis: 'y2', pts: xy(rates, 'gas') },
              { name: 'Gas injected', type: 'line', rgb: COLORS.injGas, axis: 'y2', dash: [1.2, 0.8], pts: xy(rates, 'injGas') },
            ] : []),
          ],
        },
      }],
    });
  } else {
    figures.push({ id: 'rates', title: 'Production and injection rates', statement: 'Does not apply: the periods are not calendar months, so a period has no number of days to make a rate.' });
  }

  // 5. FVFs by period, when they vary
  if (d.pvt.active) {
    const fr = fvfRows(d, system);
    figures.push({
      id: 'fvf',
      title: 'Formation volume factors by period',
      caption: `The FVF set applied to each period, ${d.pvt.mode === 'table' ? 'interpolated in the Fluid Systems Studio PVT table' : 'from black-oil correlations'} at the period pressure: Bo and Bw (${u.label('bo')}) on the left, Bg (${u.label('bg')}) on the right.`,
      panels: [{
        height: 54,
        spec: {
          ...axis, yTitle: `Bo, Bw (${u.label('bo')})`, y2Title: `Bg (${u.label('bg')})`,
          series: [
            { name: 'Bo', type: 'both', rgb: COLORS.oil, pts: xy(fr, 'Bo') },
            { name: 'Bw', type: 'both', rgb: COLORS.water, pts: xy(fr, 'Bw') },
            { name: 'Bg', type: 'both', rgb: COLORS.gas, axis: 'y2', marker: 'square', pts: xy(fr, 'Bg') },
          ],
        },
      }],
    });
  } else {
    figures.push({ id: 'fvf', title: 'Formation volume factors by period', statement: `Does not apply: one constant FVF set is used for every period${d.pvt.withheld ? ` (${d.pvt.withheld})` : ''}.` });
  }

  // 6. pattern VRR
  const live = d.patternAnalyses.filter((a) => !a.withheld);
  if (live.length) {
    const xs = (a) => {
      const dates = a.series.map((s) => s.label);
      return dated ? dates.map(midMonthMs) : dates.map((_, i) => i + 1);
    };
    figures.push({
      id: 'patterns',
      title: 'Cumulative VRR by pattern',
      caption: 'Cumulative VRR of each pattern (allocation-weighted injection over the pattern producers\' voidage) beside the field, with VRR = 1.',
      panels: [{
        height: PANEL,
        spec: {
          ...axis, yTitle: 'Cumulative VRR', yInclude: [0, 1.05],
          series: [
            { name: 'Field', type: 'line', rgb: [15, 23, 42], width: 0.6, pts: xy(trend, 'cumulative') },
            ...live.map((a) => {
              const x = xs(a);
              return { name: a.pattern.name, type: 'both', pts: a.series.map((s, i) => [x[i], s.cumulativeVRR]).filter(([, y]) => Number.isFinite(y)) };
            }),
          ],
          lines: [{ y: 1, label: 'VRR = 1', rgb: COLORS.ref, dash: [1.5, 1] }],
        },
      }],
    });
  } else {
    figures.push({
      id: 'patterns',
      title: 'Cumulative VRR by pattern',
      statement: !d.isImported ? 'Does not apply: patterns need an imported per-well ledger.' : !(inputs.patterns || []).length ? 'Not plotted: no pattern is defined.' : `Not plotted: every pattern is withheld (${d.patternAnalyses[0]?.reason || 'no analysis'}).`,
    });
  }
  // 7. VRR-U2-004: voidage by well on the well locations (the bubble map)
  const map = model.wellTable?.map;
  if (map?.ok) {
    const classes = sizeClasses(map.points);
    // plotted as offsets from a round origin, so the ticks read as metres or feet and not as 5e5
    const origin = (key) => Math.floor(Math.min(...map.points.map((p) => p[key])) / 1000) * 1000;
    const x0 = origin('x');
    const y0 = origin('y');
    const max = classes.length ? classes[classes.length - 1].upTo : 0;
    const R = (v) => show(u, v);
    const series = [];
    for (const [type, rgb, word] of [['producer', COLORS.oil, 'Producer, produced voidage'], ['injector', COLORS.injWater, 'Injector, injected volume']]) {
      for (const c of classes) {
        const pts = map.points.filter((p) => p.type === type && p.value > c.from + (c.index === 0 ? -1 : 0) && p.value <= c.upTo * (1 + 1e-12)).map((p) => [p.x - x0, p.y - y0]);
        if (pts.length) series.push({ name: `${word} to ${R(c.upTo)} ${u.label('reservoir')}`, type: 'scatter', rgb, marker: 'circle', markerSize: 0.8 + 2.6 * Math.sqrt(c.upTo / max), pts });
      }
    }
    const centres = map.patterns.filter((q) => q.placed);
    if (centres.length) series.push({ name: 'Pattern centre (cumulative VRR in the table)', type: 'scatter', rgb: COLORS.ref, marker: 'square', markerSize: 0.9, pts: centres.map((q) => [q.x - x0, q.y - y0]) });
    figures.push({
      id: 'map',
      title: 'Voidage by well on the well locations',
      caption: `Each well at its surface location from the wells registry (${map.crs || 'CRS not stated'}, ${map.xyUnit || 'unit not stated'}), through the match table confirmed ${String(map.confirmedAt).slice(0, 10)}. Marker size by thirds of the largest value: a producer's produced voidage, an injector's injected volume, in ${u.label('reservoir')} over the record.${centres.length ? ` Squares: the centre of each pattern's placed producers (${centres.map((q) => `${q.name} ${g(q.cumulativeVRR, 3)}`).join(', ')}).` : ''}${map.unplaced.length ? ` Not on the map: ${map.unplaced.map((x) => x.well).join(', ')} (not matched).` : ''} Axes are offsets from the origin in their titles; the scales of the two axes may differ; values and full coordinates by well are in the table "Voidage by well".`,
      panels: [{
        height: 96,
        spec: {
          xTitle: `X, ${map.xyUnit || 'registry units'} from ${x0.toLocaleString('en-US')}`, yTitle: `Y, ${map.xyUnit || 'registry units'} from ${y0.toLocaleString('en-US')}`,
          series, notesAt: 'top-left', xInclude: pad(map.points.map((p) => p.x - x0)), yInclude: pad(map.points.map((p) => p.y - y0)),
        },
      }],
    });
  } else {
    figures.push({ id: 'map', title: 'Voidage by well on the well locations', statement: !d.isImported ? 'Does not apply: the map needs an imported per-well ledger.' : `Not plotted: ${map?.refusal || d.withheld || 'no voidage by well'}` });
  }
  return figures;
}

// a margin round the wells so no bubble sits on the frame
const pad = (vals) => {
  const lo = Math.min(...vals); const hi = Math.max(...vals);
  const m = Math.max((hi - lo) * 0.12, Math.abs(hi) * 1e-4, 1);
  return [lo - m, hi + m];
};
const show = (u, v) => (Number.isFinite(v) ? Math.round(u.show('reservoir', v)).toLocaleString('en-US') : 'n/a');
