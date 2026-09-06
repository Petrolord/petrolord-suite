import { volumeValue, fmtVolume, volumeUnitLabel, fmtDepth, M3_PER_ACRE_FT, M3_PER_BBL } from '../services/units';

test('volumes convert to field units by column kind', () => {
  expect(volumeValue(M3_PER_ACRE_FT * 1000, 'bulk_m3', 'field')).toBeCloseTo(1000, 9);
  expect(volumeValue(M3_PER_BBL * 2e6, 'pore_m3', 'field')).toBeCloseTo(2, 9);
  expect(volumeValue(M3_PER_BBL * 2e6, 'hcpv_m3', 'field')).toBeCloseTo(2, 9);
  expect(volumeValue(3.5e6, 'net_m3', 'metric')).toBeCloseTo(3.5, 9);
  expect(volumeValue(NaN, 'net_m3')).toBeNull();
});

test('formatting and headers name the unit', () => {
  expect(fmtVolume(1e6, 'bulk_m3', 'metric')).toBe('1.000');
  expect(fmtVolume(M3_PER_ACRE_FT * 12.34, 'bulk_m3', 'field')).toBe('12.3');
  expect(fmtVolume(M3_PER_BBL * 1.5e6, 'pore_m3', 'field')).toBe('1.500');
  expect(volumeUnitLabel('bulk_m3', 'field')).toBe('acre-ft');
  expect(volumeUnitLabel('hcpv_m3', 'field')).toBe('MMbbl');
  expect(volumeUnitLabel('hcpv_m3', 'metric')).toBe('10^6 m3');
  expect(fmtDepth(304.8, 'ft', 1)).toBe('1000.0');
  expect(fmtDepth(null)).toBe('—');
});
