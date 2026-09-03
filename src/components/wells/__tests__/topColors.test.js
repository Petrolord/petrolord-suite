import { topColor, topKey, TOP_PALETTE_LIGHT, TOP_PALETTE_DARK, hashName } from '../topColors';

test('same name gives the same colour, case and whitespace insensitive', () => {
  expect(topColor('Top Sand A')).toBe(topColor('  top   sand a '));
  expect(topKey(' Top  Sand A ')).toBe('top sand a');
  expect(TOP_PALETTE_LIGHT).toContain(topColor('Top Shale'));
});

test('light and dark palettes are index-aligned', () => {
  const i = hashName('Top Dome') % TOP_PALETTE_LIGHT.length;
  expect(topColor('Top Dome')).toBe(TOP_PALETTE_LIGHT[i]);
  expect(topColor('Top Dome', { theme: 'dark' })).toBe(TOP_PALETTE_DARK[i]);
  expect(TOP_PALETTE_LIGHT).toHaveLength(TOP_PALETTE_DARK.length);
});

test('overrides win', () => {
  expect(topColor('Top Sand A', { overrides: { 'top sand a': { color: '#123456' } } })).toBe('#123456');
  expect(topColor('Top Sand A', { overrides: { 'top sand a': '#654321' } })).toBe('#654321');
});
