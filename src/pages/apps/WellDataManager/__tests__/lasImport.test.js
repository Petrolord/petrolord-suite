/**
 * G1.2 import layer: ft->m conversion against the feet_20 golden's
 * KNOWN raw values (the fixture exists for exactly this — README), SI
 * passthrough, irregular-step detection, provenance recording.
 */
import fs from 'fs';
import path from 'path';

import { parseLas } from '@/pages/apps/WellDataManager/engine/lasParse';
import {
  FT_PER_M, prepareLogs, suggestWellHeader, depthUnitToMetres, uniformStepM, guessCurveKind,
} from '@/pages/apps/WellDataManager/engine/lasImport';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'wells');
const loadLas = (name) => fs.readFileSync(path.join(DATA_DIR, 'las', `${name}.las`), 'utf8');
const loadF32 = (name, mnemonic) => {
  const buf = fs.readFileSync(path.join(DATA_DIR, 'goldens', `${name}.${mnemonic}.f32`));
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};

describe('feet_20 converts to SI against known raw values', () => {
  const prep = prepareLogs(parseLas(loadLas('feet_20')), { sourceFile: 'feet_20.las' });

  test('depth F -> m, sample-for-sample fround(raw * 0.3048)', () => {
    const rawDept = loadF32('feet_20', 'DEPT');
    const dept = prep.logs[0];
    expect(dept.unit).toBe('M');
    expect(dept.sourceUnit).toBe('F');
    expect(dept.converted).toBe(true);
    for (let i = 0; i < rawDept.length; i++) {
      expect(dept.data[i]).toBe(Math.fround(rawDept[i] * FT_PER_M));
    }
    expect(dept.data[0]).toBeCloseTo(4900 * 0.3048, 4);        // 1493.52 m
    expect(prep.startMdM).toBeCloseTo(1493.52, 4);
    expect(prep.stopMdM).toBeCloseTo(5200 * 0.3048, 4);
    expect(prep.stepM).toBeCloseTo(2 * 0.3048, 3);   // regular in ft stays regular in m (f32 quantised)
  });

  test('sonic US/F -> US/M divides by 0.3048; provenance records the factor', () => {
    const dt = prep.logs.find((l) => l.mnemonic === 'DT');
    const raw = loadF32('feet_20', 'DT');
    expect(dt.unit).toBe('US/M');
    expect(dt.converted).toBe(true);
    for (let i = 0; i < raw.length; i++) {
      expect(dt.data[i]).toBe(Math.fround(raw[i] * (1 / FT_PER_M)));
    }
    expect(dt.provenance.unit_from).toBe('US/F');
    expect(dt.provenance.unit_to).toBe('US/M');
    expect(dt.provenance.factor).toBeCloseTo(1 / 0.3048, 12);
    expect(dt.provenance.source_file).toBe('feet_20.las');
  });

  test('already-SI curves pass through with the SAME array, no factor recorded', () => {
    const gr = prep.logs.find((l) => l.mnemonic === 'GR');
    expect(gr.unit).toBe('GAPI');
    expect(gr.converted).toBe(false);
    expect(gr.provenance.unit_from).toBeUndefined();
  });
});

describe('metric and irregular fixtures', () => {
  test('basic_20 passes through untouched with 0.5 m step', () => {
    const prep = prepareLogs(parseLas(loadLas('basic_20')));
    expect(prep.depthFactor).toBe(1);
    expect(prep.stepM).toBeCloseTo(0.5, 9);
    const parsedAgain = parseLas(loadLas('basic_20'));
    expect(Array.from(prep.logs[0].data)).toEqual(Array.from(parsedAgain.curves[0].data));
  });

  test('irregular_20 detects step null — the depth vector is data', () => {
    const prep = prepareLogs(parseLas(loadLas('irregular_20')));
    expect(prep.stepM).toBeNull();
    expect(prep.logs[0].stepM).toBeNull();
    expect(prep.logs[0].kind).toBe('depth');   // stored as its own log row
  });

  test('nullheavy start/stop skip nothing — depth has no nulls', () => {
    const prep = prepareLogs(parseLas(loadLas('nullheavy_20')));
    expect(prep.startMdM).toBe(1500);
    expect(prep.stopMdM).toBe(1600);
  });
});

describe('header suggestion', () => {
  test('feet_20: name/uwi from ~Well, KB ft->m... KB is already metric here', () => {
    const s = suggestWellHeader(parseLas(loadLas('feet_20')));
    expect(s.name).toBe('KETA G1-1');
    expect(s.uwi).toBe('KETA-G1-FEET');
    expect(s.kbM).toBeCloseTo(31.2, 6);                       // KB  .M in ~Params
    expect(s.tdMdM).toBeCloseTo(5200 * 0.3048, 4);            // STOP.F converts
    expect(s.unitsNote).toMatch(/F -> m/);
  });

  test('wrapped_12 (LAS 1.2): values land despite the colon swap', () => {
    const s = suggestWellHeader(parseLas(loadLas('wrapped_12')));
    expect(s.name).toBe('KETA G1-2');
    expect(s.uwi).toBe('KETA-G1-WRAPPED');
  });
});

describe('unit helpers', () => {
  test('depthUnitToMetres', () => {
    expect(depthUnitToMetres('M')).toBe(1);
    expect(depthUnitToMetres(' ft ')).toBe(0.3048);
    expect(depthUnitToMetres('F')).toBe(0.3048);
    expect(depthUnitToMetres('furlong')).toBeNull();
  });

  test('unknown depth unit is a clear domain error, not a guess', () => {
    const las = '~Version\nVERS. 2.0 : V\nWRAP. NO : W\n~Well\nNULL. -999.25 : N\n'
      + '~Curve\nDEPT.CUBIT : d\nGR.GAPI : g\n~A\n0 1\n';
    expect(() => prepareLogs(parseLas(las)))
      .toThrow(/Depth unit "CUBIT" is not recognised/);
  });

  test('uniformStepM rejects reversed and non-finite steps', () => {
    expect(uniformStepM(new Float32Array([0, 0.5, 1.0]))).toBeCloseTo(0.5, 6);
    expect(uniformStepM(new Float32Array([1, 0.5, 0]))).toBeNull();
    expect(uniformStepM(new Float32Array([0, NaN, 1]))).toBeNull();
    expect(uniformStepM(new Float32Array([0]))).toBeNull();
  });

  test('guessCurveKind maps aliases and run suffixes', () => {
    expect(guessCurveKind('GR:2')).toBe('gr');
    expect(guessCurveKind('DTCO')).toBe('sonic');
    expect(guessCurveKind('WEIRD')).toBeNull();
  });
});
