// Source freshness model (2026-10-12). The negative controls: an unchanged
// source gives no notice, a re-save that leaves the content alone gives no
// notice, and a kept change stays quiet only for the version that was kept.
import {
  sourceRef, compareSource, keepSource, keepToken, fingerprintOf, needsAttention, noticeText, staleResultsText, pruneKept, describeChange,
} from '../model';

const zone = (props, over = {}) => ({ id: 'z1', well_id: 'w1', name: 'Keta Sand', top_md_m: 1500, base_md_m: 1660, properties: props, updated_at: '2026-10-01T09:00:00.000Z', ...over });
const ref = () => sourceRef({ key: 'zone:z1', kind: 'geo_wells_zones', row: zone({ phi_avg: 0.2, ntg: 0.7 }), name: 'Keta Sand in KETA-1', usedAt: '2026-10-01T10:00:00.000Z' });

describe('compareSource', () => {
  it('an unchanged source is unchanged (negative control)', () => {
    expect(compareSource(ref(), zone({ phi_avg: 0.2, ntg: 0.7 })).status).toBe('unchanged');
  });
  it('a re-save with the same content (updated_at moves) is not a change', () => {
    const r = compareSource(ref(), zone({ ntg: 0.7, phi_avg: 0.2 }, { updated_at: '2026-10-09T09:00:00.000Z' }));
    expect(r.status).toBe('unchanged');
    expect(r.basis).toBe('content');
  });
  it('a republished zone is changed, says what moved, when, and the editor id', () => {
    const r = compareSource(ref(), zone({ phi_avg: 0.23, ntg: 0.7 }, { updated_at: '2026-10-08T14:20:00.000Z', updated_by: 'u-ada' }));
    expect(r.status).toBe('changed');
    expect(r.changedAt).toBe('2026-10-08T14:20:00.000Z');
    expect(r.changedById).toBe('u-ada');
    expect(r.differences).toEqual(['porosity 0.2 to 0.23']);
  });
  it('a missing row is deleted; a row that could not be read is unknown', () => {
    expect(compareSource(ref(), null).status).toBe('deleted');
    expect(compareSource(ref(), undefined).status).toBe('unknown');
  });
  it('version decides when there is no fingerprint', () => {
    const r = { key: 'w', kind: 'other', id: 'w1', version: 3, used_at: '2026-10-01T00:00:00Z' };
    expect(compareSource(r, { id: 'w1', version: 3, updated_at: '2026-10-09T00:00:00Z' }).status).toBe('unchanged');
    expect(compareSource(r, { id: 'w1', version: 4 }).status).toBe('changed');
  });
  it('a reference saved before stamps were recorded compares updated_at with the time it was used', () => {
    const legacy = { key: 'area:s1', kind: 'geo_surfaces', id: 's1', used_at: '2026-09-10T00:00:00Z' };
    expect(compareSource(legacy, { id: 's1', updated_at: '2026-09-01T00:00:00Z' }).status).toBe('unchanged');
    expect(compareSource(legacy, { id: 's1', updated_at: '2026-09-11T00:00:00Z' }).status).toBe('changed');
    expect(compareSource({ key: 'x', kind: 'geo_surfaces', id: 's1' }, { id: 's1', updated_at: '2026-09-11T00:00:00Z' }).status).toBe('unknown');
  });
});

describe('keep current values', () => {
  it('keeps a change quiet for that version only', () => {
    const r1 = compareSource(ref(), zone({ phi_avg: 0.23, ntg: 0.7 }));
    const kept = keepSource({}, r1);
    expect(compareSource(ref(), zone({ phi_avg: 0.23, ntg: 0.7 }), kept).status).toBe('kept');
    // a further publish shows the notice again
    expect(compareSource(ref(), zone({ phi_avg: 0.25, ntg: 0.7 }), kept).status).toBe('changed');
  });
  it('keeps a deletion', () => {
    const r = compareSource(ref(), null);
    expect(compareSource(ref(), null, keepSource({}, r)).status).toBe('kept');
    expect(keepToken(ref(), null)).toBe('deleted');
  });
  it('prunes keep decisions for sources no longer referenced', () => {
    expect(pruneKept({ a: 'x', b: 'y' }, [{ key: 'b' }])).toEqual({ b: 'y' });
  });
});

describe('wording', () => {
  it('names the source, its type, when it was used, when and by whom it changed', () => {
    const r = { ...compareSource(ref(), zone({ phi_avg: 0.23, ntg: 0.7 }, { updated_at: '2026-10-08T14:20:00.000Z' })), changedBy: 'Ada Colleague' };
    const t = noticeText(r);
    expect(t.headline).toBe('Keta Sand in KETA-1 (published petrophysics zone) changed after this project used it.');
    expect(t.detail).toBe('Used 2026-10-01 10:00 UTC. Changed 2026-10-08 14:20 UTC by Ada Colleague. What moved: porosity 0.2 to 0.23.');
    expect(`${t.headline} ${t.detail}`).not.toMatch(/—/);
  });
  it('says a deletion and marks results only for sources that affect them', () => {
    const del = compareSource(ref(), null);
    expect(noticeText(del).headline).toMatch(/was deleted from the registry, or is no longer shared with you/);
    expect(staleResultsText([del])).toMatch(/^Computed from inputs whose source changed: Keta Sand in KETA-1\./);
    expect(staleResultsText([{ ...del, ref: { ...del.ref, affects_results: false } }])).toBeNull();
    expect(staleResultsText([compareSource(ref(), zone({ phi_avg: 0.2, ntg: 0.7 }))])).toBeNull();
    expect(needsAttention([del]).length).toBe(1);
  });
  it('the fingerprint is stable under key order', () => {
    expect(fingerprintOf({ a: 1, b: { c: 2, d: 3 } })).toBe(fingerprintOf({ b: { d: 3, c: 2 }, a: 1 }));
    expect(describeChange(ref(), zone({ phi_avg: 0.2, ntg: 0.7 }))).toEqual([]);
  });
});
