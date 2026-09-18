/**
 * AS14 — deleting a controlled document.
 *
 * Delete was offered on every document, Published ones included, and
 * took the revision chain, the review decisions and the activity log with
 * it. The row delete cascades to the revisions, but a stored file has no
 * foreign key, so every file uploaded against a deleted document stayed
 * in the bucket with nothing pointing at it.
 */
import fs from 'fs';
import path from 'path';
import { renderHook, act, waitFor } from '@testing-library/react';
import { makeSchemaFake } from '../../shared/__tests__/fakeSupabaseSchema';
import { useDocumentControl } from '../hooks/useDocumentControl';
import { deleteRefusal } from '../utils/documentPayload';

let mockDb;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (...args) => mockDb.client.from(...args),
    rpc: (...args) => mockDb.client.rpc(...args),
    get storage() { return mockDb.client.storage; },
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ organization: { id: 'org-1' }, user: { id: 'author' } }),
}));

const ORG = 'org-1';
const T1 = '2026-09-01T09:00:00.000Z';
const doc = (id, status) => ({
  id, org_id: ORG, document_number: `HSE-${id}`, title: id, status, current_revision: '01',
  description: null, review_period_months: 24, superseded_by: null, updated_at: T1,
});
const rev = (id, documentId, status, storagePath = null) => ({
  id, document_id: documentId, revision_number: '01', status, is_current: true,
  created_at: T1, storage_path: storagePath, file_type: null,
});

const setup = async () => {
  mockDb = makeSchemaFake({
    documents: [doc('draft', 'Draft'), doc('pub', 'Published'), doc('reviewed', 'Draft')],
    doc_categories: [],
    doc_revisions: [
      rev('r-draft', 'draft', 'Draft', 'org-1/draft/r-draft-procedure.pdf'),
      rev('r-draft-2', 'draft', 'Draft', 'org-1/draft/r-draft-2-annex.pdf'),
      rev('r-pub', 'pub', 'Published', 'org-1/pub/r-pub-policy.pdf'),
      rev('r-reviewed', 'reviewed', 'Rejected'),
    ],
    doc_workflows: [],
    doc_activity_log: [],
    organization_members: [],
  });
  const view = renderHook(() => useDocumentControl());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
};

describe('deleteRefusal', () => {
  it('lets only a never-reviewed draft go', () => {
    expect(deleteRefusal({ status: 'Draft', revisions: [{ status: 'Draft' }] })).toBeNull();
    expect(deleteRefusal({ status: 'Draft' })).toBeNull();
    ['In Review', 'Approved', 'Published', 'Superseded', 'Obsolete', 'Rejected'].forEach((status) => {
      expect(deleteRefusal({ status })).toMatch(/Withdraw it/);
    });
    expect(deleteRefusal({ status: 'Draft', revisions: [{ status: 'Rejected' }] }))
      .toMatch(/been through review/);
  });
});

describe('useDocumentControl.deleteDocument', () => {
  it('refuses a published document and writes nothing', async () => {
    const { result } = await setup();
    let out;
    await act(async () => { out = await result.current.deleteDocument('pub'); });
    expect(out.success).toBe(false);
    expect(mockDb.tables.documents.map((d) => d.id)).toContain('pub');
    expect(mockDb.removedPaths).toEqual([]);
  });

  it('refuses a draft that has been through review', async () => {
    const { result } = await setup();
    let out;
    await act(async () => { out = await result.current.deleteDocument('reviewed'); });
    expect(out.success).toBe(false);
    expect(mockDb.tables.documents.map((d) => d.id)).toContain('reviewed');
  });

  it('deletes a draft and clears every file stored against it, and only those', async () => {
    const { result } = await setup();
    let out;
    await act(async () => { out = await result.current.deleteDocument('draft'); });
    expect(out.success).toBe(true);
    expect(out.warning).toBeNull();
    expect(mockDb.tables.documents.map((d) => d.id)).not.toContain('draft');
    expect(mockDb.removedPaths.sort()).toEqual([
      'org-1/draft/r-draft-2-annex.pdf', 'org-1/draft/r-draft-procedure.pdf',
    ]);
  });

  it('the page offers Delete only where the hook would allow it', () => {
    const page = fs.readFileSync(path.resolve(__dirname, '../DocumentDetail.jsx'), 'utf8');
    expect(page).toMatch(/\{!deleteRefusal\(doc\) \? \(\s*<Button[^>]*onClick=\{\(\) => setConfirmDelete\(true\)\}/);
  });
});
