/**
 * Data Quality Studio page (Data & AI D1).
 *
 * The engine is gated in packages/engines/__tests__/dataai.quality.test.js and
 * the profile layer in src/utils/dataAi/__tests__/qcProfile.ekene.test.js. This
 * mounts the app, because a validated engine behind a mis-wired panel is still
 * a broken app: the empty states say where data comes from, an uploaded Ekene
 * ledger runs through the profile, and the scorecard and flags on screen are
 * the engine's.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockFrom = jest.fn();
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: (...args) => mockFrom(...args),
    storage: { from: () => ({ download: jest.fn() }) },
  },
}));

jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, organization: { id: 'org-1' } }),
}));

import DataQualityStudio from '@/pages/apps/DataQualityStudio';
import DataQualityStudioHelpGuide, { QC_GUIDE_SECTIONS } from '@/pages/apps/DataQualityStudioHelpGuide';
import { parseDelimitedText } from '@/lib/tabularFile';
import { datasetFromTable, suggestLimit } from '@/utils/dataAi/qcDatasets';
import { defaultProfile, runQcProfile } from '@/utils/dataAi/qcProfile';

const CSV = fs.readFileSync(path.join(__dirname, '../../../utils/dataAi/__tests__/fixtures/ekene-daily-production.csv'), 'utf8');

const chain = () => {
  const q = {
    select: jest.fn(() => q),
    eq: jest.fn(() => q),
    order: jest.fn(() => q),
    range: jest.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    upsert: jest.fn().mockResolvedValue({ error: null }),
    delete: jest.fn(() => q),
    then: (res) => res({ data: [], error: null }),
  };
  return q;
};

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

beforeEach(() => {
  mockFrom.mockReset();
  mockFrom.mockImplementation(() => chain());
});

const mount = () => render(<MemoryRouter><DataQualityStudio /></MemoryRouter>);
const openTab = (name) => fireEvent.mouseDown(screen.getByRole('tab', { name }));

const csvFile = () => {
  const f = new File([CSV], 'ekene-daily-production.csv', { type: 'text/csv' });
  if (!f.text) f.text = () => Promise.resolve(CSV);
  return f;
};

describe('the page', () => {
  it('mounts with the saved-run selector, the exports and a help link', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: /Data Quality Studio/i })).toBeInTheDocument();
    expect(screen.getByText('Saved QC run')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toHaveAttribute('href', '/dashboard/apps/data-ai/data-quality-studio/help');
    expect(screen.getByTestId('export-csv')).toBeDisabled();
    expect(screen.getByTestId('export-pdf')).toBeDisabled();
  });

  it('says where well logs and production come from when there are none, and invents nothing', async () => {
    mount();
    expect(await screen.findByTestId('wells-empty')).toHaveTextContent(/Well Data Manager/);
    fireEvent.click(screen.getByRole('tab', { name: /Production/ }));
    expect(await screen.findByTestId('production-empty')).toHaveTextContent(/Production\s+Surveillance Studio/);
    expect(screen.getByTestId('no-dataset')).toBeInTheDocument();
    expect(screen.getByTestId('profile-empty')).toBeInTheDocument();
  });

  it('runs an uploaded Ekene ledger and shows the engine scorecard and flags', async () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: /Upload/ }));
    fireEvent.change(screen.getByTestId('upload-input'), { target: { files: [csvFile()] } });
    await screen.findByTestId('upload-mapping');
    fireEvent.change(screen.getByTestId('filter-value'), { target: { value: 'Ekene-1' } });
    fireEvent.click(screen.getByTestId('use-upload'));
    expect(await screen.findByTestId('dataset-summary')).toHaveTextContent(/Ekene-1/);

    fireEvent.click(screen.getByTestId('run-qc'));
    openTab('Scorecard and flags');
    const total = await screen.findByTestId('score-total');

    // The same dataset and profile the page built, run directly.
    const table = parseDelimitedText(CSV);
    const ds = datasetFromTable(table, {
      label: 'x', indexColumn: 0, idColumn: 1, filterValue: 'Ekene-1', channelColumns: [2, 3, 4, 5, 6], idMode: 'distinct',
    });
    const p = defaultProfile();
    ds.channels.forEach((c) => { p.limits[c.key] = suggestLimit(c); });
    const key = (n) => ds.channels.find((c) => c.name === n).key;
    p.validity.rate = { enabled: true, rateKeys: ['oil_stb', 'water_stb', 'gas_mscf', 'winj_stb'].map(key), hoursOnKey: key('hours_on') };
    p.consistency.waterCut = { ...p.consistency.waterCut, oilKey: key('oil_stb'), waterKey: key('water_stb') };
    const direct = runQcProfile(ds, p);
    expect(total).toHaveTextContent(direct.scorecard.total.toFixed(4));
    expect(screen.getByTestId('flag-count')).toHaveTextContent(`${direct.flags.length} of ${direct.flags.length} flags`);
    const table2 = screen.getByTestId('flag-table');
    expect(within(table2).getAllByText(direct.flags[0].reason).length).toBeGreaterThan(0);
    expect(screen.getByTestId('export-csv')).not.toBeDisabled();

    // A changed parameter marks the results stale and blocks the export.
    openTab('QC profile');
    fireEvent.change(screen.getByLabelText('|z| above'), { target: { value: '2' } });
    expect(await screen.findByTestId('stale-note')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('export-csv')).toBeDisabled());
  });
});

describe('the help guide', () => {
  it('covers every method, the scorecard, the flags and the NIST sources', () => {
    render(<MemoryRouter><DataQualityStudioHelpGuide /></MemoryRouter>);
    expect(QC_GUIDE_SECTIONS.map((s) => s.id)).toEqual(expect.arrayContaining(['outliers', 'charts', 'scorecard', 'flags', 'validation']));
    const text = document.body.textContent;
    ['6.3.2.2', '6.3.2.3', '6.3.2.4', '1.3.5.17.1', '7.2.6.2', '0.6745', '1.4826', '1.128', '3.267'].forEach((s) => expect(text).toContain(s));
  });

  it('follows the owner copy rule and claims no AI', () => {
    const src = [
      '../DataQualityStudio.jsx', '../DataQualityStudioHelpGuide.jsx',
      '../../../components/dataai/quality/DatasetPanel.jsx', '../../../components/dataai/quality/ProfilePanel.jsx',
      '../../../components/dataai/quality/ResultsPanel.jsx', '../../../components/dataai/quality/ChartsPanel.jsx',
      '../../../components/dataai/quality/shared.jsx', '../../../utils/dataAi/qcProfile.js',
    ].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
    expect(src).not.toMatch(/[–—]/);
    expect(src).not.toMatch(/AI-powered|powered by AI|artificial intelligence/i);
  });
});
