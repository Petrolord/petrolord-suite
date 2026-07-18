/**
 * SC4 — Lab Data glue: the synthetic demo pair must be valid engine input,
 * demonstrate the Leverett collapse it advertises, and drive the full
 * CSV -> fit -> apply path.
 */
import { buildDemoSamples, KR_CSV_TEMPLATE, PC_CSV_TEMPLATE } from '../demoSamples';
import {
  validatePcTable,
  computeJTable,
  fitCoreyToKrTable,
  parseKrCsv,
  parsePcCsv,
} from '@/utils/scalCalculations';
import { validateKrTable } from '@/utils/fractionalFlowCalculations';

describe('demo sample pair', () => {
  const demo = buildDemoSamples();

  it('both samples carry valid kr and Pc tables', () => {
    for (const s of demo) {
      expect(validateKrTable(s.krRows).ok).toBe(true);
      expect(validatePcTable(s.pcRows).ok).toBe(true);
    }
  });

  it('their Pc data collapses to one J curve (the advertised Leverett demo)', () => {
    const jTables = demo.map((s) => computeJTable(s.pcRows, {
      k_md: Number(s.k_md),
      phi: Number(s.phi),
      sigma_dyncm: Number(s.sigma_dyncm),
      thetaDeg: Number(s.thetaDeg),
    }));
    expect(jTables.every((t) => t.ok)).toBe(true);
    for (let i = 0; i < jTables[0].rows.length; i++) {
      const a = jTables[0].rows[i].J;
      const b = jTables[1].rows[i].J;
      // Generated from one true J curve; only Pc rounding (4 decimals)
      // separates the two samples.
      expect(Math.abs(a - b) / a).toBeLessThan(5e-3);
    }
  });

  it('their kr tables fit Corey with the generating exponents inside 0.3', () => {
    const truths = [{ nw: 2.4, no: 2.1 }, { nw: 2.9, no: 1.9 }];
    demo.forEach((s, i) => {
      const fit = fitCoreyToKrTable(s.krRows);
      expect(fit.ok).toBe(true);
      expect(Math.abs(fit.params.nw - truths[i].nw)).toBeLessThan(0.3);
      expect(Math.abs(fit.params.no - truths[i].no)).toBeLessThan(0.3);
    });
  });
});

describe('CSV templates', () => {
  it('the shipped templates parse and validate through the real engine path', () => {
    const kr = parseKrCsv(KR_CSV_TEMPLATE);
    expect(kr.errors).toEqual([]);
    expect(validateKrTable(kr.rows).ok).toBe(true);
    const pc = parsePcCsv(PC_CSV_TEMPLATE);
    expect(pc.errors).toEqual([]);
    expect(validatePcTable(pc.rows).ok).toBe(true);
  });
});
