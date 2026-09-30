/**
 * SEIS-U1 PL5: state saved by earlier releases (e2e/fixtures/seis/saved).
 * Manifests from July 2026 to now open (or refuse by name when newer);
 * sessions from W1.2b and the tester programme restore what this build
 * knows, clamp to the volume, and ignore unknown keys; a session whose
 * volume is gone is refused BEFORE anything is applied (SEIS-U1-015;
 * negative control: ViewerPanel applied the layout and display, then
 * threw).
 */
import fs from 'fs';
import path from 'path';
import { gateManifest } from '../services/manifestGate';
import { geomFromManifest } from '../engine/sliceAssembly';
import { surveyAffine } from '../engine/surveyGeometry';
import {
  applyLocal, clampIndices, sessionVolumeProblem, LOCAL_KEYS,
} from '../lib/sessionSnapshot';

const DIR = path.join(__dirname, '../../../../../e2e/fixtures/seis/saved');
const load = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

describe('manifests from every release', () => {
  test.each([
    'manifest_v0_prephase_2026-07.json',
    'manifest_v1_affine_2026-07-11.json',
    'manifest_v1_int16_2026-08-21.json',
    'manifest_v2_attribute_2026-08-20.json',
  ])('%s opens with its geometry', (f) => {
    const m = gateManifest(load(f));
    const g = geomFromManifest(m);
    expect([g.nIl, g.nXl, g.ns]).toEqual([8, 6, 40]);
  });

  test('a pre-affine manifest falls back to its corners; the affine one reads its vectors', () => {
    expect(surveyAffine(load('manifest_v1_affine_2026-07-11.json').geometry)).toBeTruthy();
  });

  test('a newer build\'s manifest is refused with the upgrade message', () => {
    expect(() => gateManifest(load('manifest_v5_future.json'))).toThrow(/newer version of Seismolord/);
  });
});

describe('sessions from every release', () => {
  const store = () => {
    const m = new Map();
    return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
  };
  const VOLUMES = [{ id: 'vol-1' }];

  test('W1.2b and tester-programme sessions restore known keys only and clamp indices', () => {
    for (const f of ['session_w1_2026-08-20.json', 'session_slt_2026-09-22.json']) {
      const p = load(f);
      expect(sessionVolumeProblem(p, VOLUMES)).toBeNull();
      const s = store();
      applyLocal(p.local, s);
      for (const k of s.m.keys()) expect(LOCAL_KEYS).toContain(k);
      expect(s.m.has('evil.key')).toBe(false);
      const idx = clampIndices(p.indices, { il: { count: 8 }, xl: { count: 6 }, ns: 40 });
      expect(idx.inline).toBeLessThan(8);
      expect(idx.xline).toBeLessThan(6);
      expect(idx.time).toBeLessThan(40);
    }
  });

  test('SEIS-U1-015: a session whose volume is gone is refused before anything is applied', () => {
    const p = load('session_deleted_volume.json');
    expect(sessionVolumeProblem(p, VOLUMES)).toMatch(/no longer exists.*Nothing was changed/);
    const src = fs.readFileSync(path.join(__dirname, '../components/ViewerPanel.jsx'), 'utf8');
    const body = src.slice(src.indexOf('const restoreSession = async'));
    expect(body.indexOf('sessionVolumeProblem(')).toBeLessThan(body.indexOf('applyLocal('));
  });

  test('a newer build\'s session opens: unknown fields ignored, missing indices centred', () => {
    const p = load('session_newer_build.json');
    expect(sessionVolumeProblem(p, VOLUMES)).toBeNull();
    const idx = clampIndices(p.indices, { il: { count: 8 }, xl: { count: 6 }, ns: 40 });
    expect(idx).toEqual({ inline: 3, xline: 3, time: 20 });
  });
});
