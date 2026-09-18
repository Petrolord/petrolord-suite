import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, CheckCircle2, FileText, UploadCloud, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  CONFIDENTIALITY_LEVELS,
  DEFAULT_REVIEW_PERIOD_MONTHS,
  documentPrefix,
} from '@/lib/documentControl';
import { DocControlShell, BASE } from './components/DocControlShell';
import { BucketNotice, ErrorState, Loading, SchemaNotice } from './components/SharedComponents';
import { useDocumentControl } from './hooks/useDocumentControl';
import { EMPTY_REVIEW, ReviewRequestFields } from './components/ReviewRequestFields';
import {
  ACCEPTED_FILE_TYPES,
  validateDocument,
  validateFile,
  validateReviewers,
} from './utils/documentPayload';

const DEPARTMENTS = ['HSE', 'Operations', 'Engineering', 'Finance', 'Human Resources', 'Subsurface', 'Drilling'];

const EMPTY = {
  title: '',
  description: '',
  categoryName: '',
  category_id: '',
  department: '',
  confidentiality: 'Internal',
  review_period_months: DEFAULT_REVIEW_PERIOD_MONTHS,
  changes_description: '',
};

const Select = ({ id, value, onChange, options, placeholder }) => (
  <select id={id} value={value ?? ''} onChange={onChange}
    className="flex h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm">
    <option value="">{placeholder}</option>
    {options.map((o) => (
      <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
    ))}
  </select>
);

const FieldError = ({ children }) => (children ? (
  <p className="text-xs text-[hsl(var(--destructive))] mt-1">{children}</p>
) : null);

/**
 * AS4 — register a document, and actually accept the file.
 *
 * Two things this page did that it should not have.
 *
 * The upload box advertised "Click to upload or drag and drop. PDF,
 * DOCX, XLSX up to 50MB" and was a styled div. No input element, no
 * onChange, no drop handler, no state. It accepted nothing, and there
 * was no way to tell by looking.
 *
 * And the document number was
 * `${DEPT}-${CAT}-${Math.floor(Math.random()*1000)}`. The database has
 * a real unique constraint on (org_id, document_number), so a collision
 * was correctly rejected, and `saveDocument()` then returned
 * `{ success: true }` anyway. The user got "Document saved as draft"
 * and was navigated to a library the document was not in.
 *
 * The number is now issued by the database in sequence, the file is
 * really uploaded, and every failure is reported where it happened.
 */
export default function NewDocument() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInput = useRef(null);
  const { user } = useAuth();
  const {
    categories, loading, error, hasAs4Schema, hasBucket,
    members, membersError,
    createDocument, createCategory, submitForReview, refresh,
  } = useDocumentControl();

  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [review, setReview] = useState(EMPTY_REVIEW);

  const set = (field) => (e) => {
    const value = e?.target ? e.target.value : e;
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((p) => (p[field] ? { ...p, [field]: undefined } : p));
  };

  const takeFile = (candidate) => {
    const problem = validateFile(candidate);
    if (problem) {
      setErrors((p) => ({ ...p, file: problem }));
      return;
    }
    setErrors((p) => ({ ...p, file: undefined }));
    setFile(candidate);
  };

  const handleSubmit = async (sendForReview) => {
    setFailure(null);
    const found = validateDocument(form);
    // Submit for review needs someone to review it. Without a reviewer
    // it used to set In Review and put nothing in anyone's queue.
    if (sendForReview) {
      const reviewProblem = validateReviewers(review.reviewers);
      if (reviewProblem) found.review = reviewProblem;
    }
    if (Object.keys(found).length) { setErrors(found); return; }

    setSaving(true);
    // The category is a foreign key, not a string. The old form
    // collected a name and sent it into `category`, a column that does
    // not exist, which is why every create failed at the database.
    let categoryId = form.category_id;
    if (!categoryId && form.categoryName) {
      const existing = categories.find(
        (c) => c.name.toLowerCase() === form.categoryName.trim().toLowerCase());
      if (existing) {
        categoryId = existing.id;
      } else {
        const made = await createCategory(form.categoryName.trim());
        if (!made.success) {
          setSaving(false);
          setFailure(`The category could not be created: ${made.error}`);
          return;
        }
        categoryId = made.data.id;
      }
    }

    // Registered as a Draft first; the review request then moves it to
    // In Review, so the status and the approval queue cannot disagree.
    const result = await createDocument({
      ...form,
      category_id: categoryId,
      status: 'Draft',
    }, file);

    if (!result.success) {
      setSaving(false);
      setFailure(result.error);
      return;
    }

    const warnings = result.warning ? [result.warning] : [];
    let submitted = false;
    if (sendForReview) {
      if (!result.revision) {
        warnings.push('It was saved as a draft and not sent for review, because its first revision was not recorded.');
      } else {
        const sent = await submitForReview(
          { ...result.data, revisions: [result.revision] },
          { reviewers: review.reviewers, dueDate: review.dueDate || null },
        );
        if (!sent.success) {
          warnings.push(`It was saved as a draft and not sent for review: ${sent.error}`);
        } else {
          submitted = true;
          if (sent.warning) warnings.push(sent.warning);
        }
      }
    }
    setSaving(false);

    toast({
      title: warnings.length ? 'Registered, with a caveat' : 'Document registered',
      description: warnings.length
        ? warnings.join(' ')
        : `${result.data.document_number} ${submitted ? 'submitted for review' : 'saved as a draft'}.`,
      variant: warnings.length ? 'destructive' : undefined,
    });
    navigate(`${BASE}/${result.data.id}`);
  };

  if (loading) return <DocControlShell><Loading /></DocControlShell>;
  if (error) return <DocControlShell><ErrorState error={error} onRetry={refresh} /></DocControlShell>;

  const prefix = documentPrefix(form.department, form.categoryName);

  return (
    <DocControlShell>
      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
        {!hasAs4Schema ? <SchemaNotice /> : null}
        {!hasBucket ? <BucketNotice /> : null}

        <div className="border-b border-[hsl(var(--border))] pb-4">
          <h2 className="text-2xl font-bold">Register a controlled document</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            The document number is issued in sequence by the database once
            the department and category are set.
          </p>
        </div>

        {failure ? (
          <div className="p-4 rounded-lg border border-[hsl(var(--destructive))]/30 bg-[hsl(var(--destructive))]/5 text-sm">
            <p className="font-medium">The document was not registered</p>
            <p className="text-[hsl(var(--muted-foreground))] mt-1">{failure}</p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Card className="panel-elevation">
              <CardHeader><CardTitle className="text-lg">Metadata</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" value={form.title} onChange={set('title')}
                    placeholder="Emergency Response Plan" />
                  <FieldError>{errors.title}</FieldError>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="department">Owning department</Label>
                    <Select id="department" value={form.department} onChange={set('department')}
                      options={DEPARTMENTS} placeholder="Select a department" />
                    <FieldError>{errors.department}</FieldError>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="categoryName">Category</Label>
                    <Input id="categoryName" list="doc-categories" value={form.categoryName}
                      onChange={set('categoryName')} placeholder="Policy, SOP, Drawing..." />
                    <datalist id="doc-categories">
                      {categories.map((c) => <option key={c.id} value={c.name} />)}
                    </datalist>
                    <FieldError>{errors.categoryName}</FieldError>
                  </div>
                </div>

                {form.department && form.categoryName ? (
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    This document will be numbered {prefix}-
                    <span className="opacity-60">nnn</span>, the next free number
                    in that sequence for your organization.
                  </p>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="description">Purpose</Label>
                  <Textarea id="description" rows={3} value={form.description} onChange={set('description')}
                    placeholder="What this document is for, so the next person to hold it does not have to read it end to end." />
                </div>
              </CardContent>
            </Card>

            <Card className="panel-elevation">
              <CardHeader><CardTitle className="text-lg">The document file</CardTitle></CardHeader>
              <CardContent>
                {hasBucket ? (
                  <>
                    <input
                      ref={fileInput}
                      type="file"
                      className="sr-only"
                      accept={ACCEPTED_FILE_TYPES.join(',')}
                      onChange={(e) => takeFile(e.target.files?.[0] || null)}
                    />
                    {file ? (
                      <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="w-5 h-5 text-[hsl(var(--primary))] shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        <Button type="button" variant="ghost" size="icon" aria-label="Remove file"
                          onClick={() => setFile(null)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragging(false);
                          takeFile(e.dataTransfer.files?.[0] || null);
                        }}
                        className={`w-full border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
                          dragging
                            ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5'
                            : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]/40'
                        }`}
                      >
                        <div className="bg-[hsl(var(--card))] w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 border border-[hsl(var(--border))]">
                          <UploadCloud className="w-6 h-6 text-[hsl(var(--primary))]" />
                        </div>
                        <p className="text-sm font-medium mb-1">Click to upload, or drop a file here</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          PDF, Word, Excel, PNG or JPEG, up to 50 MB
                        </p>
                      </button>
                    )}
                    <FieldError>{errors.file}</FieldError>
                  </>
                ) : (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    File storage is not set up for this project, so the document
                    can be registered but its file cannot be attached yet. It can
                    be added as a revision once an administrator creates the
                    storage bucket.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="panel-elevation">
              <CardHeader><CardTitle className="text-lg">Control</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="confidentiality">Confidentiality</Label>
                  <Select id="confidentiality" value={form.confidentiality}
                    onChange={set('confidentiality')} options={CONFIDENTIALITY_LEVELS}
                    placeholder="Select" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="review_period_months">Review period (months)</Label>
                  <Input id="review_period_months" type="number" min={1} max={120}
                    value={form.review_period_months} onChange={set('review_period_months')} />
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    The review date is worked out from this and the issue date
                    when the document is published, so it cannot be typed once
                    and forgotten.
                  </p>
                  <FieldError>{errors.review_period_months}</FieldError>
                </div>
                <div className="bg-[hsl(var(--secondary))]/40 p-3 rounded-lg border border-[hsl(var(--border))] flex gap-3 items-start">
                  <AlertCircle className="w-4 h-4 text-[hsl(var(--warning))] mt-0.5 shrink-0" />
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Classification is recorded on the document and shown on every
                    view of it. It does not by itself restrict who can open the
                    file; access follows your organization membership.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="panel-elevation">
              <CardHeader><CardTitle className="text-lg">Review</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Needed for Submit for review. A draft can be sent for review
                  later from its page.
                </p>
                <ReviewRequestFields value={review} onChange={setReview}
                  members={members} membersError={membersError} userId={user?.id} idPrefix="new-review" />
                <FieldError>{errors.review}</FieldError>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3">
              <Button className="w-full" onClick={() => handleSubmit(true)} disabled={saving}>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {saving ? 'Registering...' : 'Submit for review'}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => handleSubmit(false)} disabled={saving}>
                Save as draft
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => navigate(`${BASE}/library`)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DocControlShell>
  );
}
