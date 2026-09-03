// PP4 door: the backup panel builds, saves and summarises; errors show plainly.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockCurrentUser = jest.fn();
const mockBuildBackup = jest.fn();
const mockSave = jest.fn();

jest.mock('@/lib/portability/supabaseSource', () => ({
  makeSupabaseSource: () => ({ currentUser: (...a) => mockCurrentUser(...a) }),
}));
jest.mock('@/lib/portability/backup', () => ({
  buildBackup: (...a) => mockBuildBackup(...a),
}));
jest.mock('@/lib/portability/packageSet', () => ({
  savePackageSet: (...a) => mockSave(...a),
}));

import BackupPanel from '@/components/portability/BackupPanel';

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser.mockResolvedValue({ id: 'u', organization_id: null });
});

describe('BackupPanel', () => {
  test('backs up my work, saves the parts and summarises them; the org button is disabled without an organization', async () => {
    mockBuildBackup.mockResolvedValue({
      set: { partCount: 2 },
      manifest: { name: 'My Petrolord work', tables: { geo_wells: { rows: 3 } }, blobs: [1, 2], notes: ['left out: X'] },
      roots: [{}, {}, {}],
    });
    mockSave.mockResolvedValue({ method: 'parts', files: ['a.part1of2.pld', 'a.part2of2.pld'] });
    const { container } = render(<BackupPanel />);
    await waitFor(() => expect(screen.getByTestId('pld-backup-org')).toBeDisabled());
    fireEvent.click(screen.getByTestId('pld-backup-mine'));
    const summary = await screen.findByTestId('pld-backup-summary');
    expect(summary).toHaveTextContent('3 items backed up');
    expect(summary).toHaveTextContent('Saved as 2 part files, keep them together');
    expect(summary).toHaveTextContent('a.part1of2.pld, a.part2of2.pld');
    expect(summary).toHaveTextContent('geo_wells 3');
    expect(summary).toHaveTextContent('left out: X');
    expect(mockBuildBackup).toHaveBeenCalledWith(expect.anything(), 'mine', expect.objectContaining({ who: { userId: 'u' } }));
    expect(mockSave).toHaveBeenCalledWith({ partCount: 2 }, expect.objectContaining({ name: 'My Petrolord work' }), 'My Petrolord work', expect.any(Function));
    expect(container.textContent.includes('—')).toBe(false);
  });

  test('nothing to back up shows the message in the error callout', async () => {
    mockBuildBackup.mockRejectedValue(new Error('You have nothing to back up yet.'));
    render(<BackupPanel />);
    fireEvent.click(screen.getByTestId('pld-backup-mine'));
    const err = await screen.findByTestId('pld-backup-error');
    expect(err).toHaveTextContent('You have nothing to back up yet.');
    expect(mockSave).not.toHaveBeenCalled();
    expect(screen.queryByTestId('pld-backup-summary')).toBeNull();
  });

  test('with an organization the org button is enabled and runs the org scope', async () => {
    mockCurrentUser.mockResolvedValue({ id: 'u', organization_id: 'o' });
    mockBuildBackup.mockResolvedValue({ set: { partCount: 1 }, manifest: { name: 'Organization backup', tables: {}, blobs: [], notes: [] }, roots: [{}] });
    mockSave.mockResolvedValue({ method: 'single', files: ['organization-backup-20260902.pld'] });
    render(<BackupPanel />);
    await waitFor(() => expect(screen.getByTestId('pld-backup-org')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('pld-backup-org'));
    const summary = await screen.findByTestId('pld-backup-summary');
    expect(summary).toHaveTextContent('1 item backed up');
    expect(summary).toHaveTextContent('Saved as organization-backup-20260902.pld');
    expect(mockBuildBackup).toHaveBeenCalledWith(expect.anything(), 'org', expect.anything());
  });
});
