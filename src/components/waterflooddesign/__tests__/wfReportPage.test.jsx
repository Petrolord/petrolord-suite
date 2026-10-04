// WF-U1 Report tab: the rows on screen are the rows of the PDF (RL12); the
// export hands the same model to the PDF builder; identification typed on the
// tab reaches the header.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));
const mockExported = [];
jest.mock('@/utils/waterflooddesign/reportExport', () => {
  const actual = jest.requireActual('@/utils/waterflooddesign/reportExport');
  return { ...actual, exportWaterfloodPdf: jest.fn(async (args) => { mockExported.push(args); return true; }) };
});

// eslint-disable-next-line import/first
import WaterfloodDesignStudio from '@/pages/apps/WaterfloodDesignStudio';
// eslint-disable-next-line import/first
import { buildWaterfloodPdf } from '@/utils/waterflooddesign/reportExport';
// eslint-disable-next-line import/first
import { readPdf, flat } from '@/lib/reportKit/testKit';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

it('the Report tab shows the PDF rows and exports the same model', async () => {
  render(<MemoryRouter><WaterfloodDesignStudio sharingStore={null} /></MemoryRouter>);
  await screen.findByText('Waterflood Design Studio');
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Report' }));
  const report = await screen.findByTestId('wds-report');
  fireEvent.change(within(report).getByTestId('wds-id-field'), { target: { value: 'Ekene' } });
  fireEvent.change(within(report).getByTestId('wds-id-analyst'), { target: { value: 'A. Engineer' } });
  const headline = screen.getByTestId('wds-report-headline');
  expect(headline).toHaveTextContent(/Endpoint mobility ratio M/);
  expect(screen.getByTestId('wds-report-inputs')).toHaveTextContent(/Starting value of the app/);
  fireEvent.click(screen.getByTestId('wds-export-pdf'));
  await waitFor(() => expect(mockExported).toHaveLength(1));
  const args = mockExported[0];
  // the screen rows are the model rows
  const screenRows = [...headline.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
  expect(screenRows).toEqual(args.model.headline.rows);
  const pdf = readPdf(buildWaterfloodPdf(args).doc);
  const text = flat(pdf.text);
  expect(text).toMatch(/Field Ekene/);
  expect(text).toMatch(/Analyst A\. Engineer/);
}, 120000);
