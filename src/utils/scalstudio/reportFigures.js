/**
 * The figures of the SCAL Studio report (SCAL-U1, RL6): the list the PDF
 * draws and the Report tab lists. Every plotted figure takes its points
 * from the builders the screen charts use (series.js), so the drawing and
 * the screen are one series. A figure that does not apply is still listed,
 * with the reason.
 *
 * Pure: returns Report Kit figure entries ({ id, title, caption, panels }
 * or { id, title, statement }).
 */
import {
  workingKrSeries, labFitSeries, goLabFitSeries, normalisedSeries, jSeries, pcSeries, heightSeries, SERIES_COLORS,
} from './series.js';
import { scalUnits } from './units.js';

const pts = (list) => list.map((p) => [p.x, p.y]);
const PANEL = 62;
const g = (v, s = 3) => (Number.isFinite(v) ? String(parseFloat(Number(v).toPrecision(s))) : 'n/a');

/**
 * @param {{model: object, state: object, system?: string}} a  `state` is the studio state the model was built from
 */
export function buildScalReportFigures({ model, state, system = 'oilfield' }) {
  if (!model || !state) return [];
  const s = state;
  const u = scalUnits(system);
  const figures = [];
  const included = s.capillary?.includedSampleIds || [];

  // 1. working oil-water kr, with the lab points of the sample it was fitted to
  const ow = workingKrSeries({ owCurves: s.owCurves, phase: 'oilwater' });
  if (ow.lines[0].points.length >= 2) {
    const series = ow.lines.map((l) => ({ name: `${l.name} (working Corey)`, type: 'line', rgb: l.color.rgb, pts: pts(l.points), width: 0.55 }));
    const origin = s.owStatus?.origin;
    const fitted = origin ? (s.samplesDerived || []).find((x) => x.id === origin.sampleId) : null;
    if (fitted && (fitted.krRows?.length || 0) > 0) {
      const lab = labFitSeries(fitted);
      series.push({ name: `krw lab, ${fitted.name}`, type: 'scatter', rgb: SERIES_COLORS.water.rgb, pts: pts(lab.labW), marker: 'circle' });
      series.push({ name: `kro lab, ${fitted.name}`, type: 'scatter', rgb: SERIES_COLORS.oil.rgb, pts: pts(lab.labO), marker: 'square' });
    }
    const p = s.ow.params;
    figures.push({
      id: 'kr-ow',
      title: 'Oil-water relative permeability (working curves)',
      caption: `Corey: Swc ${g(p.Swc)}, Sor ${g(p.Sor)}, krw(Sor) ${g(p.krwMax)}, kro(Swc) ${g(p.kroMax)}, nw ${g(p.nw)}, no ${g(p.no)}. Source: ${s.owStatus?.text || 'entered by the user'}.${fitted ? ` Points: the lab table of "${fitted.name}".` : ''} ${ow.lines[0].points.length} points per curve, the series of the screen chart.`,
      panels: [{ height: PANEL, spec: { xTitle: ow.xTitle, yTitle: 'Relative permeability kr', xInclude: [0, 1], yInclude: [0, 1], series } }],
    });
  } else {
    figures.push({ id: 'kr-ow', title: 'Oil-water relative permeability (working curves)', statement: `Not plotted: the oil-water Corey set is not valid (${s.ow?.error || 'no parameters'}).` });
  }

  // 2. each sample's lab kr with its Corey fit
  const withKr = (s.samplesDerived || []).filter((x) => (x.krRows?.length || 0) > 0);
  if (!withKr.length) {
    figures.push({ id: 'kr-lab', title: 'Lab relative permeability with the Corey fit', statement: 'Does not apply: no core sample carries a kr table.' });
  }
  for (const x of withKr) {
    const lab = labFitSeries(x);
    const series = [
      { name: 'krw lab', type: 'scatter', rgb: SERIES_COLORS.water.rgb, pts: pts(lab.labW), marker: 'circle' },
      { name: 'kro lab', type: 'scatter', rgb: SERIES_COLORS.oil.rgb, pts: pts(lab.labO), marker: 'square' },
    ];
    if (lab.fitW.length) {
      series.push({ name: 'krw Corey fit', type: 'line', rgb: SERIES_COLORS.water.rgb, pts: pts(lab.fitW), dash: [1.6, 1.0], width: 0.45 });
      series.push({ name: 'kro Corey fit', type: 'line', rgb: SERIES_COLORS.oil.rgb, pts: pts(lab.fitO), dash: [1.6, 1.0], width: 0.45 });
    }
    const fit = x.krFit;
    figures.push({
      id: `kr-lab-${x.id}`,
      title: `Lab relative permeability with the Corey fit: ${x.name}`,
      caption: fit
        ? `${x.krRows.length} lab rows. Fitted nw ${g(fit.params.nw)}, no ${g(fit.params.no)}, r2 ${g(fit.r2Log, 4)} in log space; end points from the table. Dashed: the fit.`
        : `${x.krRows.length} lab rows. No fit: ${x.krFitError || 'the table cannot be fitted'}.`,
      panels: [{ height: PANEL, spec: { xTitle: 'Water saturation Sw', yTitle: 'Relative permeability kr', xInclude: [0, 1], yInclude: [0, 1], series } }],
    });
  }

  // 3. normalised curves across samples
  const norm = normalisedSeries(s.samplesDerived || []);
  if (norm.length >= 2) {
    const series = norm.flatMap((o) => [
      { name: `${o.name} krwN`, type: 'line', rgb: o.color.rgb, pts: pts(o.w), width: 0.45 },
      { name: `${o.name} kroN`, type: 'line', rgb: o.color.rgb, pts: pts(o.o), width: 0.45, dash: [1.4, 0.9] },
    ]);
    figures.push({
      id: 'kr-normalised',
      title: 'End-point normalised curves across samples',
      caption: 'Swn = (Sw - Swc) / (1 - Swc - Sor) of each sample, kr divided by its own end point. Samples of one rock type overlay; a spread means the exponents differ.',
      panels: [{ height: PANEL, spec: { xTitle: 'Normalised saturation Swn', yTitle: 'Normalised kr', xInclude: [0, 1], yInclude: [0, 1], series } }],
    });
  } else {
    figures.push({ id: 'kr-normalised', title: 'End-point normalised curves across samples', statement: `Does not apply: ${norm.length === 1 ? 'one sample' : 'no sample'} carries a usable kr table; a comparison needs two.` });
  }

  // 4. gas-oil, with the lab points of the sample it was fitted to (SCAL-U2-004)
  const go = workingKrSeries({ goCurves: s.goCurves, phase: 'gasoil' });
  if (go.lines[0].points.length >= 2) {
    const q = s.go.params;
    const series = go.lines.map((l) => ({ name: l.name, type: 'line', rgb: l.color.rgb, pts: pts(l.points), width: 0.55 }));
    const gOrigin = s.goStatus?.origin;
    const gFitted = gOrigin ? (s.samplesDerived || []).find((x) => x.id === gOrigin.sampleId) : null;
    if (gFitted && (gFitted.goRows?.length || 0) > 0) {
      const lab = goLabFitSeries(gFitted);
      series.push({ name: `krg lab, ${gFitted.name}`, type: 'scatter', rgb: SERIES_COLORS.gas.rgb, pts: pts(lab.labG), marker: 'circle' });
      series.push({ name: `krog lab, ${gFitted.name}`, type: 'scatter', rgb: SERIES_COLORS.oil.rgb, pts: pts(lab.labO), marker: 'square' });
    }
    figures.push({
      id: 'kr-go',
      title: 'Gas-oil relative permeability (working curves, at connate water)',
      caption: `Corey: Swc ${g(q.Swc)}, Sgc ${g(q.Sgc)}, Sorg ${g(q.Sorg)}, krg ${g(q.krgMax)}, krog ${g(q.krogMax)}, ng ${g(q.ng)}, nog ${g(q.nog)}. ${s.goStatus?.kind && s.goStatus.kind !== 'entered' ? `Source: ${s.goStatus.text}.` : 'Entered by the user.'}${gFitted ? ` Points: the gas-oil lab table of "${gFitted.name}".` : ''}`,
      panels: [{ height: PANEL, spec: { xTitle: go.xTitle, yTitle: 'Relative permeability kr', xInclude: [0, 1], yInclude: [0, 1], series } }],
    });
  } else {
    figures.push({ id: 'kr-go', title: 'Gas-oil relative permeability (working curves, at connate water)', statement: `Not plotted: the gas-oil Corey set is not valid (${s.go?.error || 'no parameters'}).` });
  }

  // 4b. each sample's gas-oil lab table with its Corey fit; listed only when a sample has one
  for (const x of (s.samplesDerived || []).filter((y) => (y.goRows?.length || 0) > 0)) {
    const lab = goLabFitSeries(x);
    const series = [
      { name: 'krg lab', type: 'scatter', rgb: SERIES_COLORS.gas.rgb, pts: pts(lab.labG), marker: 'circle' },
      { name: 'krog lab', type: 'scatter', rgb: SERIES_COLORS.oil.rgb, pts: pts(lab.labO), marker: 'square' },
    ];
    if (lab.fitG.length) {
      series.push({ name: 'krg Corey fit', type: 'line', rgb: SERIES_COLORS.gas.rgb, pts: pts(lab.fitG), dash: [1.6, 1.0], width: 0.45 });
      series.push({ name: 'krog Corey fit', type: 'line', rgb: SERIES_COLORS.oil.rgb, pts: pts(lab.fitO), dash: [1.6, 1.0], width: 0.45 });
    }
    const fit = x.goFit;
    figures.push({
      id: `kr-go-lab-${x.id}`,
      title: `Lab gas-oil relative permeability with the Corey fit: ${x.name}`,
      caption: fit
        ? `${x.goRows.length} lab rows at Swc ${g(fit.params.Swc)} (${fit.swcFrom}). Fitted ng ${g(fit.params.ng)}, nog ${g(fit.params.nog)}, r2 ${g(fit.r2Log, 4)} in log space. Dashed: the fit.`
        : `${x.goRows.length} lab rows. No fit: ${x.goFitError || 'the table cannot be fitted'}.`,
      panels: [{ height: PANEL, spec: { xTitle: 'Gas saturation Sg', yTitle: 'Relative permeability kr', xInclude: [0, 1], yInclude: [0, 1], series } }],
    });
  }

  // 5. J function
  const js = jSeries({ jSpec: s.jResolved?.jSpec, samples: s.samplesDerived || [], includedIds: included });
  if (js.curve.length >= 2) {
    const spec = s.jResolved.jSpec;
    figures.push({
      id: 'j',
      title: 'Leverett J function',
      caption: `Working curve J = ${g(spec.a)} Sw*^(-${g(spec.b)}), Swirr ${g(spec.Swirr)} (${s.jResolved.meta?.mode === 'samples' ? `averaged from ${js.samples.length} samples, their lab J as points` : 'typed power law'}). Logarithmic J axis. Points from different samples that collapse onto one curve support one rock type.`,
      panels: [{
        height: PANEL,
        spec: {
          xTitle: 'Water saturation Sw', yTitle: 'Leverett J', yLog: true, xInclude: [0, 1],
          series: [
            { name: 'Working J', type: 'line', rgb: SERIES_COLORS.j.rgb, pts: pts(js.curve), width: 0.55 },
            ...js.samples.map((x) => ({ name: x.name, type: 'scatter', rgb: x.color.rgb, pts: pts(x.points), marker: 'circle' })),
          ],
        },
      }],
    });
  } else {
    figures.push({ id: 'j', title: 'Leverett J function', statement: `Not plotted: ${s.jResolved?.error || 'there is no working J curve'}.` });
  }

  // 6. Pc against Sw with the J-function overlay
  const pcs = pcSeries({ reservoirPc: s.reservoirPc, reservoir: s.reservoir, samples: s.samplesDerived || [], includedIds: included, system });
  if (pcs.curve.length >= 2) {
    const r = s.reservoir.props;
    figures.push({
      id: 'pc',
      title: 'Reservoir capillary pressure against water saturation',
      caption: `The working J scaled to k ${g(r.k_md)} md, porosity ${g(r.phi)}, IFT ${g(u.show('ift', r.sigma_dyncm))} ${u.label('ift')}, contact angle ${g(r.thetaDeg)} deg. ${pcs.overlay.length ? 'Points: each included sample\'s lab J scaled the same way (the J-function overlay).' : 'No lab J points: the J curve is typed.'}`,
      panels: [{
        height: PANEL,
        spec: {
          xTitle: 'Water saturation Sw', yTitle: pcs.yTitle, xInclude: [0, 1], yInclude: [0],
          series: [
            { name: 'Pc from the working J', type: 'line', rgb: SERIES_COLORS.pc.rgb, pts: pts(pcs.curve), width: 0.55 },
            ...pcs.overlay.map((o) => ({ name: o.name, type: 'scatter', rgb: o.color.rgb, pts: pts(o.points), marker: 'circle' })),
          ],
        },
      }],
    });
  } else {
    figures.push({ id: 'pc', title: 'Reservoir capillary pressure against water saturation', statement: `Not plotted: ${s.reservoir?.error || s.jResolved?.error || 'no reservoir Pc curve'}.` });
  }

  // 7. saturation height with the FWL marked
  const hs = heightSeries({ heightProfile: s.heightProfile, height: s.height, system });
  if (hs.points.length >= 2) {
    const fwlLine = { y: 0, label: hs.hasFwl ? `FWL, ${g(hs.fwl, 6)} ${hs.unit} TVDSS` : 'FWL (no depth entered)', rgb: [...SERIES_COLORS.fwl.rgb], dash: [1.5, 1.2] };
    figures.push({
      id: 'height',
      title: 'Water saturation against height above the free water level',
      caption: `h = Pc / (0.4335 (gamma_w - gamma_hc)), gamma_w ${g(Number(s.height.gammaW))}, gamma_hc ${g(Number(s.height.gammaHc))}. ${hs.hasFwl ? `The FWL is at ${g(hs.fwl, 6)} ${hs.unit} TVDSS; depth = FWL less height.` : 'No FWL depth was entered.'} ${hs.points.length} points, the series of the screen chart.`,
      panels: [{
        height: PANEL + 8,
        spec: {
          xTitle: 'Water saturation Sw', yTitle: hs.yTitle, xInclude: [0, 1], yInclude: [0],
          series: [{ name: 'Sw against height', type: 'line', rgb: SERIES_COLORS.water.rgb, pts: pts(hs.points), width: 0.55 }],
          lines: [fwlLine],
        },
      }],
    });
  } else {
    figures.push({ id: 'height', title: 'Water saturation against height above the free water level', statement: 'Not plotted: the height profile needs a working J curve, reservoir rock and a water gravity above the hydrocarbon gravity.' });
  }
  return figures;
}

/** Rows for the Report tab's figure list: number, title, drawn or why not. */
export function figureListRows(figures) {
  return (figures || []).map((fig, i) => [String(i + 1), fig.title, fig.panels ? 'Drawn' : fig.statement]);
}
