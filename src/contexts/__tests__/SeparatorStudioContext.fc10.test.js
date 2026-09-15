// FC1-0 gates for the Separator & Slug Catcher Studio state: missing stays
// missing, the L/D band follows the vessel type, and nothing out of band is
// ever selected.
import fs from 'fs';
import path from 'path';
import {
  defaultInputs, missingVesselInputs, missingSlugInputs, missingMessage,
  selectVessel, applyVesselTypeChange, LD_BAND, ldBandFor,
} from '../SeparatorStudioContext';
import { ldSweep } from '@/utils/facilities/engine/separatorSizing';

const withProcess = (patch) => {
  const i = defaultInputs();
  return { ...i, process: { ...i.process, ...patch } };
};

describe('missing stays missing', () => {
  test('negative control: the example case is complete', () => {
    expect(missingVesselInputs(defaultInputs())).toEqual([]);
    expect(missingSlugInputs(defaultInputs())).toEqual([]);
  });

  test('cleared gas gravity and API are named, not replaced', () => {
    const missing = missingVesselInputs(withProcess({ gasSg: '', oilApi: '' }));
    expect(missing).toEqual(['Gas gravity', 'Oil gravity (API)']);
    expect(missingMessage(missing)).toBe('Missing required inputs: Gas gravity, Oil gravity (API).');
  });

  test('three-phase retention, viscosity and droplet are required only for three phase', () => {
    const cleared = { waterRetentionMin: '', dropletMicron: '', muOilCp: '' };
    expect(missingVesselInputs(withProcess(cleared))).toEqual([]);
    const i = withProcess({ ...cleared, oilRetentionMin: '' });
    i.vessel = { ...i.vessel, type: 'horizontal3' };
    expect(missingVesselInputs(i)).toEqual([
      'Oil retention (min)', 'Water retention (min)', 'Oil visc (cp)', 'Droplet (um)',
    ]);
  });

  test('the K override is optional; a blank rate is not taken as zero', () => {
    const i = defaultInputs();
    i.vessel.kOverride = '';
    expect(missingVesselInputs(i)).toEqual([]);
    expect(missingVesselInputs(withProcess({ qWaterBpd: '' }))).toEqual(['Water (bpd)']);
  });

  test('finger slug catcher bore and count are named when cleared', () => {
    const i = defaultInputs();
    i.slug = { ...i.slug, mode: 'finger', fingerIdIn: '', nFingers: '' };
    expect(missingSlugInputs(i)).toEqual(['Finger bore (in)', 'Number of fingers']);
  });

  test('the context no longer carries the substituted example numbers', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../SeparatorStudioContext.jsx'), 'utf8');
    const body = src.slice(src.indexOf('export const SeparatorStudioProvider'));
    expect(body).not.toMatch(/num\([^)]*,\s*(0\.65|35|1\.05|500|24|6|0\.8|0\.6|4|3|5|2|0\.7|0\.5)\)/);
  });
});

describe('L/D band per vessel type', () => {
  test('mirrors the band the engine documents', () => {
    const engine = fs.readFileSync(
      path.resolve(__dirname, '../../../packages/engines/engines/facilities/separatorSizing.js'), 'utf8',
    );
    expect(engine).toMatch(/3 to 5 for horizontal separators and 2 to 4\s*\n?\s*\*?\s*for vertical/);
    expect(LD_BAND.vertical2).toEqual({ min: 2, max: 4 });
    expect(LD_BAND.horizontal2).toEqual({ min: 3, max: 5 });
    expect(LD_BAND.horizontal3).toEqual({ min: 3, max: 5 });
  });

  test('switching to vertical moves an untouched band to 2 to 4, and back again', () => {
    const v = defaultInputs().vessel;
    const vertical = applyVesselTypeChange(v, 'vertical2');
    expect([vertical.ldMin, vertical.ldMax]).toEqual(['2', '4']);
    const back = applyVesselTypeChange(vertical, 'horizontal3');
    expect([back.ldMin, back.ldMax]).toEqual(['3', '5']);
  });

  test('negative control: a band the user edited is left alone', () => {
    const v = { ...defaultInputs().vessel, ldMin: '2.5', ldMax: '6' };
    const vertical = applyVesselTypeChange(v, 'vertical2');
    expect([vertical.ldMin, vertical.ldMax]).toEqual(['2.5', '6']);
    expect(vertical.type).toBe('vertical2');
    expect(ldBandFor('unknown')).toEqual(LD_BAND.horizontal2);
  });
});

describe('no first-row fallback', () => {
  const common = {
    qGasActFt3S: 2, vTerminalFtS: 0.5, qLiquidBpd: 5000, retentionMin: 3, allowanceFt: 6,
  };

  test('nothing in band selects nothing and says so', () => {
    const sweep = ldSweep({ ...common, mode: 'vertical2', diametersFt: [40, 50], ldMin: 2, ldMax: 4 });
    expect(sweep.rows.every((r) => !r.inRange)).toBe(true);
    const sel = selectVessel(sweep);
    expect(sel.noCandidate).toBe(true);
    expect(sel.diameterFt).toBeUndefined();
    expect(sel.error).toBe(
      'No candidate in the L/D band (2 to 4), so no vessel is selected. Add candidate diameters or revise the band.',
    );
  });

  test('negative control: an in-band candidate is selected', () => {
    const rows = ldSweep({ ...common, mode: 'vertical2', diametersFt: [1, 2, 3, 4, 5, 6], ldMin: 0, ldMax: 100 }).rows;
    const target = rows[2];
    const sweep = ldSweep({
      ...common, mode: 'vertical2', diametersFt: [1, 2, 3, 4, 5, 6],
      ldMin: target.ldRatio - 1e-9, ldMax: target.ldRatio + 1e-9,
    });
    const sel = selectVessel(sweep);
    expect(sel.error).toBeUndefined();
    expect(sel.diameterFt).toBe(3);
  });
});
