// The plots of a Material Balance run as plain models (MBAL-U1, RL6 and
// RL12): title, axes with their units, series in display units, reference
// lines, the numbers printed on the plot and the caption. The Plots tab
// draws a model with Recharts and the report draws the same model with the
// Report Kit, so the two cannot disagree on a point, a label or a unit.
//
// A plot that does not apply to the run is still in the list, with the one
// sentence that says why (`applies: false`, `statement`).
//
// Pure: no React.
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { POINT_STATUS } from './mbalSeries';
import { OILFIELD_UNITS } from './mbalUnits';
import { fmt, sigFmt, regressionInPlace, r2Text } from './reportModel';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Colours by role: [r, g, b] for the PDF and the same colour for the screen. */
export const PLOT_COLOURS = Object.freeze({
  fit: [14, 116, 144], // cyan-700: a point the fit used
  out: [100, 116, 139], // slate-500: a point the fit did not use
  line: [220, 38, 38], // red-600: the fitted line
  level: [217, 119, 6], // amber-600: a reference level
  measured: [14, 116, 144],
  model: [220, 38, 38],
  corrected: [124, 58, 237], // violet-600
  influx: [37, 99, 235], // blue-600
  produced: [100, 116, 139],
  ddi: [22, 163, 74], // green-600
  gdi: [8, 145, 178], // cyan-600
  cdi: [147, 51, 234], // purple-600
  wdi: [37, 99, 235], // blue-600
});
export const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

const leftOutWords = (counts) => {
  const parts = [];
  if (counts.initial) parts.push(`${counts.initial} initial state`);
  if (counts.excluded) parts.push(`${counts.excluded} excluded by the analyst`);
  if (counts.no_expansion) parts.push(`${counts.no_expansion} with no expansion above zero`);
  return parts.length ? parts.join(', ') : 'none';
};

const timeAxis = (dated) => (dated ? { xTitle: 'Date', xDate: true } : { xTitle: 'Timestep', xDate: false });

/**
 * @param {{series: object, result: object, units?: object}} a the series of
 *   lib/mbalSeries buildMbalSeries, the stored result, and the unit view
 * @returns {Array<object>} the plot models, in report order
 */
export function buildPlotModels(a) {
  const u = a.units ?? OILFIELD_UNITS;
  const { series, result } = a;
  const { isGas, regression } = series;
  const symbol = isGas ? 'G' : 'N';
  const inPlaceName = isGas ? 'OGIP' : 'OOIP';
  const inPlaceQ = isGas ? 'gasVolume' : 'stockVolume';
  const models = [];

  // ---- 1. the regression plot, in the space the engine regressed in --------
  {
    const v = regression.variant;
    const all = regression.points.filter((p) => finite(p.x) && finite(p.y));
    const maxY = all.reduce((mx, p) => Math.max(mx, Math.abs(p.y)), 0);
    let xTo; let yTo; let xTitle; let yTitle; let slopeUnit; let interceptUnit;
    if (v.kind === 'pot') {
      // x = dp/E, y = F/E: E in RB per stock-tank (or standard) volume
      const eQ = isGas ? 'expansionGas' : 'fvfOil';
      const fx = u.to('dp', 1) / u.to(eQ, 1);
      const ys = u.scaled(inPlaceQ, maxY);
      // dp/E runs to tens of millions: print it in thousands or millions, named in the axis title
      const maxX = all.reduce((mx, p) => Math.max(mx, Math.abs(p.x * fx)), 0);
      const power = maxX >= 1e5 ? 3 * Math.floor(Math.log10(maxX) / 3) : 0;
      const scale = 10 ** power;
      xTo = (x) => (x * fx) / scale;
      yTo = (y) => ys.to(y);
      xTitle = `${v.xName} (${power ? `10^${power} ` : ''}${u.label('dp')} per ${u.label(eQ)})`;
      yTitle = `${v.yName} (${ys.label})`;
      interceptUnit = ys.label;
      slopeUnit = `${u.label('resVolume')} per ${u.label('dp')}`;
    } else {
      const eQ = isGas ? 'expansionGas' : 'fvfOil';
      const ys = u.scaled('resVolume', maxY);
      xTo = (x) => u.to(eQ, x);
      yTo = (y) => ys.to(y);
      xTitle = `${v.xName} (${u.label(eQ)})`;
      yTitle = `${v.yName} (${ys.label})`;
      interceptUnit = ys.label;
      slopeUnit = u.scaled(inPlaceQ, regression.slope ?? 0).label;
    }
    const pick = (status) => all.filter((p) => (status === 'fit' ? p.status === 'fit' : p.status !== 'fit'));
    const inPlace = regressionInPlace(a);
    const ips = u.scaled(inPlaceQ, inPlace ?? 0);
    const slopeText = v.kind === 'pot'
      ? sigFmt(finite(regression.slope) ? u.to('resVolume', regression.slope) / u.to('dp', 1) : null, 4)
      : fmt(u.scaled(inPlaceQ, regression.slope ?? 0).to(regression.slope), 3);
    const interceptText = finite(regression.intercept) ? sigFmt(yTo(regression.intercept), 4) : EMPTY_VALUE;
    const notes = [
      `${symbol} = ${finite(inPlace) ? `${fmt(ips.to(inPlace), 2)} ${ips.label}` : EMPTY_VALUE} (${v.inPlaceFrom})`,
      `slope = ${slopeText} ${slopeUnit}`,
      `intercept = ${interceptText} ${interceptUnit}`,
      `r2 = ${r2Text(regression.r2)}, ${finite(regression.n) ? regression.n : regression.counts.fit} points`,
    ];
    const out = pick('out');
    models.push({
      id: 'regression',
      title: v.title,
      applies: true,
      xTitle, yTitle, xDate: false,
      series: [
        { key: 'fit', name: 'In the fit', type: 'scatter', colour: 'fit', pts: pick('fit').map((p) => [xTo(p.x), yTo(p.y)]), steps: pick('fit').map((p) => p.timestep_index) },
        { key: 'out', name: 'Not in the fit', type: 'scatter', colour: 'out', marker: 'square', pts: out.map((p) => [xTo(p.x), yTo(p.y)]), steps: out.map((p) => p.timestep_index) },
        { key: 'line', name: 'Fitted line', type: 'line', colour: 'line', pts: regression.line.map(([x, y]) => [xTo(x), yTo(y)]), steps: null },
      ],
      lines: [],
      notes,
      notesAt: 'top-left',
      caption: `${v.method} Points left out of the fit: ${leftOutWords(regression.counts)}${out.length ? ' (squares)' : ''}. The line is the engine's own slope and intercept.`,
      detail: { statusBy: Object.fromEntries(regression.points.map((p) => [p.timestep_index, POINT_STATUS[p.status]])) },
    });
  }

  // ---- 2. Campbell (oil) ---------------------------------------------------
  if (!isGas && series.campbell) {
    const c = series.campbell;
    const xs = u.scaled('resVolume', c.points.reduce((mx, p) => Math.max(mx, p.x), 0));
    const ys = u.scaled('stockVolume', Math.max(c.level ?? 0, ...c.points.map((p) => p.y)));
    const conv = (pts) => pts.map(([x, y]) => [xs.to(x), ys.to(y)]);
    const idx = (inFit) => c.points.filter((p) => p.inFit === inFit).map((p) => p.timestep_index);
    models.push({
      id: 'campbell',
      title: 'Campbell plot: F/Et against F',
      applies: c.points.length > 0,
      statement: c.points.length ? null : 'Not plotted: no timestep has a withdrawal and an expansion above zero.',
      xTitle: `F (${xs.label})`, yTitle: `F/Et (${ys.label})`, xDate: false,
      yInclude: finite(c.level) ? [ys.to(c.level)] : undefined,
      series: [
        { key: 'fit', name: 'In the fit', type: 'scatter', colour: 'fit', pts: conv(c.inFit), steps: idx(true) },
        { key: 'out', name: 'Not in the fit', type: 'scatter', colour: 'out', marker: 'square', pts: conv(c.notInFit), steps: idx(false) },
      ],
      lines: finite(c.level) ? [{ y: ys.to(c.level), label: `${inPlaceName} of this run ${fmt(ys.to(c.level), 2)} ${ys.label}`, colour: 'level' }] : [],
      notes: [],
      caption: 'Apparent oil in place at each timestep with no aquifer term. A level line means depletion drive; points that rise with F mean water influx supports the pressure, and they sit above the oil in place of the run.',
    });
  } else {
    models.push({ id: 'campbell', title: 'Campbell plot: F/Et against F', applies: false, series: [], lines: [], notes: [], statement: 'Does not apply: the Campbell plot is an oil reservoir diagnostic. The Cole plot is its gas equivalent.' });
  }

  // ---- 3. Cole (gas) -------------------------------------------------------
  if (isGas && series.cole) {
    const c = series.cole;
    const xs = u.scaled('gasVolume', c.points.reduce((mx, p) => Math.max(mx, p.x), 0));
    const ys = u.scaled('gasVolume', Math.max(c.level ?? 0, ...c.points.map((p) => p.y)));
    const conv = (pts) => pts.map(([x, y]) => [xs.to(x), ys.to(y)]);
    const idx = (inFit) => c.points.filter((p) => p.inFit === inFit).map((p) => p.timestep_index);
    models.push({
      id: 'cole',
      title: 'Cole plot: F/Eg against Gp',
      applies: c.points.length > 0,
      statement: c.points.length ? null : 'Not plotted: no timestep has a gas expansion above zero.',
      xTitle: `Gp (${xs.label})`, yTitle: `F/Eg (${ys.label})`, xDate: false,
      yInclude: finite(c.level) ? [ys.to(c.level)] : undefined,
      series: [
        { key: 'fit', name: 'In the fit', type: 'scatter', colour: 'fit', pts: conv(c.inFit), steps: idx(true) },
        { key: 'out', name: 'Not in the fit', type: 'scatter', colour: 'out', marker: 'square', pts: conv(c.notInFit), steps: idx(false) },
      ],
      lines: finite(c.level) ? [{ y: ys.to(c.level), label: `${inPlaceName} of this run ${fmt(ys.to(c.level), 2)} ${ys.label}`, colour: 'level' }] : [],
      notes: [],
      caption: 'Apparent gas in place at each timestep with no aquifer or compressibility term. A level line means depletion drive; a rising or humped line means water influx, and the points sit above the gas in place of the run.',
    });
  } else {
    models.push({ id: 'cole', title: 'Cole plot: F/Eg against Gp', applies: false, series: [], lines: [], notes: [], statement: 'Does not apply: the Cole plot is a gas reservoir diagnostic. The Campbell plot is its oil equivalent.' });
  }

  // ---- 4. p/z (gas) --------------------------------------------------------
  if (isGas && series.pz) {
    const z = series.pz;
    const xMax = Math.max(z.apparentOgip ?? 0, z.ogip ?? 0, ...z.points.map((p) => p.x));
    const xs = u.scaled('gasVolume', xMax);
    const pDigits = u.unit('pressure') === 'psi' ? 0 : 1;
    const conv = (pts) => pts.map(([x, y]) => [xs.to(x), u.to('pressure', y)]);
    const idx = (inFit) => z.points.filter((p) => p.inFit === inFit).map((p) => p.timestep_index);
    const notes = [];
    if (finite(z.apparentOgip)) notes.push(`p/z line to zero: ${fmt(xs.to(z.apparentOgip), 2)} ${xs.label} (apparent)`);
    if (finite(z.ogip)) notes.push(`${inPlaceName} of this run: ${fmt(xs.to(z.ogip), 2)} ${xs.label}`);
    if (z.fit) notes.push(`p/z at Gp = 0: ${fmt(u.to('pressure', z.fit.intercept), pDigits)} ${u.label('pressure')}, r2 = ${r2Text(z.fit.r2)}`);
    models.push({
      id: 'pz',
      title: 'p/z against cumulative gas',
      applies: z.points.length > 1,
      statement: z.points.length > 1 ? null : 'Not plotted: fewer than two timesteps carry a p/z value.',
      xTitle: `Gp (${xs.label})`, yTitle: `p/z (${u.label('pressure')})`, xDate: false,
      yInclude: [0],
      series: [
        { key: 'fit', name: 'In the fit', type: 'scatter', colour: 'fit', pts: conv(z.inFit), steps: idx(true) },
        { key: 'out', name: 'Not in the fit', type: 'scatter', colour: 'out', marker: 'square', pts: conv(z.notInFit), steps: idx(false) },
        { key: 'line', name: 'Fitted line to p/z = 0', type: 'line', colour: 'line', pts: conv(z.line), steps: null },
        { key: 'corrected', name: 'Corrected for rock and water (Ramagost-Farshad)', type: 'both', colour: 'corrected', dash: [1.2, 1], pts: conv(z.ramagost), steps: null },
      ],
      lines: finite(z.ogip) ? [{ x: xs.to(z.ogip), label: `${inPlaceName} of this run`, colour: 'level' }] : [],
      notes,
      caption: 'Least squares through the initial point and the points of the fit, taken to p/z = 0. With water influx the line overstates the gas in place, because the influx holds the pressure up: compare its end with the gas in place of the run. The corrected points remove the rock and connate water compressibility term (Ramagost and Farshad, 1981).',
    });
  } else {
    models.push({ id: 'pz', title: 'p/z against cumulative gas', applies: false, series: [], lines: [], notes: [], statement: 'Does not apply: p/z is a gas reservoir plot. This case is an oil reservoir.' });
  }

  // ---- 5. pressure history: measured, and the model of a history match -----
  {
    const p = series.pressure;
    const conv = (pts) => pts.map(([x, y]) => [x, u.to('pressure', y)]);
    const hm = result?.plot_data?.history_match ?? null;
    const sim = p.hasSimulation;
    models.push({
      id: 'pressure',
      title: sim ? 'Pressure history match: model against measured' : 'Measured pressure history',
      applies: p.measured.length > 0,
      statement: p.measured.length ? null : 'Not plotted: the run holds no pressures.',
      ...timeAxis(p.dated),
      yTitle: `Reservoir pressure (${u.label('pressure')})`,
      series: [
        { key: 'measured', name: 'Measured, in the fit', type: 'scatter', colour: 'measured', pts: conv(p.measuredInFit), steps: null },
        { key: 'measuredOut', name: 'Measured, not in the fit', type: 'scatter', colour: 'out', marker: 'square', pts: conv(p.measuredOut), steps: null },
        ...(sim ? [{ key: 'model', name: 'Model (simulated)', type: 'line', colour: 'model', pts: conv(p.simulated), steps: null }] : []),
      ],
      lines: [],
      notes: sim && hm ? [`RMS error ${fmt(u.to('dp', hm.rms_error_psi), 2)} ${u.label('dp')}`, `largest miss ${fmt(u.to('dp', hm.max_abs_error_psi), 2)} ${u.label('dp')}`] : [],
      caption: sim
        ? 'Pressures simulated by the tank model at the matched parameters, against the measured pressures. The fit minimises the difference over the points marked as in the fit.'
        : 'Measured pressures only. This run is a regression: it solves the in-place volume from the measured pressures and simulates none, so there is no model line. A pressure history match on the Run tab adds it.',
    });
  }

  // ---- 6. aquifer influx ----------------------------------------------------
  {
    const w = series.influx;
    const aquifer = regression.variant.aquifer;
    if (aquifer === 'none' || !w.influx.length) {
      models.push({ id: 'influx', title: 'Cumulative water influx against time', applies: false, series: [], lines: [], notes: [], statement: 'Does not apply: the run has no aquifer model, so the water influx We is zero at every timestep.' });
    } else {
      const ys = u.scaled('resVolume', Math.max(...w.influx.map((p) => Math.abs(p[1])), ...w.produced.map((p) => Math.abs(p[1])), 0));
      const conv = (pts) => pts.map(([x, y]) => [x, ys.to(y)]);
      const anyProduced = w.produced.some((p) => p[1] > 0);
      models.push({
        id: 'influx',
        title: 'Cumulative water influx against time',
        applies: true,
        ...timeAxis(w.dated),
        yTitle: `Reservoir volume (${ys.label})`,
        yInclude: [0],
        series: [
          { key: 'influx', name: 'Water influx We', type: 'both', colour: 'influx', pts: conv(w.influx), steps: null },
          ...(anyProduced ? [{ key: 'produced', name: 'Water produced Wp Bw', type: 'both', colour: 'produced', marker: 'square', dash: [1.2, 1], pts: conv(w.produced), steps: null }] : []),
        ],
        lines: [],
        notes: [],
        caption: aquifer === 'pot'
          ? 'We of the pot aquifer: the fitted water in place times the aquifer compressibility times the pressure drop, so it follows the pressure with no lag.'
          : `We marched through time from the ${aquifer === 'fetkovich' ? 'Fetkovich' : 'Carter-Tracy'} aquifer parameters of the inputs table. It is an input of the regression.`,
      });
    }
  }

  // ---- 7. drive indices against time, stacked -------------------------------
  {
    const d = series.drive;
    models.push({
      id: 'drive',
      title: 'Drive indices against time',
      applies: d.steps.length > 0,
      statement: d.steps.length ? null : 'Not plotted: the run stored no drive indices.',
      ...timeAxis(d.dated),
      yTitle: 'Drive index (fraction of the hydrocarbon voidage)',
      yInclude: [0, 1],
      series: d.defs.map((def) => ({
        key: def.key, name: def.label, type: 'bar', colour: def.key, pts: d.steps.map((s) => [s.x, s[def.key]]), steps: d.steps.map((s) => s.timestep_index),
      })),
      lines: [{ y: 1, label: 'Sum 1', colour: 'line' }],
      notes: [],
      caption: `Stacked in the order of the legend, one bar per timestep after the initial state. ${isGas ? 'Denominator Gp Bg' : 'Denominator F - Wp Bw'}, water produced netted inside the water drive index. A stack that ends away from 1 measures how far the fitted in-place volume is from that timestep.`,
    });
  }
  return models;
}

/** The plot models as Report Kit figures. */
export function toKitFigures(models, { height = 78 } = {}) {
  return models.map((m) => {
    if (!m.applies) return { id: m.id, title: m.title, statement: m.statement };
    const bars = m.series.some((s) => s.type === 'bar');
    return {
      id: m.id,
      title: m.title,
      caption: m.caption,
      panels: [{
        height,
        spec: {
          xTitle: m.xTitle, yTitle: m.yTitle, xDate: m.xDate, yInclude: m.yInclude,
          xInclude: bars || m.xDate ? undefined : [0],
          series: m.series.filter((s) => s.pts.length).map((s) => ({
            name: s.name, type: s.type, rgb: PLOT_COLOURS[s.colour], pts: s.pts, marker: s.marker, dash: s.dash, markerSize: 0.8,
          })),
          lines: m.lines.map((l) => ({ x: l.x, y: l.y, label: l.label, rgb: PLOT_COLOURS[l.colour], dash: [1.5, 1] })),
          notes: m.notes,
          notesAt: m.notesAt,
        },
      }],
    };
  });
}
