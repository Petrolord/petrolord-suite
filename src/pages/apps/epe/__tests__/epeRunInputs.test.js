import { snapshotOf, compareRunInputs, filesForScenario } from '../epeRunInputs';

const P2 = { id: 'p1', file_name: 'ekene-production-2p.csv', created_at: '2026-10-13T10:00:00Z', scenario_label: '2P' };
const PB = { id: 'pb', file_name: 'base.csv', created_at: '2026-10-13T10:00:00Z', scenario_label: null };
const CX = { id: 'c1', file_name: 'ekene-capex.csv', created_at: '2026-10-13T10:00:01Z' };
const OX = { id: 'o1', file_name: 'ekene-opex.csv', created_at: '2026-10-13T10:00:02Z' };
const files = { production: [P2, PB], capex: [CX], opex: [OX] };
const runOf = (inputs, created_at = '2026-10-13T11:00:00Z') => ({ created_at, parameters: inputs ? { source: 'EpeRunConsole', inputs } : { source: 'EpeRunConsole' } });

describe('epeRunInputs', () => {
  test('the snapshot keeps only the priced scenario and every capex and opex file', () => {
    const snap = snapshotOf(files, '2P');
    expect(snap.map((s) => s.id)).toEqual(['p1', 'c1', 'o1']);
    expect(snap[0]).toEqual({ table: 'epe_production_volumes', id: 'p1', file_name: 'ekene-production-2p.csv', created_at: P2.created_at, scenario_label: '2P' });
    expect(snapshotOf(files, '').map((s) => s.id)).toEqual(['pb', 'c1', 'o1']);
    expect(filesForScenario(files.production, null)).toEqual([PB]);
  });

  test('unchanged data is current', () => {
    expect(compareRunInputs(runOf(snapshotOf(files, '2P')), files)).toEqual({ state: 'current', changes: [] });
  });

  test('a file in another scenario does not make the run out of date', () => {
    const later = { ...files, production: [...files.production, { id: 'p9', file_name: 'low.csv', created_at: '2026-10-14T00:00:00Z', scenario_label: '1P' }] };
    expect(compareRunInputs(runOf(snapshotOf(files, '2P')), later).state).toBe('current');
  });

  test('a replaced production file is named, old and new', () => {
    const now = { ...files, production: [{ id: 'p2', file_name: 'FSH - Ekene-11 low.generated', created_at: '2026-10-14T00:00:00Z', scenario_label: '2P' }, PB] };
    expect(compareRunInputs(runOf(snapshotOf(files, '2P')), now)).toEqual({
      state: 'changed',
      changes: ['Production: ekene-production-2p.csv was replaced by FSH - Ekene-11 low.generated.'],
    });
  });

  test('added and removed files say so by slot', () => {
    const snap = snapshotOf(files, '2P');
    const added = { ...files, capex: [CX, { id: 'c2', file_name: 'ekene-13-capex.csv' }] };
    expect(compareRunInputs(runOf(snap), added).changes).toEqual(['CAPEX: ekene-13-capex.csv was added.']);
    const removed = { ...files, opex: [] };
    expect(compareRunInputs(runOf(snap), removed).changes).toEqual(['OPEX: ekene-opex.csv was removed.']);
  });

  test('a run saved before the snapshot falls back to dates and stays quiet otherwise', () => {
    const legacy = runOf(null, '2026-10-13T11:00:00Z');
    expect(compareRunInputs(legacy, files)).toEqual({ state: 'unknown', changes: [] });
    const newer = { ...files, opex: [{ id: 'o2', file_name: 'opex-v2.csv', created_at: '2026-10-13T12:00:00Z' }] };
    expect(compareRunInputs(legacy, newer)).toEqual({ state: 'changed', changes: ['OPEX: opex-v2.csv was uploaded after this run.'] });
    // with the run's scenario known, a newer file in another scenario is not counted
    const other = { ...files, production: [...files.production, { id: 'p7', file_name: '3p.csv', created_at: '2026-10-13T12:00:00Z', scenario_label: '3P' }] };
    expect(compareRunInputs(legacy, other, { scenario: '2P' }).state).toBe('unknown');
    expect(compareRunInputs({ parameters: {} }, newer).state).toBe('unknown');
  });
});
