/**
 * Design system rollout W0C: the portability Package Import and Export
 * dialogs and the SigningSummary follow the theme inside an opted-in scope.
 * The Data export page, Petrophysics and Well Data Manager still render
 * outside one, so the snapshots below were recorded on main (92782cda7)
 * before this batch touched the files: every unmigrated caller sees the
 * same DOM byte for byte. Inside a scope the dialog portals carry the scope
 * attribute and no dark console colour is left.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, fireEvent, act, screen, waitFor } from '@testing-library/react';

jest.mock('@/lib/wellsRegistry', () => ({
  listWells: jest.fn(async () => [
    { id: 'w1', name: 'KETA TYPE-1', uwi: 'K-1', is_own: true, organization_id: null },
    { id: 'w2', name: 'AKOMA-2', uwi: 'A-2', is_own: false, organization_id: 'org' },
  ]),
}));
jest.mock('@/lib/surfacesRegistry', () => ({ listSurfaces: jest.fn(async () => [{ id: 's1', name: 'Top Sand A depth' }]) }));
jest.mock('@/lib/cultureRegistry', () => ({ listCulture: jest.fn(async () => []) }));
jest.mock('@/lib/portability/supabaseSource', () => ({ makeSupabaseSource: () => ({ tag: 'source' }) }));
jest.mock('@/lib/portability/rootsCatalog', () => ({
  listRootCandidates: jest.fn(async (kind) => (kind === 'saved_project' ? [{ id: 'p1', name: 'Choke KETA-1', table: 'saved_choke_projects', subtitle: 'choke' }] : [])),
}));
const mockBuild = jest.fn();
jest.mock('@/lib/portability/exportPackage', () => ({
  buildGeosciencePackage: (...a) => mockBuild(...a),
  PackageIntegrityError: class PackageIntegrityError extends Error {},
}));
jest.mock('@/lib/portability/signClient', () => ({
  requestSignature: jest.fn(async () => ({
    signature: { key_id: 'pld-test' },
    certificate: { certificate_no: 'PLD-EX-1', verification_code: 'code-1', download_url: 'https://x/cert.pdf' },
  })),
  signingNote: (r) => (r?.signature ? 'Signed.' : 'Not signed.'),
}));
jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: { email: 'me@example.com' } } }) } } }));
jest.mock('@/lib/portability/zipWriter', () => ({ savePackage: jest.fn(async () => ({ method: 'download' })), packageFilename: (n) => `${n}.pld` }));
jest.mock('@/lib/portability/supabaseSink', () => ({
  makeSupabaseSink: () => ({
    currentUser: async () => ({ id: 'u', organization_id: null }),
    listJobs: async () => [
      { id: 'j1', package_name: 'Handover', status: 'done', rows_written: 10, rows_planned: 10, created_at: '2026-09-02T00:00:00Z' },
      { id: 'j2', package_name: 'Broken', status: 'failed', rows_written: 2, rows_planned: 10, created_at: '2026-09-03T00:00:00Z' },
      { id: 'j3', package_name: 'Busy', status: 'running', rows_written: 1, rows_planned: 10, created_at: '2026-09-04T00:00:00Z' },
    ],
  }),
}));
const mockPreflight = jest.fn();
const mockExecute = jest.fn();
jest.mock('@/lib/portability/importPackage', () => ({
  preflightPackage: (...a) => mockPreflight(...a),
  executeImport: (...a) => mockExecute(...a),
  importPackage: jest.fn(),
}));

import { ThemedApp } from '@/design/ThemeProvider';
import PackageImportDialog from '@/components/portability/PackageImportDialog';
import PackageExportDialog from '@/components/portability/PackageExportDialog';
import SigningSummary from '@/components/portability/SigningSummary';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

const stable = (html) => html
  .replace(/radix-:r[0-9a-z]+:/g, 'radix-ID')
  .replace(/:r[0-9a-z]+:/g, ':ID:');

const LEGACY_CONSOLE = /\b(bg|text|border|accent|file:bg|file:text)-(slate|cyan|lime|emerald|amber|red|sky)-\d{2,3}\b|\btext-white\b/;

const preflight = (sigStatus) => ({
  pkg: {
    manifest: { name: 'Handover', created_at: '2026-09-02T00:00:00Z', platform: { sha: 'abc' }, source: { organization_name: 'Source Co' }, parts: [{}, {}] },
    integrity: { checked: 12 },
    signature: { status: sigStatus, key_id: null },
  },
  plan: {
    counts: { rows: 10, blobs: 8, tables: { geo_wells: 1, geo_wells_logs: 7 } },
    warnings: ['You already have a well named "KETA TYPE-1".'],
    notes: ['Interpretations are copied as your own.'],
  },
});

const pickFile = () => {
  fireEvent.change(screen.getByTestId('pld-import-file'), { target: { files: [new File([new Uint8Array([1])], 'x.pld')] } });
};

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
// the file is read through FileReader (several ticks), so wait for the review
const pickAndReview = async () => {
  pickFile();
  await waitFor(() => expect(screen.getByTestId('pld-import-run')).not.toBeDisabled());
};

const SCENES = {
  'signing summary, signed with certificate': {
    el: () => <SigningSummary result={{ signature: { key_id: 'k' }, certificate: { certificate_no: 'PLD-1', verification_code: 'v', download_url: 'https://x' } }} />,
  },
  'signing summary, unsigned': { el: () => <SigningSummary result={{ signature: null, reason: 'unconfigured' }} /> },
  'import dialog, pick with history open': {
    el: () => <PackageImportDialog open onOpenChange={() => {}} />,
    act: async () => { fireEvent.click(screen.getByText('Import history')); },
  },
  'import dialog, review of a signed package': {
    el: () => <PackageImportDialog open onOpenChange={() => {}} />,
    act: async () => { mockPreflight.mockResolvedValue(preflight('valid')); await pickAndReview(); },
  },
  'import dialog, review of an altered package': {
    el: () => <PackageImportDialog open onOpenChange={() => {}} />,
    act: async () => { mockPreflight.mockResolvedValue(preflight('invalid')); await pickAndReview(); },
  },
  'import dialog, refused with a code': {
    el: () => <PackageImportDialog open onOpenChange={() => {}} />,
    act: async () => { mockPreflight.mockRejectedValue(Object.assign(new Error('Not a package.'), { code: 'bad_zip' })); pickFile(); await waitFor(() => screen.getByTestId('pld-import-error')); },
  },
  'import dialog, failed run with retry': {
    el: () => <PackageImportDialog open onOpenChange={() => {}} />,
    act: async () => {
      mockPreflight.mockResolvedValue(preflight('unsigned'));
      mockExecute.mockRejectedValue(Object.assign(new Error('Write failed.'), { code: 'write', jobId: 'j9' }));
      await pickAndReview();
      fireEvent.click(screen.getByTestId('pld-import-run'));
      await waitFor(() => expect(screen.queryByTestId('pld-import-retry') || screen.queryByTestId('pld-import-summary')).toBeTruthy());
    },
  },
  'import dialog, done': {
    el: () => <PackageImportDialog open onOpenChange={() => {}} />,
    act: async () => {
      mockPreflight.mockResolvedValue(preflight('unknown-key'));
      mockExecute.mockResolvedValue({ rowsWritten: 10, blobsWritten: 8, skipped: 2, notes: ['n'], warnings: ['w'] });
      await pickAndReview();
      fireEvent.click(screen.getByTestId('pld-import-run'));
      await waitFor(() => expect(screen.queryByTestId('pld-import-retry') || screen.queryByTestId('pld-import-summary')).toBeTruthy());
    },
  },
  'export dialog, lists loaded': {
    el: () => <PackageExportDialog open onOpenChange={() => {}} preselect={{ wells: ['w1'] }} />,
    act: async () => { await waitFor(() => screen.getByTestId('pld-well-w1')); },
  },
  'export dialog, exported with notes and certificate': {
    el: () => <PackageExportDialog open onOpenChange={() => {}} preselect={{ wells: ['w1'] }} />,
    act: async () => {
      mockBuild.mockResolvedValue({ writer: {}, manifest: { tables: { geo_wells: { rows: 1 } }, blobs: [{}], notes: ['left out: Field interp'] } });
      await flush();
      fireEvent.click(screen.getByTestId('pld-export-run'));
      await waitFor(() => screen.getByTestId('pld-summary'));
    },
  },
  'export dialog, failed': {
    el: () => <PackageExportDialog open onOpenChange={() => {}} preselect={{ wells: ['w1'] }} />,
    act: async () => {
      mockBuild.mockRejectedValue(new Error('Integrity check failed.'));
      await flush();
      fireEvent.click(screen.getByTestId('pld-export-run'));
      await waitFor(() => screen.getByTestId('pld-error'));
    },
  },
};

const renderScene = async (scene, wrap = (x) => x) => {
  await act(async () => { render(wrap(scene.el())); });
  await flush();
  if (scene.act) { await scene.act(); await flush(); }
  return document.body;
};

beforeEach(() => { jest.clearAllMocks(); });

describe('outside a scope the portability dialogs render exactly as on main', () => {
  test.each(Object.keys(SCENES))('%s', async (name) => {
    const body = await renderScene(SCENES[name]);
    expect(stable(body.innerHTML)).toMatchSnapshot();
    expect(body.innerHTML).not.toMatch(/-pl-|data-pl-theme/);
  });
});

describe.each(['light', 'dark'])('inside a %s scope they follow the theme', (theme) => {
  const wrap = (x) => <ThemedApp userId="t1" defaultTheme={theme}>{x}</ThemedApp>;
  test.each(Object.keys(SCENES))('%s', async (name) => {
    const body = await renderScene(SCENES[name], wrap);
    const dialog = body.querySelector('[role="dialog"]');
    if (dialog) expect(dialog).toHaveAttribute('data-pl-theme', theme);
    expect(body.innerHTML).toMatch(/-pl-/);
    expect(body.innerHTML).not.toMatch(LEGACY_CONSOLE);
  });
});

test('negative control: the unscoped export dialog carries the classes the scoped test forbids', async () => {
  const body = await renderScene(SCENES['export dialog, lists loaded']);
  expect(body.innerHTML).toMatch(LEGACY_CONSOLE);
});
