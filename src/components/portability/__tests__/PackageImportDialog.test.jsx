// PP2 UI door: the import dialog checks a file, reviews the plan, imports it
// and reports; refusals from the core are shown verbatim.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/lib/portability/supabaseSink', () => ({
  makeSupabaseSink: () => ({
    currentUser: async () => ({ id: 'u', organization_id: null }),
    listJobs: async () => [],
  }),
}));

const mockPreflight = jest.fn();
const mockExecute = jest.fn();
const mockImport = jest.fn();
jest.mock('@/lib/portability/importPackage', () => ({
  preflightPackage: (...a) => mockPreflight(...a),
  executeImport: (...a) => mockExecute(...a),
  importPackage: (...a) => mockImport(...a),
}));

import PackageImportDialog from '@/components/portability/PackageImportDialog';

const goodPreflight = {
  pkg: {
    manifest: { name: 'Handover', created_at: '2026-09-02T00:00:00Z', platform: { sha: 'abc' }, source: { organization_name: 'Source Co' } },
    integrity: { checked: 12 },
  },
  plan: {
    counts: { rows: 10, blobs: 8, tables: { geo_wells: 1, geo_wells_logs: 7 } },
    warnings: ['You already have a well named "KETA TYPE-1".'],
    notes: [],
  },
};

const pickFile = () => {
  const input = screen.getByTestId('pld-import-file');
  const file = new File([new Uint8Array([1, 2, 3])], 'x.pld');
  fireEvent.change(input, { target: { files: [file] } });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPreflight.mockResolvedValue(goodPreflight);
  mockExecute.mockResolvedValue({ rowsWritten: 10, blobsWritten: 8, skipped: 0, notes: [], warnings: [] });
});

test('picks a file, reviews the plan, imports and reports', async () => {
  const onImported = jest.fn();
  const { container } = render(<PackageImportDialog open onOpenChange={() => {}} onImported={onImported} />);
  pickFile();
  const review = await screen.findByTestId('pld-import-review');
  expect(review).toHaveTextContent('Handover');
  expect(review).toHaveTextContent('All 12 files verified.');
  expect(review).toHaveTextContent('You already have a well named "KETA TYPE-1".');
  expect(review).toHaveTextContent('Source Co');
  expect(mockPreflight).toHaveBeenCalledTimes(1);
  expect(mockPreflight.mock.calls[0][0]).toBeInstanceOf(Uint8Array);
  expect(mockPreflight.mock.calls[0][2]).toEqual({ shareWithOrg: false });
  expect(screen.getByTestId('pld-import-scope-org')).toBeDisabled();
  expect(screen.getByTestId('pld-import-scope-private')).toBeChecked();

  fireEvent.click(screen.getByTestId('pld-import-run'));
  const summary = await screen.findByTestId('pld-import-summary');
  expect(summary).toHaveTextContent('Imported 10 rows and 8 binary files.');
  expect(mockExecute).toHaveBeenCalledTimes(1);
  expect(mockExecute.mock.calls[0][0]).toBe(goodPreflight.plan);
  expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ rowsWritten: 10 }));
  expect(container.textContent.includes('—')).toBe(false);
});

test('a refusal from the core is shown verbatim with its code, and another file can be picked', async () => {
  const err = new Error('This package was written by a newer version of Petrolord (package version 2; this build reads up to version 1). Reload the page to get the latest build, then open it again.');
  err.code = 'newer-package';
  mockPreflight.mockRejectedValueOnce(err);
  render(<PackageImportDialog open onOpenChange={() => {}} />);
  pickFile();
  const callout = await screen.findByTestId('pld-import-error');
  expect(callout).toHaveTextContent('package version 2; this build reads up to version 1');
  expect(callout).toHaveTextContent('newer-package');
  expect(screen.getByTestId('pld-import-file')).not.toBeDisabled();
  expect(screen.getByTestId('pld-import-run')).toBeDisabled();
  expect(screen.queryByTestId('pld-import-retry')).toBeNull();
});

test('a failed import offers Retry, which resumes by job id', async () => {
  const failure = new Error('Import stopped: simulated. You can resume it from Import history (job 00005000).');
  failure.jobId = '00005000-0000-4000-8000-000000000000';
  mockExecute.mockRejectedValueOnce(failure);
  mockImport.mockResolvedValue({ summary: { rowsWritten: 10, blobsWritten: 8, skipped: 6, notes: [], warnings: [] } });
  render(<PackageImportDialog open onOpenChange={() => {}} />);
  pickFile();
  await screen.findByTestId('pld-import-review');
  fireEvent.click(screen.getByTestId('pld-import-run'));
  const callout = await screen.findByTestId('pld-import-error');
  expect(callout).toHaveTextContent('Import stopped');
  fireEvent.click(screen.getByTestId('pld-import-retry'));
  await waitFor(() => expect(mockImport).toHaveBeenCalledTimes(1));
  expect(mockImport.mock.calls[0][2]).toEqual(expect.objectContaining({ resumeJobId: failure.jobId, shareWithOrg: false }));
  const summary = await screen.findByTestId('pld-import-summary');
  expect(summary).toHaveTextContent('6 already present from an earlier run');
});

test('the history section lists nothing when there are no imports', async () => {
  render(<PackageImportDialog open onOpenChange={() => {}} />);
  fireEvent.click(screen.getByText('Import history'));
  await waitFor(() => expect(screen.getByTestId('pld-import-history')).toHaveTextContent('No imports yet.'));
});
