/**
 * FS5 — envelope client falls back to the synchronous trace in jsdom
 * (the worker factory is jest-mapped to a null factory) and produces the
 * same physics as the FS4 envelope module.
 */
import { createEnvelopeClient } from '../envelopeClient';
import { runEnvelopeTrace } from '../eos/envelope.worker';

const binaryRequest = {
  keys: ['C1', 'nC4'],
  z: [0.35, 0.65],
  plus: null,
  tMinF: 60,
  tMaxF: 200,
  nT: 3,
  resTempF: 100,
};

describe('envelope client (sync fallback)', () => {
  test('trace resolves with bubble/dew branches and the reservoir-T saturation point', async () => {
    const client = createEnvelopeClient();
    const res = await client.trace(binaryRequest);
    expect(res.points).toHaveLength(3);
    expect(res.bubble.length + res.dew.length).toBeGreaterThan(0);
    expect(res.satAtRes.pPsia).toBeGreaterThan(500);
    expect(['bubble', 'dew']).toContain(res.satAtRes.kind);
    client.dispose();
  });

  test('client trace equals a direct runEnvelopeTrace call', async () => {
    const client = createEnvelopeClient();
    const viaClient = await client.trace(binaryRequest);
    const direct = runEnvelopeTrace(binaryRequest);
    expect(viaClient.satAtRes.pPsia).toBeCloseTo(direct.satAtRes.pPsia, 10);
    expect(viaClient.bubble).toEqual(direct.bubble);
    client.dispose();
  });

  test('characterized C7+ request rebuilds the pseudo inside the trace', async () => {
    const client = createEnvelopeClient();
    const res = await client.trace({
      keys: ['C1', 'C7+'],
      z: [0.7, 0.3],
      plus: { mw: 190, sg: 0.84 },
      tMinF: 100,
      tMaxF: 220,
      nT: 2,
      resTempF: 150,
    });
    expect(res.satAtRes.pPsia).toBeGreaterThan(1000);
    client.dispose();
  });
});
