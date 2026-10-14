// Crop step UI and the named crop definitions (2026-10-14).
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CropPanel, { EMPTY_FORM, defFromForm, formFromDefinition } from '../components/CropPanel';
import { createCropDefinitions, definitionPayload, velocityPreset, isMissingTable } from '../services/cropDefinitions';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('../services/surfacesService', () => ({ myOrgId: async () => 'org-1' }));

const mockList = jest.fn(async () => ({ rows: [{ id: 'd1', name: 'Block A', is_own: true, definition: { il: { from: 120, to: 220 }, xl: { from: 50, to: 150 }, window: { from: 1500, to: 3000 } } }], saved: true }));
const mockSave = jest.fn(async (r) => ({ id: 'd2', name: r.name, is_own: true }));
jest.mock('../services/cropDefinitions', () => {
  const actual = jest.requireActual('../services/cropDefinitions');
  return { ...actual, cropDefinitions: () => ({ list: mockList, save: mockSave, remove: jest.fn() }) };
});

const scan = { il: { min: 100, max: 499, step: 1, count: 400 }, xl: { min: 1, max: 500, step: 1, count: 500 }, ns: 1501, dtUs: 4000, totalTraces: 200000, inlineSorted: true };
const door = { ns: 1501, dtUs: 4000, sampleBytes: 4, dataStart: 3600 };
const SIZE = 3600 + 200000 * (240 + 1501 * 4);

function Harness(props) {
  const [on, setOn] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [speed, setSpeed] = useState(0.9);
  return <CropPanel scan={scan} door={door} fileSize={SIZE} domain="time" enabled={on} onEnabled={setOn} form={form} onForm={setForm} showUpload speed={speed} onSpeed={setSpeed} {...props} />;
}

describe('CropPanel', () => {
  test('typed ranges give the kept traces, the cropped size and the upload time', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('First inline'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Last inline'), { target: { value: '329' } });
    fireEvent.change(screen.getByLabelText('First crossline'), { target: { value: '101' } });
    fireEvent.change(screen.getByLabelText('Last crossline'), { target: { value: '260' } });
    fireEvent.change(screen.getByLabelText('Window start'), { target: { value: '1500' } });
    fireEvent.change(screen.getByLabelText('Window end'), { target: { value: '3000' } });
    const summary = screen.getByTestId('sl-crop-summary');
    expect(summary.textContent).toMatch(/Keeps 20,800 of 200,000 traces/);
    expect(summary.textContent).toMatch(/1500 to 3000 ms \(376 of 1,501 samples\)/);
    expect(summary.textContent).toMatch(/Size: 36\.3 MB of 1\.25 GB \(2\.9 percent\)/);
    expect(screen.getByTestId('sl-crop-eta').textContent).toBe('40 s');
    expect(summary.textContent).toMatch(/keeps its 0 ms origin/);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
  });

  test('a range outside the survey is explained', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('First inline'), { target: { value: '9000' } });
    fireEvent.change(screen.getByLabelText('Last inline'), { target: { value: '9100' } });
    expect(screen.getByTestId('sl-crop-error').textContent).toMatch(/holds no inline of this volume/);
  });

  test('a saved crop fills the form; the velocity preset keeps the area from 0 ms', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Block A' })).toBeTruthy());
    fireEvent.change(screen.getByTestId('sl-crop-saved'), { target: { value: 'd1' } });
    expect(screen.getByLabelText('First inline').value).toBe('120');
    expect(screen.getByLabelText('Window start').value).toBe('1500');
    fireEvent.click(screen.getByTestId('sl-crop-velocity'));
    expect(screen.getByLabelText('Window start').value).toBe('0');
    expect(screen.getByLabelText('Window end').value).toBe('3000');
    expect(screen.getByLabelText('First crossline').value).toBe('50');
  });

  test('saving names the crop', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('First inline'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Crop name'), { target: { value: 'Pilot' } });
    fireEvent.click(screen.getByTestId('sl-crop-save'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0][0]).toMatchObject({ name: 'Pilot', shared: false, definition: { il: { from: 200, to: null } } });
    await waitFor(() => expect(screen.getByTestId('sl-crop-msg').textContent).toBe('Saved "Pilot".'));
  });

  test('form and definition convert both ways', () => {
    const f = formFromDefinition('A', { il: { from: 1, to: 2 }, polygon: [[1, 1], [2, 1], [2, 2]], window: { from: 10, to: 20 }, decimate: { il: 2, xl: 1 } });
    expect(defFromForm(f)).toMatchObject({ name: 'A', il: { from: 1, to: 2 }, xl: null, polygon: [[1, 1], [2, 1], [2, 2]], window: { from: 10, to: 20 }, decimate: { il: 2, xl: 1 } });
  });
});

describe('crop definitions service', () => {
  function client({ missing = false, dup = false } = {}) {
    const rows = [];
    const q = (result) => {
      const b = { select: () => b, order: () => Promise.resolve(result()), eq: () => b, single: () => Promise.resolve(result()), then: (r) => r(result()) };
      return b;
    };
    const missingErr = { code: 'PGRST205', message: "Could not find the table 'public.seismic_crop_definitions'" };
    return {
      rows,
      auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) },
      from: () => ({
        select: () => q(() => (missing ? { error: missingErr } : { data: rows, error: null })),
        insert: (row) => q(() => {
          if (missing) return { error: missingErr };
          if (dup) return { error: { code: '23505', message: 'duplicate' } };
          const r = { id: `r${rows.length + 1}`, user_id: 'me', ...row }; rows.push(r); return { data: r, error: null };
        }),
        update: () => q(() => ({ data: {}, error: null })),
        delete: () => q(() => ({ error: null })),
      }),
    };
  }
  const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

  test('saves to the table, shared with the organisation when asked', async () => {
    const c = client();
    const svc = createCropDefinitions({ client: c, storage: mem() });
    const row = await svc.save({ name: ' Block A ', definition: { il: { from: '10', to: '20' }, window: { from: 1500, to: '' } }, shared: true });
    expect(row).toMatchObject({ name: 'Block A', organization_id: 'org-1', definition: { il: { from: 10, to: 20 }, window: { from: 1500, to: null }, xl: null } });
    expect((await svc.list()).rows[0].is_own).toBe(true);
  });

  test('a duplicate name is explained', async () => {
    const svc = createCropDefinitions({ client: client({ dup: true }), storage: mem() });
    await expect(svc.save({ name: 'A', definition: {} })).rejects.toThrow(/already have a crop called "A"/);
  });

  test('before the migration, crops stay in this browser', async () => {
    const storage = mem();
    const svc = createCropDefinitions({ client: client({ missing: true }), storage });
    const a = await svc.save({ name: 'Local', definition: { il: { from: 1, to: 2 } } });
    expect(a.local).toBe(true);
    const listed = await svc.list();
    expect(listed.saved).toBe(false);
    expect(listed.rows.map((r) => r.name)).toEqual(['Local']);
    await svc.remove(a.id);
    expect((await svc.list()).rows).toEqual([]);
    expect(isMissingTable({ code: '42P01' })).toBe(true);
  });

  test('the velocity preset and the payload', () => {
    expect(velocityPreset({ il: { from: 1, to: 2 }, window: { from: 1500, to: 3000 } })).toMatchObject({ window: { from: 0, to: 3000 }, startAtZero: true, il: { from: 1, to: 2 } });
    expect(definitionPayload({ polygon: [[1, 2]], decimate: { il: 0 } })).toMatchObject({ polygon: null, decimate: { il: 1, xl: 1 }, domain: 'time' });
  });
});
