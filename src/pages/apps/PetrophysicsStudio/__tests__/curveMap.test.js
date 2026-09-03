// Alias width + description hints (owner finding 2026-09-03: resistivity
// arrives as RES, RESD, A16H, A34H, P22H, P40H, ... and must be bindable).
import { mapLogs, candidatesFor, unmappedLogs, CURVE_ALIASES } from '../services/curveMap';

const L = (mnemonic, description = '', id = mnemonic) => ({ id, mnemonic, description });

test('service-company resistivity mnemonics auto-map to RT; first alias wins', () => {
  for (const m of ['RES', 'RESD', 'ILD', 'LLD', 'RLA5', 'AT90', 'A16H', 'A34H', 'P22H', 'P40H', 'M2R9', 'HLLD']) {
    expect(mapLogs([L('DEPT'), L(m)]).RT?.mnemonic).toBe(m);
  }
  expect(mapLogs([L('DEPT'), L('A34H'), L('RT')]).RT.mnemonic).toBe('RT'); // RT is first in the alias list
});

test('candidatesFor offers every alias match AND description hits; mapLogs never auto-binds a hint', () => {
  const logs = [L('DEPT'), L('A16H'), L('A34H'), L('P40H'), L('XZQ', 'Deep laterolog resistivity'), L('GR')];
  expect(candidatesFor('RT', logs).map((l) => l.mnemonic)).toEqual(['A16H', 'A34H', 'P40H', 'XZQ']);
  expect(mapLogs([L('DEPT'), L('XZQ', 'Deep laterolog resistivity')]).RT).toBeNull();
});

test('unmappedLogs lists the curves no input took (so they can go on a track as log:<MNEMONIC>)', () => {
  const logs = [L('DEPT'), L('GR'), L('A16H'), L('A34H'), L('TENS'), L('SP')];
  const mapped = mapLogs(logs);
  expect(unmappedLogs(logs, mapped).map((l) => l.mnemonic)).toEqual(['A34H', 'TENS', 'SP']);
});

test('alias lists have no duplicates across keys', () => {
  const seen = new Map();
  for (const [key, list] of Object.entries(CURVE_ALIASES)) {
    for (const a of list) {
      expect(seen.has(a) ? `${a} in ${seen.get(a)} and ${key}` : null).toBeNull();
      seen.set(a, key);
    }
  }
});

test('PT7: a digitized KEY_DIG curve is offered as a candidate but never auto-mapped', () => {
  const logs = [{ id: 1, mnemonic: 'GR_DIG' }, { id: 2, mnemonic: 'GR_DIG:2' }, { id: 3, mnemonic: 'NPHI' }];
  expect(candidatesFor('GR', logs).map((l) => l.id)).toEqual([1, 2]);
  expect(mapLogs(logs).GR).toBeNull();
  expect(mapLogs(logs).NPHI.id).toBe(3);
});
