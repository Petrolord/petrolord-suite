import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, X } from 'lucide-react';
import { REVIEW_ROLES } from '../utils/documentPayload';

export const EMPTY_REVIEW = Object.freeze({
  reviewers: [{ reviewer_id: '', role: REVIEW_ROLES[0] }],
  dueDate: '',
});

const memberLabel = (m, userId) => {
  const name = m.full_name || m.email || 'Unnamed member';
  const withEmail = m.full_name && m.email ? `${name} (${m.email})` : name;
  return m.user_id === userId ? `${withEmail}, you` : withEmail;
};

/**
 * AS13 — who reviews a revision, and by when.
 *
 * This is the control the app never had. The Approvals page read
 * doc_workflows and said "Revisions appear here when a reviewer is
 * assigned to them", and there was nowhere to assign one. Each reviewer
 * named here becomes a Pending review task in that queue.
 */
export const ReviewRequestFields = ({
  value, onChange, members = [], membersError, userId, idPrefix = 'review',
}) => {
  const setReviewer = (idx, patch) => onChange({
    ...value,
    reviewers: value.reviewers.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
  });
  const addReviewer = () => onChange({
    ...value, reviewers: [...value.reviewers, { reviewer_id: '', role: REVIEW_ROLES[0] }],
  });
  const removeReviewer = (idx) => onChange({
    ...value, reviewers: value.reviewers.filter((_, i) => i !== idx),
  });

  if (membersError) {
    return (
      <p className="text-sm text-[hsl(var(--destructive))]">
        The members of this organization could not be loaded, so no reviewer can be chosen: {membersError}
      </p>
    );
  }
  if (!members.length) {
    return (
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        This organization has no active members to choose a reviewer from.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <datalist id={`${idPrefix}-roles`}>
        {REVIEW_ROLES.map((r) => <option key={r} value={r} />)}
      </datalist>
      {value.reviewers.map((r, idx) => (
        <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-2 items-end">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-reviewer-${idx}`}>Reviewer</Label>
            <select
              id={`${idPrefix}-reviewer-${idx}`}
              value={r.reviewer_id}
              onChange={(e) => setReviewer(idx, { reviewer_id: e.target.value })}
              className="flex h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
            >
              <option value="">Choose a member</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{memberLabel(m, userId)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-role-${idx}`}>Role</Label>
            <Input id={`${idPrefix}-role-${idx}`} list={`${idPrefix}-roles`} value={r.role}
              onChange={(e) => setReviewer(idx, { role: e.target.value })} />
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Remove reviewer"
            disabled={value.reviewers.length === 1} onClick={() => removeReviewer(idx)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Button type="button" variant="outline" size="sm" onClick={addReviewer}>
          <Plus className="w-4 h-4 mr-1" /> Add a reviewer
        </Button>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-due`}>Review due by (optional)</Label>
          <Input id={`${idPrefix}-due`} type="date" value={value.dueDate}
            onChange={(e) => onChange({ ...value, dueDate: e.target.value })} />
        </div>
      </div>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Each reviewer gets a task on the Approvals tab. Any rejection rejects the revision; it is
        approved when every reviewer has approved it.
      </p>
    </div>
  );
};

export default ReviewRequestFields;
