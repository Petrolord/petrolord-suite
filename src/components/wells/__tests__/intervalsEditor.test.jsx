// Shared interval editor (Stratigraphy ST1): lists a kind, adds rows,
// refuses an overlap with the engine's message, saves through onReplace,
// and the paste door resolves mud-log abbreviations to the vocabulary.

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import IntervalsEditor from '../IntervalsEditor';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const well = { id: 'w1', name: 'KETA-1', is_own: true };
const rows = [
  { id: 'i1', well_id: 'w1', kind: 'lithology', top_md_m: 1400, base_md_m: 1500, code: 'shale', label: null, properties: {}, source: 'cuttings' },
  { id: 'i2', well_id: 'w1', kind: 'lithology', top_md_m: 1500, base_md_m: 1660, code: 'sandstone', label: null, properties: { grain_size: 'f_sand' }, source: 'cuttings' },
  { id: 'i3', well_id: 'w1', kind: 'facies', top_md_m: 1500, base_md_m: 1520, code: 'Channel', label: null, properties: {}, source: 'log' },
];

test('lists the chosen kind with thickness, switches kind', () => {
  render(<IntervalsEditor well={well} intervals={rows} onReplace={jest.fn()} onStatus={jest.fn()} testIdPrefix="t" />);
  expect(screen.getAllByTestId(/^t-row-/)).toHaveLength(2);
  expect(screen.getByTestId('t-code-0').value).toBe('shale');
  expect(screen.getByTestId('t-grain-1').value).toBe('f_sand');
  expect(screen.getByTestId('t-thickness').textContent).toContain('Shale 100.0 m');
  expect(screen.getByTestId('t-thickness').textContent).toContain('Sandstone 160.0 m');
  fireEvent.change(screen.getByTestId('t-kind'), { target: { value: 'facies' } });
  expect(screen.getAllByTestId(/^t-row-/)).toHaveLength(1);
  expect(screen.getByTestId('t-code-0').value).toBe('Channel');
});

test('an overlap is refused with the engine message; a sound edit saves through onReplace', async () => {
  const onReplace = jest.fn(async () => {});
  const onStatus = jest.fn();
  render(<IntervalsEditor well={well} intervals={rows} onReplace={onReplace} onStatus={onStatus} testIdPrefix="t" />);
  fireEvent.click(screen.getByTestId('t-add'));
  // the new row starts at the last base (1660); make it overlap the sandstone
  fireEvent.change(screen.getByTestId('t-top-2'), { target: { value: '1600' } });
  fireEvent.change(screen.getByTestId('t-base-2'), { target: { value: '1700' } });
  fireEvent.change(screen.getByTestId('t-code-2'), { target: { value: 'limestone' } });
  fireEvent.click(screen.getByTestId('t-save'));
  await waitFor(() => expect(screen.getByTestId('t-problems').textContent).toContain('overlaps'));
  expect(onReplace).not.toHaveBeenCalled();
  fireEvent.change(screen.getByTestId('t-top-2'), { target: { value: '1660' } });
  fireEvent.click(screen.getByTestId('t-save'));
  await waitFor(() => expect(onReplace).toHaveBeenCalled());
  const [kind, list] = onReplace.mock.calls[0];
  expect(kind).toBe('lithology');
  expect(list.map((r) => [r.top_md_m, r.base_md_m, r.code])).toEqual([[1400, 1500, 'shale'], [1500, 1660, 'sandstone'], [1660, 1700, 'limestone']]);
  expect(list[1].properties).toEqual({ grain_size: 'f_sand' });
  expect(onStatus).toHaveBeenCalledWith('3 lithology intervals saved on KETA-1.');
});

test('the paste door resolves abbreviations and converts feet', async () => {
  const onReplace = jest.fn(async () => {});
  render(<IntervalsEditor well={well} intervals={[]} onReplace={onReplace} onStatus={jest.fn()} testIdPrefix="t" />);
  fireEvent.click(screen.getByTestId('t-paste-toggle'));
  fireEvent.change(screen.getByTestId('t-paste-mdunit'), { target: { value: 'ft' } });
  const ta = screen.getByTestId('t-paste-paste-text');
  fireEvent.change(ta, { target: { value: 'top,base,code\n1000,1100,SST\n1100,1200,SH\n1200,1300,MARBLE' } });
  await waitFor(() => expect(screen.getByTestId('t-save').disabled).toBe(false));
  fireEvent.click(screen.getByTestId('t-save'));
  await waitFor(() => expect(onReplace).toHaveBeenCalled());
  const list = onReplace.mock.calls[0][1];
  expect(list.map((r) => r.code)).toEqual(['sandstone', 'shale', 'MARBLE']);
  expect(list[0].top_md_m).toBeCloseTo(304.8, 6);
  expect(list[2].properties).toEqual({ lithology_text: 'MARBLE' });
  expect(list.every((r) => r.source === 'import')).toBe(true);
});

test('a shared well is read-only', () => {
  render(<IntervalsEditor well={{ ...well, is_own: false }} intervals={rows} onReplace={jest.fn()} onStatus={jest.fn()} canEdit={false} testIdPrefix="t" />);
  expect(screen.getByTestId('t-code-0').disabled).toBe(true);
  expect(screen.getByTestId('t-save').disabled).toBe(true);
  expect(screen.getByTestId('t-add').disabled).toBe(true);
});
