/**
 * RP-U2-003 (2026-10-01): the zone's angle gather through the engines. The
 * harness well is the oracle's: shale over the brine sand, and with gas in
 * the sand the class III behaviour of the goldens. The picked amplitudes
 * are the engine's Zoeppritz coefficients of the interface (thick bed, zero
 * phase), the published reversal case is drawn through the same glue, and
 * the Seismolord tie wavelet is read from the stored tie record.
 */
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { mapLogs, buildModel } from '../services/prep';
import { DEFAULT_SCENARIO, DEFAULT_ROCK } from '../services/scenario';
import { computeZoneResult } from '../services/zoneResult';
import {
  zoneGather, gatherConfig, gatherAngles, tieWavelet, waveletFor, DEFAULT_GATHER,
} from '../services/gather';
import { zoeppritzRpp, akiRichards, shuey } from '../engine/avo';
import { gatherGeometry } from '../components/GatherCanvas';

async function load(name, opts) {
  const backend = makeInMemoryBackend(opts);
  const well = (await backend.listWells()).find((w) => w.name === name);
  const logs = await backend.listLogs(well.id);
  const mapped = mapLogs(logs);
  const curves = {};
  for (const [k, log] of Object.entries(mapped)) if (log) curves[k] = await backend.downloadCurve(log);
  return { well, model: buildModel(curves, mapped), zones: await backend.listZones(well.id) };
}
const rock = { ...DEFAULT_ROCK, kminOverrideGPa: '37' };
const SHALE = [2900, 1330, 2290];
const BRINE = [3200, 1800, 2250];

test('the picks at the zone top are the Zoeppritz coefficients of the interface, in situ and with gas', async () => {
  const { well, model, zones } = await load('KETA RP-1');
  const zone = zones[0]; // BRINE SAND 2020 to 2040 m, 20 m thick: clear of tuning at 60 Hz
  const res = computeZoneResult(model, zone, DEFAULT_SCENARIO, rock);
  const g = zoneGather(model, zone, res.merged, { padM: 15, freqHz: 60, dtMs: 1 }, well);
  expect(g.error).toBeUndefined();
  expect(g.angles).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40]);
  expect(g.inSitu.traces).toHaveLength(9);
  expect(g.substituted.traces).toHaveLength(9);
  const gasSand = [res.after.vp, res.after.vs, res.after.rho];
  g.angles.forEach((th, k) => {
    // the interface is spread over one log sample in time, so the pick is the coefficient to 2 percent
    const want = zoeppritzRpp(...SHALE, ...BRINE, th).re;
    expect(Math.abs(g.inSitu.picks[k] - want)).toBeLessThan(0.02 * Math.abs(want) + 0.002);
    const wantB = zoeppritzRpp(...SHALE, ...gasSand, th).re;
    expect(Math.abs(g.substituted.picks[k] - wantB)).toBeLessThan(0.02 * Math.abs(wantB) + 0.002);
  });
  // gas in the sand: a negative reflection that brightens with angle (the demo moment)
  expect(g.substituted.picks[0]).toBeLessThan(0);
  expect(Math.abs(g.substituted.picks[8])).toBeGreaterThan(Math.abs(g.substituted.picks[0]) * 1.5);
  // the interface values are Shuey's of the halfspaces
  const { a, b } = shuey(...SHALE, ...BRINE, 0);
  expect(g.inSitu.interface.a).toBeCloseTo(a, 4);
  expect(g.inSitu.interface.b).toBeCloseTo(b, 4);
  expect(g.inSitu.fit.a).toBeCloseTo(a, 2);
  // one gain for both panels: the larger of the two
  let big = 0;
  for (const side of [g.inSitu, g.substituted]) for (const tr of side.traces) for (const v of tr) big = Math.max(big, Math.abs(v));
  expect(g.gain).toBe(big);
  // negative control: Aki-Richards at 40 degrees is a different amplitude for the gas case
  const ar = zoneGather(model, zone, res.merged, { padM: 15, freqHz: 60, dtMs: 1, method: 'aki-richards' }, well);
  expect(Math.abs(ar.substituted.picks[8] - g.substituted.picks[8])).toBeGreaterThan(0.003);
  expect(Math.abs(akiRichards(...SHALE, ...gasSand, 40) - ar.substituted.picks[8])).toBeLessThan(0.02 * Math.abs(ar.substituted.picks[8]) + 0.002);
});

test('the Seismolord tie wavelet is read from the stored tie record and rotates the gather', async () => {
  const { well, model, zones } = await load('KETA RP-1');
  expect(tieWavelet(well)).toEqual({ kind: 'well', peakHz: 28, phaseDeg: 40, measuredAt: '2026-10-01T09:00:00.000Z' });
  const res = computeZoneResult(model, zones[0], DEFAULT_SCENARIO, rock);
  const tie = zoneGather(model, zones[0], res.merged, { wavelet: 'tie' }, well);
  expect(tie.wavelet.source).toBe('tie');
  expect(tie.wavelet.label).toMatch(/Seismolord tie wavelet \(well, peak 28\.0 Hz, phase 40 deg; rebuilt as a phase-rotated Ricker/);
  const ricker = zoneGather(model, zones[0], res.merged, { wavelet: 'ricker', freqHz: 28 }, well);
  // same spectrum, another phase: the traces differ
  let worst = 0;
  for (let i = 0; i < tie.inSitu.traces[0].length; i++) worst = Math.max(worst, Math.abs(tie.inSitu.traces[0][i] - ricker.inSitu.traces[0][i]));
  expect(worst).toBeGreaterThan(0.005);
  // a well with no stored tie falls back to the Ricker and says so
  const other = await load('AKOMA-2 (org shared)');
  expect(tieWavelet(other.well)).toBeNull();
  const fb = zoneGather(other.model, other.zones[0], null, { wavelet: 'tie' }, other.well);
  expect(fb.wavelet.source).toBe('ricker');
  expect(fb.notes.join(' ')).toMatch(/No tie wavelet is stored on this well/);
  expect(fb.notes.join(' ')).toMatch(/Vs is estimated/);
  expect(fb.substituted).toBeNull();
  expect(waveletFor({}, null).label).toBe('Ricker 25 Hz, zero phase');
  expect(waveletFor({ phaseDeg: 90 }, null).label).toBe('Ricker 25 Hz, phase 90 deg');
});

test('hostile settings are held to safe values; gaps and a missing zone are said', async () => {
  expect(gatherConfig({ maxAngle: 500, angleStep: 0, dtMs: NaN, method: 'x', freqHz: -3, padM: 'abc', phaseDeg: 720 })).toEqual({
    padM: 40, maxAngle: 60, angleStep: 1, method: 'zoeppritz', dtMs: 2, wavelet: 'ricker', freqHz: 5, phaseDeg: 180,
  });
  expect(gatherConfig(null)).toEqual({ ...DEFAULT_GATHER });
  expect(gatherAngles({ maxAngle: 30, angleStep: 10 })).toEqual([0, 10, 20, 30]);
  expect(zoneGather(null, null, null, {}).error).toMatch(/Pick a well and a zone/);
  const { well, model, zones } = await load('HOSTILE RP-4 (vendor export)', { hostile: true });
  const res = computeZoneResult(model, zones[0], DEFAULT_SCENARIO, DEFAULT_ROCK);
  const g = zoneGather(model, zones[0], res.merged, {}, well);
  expect(g.error).toBeUndefined();
  expect(g.notes.join(' ')).toMatch(/1 sample with a gap in Vp, Vs or density left out/);
  // a zone outside the logs has no samples
  expect(zoneGather(model, { name: 'x', top_md_m: 9000, base_md_m: 9010 }, null, {}).error).toMatch(/Fewer than two usable samples/);
});

test('past critical is said; the drawing geometry keeps time downward within the height cap', async () => {
  const { well, model, zones } = await load('KETA RP-1');
  const fast = { ...model, vp: model.vp.map((v, i) => (model.depth[i] >= 2020 && model.depth[i] <= 2040 ? 5200 : v)), vs: model.vs.map((v, i) => (model.depth[i] >= 2020 && model.depth[i] <= 2040 ? 2900 : v)) };
  const g = zoneGather(fast, zones[0], null, { maxAngle: 50 }, well);
  expect(g.notes.join(' ')).toMatch(/past the critical angle at the far angles: the real part/);
  const geo = gatherGeometry(9, 200, 2);
  expect(geo.H).toBeLessThanOrEqual(380);
  expect(geo.W).toBeGreaterThan(9 * 26);
  // a short gather is stretched, a long one squeezed, both within the height cap
  expect(gatherGeometry(9, 20, 2).pxPerMs).toBe(8);
  expect(gatherGeometry(9, 2000, 2).H).toBeLessThanOrEqual(380);
});
