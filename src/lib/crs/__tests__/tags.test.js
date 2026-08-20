import {
  normalizeTag, isEpsgTag, isCustomTag, isTransformableTag, compareTags,
  consensusTag, LOCAL, UNKNOWN,
} from '@/lib/crs/tags';

describe('normalizeTag', () => {
  it('accepts the four vocabularies and collapses everything else to UNKNOWN', () => {
    expect(normalizeTag('EPSG:32631')).toBe('EPSG:32631');
    expect(normalizeTag('epsg:32631')).toBe('EPSG:32631');
    expect(normalizeTag('CUSTOM:6F9619FF-8B86-D011-B42D-00C04FC964FF'))
      .toBe('CUSTOM:6f9619ff-8b86-d011-b42d-00c04fc964ff');
    expect(normalizeTag('LOCAL')).toBe(LOCAL);
    expect(normalizeTag('UNKNOWN')).toBe(UNKNOWN);
    expect(normalizeTag(null)).toBe(UNKNOWN);
    expect(normalizeTag('')).toBe(UNKNOWN);
    expect(normalizeTag('UTM 31N')).toBe(UNKNOWN);
    expect(normalizeTag('EPSG:notanumber')).toBe(UNKNOWN);
  });
});

describe('predicates', () => {
  it('classify tags', () => {
    expect(isEpsgTag('EPSG:23031')).toBe(true);
    expect(isEpsgTag('LOCAL')).toBe(false);
    expect(isCustomTag('CUSTOM:6f9619ff-8b86-d011-b42d-00c04fc964ff')).toBe(true);
    expect(isTransformableTag('EPSG:23031')).toBe(true);
    expect(isTransformableTag('LOCAL')).toBe(false);
    expect(isTransformableTag(null)).toBe(false);
  });
});

describe('compareTags (the overlay guard matrix)', () => {
  it('same known tags co-render', () => {
    expect(compareTags('EPSG:32631', 'EPSG:32631')).toBe('same');
    expect(compareTags('LOCAL', 'LOCAL')).toBe('same');
  });
  it('different known tags are transformable', () => {
    expect(compareTags('EPSG:23031', 'EPSG:32631')).toBe('transformable');
    expect(compareTags('EPSG:32631', 'CUSTOM:6f9619ff-8b86-d011-b42d-00c04fc964ff'))
      .toBe('transformable');
  });
  it('any unknown side means placement unverified', () => {
    expect(compareTags(null, 'EPSG:32631')).toBe('unknown');
    expect(compareTags('EPSG:32631', undefined)).toBe('unknown');
    expect(compareTags(null, null)).toBe('unknown');
    expect(compareTags(null, 'LOCAL')).toBe('unknown');
  });
  it('a LOCAL grid never overlays a real CRS', () => {
    expect(compareTags('LOCAL', 'EPSG:32631')).toBe('local-mismatch');
    expect(compareTags('EPSG:32631', 'LOCAL')).toBe('local-mismatch');
  });
});

describe('consensusTag (derived products inherit only agreement)', () => {
  it('unanimous known tags pass through', () => {
    expect(consensusTag(['EPSG:32631', 'epsg:32631'])).toBe('EPSG:32631');
    expect(consensusTag(['LOCAL', 'LOCAL'])).toBe('LOCAL');
  });
  it('any disagreement or unknown input yields null', () => {
    expect(consensusTag(['EPSG:32631', 'EPSG:23031'])).toBeNull();
    expect(consensusTag(['EPSG:32631', null])).toBeNull();
    expect(consensusTag([null, null])).toBeNull();
    expect(consensusTag([])).toBeNull();
  });
});
