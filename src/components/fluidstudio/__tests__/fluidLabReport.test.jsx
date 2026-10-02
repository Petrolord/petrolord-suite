/**
 * FLUID-U2-001: the laboratory tables in the project, on the plots, in the
 * report and in the pvt-1 block. The fluid is Good Oil Co. Well No. 4 as a
 * black-oil project with its published CCE, differential liberation and
 * viscosity tables (fluidTestKit goodOilBlackOil).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { readPdf, flat, listCaptions, pointCounts, expectFigureDrawn, expectFigureStatement } from '@/lib/reportKit/testKit';
import { missingInputRows } from '@/lib/reportKit/completeness';
import { validatePvtContract } from '@/lib/inputProvenance/pvtContract';
import { buildPvtSeries, labDataForSeries } from '@/utils/fluidstudio/pvtSeries';
import { labMisfit, labDataOf } from '@/utils/fluidstudio/labData';
import LabDataDoor from '@/components/fluidstudio/LabDataDoor';
import { FluidUnitsProvider } from '@/components/fluidstudio/FluidUnitsContext';
import { goodOilBlackOil, goodOilLabData, eosWithLab, run, pdfOf, labFile } from './fluidTestKit';

const figureById = (built, id) => built.figures.find((f) => f.id === id);

describe('the model table covers the laboratory pressures', () => {
  it('is carried up to the highest lab pressure, and only when a table is loaded', () => {
    const withLab = run(goodOilBlackOil());
    expect(withLab.results.meta.fluid.sweep).toEqual({ pCover: 5015 }); // 5,000 psig
    expect(Math.max(...withLab.results.pvt.table.map((r) => r.pressure))).toBe(5015);
    const none = goodOilBlackOil();
    delete none.labData;
    const without = run(none);
    expect(without.results.meta.fluid.sweep).toBeUndefined();
    expect(Math.max(...without.results.pvt.table.map((r) => r.pressure))).toBeLessThan(5015);
  });
  it('completeness: the new engine input has its row', () => {
    const m = run(goodOilBlackOil()).report.model;
    expect(missingInputRows(m.engineInput, m.inputs.rows)).toEqual([]);
    expect(missingInputRows(m.engineInput, m.inputs.rows.filter((r) => r.key !== 'sweep.pCover'))).toEqual(['sweep.pCover']);
  });
});

describe('every PVT plot carries the laboratory points', () => {
  it('six plots with the lab values in the display unit; the relative volume plot only with a CCE table', () => {
    const inputs = goodOilBlackOil();
    const ws = run(inputs);
    const s = buildPvtSeries({ rows: ws.results.pvt.table, pb: ws.results.pvt.kpis.pb, labData: labDataForSeries(inputs) });
    expect(s.plots.map((p) => [p.id, p.lab.length])).toEqual([['bo', 21], ['rs', 11], ['muo', 18], ['z', 10], ['bg', 10], ['relvol', 24]]);
    // Bg in the display unit: 0.00685 ft3/scf is 1.2200 RB/Mscf
    expect(s.plots.find((p) => p.id === 'bg').lab.slice(-1)[0].y).toBeCloseTo((0.00685 / 5.614583) * 1000, 6);
    // SI: pressure in kPa, Rs in m3/m3
    const si = buildPvtSeries({ rows: ws.results.pvt.table, pb: ws.results.pvt.kpis.pb, labData: labDataForSeries(inputs), system: 'si' });
    const top = si.plots.find((p) => p.id === 'rs').lab.slice(-1)[0];
    expect(top.x).toBeCloseTo(2634.696 * 6.894757, 1);
    expect(top.y).toBeCloseTo(768 * 0.1781076, 3);
    // no CCE table: no relative volume plot, and no lab points at all without tables
    const noCce = { ...inputs, labData: { ...inputs.labData, cce: null } };
    expect(buildPvtSeries({ rows: ws.results.pvt.table, pb: 2503, labData: labDataForSeries(noCce) }).plots.map((p) => p.id)).toEqual(['bo', 'rs', 'muo', 'z', 'bg']);
    expect(labDataForSeries({})).toBeNull();
    expect(buildPvtSeries({ rows: ws.results.pvt.table, pb: 2503 }).plots.every((p) => p.lab.length === 0)).toBe(true);
  });
});

describe('the report states the laboratory data and the misfit', () => {
  const ws = run(goodOilBlackOil());
  const built = pdfOf(ws);
  let pdf;
  beforeAll(() => { pdf = readPdf(built.doc, { ink: true }); });
  afterAll(() => pdf.close());

  it('inputs: a row per table with the file and the read-back, the basis and the separator test', () => {
    const text = flat(pdf.text);
    // (a wrapped cell interleaves with its neighbours in the extracted text, so the pieces are matched)
    const rows = ws.report.model.inputs.rows;
    const row = (key) => rows.find((r) => r.key === key);
    expect(row('lab.dl')).toMatchObject({ label: 'Laboratory table: differential liberation at 220.0 degF', value: '12 rows' });
    expect(row('lab.dl').source).toMatch(/^Measured \(lab\): good-oil-dl-twin\.csv\. Differential liberation: 12 rows read\./);
    expect(row('lab.cce')).toMatchObject({ label: 'Laboratory table: constant composition expansion at 220.0 degF', value: '24 rows' });
    expect(row('lab.viscosity')).toMatchObject({ label: 'Laboratory table: viscosity at 220.0 degF', value: '18 rows' });
    expect(row('lab.basis')).toMatchObject({ value: 'Differential', source: 'Entered: as the laboratory reports it, per barrel of residual oil' });
    expect(row('lab.bofb')).toMatchObject({ value: '1.4740', unit: 'RB/STB' });
    expect(row('lab.rsfb')).toMatchObject({ value: '768.0', unit: 'scf/STB' });
    expect(text).toMatch(/Laboratory table: differential liberation at/);
    expect(text).toMatch(/Measured \(lab\): good-oil-dl-twin\.csv\. Differential liberation:/);
    expect(text).toMatch(/Measured \(lab\): good-oil-viscosity\.csv/);
    expect(text).toMatch(/1\.4740 RB\/STB Measured \(lab\), as entered at the lab data door/);
    expect(text).toMatch(/768\.0 scf\/STB Measured \(lab\), as entered at the lab data door/);
    expect(text).toMatch(/Pressure the table is carried up to 5,015 psia Computed: the highest pressure of the laboratory tables/);
    expect(text).toMatch(/The laboratory tables are compared with the model and enter no calculation\./);
  });

  it('the misfit table of the PDF is the misfit the engine side computes, property by property', () => {
    const stats = labMisfit({ labData: labDataOf(ws.inputs), rows: ws.results.pvt.table, pb: ws.results.pvt.kpis.pb });
    expect(stats.map((m) => m.id)).toEqual(['bo', 'rs', 'muo', 'z', 'bg', 'relvol']);
    const text = flat(pdf.text);
    const printed = ws.report.model.lab.misfit.rows;
    stats.forEach((m, i) => {
      expect(m.n).toBeGreaterThan(9);
      expect(m.outside).toBe(0);
      expect(printed[i].slice(0, 5)).toEqual([
        m.label, String(m.n), `${m.meanAbsPct.toFixed(1)}%`, `${m.biasPct >= 0 ? '+' : ''}${m.biasPct.toFixed(1)}%`, `${m.maxAbsPct.toFixed(1)}%`,
      ]);
      // and the numbers of the row are in the PDF, in order
      expect(text).toMatch(new RegExp(`${m.n} ${m.meanAbsPct.toFixed(1)}% [+-]${Math.abs(m.biasPct).toFixed(1)}% ${m.maxAbsPct.toFixed(1)}%`));
    });
    expect(text).toMatch(/Deviation is model minus laboratory, as a percent of the laboratory value/);
    expect(text).toMatch(/Laboratory saturation pressure 2,635 psia; the model has 2,503 psia \(-5\.0%\)\./);
    expect(text).toMatch(/Differential liberation data adjusted to the separator basis with the separator test \(Bofb 1\.474, Rsfb 768 scf\/STB\)/);
    expect(text).toMatch(/The adjustment gives a negative Rs at 1 low pressure; that row is left out of the Rs comparison\./);
    // the Report tab shows the same rows
    expect(ws.report.model.lab.misfit.rows).toHaveLength(6);
  });

  it('two lab figures, each panel with the model curve and the lab points the screen draws, and the misfit in the caption', () => {
    expect(listCaptions(pdf).map((c) => c.title)).toEqual(expect.arrayContaining([
      'Laboratory values against the model: oil properties', 'Laboratory values against the model: gas properties and relative volume',
    ]));
    const counts = pointCounts(built.figures);
    const screenSeries = buildPvtSeries({ rows: ws.results.pvt.table, pb: ws.results.pvt.kpis.pb, labData: labDataForSeries(ws.inputs) });
    const n = (id) => screenSeries.plots.find((p) => p.id === id);
    expect(counts.lab).toEqual([
      { 'Model Bo': n('bo').points.length, 'Laboratory Bo': 21 },
      { 'Model Rs': n('rs').points.length, 'Laboratory Rs': 11 },
      { 'Model Oil viscosity': n('muo').points.length, 'Laboratory Oil viscosity': 18 },
    ]);
    expect(counts['lab-gas']).toEqual([
      { 'Model Z': n('z').points.length, 'Laboratory Z': 10 },
      { 'Model Bg': n('bg').points.length, 'Laboratory Bg': 10 },
      { 'Model V/Vsat': n('relvol').points.length, 'Laboratory V/Vsat': 24 },
    ]);
    expectFigureDrawn(pdf, figureById(built, 'lab'), { logo: true });
    expectFigureDrawn(pdf, figureById(built, 'lab-gas'), { logo: true });
    const text = flat(pdf.text);
    for (const sentence of ws.report.model.lab.sentences) expect(text).toContain(sentence);
    expect(text).toMatch(/Misfit of the model: Oil formation volume factor Bo: 21 points, mean deviation \d+\.\d percent, largest \d+\.\d percent at [\d,]+ psia\./);
  });

  it('negative control: a builder that claims lab markers the file does not hold fails the drawn check', () => {
    const fig = figureById(built, 'lab');
    const broken = { ...fig, panels: fig.panels.map((p, i) => (i === 0 ? { ...p, marks: { ...p.marks, markers: p.marks.markers + 21 } } : p)) };
    expect(() => expectFigureDrawn(pdf, broken, { logo: true })).toThrow(/the file holds \d+ line segments and markers inside the plot area, the builder reports \d+/);
  });
});

describe('what the comparison says when it cannot compare like with like', () => {
  it('differential data with no separator test: drawn, named differential, and said in the caption and the table', () => {
    const ws = run(goodOilBlackOil({ separator: false }));
    const lab = ws.report.model.lab;
    expect(lab.comparison.basis.oil).toBe('differential');
    expect(lab.misfit.rows.find((r) => r[0] === 'Solution GOR Rs')[6]).toBe('Differential against separator basis');
    expect(lab.sentences.find((s) => /^Solution GOR/.test(s))).toMatch(/\(differential data against a separator-basis table\)/);
    const fig = ws.report.figures.find((f) => f.id === 'lab');
    expect(fig.caption).toMatch(/per barrel of residual oil/);
    expect(lab.tables.rows).toHaveLength(3);
  });

  it('a lab table at another temperature than the model is flagged', () => {
    const inputs = goodOilBlackOil();
    inputs.streamA.blackOil.temp = 200;
    const notes = run(inputs).report.model.lab.notes.join(' ');
    expect(notes).toMatch(/The differential liberation was measured at 220 degF and the model table is at 200 degF: the comparison is across temperatures\./);
    expect(notes).toMatch(/The viscosity was measured at 220 degF/);
  });

  it('no lab table: no section, and both lab figures say why', () => {
    const inputs = goodOilBlackOil();
    inputs.labData = undefined;
    const ws = run(inputs);
    expect(ws.report.model.lab).toBeNull();
    expect(ws.report.figures.find((f) => f.id === 'lab').statement).toBe('Does not apply: no laboratory table is loaded.');
    expect(ws.report.figures.find((f) => f.id === 'lab-gas').statement).toBe('Does not apply: no laboratory table is loaded.');
    expect(ws.contract.lab_data).toBeUndefined();
  });

  it('a viscosity table alone: the oil figure is drawn, the gas figure says the tables hold no gas property', () => {
    const inputs = goodOilBlackOil();
    inputs.labData = { ...goodOilLabData(), cce: null, dl: null };
    const ws = run(inputs);
    const built = pdfOf(ws);
    const pdf = readPdf(built.doc, { ink: true });
    try {
      expect(pointCounts(built.figures).lab).toHaveLength(1);
      expectFigureStatement(pdf, figureById(built, 'lab-gas'), /Does not apply: the laboratory tables loaded hold no gas property or relative volume\./);
    } finally { pdf.close(); }
  });

  it('compositional mode: the lab tables are set against the equation of state table', () => {
    const inputs = eosWithLab();
    inputs.labData = goodOilLabData();
    const ws = run(inputs);
    expect(ws.report.model.mode).toBe('eos');
    expect(ws.report.model.lab.stats.map((m) => m.id)).toEqual(['bo', 'rs', 'muo', 'z', 'bg', 'relvol']);
    // the single values of the Lab tuning card ride on the same panels
    const fig = ws.report.figures.find((f) => f.id === 'lab');
    expect(fig.panels).toHaveLength(3);
    expect(fig.caption).toMatch(/The measured separator-test values of the Lab tuning card are among the points\./);
    expect(ws.contract.lab_data.tables).toHaveLength(3);
  });
});

describe('the pvt-1 block gains the laboratory summary by addition', () => {
  it('carries the tables, the basis, the saturation pressure and the misfit; the block still validates', () => {
    const ws = run(goodOilBlackOil());
    const b = ws.contract;
    expect(validatePvtContract(b).ok).toBe(true);
    expect(b.lab_data.tables.map((t) => [t.kind, t.rows, t.temperature_degF])).toEqual([['cce', 24, 220], ['dl', 12, 220], ['viscosity', 18, 220]]);
    expect(b.lab_data.oil_basis).toBe('adjusted');
    expect(b.lab_data.separator_test).toEqual({ Bofb: 1.474, Rsfb: 768 });
    expect(b.lab_data.saturation_pressure_psia).toBeCloseTo(2634.696, 6);
    expect(b.lab_data.misfit.map((m) => m.property)).toEqual(['Bo', 'Rs', 'mu_o', 'Z', 'Bg', 'Vrel']);
    // the fields consumers already read are where they were
    for (const k of ['schema', 'methods', 'units', 'table', 'at_saturation', 'tuning', 'range_flags', 'basis', 'pb_source']) expect(b[k]).toBeDefined();
    // saved with the project: the block survives the payload
    expect(JSON.parse(JSON.stringify(b)).lab_data).toEqual(b.lab_data);
  });
});

describe('the lab data door on the page', () => {
  const mount = (inputs, setInputs) => render(
    <FluidUnitsProvider system="oilfield"><LabDataDoor inputs={inputs} setInputs={setInputs} modelTempF={220} /></FluidUnitsProvider>,
  );

  it('reads a pasted table back before anything is stored, then stores it with the project', () => {
    let state = { ...goodOilBlackOil(), labData: undefined };
    const setInputs = (fn) => { state = typeof fn === 'function' ? fn(state) : fn; };
    const view = mount(state, setInputs);
    fireEvent.change(screen.getByLabelText('Or paste the table'), { target: { value: labFile('good-oil-dl-title-tabs.txt') } });
    const back = screen.getByTestId('lab-readback');
    expect(back.getAttribute('data-ok')).toBe('yes');
    expect(back.getAttribute('data-kind')).toBe('dl');
    expect(back.getAttribute('data-rows')).toBe('12');
    expect(back.textContent).toMatch(/Pressure in psig \(read from the header\), brought to absolute with 14\.696 psi/);
    expect(back.textContent).toMatch(/Line 1 not read: Text before the table/);
    expect(state.labData).toBeUndefined();
    fireEvent.click(screen.getByTestId('lab-load'));
    expect(state.labData.dl.rows).toHaveLength(12);
    expect(state.labData.dl.tempF).toBe(220);
    expect(state.labData.dl.source.name).toBe('Pasted table');
    view.unmount();
    // the loaded table is listed, with the laboratory saturation pressure and the basis choice
    mount(state, setInputs);
    expect(screen.getByTestId('lab-table-dl').textContent).toMatch(/Differential liberation: 12 rows at 220 degF/);
    expect(screen.getByTestId('lab-psat').textContent).toMatch(/Laboratory saturation pressure: 2,635 psia \(the highest pressure of the differential liberation\)/);
    expect(screen.getByTestId('lab-basis')).toBeTruthy();
  });

  it('a table it cannot use is refused with the reason, and nothing can be loaded', () => {
    let state = { ...goodOilBlackOil(), labData: undefined };
    mount(state, (fn) => { state = fn(state); });
    fireEvent.change(screen.getByLabelText('Or paste the table'), { target: { value: labFile('good-oil-dl-no-header.csv') } });
    expect(screen.getByTestId('lab-readback').getAttribute('data-ok')).toBe('no');
    expect(screen.getByTestId('lab-readback').textContent).toMatch(/no header row/);
    expect(screen.queryByTestId('lab-load')).toBeNull();
  });

  it('numbers that do not settle the decimal mark are asked about, and the answer is used', () => {
    let state = { ...goodOilBlackOil(), labData: undefined };
    mount(state, (fn) => { state = fn(state); });
    fireEvent.change(screen.getByLabelText('Or paste the table'), { target: { value: 'Pressure (psia);Rsd\n2,620;854\n2,350;763\n2,100;684\n' } });
    expect(screen.getByTestId('lab-question')).toBeTruthy();
    expect(screen.queryByTestId('lab-load')).toBeNull();
    fireEvent.click(screen.getByText('The comma separates thousands'));
    fireEvent.click(screen.getByTestId('lab-load'));
    expect(state.labData.dl.rows[0].pressure).toBe(2620);
  });
});
