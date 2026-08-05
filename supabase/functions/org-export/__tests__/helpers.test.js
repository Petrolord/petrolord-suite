import {
  POINTER_TABLES,
  buildReadme,
  chunk,
  collectStorageTargets,
  createRowStore,
  mergeRows,
  safeSegment,
  storedIds,
  tableCounts,
  totalBlobBytes,
  verifyCounts,
} from '../helpers.js';

describe('chunk', () => {
  it('splits into fixed-size batches with a short tail', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('mergeRows / storedIds / tableCounts', () => {
  it('deduplicates by primary key across passes', () => {
    const store = createRowStore();
    expect(mergeRows(store, 'geo_wells', [{ id: 'a', name: 'W1' }, { id: 'b', name: 'W2' }], 'id')).toBe(2);
    // user pass re-dumps an overlapping row
    expect(mergeRows(store, 'geo_wells', [{ id: 'b', name: 'W2' }, { id: 'c', name: 'W3' }], 'id')).toBe(1);
    expect(storedIds(store, 'geo_wells').sort()).toEqual(['a', 'b', 'c']);
    expect(tableCounts(store)).toEqual({ geo_wells: 3 });
  });

  it('appends without dedupe when the table has no single uuid pk', () => {
    const store = createRowStore();
    mergeRows(store, 'legacy_link', [{ x: 1 }], null);
    mergeRows(store, 'legacy_link', [{ x: 1 }], null);
    expect(tableCounts(store)).toEqual({ legacy_link: 2 });
    expect(storedIds(store, 'legacy_link')).toEqual([]);
  });

  it('omits empty tables from counts', () => {
    const store = createRowStore();
    mergeRows(store, 'empty_table', [], 'id');
    expect(tableCounts(store)).toEqual({});
  });
});

describe('verifyCounts', () => {
  const tallies = [
    { table: 'geo_wells', column: 'organization_id', rows: 4 },
    { table: 'invoices', column: 'organization_id', rows: 2 },
  ];

  it('passes when recounts match', () => {
    expect(verifyCounts(tallies, { 'geo_wells:organization_id': 4, 'invoices:organization_id': 2 })).toEqual([]);
  });

  it('reports drifted tables', () => {
    const mismatches = verifyCounts(tallies, { 'geo_wells:organization_id': 5, 'invoices:organization_id': 2 });
    expect(mismatches).toEqual([{ table: 'geo_wells', column: 'organization_id', dumped: 4, counted: 5 }]);
  });
});

describe('collectStorageTargets', () => {
  it('routes prefixes and objects per pointer-table kind, with attribution', () => {
    const store = createRowStore();
    mergeRows(store, 'seismic_volumes', [
      { id: 'v1', storage_path: 'user-1/vol-1' },
      { id: 'v2', storage_path: null },              // registered, never uploaded
    ], 'id');
    mergeRows(store, 'geo_wells_logs', [
      { id: 'l1', storage_path: '/user-1/well-9/logs/l1.f32' },   // leading slash normalized
      { id: 'l2', storage_path: 'user-1/well-9/logs/l1.f32' },    // duplicate path deduped
    ], 'id');

    const { objects, prefixes } = collectStorageTargets(store);
    expect(prefixes).toEqual([{
      bucket: 'seismic', path: 'user-1/vol-1',
      source_table: 'seismic_volumes', source_id: 'v1', owner_user_id: 'user-1',
    }]);
    expect(objects).toEqual([{
      bucket: 'wells', path: 'user-1/well-9/logs/l1.f32',
      source_table: 'geo_wells_logs', source_id: 'l1', owner_user_id: 'user-1',
    }]);
  });

  it('ignores tables that are not storage pointers', () => {
    const store = createRowStore();
    mergeRows(store, 'invoices', [{ id: 'i1', storage_path: 'sneaky/path' }], 'id');
    const { objects, prefixes } = collectStorageTargets(store);
    expect(objects).toEqual([]);
    expect(prefixes).toEqual([]);
  });

  it('covers every bucket-backed registry we know about', () => {
    expect(Object.keys(POINTER_TABLES).sort()).toEqual([
      'geo_surfaces', 'geo_wells_logs', 'seismic_exported_surfaces',
      'seismic_horizons', 'seismic_volumes',
    ]);
  });
});

describe('totalBlobBytes', () => {
  it('sums known sizes and skips unknowns', () => {
    expect(totalBlobBytes([{ size: 10 }, { size: null }, { size: 32 }, {}])).toBe(42);
  });
});

describe('safeSegment', () => {
  it('keeps zip entry names filesystem-safe', () => {
    expect(safeSegment('geo_wells')).toBe('geo_wells');
    expect(safeSegment('weird/table name')).toBe('weird_table_name');
  });
});

describe('buildReadme', () => {
  const readme = buildReadme({
    orgName: 'Acme Petroleum', jobId: 'job-1', generatedAt: '2026-08-05T12:00:00Z',
    tableCount: 12, rowTotal: 345, blobCount: 7, notes: ['Storage listing capped.'],
  });

  it('states the essentials and carries the notes', () => {
    expect(readme).toContain('Acme Petroleum');
    expect(readme).toContain('12 tables, 345 rows');
    expect(readme).toContain('7 objects');
    expect(readme).toContain('Storage listing capped.');
  });

  it('honors the owner copy rule: no em dashes in user-facing text', () => {
    expect(readme).not.toContain('—');
  });
});
