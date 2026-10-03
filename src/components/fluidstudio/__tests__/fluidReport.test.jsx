/**
 * Fluid Systems Studio report (FLUID-U1; reviewer lens RL1 to RL12). The
 * PDF is built by the function the Export button calls, from the pipeline
 * the page runs, and read back with poppler through the Report Kit's test
 * kit: goldens, captions, point counts against the screen series, and
 * expectFigureDrawn for every plot. Negative controls sit beside each gate.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import {
  readPdf, flat, listCaptions, pointCounts, expectFigureDrawn, expectFigureStatement, checkGolden,
} from '@/lib/reportKit/testKit';
import { missingInputRows } from '@/lib/reportKit';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { buildFluidPdf, reportFileName } from '@/utils/fluidstudio/fluidReportExport';
import { buildPvtSeries } from '@/utils/fluidstudio/pvtSeries';
import {
  clearEditedSampleMarks, SAMPLE_NOTE, IDENTIFICATION_FIELDS,
} from '@/utils/fluidstudio/reportModel';
import { tuningState } from '@/utils/fluidstudio/eosAnalysis';
import { inputsFromPayload } from '@/components/fluidstudio/useFluidStudioProjects';
import { LEGACY_PRE_SHELL, SCHEMA_1_TUNED_EOS } from '@/components/fluidstudio/__fixtures__/savedProjects';
import FluidReportTab from '@/components/fluidstudio/FluidReportTab';
import {
  AT, GOLDEN_DIR, UPDATE, logo, sampleWorkspace, identifiedBlackOil, eosWithLab, tune, traceEnvelope, run, pdfOf, IDENT, goodOilBlackOil, matched,
} from './fluidTestKit';

jest.setTimeout(120000);

const figureById = (built, id) => built.figures.find((f) => f.id === id);
// A table cell that wraps in the PDF comes back from pdftotext interleaved
// with its neighbours, with its own words still in order: find them in
// order, each within a short reach of the one before.
const inOrder = (text, cell, reach = 600) => {
  const tokens = String(cell).split(/\s+/).filter(Boolean);
  let from = text.indexOf(tokens[0]);
  while (from >= 0) {
    let at = from + tokens[0].length;
    let ok = true;
    for (const t of tokens.slice(1)) {
      const i = text.indexOf(t, at);
      if (i < 0 || i - at > reach) { ok = false; break; }
      at = i + t.length;
    }
    if (ok) return true;
    from = text.indexOf(tokens[0], from + 1);
  }
  return false;
};
const rowOf = (model, key) => model.inputs.rows.find((r) => r.key === key);

describe('goldens: the report as the Export button builds it', () => {
  test('black oil, identified, sources stated', () => {
    checkGolden(pdfOf(run(identifiedBlackOil())), { dir: GOLDEN_DIR, name: 'black-oil-identified', update: UPDATE });
  });

  test('the sample as the app opens it (nothing identified, sample values)', () => {
    checkGolden(pdfOf(run(sampleWorkspace(), { projectId: null, projectName: '' })), { dir: GOLDEN_DIR, name: 'black-oil-sample', update: UPDATE });
  });

  test('black oil in SI, an entered bubble point and a GOR outside Standing', () => {
    const inputs = identifiedBlackOil();
    inputs.streamA.blackOil = { ...inputs.streamA.blackOil, gor: 1600, pb: 4200 };
    inputs.inputMeta.pb = { source: 'lab', note: 'CCE, report RFL-2026-0412' };
    checkGolden(pdfOf(run(inputs, { system: 'si' })), { dir: GOLDEN_DIR, name: 'black-oil-si-entered-pb', update: UPDATE });
  });

  test('compositional, tuned to lab values, envelope traced', async () => {
    const inputs = await tune(eosWithLab());
    const envelope = await traceEnvelope(inputs);
    checkGolden(pdfOf(run(inputs, { envelope })), { dir: GOLDEN_DIR, name: 'eos-tuned-envelope', update: UPDATE });
  });

  test('black oil with a published laboratory study loaded and matched (Good Oil Co. Well No. 4)', () => {
    checkGolden(pdfOf(run(matched(goodOilBlackOil()), { projectName: 'Good Oil Well No. 4 PVT' })), { dir: GOLDEN_DIR, name: 'black-oil-lab-good-oil', update: UPDATE });
  });

  test('a project saved before the shell opens and reports', () => {
    const inputs = inputsFromPayload(LEGACY_PRE_SHELL);
    checkGolden(pdfOf(run(inputs, { projectName: 'Pre-shell project (2026-07)' })), { dir: GOLDEN_DIR, name: 'legacy-pre-shell', update: UPDATE });
  });
});

describe('RL1: every input is on the page, with unit and source', () => {
  test('completeness: every key the engine reads has a row, in both models', async () => {
    const bo = run(identifiedBlackOil()).report.model;
    expect(missingInputRows(bo.engineInput, bo.inputs.rows)).toEqual([]);
    const blended = identifiedBlackOil();
    blended.blending = { enabled: true, streamB_fraction: 30 };
    const bl = run(blended).report.model;
    expect(missingInputRows(bl.engineInput, bl.inputs.rows)).toEqual([]);
    const eos = run(await tune(eosWithLab())).report.model;
    expect(Object.keys(eos.engineInput.tuning).sort()).toEqual(['fPc', 'fTc', 'kC1', 'sPlus']);
    expect(missingInputRows(eos.engineInput, eos.inputs.rows)).toEqual([]);
  });

  test('negative control: a row removed from the model, or a new engine input, is named', () => {
    const m = run(identifiedBlackOil()).report.model;
    expect(missingInputRows(m.engineInput, m.inputs.rows.filter((r) => r.key !== 'gasSg'))).toEqual(['gasGravity']);
    expect(missingInputRows({ ...m.engineInput, wetGasFlag: true }, m.inputs.rows)).toEqual(['wetGasFlag']);
  });

  test('each row prints a value, a unit and a source; the PDF carries them', () => {
    const ws = run(identifiedBlackOil());
    for (const r of ws.report.model.inputs.rows) {
      expect(r.label).toBeTruthy();
      expect(r.value).toBeTruthy();
      expect(r.source).toBeTruthy();
    }
    const text = flat(readPdf(pdfOf(ws).doc).text);
    expect(text).toMatch(/API gravity of the stock-tank oil 32\.0 degAPI Measured \(lab\)\. Stock-tank oil, report RFL-2026-0412/);
    expect(text).toMatch(/Gas gravity 0\.750 air = 1 Correlation: Separator gas analysis, weighted/);
    expect(text).toMatch(/Reservoir temperature 200\.0 degF Offset well\. Ekene-3 static survey/);
    expect(text).toMatch(/Water salinity 35,000 ppm Assumed/);
    expect(text).toMatch(/Bubble point, Rs and Bo correlation Standing Selected in the app/);
  });

  test('a blank input prints n/a; an input with nothing stated says so; a sample value prints as an assumption', () => {
    const ws = run(sampleWorkspace());
    const m = ws.report.model;
    expect(rowOf(m, 'pb')).toMatchObject({ value: EMPTY_VALUE, source: 'Not provided: solved from the solution GOR' });
    expect(rowOf(m, 'api').source).toBe(`Assumed. ${SAMPLE_NOTE}`);
    const cleared = sampleWorkspace();
    cleared.inputMeta = {};
    expect(rowOf(run(cleared).report.model, 'api').source).toBe('Entered, source not stated');
    const noRate = sampleWorkspace();
    noRate.feed = {};
    expect(rowOf(run(noRate).report.model, 'oilRate').source).toBe('Assumed default 1,000 STB/d (no value entered)');
  });

  test('editing an input drops its sample mark, and only its own', () => {
    const prev = sampleWorkspace();
    const next = { ...prev, streamA: { ...prev.streamA, blackOil: { ...prev.streamA.blackOil, api: 35 } } };
    const out = clearEditedSampleMarks(prev, next);
    expect(out.inputMeta.api).toBeUndefined();
    expect(out.inputMeta.gor.note).toBe(SAMPLE_NOTE);
    // a source the user stated is never dropped by an edit
    const stated = { ...prev, inputMeta: { ...prev.inputMeta, api: { source: 'lab', note: 'report 7' } } };
    const edited = { ...stated, streamA: { ...stated.streamA, blackOil: { ...stated.streamA.blackOil, api: 36 } } };
    expect(clearEditedSampleMarks(stated, edited).inputMeta.api).toEqual({ source: 'lab', note: 'report 7' });
    // an edit elsewhere (identification) touches nothing
    expect(clearEditedSampleMarks(prev, { ...prev, identification: { field: 'X' } }).inputMeta).toBe(prev.inputMeta);
  });
});

describe('RL2 and RL3: the surface gas by stage closes on the total', () => {
  test('black oil: separator plus stock tank is the solution GOR, to the printed digit', () => {
    const ws = run(identifiedBlackOil());
    const note = ws.report.model.separator.note;
    const [, sep, st, total] = /Separator GOR ([\d.,]+) plus stock-tank GOR ([\d.,]+) gives the total ([\d.,]+)/.exec(note);
    const n = (s) => Number(s.replace(/,/g, ''));
    expect(n(sep) + n(st)).toBeCloseTo(n(total), 1);
    expect(n(total)).toBe(650);
    // the stage rows sum to the total within their own rounding
    const stages = ws.report.model.separator.rows.slice(0, -1).map((r) => n(r[4]));
    expect(Math.abs(stages.reduce((a, b) => a + b, 0) - n(total))).toBeLessThanOrEqual(0.05 * stages.length + 1e-9);
    expect(note).toMatch(/the multistage Bo 1\.\d{4} is an estimate/);
  });

  test('compositional: stage GORs sum to the total, and both Bo are named', async () => {
    const ws = run(await tune(eosWithLab()));
    const s = ws.eos.separator;
    expect(s.stages.reduce((a, st) => a + st.gor, 0)).toBeCloseTo(s.totals.totalGor, 0);
    expect(ws.report.model.separator.note).toMatch(/Bo of this train 1\.\d{4} RB\/STB; a single flash to stock tank would give 1\.\d{4}/);
  });
});

describe('RL4: identification, and an old project prints n/a', () => {
  test('every header label and value is on page 1', () => {
    const pdf = readPdf(pdfOf(run(identifiedBlackOil())).doc);
    const p1 = flat(pdf.pageText[0]);
    for (const [label, value] of [
      ['Project', 'Ekene E-2000 PVT'], ['Company', IDENT.company], ['Field', IDENT.field], ['Licence or block', IDENT.licence], ['Well', IDENT.well],
      ['Reservoir or zone', IDENT.reservoir], ['Sample or fluid', IDENT.sampleName], ['Sample depth', IDENT.sampleDepth], ['Sampling date', IDENT.sampleDate],
      ['Sampling method', IDENT.samplingMethod], ['Laboratory', IDENT.laboratory], ['Lab report', IDENT.labReport], ['Analyst', IDENT.analyst],
      ['Analysis date', IDENT.analysisDate], ['Build', 'Petrolord Suite test (fixture)'], ['Generated', '2026-10-02 09:00 UTC'],
    ]) expect(p1).toContain(`${label} ${value}`);
    expect(p1).toMatch(/Analysis type PVT, black-oil correlations/);
    expect(p1).toMatch(/Display units Oilfield \(psia, degF\); Bg in RB\/Mscf Generated 2026-10-02 09:00 UTC/);
    expect(IDENTIFICATION_FIELDS.length).toBe(13);
  });

  test('the company falls back to the organisation, and a blank identification prints n/a', () => {
    const p1 = flat(readPdf(pdfOf(run(sampleWorkspace(), { projectId: null, projectName: '' })).doc).pageText[0]);
    expect(p1).toMatch(/Project Unsaved workspace Company Org from the profile/);
    expect(p1).toMatch(/Field n\/a Licence or block n\/a/);
    expect(p1).toMatch(/Analyst n\/a Analysis date n\/a/);
  });

  test.each([
    ['pre-shell (2026-07)', LEGACY_PRE_SHELL],
    ['schema 1 (2026-09)', SCHEMA_1_TUNED_EOS],
  ])('a project saved by %s opens, computes and reports without a throw', (_, payload) => {
    const ws = run(inputsFromPayload(payload), { projectName: payload.name || 'Old project' });
    const built = pdfOf(ws);
    const text = flat(readPdf(built.doc).text);
    expect(built.pages).toBeGreaterThan(4);
    expect(text).toMatch(/Field n\/a/);
    expect(text).toMatch(/Entered, source not stated/);
    expect(text).not.toMatch(/undefined|NaN|null/);
  });
});

describe('RL6: every plot is in the PDF, drawn from the screen series', () => {
  test('black oil: five property plots, each with the screen point count and the bubble point marked', () => {
    const ws = run(identifiedBlackOil());
    const built = pdfOf(ws);
    const pdf = readPdf(built.doc, { ink: true });
    try {
      expect(listCaptions(pdf).map((c) => c.title)).toEqual([
        'Oil formation volume factor Bo against pressure', 'Solution GOR Rs against pressure', 'Oil viscosity against pressure',
        'Gas deviation factor Z against pressure', 'Gas formation volume factor Bg against pressure',
        'Laboratory values against the model: oil properties', 'Laboratory values against the model: gas properties and relative volume',
        'Pressure and temperature phase envelope', 'Hydrate screening against the flowline profile',
      ]);
      const screen = buildPvtSeries({ rows: ws.results.pvt.table, pb: ws.results.pvt.pb, system: 'oilfield' });
      const counts = pointCounts(built.figures);
      for (const plot of screen.plots) {
        expect(Object.values(counts[`pvt-${plot.id}`][0])).toEqual([plot.points.length]);
        expect(plot.points.length).toBe(41);
        expectFigureDrawn(pdf, figureById(built, `pvt-${plot.id}`), { logo: true });
      }
      const text = flat(pdf.text);
      expect((text.match(/Pb 2,998 psia/g) || []).length).toBeGreaterThanOrEqual(5);
      expect(text).toMatch(/Bo at 200 degF\. Method: Standing\. The dashed line marks the bubble point \(2,998 psia\)\. 41 points, the series of the screen chart\./);
      expect(text).toMatch(/Oil viscosity at 200 degF\. Method: Beggs-Robinson\./);
      expect(text).toMatch(/Z at 200 degF\. Method: Dranchuk-Abou-Kassem, with Sutton pseudo-critical properties\./);
      // the sample has a P-T profile, so the hydrate figure is drawn; the other two say why they are not
      expectFigureDrawn(pdf, figureById(built, 'hydrate'), { logo: true });
      expectFigureStatement(pdf, figureById(built, 'lab'), /Does not apply: no laboratory table is loaded\./);
      expectFigureStatement(pdf, figureById(built, 'lab-gas'), /Does not apply: no laboratory table is loaded\./);
      expectFigureStatement(pdf, figureById(built, 'envelope'), /Does not apply: a phase envelope needs a composition/);
    } finally { pdf.close(); }
  });

  test('compositional: lab points against the model, and the envelope the screen traced', async () => {
    const inputs = await tune(eosWithLab());
    const envelope = await traceEnvelope(inputs);
    const ws = run(inputs, { envelope });
    const built = pdfOf(ws);
    const pdf = readPdf(built.doc, { ink: true });
    try {
      const rows = ws.eos.pvtTable.table.rows;
      const screen = buildPvtSeries({ rows, pb: ws.eos.pvtTable.table.pb, system: 'oilfield' });
      const counts = pointCounts(built.figures);
      for (const plot of screen.plots) expect(Object.values(counts[`pvt-${plot.id}`][0])).toEqual([plot.points.length]);
      // Bg and Z exist below the saturation pressure only
      expect(screen.plots.find((p) => p.id === 'bg').points.length).toBe(rows.filter((r) => Number.isFinite(r.Bg)).length);
      // lab figure: the model curve and one lab point per panel
      const lab = figureById(built, 'lab');
      expect(lab.plotted).toBe(true);
      expect(counts.lab.map((p) => Object.entries(p).filter(([k]) => /^Laboratory/.test(k)).map(([, v]) => v))).toEqual([[1], [1]]);
      expectFigureDrawn(pdf, lab, { logo: true });
      expect(flat(pdf.text)).toMatch(/Lab Psat 2,750 psia/);
      // envelope: the points the card holds
      const env = figureById(built, 'envelope');
      expect(env.plotted).toBe(true);
      expect(counts.envelope[0]['Bubble points']).toBe(envelope.result.bubble.length);
      expect(counts.envelope[0]['Dew points'] ?? 0).toBe(envelope.result.dew.length);
      expectFigureDrawn(pdf, env, { logo: true });
      expectFigureStatement(pdf, figureById(built, 'hydrate'), /Does not apply: flow assurance screening runs on the black-oil stream/);
    } finally { pdf.close(); }
  });

  test('an envelope that was not traced, or was traced for another composition, says so', async () => {
    const inputs = eosWithLab();
    const fresh = pdfOf(run(inputs));
    expect(figureById(fresh, 'envelope').plotted).toBe(false);
    expect(flat(readPdf(fresh.doc).text)).toMatch(/Not plotted: the envelope has not been traced in this session\./);
    const envelope = await traceEnvelope(inputs);
    const moved = { ...inputs, streamA: { ...inputs.streamA, composition: { ...inputs.streamA.composition, zPct: { ...inputs.streamA.composition.zPct, C1: 42, 'C7+': 32 } } } };
    const stale = pdfOf(run(moved, { envelope }));
    expect(figureById(stale, 'envelope').plotted).toBe(false);
    expect(flat(readPdf(stale.doc).text)).toMatch(/Not plotted: the composition changed after the envelope was traced\./);
  });

  test('negative controls: a report with no figure list is refused, and an empty series is caught', () => {
    const ws = run(identifiedBlackOil());
    expect(() => buildFluidPdf({ ...ws.report, figures: [] }, { logo, generatedAt: AT })).toThrow(/figure list is empty/);
    expect(() => buildFluidPdf({ ...ws.report, model: null }, { logo, generatedAt: AT })).toThrow(/no result to report/);
    const emptied = ws.report.figures.map((f) => (f.id === 'pvt-bo' ? { ...f, panels: [{ ...f.panels[0], spec: { ...f.panels[0].spec, series: [{ ...f.panels[0].spec.series[0], pts: [] }] } }] } : f));
    const built = buildFluidPdf({ ...ws.report, figures: emptied }, { logo, generatedAt: AT });
    const pdf = readPdf(built.doc, { ink: true });
    try {
      expect(() => expectFigureDrawn(pdf, figureById(built, 'pvt-bo'))).toThrow(/drew 0 points/);
    } finally { pdf.close(); }
  });
});

describe('RL7 and PL3: the basis is named, and the unit system converts', () => {
  test('basis lexicon: absolute pressure, stock-tank and reservoir volumes, the Bg basis, standard conditions', () => {
    const text = flat(readPdf(pdfOf(run(identifiedBlackOil())).doc).text);
    expect(text).toMatch(/Pressures Absolute/);
    expect(text).toMatch(/Standard conditions 14\.7 psia and 60\.0 degF/);
    expect(text).toMatch(/Gas formation volume factor RB\/Mscf: reservoir volume per thousand standard cubic feet of gas/);
    expect(text).toMatch(/RB\/STB: reservoir volume per stock-tank volume/);
    expect(text).toMatch(/Liberation basis Black-oil correlations on a surface separation \(flash\) basis/);
    expect(text).toMatch(/Bubble point pressure 2,998 psia, solved from the solution GOR/);
    expect(text).toMatch(/Bg \(RB\/Mscf\)/);
    // RB/scf appears only where the engine unit is stated as such
    expect((text.match(/RB\/scf/g) || []).length).toBe(2);
  });

  test('SI: values convert and labels follow, in the tables and on the plots', () => {
    const oil = run(identifiedBlackOil());
    const si = run(identifiedBlackOil(), { system: 'si' });
    const text = flat(readPdf(pdfOf(si).doc).text);
    expect(text).toMatch(/Display units SI \(kPa abs, degC\); Bg in m3\/m3/);
    expect(text).toMatch(/Units of this report pressure kPa \(abs\); temperature degC; GOR m3\/m3; oil and water FVF m3\/m3; gas FVF m3\/m3; viscosity mPa\.s; compressibility 1\/kPa/);
    // 2,998 psia is 20,670 kPa; 200 degF is 93.3 degC; 650 scf/STB is 115.77 m3/m3
    const pbKpa = oil.results.pvt.kpis.pb * 6.894757293168361;
    expect(text).toContain(`Bubble point pressure Pb ${Math.round(pbKpa).toLocaleString('en-US')} kPa (abs)`);
    expect(text).toMatch(/Reservoir temperature 93\.3 degC/);
    // one bubble point on every surface: the headline, the basis row and the plot label agree (RL12)
    const label = `Pb ${Math.round(pbKpa).toLocaleString('en-US')} kPa (abs)`;
    expect((text.split(label).length - 1)).toBeGreaterThanOrEqual(5);
    expect(text).toContain(`Bubble point pressure ${Math.round(pbKpa).toLocaleString('en-US')} kPa (abs), solved from the solution GOR`);
    expect(text).toMatch(/Solution GOR at the bubble point Rsb 115\.77 m3\/m3/);
    expect(text).toMatch(/Standard conditions 101\.4 kPa \(abs\) and 15\.6 degC/);
    expect(text).toMatch(/Pressure \(kPa \(abs\)\)/);
    // no oilfield unit is left in a table of the report. (The contract block, the
    // field-unit constant of the Bg formula and the P-T door state their own units.)
    const m = si.report.model;
    const tables = JSON.stringify([m.headline, m.inputs.rows, m.pvtTable, m.separator, m.limits, m.basis]);
    expect(tables).not.toMatch(/psia|degF|scf\/STB|RB\/STB|RB\/Mscf|STB\/d|Mscf\/d|\bcP\b|1\/psi/);
    expect(text).toMatch(/Units of the block As the engine holds them, whatever the display units: pressure psia, temperature degF, Rs scf\/STB, Bo and Bw RB\/STB, Bg RB\/scf/);
    // Bo is a ratio: the number is the same in both systems
    expect(si.report.model.headline.rows[2][1]).toBe(oil.report.model.headline.rows[2][1]);
    // Bg: RB/Mscf to m3/m3 is a real conversion
    const bgOil = Number(oil.report.model.headline.rows[7][1]);
    const bgSi = Number(si.report.model.headline.rows[7][1]);
    expect(bgSi / bgOil).toBeCloseTo(0.158987294928 / (1000 * 0.028316846592), 3);
    // the engine state did not move
    expect(si.results.pvt.kpis).toEqual(oil.results.pvt.kpis);
  });
});

describe('RL8 and PL4: nothing is claimed that did not happen', () => {
  test('tuned is said only while the record of the fit describes the inputs', async () => {
    const untuned = run(eosWithLab());
    expect(untuned.report.model.tuning.status).toBe('none');
    expect(flat(readPdf(pdfOf(untuned).doc).text)).toMatch(/No lab tuning\. The C7\+ fraction uses generalised correlations/);

    const tunedInputs = await tune(eosWithLab());
    const tuned = run(tunedInputs);
    expect(tuned.report.model.tuning.status).toBe('tuned');
    const text = flat(readPdf(pdfOf(tuned).doc).text);
    expect(text).toMatch(/The C7\+ fraction was regressed to the measured values below \(four bounded parameters, Levenberg-Marquardt\)\. The regression converged in \d+ iterations\./);
    expect(text).toMatch(/Matched to Unit Measured Model before Model after Error before Error after/);
    expect(text).toMatch(/Saturation pressure at 200\.0 degF psia 2,750/);
    // the errors printed are the engine's own
    const fit = tunedInputs.streamA.composition.tuning.fit;
    for (const r of fit.report) expect(text).toContain(`${r.tunedErr >= 0 ? '+' : ''}${r.tunedErr.toFixed(2)}%`);
    expect(tuned.contract.tuning).toMatchObject({ status: 'tuned', converged: fit.converged });
    expect(tuned.contract.tuning.matched.map((m) => m.target)).toEqual(fit.report.map((r) => r.name));

    // an analysis input moves: the claim is withdrawn, with the table
    const c = tunedInputs.streamA.composition;
    const edited = { ...tunedInputs, streamA: { ...tunedInputs.streamA, composition: { ...c, plus: { ...c.plus, mw: 195 } } } };
    const stale = run(edited);
    expect(stale.report.model.tuning.status).toBe('stale');
    expect(stale.report.model.tuning.table).toBeNull();
    const staleText = flat(readPdf(pdfOf(stale).doc).text);
    expect(staleText).toMatch(/changed after the fit\. The record of the match no longer describes this fluid and is withdrawn/);
    expect(staleText).not.toMatch(/regression converged/);
    expect(stale.contract.tuning.status).toBe('stale');
    expect(stale.contract.tuning.matched).toBeUndefined();
    // a measured value moves: also withdrawn
    const labMoved = { ...tunedInputs, streamA: { ...tunedInputs.streamA, composition: { ...c, tuning: { ...c.tuning, lab: { ...c.tuning.lab, psatPsia: 2800 } } } } };
    expect(tuningState(labMoved.streamA.composition, labMoved.separatorTrain.stages).status).toBe('stale');
    // a report-only field moves: the claim stays
    const relabelled = { ...tunedInputs, identification: { ...tunedInputs.identification, analyst: 'B. Reviewer' } };
    expect(run(relabelled).report.model.tuning.status).toBe('tuned');
  });

  test('a project saved with tuning and no record says exactly that', () => {
    const ws = run(inputsFromPayload(SCHEMA_1_TUNED_EOS));
    expect(ws.report.model.tuning.status).toBe('tuned-unrecorded');
    expect(flat(readPdf(pdfOf(ws).doc).text)).toMatch(/saved before the app kept the record of the match/);
    expect(ws.contract.tuning.status).toBe('tuned-unrecorded');
  });

  test('status word guard: tuned, converged, matched and validated appear only with their event', async () => {
    const words = /\b(converged|validated|calibrated|history matched)\b/i;
    for (const ws of [run(identifiedBlackOil()), run(eosWithLab()), run(sampleWorkspace())]) {
      const text = flat(readPdf(pdfOf(ws).doc).text);
      expect(text).not.toMatch(words);
      expect(text).not.toMatch(/tuned to lab data|was regressed/);
    }
    const tuned = flat(readPdf(pdfOf(run(await tune(eosWithLab()))).doc).text);
    expect(tuned).toMatch(/converged in \d+ iterations/);
  });
});

describe('RL9: the limits of the method are printed', () => {
  test('the block names the methods and their published ranges', () => {
    const text = flat(readPdf(pdfOf(run(identifiedBlackOil())).doc).text);
    expect(text).toMatch(/Limits of this analysis - Black-oil correlations: empirical fits/);
    expect(text).toMatch(/Published ranges of the methods used/);
    // the rows of the ranges table, as the model holds them (a wrapped PDF cell interleaves with its neighbours)
    const ranges = run(identifiedBlackOil()).report.model.limits.ranges.rows;
    expect(ranges).toEqual([
      ['Standing', 'Bubble point pressure; Solution GOR Rs; Oil formation volume factor Bo', 'Solution GOR 20 to 1,425 scf/STB; Temperature 100 to 258 degF; API gravity 16.5 to 63.8 degAPI; Gas gravity 0.59 to 0.95 air = 1; Pressure 130 to 7,000 psia'],
      ['Vasquez-Beggs (compressibility)', 'Oil compressibility co (undersaturated)', 'Solution GOR 20 to 2,199 scf/STB; Temperature 75 to 294 degF; API gravity 15.3 to 59.5 degAPI; Gas gravity 0.511 to 1.351 air = 1'],
      ['Beggs-Robinson', 'Dead oil viscosity; Live (saturated) oil viscosity', 'API gravity 16 to 58 degAPI; Temperature 70 to 295 degF; Solution GOR 20 to 2,070 scf/STB'],
      ['Vasquez-Beggs (undersaturated viscosity)', 'Undersaturated oil viscosity', 'Pressure 141 to 9,515 psia'],
      ['Dranchuk-Abou-Kassem (Z), on Sutton pseudo-critical properties', 'Gas deviation factor Z', 'Gas gravity 0.57 to 1.68 air = 1; Pseudo-reduced temperature 1.2 to 3; Pseudo-reduced pressure 0 to 15'],
      ['Lee-Gonzalez-Eakin', 'Gas viscosity', 'Pressure 100 to 8,000 psia; Temperature 100 to 340 degF; Gas gravity 0.55 to 1 air = 1'],
      ['McCain (water FVF)', 'Water formation volume factor Bw', 'Pressure 0 to 5,000 psia; Temperature 0 to 260 degF'],
      ['McCain (water viscosity)', 'Water viscosity', 'Pressure 0 to 10,000 psia; Temperature 100 to 400 degF; Salinity 0 to 260,000 ppm'],
    ]);
    for (const row of ranges) for (const cell of row) expect(inOrder(text, cell)).toBe(true);
    expect(text).toMatch(/Undersaturated oil viscosity Pressure 141 to 9,515 psia/);
    expect(text).toMatch(/For the z-factor the window is the one over which the engines library checked the method against readings of the Standing-Katz chart/);
    expect(text).not.toMatch(/Papay/);
  });

  test('an out-of-range input is flagged in the PDF, in the display unit', () => {
    const inputs = identifiedBlackOil();
    inputs.streamA.blackOil.gor = 1600;
    const oil = flat(readPdf(pdfOf(run(inputs)).doc).text);
    expect(oil).toMatch(/Inputs outside a published range - Standing: solution GOR 1,600\.0 scf\/STB is outside its published range \(20\.0 to 1,425\.0 scf\/STB\)\. Affects: Bubble point pressure; Solution GOR Rs; Oil formation volume factor Bo\./);
    const si = flat(readPdf(pdfOf(run(inputs, { system: 'si' })).doc).text);
    expect(si).toMatch(/Standing: solution GOR 284\.97 m3\/m3 is outside its published range \(3\.56 to 253\.80 m3\/m3\)/);
    // negative control: the sample is inside every input range
    const ok = run(identifiedBlackOil()).report.model.limits.flags;
    expect(ok.every((f) => /table row/.test(f))).toBe(true);
  });

  test('compositional: the limits say what the equation of state does not cover', () => {
    const text = flat(readPdf(pdfOf(run(eosWithLab())).doc).text);
    expect(text).toMatch(/one C7\+ pseudo-component/);
    expect(text).toMatch(/Constant volume depletion is not simulated/);
    expect(text).toMatch(/untuned Lohrenz-Bray-Clark values: screening grade/);
    expect(text).not.toMatch(/Papay:/);
  });
});

describe('RL12: the screen, the report and the saved project are one model', () => {
  test('the Report tab shows the rows the PDF prints', () => {
    const ws = run(identifiedBlackOil());
    render(<FluidReportTab report={ws.report} inputs={ws.inputs} organizationName="Org" onIdentification={() => {}} onSource={() => {}} onExport={() => {}} />);
    const pdfText = flat(readPdf(pdfOf(ws).doc).text);
    const cells = (testId) => within(screen.getByTestId(testId)).getAllByRole('cell').map((c) => c.textContent.trim()).filter((t) => t && t !== EMPTY_VALUE);
    for (const id of ['fluid-report-headline', 'fluid-report-inputs', 'fluid-report-methods', 'fluid-report-basis', 'fluid-report-separator']) {
      const list = cells(id);
      expect(list.length).toBeGreaterThan(8);
      for (const cell of list) expect([cell, inOrder(pdfText, cell)]).toEqual([cell, true]);
    }
    // the PVT table: every row of the screen table is a row of the PDF table
    const pvt = within(screen.getByTestId('fluid-report-pvt')).getAllByRole('row').slice(1);
    expect(pvt.length).toBe(ws.results.pvt.table.length);
    for (const row of pvt.filter((_, i) => i % 5 === 0)) {
      const line = within(row).getAllByRole('cell').map((c) => c.textContent.trim()).join(' ');
      expect(pdfText).toContain(line);
    }
    expect(screen.getByTestId('fluid-export-pdf')).toBeEnabled();
  });

  test('headline numbers print in full, and thousands are written out', () => {
    const m = run(identifiedBlackOil()).report.model;
    const values = m.headline.rows.map((r) => r[1]);
    expect(values[0]).toBe('2,998');
    expect(values[2]).toBe('1.3718');
    expect(values[5]).toBe('1.59e-5');
    expect(values.join(' ')).not.toMatch(/e\+\d/);
  });

  test('the saved payload reads back to the same report', () => {
    const inputs = identifiedBlackOil();
    const before = run(inputs);
    const payload = JSON.parse(JSON.stringify({ id: 'fluid-project-1', name: 'Ekene E-2000 PVT', schema: 2, inputs, pvt: before.contract }));
    const after = run(inputsFromPayload(payload));
    expect(after.report.model.inputs.rows).toEqual(before.report.model.inputs.rows);
    expect(after.report.model.headline).toEqual(before.report.model.headline);
    expect(after.report.model.pvtTable).toEqual(before.report.model.pvtTable);
    expect(after.report.model.identification).toEqual(before.report.model.identification);
    expect(payload.pvt.table).toEqual(before.results.pvt.table);
  });

  test('Latin-1 only, and a file name from the sample', () => {
    const built = pdfOf(run(identifiedBlackOil()));
    const text = readPdf(built.doc).text;
    // eslint-disable-next-line no-control-regex
    expect(text.replace(/\f/g, '')).not.toMatch(/[^\x00-\xFF]/);
    expect(reportFileName({ projectName: 'P 1', sampleName: 'BHS-2 oil' })).toBe('Fluid_Report_BHS-2_oil.pdf');
    expect(reportFileName({})).toBe('Fluid_Report_fluid.pdf');
  });
});
