/**
 * FLUID-U2-008: the uncertainty of the tuned C7+ parameters, computed by
 * the engine (engines PR #299, gated there on the curvature identity of the
 * regression), is kept with the record of the fit and shown in the Lab
 * tuning card, the report and the pvt-1 block, and withdrawn with the record.
 * The black-oil correlation match states its own intervals (fluidLabMatch.test.jsx).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { readPdf, flat } from '@/lib/reportKit/testKit';
import { tuneRecord, tuneUncertaintyRecord, knobIntervalWords } from '@/utils/fluidstudio/eosAnalysis';
import LabTuningCard from '@/components/fluidstudio/LabTuningCard';
import { eosWithLab, tune, run, pdfOf } from './fluidTestKit';

jest.setTimeout(300000);

describe('the uncertainty travels with the record of the fit', () => {
  let tuned;
  beforeAll(async () => { tuned = await tune(eosWithLab()); });

  it('the record keeps the engine\'s intervals, without the matrix', () => {
    const u = tuned.streamA.composition.tuning.fit.uncertainty;
    expect(u.targets).toBe(3);
    expect(u.dof).toBe(3);
    expect(u.tValue).toBe(3.182);
    expect(Object.keys(u.knobs)).toEqual(['fTc', 'fPc', 'kC1', 'sPlus']);
    for (const k of Object.values(u.knobs)) {
      if (k.atBound) { expect(k.ci95).toBeNull(); continue; }
      expect(k.ci95[0]).toBeLessThan(k.value);
      expect(k.ci95[1]).toBeGreaterThan(k.value);
      expect(k.ci95[1] - k.value).toBeCloseTo(3.182 * k.standardError, 10);
    }
    expect(u.covariance).toBeUndefined();
    // survives the saved project
    expect(JSON.parse(JSON.stringify(u))).toEqual(u);
  });

  it('the report prints the interval of each tuned parameter with how it was obtained', () => {
    const ws = run(tuned);
    const p = ws.report.model.tuning.parameters;
    expect(p.head).toEqual(['Parameter', 'Before tuning', 'Applied', '95 percent interval']);
    const u = tuned.streamA.composition.tuning.fit.uncertainty;
    expect(p.rows[0][3]).toBe(knobIntervalWords(u, 'fTc', (v) => v.toFixed(4)));
    expect(p.note).toMatch(/Student t interval from the regression covariance \(3 measured values and four prior pulls, 3 degrees of freedom, t = 3\.182\)/);
    const text = flat(readPdf(pdfOf(ws).doc).text);
    expect(text).toMatch(/95 percent interval/);
    expect(text).toMatch(/Student t interval from the regression covariance/);
  });

  it('the pvt-1 block carries it by addition', () => {
    const b = run(tuned).contract;
    expect(b.tuning.status).toBe('tuned');
    expect(b.tuning.uncertainty.degrees_of_freedom).toBe(3);
    expect(Object.keys(b.tuning.uncertainty.parameters)).toEqual(['fTc', 'fPc', 'kC1', 'sPlus']);
  });

  it('withdrawn with the record when the fluid moves; an old record says it has none', () => {
    const c = tuned.streamA.composition;
    const moved = { ...tuned, streamA: { ...tuned.streamA, composition: { ...c, temp: c.temp + 10 } } };
    const ws = run(moved);
    expect(ws.report.model.tuning.status).toBe('stale');
    expect(ws.report.model.tuning.parameters.rows.every((r) => r[3] === 'Withdrawn with the record of the match')).toBe(true);
    expect(ws.contract.tuning.uncertainty).toBeUndefined();
    expect(knobIntervalWords(null, 'fTc', String)).toBe('Not recorded: tuned before the app kept the uncertainty');
    expect(knobIntervalWords({ withheld: 'x', knobs: {} }, 'fTc', String)).toBe('Not stated: the regression has no curvature to read it from');
    expect(knobIntervalWords({ knobs: { fTc: { atBound: true } } }, 'fTc', String)).toBe('None: the parameter stopped at a regression bound');
    expect(knobIntervalWords({ knobs: { sPlus: { value: 0.1, ci95: [-1, 2], bounds: [-0.5, 0.5] } } }, 'sPlus', (v) => v.toFixed(1))).toBe('-1.0 to 2.0, wider than the regression bounds: the data do not pin it');
    expect(tuneUncertaintyRecord(undefined)).toBeNull();
    expect(tuneRecord({ report: [] }, c).uncertainty).toBeNull();
  });

  it('the Lab tuning card shows the intervals while the tune is current', () => {
    const c = tuned.streamA.composition;
    render(<LabTuningCard composition={c} stages={tuned.separatorTrain.stages} onUpdateTuning={() => {}} />);
    const box = screen.getByTestId('lab-tuning-uncertainty');
    expect(box.textContent).toMatch(/C7\+ Tc multiplier/);
    expect(box.textContent).toMatch(/95 percent interval/);
    expect(box.textContent).toContain(knobIntervalWords(c.tuning.fit.uncertainty, 'fTc', (v) => v.toFixed(4)));
  });
});
