// The Logs table's Source cell for computed curves (2026-10-14): a published
// pore pressure prognosis named "Pore Pressure Studio, pp-1.1.0, <date>"
// instead of an empty mark, and its badge naming the app in words.
import { curveSource, curveOrigin } from '../engine/provenance';

const pp = { mnemonic: 'PP', source_file: null, created_at: '2026-10-14T10:02:00Z', provenance: { computed: true, engine: 'pore-pressure-studio', pipeline_version: 'pp-1.1.0', input_log_ids: ['a', 'b'] } };

test('a computed curve names the app, its pipeline and the day it was written', () => {
  expect(curveSource(pp)).toBe('Pore Pressure Studio, pp-1.1.0, 2026-10-14');
  expect(curveOrigin(pp).title).toMatch(/^Computed by Pore Pressure Studio \(pressure prognosis\), pipeline pp-1\.1\.0, from 2 input curves\./);
});

test('a loaded log keeps its file name; an unknown engine is named by its id', () => {
  expect(curveSource({ source_file: 'Ekene-1.las', provenance: { las_version: 2 } })).toBe('Ekene-1.las');
  expect(curveSource({ provenance: { computed: true, engine: 'x-studio' } })).toBe('x-studio');
});

test('negative control: a plain row with neither file nor computed provenance says nothing', () => {
  expect(curveSource({ provenance: {} })).toBeNull();
  expect(curveSource({})).toBeNull();
});
