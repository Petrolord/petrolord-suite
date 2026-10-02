/**
 * Report Kit additions of the Fluid Systems Studio round (FLUID-U1): the
 * "Limits of this analysis" block (RL9) and the completeness guard of the
 * inputs table (RL1). Self-tests; the Well Test goldens guard the rest.
 */
import { createReport, engineInputKeys, missingInputRows } from '@/lib/reportKit';
import { readPdf, flat } from '@/lib/reportKit/testKit';

const AT = new Date('2026-10-02T09:00:00Z');

describe('limits block', () => {
  const build = (flags) => {
    const r = createReport({ title: 'Kit limits', appName: 'Report Kit self-test' });
    r.header({ identification: [['Case', 'limits']], generatedAt: AT });
    r.limits({
      assumptions: ['Black-oil correlations, no compositional effects.', 'Single reservoir temperature.'],
      ranges: { head: ['Method', 'Range'], body: [['Standing', 'Rs 20 to 1425 scf/STB'], ['Beggs-Robinson', 'API 16 to 58']], note: 'Ranges as published.' },
      flags,
    });
    return r.finish();
  };

  test('prints the assumptions, the ranges table and each flag', () => {
    const pdf = readPdf(build(['Standing: solution GOR 2000 scf/STB is outside its published range.']).doc);
    const text = flat(pdf.text);
    expect(text).toMatch(/Limits of this analysis/);
    expect(text).toMatch(/- Black-oil correlations, no compositional effects\./);
    expect(text).toMatch(/Published ranges of the methods used/);
    expect(text).toMatch(/Standing Rs 20 to 1425 scf\/STB/);
    expect(text).toMatch(/Ranges as published\./);
    expect(text).toMatch(/Inputs outside a published range - Standing: solution GOR 2000 scf\/STB is outside its published range\./);
    expect(text).not.toMatch(/No input is outside a published range/);
  });

  test('with no flag it says the check found nothing', () => {
    const pdf = readPdf(build([]).doc);
    expect(flat(pdf.text)).toMatch(/Inputs outside a published range No input is outside a published range\./);
  });
});

describe('completeness guard', () => {
  const engineInput = { api: 32, gasGravity: 0.75, pb: null, correlations: { pb_rs_bo: 'standing', viscosity: 'beggs_robinson' }, stages: [{ p: 1 }] };
  const rows = [
    { key: 'api' }, { key: 'gasGravity' }, { key: 'pb' },
    { key: 'corr', engineKeys: ['correlations.pb_rs_bo', 'correlations.viscosity'] },
    { key: 'stages' },
  ];

  test('leaf paths of the engine input, an array as one input', () => {
    expect(engineInputKeys(engineInput)).toEqual(['api', 'gasGravity', 'pb', 'correlations.pb_rs_bo', 'correlations.viscosity', 'stages']);
  });

  test('every engine input with a row: nothing missing', () => {
    expect(missingInputRows(engineInput, rows)).toEqual([]);
  });

  test('negative control: a dropped row, and a new engine input, are named', () => {
    expect(missingInputRows(engineInput, rows.filter((r) => r.key !== 'pb'))).toEqual(['pb']);
    expect(missingInputRows({ ...engineInput, salinity: 35000 }, rows)).toEqual(['salinity']);
    expect(missingInputRows({ ...engineInput, salinity: 35000 }, rows, { ignore: ['salinity'] })).toEqual([]);
  });
});
