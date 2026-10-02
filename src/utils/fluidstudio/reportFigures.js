/**
 * The figures of the Fluid Systems Studio report (FLUID-U1, RL6): the list
 * the PDF draws and the Report tab lists. Every plotted figure takes its
 * points from the builders the screen charts use (pvtSeries.js), so the
 * drawing and the screen are one series. A figure that does not apply is
 * still listed, with the reason.
 *
 * Pure: returns Report Kit figure entries ({ id, title, caption, panels }
 * or { id, title, statement }).
 */
import {
  buildPvtSeries, buildLabOverlay, buildEnvelopeSeries, labPlotIds, PB_RGB, LAB_RGB,
} from './pvtSeries.js';
import { fluidUnits } from './units.js';
import { envelopeRequest } from './eosAnalysis.js';
import { labDataForSeries } from './pvtSeries.js';

const pts = (list) => list.map((p) => [p.x, p.y]);
const PANEL = 58;

/** The key the envelope card stores a trace under: the request it was traced for. */
export const envelopeKey = (composition) => JSON.stringify(envelopeRequest(composition));

/**
 * @param {{model: object, inputs: object, results: object, eos: ?object,
 *   envelope?: ?{result: object, requestKey: string}, system?: string}} a
 *   `model` is buildFluidReportModel's result
 */
export function buildFluidReportFigures({ model, inputs, results, eos, envelope = null, system = 'oilfield' }) {
  if (!model) return [];
  const u = fluidUnits(system);
  const series = buildPvtSeries({ rows: model.pvtRows, pb: model.pb, system, satKind: model.satKind, labData: labDataForSeries(inputs) });
  const T = `${Number(u.show('temperature', model.tempF).toFixed(1))} ${u.label('temperature')}`;
  const pbLine = series.pb != null ? [{ x: series.pb, label: series.pbLabel, rgb: [...PB_RGB], dash: [1.5, 1.2] }] : [];
  const methodOf = (key) => model.methods.rows.find((r) => r[0] === key)?.[1] || '';
  const METHOD_LABEL = {
    bo: 'Oil formation volume factor Bo', rs: 'Solution GOR Rs', muo: 'Live (saturated) oil viscosity', z: 'Gas deviation factor Z', bg: 'Gas formation volume factor Bg',
  };
  const figures = [];

  for (const plot of series.plots) {
    if (plot.id === 'relvol') continue; // a laboratory comparison: drawn with the lab figures below
    const id = `pvt-${plot.id}`;
    if (plot.points.length < 2) {
      figures.push({ id, title: `${plot.title} against pressure`, statement: `Not plotted: the table holds fewer than two values of ${plot.short}.` });
      continue;
    }
    const extra = plot.id === 'bg' ? ' Logarithmic scale.' : plot.id === 'muo' ? ' Above the saturation pressure the undersaturated method applies.' : '';
    figures.push({
      id,
      title: `${plot.title} against pressure`,
      caption: `${plot.short} at ${T}. Method: ${methodOf(METHOD_LABEL[plot.id])}. The dashed line marks the ${model.satKind === 'dew' ? 'dew point' : 'bubble point'} (${series.pbLabel.replace(/^(Pb|Dew point) /, '')}). ${plot.points.length} points, the series of the screen chart.${extra}`,
      panels: [{
        height: PANEL,
        spec: {
          xTitle: series.xTitle, yTitle: plot.yTitle, yLog: plot.yLog, xInclude: [0],
          series: [{ name: plot.yTitle, type: 'line', rgb: plot.rgb, pts: pts(plot.points), width: 0.5 }],
          lines: pbLine,
        },
      }],
    });
  }

  // laboratory values against the model: the tables loaded at the lab data
  // door (FLUID-U2-001) and, in compositional mode, the single values of the
  // Lab tuning card. A panel for each property with a laboratory value.
  const composition = inputs?.streamA?.composition;
  const lab = model.mode === 'eos'
    ? buildLabOverlay({ lab: composition?.tuning?.lab, flashPressure: Number(composition?.pressure), flashTempF: Number(composition?.temp), modelPb: model.pb, system })
    : null;
  const tuningIds = lab ? labPlotIds(lab) : [];
  const stats = model.lab?.stats || [];
  const labPanel = (plot) => {
    const table = plot.lab;
    const single = lab?.points?.[plot.id] || [];
    const points = [...table, ...single];
    return {
      height: PANEL,
      spec: {
        xTitle: series.xTitle, yTitle: plot.yTitle, yLog: plot.yLog, xInclude: [0],
        series: [
          { name: `Model ${plot.short}`, type: 'line', rgb: plot.rgb, pts: pts(plot.points), width: 0.5 },
          ...(points.length ? [{ name: `Laboratory ${plot.short}`, type: 'scatter', rgb: [...LAB_RGB], pts: pts(points), marker: 'circle' }] : []),
        ],
        lines: [...pbLine, ...(lab?.psat && tuningIds.includes(plot.id) ? [{ x: lab.psat.x, label: lab.psat.label, rgb: [...LAB_RGB], dash: [0.6, 0.9] }] : [])],
      },
    };
  };
  const withLab = series.plots.filter((p) => p.points.length >= 2 && (p.lab.length || tuningIds.includes(p.id)));
  const sentence = (id) => {
    const m = stats.find((x) => x.id === id);
    return m ? model.lab.sentences[stats.indexOf(m)] : '';
  };
  const tuningParts = [];
  if (lab && tuningIds.length) {
    if (lab.points.bo.length + lab.points.rs.length) tuningParts.push('The measured separator-test values of the Lab tuning card are among the points.');
    if (lab.psat) tuningParts.push('The measured saturation pressure is the dotted line.');
    tuningParts.push(model.tuning.status === 'tuned' ? 'The model is tuned to these values; the tuning table gives the errors.' : 'The model is not tuned to these values.');
    tuningParts.push(...lab.notes);
  }
  const groups = [
    { id: 'lab', title: 'Laboratory values against the model: oil properties', ids: ['bo', 'rs', 'muo'], none: 'oil property' },
    { id: 'lab-gas', title: 'Laboratory values against the model: gas properties and relative volume', ids: ['z', 'bg', 'relvol'], none: 'gas property or relative volume' },
  ];
  for (const g of groups) {
    const plots = withLab.filter((p) => g.ids.includes(p.id));
    if (plots.length) {
      const parts = ['Model curves with the laboratory values as points.'];
      const misfit = plots.map((p) => sentence(p.id)).filter(Boolean);
      if (misfit.length) parts.push(`Misfit of the model: ${misfit.join(' ')}`);
      if (g.id === 'lab' && model.lab?.comparison.basis.text) parts.push(model.lab.comparison.basis.text);
      if (g.id === 'lab') parts.push(...tuningParts);
      figures.push({
        id: g.id,
        title: g.title,
        caption: parts.join(' '),
        panels: plots.map(labPanel),
      });
    } else {
      let why;
      if (model.lab) why = `Does not apply: the laboratory tables loaded hold no ${g.none}.`;
      else if (g.id === 'lab' && model.mode === 'eos') why = lab ? `Does not apply: the laboratory values entered are not pressure curves. ${lab.notes.join(' ')}`.trim() : 'Does not apply: no laboratory table is loaded and no laboratory value is entered in the Lab tuning card.';
      else why = 'Does not apply: no laboratory table is loaded.';
      figures.push({ id: g.id, title: g.title, statement: why });
    }
  }

  // phase envelope
  if (model.mode !== 'eos') {
    figures.push({ id: 'envelope', title: 'Pressure and temperature phase envelope', statement: 'Does not apply: a phase envelope needs a composition, and this report is of the black-oil correlations.' });
  } else {
    const current = envelope?.result && envelope.requestKey === envelopeKey(composition);
    const env = current ? buildEnvelopeSeries({ result: envelope.result, flashTempF: Number(composition?.temp), flashPressure: Number(composition?.pressure), system }) : null;
    if (env && (env.bubble.length + env.dew.length) >= 2) {
      const s = [];
      if (env.bubble.length) s.push({ name: 'Bubble points', type: 'both', rgb: [5, 150, 105], pts: pts(env.bubble), marker: 'circle', width: 0.5 });
      if (env.dew.length) s.push({ name: 'Dew points', type: 'both', rgb: [37, 99, 235], pts: pts(env.dew), marker: 'circle', width: 0.5, dash: [1.5, 1.2] });
      if (env.flash.length) s.push({ name: 'Reservoir conditions', type: 'scatter', rgb: [...PB_RGB], pts: pts(env.flash), marker: 'square' });
      if (env.saturation.length) s.push({ name: 'Saturation point at reservoir temperature', type: 'scatter', rgb: [124, 58, 237], pts: pts(env.saturation), marker: 'square' });
      figures.push({
        id: 'envelope',
        title: 'Pressure and temperature phase envelope',
        caption: `Stability boundaries of the ${model.tuning.status === 'tuned' ? 'tuned ' : ''}equation of state: ${env.bubble.length} bubble points and ${env.dew.length} dew points, as traced on screen. The trace stops near the critical point, so the two branches need not meet.`,
        panels: [{ height: 70, spec: { xTitle: env.xTitle, yTitle: env.yTitle, yInclude: [0], series: s } }],
      });
    } else {
      figures.push({
        id: 'envelope',
        title: 'Pressure and temperature phase envelope',
        statement: envelope?.result && !current
          ? 'Not plotted: the composition changed after the envelope was traced. Trace it again on the Compositional tab.'
          : 'Not plotted: the envelope has not been traced in this session. Trace it on the Compositional tab, then export again.',
      });
    }
  }

  // hydrate screening (black-oil stream), when the user engaged it
  const fa = model.mode === 'eos' ? null : results?.flowAssurance;
  if (fa?.hydrate_curve?.length) {
    const curve = fa.hydrate_curve.map((p) => [u.show('temperature', p.temp), u.show('pressure', p.pressure)]);
    const s = [{ name: 'Hydrate curve', type: 'line', rgb: [37, 99, 235], pts: curve, width: 0.5 }];
    const safe = fa.pt_profile.filter((p) => !p.at_risk).map((p) => [u.show('temperature', p.temp), u.show('pressure', p.pressure)]);
    const risk = fa.pt_profile.filter((p) => p.at_risk).map((p) => [u.show('temperature', p.temp), u.show('pressure', p.pressure)]);
    if (safe.length) s.push({ name: 'Flowline profile, outside the hydrate region', type: 'scatter', rgb: [217, 119, 6], pts: safe, marker: 'circle' });
    if (risk.length) s.push({ name: 'Flowline profile, inside the hydrate region', type: 'scatter', rgb: [...PB_RGB], pts: risk, marker: 'square' });
    figures.push({
      id: 'hydrate',
      title: 'Hydrate screening against the flowline profile',
      caption: `Hydrate formation curve (${fa.meta.hydrate_correlation}, gas gravity screening) and the ${fa.pt_profile.length} profile points read at the door. Points colder than the curve at their pressure are inside the hydrate region${risk.length ? `: ${risk.length} of ${fa.pt_profile.length}` : ': none'}.`,
      panels: [{ height: 64, spec: { xTitle: u.head('Temperature', 'temperature'), yTitle: u.head('Pressure', 'pressure'), series: s } }],
    });
  } else {
    figures.push({
      id: 'hydrate',
      title: 'Hydrate screening against the flowline profile',
      statement: model.mode === 'eos'
        ? 'Does not apply: flow assurance screening runs on the black-oil stream, which is not part of a compositional report.'
        : 'Does not apply: no pressure and temperature profile, measured wax appearance temperature or wax content is entered.',
    });
  }

  return figures;
}

/** The figure list as the Report tab shows it: title, and drawn or the reason. */
export const figureListRows = (figures) => (figures || []).map((f, i) => ({
  number: i + 1,
  id: f.id,
  title: f.title,
  plotted: !!f.panels?.length,
  text: f.panels?.length ? f.caption : f.statement,
}));
