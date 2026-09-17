import React, { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Download, FilePlus2, Send, Trash2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
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
import { useDocumentControl } from './hooks/useDocumentControl';
import { ACCEPTED_FILE_TYPES, validateFile } from './utils/documentPayload';

const showDate = (v) => {
  const d = parseDateOnly(v);
  return d ? format(d, 'd MMM yyyy') : null;
};

/**
 * AS4 — the document detail page.
 *
 * It used to load through `getDocumentById()`, which fell back to
 * `MOCK_DOCUMENTS[0]` on any miss. Asking for a document your
 * organization does not have did not say so: it showed you a different
 * document, "Offshore Rig Evacuation Procedure", complete with a
 * revision number and an owner, as though it were yours.
 *
 * Its three tabs rendered `doc.revision_history`, `doc.comments` and
 * `doc.activity`, none of which are columns on `documents` and none of
 * which the service ever fetched, so all three were permanently empty.
 * The revision chain lives in `doc_revisions` and always did.
 *
 * Edit Metadata and Download Native both toasted "This feature isn't
 * implemented yet".
 */
export default function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInput = useRef(null);
  const {
    documents, categories, activity, loading, error, hasBucket,
    addRevision, issueDocument, deleteDocument, fileUrlFor, refresh,
  } = useDocumentControl();

  const [revising, setRevising] = useState(false);
  const [changes, setChanges] = useState('');
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueDate, setIssueDate] = useState(toDateOnlyString(new Date()));
  const [period, setPeriod] = useState('');

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
  const revisions = [...(doc.revisions || [])].sort(
    (a, b) => String(b.revision_number).localeCompare(String(a.revision_number)));
  const docActivity = activity.filter((a) => a.document_id === doc.id);
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
      description: result.warning || `Revision ${result.data.revision_number} is now the current one.`,
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
      description: result.nextReview
        ? `Published. Next review ${showDate(result.nextReview)}.`
        : 'Published.',
    });
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
    const result = await deleteDocument(doc.id);
    if (result.success) {
      toast({ description: `${doc.document_number} deleted.` });
      navigate(`${BASE}/library`);
    } else {
      toast({ title: 'Not deleted', description: result.error, variant: 'destructive' });
    }
  };

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
          <div className="flex flex-wrap items-center gap-2">
            {!revising ? (
              <Button variant="outline" onClick={() => setRevising(true)}>
                <FilePlus2 className="w-4 h-4 mr-2" /> New revision
              </Button>
            ) : null}
            {doc.status !== 'Published' && !issuing ? (
              <Button onClick={() => setIssuing(true)}>
                <Send className="w-4 h-4 mr-2" /> Publish
              </Button>
            ) : null}
            <Button variant="outline" className="text-[hsl(var(--destructive))]" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
          </div>
        </div>

        {issuing ? (
          <Card className="panel-elevation">
            <CardHeader><CardTitle className="text-lg">Publish this document</CardTitle></CardHeader>
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
                  <Button type="submit" disabled={saving}>{saving ? 'Publishing...' : 'Publish'}</Button>
                </div>
                <p className="md:col-span-3 text-xs text-[hsl(var(--muted-foreground))]">
                  {projectedReview
                    ? `The next review will fall on ${showDate(projectedReview)}, counted from the issue date rather than from today.`
                    : 'Set an issue date and a review period to give this document a review date.'}
                </p>
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
                {docActivity.length ? (
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
      </div>
    </DocControlShell>
  );
}
