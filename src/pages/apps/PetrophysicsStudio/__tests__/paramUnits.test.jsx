/**
 * AppUpgrade PETRO-U2-002 (PETRO-U1-022, PL3): parameters typed in us/ft,
 * degF and ft. State stays in engine units; conversion happens at the door.
 *
 * Gates: exact definitions (1 ft = 0.3048 m, degF = degC 9/5 + 32); an
 * untouched field keeps its stored value bit for bit (the exact round trip);
 * a value typed in field units gives the pipeline exactly what the SI value
 * gives (PHIS, TEMP); the panel and the zone table apply engine units.
 *
 * Negative control (run 2026-09-29): with engineValue converting every
 * field (no committed check) the "untouched" cases drift by a rounding step
 * and fail; with the panel applying the typed number unconverted, dtMa lands
 * as 55.5 us/m and the pipeline case fails.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import typewell from '../../../../../packages/engines/test-data/petrophysics/typewell.json';
import { computeWell, DEFAULT_PARAMS } from '../engine/pipeline';
import {
  toDisplayValue, fromDisplayValue, engineValue, toDisplayDraft, PARAM_UNIT_KIND, labelInSystem,
} from '../services/paramUnits';
import { draftToEngine, patchesFromDrafts } from '../services/zoneParamTable';
import { parameterRows } from '../services/petroReport';
import ParameterPanel from '../components/ParameterPanel';

jest.mock('@/lib/pdfBrand', () => ({ drawBrandHeader: () => 30, loadPetrolordLogo: async () => null }));

test('conversions are the exact definitions', () => {
  expect(toDisplayValue('dtMa', 182, 'field')).toBe(55.4736);
  expect(toDisplayValue('dtFl', 656, 'field')).toBe(199.9488);
  expect(toDisplayValue('bhtC', 90, 'field')).toBe(194);
  expect(toDisplayValue('surfaceTempC', 25, 'field')).toBe(77);
  expect(toDisplayValue('bhtDepthM', 2100, 'field')).toBe(6889.76377953);
  expect(fromDisplayValue('dtMa', 55.5, 'field')).toBe(55.5 / 0.3048);
  expect(fromDisplayValue('bhtC', 212, 'field')).toBe(100);
  expect(fromDisplayValue('bhtDepthM', 1000, 'field')).toBe(304.8);
  // SI and unitless keys pass through
  expect(toDisplayValue('dtMa', 182, 'si')).toBe(182);
  expect(toDisplayValue('rw', 0.05, 'field')).toBe(0.05);
  expect(labelInSystem('Δt matrix (µs/m)', 'dtMa', 'field')).toBe('Δt matrix (µs/ft)');
  expect(labelInSystem('BHT depth (m)', 'bhtDepthM', 'field')).toBe('BHT depth (ft)');
});

test('exact round trip: an untouched field returns its stored value bit for bit', () => {
  const awkward = [182, 182.3456789012345, 189.7, 656, 0.1 + 0.2, 1e-9, 12345.678901234];
  for (const key of Object.keys(PARAM_UNIT_KIND)) {
    for (const v of awkward) {
      const shown = toDisplayValue(key, v, 'field');
      expect(Object.is(engineValue(key, shown, v, 'field'), v)).toBe(true);
    }
  }
  // and a typed value is converted once, and shows as typed on the way back
  const stored = engineValue('dtMa', 55.5, 182, 'field');
  expect(stored).toBe(55.5 / 0.3048);
  expect(toDisplayValue('dtMa', stored, 'field')).toBe(55.5);
});

test('a value typed in field units gives the pipeline what its SI value gives', () => {
  const c = {};
  for (const [k, v] of Object.entries(typewell.curves)) c[k] = Float64Array.from(v, (x) => (x === null ? NaN : x));
  const si = { ...DEFAULT_PARAMS, phiSource: 'sonic', dtMa: 55.5 / 0.3048, tempMode: 'linear', bhtC: 100, surfaceTempC: 25, bhtDepthM: 929.0304 };
  const draft = { ...toDisplayDraft(DEFAULT_PARAMS, 'field'), phiSource: 'sonic', dtMa: 55.5, tempMode: 'linear', bhtC: 212, surfaceTempC: 77, bhtDepthM: 3048 };
  const field = draftToEngine(draft, DEFAULT_PARAMS, 'field');
  expect(field.dtMa).toBe(si.dtMa);
  expect(field.bhtC).toBe(100);
  expect(field.surfaceTempC).toBe(25);
  expect(field.bhtDepthM).toBeCloseTo(si.bhtDepthM, 12);
  const a = computeWell(c, { ...si, bhtDepthM: field.bhtDepthM }).outputs;
  const b = computeWell(c, field).outputs;
  for (const k of ['PHIS', 'PHIT', 'TEMP', 'SW']) {
    for (let i = 0; i < a[k].length; i++) if (Number.isFinite(a[k][i])) expect(b[k][i]).toBe(a[k][i]);
  }
});

test('zone table drafts: untouched cells make no override, a copy of Global makes none either', () => {
  const params = { ...DEFAULT_PARAMS, dtMa: 182.3456789012345 };
  const zoneParams = { z1: { dtMa: 190.1234567 } };
  const shown = (zid) => toDisplayDraft({ ...params, ...(zoneParams[zid] || {}) }, 'field');
  const engine = {
    z1: draftToEngine(shown('z1'), { ...params, ...zoneParams.z1 }, 'field', params),
    z2: draftToEngine(toDisplayDraft(params, 'field'), params, 'field', params),
    z3: draftToEngine(toDisplayDraft(params, 'field'), { ...params, dtMa: 200 }, 'field', params), // copied from Global
  };
  const { patches } = patchesFromDrafts(params, engine);
  expect(patches.z1).toEqual({ dtMa: 190.1234567 });
  expect(patches.z2).toEqual({});
  expect(patches.z3).toEqual({});
});

test('the report prints parameters in the entry system with its units', () => {
  const rows = Object.fromEntries(parameterRows({ ...DEFAULT_PARAMS, tempMode: 'linear' }, 'field'));
  expect(rows['Porosity: delta t matrix (µs/ft)']).toBe('55.4736');
  expect(rows['Temperature: BHT (°F)']).toBe('194');
  expect(rows['Temperature: BHT depth (ft)']).toBe('6889.76377953');
  const siRows = Object.fromEntries(parameterRows({ ...DEFAULT_PARAMS }, 'si'));
  expect(siRows['Porosity: delta t matrix (µs/m)']).toBe('182');
});

describe('Parameter panel in field units', () => {
  test('labels and values in us/ft; typing 55.5 applies 55.5/0.3048 us/m; untouched fields unchanged', () => {
    const onApply = jest.fn();
    const params = { ...DEFAULT_PARAMS, tempMode: 'linear', dtFl: 656.123456789 };
    const { rerender } = render(<ParameterPanel params={params} onApply={onApply} onApplyZone={jest.fn()} unitSystem="field" onUnitSystem={jest.fn()} />);
    expect(screen.getByText('Δt matrix (µs/ft)')).toBeTruthy();
    expect(screen.getByText('BHT (°F)')).toBeTruthy();
    expect(screen.getByTestId('petro-param-dtMa').value).toBe('55.4736');
    expect(screen.getByTestId('petro-params-apply').disabled).toBe(true);
    fireEvent.change(screen.getByTestId('petro-param-dtMa'), { target: { value: '55.5' } });
    fireEvent.click(screen.getByTestId('petro-params-apply'));
    const next = onApply.mock.calls[0][0];
    expect(next.dtMa).toBe(55.5 / 0.3048);
    expect(Object.is(next.dtFl, 656.123456789)).toBe(true);
    expect(next.bhtC).toBe(params.bhtC);
    expect(next.bhtDepthM).toBe(params.bhtDepthM);
    rerender(<ParameterPanel params={params} onApply={onApply} onApplyZone={jest.fn()} unitSystem="si" onUnitSystem={jest.fn()} />);
    expect(screen.getByText('Δt matrix (µs/m)')).toBeTruthy();
    expect(screen.getByTestId('petro-param-dtMa').value).toBe('182');
  });

  test('the unit switch names what it changes', () => {
    const onUnits = jest.fn();
    render(<ParameterPanel params={DEFAULT_PARAMS} onApply={jest.fn()} onApplyZone={jest.fn()} unitSystem="si" onUnitSystem={onUnits} />);
    fireEvent.click(screen.getByTestId('petro-param-units-field'));
    expect(onUnits).toHaveBeenCalledWith('field');
    expect(screen.getByTestId('petro-param-units-field').title).toMatch(/µs\/ft.*°F.*ft.*Stored in SI/);
  });
});
