/**
 * The figures of the Well Test Analysis Studio report (tester round 2,
 * 2026-10-02, items 6 to 11): test overview, log-log diagnostic with the
 * model match and the flow-regime windows, Horner or MDH semilog with its
 * fitted line and window, the square-root-of-time plot when linear flow is
 * in play, the history match, and the rate transient plots when that
 * section has data.
 *
 * One function turns the studio state into a list of figures. Each figure
 * is either a plot (one or two panels with a caption that says what it
 * shows) or a statement of why the plot does not apply. The series come
 * from the plotData builders, the same arrays the tabs draw, so the report
 * has no calculation of its own. The Report tab lists the same figures the
 * PDF draws.
 */
import {
  buildLoglogData, buildSemilogData, buildSqrtData, buildRtaLoglogData, buildFmbData,
} from './plotData.js';
import { fromOilfield, unitLabel } from './units.js';
import { PLOT_RGB } from './pdfPlot.js';

const sig = (v, n = 3) => (Number.isFinite(v) ? String(parseFloat(Number(v).toPrecision(n))) : 'n/a');
const xy = (rows, xk, yk) => rows.map((r) => [r[xk], r[yk]]);

const WINDOW_WORDS = {
  manual: 'window set by the analyst',
  radial: 'window taken from the detected radial flow',
  full: 'no radial flow detected, so the line runs through every point',
};

/**
 * @param {object} s the studio context value (or the same fields)
 * @returns {Array<{id: string, title: string, caption?: string,
 *   panels?: Array<{height: number, spec: object}>, statement?: string}>}
 */
export function buildReportFigures(s) {
  const figures = [];
  const config = s.configSpec?.config;
  const reservoir = s.reservoirSpec?.reservoir;
  const unitSystem = s.unitSystem || 'oilfield';
  const isGas = reservoir?.fluid === 'gas';
  const isBuildup = config?.family === 'buildup';
  const dpKind = isGas ? 'pseudoPressure' : 'pressure';
  const dpName = isGas ? 'dm(p)' : 'dp';
  const pU = unitLabel('pressure', unitSystem);
  const dpU = unitLabel(dpKind, unitSystem);
  const hasMatch = s.derivedKpis?.source === 'match' && !!s.modelSeries;
  const timeName = s.pseudoTime?.active ? 'pseudo-time' : 'time';

  // 1. Test overview --------------------------------------------------------
  const ov = s.overview;
  if (ov?.pressure?.length) {
    // both panels span the same test clock
    const tSpan = [Math.min(0, ...ov.rate.map((r) => r.t), ov.pressure[0].t), ov.pressure[ov.pressure.length - 1].t];
    const panels = [{
      height: 66,
      spec: {
        xTitle: ov.xLabel,
        xInclude: tSpan,
        yTitle: `Pressure (${ov.pressureUnit})`,
        y2Title: ov.rate.length ? `Rate (${ov.rateUnit})` : undefined,
        series: [
          { name: 'Gauge pressure', type: 'line', rgb: PLOT_RGB.pressure, pts: xy(ov.pressure, 't', 'p') },
          ...(ov.rate.length ? [{ name: ov.rateDerived ? 'Rate (test setup)' : 'Rate', type: 'line', rgb: PLOT_RGB.rate, pts: xy(ov.rate, 't', 'q'), axis: 'y2', width: 0.6 }] : []),
        ],
      },
    }];
    let tempSentence;
    if (ov.hasTemperature) {
      panels.push({
        height: 40,
        spec: {
          xTitle: ov.xLabel,
          xInclude: tSpan,
          yTitle: `Temperature (${ov.temperatureUnit})`,
          series: [{ name: 'Gauge temperature', type: 'line', rgb: PLOT_RGB.temperature, pts: xy(ov.temperature, 't', 'T') }],
        },
      });
      tempSentence = 'The lower panel is the gauge temperature from the imported file.';
    } else {
      tempSentence = 'No temperature column was imported with the gauge data, so temperature is not plotted.';
    }
    figures.push({
      id: 'overview',
      title: 'Test overview',
      caption: `Gauge pressure${ov.rate.length ? ' and rate' : ''} against test time over the whole gauge record (${ov.pressure.length} readings plotted). `
        + `${ov.clockNote} ${ov.rate.length ? (ov.rateDerived ? 'No rate history was entered: the rate is the test setup rate.' : 'Rate from the entered rate history.') : 'No rate is available to plot.'} ${tempSentence}`,
      panels,
    });
  } else {
    figures.push({ id: 'overview', title: 'Test overview', statement: 'No gauge data is loaded, so there is nothing to plot.' });
  }

  // 2. Log-log diagnostic with the model match ----------------------------------
  const ll = buildLoglogData({ loglog: s.loglog || [], modelSeries: hasMatch ? s.modelSeries : null, dpKind, unitSystem });
  if (ll.points.length) {
    const regimes = s.regimes || [];
    const xTitle = isBuildup ? `Agarwal equivalent ${timeName} (hr)` : `Elapsed ${timeName} (hr)`;
    figures.push({
      id: 'loglog',
      title: 'Log-log diagnostic plot',
      caption: `Pressure change and Bourdet derivative against ${isBuildup ? `Agarwal equivalent ${timeName}` : `elapsed ${timeName}`}. `
        + (hasMatch
          ? `The lines are the ${s.model?.label || 'model'} match (${s.matchMethod?.kind === 'regression' ? 'regression' : 'manual match'}). `
          : 'No model has been matched, so the plot shows the data only. ')
        + (regimes.length
          ? `Shaded bands mark the detected flow regimes: ${regimes.map((r) => `${r.label.toLowerCase()} ${sig(r.xStart)} to ${sig(r.xEnd)} hr`).join('; ')}.`
          : 'No sustained flow regime was detected.'),
      panels: [{
        height: 88,
        spec: {
          xTitle,
          yTitle: `${dpName} and derivative (${dpU})`,
          xLog: true,
          yLog: true,
          bands: regimes.map((r) => ({ x0: r.xStart, x1: r.xEnd, label: r.label })),
          series: [
            { name: dpName, type: 'scatter', rgb: PLOT_RGB.dp, pts: xy(ll.points, 'x', 'dp') },
            { name: 'Bourdet derivative', type: 'scatter', rgb: PLOT_RGB.derivative, pts: xy(ll.points, 'x', 'derivative') },
            ...(ll.model ? [
              { name: `Model ${dpName}`, type: 'line', rgb: PLOT_RGB.model, pts: xy(ll.model, 'x', 'modelDp'), width: 0.5 },
              { name: 'Model derivative', type: 'line', rgb: PLOT_RGB.modelDeriv, pts: xy(ll.model, 'x', 'modelDerivative'), width: 0.5 },
            ] : []),
          ],
        },
      }],
    });
  } else {
    figures.push({ id: 'loglog', title: 'Log-log diagnostic plot', statement: 'No diagnostic series: load gauge data and valid reservoir inputs first.' });
  }

  // 3. Horner or MDH ------------------------------------------------------------
  const sl = buildSemilogData({ prepared: s.prepared, config, semilogResult: s.semilogResult, unitSystem });
  if (sl.points.length && s.semilogResult) {
    const slopeKind = isGas ? 'pseudoSlope' : 'semilogSlope';
    const m = fromOilfield(slopeKind, s.semilogResult.m, unitSystem);
    const slopeText = `Slope m = ${isGas ? Number(m).toExponential(3) : Number(m).toFixed(1)} ${unitLabel(slopeKind, unitSystem)}`;
    const w = sl.window;
    const windowText = w ? `Fit window ${sig(w.tMin)} to ${sig(w.tMax)} hr (${w.n} points)` : 'Fit window not set';
    figures.push({
      id: 'semilog',
      title: `${sl.name} semilog plot`,
      caption: `${isBuildup ? 'Shut-in pressure against the Horner time ratio' : 'Flowing pressure against elapsed time'}, with the fitted straight line. `
        + `${slopeText}. ${windowText}; ${WINDOW_WORDS[s.semilogWindowSource] || 'window as set'}. The shaded band is the fit window.`
        + (isGas ? ' The line is fitted in pseudo-pressure and drawn back in pressure.' : ''),
      panels: [{
        height: 84,
        spec: {
          xTitle: sl.xLabel,
          yTitle: `Pressure (${pU})`,
          xLog: true,
          xReversed: isBuildup,
          bands: w ? [{ x0: w.xMin, x1: w.xMax, label: 'Fit window', rgb: PLOT_RGB.fit }] : [],
          notes: [slopeText, windowText],
          series: [
            { name: isBuildup ? 'pws' : 'pwf', type: 'scatter', rgb: PLOT_RGB.dp, pts: xy(sl.points, 'x', 'pressure') },
            { name: 'Straight line', type: 'line', rgb: PLOT_RGB.fit, pts: xy(sl.points.filter((p) => p.fitted != null), 'x', 'fitted'), width: 0.5 },
          ],
        },
      }],
    });
  } else {
    figures.push({
      id: 'semilog',
      title: `${isBuildup ? 'Horner' : 'MDH'} semilog plot`,
      statement: 'No semilog line: it needs valid reservoir inputs and at least 4 points in the window.',
    });
  }

  // 4. sqrt(t), only when linear flow is identified or claimed --------------------
  if (s.sqrtMeaningful && s.sqrtResult && s.prepared?.points?.length) {
    const sq = buildSqrtData({ prepared: s.prepared, sqrtResult: s.sqrtResult, dpKind, unitSystem });
    const slope = fromOilfield(dpKind, s.sqrtResult.slope, unitSystem);
    const slopeText = `Slope = ${Number(slope).toFixed(2)} ${dpU}/hr^0.5`;
    figures.push({
      id: 'sqrt',
      title: 'Square-root-of-time plot',
      caption: `Pressure change against sqrt(t) with the fitted line, for the linear flow ${(s.regimes || []).some((r) => r.regime === 'linear') ? 'detected on the derivative' : 'window set by the analyst'}. ${slopeText}, r2 ${Number(s.sqrtResult.r2).toFixed(3)}.`,
      panels: [{
        height: 80,
        spec: {
          xTitle: 'sqrt(t) (hr^0.5)',
          yTitle: `${dpName} (${dpU})`,
          notes: [slopeText],
          series: [
            { name: dpName, type: 'scatter', rgb: PLOT_RGB.dp, pts: xy(sq, 'x', 'dp') },
            { name: 'Fit', type: 'line', rgb: PLOT_RGB.fit, pts: xy(sq.filter((p) => p.fitted != null), 'x', 'fitted'), width: 0.5 },
          ],
        },
      }],
    });
  } else {
    figures.push({
      id: 'sqrt',
      title: 'Square-root-of-time plot',
      statement: 'Does not apply: no linear flow regime was identified on the derivative and no linear-flow window was set.',
    });
  }

  // 5. History match ------------------------------------------------------------
  const hm = s.historyMatch;
  if (hasMatch && hm?.points?.length && hm.hasModel) {
    const model = hm.points.filter((p) => p.model != null);
    figures.push({
      id: 'history',
      title: 'History match',
      caption: `Gauge pressure and the ${s.model?.label || 'model'} pressure at the same times, against ${isBuildup ? 'shut-in' : 'elapsed'} time`
        + (hm.hasPrior
          ? ', including the period before the shut-in held in the gauge record (negative hours). That period is modelled at the constant test rate for the producing time from the initial pressure.'
          : (isBuildup ? '. The gauge record holds no readings before the shut-in, so the plot covers the shut-in period.' : ' over the whole flow period.')),
      panels: [{
        height: 80,
        spec: {
          xTitle: isBuildup ? 'Shut-in time (hr)' : 'Elapsed time (hr)',
          yTitle: `Pressure (${hm.pressureUnit || pU})`,
          series: [
            { name: 'Gauge', type: 'scatter', rgb: PLOT_RGB.pressure, pts: xy(hm.points, 'time', 'observed') },
            { name: 'Model', type: 'line', rgb: PLOT_RGB.model, pts: xy(model, 'time', 'model'), width: 0.5 },
          ],
        },
      }],
    });
  } else {
    figures.push({
      id: 'history',
      title: 'History match',
      statement: 'No model has been matched yet, so there is no history match to show. Adjust the sliders or run Auto-fit on the Match tab.',
    });
  }

  // 6. Rate transient analysis, only when that section has data -------------------
  const rta = s.rtaResult;
  if (rta?.rows?.length) {
    const rl = buildRtaLoglogData({ rtaResult: rta, unitSystem });
    const fm = buildFmbData({ rtaResult: rta, reservoir, unitSystem });
    const norm = rta.isGas ? 'dm(p)/q' : 'dp/q';
    const panels = [];
    if (fm.points.length) {
      panels.push({
        height: 70,
        spec: {
          xTitle: fm.xLabel,
          yTitle: `${norm} (${fm.unit})`,
          series: [
            { name: 'Data', type: 'scatter', rgb: PLOT_RGB.dp, pts: xy(fm.points, 'x', 'observed') },
            { name: 'FMB line', type: 'line', rgb: PLOT_RGB.fit, pts: xy(fm.points, 'x', 'line'), width: 0.5 },
          ],
        },
      });
    }
    if (rl.points.length) {
      panels.push({
        height: 70,
        spec: {
          xTitle: 'Material-balance time te (days)',
          yTitle: `${norm} and derivative (${rl.unit})`,
          xLog: true,
          yLog: true,
          series: [
            { name: norm, type: 'scatter', rgb: PLOT_RGB.dp, pts: xy(rl.points, 'x', 'y') },
            { name: 'Derivative', type: 'scatter', rgb: PLOT_RGB.derivative, pts: xy(rl.points, 'x', 'derivative') },
          ],
        },
      });
    }
    if (panels.length) {
      figures.push({
        id: 'rta',
        title: 'Rate transient analysis plots',
        caption: `${fm.points.length ? `Flowing material balance: rate-normalized pressure against material-balance ${rta.isGas ? 'pseudo-time' : 'time'} with the regression line. ` : ''}`
          + `${rl.points.length ? 'Rate-normalized pressure and its derivative against material-balance time on log-log axes. ' : ''}`
          + `${rta.rows.length} production points.`,
        panels,
      });
    } else {
      figures.push({ id: 'rta', title: 'Rate transient analysis plots', statement: 'Production data is loaded but gives no plottable points.' });
    }
  } else {
    figures.push({
      id: 'rta',
      title: 'Rate transient analysis plots',
      statement: 'Rate transient analysis was not run: no production data is loaded on the RTA tab.',
    });
  }

  return figures.map((f, i) => ({ ...f, number: i + 1 }));
}
