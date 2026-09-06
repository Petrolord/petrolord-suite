// Stratigraphy Studio ST0: the centre views render from the engine and
// write through the backend contract. The display option relabels without
// touching stored codes, and the fallback badge appears exactly where
// Exxon has no term (the ST0 acceptance criterion).

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Glossary from '../components/Glossary';
import TopsTyping from '../components/TopsTyping';
import ColumnEditor from '../components/ColumnEditor';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

describe('Glossary', () => {
  test('Catuneanu shows no fallback badges; Exxon badges RSME, FSST and RST only', () => {
    const { unmount } = render(<Glossary scheme="catuneanu" />);
    expect(screen.queryAllByTestId(/^strat-fallback-/)).toHaveLength(0);
    expect(screen.getByTestId('strat-glossary-MFS').textContent).toContain('Maximum flooding surface');
    unmount();
    render(<Glossary scheme="exxon" />);
    const badges = screen.getAllByTestId(/^strat-fallback-/).map((el) => el.getAttribute('data-testid'));
    expect(badges.sort()).toEqual(['strat-fallback-FSST', 'strat-fallback-RSME', 'strat-fallback-RST']);
    expect(screen.getByTestId('strat-glossary-SU').textContent).toContain('Sequence boundary (SB)');
    expect(screen.getByTestId('strat-glossary-SU').textContent).toContain('Subaerial unconformity');
  });

  test('compact legend lists every surface type', () => {
    render(<Glossary scheme="exxon" compact />);
    expect(screen.getAllByTestId(/^strat-legend-/)).toHaveLength(10);
    expect(screen.getByTestId('strat-legend-MRS').textContent).toContain('TS');
  });
});

describe('TopsTyping', () => {
  const setup = async (scheme = 'catuneanu', wellId = 'corr-w1') => {
    const backend = makeInMemoryBackend();
    const wells = await backend.listWells();
    const well = wells.find((w) => w.id === wellId);
    const tops = await backend.listTops(wellId);
    const units = await backend.listUnits();
    const onSaveTop = jest.fn((id, patch) => backend.updateTop(id, patch));
    const onStatus = jest.fn();
    render(<TopsTyping well={well} tops={tops} units={units} scheme={scheme} onSaveTop={onSaveTop} onStatus={onStatus} />);
    return { backend, onSaveTop, onStatus };
  };

  test('lists the tops with their stored type and the tract a typed pair bounds', async () => {
    await setup();
    expect(screen.getByTestId('strat-top-row-Mid Shale').getAttribute('data-surface-type')).toBe('MFS');
    expect(screen.getByTestId('strat-top-type-Base Sand').value).toBe('SU');
    // Base Sand (SU) below Mid Shale (MFS) spans two tracts, so no single tract is named
    expect(screen.getByTestId('strat-top-tract-Mid Shale').textContent).toBe('');
    // type Top Dome (above Mid Shale) as the basal surface of forced regression: BSFR over MFS bounds the highstand
    fireEvent.change(screen.getByTestId('strat-top-type-Top Dome'), { target: { value: 'BSFR' } });
    expect(screen.getByTestId('strat-top-tract-Top Dome').textContent).toBe('HST');
  });

  test('typing a top writes through the backend, the stored code is Catuneanu under the Exxon display', async () => {
    const { backend, onSaveTop, onStatus } = await setup('exxon');
    expect(screen.getByTestId('strat-top-type-Top Dome').value).toBe('formation_top');
    fireEvent.change(screen.getByTestId('strat-top-type-Top Dome'), { target: { value: 'MRS' } });
    fireEvent.change(screen.getByTestId('strat-top-unit-Top Dome'), { target: { value: 'unit-agbada-upper' } });
    fireEvent.change(screen.getByTestId('strat-top-confidence-Top Dome'), { target: { value: 'high' } });
    fireEvent.change(screen.getByTestId('strat-top-age-Top Dome'), { target: { value: '5.333' } });
    expect(screen.getByTestId('strat-tops-save').textContent).toContain('Save (1)');
    fireEvent.click(screen.getByTestId('strat-tops-save'));
    await waitFor(() => expect(onStatus).toHaveBeenCalledWith('1 top typed on KETA-1.'));
    expect(onSaveTop).toHaveBeenCalledWith(expect.any(String), { surface_type: 'MRS', unit_id: 'unit-agbada-upper', confidence: 'high', age_ma: 5.333, hiatus_to_ma: null });
    const tops = await backend.listTops('corr-w1');
    expect(tops.find((t) => t.name === 'Top Dome')).toMatchObject({ surface_type: 'MRS', unit_id: 'unit-agbada-upper' });
    // the Exxon option labels MRS as the transgressive surface but never stores it
    const opt = Array.from(screen.getByTestId('strat-top-type-Top Dome').options).find((o) => o.value === 'MRS');
    expect(opt.textContent).toContain('Transgressive surface (TS)');
    expect(Array.from(screen.getByTestId('strat-top-type-Top Dome').options).map((o) => o.value)).not.toContain('TS');
  });

  test('a shared well is read-only', async () => {
    await setup('catuneanu', 'corr-w3');
    expect(screen.getByTestId('strat-top-type-Top Dome').disabled).toBe(true);
    expect(screen.getByTestId('strat-tops-save').disabled).toBe(true);
    expect(screen.getByTestId('strat-tops-typing').textContent).toContain('read-only');
  });

  test('a non-numeric age is refused with the row named', async () => {
    const { onStatus } = await setup();
    fireEvent.change(screen.getByTestId('strat-top-age-Top Dome'), { target: { value: 'old' } });
    fireEvent.click(screen.getByTestId('strat-tops-save'));
    await waitFor(() => expect(onStatus).toHaveBeenCalledWith('"Top Dome": the age "old" is not a number.'));
  });
});

describe('ColumnEditor', () => {
  test('renders the column in drawing order and refuses an invalid save with the engine message', async () => {
    const backend = makeInMemoryBackend();
    const units = await backend.listUnits();
    const onSave = jest.fn();
    const onStatus = jest.fn();
    render(<ColumnEditor units={units} onSave={onSave} onStatus={onStatus} />);
    expect(screen.getByTestId('strat-unit-name-0').value).toBe('Agbada');
    expect(screen.getByTestId('strat-unit-name-1').value).toBe('Upper Agbada');
    expect(screen.getByTestId('strat-unit-name-3').value).toBe('Akata');
    // base younger than top on Akata
    fireEvent.change(screen.getByTestId('strat-unit-agebase-3'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('strat-column-save'));
    await waitFor(() => expect(screen.getByTestId('strat-column-problems').textContent).toContain('Akata: the base age (10 Ma) is younger than the top age (33.9 Ma).'));
    expect(onSave).not.toHaveBeenCalled();
  });

  test('adding a member under a formation saves create, update and remove sets; a stage fills both ages', async () => {
    const backend = makeInMemoryBackend();
    const units = await backend.listUnits();
    const onSave = jest.fn(async () => {});
    render(<ColumnEditor units={units} onSave={onSave} onStatus={() => {}} />);
    fireEvent.click(screen.getByTestId('strat-unit-add'));
    // the new row is a top-level formation until told otherwise; it sorts last among roots
    const rows = screen.getAllByTestId(/^strat-unit-row-/);
    const newIndex = rows.length - 1;
    fireEvent.change(screen.getByTestId(`strat-unit-name-${newIndex}`), { target: { value: 'D1 Sand' } });
    fireEvent.change(screen.getByTestId(`strat-unit-rank-${newIndex}`), { target: { value: 'member' } });
    fireEvent.change(screen.getByTestId(`strat-unit-parent-${newIndex}`), { target: { value: 'unit-agbada-upper' } });
    // it now nests under Upper Agbada (row 2)
    expect(screen.getByTestId('strat-unit-name-2').value).toBe('D1 Sand');
    fireEvent.change(screen.getByTestId('strat-unit-stage-2'), { target: { value: 'Zanclean' } });
    expect(screen.getByTestId('strat-unit-agetop-2').value).toBe('3.6');
    expect(screen.getByTestId('strat-unit-agebase-2').value).toBe('5.333');
    fireEvent.change(screen.getByTestId('strat-unit-name-0'), { target: { value: 'Agbada Group' } });
    fireEvent.click(screen.getByTestId('strat-unit-del-4'));   // Akata (last root)
    fireEvent.click(screen.getByTestId('strat-column-save'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const ops = onSave.mock.calls[0][0];
    expect(ops.create.map((u) => u.name)).toEqual(['D1 Sand']);
    expect(ops.create[0]).toMatchObject({ rank: 'member', parent_id: 'unit-agbada-upper', age_top_ma: 3.6, age_base_ma: 5.333 });
    expect(ops.update).toEqual([{ id: 'unit-agbada', patch: { name: 'Agbada Group' } }]);
    expect(ops.remove.map((u) => u.id)).toEqual(['unit-akata']);
  });
});
