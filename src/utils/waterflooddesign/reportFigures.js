/**
 * The figures of the Waterflood Design report (WF-U1, RL6): the list the PDF
 * draws and the Report tab lists. Every plotted figure takes its points from
 * series.js, the builders the screen charts use. A figure that does not
 * apply is still listed, with the reason.
 *
 * Pure: returns Report Kit figure entries ({ id, title, caption, panels }
 * or { id, title, statement }).
 */
import { patternLabel } from './patterns.js';
import { krSeries, fwSeries, recoverySeries, patternSeries, dpSeries, surveillanceRateSeries, vrrSeries } from './series.js';
import { hallWindowLines } from '@/components/waterflood/hallLines';
import { engineChanWindow, chanWindowText } from './chanWindows.js';

const PANEL = 62;
const g = (v, s = 3) => (Number.isFinite(v) ? String(parseFloat(Number(v).toPrecision(s))) : 'n/a');
const RGB = { water: [37, 99, 235], oil: [5, 150, 105], fw: [124, 58, 237], tangent: [217, 119, 6], ref: [220, 38, 38], alt: [8, 145, 178] };
const INJ = [[37, 99, 235], [5, 150, 105], [124, 58, 237], [217, 119, 6], [220, 38, 38], [8, 145, 178]];

/**
 * @param {{model: object, state: object, system?: string}} a  `state` is the studio state the model was built from
 */
export function buildWaterfloodReportFigures({ model, state }) {
  if (!model || !state) return [];
  const s = state;
  const u = model.u;
  const figs = [];
  const disp = s.displacement;
  const d = s.displacementInputs || {};

  // 1. kr curves with their source
  if (disp?.curves?.length >= 2) {
    const k = krSeries(disp);
    const kr = d.krIntake;
    const source = kr?.sourceText ? `Source: SCAL Studio kr-1, ${kr.sourceText}.` : (d.krSource === 'table' ? 'Source: a table pasted in this app.' : 'Source: Corey parameters entered in this app.');
    figs.push({
      id: 'kr',
      title: 'Relative permeability',
      caption: `${d.krSource === 'table' ? 'Tabular' : `Corey: Swc ${g(+d.Swc)}, Sor ${g(+d.Sor)}, krw(Sor) ${g(+d.krwMax)}, kro(Swc) ${g(+d.kroMax)}, nw ${g(+d.nw)}, no ${g(+d.no)}`}. ${source} ${k.krw.length} points per curve, the series of the screen chart.`,
      panels: [{ height: PANEL, spec: { xTitle: 'Water saturation Sw (fraction)', yTitle: 'Relative permeability kr', xInclude: [0, 1], yInclude: [0, 1], series: [
        { name: 'krw', type: 'line', rgb: RGB.water, pts: k.krw, width: 0.55 },
        { name: 'kro', type: 'line', rgb: RGB.oil, pts: k.kro, width: 0.55 },
      ] } }],
    });
  } else {
    figs.push({ id: 'kr', title: 'Relative permeability', statement: `Not plotted: the displacement inputs are not valid (${s.displacementSpec?.error || 'no curves'}).` });
  }

  // 2. fractional flow with the Welge tangent
  if (disp?.curves?.length >= 2) {
    const w = fwSeries(disp);
    const series = [{ name: 'fw', type: 'line', rgb: RGB.fw, pts: w.fw, width: 0.55 }];
    if (w.tangent.length === 2) series.push({ name: 'Welge tangent', type: 'line', rgb: RGB.tangent, pts: w.tangent, dash: [1.6, 1.0], width: 0.45 });
    if (Number.isFinite(w.Swf)) series.push({ name: 'Front (Swf, fw)', type: 'scatter', rgb: RGB.ref, pts: [[w.Swf, w.fwf]], marker: 'circle' });
    figs.push({
      id: 'fw',
      title: 'Fractional flow with the Welge tangent',
      caption: `Tangent from (Swc, 0) touches fw at the front Swf ${g(w.Swf)} (fw ${g(w.fwf)}) and reaches fw = 1 at the average saturation behind the front ${g(w.SwAvgBt)}. Breakthrough after ${g(disp.bl?.QiBt)} pore volumes. ${d.gravityOn ? 'Dip term on.' : 'Horizontal, no gravity term.'}${d.polymerOn ? ' Polymer viscosity multiplier applied.' : ''}`,
      panels: [{ height: PANEL, spec: {
        xTitle: 'Water saturation Sw (fraction)', yTitle: 'Water cut fw (reservoir)', xInclude: [0, 1], yInclude: [0, 1], series,
        lines: Number.isFinite(w.Swf) ? [{ x: w.Swf, label: 'Swf', rgb: RGB.ref, dash: [1, 1] }] : [],
      } }],
    });
  } else {
    figs.push({ id: 'fw', title: 'Fractional flow with the Welge tangent', statement: 'Not plotted: the displacement inputs are not valid.' });
  }

  // 3. displacement efficiency against PV injected
  const rec = recoverySeries(disp);
  if (rec.length >= 2) {
    figs.push({
      id: 'ed',
      title: 'Displacement efficiency against pore volumes injected',
      caption: `ED in the swept region (1-D). Breakthrough at ${g(disp.bl?.QiBt)} PV with ED ${g((disp.bl?.EDbt ?? NaN) * 100)} %; ED at Sor ${g((disp.bl?.EDmax ?? NaN) * 100)} %. Up to 8 PV, as on screen.`,
      panels: [{ height: PANEL, spec: {
        xTitle: 'Pore volumes injected (PV)', yTitle: 'Displacement efficiency ED (fraction)', yInclude: [0],
        series: [{ name: 'ED', type: 'line', rgb: RGB.oil, pts: rec, width: 0.55 }],
        lines: [{ x: disp.bl?.QiBt, label: 'breakthrough', rgb: RGB.ref, dash: [1, 1] }, { y: disp.bl?.EDmax, label: 'ED at Sor', rgb: RGB.tangent, dash: [1.5, 1] }].filter((l) => Number.isFinite(l.x ?? l.y)),
      } }],
    });
  } else {
    figs.push({ id: 'ed', title: 'Displacement efficiency against pore volumes injected', statement: 'Not plotted: no recovery profile.' });
  }

  // 4 and 5. the pattern forecast
  const pr = s.patternResult;
  if (pr?.series?.length >= 2) {
    const ps = patternSeries(pr, u);
    const bt = pr.summary?.breakthrough_days != null ? pr.summary.breakthrough_days / 365.25 : null;
    figs.push({
      id: 'rates',
      title: 'Pattern forecast: oil and water rates and the water-oil ratio',
      caption: `Constant injection; ${patternLabel(s.patternInputs?.patternType)} areal sweep entered with M ${g(pr.summary?.M)} (${pr.summary?.mobilityBasis}). Pattern breakthrough at ${g(bt)} yr. Rates in ${u.label('oilRate')} at surface; WOR at surface, stopped at the limit ${g(+s.patternInputs?.worLimit)}.`,
      panels: [
        { height: 54, spec: {
          xTitle: 'Time since start of injection (years)', yTitle: `Rate (${u.label('oilRate')})`, xInclude: [0], yInclude: [0],
          series: [{ name: 'Oil', type: 'line', rgb: RGB.oil, pts: ps.qo, width: 0.55 }, { name: 'Water', type: 'line', rgb: RGB.water, pts: ps.qw, width: 0.55 }],
          lines: bt != null ? [{ x: bt, label: 'breakthrough', rgb: RGB.ref, dash: [1, 1] }] : [],
        } },
        { height: 46, spec: {
          xTitle: 'Time since start of injection (years)', yTitle: 'WOR (STB/STB)', xInclude: [0], yInclude: [0],
          series: [{ name: 'WOR', type: 'line', rgb: RGB.fw, pts: ps.wor, width: 0.55 }],
          lines: [{ y: +s.patternInputs?.worLimit, label: 'WOR limit', rgb: RGB.ref, dash: [1.5, 1] }].filter((l) => Number.isFinite(l.y)),
        } },
      ],
    });
    figs.push({
      id: 'np',
      title: 'Cumulative oil and areal sweep against time',
      caption: `Np in ${u.label('oilVolumeK')}; EA of the ${patternLabel(s.patternInputs?.patternType)} (fraction). At the end ER = ED x EA x EV = ${g((pr.summary?.recoverySplit?.ER ?? NaN) * 100)} % of the pattern OOIP.`,
      panels: [
        { height: 50, spec: { xTitle: 'Time since start of injection (years)', yTitle: `Np (${u.label('oilVolumeK')})`, xInclude: [0], yInclude: [0], series: [{ name: 'Np', type: 'line', rgb: RGB.oil, pts: ps.np, width: 0.55 }] } },
        { height: 46, spec: { xTitle: 'Time since start of injection (years)', yTitle: 'Areal sweep EA', xInclude: [0], yInclude: [0, 1], series: [{ name: 'EA', type: 'line', rgb: RGB.alt, pts: ps.ea, width: 0.55 }] } },
      ],
    });
  } else {
    const why = `Not plotted: the forecast did not run (${(pr?.warnings || [])[0] || 'invalid pattern inputs'}).`;
    figs.push({ id: 'rates', title: 'Pattern forecast: oil and water rates and the water-oil ratio', statement: why });
    figs.push({ id: 'np', title: 'Cumulative oil and areal sweep against time', statement: why });
  }

  // 6. layered sweep
  const dp = dpSeries(s.layeredResult);
  if (dp.length >= 2) {
    figs.push({
      id: 'dp',
      title: 'Dykstra-Parsons vertical coverage against WOR',
      caption: `V ${g(s.layeredResult.V?.V)}, M ${g(s.layeredResult.M)}; one point per layer breakthrough; WOR at reservoir conditions.`,
      panels: [{ height: PANEL, spec: { xTitle: 'WOR (RB/RB)', yTitle: 'Vertical coverage (fraction)', xInclude: [0], yInclude: [0, 1], series: [{ name: 'Coverage', type: 'both', rgb: RGB.water, pts: dp, width: 0.5, marker: 'circle' }] } }],
    });
  } else {
    figs.push({ id: 'dp', title: 'Dykstra-Parsons vertical coverage against WOR', statement: 'Does not apply: fewer than two valid layers.' });
  }

  // 7 and 8. surveillance history on the calendar
  const sr = s.surveillanceResult && !s.surveillanceResult.error ? s.surveillanceResult : null;
  if (sr?.daily_series?.date?.length >= 2) {
    const rs = surveillanceRateSeries(sr, u);
    figs.push({
      id: 'history',
      title: 'Field injection and production rates',
      caption: `Daily field rates as imported (unsmoothed), on the calendar; water in ${u.label('waterRate')}, oil in ${u.label('oilRate')}.`,
      panels: [{ height: PANEL, spec: { xDate: true, xTitle: 'Date', yTitle: `Rate (${u.label('waterRate')}, oil ${u.label('oilRate')})`, yInclude: [0], series: [
        { name: 'Water injected', type: 'line', rgb: RGB.water, pts: rs.inj, width: 0.45 },
        { name: 'Oil', type: 'line', rgb: RGB.oil, pts: rs.oil, width: 0.45 },
        { name: 'Water produced', type: 'line', rgb: RGB.fw, pts: rs.water, width: 0.45 },
      ] } }],
    });
    const v = vrrSeries(sr);
    const target = +s.surveillanceConfig?.target_vrr;
    figs.push({
      id: 'vrr',
      title: 'Voidage replacement ratio',
      caption: `Reservoir barrels injected over reservoir barrels of voidage produced; rolling over ${s.surveillanceConfig?.vrr_window_days || 30} calendar days and cumulative. Target ${g(target)}.`,
      panels: [{ height: PANEL, spec: { xDate: true, xTitle: 'Date', yTitle: 'VRR (RB/RB)', yInclude: [0], series: [
        { name: 'Rolling', type: 'line', rgb: RGB.water, pts: v.rolling, width: 0.45 },
        { name: 'Cumulative', type: 'line', rgb: RGB.oil, pts: v.cum, width: 0.55 },
      ], lines: Number.isFinite(target) ? [{ y: target, label: 'target', rgb: RGB.ref, dash: [1.5, 1] }] : [] } }],
    });
  } else {
    figs.push({ id: 'history', title: 'Field injection and production rates', statement: 'Does not apply: no surveillance history was loaded.' });
    figs.push({ id: 'vrr', title: 'Voidage replacement ratio', statement: 'Does not apply: no surveillance history was loaded.' });
  }

  // 9. Hall plots, one per injector
  if (sr?.hall_plots?.length) {
    sr.hall_plots.forEach((h, i) => {
      const lines = hallWindowLines(h);
      const X = (x) => u.show('waterVolume', x);
      const Y = (y) => u.show('hallIntegral', y) / 1000; // thousands: the kit prints one significant figure from 1e5 up
      const series = [{ name: h.injector, type: 'scatter', rgb: INJ[i % INJ.length], pts: h.cum_injection.map((x, j) => [X(x), Y(h.hall_integral[j])]), marker: 'circle', markerSize: 0.35 }];
      for (const w of lines) series.push({ name: `${w.key} fit`, type: 'line', rgb: w.key === 'baseline' ? RGB.tangent : RGB.ref, pts: w.points.map((p) => [X(p.x), Y(p.y)]), dash: [1.6, 1.0], width: 0.5 });
      const bands = lines.map((w) => ({ x0: X(w.points[0].x), x1: X(w.points[1].x), label: w.key }));
      const slope = (w) => `${g(u.show('hallSlope', w.slope), 4)} ${u.label('hallSlope')}${w.ci95 ? ` (95% ${g(u.show('hallSlope', w.ci95[0]), 3)} to ${g(u.show('hallSlope', w.ci95[1]), 3)})` : ''}`;
      figs.push({
        id: `hall-${h.injector}`,
        title: `Hall plot: ${h.injector}`,
        caption: `${(s.surveillanceConfig?.pressure_basis === 'bottomhole') ? 'Bottomhole' : 'Wellhead'} pressure. Shaded: the two windows with their least-squares lines. ${lines.map((w) => `${w.label}: ${slope(w)}, ${w.n} points`).join('; ')}. Ratio ${g(h.slope_ratio)}.`,
        panels: [{ height: PANEL, spec: { xTitle: `Cumulative water injected (${u.label('waterVolume')})`, yTitle: `Hall integral (10^3 ${u.label('hallIntegral')})`, xInclude: [0], yInclude: [0], series, bands } }],
      });
    });
  } else {
    figs.push({ id: 'hall', title: 'Hall plot', statement: sr ? `Does not apply: ${sr.capabilities?.hall?.reason || 'no injector carries enough pressure points.'}` : 'Does not apply: no surveillance history was loaded.' });
  }

  // 9b. Chan plots, one per series (WF-U2-006): WOR and WOR' on log-log with
  // the late-time window shaded and its fitted line
  const chanList = sr?.chan ? [sr.chan.field, ...(sr.chan.producers || [])].filter(Boolean) : [];
  chanList.forEach((c, i) => {
    const w = c.window || engineChanWindow(c.points);
    const series = [
      { name: 'WOR', type: 'line', rgb: RGB.water, pts: c.points.filter((p) => p.t > 0 && p.wor > 0).map((p) => [p.t, p.wor]), width: 0.5 },
      { name: "WOR'", type: 'line', rgb: RGB.tangent, pts: c.points.filter((p) => p.t > 0 && p.worDeriv > 0).map((p) => [p.t, p.worDeriv]), width: 0.5 },
    ];
    if (Number.isFinite(w.slope) && Number.isFinite(w.intercept)) {
      series.push({ name: 'window fit', type: 'line', rgb: RGB.ref, pts: [w.tFrom, w.tTo].map((t) => [t, Math.exp(w.intercept + w.slope * Math.log(t))]), dash: [1.6, 1.0], width: 0.5 });
    }
    const bands = Number.isFinite(w.tFrom) && Number.isFinite(w.tTo) && w.tTo > w.tFrom ? [{ x0: w.tFrom, x1: w.tTo, label: w.chosen ? 'chosen' : 'late' }] : [];
    figs.push({
      id: `chan-${i}`,
      title: `Chan plot: ${c.producer}`,
      caption: `WOR and WOR' against time since water onset, log-log. Window: ${chanWindowText(w)}; slope ${g(w.slope)}${w.ci95 ? ` (95% ${g(w.ci95[0])} to ${g(w.ci95[1])})` : ''}, ${w.n} points. Indicative reading: ${c.classification?.code || 'indeterminate'}.`,
      panels: [{ height: PANEL, spec: { xTitle: 'Time since water onset (days)', yTitle: "WOR and WOR' (per day)", xLog: true, yLog: true, series, bands } }],
    });
  });

  // 10. Monte Carlo
  if (s.mcSummary) {
    const m = s.mcSummary;
    figs.push({
      id: 'mc',
      title: 'Monte Carlo: cumulative oil',
      statement: `Not plotted: the realizations are not kept with the project. Summary of the run of ${String(m.ranAt || '').slice(0, 16).replace('T', ' ')} UTC: Np P90 ${g(u.show('oilVolumeK', (m.np?.p90 ?? NaN) / 1000), 4)}, P50 ${g(u.show('oilVolumeK', (m.np?.p50 ?? NaN) / 1000), 4)}, P10 ${g(u.show('oilVolumeK', (m.np?.p10 ?? NaN) / 1000), 4)} ${u.label('oilVolumeK')}${Number.isInteger(m.seed) ? `, ${m.iterations} realizations, seed ${m.seed}` : ''} (headline table).`,
    });
  } else {
    figs.push({ id: 'mc', title: 'Monte Carlo: cumulative oil', statement: 'Does not apply: no uncertainty run.' });
  }
  return figs;
}
