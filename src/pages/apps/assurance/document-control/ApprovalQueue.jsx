import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, CheckSquare, Search, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { daysUntil, parseDateOnly } from '@/lib/documentControl';
import { DocControlShell, BASE } from './components/DocControlShell';
import { StatusBadge } from './components/StatusBadge';
import { EmptyState, ErrorState, Loading } from './components/SharedComponents';
import { useDocumentControl } from './hooks/useDocumentControl';

const showDate = (v) => {
  const d = parseDateOnly(v);
  return d ? format(d, 'd MMM yyyy') : 'No due date';
};

/**
 * AS4 — the approval queue, from `doc_workflows`.
 *
 * It used to call `getApprovals()`, which never queried anything and
 * returned two hardcoded rows: "Chemical Handling Safety Policy" from
 * Mike Ross and "Subsea Manifold Schematic V2" from Dr. Alan Grant,
 * both due in March 2024. Every organization, every time.
 *
 * Approving or rejecting toasted "Action 'approve' requested for task
 * a1. Not fully implemented." So a reviewer could not record a decision
 * on a controlled document, which is the entire purpose of the page.
 *
 * `doc_workflows` was in the database the whole time, carrying exactly
 * what this page needs: revision, reviewer, role, status, due date and
 * comments.
 */
export default function ApprovalQueue() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { approvals, loading, error, decideWorkflow, refresh } = useDocumentControl();

  const [search, setSearch] = useState('');
  const [mineOnly, setMineOnly] = useState(true);
  const [deciding, setDeciding] = useState(null);
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);

  const pending = useMemo(() => {
    const term = search.trim().toLowerCase();
    return approvals
      .filter((a) => a.status === 'Pending')
      .filter((a) => !mineOnly || a.reviewer_id === user?.id)
      .filter((a) => !term
        || [a.document.title, a.document.document_number, a.role]
          .some((v) => String(v || '').toLowerCase().includes(term)))
      .sort((a, b) => {
        const da = parseDateOnly(a.due_date);
        const db = parseDateOnly(b.due_date);
        if (da && db) return da - db;
        if (da) return -1;
        if (db) return 1;
        return 0;
      });
  }, [approvals, search, mineOnly, user?.id]);

  const decide = async (workflow, decision) => {
    setSaving(true);
    const result = await decideWorkflow(workflow, decision, comments);
    setSaving(false);
    if (result.success) {
      toast({ description: `${workflow.document.document_number} ${decision.toLowerCase()}.` });
      setDeciding(null);
      setComments('');
    } else {
      toast({ title: 'The decision was not recorded', description: result.error, variant: 'destructive' });
    }
  };

  if (loading) return <DocControlShell><Loading label="Loading the approval queue..." /></DocControlShell>;
  if (error) return <DocControlShell><ErrorState error={error} onRetry={refresh} /></DocControlShell>;

  return (
    <DocControlShell>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[hsl(var(--border))] pb-4">
          <div>
            <h2 className="text-2xl font-bold">Approval queue</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              Revisions waiting on a review decision.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
              Assigned to me
            </label>
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <Input placeholder="Search..." className="pl-9" value={search}
                onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        {pending.length === 0 ? (
          <EmptyState
            icon={<CheckSquare className="w-12 h-12" />}
            title={mineOnly ? 'Nothing is waiting on you' : 'Nothing is waiting on a reviewer'}
            description={mineOnly
              ? 'No revision is assigned to you for review. Clear the filter to see everything in the queue.'
              : 'Revisions appear here when a reviewer is assigned to them.'}
          />
        ) : (
          <div className="space-y-4">
            {pending.map((a) => {
              const days = a.due_date ? daysUntil(a.due_date) : null;
              const overdue = days !== null && days < 0;
              return (
                <Card key={a.id} className="panel-elevation">
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap mb-1">
                          <button type="button" className="font-semibold hover:underline text-left"
                            onClick={() => navigate(`${BASE}/${a.document.id}`)}>
                            {a.document.title}
                          </button>
                          <StatusBadge status={a.document.status} />
                        </div>
                        <p className="text-sm text-[hsl(var(--muted-foreground))]">
                          {a.document.document_number} rev {a.revision?.revision_number || '-'} · {a.role}
                        </p>
                        <p className={`text-sm mt-1 ${overdue ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                          Due {showDate(a.due_date)}
                          {overdue ? ` · ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue` : ''}
                        </p>
                        {a.revision?.changes_description ? (
                          <p className="text-sm mt-2">{a.revision.changes_description}</p>
                        ) : null}
                      </div>
                      {deciding === a.id ? null : (
                        <div className="flex gap-2 shrink-0">
                          <Button variant="outline" onClick={() => { setDeciding(a.id); setComments(''); }}>
                            Record a decision
                          </Button>
                        </div>
                      )}
                    </div>

                    {deciding === a.id ? (
                      <div className="mt-4 pt-4 border-t border-[hsl(var(--border))] space-y-3">
                        <Textarea rows={2} value={comments} onChange={(e) => setComments(e.target.value)}
                          placeholder="Comments. Required for a rejection, so the author knows what to change." />
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button variant="ghost" onClick={() => setDeciding(null)} disabled={saving}>Cancel</Button>
                          <Button variant="outline" disabled={saving || !comments.trim()}
                            onClick={() => decide(a, 'Rejected')}>
                            <XCircle className="w-4 h-4 mr-2" /> Reject
                          </Button>
                          <Button disabled={saving} onClick={() => decide(a, 'Approved')}>
                            <CheckCircle className="w-4 h-4 mr-2" /> Approve
                          </Button>
                        </div>
                        {!comments.trim() ? (
                          <p className="text-xs text-[hsl(var(--muted-foreground))] text-right">
                            A rejection needs a comment. An approval does not.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DocControlShell>
  );
}
