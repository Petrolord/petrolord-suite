/**
 * Phase 6 memory-discipline soak.
 *
 * Always-on tier: a ~139 MB virtual volume transcoded under a 32 MiB
 * engine budget — proves multi-band, multi-pass streaming holds the
 * ceiling in every CI run.
 *
 * Full tier (SEISMOLORD_SOAK=1): the plan's 4 GB ingestion soak — a
 * 1000x1000x1000-sample virtual volume (~4.24 GB, 4096 bricks) under a
 * 256 MiB budget. Run manually: SEISMOLORD_SOAK=1 npx jest soak
 */
import { scanGeometry } from '@/pages/apps/Seismolord/engine/segyScan';
import { transcodeToBricks } from '@/pages/apps/Seismolord/engine/brickTranscode';
import { virtualSegyReader } from './soak.helpers';

async function soak({ nIl, nXl, ns, budget, brickSize = 64 }) {
  const reader = virtualSegyReader({ nIl, nXl, ns });
  const scan = await scanGeometry(reader, {}, { maxTraces: 4000 });
  expect(scan.sampled).toBe(nIl * nXl > 4000);
  // sampled previews can't certify regularity; the transcoder re-checks
  // every trace, so hand it a full-scan shape derived from the preview.
  const fullScan = {
    ...scan,
    sampled: false,
    regular: true,
    inlineSorted: true,
  };
  let bricks = 0;
  const result = await transcodeToBricks(reader, fullScan, {
    brickSize,
    memoryBudgetBytes: budget,
    onBrick: () => { bricks += 1; },   // discard payloads: memory is the subject
  });
  return { reader, result, bricks };
}

describe('memory-budget soak (always on)', () => {
  test('139 MB virtual volume holds a 32 MiB engine budget', async () => {
    const BUDGET = 32 * 1024 * 1024;
    const { reader, result, bricks } = await soak({
      nIl: 256, nXl: 256, ns: 500, budget: BUDGET,
    });
    expect(reader.size).toBeGreaterThan(4 * BUDGET);
    expect(result.peakBytes).toBeLessThanOrEqual(BUDGET);
    expect(result.passesPerBand).toBeGreaterThan(1);        // k-windowing engaged
    expect(result.traceCount).toBe(256 * 256);
    expect(bricks).toBe(4 * 4 * 8);
  }, 120000);
});

const fullSoak = process.env.SEISMOLORD_SOAK === '1' ? describe : describe.skip;

fullSoak('4 GB ingestion soak (SEISMOLORD_SOAK=1)', () => {
  test('4.24 GB virtual volume streams through a 256 MiB budget', async () => {
    const BUDGET = 256 * 1024 * 1024;
    const t0 = Date.now();
    const { reader, result, bricks } = await soak({
      nIl: 1000, nXl: 1000, ns: 1000, budget: BUDGET,
    });
    const minutes = (Date.now() - t0) / 60000;
    // eslint-disable-next-line no-console
    console.log(`[soak] ${(reader.size / 1e9).toFixed(2)} GB in ${minutes.toFixed(1)} min, `
      + `peak ${(result.peakBytes / 2 ** 20).toFixed(0)} MiB, ${bricks} bricks, `
      + `${result.passesPerBand} pass(es)/band`);
    expect(reader.size).toBeGreaterThan(4e9);          // > 4 GB (the plan's target)
    expect(result.peakBytes).toBeLessThanOrEqual(BUDGET);
    expect(result.traceCount).toBe(1000 * 1000);
    expect(bricks).toBe(16 * 16 * 16);
  }, 1800000);
});
