import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Send, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PRIORITIES, toDateOnlyString } from '@/lib/peerReview';
import { PeerReviewShell, BASE } from './components/PeerReviewShell';
import { ErrorState, Loading, SchemaNotice } from './components/SharedComponents';
import { usePeerReview } from './hooks/usePeerReview';
import { validateReview } from './utils/reviewPayload';
import { formRosterRefusal } from './utils/segregation';
import { PersonField } from '../shared/PersonField';
import { useOrgMembers } from '../shared/useOrgMembers';

const REVIEW_TYPES = [
  'Field Development Plan',
  'Reserves Audit',
  'Well Design',
  'Seismic Interpretation',
  'Reservoir Model',
  'Economic Evaluation',
  'Facilities Design',
  'Technical Note',
  'Other',
];

const DISCIPLINES = [
  'Multidisciplinary', 'Geoscience', 'Reservoir', 'Drilling',
  'Completion', 'Facilities', 'Production', 'Economics', 'HSE',
];

const ROLES = ['Coordinator', 'Lead Reviewer', 'Reviewer', 'Author', 'Approver', 'Observer'];

const EMPTY = {
  title: '',
  review_type: '',
  project_asset: '',
  department: '',
  discipline: 'Multidisciplinary',
  priority: 'Medium',
  due_date: '',
  scope_description: '',
};

const Select = ({ id, value, onChange, options, placeholder }) => (
  <select id={id} value={value ?? ''} onChange={onChange}
    className="flex h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm">
    <option value="">{placeholder}</option>
    {options.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);

const FieldError = ({ children }) => (children ? (
  <p className="text-xs text-[hsl(var(--destructive))] mt-1">{children}</p>
) : null);

/**
 * AS5 — raise a review, with a roster that is actually stored.
 *
 * The page it replaces called `saveReview()`, which pushed onto a
 * module-level array and returned the object. It then toasted "Review
 * initiated" and navigated to the register, where the new review would
 * appear until the next reload and then be gone, with no error.
 *
 * Its "Attachments" panel was a dashed box that toasted "Upload dialog
 * opening..." and opened nothing. Attachments are not rebuilt here: a
 * reviewed deliverable is a controlled document and AS4 just built
 * that, so linking the two belongs to AS11 rather than growing a second
 * document store in this app. The panel is gone rather than left
 * lying about what it does.
 */
export default function NewReview() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { loading, error, hasAs5Schema, createReview, refresh } = usePeerReview();

  const [form, setForm] = useState(EMPTY);
  const { members, userId } = useOrgMembers();
  // ASC-0 (D1): the author of the work under review, a Suite member (sets
  // peer_reviews.author_id) or a typed name. Nobody on the roster who
  // wrote the work may review it.
  const [author, setAuthor] = useState({ id: null, name: '' });
  const [roster, setRoster] = useState([{ user_id: null, display_name: '', role: 'Lead Reviewer', discipline: '' }]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState(null);

  const set = (field) => (e) => {
    const value = e?.target ? e.target.value : e;
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((p) => (p[field] ? { ...p, [field]: undefined } : p));
  };

  const setRow = (i, field) => (e) => {
    const value = e.target.value;
    setRoster((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  const setPerson = (i) => ({ id, name }) => {
    setRoster((rows) => rows.map((r, idx) => (idx === i
      ? { ...r, user_id: id, display_name: name || '' } : r)));
  };

  const named = (r) => r.user_id || String(r.display_name || '').trim();
  const independence = useMemo(() => formRosterRefusal(author, roster), [author, roster]);

  const handleSubmit = async (submitForReview) => {
    setFailure(null);
    const found = validateReview(form);
    if (Object.keys(found).length) { setErrors(found); return; }
    if (independence) { setFailure(independence); return; }

    // The author is on the roster under the Author role, so the review
    // shows who wrote the work even when they have no Suite account.
    const authorName = String(author.name || '').trim();
    const rows = roster.filter(named);
    const withAuthor = (author.id || authorName)
      ? [{ user_id: author.id, display_name: authorName, role: 'Author', discipline: '' }, ...rows]
      : rows;

    setSaving(true);
    const result = await createReview(
      {
        ...form,
        author_id: author.id || null,
        stage: submitForReview ? 'In Review' : 'Draft',
        decision: 'Pending',
      },
      withAuthor,
    );
    setSaving(false);

    if (!result.success) { setFailure(result.error); return; }
    toast({
      title: result.warning ? 'Raised, with a caveat' : 'Review raised',
      description: result.warning
        || `${result.data.review_code} ${submitForReview ? 'is now in review' : 'saved as a draft'}.`,
      variant: result.warning ? 'destructive' : undefined,
    });
    navigate(`${BASE}/${result.data.id}`);
  };

  if (loading) return <PeerReviewShell><Loading /></PeerReviewShell>;
  if (error) return <PeerReviewShell><ErrorState error={error} onRetry={refresh} /></PeerReviewShell>;

  return (
    <PeerReviewShell>
      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-12">
        {!hasAs5Schema ? <SchemaNotice /> : null}

        <div className="border-b border-[hsl(var(--border))] pb-4">
          <h2 className="text-2xl font-bold">Raise a technical review</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            The review code is issued in sequence by the database, per year.
          </p>
        </div>

        {failure ? (
          <div className="p-4 rounded-lg border border-[hsl(var(--destructive))]/30 bg-[hsl(var(--destructive))]/5 text-sm">
            <p className="font-medium">The review was not raised</p>
            <p className="text-[hsl(var(--muted-foreground))] mt-1">{failure}</p>
          </div>
        ) : null}

        <Card className="panel-elevation">
          <CardHeader><CardTitle className="text-lg">What is being reviewed</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={form.title} onChange={set('title')}
                placeholder="FDP review, Alpha Field phase 2" />
              <FieldError>{errors.title}</FieldError>
            </div>
            <div>
              <Label htmlFor="review_type">Review type</Label>
              <Select id="review_type" value={form.review_type} onChange={set('review_type')}
                options={REVIEW_TYPES} placeholder="Select a type" />
              <FieldError>{errors.review_type}</FieldError>
            </div>
            <div>
              <Label htmlFor="project_asset">Project or asset</Label>
              <Input id="project_asset" value={form.project_asset} onChange={set('project_asset')}
                placeholder="Alpha Field" />
              <FieldError>{errors.project_asset}</FieldError>
            </div>
            <div>
              <Label htmlFor="department">Department</Label>
              <Input id="department" value={form.department} onChange={set('department')}
                placeholder="Development" />
            </div>
            <div>
              <Label htmlFor="discipline">Discipline</Label>
              <Select id="discipline" value={form.discipline} onChange={set('discipline')}
                options={DISCIPLINES} placeholder="Select" />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="scope_description">Scope</Label>
              <Textarea id="scope_description" rows={3} value={form.scope_description}
                onChange={set('scope_description')}
                placeholder="What the reviewers are being asked to examine, and what is out of scope." />
            </div>
          </CardContent>
        </Card>

        <Card className="panel-elevation">
          <CardHeader><CardTitle className="text-lg">Schedule</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label htmlFor="due_date">Target completion</Label>
              <Input id="due_date" type="date" value={form.due_date} onChange={set('due_date')}
                min={toDateOnlyString(new Date())} />
              <FieldError>{errors.due_date}</FieldError>
            </div>
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select id="priority" value={form.priority} onChange={set('priority')}
                options={PRIORITIES} placeholder="Select" />
            </div>
          </CardContent>
        </Card>

        <Card className="panel-elevation">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Review team</CardTitle>
            <Button type="button" variant="outline" size="sm"
              onClick={() => setRoster((r) => [...r, { user_id: null, display_name: '', role: 'Reviewer', discipline: '' }])}>
              <Plus className="w-4 h-4 mr-2" /> Add a person
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <PersonField
              id="author"
              label="Author of the work under review"
              members={members}
              userId={userId}
              personId={author.id}
              name={author.name}
              onChange={setAuthor}
              namePlaceholder="Who wrote the work"
              hint="The author responds to comments. They cannot review the work, verify, reject or withdraw a comment on it."
            />
            {roster.map((row, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_180px_1fr_40px] gap-3 items-end">
                <PersonField
                  id={`name-${i}`}
                  label={i === 0 ? 'Name' : `Person ${i + 1}`}
                  labelClassName={i === 0 ? 'text-sm font-medium' : 'sr-only'}
                  members={members}
                  userId={userId}
                  personId={row.user_id}
                  name={row.display_name}
                  onChange={setPerson(i)}
                  namePlaceholder="Who holds this role"
                />
                <div>
                  {i === 0 ? <Label htmlFor={`role-${i}`}>Role</Label> : null}
                  <Select id={`role-${i}`} value={row.role} onChange={setRow(i, 'role')}
                    options={ROLES} placeholder="Role" />
                </div>
                <div>
                  {i === 0 ? <Label htmlFor={`disc-${i}`}>Discipline</Label> : null}
                  <Input id={`disc-${i}`} value={row.discipline}
                    onChange={setRow(i, 'discipline')} placeholder="Optional" />
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove"
                  onClick={() => setRoster((r) => r.filter((_, idx) => idx !== i))}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Rows without a person are ignored. Pick a Suite member, or type the
              name of somebody without an account. The first Lead Reviewer with a
              Suite account is recorded as the lead reviewer.
            </p>
            {independence ? (
              <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{independence}</p>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={() => navigate(`${BASE}/register`)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleSubmit(false)} disabled={saving || Boolean(independence)}>
            Save as draft
          </Button>
          <Button onClick={() => handleSubmit(true)} disabled={saving || Boolean(independence)}>
            <Send className="w-4 h-4 mr-2" />
            {saving ? 'Raising...' : 'Raise and start the review'}
          </Button>
        </div>
      </div>
    </PeerReviewShell>
  );
}
