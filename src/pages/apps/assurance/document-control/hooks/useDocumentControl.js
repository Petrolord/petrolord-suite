import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  DEFAULT_REVIEW_PERIOD_MONTHS,
  nextRevisionNumber,
  nextReviewDate,
  toDateOnlyString,
} from '@/lib/documentControl';
import {
  buildDocumentWrite,
  buildRevisionWrite,
  prefixFor,
  storagePathFor,
} from '../utils/documentPayload';

const UNKNOWN_COLUMN = 'PGRST204';
const UNKNOWN_RELATION = 'PGRST200';
const UNDEFINED_TABLE = '42P01';
const UNDEFINED_FUNCTION = '42883';
const UNIQUE_VIOLATION = '23505';

const NUMBER_RETRIES = 3;
export const BUCKET = 'documents';

/**
 * AS4 — the one place this app reads and writes.
 *
 * It replaces `DocumentControlService`, which is the worst file in the
 * Assurance module. Six of its eight methods could not fail, because
 * four of them never queried anything and two returned invented rows
 * whenever the database disagreed with them:
 *
 *   getDocuments()       `if (error || !data || data.length === 0) throw`
 *                        then `catch { return MOCK_DOCUMENTS }`. An
 *                        organization with no documents of its own was
 *                        shown five invented ones — "Offshore Rig
 *                        Evacuation Procedure", "Subsea Manifold
 *                        Schematic V2" — owned by Sarah Jenkins, Mike
 *                        Ross, Dr. Alan Grant, Jessica Pearson and
 *                        Louis Litt, names taken from Jurassic Park and
 *                        Suits, as though they were its own controlled
 *                        documents.
 *   getDocumentById()    fell back to `MOCK_DOCUMENTS[0]`, so asking
 *                        for a document you do not have showed you a
 *                        different document.
 *   getDashboardStats()  returned 1245/28/982/14 on any failure, and on
 *                        SUCCESS still reported `overdue: 1`, a literal.
 *   getApprovals()       never queried. Always two hardcoded rows.
 *   getActivityLog()     never queried. Always four rows reading
 *                        "2 hours ago".
 *   getReportData()      never queried. Always the same distributions.
 *   saveDocument()       returned `{ success: true }` on failure.
 *
 * None of them scoped to an organization either: `getDocuments()`
 * selected from `documents` with no org filter at all, relying entirely
 * on RLS to do it, which works but means the app never knew whose data
 * it was showing.
 *
 * Three states, kept distinct: loading, error, empty. An empty library
 * is empty. A broken one says so.
 */
export const useDocumentControl = () => {
  const { organization, user } = useAuth();
  const orgId = organization?.id || null;

  const [documents, setDocuments] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasAs4Schema, setHasAs4Schema] = useState(true);
  const [hasBucket, setHasBucket] = useState(false);

  /** Child reads whose table may not exist yet are not failures. */
  const optional = async (promise) => {
    const res = await promise;
    if (res.error) {
      if (res.error.code === UNDEFINED_TABLE || res.error.code === UNKNOWN_RELATION) {
        return { data: [], missing: true };
      }
      throw res.error;
    }
    return { data: res.data || [], missing: false };
  };

  const fetchAll = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const docRes = await supabase
        .from('documents')
        .select('*')
        .eq('org_id', orgId)
        .order('updated_at', { ascending: false });
      if (docRes.error) throw docRes.error;
      const docs = docRes.data || [];

      const catRes = await supabase
        .from('doc_categories').select('*').eq('org_id', orgId).order('name');
      if (catRes.error) throw catRes.error;

      let as4 = docs.length === 0 || 'review_period_months' in docs[0];

      const ids = docs.map((d) => d.id);
      let revs = [];
      let flows = [];
      let log = [];
      if (ids.length) {
        const r = await optional(supabase
          .from('doc_revisions').select('*').in('document_id', ids)
          .order('created_at', { ascending: false }));
        revs = r.data;
        if (r.missing) as4 = false;

        const l = await optional(supabase
          .from('doc_activity_log').select('*').in('document_id', ids)
          .order('created_at', { ascending: false }).limit(25));
        log = l.data;

        if (revs.length) {
          const w = await optional(supabase
            .from('doc_workflows').select('*').in('revision_id', revs.map((x) => x.id))
            .order('due_date', { ascending: true }));
          flows = w.data;
        }
      }

      setDocuments(docs);
      setCategories(catRes.data || []);
      setRevisions(revs);
      setWorkflows(flows);
      setActivity(log);
      setHasAs4Schema(as4);
    } catch (err) {
      // An empty library is empty. A broken one says so, and shows
      // nothing, rather than five documents from a television drama.
      setError(err.message || 'Could not load the document library.');
      setDocuments([]);
      setCategories([]);
      setRevisions([]);
      setWorkflows([]);
      setActivity([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /**
   * Does the storage bucket exist?
   *
   * Asked rather than assumed, because the bucket is created by the
   * owner (see the migration's closing note). The New Document page
   * offers an upload only when the answer is yes, and says why when it
   * is no. The alternative is what shipped before: an upload box
   * advertising "PDF, DOCX, XLSX up to 50MB" with no input element
   * behind it.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { error: err } = await supabase.storage.from(BUCKET).list('', { limit: 1 });
      if (!cancelled) setHasBucket(!err);
    })();
    return () => { cancelled = true; };
  }, []);

  const revisionsFor = useCallback(
    (documentId) => revisions.filter((r) => r.document_id === documentId),
    [revisions],
  );

  const documentsWithRevisions = useMemo(
    () => documents.map((d) => ({ ...d, revisions: revisionsFor(d.id) })),
    [documents, revisionsFor],
  );

  /** The approval queue: real reviewer assignments, joined to their document. */
  const approvals = useMemo(() => {
    const revById = new Map(revisions.map((r) => [r.id, r]));
    const docById = new Map(documents.map((d) => [d.id, d]));
    return workflows
      .map((w) => {
        const rev = revById.get(w.revision_id);
        const document = rev ? docById.get(rev.document_id) : null;
        return document ? { ...w, revision: rev, document } : null;
      })
      .filter(Boolean);
  }, [workflows, revisions, documents]);

  const logActivity = async (documentId, action, details) => {
    // Best effort: the activity log must never be the reason a real
    // write is reported as failed.
    await supabase.from('doc_activity_log').insert([{
      document_id: documentId,
      user_id: user?.id || null,
      action,
      details: details || null,
    }]);
  };

  const issueNumber = async (prefix, attempt) => {
    const { data, error: err } = await supabase.rpc('next_document_number', {
      p_org: orgId, p_prefix: prefix,
    });
    if (!err && data) return data;
    if (err && err.code !== UNDEFINED_FUNCTION) throw err;
    // Fallback while the migration is unapplied: highest we can see.
    const used = documents
      .map((d) => new RegExp(`^${prefix}-(\\d+)$`, 'i').exec(String(d.document_number || '')))
      .filter(Boolean)
      .map((m) => Number(m[1]));
    const next = (used.length ? Math.max(...used) : 0) + 1 + attempt;
    return `${prefix}-${String(next).padStart(3, '0')}`;
  };

  /**
   * Upload a revision's file.
   * Returns the path, or an error the caller must surface. It never
   * silently succeeds.
   */
  const uploadFile = async (file, orgIdArg, documentId, revisionId) => {
    const path = storagePathFor(orgIdArg, documentId, revisionId, file.name);
    const { error: err } = await supabase.storage.from(BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (err) return { success: false, error: err.message };
    return { success: true, path };
  };

  const fileUrlFor = async (storagePath) => {
    if (!storagePath) return null;
    const { data, error: err } = await supabase.storage.from(BUCKET)
      .createSignedUrl(storagePath, 300);
    if (err) return null;
    return data?.signedUrl || null;
  };

  /**
   * Register a document, its first revision, and its file.
   *
   * Every step reports its own outcome. If the document is written and
   * the file upload fails, the caller is told exactly that, rather than
   * being shown a success toast for a controlled document with no
   * content behind it.
   */
  const createDocument = async (form, file) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };
    let as4 = hasAs4Schema;
    const prefix = prefixFor(form);

    for (let attempt = 0; attempt < NUMBER_RETRIES; attempt += 1) {
      let number;
      try {
        number = await issueNumber(prefix, attempt);
      } catch (err) {
        return { success: false, error: err.message };
      }

      const { row } = buildDocumentWrite(form, { hasAs4Columns: as4 });
      const { data, error: err } = await supabase
        .from('documents')
        .insert([{
          ...row,
          org_id: orgId,
          document_number: number,
          created_by: user?.id || null,
          current_revision: '01',
        }])
        .select()
        .single();

      if (err) {
        if (err.code === UNKNOWN_COLUMN && as4) {
          as4 = false;
          setHasAs4Schema(false);
          continue;
        }
        // A number taken between our read and our write. This is the
        // case the old app hit and reported as success.
        if (err.code === UNIQUE_VIOLATION && attempt < NUMBER_RETRIES - 1) continue;
        return { success: false, error: err.message };
      }

      const revResult = await addRevision(data, {
        revision_number: '01',
        changes_description: form.changes_description || 'Initial issue',
        status: row.status,
      }, file, { skipRefresh: true });

      await logActivity(data.id, 'Document registered', { document_number: number });
      await fetchAll();

      return {
        success: true,
        data,
        warning: revResult.success ? revResult.warning : revResult.error,
      };
    }
    return { success: false, error: 'Could not allocate a document number. Try again in a moment.' };
  };

  const updateDocument = async (id, form) => {
    let as4 = hasAs4Schema;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { row } = buildDocumentWrite(form, { hasAs4Columns: as4 });
      const { data, error: err } = await supabase
        .from('documents')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', id).select().single();
      if (!err) {
        await logActivity(id, 'Metadata updated');
        await fetchAll();
        return { success: true, data };
      }
      if (err.code === UNKNOWN_COLUMN && as4) {
        as4 = false; setHasAs4Schema(false); continue;
      }
      return { success: false, error: err.message };
    }
    return { success: false, error: 'Could not save the document.' };
  };

  /**
   * Add a revision, with its file if one is given.
   *
   * The new revision becomes current and the old one stops being
   * current, in that order, because `doc_revisions_one_current` is a
   * real unique index and would refuse two.
   */
  const addRevision = async (document, fields, file, { skipRefresh = false } = {}) => {
    let as4 = hasAs4Schema;
    let warning = null;

    if (as4) {
      const { error: clearErr } = await supabase
        .from('doc_revisions')
        .update({ is_current: false, superseded_at: new Date().toISOString() })
        .eq('document_id', document.id).eq('is_current', true);
      if (clearErr && clearErr.code !== UNKNOWN_COLUMN) {
        return { success: false, error: clearErr.message };
      }
      if (clearErr) { as4 = false; setHasAs4Schema(false); }
    }

    const { row } = buildRevisionWrite({
      document_id: document.id,
      revision_number: fields.revision_number
        || nextRevisionNumber(document.current_revision),
      changes_description: fields.changes_description || null,
      status: fields.status || 'Draft',
      is_current: true,
      created_by: user?.id || null,
      file_name: file?.name || null,
      file_size: file?.size || null,
      file_type: file?.type || null,
    }, { hasAs4Columns: as4 });

    const { data, error: err } = await supabase
      .from('doc_revisions').insert([row]).select().single();
    if (err) return { success: false, error: err.message };

    if (file) {
      if (!hasBucket) {
        warning = `Revision ${data.revision_number} was recorded, but the file was not stored: the document storage bucket does not exist yet. Ask your administrator to create it.`;
      } else {
        const up = await uploadFile(file, document.org_id, document.id, data.id);
        if (!up.success) {
          warning = `Revision ${data.revision_number} was recorded, but the file was not stored: ${up.error}`;
        } else {
          const { error: pathErr } = await supabase
            .from('doc_revisions')
            .update({ storage_path: up.path }).eq('id', data.id);
          if (pathErr) {
            warning = `The file was uploaded but could not be linked to the revision: ${pathErr.message}`;
          }
        }
      }
    }

    await supabase.from('documents')
      .update({ current_revision: data.revision_number, updated_at: new Date().toISOString() })
      .eq('id', document.id);
    await logActivity(document.id, `Revision ${data.revision_number} added`);

    if (!skipRefresh) await fetchAll();
    return { success: true, data, warning };
  };

  /**
   * Issue a document: publish it and set the review date it earns.
   * The date is computed from the issue date, not typed.
   */
  const issueDocument = async (document, { issueDate, reviewPeriodMonths } = {}) => {
    const issued = toDateOnlyString(issueDate || new Date());
    const period = reviewPeriodMonths
      || document.review_period_months
      || DEFAULT_REVIEW_PERIOD_MONTHS;
    const review = nextReviewDate(issued, period);

    const result = await updateDocument(document.id, {
      ...document,
      status: 'Published',
      issue_date: issued,
      review_period_months: period,
      next_review_date: review ? toDateOnlyString(review) : null,
    });
    if (result.success) await logActivity(document.id, 'Document published');
    return result.success
      ? { ...result, nextReview: review ? toDateOnlyString(review) : null }
      : result;
  };

  /** Record a reviewer's decision on a revision. */
  const decideWorkflow = async (workflow, status, comments) => {
    const { error: err } = await supabase
      .from('doc_workflows')
      .update({ status, comments: comments || null, completed_at: new Date().toISOString() })
      .eq('id', workflow.id);
    if (err) return { success: false, error: err.message };
    await logActivity(workflow.document?.id, `Review ${status.toLowerCase()}`);
    await fetchAll();
    return { success: true };
  };

  const deleteDocument = async (id) => {
    const { error: err } = await supabase.from('documents').delete().eq('id', id);
    if (err) return { success: false, error: err.message };
    await fetchAll();
    return { success: true };
  };

  const createCategory = async (name, code) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };
    const { data, error: err } = await supabase
      .from('doc_categories')
      .insert([{ org_id: orgId, name, code: code || name.slice(0, 3).toUpperCase() }])
      .select().single();
    if (err) return { success: false, error: err.message };
    await fetchAll();
    return { success: true, data };
  };

  return {
    orgId,
    documents: documentsWithRevisions,
    categories,
    revisions,
    approvals,
    activity,
    loading,
    error,
    hasAs4Schema,
    hasBucket,
    refresh: fetchAll,
    revisionsFor,
    fileUrlFor,
    createDocument,
    updateDocument,
    addRevision,
    issueDocument,
    decideWorkflow,
    deleteDocument,
    createCategory,
  };
};

export default useDocumentControl;
