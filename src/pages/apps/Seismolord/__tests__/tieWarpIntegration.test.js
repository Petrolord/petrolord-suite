/**
 * W3.3 Suite-side glue: derived-checkshot preference (imported data
 * never overwritten, derived set wins when present) and the engine
 * warp -> fitWellTie path through the panel's tie-point shape.
 */

import { effectiveCheckshots } from '@/pages/apps/Seismolord/services/wellsService';
import { makeTieWarp, warpToTiePoints } from '@/pages/apps/Seismolord/engine/tieWarp';
import { fitWellTie } from '@/pages/apps/Seismolord/engine/wellTie';

describe('effectiveCheckshots', () => {
  const imported = [{ tvdss_m: 100, twt_ms: 100 }, { tvdss_m: 500, twt_ms: 480 }];

  test('imported rows by default', () => {
    expect(effectiveCheckshots({ checkshots: imported }))
      .toEqual({ rows: imported, derived: false });
  });

  test('a committed derived set wins; imported stays untouched', () => {
    const derived = { rows: [{ tvdss_m: 100, twt_ms: 104 }, { tvdss_m: 500, twt_ms: 492 }] };
    const well = { checkshots: imported, checkshots_derived: derived };
    expect(effectiveCheckshots(well)).toEqual({ rows: derived.rows, derived: true });
    expect(well.checkshots).toBe(imported);
  });

  test('a cleared or too-short derived set falls back', () => {
    expect(effectiveCheckshots({ checkshots: imported, checkshots_derived: null }).derived).toBe(false);
    expect(effectiveCheckshots({
      checkshots: imported,
      checkshots_derived: { rows: [{ tvdss_m: 1, twt_ms: 1 }] },
    }).derived).toBe(false);
    expect(effectiveCheckshots({}).rows).toEqual([]);
  });
});

describe('anchors -> calibration through the panel shapes', () => {
  test('a constant-velocity truth is recovered end to end', () => {
    // synthetic built at 2000 m/s (z = 0.5 t_syn); seismic truth 2500 m/s
    const zOf = (seisMs) => 1.25 * seisMs;
    const anchors = [400, 800].map((seisMs) => ({
      synTwtMs: 2 * zOf(seisMs), seisTwtMs: seisMs,
    }));
    const warp = makeTieWarp(anchors);
    const ties = warpToTiePoints(warp, (synMs) => 0.5 * synMs, { wellName: 'W1', cell: 42 });
    expect(ties.every((t) => t.cell === 42)).toBe(true);
    const fit = fitWellTie(ties, { v0: 2000, k: 0 }, { dtUs: 4000 });
    expect(fit.model.v0).toBeCloseTo(2500, 0);
    expect(fit.rmsAfterM).toBeLessThan(0.1);
  });
});
