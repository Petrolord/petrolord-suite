/**
 * W1.2b session snapshot helpers: localStorage capture/apply is limited
 * to the known keys (a payload can never write arbitrary storage),
 * restored indices clamp to the live geometry, and the ViewTransform
 * camera round-trips through its serializable form.
 */
import {
  LOCAL_KEYS, captureLocal, applyLocal, clampIndices,
} from '@/pages/apps/Seismolord/lib/sessionSnapshot';
import { ViewTransform, MAX_ZOOM } from '@/pages/apps/Seismolord/viewer/viewTransform';

const fakeStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    dump: () => Object.fromEntries(m),
  };
};

describe('captureLocal / applyLocal', () => {
  test('round-trips exactly the known keys', () => {
    const src = fakeStorage({
      [LOCAL_KEYS[0]]: '{"layout":"columns"}',
      [LOCAL_KEYS[1]]: '{"axes":false}',
      'unrelated.key': 'secret',
    });
    const snap = captureLocal(src);
    expect(Object.keys(snap).sort()).toEqual([LOCAL_KEYS[0], LOCAL_KEYS[1]].sort());
    const dst = fakeStorage();
    applyLocal(snap, dst);
    expect(dst.dump()).toEqual({
      [LOCAL_KEYS[0]]: '{"layout":"columns"}',
      [LOCAL_KEYS[1]]: '{"axes":false}',
    });
  });

  test('a hostile payload cannot write arbitrary keys or non-strings', () => {
    const dst = fakeStorage();
    applyLocal({ 'evil.key': 'x', [LOCAL_KEYS[0]]: { obj: true } }, dst);
    expect(dst.dump()).toEqual({});
    applyLocal(null, dst);
    expect(dst.dump()).toEqual({});
  });
});

describe('clampIndices', () => {
  const geometry = { il: { count: 100 }, xl: { count: 50 }, ns: 200 };

  test('in-range values pass, out-of-range clamp, missing fall to middle', () => {
    expect(clampIndices({ inline: 10, xline: 49, time: 500 }, geometry)).toEqual({
      inline: 10, xline: 49, time: 199,
    });
    expect(clampIndices({ inline: -3 }, geometry)).toEqual({
      inline: 0, xline: 25, time: 100,
    });
    expect(clampIndices(null, geometry)).toEqual({ inline: 50, xline: 25, time: 100 });
  });
});

describe('ViewTransform camera round-trip', () => {
  test('getCamera/setCamera restore zoom, exaggeration, and centre', () => {
    const a = new ViewTransform({ nx: 200, ny: 400, vw: 800, vh: 600 });
    a.zoomAt(4, 100, 100);
    a.setVexag(2);
    const cam = a.getCamera();
    const b = new ViewTransform({ nx: 200, ny: 400, vw: 800, vh: 600 });
    b.setCamera(cam);
    expect(b.getCamera()).toEqual(cam);
    expect(b.viewUniform()).toEqual(a.viewUniform());
  });

  test('setCamera clamps hostile values and ignores garbage', () => {
    const t = new ViewTransform({ nx: 100, ny: 100, vw: 400, vh: 400 });
    t.setCamera({ zoom: 1e9, vexag: 1e9, cx: 1e9, cy: -1e9 });
    expect(t.zoom).toBe(MAX_ZOOM);
    expect(t.vexag).toBeLessThanOrEqual(20);
    // centre clamped inside the data
    const r = t.visibleRect();
    expect(r.x0).toBeGreaterThanOrEqual(0);
    const before = t.getCamera();
    t.setCamera({ zoom: 'NaN', cx: null });
    expect(t.getCamera()).toEqual(before);
    t.setCamera(null);
    expect(t.getCamera()).toEqual(before);
  });
});
