import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArchiveX, ArrowLeft, CheckSquare, Download, FilePlus2, Pencil, Send, Trash2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  CONFIDENTIALITY_LEVELS,
  nextReviewDate,
  nextRevisionNumber,
  parseDateOnly,
  toDateOnlyString,
  DEFAULT_REVIEW_PERIOD_MONTHS,
} from '@/lib/documentControl';
import { DocControlShell, BASE } from './components/DocControlShell';
import { ConfidentialityBadge, ReviewBadge, StatusBadge } from './components/StatusBadge';
import {
  BucketNotice, DetailField, ErrorState, Loading,
} from './components/SharedComponents';
import { EMPTY_REVIEW, ReviewRequestFields } from './components/ReviewRequestFields';
import { useDocumentControl } from './hooks/useDocumentControl';
import {
  ACCEPTED_FILE_TYPES,
  WITHDRAWN_STATUSES,
  canPublish,
  canStartRevision,
  canSubmitForReview,
  pendingReviewTasks,
  currentRevisionOf,
  validateFile,
} from './utils/documentPayload';

const DEPARTMENTS = ['HSE', 'Operations', 'Engineering', 'Finance', 'Human Resources', 'Subsurface', 'Drilling'];

const showDate = (v) => {
  const d = parseDateOnly(v);
  return d ? format(d, 'd MMM yyyy') : null;
};

const selectClass = 'flex h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm';

/**
 * AS4 — the document detail page.
 *
 * It used to load through `getDocumentById()`, which fell back to
 * `MOCK_DOCUMENTS[0]` on any miss. Asking for a document your
 * organization does not have did not say so: it showed you a different
 * document, "Offshore Rig Evacuation Procedure", complete with a
 * revision number and an owner, as though it were yours.
 *
 * AS13: the page is where the review workflow runs. A revision is sent
 * for review to named reviewers; Publish is offered only for an approved
 * revision, and publishing a revised document re-issues it, resetting
 * its issue and review dates (it could never be published twice
 * before); details can be edited; a document can be marked Obsolete or
 * Superseded by another; delete asks first; and the Activity tab reads
 * the document's whole history rather than its share of the 25 latest
 * entries across the library.
 */
export default function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const fileInput = useRef(null);
  const {
    documents, categories, activity, workflows, members, membersError,
    loading, error, hasBucket, hasAs4Schema,
    addRevision, issueDocument, submitForReview, updateDocument, retireDocument,
    deleteDocument, fileUrlFor, activityForDocument, refresh,
  } = useDocumentControl();

  const [revising, setRevising] = useState(false);
  const [changes, setChanges] = useState('');
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueDate, setIssueDate] = useState(toDateOnlyString(new Date()));
  const [period, setPeriod] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState(EMPTY_REVIEW);
  const [reviewError, setReviewError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [retiring, setRetiring] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [docActivity, setDocActivity] = useState([]);
  const [activityError, setActivityError] = useState(null);

  // The document's own history. `activity` changes after every write,
  // which is when this needs reading again.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await activityForDocument(id);
      if (cancelled) return;
      if (res.success) { setDocActivity(res.data); setActivityError(null); } else { setActivityError(res.error); }
    })();
    return () => { cancelled = true; };
  }, [id, activity, activityForDocument]);

  if (loading) return <DocControlShell><Loading label="Loading the document..." /></DocControlShell>;
  if (error) return <DocControlShell><ErrorState error={error} onRetry={refresh} /></DocControlShell>;

  const doc = documents.find((d) => d.id === id);
  if (!doc) {
    // Said plainly. The old page showed a different document instead.
    return (
      <DocControlShell>
        <div className="py-16 text-center text-[hsl(var(--muted-foreground))]">
          That document is not in this organization&apos;s library.
        </div>
      </DocControlShell>
    );
  }

  const category = categories.find((c) => c.id === doc.category_id);
  const supersededBy = doc.superseded_by ? documents.find((d) => d.id === doc.superseded_by) : null;
  const revisions = [...(doc.revisions || [])].sort(
    (a, b) => String(b.revision_number).localeCompare(String(a.revision_number)));
  const current = currentRevisionOf(doc);
  // Only the latest review round's tasks, and only while it is
  // undecided: a task from an earlier round is not someone to wait on.
  const pendingOnCurrent = pendingReviewTasks(current, workflows);
  const memberName = (userId) => {
    const m = members.find((x) => x.user_id === userId);
    return m ? (m.full_name || m.email) : 'a member no longer in this organization';
  };
  const withdrawn = WITHDRAWN_STATUSES.includes(doc.status);
  const reissue = doc.status === 'Published';
  const effectivePeriod = Number(period) || doc.review_period_months || DEFAULT_REVIEW_PERIOD_MONTHS;
  const projectedReview = nextReviewDate(issueDate, effectivePeriod);

  const takeFile = (candidate) => {
    const problem = validateFile(candidate);
    if (problem) { setFileError(problem); return; }
    setFileError(null);
    setFile(candidate);
  };

  const handleRevision = async (e) => {
    e.preventDefault();
    setSaving(true);
    const result = await addRevision(doc, {
      revision_number: nextRevisionNumber(doc.current_revision),
      changes_description: changes,
      status: 'Draft',
    }, file);
    setSaving(false);
    if (!result.success) {
      toast({ title: 'The revision was not created', description: result.error, variant: 'destructive' });
      return;
    }
    setRevising(false); setChanges(''); setFile(null);
    toast({
      title: result.warning ? 'Revision created, with a caveat' : 'Revision created',
      description: result.warning || `Revision ${result.data.revision_number} is now the current one. Send it for review when it is ready.`,
      variant: result.warning ? 'destructive' : undefined,
    });
  };

  const handleReview = async (e) => {
    e.preventDefault();
    setReviewError(null);
    setSaving(true);
    const result = await submitForReview(doc, {
      reviewers: review.reviewers, dueDate: review.dueDate || null,
    });
    setSaving(false);
    if (!result.success) {
      setReviewError(result.error);
      return;
    }
    setReviewing(false); setReview(EMPTY_REVIEW);
    toast({
      title: result.warning ? 'Sent for review, with a caveat' : 'Sent for review',
      description: result.warning
        || `${result.reviewers} review task${result.reviewers === 1 ? '' : 's'} added to the Approvals tab.`,
      variant: result.warning ? 'destructive' : undefined,
    });
  };

  const handleIssue = async (e) => {
    e.preventDefault();
    setSaving(true);
    const result = await issueDocument(doc, {
      issueDate, reviewPeriodMonths: effectivePeriod,
    });
    setSaving(false);
    if (!result.success) {
      toast({ title: 'The document was not published', description: result.error, variant: 'destructive' });
      return;
    }
    setIssuing(false);
    toast({
      title: result.warning ? 'Published, with a caveat' : undefined,
      description: result.warning || (result.nextReview
        ? `${reissue ? 'Re-issued' : 'Published'}. Next review ${showDate(result.nextReview)}.`
        : `${reissue ? 'Re-issued' : 'Published'}.`),
      variant: result.warning ? 'destructive' : undefined,
    });
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!String(editing.title || '').trim()) {
      toast({ title: 'Not saved', description: 'A document needs a title.', variant: 'destructive' });
      return;
    }
    const months = Number(editing.review_period_months);
    if (editing.review_period_months !== '' && editing.review_period_months != null
        && (!Number.isFinite(months) || months < 1 || months > 120)) {
      toast({ title: 'Not saved', description: 'A review period is between 1 and 120 months.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const result = await updateDocument(doc.id, { ...doc, ...editing });
    setSaving(false);
    if (!result.success) {
      toast({ title: 'Not saved', description: result.error, variant: 'destructive' });
      return;
    }
    setEditing(null);
    toast(result.warning
      ? { title: 'Saved, with a caveat', description: result.warning, variant: 'destructive' }
      : { description: 'Details saved.' });
  };

  const handleRetire = async (e) => {
    e.preventDefault();
    setSaving(true);
    const result = await retireDocument(doc, retiring);
    setSaving(false);
    if (!result.success) {
      toast({ title: 'Not changed', description: result.error, variant: 'destructive' });
      return;
    }
    setRetiring(null);
    toast(result.warning
      ? { title: `${doc.document_number} is now ${retiring.status}, with a caveat`, description: result.warning, variant: 'destructive' }
      : { description: `${doc.document_number} is now ${retiring.status}.` });
  };

  const handleDownload = async (revision) => {
    if (revision.storage_path) {
      const url = await fileUrlFor(revision.storage_path);
      if (url) { window.open(url, '_blank', 'noopener'); return; }
      toast({
        title: 'The file could not be opened',
        description: 'The stored file could not be reached. It may have been removed from storage.',
        variant: 'destructive',
      });
      return;
    }
    if (revision.file_url) { window.open(revision.file_url, '_blank', 'noopener'); return; }
    toast({ description: 'This revision has no file attached to it.' });
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    const result = await deleteDocument(doc.id);
    if (result.success) {
      toast({ description: `${doc.document_number} deleted.` });
      navigate(`${BASE}/library`);
    } else {
      toast({ title: 'Not deleted', description: result.error, variant: 'destructive' });
    }
  };

  const busy = revising || issuing || reviewing || editing || retiring;

  return (
    <DocControlShell>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
        {!hasBucket ? <BucketNotice /> : null}

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-[hsl(var(--border))] pb-6">
          <div className="flex gap-4">
            <Button variant="ghost" size="icon" className="mt-1" aria-label="Back"
              onClick={() => navigate(`${BASE}/library`)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <span className="px-2 py-0.5 bg-[hsl(var(--secondary))] rounded text-xs font-mono border border-[hsl(var(--border))]">
                  {doc.document_number}
                </span>
                <span className="px-2 py-0.5 bg-[hsl(var(--secondary))] rounded text-xs border border-[hsl(var(--border))]">
                  Rev {doc.current_revision || '-'}
                </span>
                <StatusBadge status={doc.status} />
                <ConfidentialityBadge level={doc.confidentiality} />
                <ReviewBadge document={doc} />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">{doc.title}</h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">
                {[doc.department, category?.name].filter(Boolean).join(' · ') || 'No department or category set'}
              </p>
            </div>
          </div>
          {!busy ? (
            <div className="flex flex-wrap items-center gap-2">
              {canStartRevision(doc, workflows) ? (
                <Button variant="outline" onClick={() => setRevising(true)}>
                  <FilePlus2 className="w-4 h-4 mr-2" /> New revision
                </Button>
              ) : null}
              {canSubmitForReview(doc, workflows) ? (
                <Button variant="outline" onClick={() => { setReviewing(true); setReviewError(null); }}>
                  <CheckSquare className="w-4 h-4 mr-2" /> Submit for review
                </Button>
              ) : null}
              {canPublish(doc) ? (
                <Button onClick={() => setIssuing(true)}>
                  <Send className="w-4 h-4 mr-2" /> {reissue ? 'Re-issue' : 'Publish'}
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => setEditing({
                title: doc.title || '',
                department: doc.department || '',
                category_id: doc.category_id || '',
                confidentiality: doc.confidentiality || 'Internal',
                description: doc.description || '',
                review_period_months: doc.review_period_months || '',
              })}>
                <Pencil className="w-4 h-4 mr-2" /> Edit details
              </Button>
              {!withdrawn ? (
                <Button variant="outline" onClick={() => setRetiring({ status: 'Obsolete', superseded_by: '' })}>
                  <ArchiveX className="w-4 h-4 mr-2" /> Withdraw
                </Button>
              ) : null}
              <Button variant="outline" className="text-[hsl(var(--destructive))]" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </Button>
            </div>
          ) : null}
        </div>

        {current ? (
          <Card className="panel-elevation">
            <CardContent className="p-4 text-sm space-y-1">
              <p>
                <span className="font-medium">Revision {current.revision_number}</span>
                {' is '}
                <span className="font-medium">{current.status || 'Draft'}</span>.
                {pendingOnCurrent.length
                  ? ` Waiting on ${pendingOnCurrent.map((w) => `${memberName(w.reviewer_id)} (${w.role})`).join(', ')}.`
                  : ''}
              </p>
              {reissue && current.status !== 'Published' ? (
                <p className="text-[hsl(var(--muted-foreground))]">
                  The issued revision stays in force until this one is approved and re-issued.
                </p>
              ) : null}
              {!canStartRevision(doc, workflows) && !withdrawn ? (
                <p className="text-[hsl(var(--muted-foreground))]">
                  A new revision can be started once the review decisions are recorded.
                </p>
              ) : null}
              {!canPublish(doc) && !withdrawn && current.status !== 'Published' ? (
                <p className="text-[hsl(var(--muted-foreground))]">
                  {reissue ? 'Re-issue' : 'Publish'} is offered once every reviewer has approved this revision.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {reviewing ? (
          <Card className="panel-elevation">
            <CardHeader>
              <CardTitle className="text-lg">Send revision {current?.revision_number} for review</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleReview} className="space-y-4">
                <ReviewRequestFields value={review} onChange={setReview}
                  members={members} membersError={membersError} userId={user?.id} idPrefix="detail-review" />
                {reviewError ? <p className="text-sm text-[hsl(var(--destructive))]">{reviewError}</p> : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setReviewing(false)}>Cancel</Button>
                  <Button type="submit" disabled={saving || !members.length}>
                    {saving ? 'Sending...' : 'Send for review'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {issuing ? (
          <Card className="panel-elevation">
            <CardHeader>
              <CardTitle className="text-lg">{reissue ? 'Re-issue this document' : 'Publish this document'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleIssue} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <Label htmlFor="issue_date">Issue date</Label>
                  <Input id="issue_date" type="date" value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="period">Review period (months)</Label>
                  <Input id="period" type="number" min={1} max={120}
                    value={period} onChange={(e) => setPeriod(e.target.value)}
                    placeholder={String(doc.review_period_months || DEFAULT_REVIEW_PERIOD_MONTHS)} />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="ghost" onClick={() => setIssuing(false)}>Cancel</Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Publishing...' : (reissue ? 'Re-issue' : 'Publish')}
                  </Button>
                </div>
                <p className="md:col-span-3 text-xs text-[hsl(var(--muted-foreground))]">
                  {reissue ? 'Re-issuing replaces the issue date and the next review date. ' : ''}
                  {projectedReview
                    ? `The next review will fall on ${showDate(projectedReview)}, counted from the issue date rather than from today.`
                    : 'Set an issue date and a review period to give this document a review date.'}
                </p>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {editing ? (
          <Card className="panel-elevation">
            <CardHeader><CardTitle className="text-lg">Edit details</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleEdit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="edit_title">Title</Label>
                  <Input id="edit_title" value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="edit_department">Owning department</Label>
                  <select id="edit_department" className={selectClass} value={editing.department}
                    onChange={(e) => setEditing({ ...editing, department: e.target.value })}>
                    <option value="">Not set</option>
                    {[...new Set([...DEPARTMENTS, doc.department].filter(Boolean))].map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="edit_category">Category</Label>
                  <select id="edit_category" className={selectClass} value={editing.category_id}
                    onChange={(e) => setEditing({ ...editing, category_id: e.target.value })}>
                    <option value="">Not set</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="edit_confidentiality">Confidentiality</Label>
                  <select id="edit_confidentiality" className={selectClass} value={editing.confidentiality}
                    onChange={(e) => setEditing({ ...editing, confidentiality: e.target.value })}>
                    {CONFIDENTIALITY_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {hasAs4Schema ? (
                  <div>
                    <Label htmlFor="edit_period">Review period (months)</Label>
                    <Input id="edit_period" type="number" min={1} max={120} value={editing.review_period_months}
                      onChange={(e) => setEditing({ ...editing, review_period_months: e.target.value })} />
                  </div>
                ) : null}
                {hasAs4Schema ? (
                  <div className="md:col-span-2">
                    <Label htmlFor="edit_description">Purpose</Label>
                    <Textarea id="edit_description" rows={3} value={editing.description}
                      onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                  </div>
                ) : null}
                <p className="md:col-span-2 text-xs text-[hsl(var(--muted-foreground))]">
                  The document number does not change. On a published document, a new review period
                  moves the next review date, counted from the issue date.
                </p>
                <div className="md:col-span-2 flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save details'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {retiring ? (
          <Card className="panel-elevation">
            <CardHeader><CardTitle className="text-lg">Withdraw this document</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleRetire} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="retire_status">It is now</Label>
                  <select id="retire_status" className={selectClass} value={retiring.status}
                    onChange={(e) => setRetiring({ ...retiring, status: e.target.value })}>
                    <option value="Obsolete">Obsolete</option>
                    {hasAs4Schema ? <option value="Superseded">Superseded by another document</option> : null}
                  </select>
                </div>
                {retiring.status === 'Superseded' ? (
                  <div>
                    <Label htmlFor="retire_by">Superseded by</Label>
                    <select id="retire_by" className={selectClass} value={retiring.superseded_by}
                      onChange={(e) => setRetiring({ ...retiring, superseded_by: e.target.value })}>
                      <option value="">Choose a document</option>
                      {documents.filter((d) => d.id !== doc.id).map((d) => (
                        <option key={d.id} value={d.id}>{d.document_number} {d.title}</option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <p className="md:col-span-2 text-xs text-[hsl(var(--muted-foreground))]">
                  A withdrawn document is no longer in force, so it drops out of the review dates.
                  Its revisions and files are kept.
                </p>
                <div className="md:col-span-2 flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setRetiring(null)}>Cancel</Button>
                  <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Withdraw'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {revising ? (
          <Card className="panel-elevation">
            <CardHeader>
              <CardTitle className="text-lg">
                New revision {nextRevisionNumber(doc.current_revision)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRevision} className="space-y-4">
                <div>
                  <Label htmlFor="changes">What changed</Label>
                  <Textarea id="changes" rows={2} value={changes}
                    onChange={(e) => setChanges(e.target.value)}
                    placeholder="The change, in enough detail that a reader of the previous revision knows what to look at." />
                </div>
                {hasBucket ? (
                  <div>
                    <input ref={fileInput} type="file" className="sr-only"
                      accept={ACCEPTED_FILE_TYPES.join(',')}
                      onChange={(e) => takeFile(e.target.files?.[0] || null)} />
                    <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                      {file ? `Replace file (${file.name})` : 'Attach the revised file'}
                    </Button>
                    {fileError ? (
                      <p className="text-xs text-[hsl(var(--destructive))] mt-1">{fileError}</p>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => { setRevising(false); setFile(null); }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Creating...' : 'Create revision'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="bg-transparent border-b border-[hsl(var(--border))] w-full justify-start rounded-none h-auto p-0 space-x-6">
            <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[hsl(var(--primary))] data-[state=active]:bg-transparent px-1 pb-3">
              Overview
            </TabsTrigger>
            <TabsTrigger value="revisions" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[hsl(var(--primary))] data-[state=active]:bg-transparent px-1 pb-3">
              Revisions ({revisions.length})
            </TabsTrigger>
            <TabsTrigger value="activity" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[hsl(var(--primary))] data-[state=active]:bg-transparent px-1 pb-3">
              Activity ({docActivity.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="pt-6">
            <Card className="panel-elevation">
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-5">
                <DetailField label="Department">{doc.department}</DetailField>
                <DetailField label="Category">{category?.name}</DetailField>
                <DetailField label="Classification">{doc.confidentiality}</DetailField>
                <DetailField label="Issued">{showDate(doc.issue_date)}</DetailField>
                <DetailField label="Next review">{showDate(doc.next_review_date)}</DetailField>
                <DetailField label="Review period">
                  {doc.review_period_months ? `${doc.review_period_months} months` : null}
                </DetailField>
                {doc.status === 'Superseded' ? (
                  <DetailField label="Superseded by">
                    {supersededBy ? (
                      <button type="button" className="hover:underline text-left"
                        onClick={() => navigate(`${BASE}/${supersededBy.id}`)}>
                        {supersededBy.document_number} {supersededBy.title}
                      </button>
                    ) : null}
                  </DetailField>
                ) : null}
                <div className="md:col-span-3">
                  <DetailField label="Purpose">{doc.description}</DetailField>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="revisions" className="pt-6">
            <Card className="panel-elevation">
              <CardContent className="p-0">
                {revisions.length ? (
                  <ul className="divide-y divide-[hsl(var(--border))]">
                    {revisions.map((r) => (
                      <li key={r.id} className="p-5 flex justify-between items-start gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">Revision {r.revision_number}</span>
                            {r.status ? <StatusBadge status={r.status} /> : null}
                            {r.is_current ? (
                              <span className="text-xs px-2 py-0.5 rounded-full border"
                                style={{
                                  backgroundColor: 'hsl(var(--success) / 0.1)',
                                  color: 'hsl(var(--success))',
                                  borderColor: 'hsl(var(--success) / 0.25)',
                                }}>
                                Current
                              </span>
                            ) : null}
                          </div>
                          {r.changes_description ? (
                            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{r.changes_description}</p>
                          ) : null}
                          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                            {r.created_at ? format(new Date(r.created_at), 'd MMM yyyy') : ''}
                            {r.file_name ? ` · ${r.file_name}` : ' · no file attached'}
                          </p>
                        </div>
                        {(r.storage_path || r.file_url) ? (
                          <Button variant="outline" size="sm" onClick={() => handleDownload(r)}>
                            <Download className="w-4 h-4 mr-2" /> Open
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                    This document has no revisions recorded. Creating one starts
                    the chain at 01.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="pt-6">
            <Card className="panel-elevation">
              <CardContent className="p-6">
                {activityError ? (
                  <p className="text-sm text-[hsl(var(--destructive))]">
                    The activity for this document could not be loaded: {activityError}
                  </p>
                ) : docActivity.length ? (
                  <ul className="space-y-4">
                    {docActivity.map((a) => (
                      <li key={a.id} className="flex justify-between gap-4">
                        <span className="text-sm">{a.action}</span>
                        <span className="text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                          {a.created_at ? `${formatDistanceToNow(new Date(a.created_at))} ago` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-center text-[hsl(var(--muted-foreground))] py-6">
                    Nothing has been recorded against this document yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {doc.document_number}?</AlertDialogTitle>
              <AlertDialogDescription>
                The document, its revisions, its review tasks and its activity are removed. This
                cannot be undone. To take a document out of force and keep its record, use Withdraw.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-[hsl(var(--destructive))] text-white hover:bg-[hsl(var(--destructive))]/90"
                onClick={handleDelete}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DocControlShell>
  );
}
