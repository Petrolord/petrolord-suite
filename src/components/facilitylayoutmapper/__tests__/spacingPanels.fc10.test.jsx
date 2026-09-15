/**
 * FC1-0 render gates for the Layout Mapper: the radiation inputs are all
 * exposed and a blank one is named in the panel; the PDF export carries a
 * safety spacing section from the same inputs.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';

const mockDoc = {
  text: jest.fn(),
  setFontSize: jest.fn(),
  splitTextToSize: jest.fn((t) => [t]),
  autoTable: jest.fn(function autoTable() { mockDoc.lastAutoTable = { finalY: 50 }; }),
  output: jest.fn(() => 'blob'),
  lastAutoTable: null,
};
jest.mock('jspdf', () => jest.fn().mockImplementation(() => mockDoc));
jest.mock('jspdf-autotable', () => ({}));
jest.mock('file-saver', () => ({ saveAs: jest.fn() }));
jest.mock('dxf-writer', () => jest.fn());
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

import SpacingPanel from '../SpacingPanel';
import ExportPanel from '../ExportPanel';
import { DEFAULT_SPACING_INPUTS } from '@/utils/facilities/layoutSpacing';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDoc.lastAutoTable = null;
});

const layer = (id, iconName, dLatM) => ({
  id, type: 'icon', iconName, tag: `${iconName}-001`,
  latlng: { lat: 4.8156 + dLatM / 111320, lng: 7.0498 },
});

describe('SpacingPanel', () => {
  const layers = [layer('t', 'Tank', 0), layer('s', 'Separator', 60), layer('f', 'Flare', 400)];

  it('exposes every radiation input the engine accepts, flare and pool separately', () => {
    render(<SpacingPanel layers={layers} inputs={{ ...DEFAULT_SPACING_INPUTS, poolEnabled: true }} />);
    [
      'Relief rate (kg/s)', 'Flare LHV (kJ/kg)', 'Flare fraction radiated', 'Flare allowable radiation (kW/m2)',
      'Bund pool diameter (m)', 'Pool burn rate (kg/m2/s)', 'Pool LHV (kJ/kg)', 'Pool fraction radiated',
      'Pool allowable radiation (kW/m2)',
    ].forEach((label) => expect(screen.getByLabelText(label)).toBeInTheDocument());
    expect(screen.getByLabelText('Pool burn rate (kg/m2/s)')).toHaveValue(0.055);
    // the pool radius is the centre figure, labelled as such
    expect(screen.getByText(/Checked centre to centre\. From the pool edge this is 56\.1 m\./)).toBeInTheDocument();
    expect(screen.getAllByText(/radius from the tank centre/).length).toBeGreaterThan(0);
  });

  it('reports edits to the page, and names a blank input instead of passing', () => {
    const onChange = jest.fn();
    const { rerender } = render(<SpacingPanel layers={layers} inputs={DEFAULT_SPACING_INPUTS} onChange={onChange} />);
    // negative control: complete inputs, no incomplete warning
    expect(screen.queryByText(/not computed/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Flare LHV (kJ/kg)'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SPACING_INPUTS, flareLhvKjKg: '' });

    rerender(<SpacingPanel layers={layers} inputs={{ ...DEFAULT_SPACING_INPUTS, flareLhvKjKg: '' }} onChange={onChange} />);
    expect(screen.getByText('Flare setback not computed. Missing or invalid: Flare LHV (kJ/kg).')).toBeInTheDocument();
    expect(screen.queryByText(/^All \d+ checks pass\.$/)).not.toBeInTheDocument();
  });
});

describe('ExportPanel PDF', () => {
  const layers = [layer('t', 'Tank', 0), layer('s', 'Separator', 60)];

  it('adds a safety spacing section with the computed pool setback and the violation', () => {
    render(<ExportPanel layers={layers} spacingInputs={{ ...DEFAULT_SPACING_INPUTS, poolEnabled: true }} />);
    fireEvent.click(screen.getByText(/Export as PDF/));
    expect(mockDoc.text).toHaveBeenCalledWith('Safety spacing', 14, expect.any(Number));
    const heads = mockDoc.autoTable.mock.calls.map((c) => c[0].head[0][0]);
    expect(heads).toEqual(['Tag', 'Computed setback', 'Pair']);
    const setbacks = mockDoc.autoTable.mock.calls[1][0].body;
    expect(setbacks[0][1]).toBe('66');
    const violations = mockDoc.autoTable.mock.calls[2][0].body;
    expect(violations[0][0]).toBe('Tank-001 to Separator-001');
  });

  it('negative control: with the pool fire off there is no setback or violation table', () => {
    render(<ExportPanel layers={layers} spacingInputs={DEFAULT_SPACING_INPUTS} />);
    fireEvent.click(screen.getByText(/Export as PDF/));
    expect(mockDoc.text).toHaveBeenCalledWith('Safety spacing', 14, expect.any(Number));
    const heads = mockDoc.autoTable.mock.calls.map((c) => c[0].head[0][0]);
    expect(heads).toEqual(['Tag']);
    expect(mockDoc.text).toHaveBeenCalledWith(['All 1 checks that ran pass.'], 14, expect.any(Number));
  });
});
