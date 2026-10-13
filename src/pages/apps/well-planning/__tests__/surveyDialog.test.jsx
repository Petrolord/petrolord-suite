// New survey run importer: an .xlsx is parsed as a workbook (sheet picker,
// preview rows, mappable columns), a delimited file honours an explicit
// delimiter choice, and an unsupported type is refused by name instead of
// being read as text (the tester saw "PK" and "[Content_Types].xml" in the
// MD dropdown).

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as XLSX from 'xlsx';

jest.mock('@/components/ui/select', () => {
  const R = require('react');
  const Ctx = R.createContext(null);
  return {
    Select: ({ value, onValueChange, children }) => (
      <Ctx.Provider value={{ value, onValueChange }}>{children}</Ctx.Provider>
    ),
    SelectTrigger: ({ children, ...rest }) => <span data-testid={rest['data-testid']}>{children}</span>,
    SelectValue: () => null,
    SelectContent: ({ children }) => {
      const c = R.useContext(Ctx);
      return (
        <select value={c.value ?? ''} onChange={(e) => c.onValueChange(e.target.value)}>
          <option value="" />
          {children}
        </select>
      );
    },
    SelectItem: ({ value, children }) => <option value={value}>{children}</option>,
  };
});
const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@/lib/wellsRegistry', () => ({ listWells: jest.fn(async () => []) }));

import SurveyDialog from '../components/SurveyDialog';

const wellbore = { id: 'wb', name: 'HAR-1', depth_unit: 'ft', azimuth_reference: 'grid', head_x: 0, head_y: 0 };

const fakeFile = (name, { text = '', bytes = null } = {}) => ({
  name,
  text: async () => text,
  arrayBuffer: async () => (bytes ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : new ArrayBuffer(0)),
});

const openWithSource = () => {
  render(<SurveyDialog open onOpenChange={() => {}} wellbore={wellbore} survey={null} onSave={jest.fn()} />);
  // combobox order: source, azimuths, MD unit
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'csv' } });
  return document.querySelector('[data-testid="survey-file"]');
};

beforeEach(() => mockToast.mockClear());

test('an .xlsx is parsed as a workbook: sheet picker, preview of the parsed rows, mappable columns', async () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['MD', 'Inc', 'Azi'], [0, 0, 0], [1000, 2.5, 90], [2000, 5, 91]]), 'Run1');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['note'], ['x']]), 'Notes');
  const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  const input = openWithSource();
  fireEvent.change(input, { target: { files: [fakeFile('run1.xlsx', { bytes })] } });
  await waitFor(() => expect(screen.getByTestId('survey-preview')).toBeInTheDocument());
  expect(screen.getByTestId('survey-sheet')).toBeInTheDocument();
  expect(screen.queryByTestId('survey-delimiter')).toBeNull();
  const preview = screen.getByTestId('survey-preview').textContent;
  expect(preview).toContain('1000');
  expect(preview).toContain('2.5');
  expect(preview).not.toContain('PK');
  expect(preview).not.toContain('Content_Types');
  // the header cells are the mapping options, not zip bytes
  const options = Array.from(document.querySelectorAll('option')).map((o) => o.textContent);
  expect(options).toEqual(expect.arrayContaining(['MD', 'Inc', 'Azi']));
  expect(options.some((o) => /Content_Types|PK/.test(o))).toBe(false);
  expect(mockToast).not.toHaveBeenCalled();
});

test('a delimited file honours the chosen delimiter and the preview shows the split', async () => {
  const input = openWithSource();
  fireEvent.change(input, { target: { files: [fakeFile('run.txt', { text: 'MD;Inc;Azi\n0;0;0\n500;1;45' })] } });
  await waitFor(() => expect(screen.getByTestId('survey-preview')).toBeInTheDocument());
  expect(screen.getByTestId('survey-delimiter')).toBeInTheDocument();
  expect(screen.getByText(/2 data rows, 3 columns, header detected/)).toBeInTheDocument();
  // force comma: the whole line becomes one column, visible in the preview counts
  const selects = screen.getAllByRole('combobox');
  const delimiterSelect = selects.find((s) => Array.from(s.options).some((o) => o.textContent === 'Semicolon'));
  fireEvent.change(delimiterSelect, { target: { value: ',' } });
  await waitFor(() => expect(screen.getByText(/1 column/)).toBeInTheDocument());
  fireEvent.change(delimiterSelect, { target: { value: ';' } });
  await waitFor(() => expect(screen.getByText(/3 columns/)).toBeInTheDocument());
});

test('an unsupported file type is refused by name, nothing is parsed', async () => {
  const input = openWithSource();
  fireEvent.change(input, { target: { files: [fakeFile('scan.pdf', { text: '%PDF-1.4 garbage' })] } });
  await waitFor(() => expect(mockToast).toHaveBeenCalled());
  expect(mockToast.mock.calls[0][0].description).toMatch(/\.pdf files are not supported/);
  expect(screen.queryByTestId('survey-preview')).toBeNull();
});

// 2026-10-13: the MD unit is read from the mapped MD column header, so the
// kit's "MD (m)" workbook on a feet wellbore is not read as 2,250 ft.
import { mdUnitFromHeader } from '../services/surveyUtils';

describe('MD unit from the column header', () => {
  test('metre and feet tags, bracketed or as a token', () => {
    for (const h of ['MD (m)', 'md_m', 'MD [m]', 'm MD', 'Measured depth (metres)', 'MD_METERS']) expect(mdUnitFromHeader(h)).toBe('m');
    for (const h of ['MD [ft]', 'MD_FT', 'Depth (feet)', 'MD (usft)', 'ft MD', 'md-ft']) expect(mdUnitFromHeader(h)).toBe('ft');
  });
  test('no unit stated', () => {
    for (const h of ['MD', 'Comment', 'Inc (deg)', 'Measured Depth', '', null]) expect(mdUnitFromHeader(h)).toBeNull();
  });
});

const unitSelect = () => screen.getAllByRole('combobox')[2];

test('a file whose MD header says metres switches a feet wellbore to Metres, with the note', async () => {
  const input = openWithSource();
  expect(unitSelect().value).toBe('ft');
  fireEvent.change(input, { target: { files: [fakeFile('ekene10.csv', { text: 'MD (m),Inc (deg),Azi (deg)\n0,0,0\n2250,18.087,173.66' })] } });
  await waitFor(() => expect(screen.getByTestId('survey-unit-note')).toHaveTextContent('Read from the column header: m'));
  expect(unitSelect().value).toBe('m');
  expect(screen.getByText(/MD 0\.0 to 2250\.0 m/)).toBeInTheDocument();
});

test('a unit chosen by hand wins over the header', async () => {
  const input = openWithSource();
  fireEvent.change(input, { target: { files: [fakeFile('run.csv', { text: 'md_m,inc,azi\n0,0,0\n1000,10,90' })] } });
  await waitFor(() => expect(unitSelect().value).toBe('m'));
  fireEvent.change(unitSelect(), { target: { value: 'ft' } });
  await waitFor(() => expect(screen.getByTestId('survey-unit-note')).toHaveTextContent('Set by hand.'));
  expect(unitSelect().value).toBe('ft');
});

test('negative control: a header with no unit keeps the wellbore unit and asks to check it', async () => {
  const input = openWithSource();
  fireEvent.change(input, { target: { files: [fakeFile('run.csv', { text: 'MD,Inc,Azi\n0,0,0\n1000,10,90' })] } });
  await waitFor(() => expect(screen.getByTestId('survey-unit-note')).toHaveTextContent('No unit in the MD column header "MD": check this is right.'));
  expect(unitSelect().value).toBe('ft');
});
