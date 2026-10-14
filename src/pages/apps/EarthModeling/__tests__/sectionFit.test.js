import { sectionScale, VE_OPTIONS } from '../services/sectionPath';
import { sectionColour } from '../components/SectionView';

test('VE fit fills the window height whatever the line length (Ekene: 106 ft over 922 m)', () => {
  expect(VE_OPTIONS[0]).toBe(0);
  const fit = sectionScale({ total: 922, zMin: 1515, zMax: 1590, plotW: 1000, ve: 0, fitH: 560 });
  expect(fit.plotH).toBe(560);
  expect(fit.exaggeration).toBeCloseTo((560 / 75) / (1000 / 922), 9);
  // the numbered options keep their meaning
  const two = sectionScale({ total: 922, zMin: 1515, zMax: 1590, plotW: 1000, ve: 2 });
  expect(two.plotH).toBe(200);
});

test('the property ramp runs blue to red and holds its ends', () => {
  expect(sectionColour(0)).toBe('rgb(49,54,149)');
  expect(sectionColour(1)).toBe('rgb(165,0,38)');
  expect(sectionColour(-3)).toBe(sectionColour(0));
  expect(sectionColour(0.5)).toBe('rgb(254,224,144)');
});
