// Shared section pieces added in Stratigraphy ST2: the stretch datum in
// the frame arithmetic (mapping shifts invert exactly through
// mdFromDisplayed) and the Wheeler chart rendering the engine's cells
// from the sample section's dated tops.

import React from 'react';
import { render, screen } from '@testing-library/react';
import { mdFromDisplayed, displayedArray, zoneBands } from '../sectionFrame';
import { computeStretch } from '@/lib/stratigraphy/stretch';
import WheelerChart from '../WheelerChart';
import { sampleWells } from '@/pages/apps/WellCorrelation/services/sampleSection';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

test('the frame arithmetic accepts a stretch mapping: displayed depths land on the frame and invert exactly', () => {
  const wells = sampleWells().map((w) => ({ id: w.id, tops: w.tops }));
  const f = computeStretch(wells, { upperName: 'Top Dome', lowerName: 'Base Sand' });
  const w1 = f[0];
  expect(typeof w1.shift).toBe('object');
  // frame = mean picks across the three wells: Top Dome (1500+1540+1470)/3, Base Sand (1660+1705+1612)/3
  expect(w1.shift.frameTop).toBeCloseTo(1503.333, 2);
  expect(w1.shift.frameBase).toBeCloseTo(1659, 6);
  const disp = displayedArray(Float64Array.from([1400, 1500, 1580, 1660, 1750]), (md) => md, w1.shift);
  expect(disp[1]).toBeCloseTo(w1.shift.frameTop, 9);
  expect(disp[3]).toBeCloseTo(w1.shift.frameBase, 9);
  for (const md of [1400, 1500, 1580, 1660, 1750]) expect(mdFromDisplayed(w1.shift.fwd(md), w1.shift, wells[0], 'md').md).toBeCloseTo(md, 9);
  // zone bands follow the mapping
  const bands = zoneBands(wells[0], w1.shift, ['Top Dome', 'Base Sand']);
  expect(bands[0].top).toBeCloseTo(w1.shift.frameTop, 9);
  expect(bands[0].base).toBeCloseTo(w1.shift.frameBase, 9);
});

test('WheelerChart draws the sample section: dated surfaces, hiatus cells, tract labels in the display scheme', () => {
  const wells = sampleWells().map((w, i) => ({ id: w.id, name: w.name, position: i, surfaces: w.tops.map((t) => ({ name: t.name, md_m: t.md_m, age_ma: t.age_ma, hiatus_to_ma: t.hiatus_to_ma, surface_type: t.surface_type })) }));
  render(<WheelerChart wells={wells} scheme="catuneanu" testIdPrefix="wh" />);
  const chart = screen.getByTestId('wh-chart');
  // KETA-1: Top Marker (4) to Mid Shale (5) = HST, Mid Shale to Base Sand (5 to 10) unnamed, hiatus 10 to 14 = 3 cells; KETA-2: 3; KETA-3: Base Sand only dated with a hiatus -> one dated surface -> skipped
  expect(chart.getAttribute('data-cell-count')).toBe('6');
  expect(chart.getAttribute('data-age-max')).toBe('14');
  expect(screen.getByTestId('wh-cell-KETA-1-0').getAttribute('data-tract')).toBe('HST');
  expect(screen.getByTestId('wh-cell-KETA-1-0').textContent).toContain('HST');
  expect(screen.getByTestId('wh-cell-KETA-1-2').getAttribute('data-kind')).toBe('hiatus');
  expect(screen.getByTestId('wh-skipped').textContent).toContain('KETA-3');
});

test('WheelerChart with nothing dated explains what is missing', () => {
  render(<WheelerChart wells={[{ id: 'a', name: 'A', surfaces: [{ name: 'T', md_m: 1, age_ma: null }] }]} testIdPrefix="wh" />);
  expect(screen.getByTestId('wh-empty').textContent).toContain('two dated surfaces');
});
