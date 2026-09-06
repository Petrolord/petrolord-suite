// Stratigraphy Studio ST3: the age-depth plot on the sample well, the
// Basin handoff row, biozone datums and the harness backend contract.

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AgeDepthPlot from '@/components/wells/section/AgeDepthPlot';
import AgesView from '../components/AgesView';
import { buildBasinModelRow } from '@/lib/basinHandoff';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const setup = async (wellId = 'corr-w1') => {
  const backend = makeInMemoryBackend();
  const well = (await backend.listWells()).find((w) => w.id === wellId);
  const tops = await backend.listTops(wellId);
  const intervals = await backend.listIntervals(wellId);
  return { backend, well, tops, intervals };
};

test('AgeDepthPlot: KETA-1 has two segments with the hand-derived rates and one hiatus', async () => {
  const { tops } = await setup();
  render(<AgeDepthPlot surfaces={tops} testIdPrefix="ad" />);
  const plot = screen.getByTestId('ad-plot');
  expect(plot.getAttribute('data-segments')).toBe('2');
  expect(plot.getAttribute('data-hiatuses')).toBe('1');
  // Top Marker 1440 m (4 Ma) to Mid Shale 1580 m (5 Ma): 140 m in 1 Ma; Mid Shale to Base Sand 1660 m (10 Ma): 80 m in 5 Ma
  expect(screen.getByTestId('ad-segment-0').getAttribute('data-rate')).toBe('140.000');
  expect(screen.getByTestId('ad-segment-1').getAttribute('data-rate')).toBe('16.000');
  expect(screen.getByTestId('ad-hiatus-0').textContent).toContain('hiatus 10 to 14 Ma');
  expect(screen.getByTestId('ad-point-Mid Shale').textContent).toContain('Zanclean');   // 5 Ma sits in the Zanclean
});

test('AgeDepthPlot with one dated surface explains what is missing', () => {
  render(<AgeDepthPlot surfaces={[{ name: 'A', md_m: 1, age_ma: 1 }]} testIdPrefix="ad" />);
  expect(screen.getByTestId('ad-empty').textContent).toContain('Two dated surfaces');
});

test('buildBasinModelRow: layers in Basin shape with ages from the surfaces, lithology from the log, the hiatus as an erosion event', async () => {
  const { well, tops, intervals } = await setup();
  const { row, layerCount, datedCount, erosionCount, problems } = buildBasinModelRow({ well, tops, intervals, userId: 'u1' });
  expect(row).toMatchObject({ user_id: 'u1', name: 'KETA-1 stratigraphy', status: 'in-progress', settings: { registryWellId: 'corr-w1', registryWellName: 'KETA-1', surfaceTemp: 15 } });
  expect(layerCount).toBe(4);
  // Top Marker (4) over Top Dome (undated): placeholders; Top Dome over Mid Shale (5): placeholders; Mid Shale (5) over Base Sand (10): dated; Base Sand: hiatus ends deposition at 14, no base -> placeholders
  expect(row.stratigraphy.map((l) => [l.name, l.thickness, l.agesGuessed])).toEqual([['Top Marker', 60, true], ['Top Dome', 80, true], ['Mid Shale', 80, false], ['Base Sand', 90, true]]);
  expect(row.stratigraphy[2]).toMatchObject({ ageStart: 10, ageEnd: 5, lithology: 'sandstone', color: '#f4a261' });
  expect(datedCount).toBe(1);
  expect(erosionCount).toBe(1);
  expect(row.erosion_events[0]).toMatchObject({ age: 10, from_ma: 10, to_ma: 14, surface: 'Base Sand', amountUnknown: true });
  expect(problems.some((p) => /amount unknown/.test(p))).toBe(true);
  expect(row.stratigraphy.every((l) => ['sandstone', 'shale', 'limestone', 'salt', 'coal'].includes(l.lithology))).toBe(true);
});

test('AgesView: rates table, Send to Basin writes through the backend, biozone datums become typed tops', async () => {
  const { backend, well, tops } = await setup();
  await backend.replaceIntervals('corr-w1', 'biozone_interval', [{ top_md_m: 1500, base_md_m: 1560, code: 'NN12', label: 'D. quinqueramus', properties: { scheme: 'NN', age_top_ma: 5.6, age_base_ma: 8.3 } }]);
  const intervals = await backend.listIntervals('corr-w1');
  const onStatus = jest.fn();
  const onTopsChanged = jest.fn(async () => {});
  render(<MemoryRouter><AgesView well={well} tops={tops} intervals={intervals} backend={backend} onStatus={onStatus} onTopsChanged={onTopsChanged} /></MemoryRouter>);
  expect(screen.getAllByTestId(/^strat-rate-/)).toHaveLength(2);
  expect(screen.getByTestId('strat-hiatus-0').textContent).toContain('10 to 14');
  expect(screen.getByTestId('strat-stage-Mid Shale').textContent).toContain('Zanclean');
  fireEvent.click(screen.getByTestId('strat-send-basin'));
  await waitFor(() => expect(onStatus).toHaveBeenCalledWith(expect.stringMatching(/^Basin model "KETA-1 stratigraphy" created: 4 layers, 1 dated, 1 erosion event/)));
  expect(backend._basinModels()).toHaveLength(1);
  expect(backend._basinModels()[0].stratigraphy).toHaveLength(4);
  fireEvent.click(screen.getByTestId('strat-biozone-datums'));
  await waitFor(() => expect(onStatus).toHaveBeenCalledWith('2 biozone datums added as typed tops on KETA-1.'));
  const after = await backend.listTops('corr-w1');
  expect(after.filter((t) => t.surface_type === 'biozone').map((t) => [t.name, t.md_m, t.age_ma, t.notes])).toEqual([
    ['NN12 top', 1500, 5.6, 'NN: D. quinqueramus'], ['NN12 base', 1560, 8.3, 'NN: D. quinqueramus'],
  ]);
  expect(onTopsChanged).toHaveBeenCalled();
});
