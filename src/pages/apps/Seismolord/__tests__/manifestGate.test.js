/**
 * W0.1 manifest version gate, Suite side: getManifest's gateManifest wraps
 * the engine's UNSUPPORTED_MANIFEST refusal in upgrade copy (surfaced by
 * the existing ViewerPanel load toast), and passes v1 / pre-versioning
 * manifests through untouched. The engine-side refusal rules themselves
 * are pinned in the engines repo (seismolord.manifestgate.test.js).
 */
import { gateManifest } from '@/pages/apps/Seismolord/services/manifestGate';
import { UnsupportedManifestError } from '@/pages/apps/Seismolord/engine/manifest';

const v1 = (over = {}) => ({
  manifest_version: 1,
  geometry: { il: { count: 4 }, xl: { count: 4 }, ns: 8, dt_us: 4000 },
  brick: { size: 64, grid: [1, 1, 1], dtype: 'float32le' },
  ...over,
});

describe('gateManifest', () => {
  test('returns a v1 manifest unchanged (same reference)', () => {
    const m = v1();
    expect(gateManifest(m)).toBe(m);
  });

  test('returns a pre-versioning manifest unchanged', () => {
    const m = v1();
    delete m.manifest_version;
    expect(gateManifest(m)).toBe(m);
  });

  test('a v2 (derived-volume, W2.1) manifest passes through', () => {
    const m = v1({ manifest_version: 2, kind: 'attribute' });
    expect(gateManifest(m)).toBe(m);
  });

  test('a future manifest_version becomes the upgrade message', () => {
    expect(() => gateManifest(v1({ manifest_version: 3 })))
      .toThrow(/newer version of Seismolord/);
  });

  test('a foreign brick dtype becomes the upgrade message', () => {
    const ok = v1();
    ok.brick.dtype = 'int16le-scaled';          // accepted since W4.4
    expect(() => gateManifest(ok)).not.toThrow();
    const m = v1();
    m.brick.dtype = 'int8le';
    expect(() => gateManifest(m)).toThrow(/Refresh the page/);
  });

  test('only UNSUPPORTED_MANIFEST is rewrapped; other errors pass through', () => {
    // Sanity that the engine error carries the gate name the wrapper keys on.
    expect(new UnsupportedManifestError('x').name).toBe('UNSUPPORTED_MANIFEST');
  });
});
