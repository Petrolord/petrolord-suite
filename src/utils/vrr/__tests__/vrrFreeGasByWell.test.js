// VRR-U2-002: per-well free gas printed beside the field figure (owner
// default: the field figure stays the headline). The gate calls the engine
// (vrrLedger.js buildWellVoidage) and holds the app's derived model and the
// report against it.
//
// The sample ledger with the app's starting FVFs (Bo 1.25, Bw 1.02, Bg 0.9,
// Rs 550): field free gas is zero every month (P-2 below its solution GOR
// offsets P-1); P-1 alone produces 500 Mscf of free gas in January and 50 in
// February, so 550 Mscf x 0.9 = 495 RB; produced 62,865 + 495 = 63,360 RB;
// cumulative VRR 59,460 / 63,360 = 0.93845 (printed 0.9384) beside the field 0.9458.
import { deriveVrr } from '../workspace';
import { parseVrrWellCSV, vrrTemplateCSV } from '../csvImport';
import { defaultInputs } from '@/contexts/VrrMonitorContext';
import { buildWellVoidage } from '@/utils/vrrCalculations';
import { reportOf, sampleWells, manualSample } from './vrrTestKit';
import { readPdf, flat } from '@/lib/reportKit/testKit';
import { pdfOf } from './vrrTestKit';

const ledger = () => ({ ...defaultInputs(), mode: 'imported', wellRows: parseVrrWellCSV(vrrTemplateCSV()).rows });

describe('VRR-U2-002: free gas well by well beside the field figure', () => {
  it('the derived model carries the engine result, and the field ledger is unchanged', () => {
    const inputs = ledger();
    const d = deriveVrr(inputs);
    const w = buildWellVoidage(inputs.wellRows, inputs.fvf);
    expect(d.wellVoidage.totals).toEqual(w.totals);
    expect(d.wellVoidage.totals.freeGasMscfByWell).toBeCloseTo(550, 9);
    expect(d.wellVoidage.totals.freeGasMscfField).toBeCloseTo(0, 9);
    expect(d.wellVoidage.totals.producedRBByWell).toBeCloseTo(63360, 6);
    expect(d.wellVoidage.totals.cumulativeVRRByWell).toBeCloseTo(59460 / 63360, 12);
    // the headline stays at field level
    expect(d.summary.cumulativeVRR).toBeCloseTo(59460 / 62865, 12);
    expect(d.wellVoidage.totals.producedRBField).toBeCloseTo(d.ledger.totals.producedRB, 6);
  });
  it('under the pressure track each well-month takes the FVF set of its month', () => {
    const inputs = { ...ledger(), pressureSurveys: [{ date: '2025-01-15', p_psia: 3000 }, { date: '2025-03-15', p_psia: 1800 }], pvtMode: 'track' };
    const d = deriveVrr(inputs);
    expect(d.pvt.active).toBe(true);
    expect(d.wellVoidage.totals.producedRBField).toBeCloseTo(d.ledger.totals.producedRB, 6);
    d.wellVoidage.periods.forEach((p, i) => expect(p.producedRBField).toBeCloseTo(d.ledger.rows[i].producedRB, 6));
    // negative control: without the month's set the field figure no longer closes
    const flat0 = buildWellVoidage(inputs.wellRows, inputs.fvf);
    expect(Math.abs(flat0.totals.producedRBField - d.ledger.totals.producedRB)).toBeGreaterThan(100);
  });
  it('no wells (the period grid) or a withheld VRR: nothing per well', () => {
    expect(deriveVrr(manualSample()).wellVoidage).toBeNull();
    expect(deriveVrr({ ...ledger(), fvf: { Bo: '', Bw: '1', Bg: '1', Rs: '1' } }).wellVoidage).toBeNull();
  });
  it('the report prints the per-well figure beside the field one, in the headline and the limits', () => {
    const { model } = reportOf(sampleWells());
    const row = model.headline.rows.find((r) => r[0] === 'Free gas floored well by well');
    expect(row[1]).toBe('495');
    expect(row[3]).toMatch(/550 Mscf of free gas well by well against 0 Mscf at field level; produced 63,360 RB; cumulative VRR 0\.9384 against 0\.9458/);
    expect(model.limits.assumptions.join(' ')).toMatch(/The headline keeps the field figure; the per-well figure is printed beside it/);
    expect(reportOf(manualSample()).model.headline.rows.some((r) => r[0] === 'Free gas floored well by well')).toBe(false);
  });
  it('the PDF reads back the row', () => {
    const { built } = pdfOf(sampleWells());
    const pdf = readPdf(built.doc);
    expect(flat(pdf.text)).toMatch(/Free gas floored well by well 495 RB/);
    pdf.close?.();
  });
});
