/**
 * FLUID-U2-009: the composition door. The files are one published
 * composition (Good Oil Co. Well No. 4) in several shapes; see
 * e2e/fixtures/fluid-systems/composition/README.md.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { readComposition, componentKey, COMPOSITION_KEYS } from '@/utils/fluidstudio/compositionImport';
import CompositionInput from '@/components/fluidstudio/CompositionInput';
import { runEosFlash } from '@/utils/fluidstudio/eosAnalysis';

const DIR = path.join(process.cwd(), 'e2e', 'fixtures', 'fluid-systems', 'composition');
const file = (n) => fs.readFileSync(path.join(DIR, n), 'utf8');
// the engines literature fixture of the same fluid (mole fractions)
const TRUTH = { CO2: 0.91, N2: 0.16, H2S: 0, C1: 36.47, C2: 9.67, C3: 6.95, iC4: 1.44, nC4: 3.93, iC5: 1.44, nC5: 1.41, nC6: 4.33, 'C7+': 33.29 };

const same = (r) => {
  expect(r.ok).toBe(true);
  for (const k of COMPOSITION_KEYS) expect(r.zPct[k]).toBeCloseTo(TRUTH[k], 9);
  expect(r.plus).toEqual({ mw: 218, sg: 0.8515 });
};

describe('one composition in several shapes', () => {
  it('the plain table', () => {
    const r = readComposition(file('good-oil-twin.csv'));
    same(r);
    expect(r.basis).toBe('percent');
    expect(r.basisFrom).toBe('read from the header');
    expect(r.summary).toMatch(/11 components read/);
  });
  it('mole fractions, decimal commas, names spelled out, the C7+ properties as rows', () => {
    const r = readComposition(file('good-oil-fraction-semicolon.csv'));
    same(r);
    expect(r.basis).toBe('fraction');
    expect(r.summary).toMatch(/Decimal commas/);
  });
  it('the laboratory layout: a title, a weight percent column beside the mole percent, a total row, a comment', () => {
    const r = readComposition(file('good-oil-report-tabs.txt'));
    expect(r.ok).toBe(true);
    for (const k of COMPOSITION_KEYS) expect(r.zPct[k]).toBeCloseTo(TRUTH[k], 9); // the mole percent column, never the weight one
    expect(r.zPct.H2S).toBe(0);
    expect(r.summary).toMatch(/No C7\+ molecular weight was found/);
  });
  it('negative control: taken as a mole fraction, the plain table is a hundred times too much', () => {
    const r = readComposition(file('good-oil-twin.csv').replace('Mol %', 'Amount'), { basis: 'fraction' });
    expect(r.zPct.C1).toBeCloseTo(3647, 6);
    expect(r.basisFrom).toBe('chosen at the door');
    // and with no header word the total decides
    const auto = readComposition(file('good-oil-twin.csv').replace('Mol %', 'Amount'));
    expect(auto.basis).toBe('percent');
    expect(auto.basisFrom).toMatch(/^from the total \(100\.0/);
  });
});

describe('what the door refuses, and says why', () => {
  it('a heavy end split into carbon numbers with no C7+ row', () => {
    expect(readComposition(file('heavy-end-split.csv')).reason).toMatch(/one C7\+ pseudo-component: give the C7\+ fraction as one row/);
  });
  it('weight percent', () => {
    expect(readComposition(file('weight-percent.csv')).reason).toMatch(/weight percent/);
  });
  it('amounts that add up to neither 100 nor 1', () => {
    expect(readComposition('Component,Amount\nC1,40\nC7+,30\n').reason).toMatch(/add up to 70\.000: neither 100/);
  });
  it('no names, nothing at all', () => {
    expect(readComposition('A,B\n1,2\n3,4\n').ok).toBe(false);
    expect(readComposition('').ok).toBe(false);
  });
  it('names laboratories write', () => {
    expect(['Methane', 'CH4', 'c1', 'C-1'].map(componentKey)).toEqual(['C1', 'C1', 'C1', 'C1']);
    expect(['i-Butane', 'iso-Butane', 'iC4'].map(componentKey)).toEqual(['iC4', 'iC4', 'iC4']);
    expect(['Heptanes plus', 'C7+', 'C7 plus'].map(componentKey)).toEqual(['C7+', 'C7+', 'C7+']);
    expect(componentKey('Benzene')).toBeNull();
  });
});

describe('the door on the Composition tab', () => {
  it('reads back, then replaces the feed and the C7+ description; the flash runs on it', () => {
    let comp = { model: 'pr78', zPct: { C1: 50, 'C7+': 50 }, plus: { mw: 190, sg: 0.84, tbF: null }, pressure: 3000, temp: 220 };
    const view = render(<CompositionInput composition={comp} onChange={(c) => { comp = c; }} />);
    fireEvent.change(screen.getByLabelText('Or paste the table'), { target: { value: file('good-oil-twin.csv') } });
    expect(screen.getByTestId('composition-readback').getAttribute('data-ok')).toBe('yes');
    fireEvent.click(screen.getByTestId('composition-apply'));
    expect(comp.zPct.C1).toBeCloseTo(36.47, 9);
    expect(comp.plus).toEqual({ mw: 218, sg: 0.8515, tbF: null });
    expect(comp.pressure).toBe(3000);
    view.unmount();
    expect(runEosFlash(comp).parsed.valid).toBe(true);
  });
});
