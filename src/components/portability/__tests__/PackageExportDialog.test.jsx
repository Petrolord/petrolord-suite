// PP1 UI door: the export dialog lists registry items, preselects, builds the
// package with the chosen roots and shows the manifest notes.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const W1 = '11111111-1111-4111-8111-111111111111';
const W2 = '22222222-2222-4222-8222-222222222222';
const S1 = '55555555-5555-4555-8555-555555555555';

jest.mock('@/lib/wellsRegistry', () => ({
  listWells: jest.fn(async () => [
    { id: '11111111-1111-4111-8111-111111111111', name: 'KETA TYPE-1', uwi: 'K-1', is_own: true, organization_id: null },
    { id: '22222222-2222-4222-8222-222222222222', name: 'AKOMA-2', uwi: 'A-2', is_own: false, organization_id: 'org' },
  ]),
}));
jest.mock('@/lib/surfacesRegistry', () => ({
  listSurfaces: jest.fn(async () => [{ id: '55555555-5555-4555-8555-555555555555', name: 'Top Sand A depth' }]),
}));
jest.mock('@/lib/cultureRegistry', () => ({ listCulture: jest.fn(async () => []) }));
jest.mock('@/lib/portability/supabaseSource', () => ({ makeSupabaseSource: () => ({ tag: 'source' }) }));

const F1 = '77777777-7777-4777-8777-777777777777';
const P1 = '88888888-8888-4888-8888-888888888888';
jest.mock('@/lib/portability/rootsCatalog', () => ({
  listRootCandidates: jest.fn(async (kind) => {
    if (kind === 'po_field') return [{ id: '77777777-7777-4777-8777-777777777777', name: 'Keta Field', organization_id: null }];
    if (kind === 'saved_project') return [{ id: '88888888-8888-4888-8888-888888888888', name: 'Choke KETA-1', table: 'saved_choke_projects', subtitle: 'choke' }];
    if (kind === 'wp_site') return [{ id: '99999999-9999-4999-8999-999999999999', name: 'Keta pad', subtitle: 'private' }];
    if (kind === 'seismic_project') return [{ id: '66666666-6666-4666-8666-666666666666', name: 'Keta 3D' }];
    if (kind === 'seismic_volume') return [{ id: '55555555-5555-4555-8555-555555555555', name: 'KETA PSTM', subtitle: 'seismic, private' }];
    return [];
  }),
}));

const mockAddManifest = jest.fn();
const mockBuild = jest.fn(async () => ({
  writer: { addManifest: (...a) => mockAddManifest(...a) },
  manifest: { tables: { geo_wells: { rows: 1 }, geo_wells_logs: { rows: 6 } }, blobs: [{}, {}], notes: ['left out: Field interp'] },
}));
const mockSign = jest.fn(async () => ({
  signature: { alg: 'ECDSA-P256-SHA256', key_id: 'pld-test', value: 'AAAA' },
  certificate: { certificate_no: 'PLD-EX-2026-12345678', verification_code: 'code-1', download_url: 'https://x/cert.pdf' },
}));
jest.mock('@/lib/portability/signClient', () => ({
  requestSignature: (...a) => mockSign(...a),
  signingNote: (r) => (r?.signature ? `Signed by Petrolord (key ${r.signature.key_id}). Certificate of Export ${r.certificate?.certificate_no || ''} issued.` : `This package is not signed (${r?.reason === 'unconfigured' ? 'signing is not set up on this platform yet' : r?.reason}).`),
}));
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: { email: 'me@example.com' } } }) } },
}));
jest.mock('@/lib/portability/exportPackage', () => ({
  buildGeosciencePackage: (...a) => mockBuild(...a),
  PackageIntegrityError: class PackageIntegrityError extends Error {},
}));
const mockSave = jest.fn(async () => ({ method: 'download' }));
jest.mock('@/lib/portability/zipWriter', () => ({
  savePackage: (...a) => mockSave(...a),
  packageFilename: (n) => `${n}.pld`,
}));

import PackageExportDialog from '@/components/portability/PackageExportDialog';

beforeEach(() => { jest.clearAllMocks(); });

test('preselects the well, exports with the chosen roots and shows the notes', async () => {
  const onStatus = jest.fn();
  render(<PackageExportDialog open onOpenChange={() => {}} preselect={{ wells: [W1] }} onStatus={onStatus} />);

  const w1 = await screen.findByTestId(`pld-well-${W1}`);
  expect(w1).toBeChecked();
  expect(screen.getByTestId(`pld-well-${W2}`)).not.toBeChecked();
  expect(screen.getByTestId('pld-name')).toHaveValue('KETA TYPE-1');

  fireEvent.click(screen.getByTestId(`pld-surface-${S1}`));
  fireEvent.click(screen.getByTestId('pld-export-run'));

  await waitFor(() => expect(screen.getByTestId('pld-summary')).toBeInTheDocument());
  expect(mockBuild).toHaveBeenCalledTimes(1);
  const [source, roots, opts] = mockBuild.mock.calls[0];
  expect(source).toEqual({ tag: 'source' });
  expect(roots).toEqual(expect.arrayContaining([
    { kind: 'well', id: W1, name: 'KETA TYPE-1' },
    { kind: 'surface', id: S1, name: 'Top Sand A depth' },
  ]));
  expect(roots).toHaveLength(2);
  expect(opts).toMatchObject({ name: 'KETA TYPE-1', includeInterpretations: true, includeSidecars: true });
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ addManifest: expect.any(Function) }), 'KETA TYPE-1.pld', expect.any(Function));
  expect(screen.getByTestId('pld-summary')).toHaveTextContent('left out: Field interp');
  expect(screen.getByTestId('pld-summary')).toHaveTextContent('7 rows across 2 tables, 2 binary files');
  expect(onStatus).toHaveBeenCalledWith('Exported package "KETA TYPE-1".');
  expect(document.body.textContent.includes('—')).toBe(false);
});

test('export is disabled with nothing selected and shows errors from the builder', async () => {
  render(<PackageExportDialog open onOpenChange={() => {}} preselect={{ wells: [] }} />);
  await screen.findByTestId(`pld-well-${W1}`);
  expect(screen.getByTestId('pld-export-run')).toBeDisabled();

  fireEvent.click(screen.getByTestId(`pld-well-${W1}`));
  mockBuild.mockRejectedValueOnce(new Error('The package would carry 1 reference to data it does not contain.'));
  fireEvent.click(screen.getByTestId('pld-export-run'));
  await waitFor(() => expect(screen.getByTestId('pld-error')).toHaveTextContent(/1 reference to data it does not contain/));
  expect(mockSave).not.toHaveBeenCalled();
});

test('a cancelled save is reported without a summary', async () => {
  mockSave.mockResolvedValueOnce({ method: 'cancelled' });
  render(<PackageExportDialog open onOpenChange={() => {}} preselect={{ wells: [W1] }} />);
  await screen.findByTestId(`pld-well-${W1}`);
  fireEvent.click(screen.getByTestId('pld-export-run'));
  await waitFor(() => expect(screen.getByTestId('pld-progress')).toHaveTextContent('Save cancelled.'));
  expect(screen.queryByTestId('pld-summary')).toBeNull();
});

test('PP3a sections: a production field and a saved project become roots, the saved one naming its table', async () => {
  render(<PackageExportDialog open onOpenChange={() => {}} preselect={{ wells: [] }} />);
  await screen.findByTestId(`pld-well-${W1}`);
  expect(screen.getByTestId('pld-section-fields')).toBeInTheDocument();
  expect(screen.getByTestId('pld-section-saved')).toHaveTextContent('Saved projects');
  expect(screen.getByTestId('pld-export-run')).toBeDisabled();

  fireEvent.click(screen.getByTestId(`pld-field-${F1}`));
  fireEvent.click(screen.getByTestId(`pld-saved-saved_choke_projects-${P1}`));
  expect(screen.getByTestId('pld-export-run')).toBeEnabled();
  fireEvent.click(screen.getByTestId('pld-export-run'));

  await waitFor(() => expect(screen.getByTestId('pld-summary')).toBeInTheDocument());
  const [, roots, opts] = mockBuild.mock.calls[0];
  expect(roots).toEqual(expect.arrayContaining([
    { kind: 'po_field', id: F1, name: 'Keta Field' },
    { kind: 'saved_project', id: P1, name: 'Choke KETA-1', table: 'saved_choke_projects' },
  ]));
  expect(roots).toHaveLength(2);
  // no wells selected: the name falls back to the first selected item across sections
  expect(opts.name).toBe('Keta Field');
  expect(document.body.textContent.includes('—')).toBe(false);
});

test('PP3b section: a well planning site becomes a wp_site root', async () => {
  const S1 = '99999999-9999-4999-8999-999999999999';
  render(<PackageExportDialog open onOpenChange={() => {}} preselect={{ wells: [] }} />);
  await screen.findByTestId(`pld-well-${W1}`);
  expect(screen.getByTestId('pld-section-wp_site')).toHaveTextContent('Well planning sites');
  fireEvent.click(screen.getByTestId(`pld-wpsite-${S1}`));
  expect(screen.getByTestId('pld-export-run')).toBeEnabled();
  fireEvent.click(screen.getByTestId('pld-export-run'));
  await waitFor(() => expect(screen.getByTestId('pld-summary')).toBeInTheDocument());
  const [, roots, opts] = mockBuild.mock.calls[0];
  expect(roots).toEqual([{ kind: 'wp_site', id: S1, name: 'Keta pad' }]);
  expect(opts.name).toBe('Keta pad');
  expect(document.body.textContent.includes('—')).toBe(false);
});

test('PP3c section: projects and volumes share the Seismic list; a volume becomes a seismic_volume root', async () => {
  const V1 = '55555555-5555-4555-8555-555555555555';
  const PJ = '66666666-6666-4666-8666-666666666666';
  render(<PackageExportDialog open onOpenChange={() => {}} preselect={{ wells: [] }} />);
  await screen.findByTestId(`pld-well-${W1}`);
  expect(screen.getByTestId('pld-section-seismic')).toHaveTextContent('Seismic');
  expect(screen.getByTestId(`pld-seismic-${PJ}`)).toBeInTheDocument();
  expect(screen.getByText('project')).toBeInTheDocument();
  expect(screen.getByText('volume: seismic, private')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId(`pld-seismic-${V1}`));
  expect(screen.getByTestId('pld-export-run')).toBeEnabled();
  fireEvent.click(screen.getByTestId('pld-export-run'));
  await waitFor(() => expect(screen.getByTestId('pld-summary')).toBeInTheDocument());
  const [, roots, opts] = mockBuild.mock.calls[0];
  expect(roots).toEqual([{ kind: 'seismic_volume', id: V1, name: 'KETA PSTM' }]);
  expect(opts.name).toBe('KETA PSTM');
  expect(document.body.textContent.includes('—')).toBe(false);
});

test('preselect.roots preselects a case and names the package after it', async () => {
  render(<PackageExportDialog open onOpenChange={() => {}} preselect={{ roots: [{ kind: 'po_field', id: F1, name: 'Keta Field' }] }} />);
  const box = await screen.findByTestId(`pld-field-${F1}`);
  expect(box).toBeChecked();
  expect(screen.getByTestId('pld-name')).toHaveValue('Keta Field');
  expect(screen.getByTestId('pld-export-run')).toBeEnabled();
});

test('signs the manifest before saving and shows the certificate, its link and the verification code', async () => {
  render(<PackageExportDialog open onOpenChange={() => {}} preselect={{ wells: [W1] }} />);
  await screen.findByTestId(`pld-well-${W1}`);
  fireEvent.click(screen.getByTestId('pld-export-run'));
  const note = await screen.findByTestId('pld-signing-note');
  expect(note).toHaveTextContent('Signed by Petrolord (key pld-test)');
  expect(mockSign).toHaveBeenCalledTimes(1);
  expect(mockSign.mock.calls[0][1]).toEqual({ exporterEmail: 'me@example.com' });
  expect(mockAddManifest).toHaveBeenCalledTimes(1);
  expect(mockAddManifest.mock.calls[0][0].signature).toEqual({ alg: 'ECDSA-P256-SHA256', key_id: 'pld-test', value: 'AAAA' });
  expect(screen.getByTestId('pld-certificate-link')).toHaveAttribute('href', 'https://x/cert.pdf');
  expect(screen.getByTestId('pld-verification-code')).toHaveTextContent('code-1');
  expect(screen.getByTestId('pld-verification-code')).toHaveTextContent('/legal/verify-export');
  expect(screen.getByTestId('pld-summary').textContent).not.toContain('—');
  // signing happens before saving
  expect(mockSign.mock.invocationCallOrder[0]).toBeLessThan(mockSave.mock.invocationCallOrder[0]);
});

test('an unconfigured signing service leaves the package unsigned and says so; the export still saves', async () => {
  mockSign.mockResolvedValueOnce({ signature: null, reason: 'unconfigured' });
  render(<PackageExportDialog open onOpenChange={() => {}} preselect={{ wells: [W1] }} />);
  await screen.findByTestId(`pld-well-${W1}`);
  fireEvent.click(screen.getByTestId('pld-export-run'));
  const note = await screen.findByTestId('pld-signing-note');
  expect(note).toHaveTextContent('signing is not set up on this platform yet');
  expect(mockAddManifest).not.toHaveBeenCalled();
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('pld-certificate-link')).toBeNull();
});
