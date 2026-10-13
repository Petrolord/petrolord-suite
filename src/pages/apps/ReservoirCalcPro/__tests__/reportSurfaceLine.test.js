// The reports said "Method: Surfaces (top and base surfaces, cut by the
// contacts)" without saying which surfaces. They name them now (found
// scripting the ReservoirCalc Pro lessons, 2026-10-12).
import { reviewerLines, surfaceNamesOf } from '../services/reportInfo';

const state = (m) => ({
  inputMethod: m,
  inputs: { topSurfaceId: 's1', baseSurfaceId: 's2' },
  surfaces: { s1: { name: 'Ekene Sand top (6-well map)', registryName: 'Ekene Sand top (6-well map)' }, s2: { name: 'Ekene Sand base (6-well map)' } },
});

test('a Surfaces run names its top and base, right after the method', () => {
  const lines = reviewerLines({ inputMethod: 'surfaces', surfaceNames: surfaceNamesOf(state('surfaces')), unitSystem: 'field' });
  const i = lines.findIndex((l) => l.startsWith('Method:'));
  expect(lines[i + 1]).toBe('Surfaces: top Ekene Sand top (6-well map), base Ekene Sand base (6-well map)');
});

test('Hybrid names the top with a constant thickness; Simple has no surface line', () => {
  expect(reviewerLines({ inputMethod: 'hybrid', surfaceNames: surfaceNamesOf(state('hybrid')) }).some((l) => l === 'Surfaces: top Ekene Sand top (6-well map) with a constant gross thickness')).toBe(true);
  expect(surfaceNamesOf(state('simple'))).toBeNull();
  expect(reviewerLines({ inputMethod: 'simple', surfaceNames: surfaceNamesOf(state('simple')) }).some((l) => l.startsWith('Surfaces:'))).toBe(false);
});
