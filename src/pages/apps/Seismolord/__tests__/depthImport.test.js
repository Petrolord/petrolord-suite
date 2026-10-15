/**
 * @jest-environment node
 */
// Depth-domain import (QI upgrade P1.6, 2026-10-15), the Suite side: the
// declaration and its checks, the crop window read by the declared interval,
// what reaches the row and the crop record, the import paths, and the
// consumers that refuse a depth volume (each with its time-volume negative
// control).
import fs from 'node:fs';
import path from 'node:path';
import {
  depthDeclaration, depthPrefill, verticalOf, isDepthVolume, timeOnlyReason, assertTimeDomain,
  applyVerticalToManifest, scanWithVertical, axisWords, valuesWords, depthDtUs,
} from '../lib/verticalDomain';
import { bufferReader } from '../engine/reader';
import { openSegyDoor } from '../lib/segyDoor';
import { scanGeometry } from '../engine/segyScan';
import { planImportCrop, importCropProvenance } from '../services/cropImport';
import { cropLines } from '../lib/volumeProvenance';
import { v4SurveyMeta } from '../services/v4SurveyMeta';
import { derivedSurveyMeta, attributePrecheck } from '../services/attributeSurveyMeta';
import { sectionLineLabel } from '../lib/sectionCaption';
import { startServerImport, startRemoteConversion } from '../services/serverImport';
import { importBlockReason } from '../components/ImportPanel';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('../services/ingestService', () => ({ scanFile: jest.fn(), ingestVolume: jest.fn() }));

const HOSTILE = path.join(__dirname, '../../../../../e2e/fixtures/seis/hostile');
const load = (f) => { const b = fs.readFileSync(path.join(HOSTILE, f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const MAP = { ilByte: 189, xlByte: 193 };
const DEPTH = depthDeclaration({ unit: 'm', dz: '10' });
const geometry = (extra = {}) => ({
  il: { min: 1, max: 4, step: 1, count: 4 }, xl: { min: 1, max: 3, step: 1, count: 3 }, ns: 50, dt_us: 4000, corners: [[0, 0], [1, 0], [0, 1]], ...extra,
});
const manifestWith = (g) => ({
  geometry: g,
  brick: { size: 8, grid: [1, 1, 7], count: 7, dtype: 'float32le' },
  stats: {},
  source: { sample_format: 5, il_byte: 189, xl_byte: 193 },
  display: { clip: 1, levels: [1] },
});

describe('the depth declaration', () => {
  test('checks the unit and the interval and keeps a velocity declaration', () => {
    expect(DEPTH).toEqual({ domain: 'depth', unit: 'm', dz: 10, values: null });
    expect(depthDeclaration({ unit: 'ft', dz: 12.5, velocity: { type: 'rms' } }).values).toEqual({ kind: 'velocity', type: 'rms', unit: 'ft/s' });
    expect(() => depthDeclaration({ unit: 'km', dz: 4 })).toThrow(/metres or feet/);
    expect(() => depthDeclaration({ unit: 'm', dz: '' })).toThrow(/sample interval/);
    expect(() => depthDeclaration({ unit: 'm', dz: -4 })).toThrow(/sample interval/);
    expect(() => depthDeclaration({ unit: 'm', dz: 4, velocity: { type: 'stacking' } })).toThrow(/interval, RMS or average/);
    expect(depthDtUs(depthDeclaration({ unit: 'ft', dz: 12.5 }))).toBe(12500);
  });

  test('prefills from the header: unit from the measurement system, interval in thousandths or as given', () => {
    expect(depthPrefill({ measurementSystem: 2, dtUs: 12500 })).toEqual({ unit: 'ft', dz: '12.5' });
    expect(depthPrefill({ measurementSystem: 1, dtUs: 4000 })).toEqual({ unit: 'm', dz: '4' });
    expect(depthPrefill({ dtUs: 4 })).toEqual({ unit: 'm', dz: '4' });
    expect(depthPrefill({ dtUs: 0 })).toEqual({ unit: 'm', dz: '' });
  });

  test('is found on a manifest, a row (survey_meta or its ingest record) and defaults to time', () => {
    const m = applyVerticalToManifest(manifestWith(geometry()), DEPTH);
    expect(m.geometry.dt_us).toBe(10000);
    expect(isDepthVolume(m)).toBe(true);
    expect(verticalOf({ survey_meta: { vertical: DEPTH } }).unit).toBe('m');
    expect(verticalOf({ survey_meta: { ingest: { vertical: DEPTH } } }).domain).toBe('depth');
    expect(verticalOf({ survey_meta: {} })).toMatchObject({ domain: 'time', unit: 'ms' });
    expect(verticalOf(null).domain).toBe('time');
    expect(axisWords(m)).toBe('depth (m)');
    expect(axisWords({})).toBe('two-way time (ms)');
    expect(valuesWords({ survey_meta: { vertical: depthDeclaration({ unit: 'm', dz: 5, velocity: { type: 'interval' } }) } })).toBe('Interval velocity in m/s');
  });

  test('a time import is left exactly as it was (negative control)', () => {
    const m = manifestWith(geometry());
    const before = JSON.stringify(m);
    applyVerticalToManifest(m, null);
    applyVerticalToManifest(m, { domain: 'time' });
    expect(JSON.stringify(m)).toBe(before);
    const scan = { dtUs: 4000 };
    expect(scanWithVertical(scan, null)).toBe(scan);
    expect(scanWithVertical(scan, DEPTH).dtUs).toBe(10000);
  });

  test('time-only tools get a plain reason for a depth volume and nothing for a time volume', () => {
    const depthRow = { name: 'PSDM vel', survey_meta: { vertical: DEPTH } };
    expect(timeOnlyReason(depthRow, 'Well ties')).toBe('PSDM vel is a depth volume (samples every 10 m). Well ties works in two-way time, so it needs a time volume.');
    expect(timeOnlyReason({ name: 'PSTM', survey_meta: {} }, 'Well ties')).toBeNull();
    expect(() => assertTimeDomain(depthRow, 'AVO')).toThrow(/depth volume/);
    expect(() => assertTimeDomain({ survey_meta: {} }, 'AVO')).not.toThrow();
    // copy rule: no em dashes
    expect(timeOnlyReason(depthRow, 'X')).not.toMatch(/—/);
  });
});

describe('what a depth import records', () => {
  test('the row survey_meta and a derived volume carry the vertical axis; a time row does not', () => {
    const m = applyVerticalToManifest(manifestWith(geometry()), DEPTH);
    const record = { bricks: { display: { storedBytes: 1 }, f32: { storedBytes: 2 } } };
    expect(v4SurveyMeta(m, record, {}).vertical).toEqual({ domain: 'depth', unit: 'm', dz: 10 });
    expect(derivedSurveyMeta(m, 'p').vertical).toEqual({ domain: 'depth', unit: 'm', dz: 10 });
    expect(v4SurveyMeta(manifestWith(geometry()), record, {}).vertical).toBeUndefined();
  });

  test('a depth slice is named in the depth unit', () => {
    const g = applyVerticalToManifest(manifestWith(geometry()), DEPTH).geometry;
    expect(sectionLineLabel(g, 'time', 12)).toBe('Depth slice 120 m');
    expect(sectionLineLabel(geometry(), 'time', 12)).toBe('Time slice 48 ms');
  });

  test('the crop window of a depth file is read by the declared interval, and the record says the unit', async () => {
    const raw = bufferReader(load('rev2_little_endian.sgy'));
    const { reader } = await openSegyDoor(raw);
    const scan = await scanGeometry(reader, MAP);
    const def = { window: { from: 20, to: 60 } };
    const prep = await planImportCrop({ raw, scan, def, mapping: MAP, dtUs: depthDtUs(DEPTH) });
    expect(prep.crop.samples.first).toBe(2);
    expect(prep.crop.samples.last).toBe(6);
    // negative control: without the declared interval the same numbers read as ms at the header interval
    const asTime = await planImportCrop({ raw, scan, def, mapping: MAP });
    expect(asTime.crop.samples.first).not.toBe(2);
    const rec = importCropProvenance(prep, { file: { name: 'vel.sgy', size: 1 }, mode: 'upload', vertical: DEPTH });
    expect(rec.vertical).toEqual({ domain: 'depth', unit: 'm', dz: 10 });
    expect(cropLines(rec).join(' ')).toMatch(/20 to 60 m \(samples 2 to 6\)/);
    const timeRec = importCropProvenance(asTime, { file: { name: 't.sgy', size: 1 }, mode: 'upload' });
    expect(timeRec.vertical).toBeUndefined();
    expect(cropLines(timeRec).join(' ')).toMatch(/ ms \(samples/);
  });

  test('the server and link imports register the row with the declaration', async () => {
    const seen = [];
    const deps = {
      upload: async () => ({ id: 'ds1' }),
      fingerprint: async () => ({}),
      prepare: async (p) => { seen.push(p); return { volumeId: 'v1', name: 'n', crsPlan: {}, ingestRec: { vertical: p.vertical } }; },
      enqueue: async (kind, params) => { seen.push(params); return 'job1'; },
    };
    await startServerImport({ file: { name: 'a.sgy', size: 1 }, mapping: {}, scan: {}, nativeCrs: null, vertical: DEPTH }, deps);
    expect(seen[0].vertical).toEqual(DEPTH);
    expect(seen[1].ingest_rec.vertical).toEqual(DEPTH);
    seen.length = 0;
    await startRemoteConversion({ remote: { name: 'b.sgy', size: 1, datasetId: 'd' }, mapping: {}, scan: {}, nativeCrs: null, vertical: DEPTH }, deps);
    expect(seen[0].vertical).toEqual(DEPTH);
    seen.length = 0;
    await startServerImport({ file: { name: 'a.sgy', size: 1 }, mapping: {}, scan: {}, nativeCrs: null }, deps);
    expect(seen[0].vertical).toBeUndefined();
  });
});

describe('consumers', () => {
  test('frequency attributes refuse a depth volume; amplitude attributes and time volumes go ahead', () => {
    const depth = applyVerticalToManifest(manifestWith(geometry()), DEPTH);
    for (const a of ['inst_freq', 'sweetness', 'spectral']) expect(attributePrecheck(a, depth)).toMatch(/hertz.*depth \(m\)/);
    expect(attributePrecheck('envelope', depth)).toBeNull();
    expect(attributePrecheck('inst_freq', manifestWith(geometry()))).toBeNull();
  });

  test('the import dialog accepts a declared depth file on the background or server path', () => {
    const scan = { ns: 10, il: { count: 4 }, xl: { count: 3 }, totalTraces: 12 };
    expect(importBlockReason({ scan, domain: 'depth', useV4: true })).toBeNull();
    expect(importBlockReason({ scan, domain: 'depth', useV4: true, verticalError: 'Give the depth sample interval, a positive number.' })).toMatch(/sample interval/);
    expect(importBlockReason({ scan, domain: 'depth', useV4: false })).toMatch(/background import or the Petrolord server/);
    expect(importBlockReason({ scan, domain: 'depth', useV4: false, compress16: true })).toMatch(/16-bit/);
    expect(importBlockReason({ scan, domain: 'time', useV4: true })).toBeNull();
  });
});
