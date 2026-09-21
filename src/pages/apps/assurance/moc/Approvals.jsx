import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCPageShell, BASE } from './components/MOCPageShell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, ExternalLink, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { RiskBadge, StageBadge, TypeBadge } from './components/MOCBadges';
import { EmptyState, ErrorState, Loading } from './components/SharedComponents';
import { TERMINAL_STAGES, canDecideApproval } from '@/lib/managementOfChange';
import { useManagementOfChange } from './hooks/useManagementOfChange';
import { useOrgMembers } from '../shared/useOrgMembers';

/**
 * AS6 — the approval queue, from moc_approvals.
 *
 * It was two hardcoded tasks, and clicking Approve toasted "Approval
 * recorded for MOC-2026-088" and recorded nothing. An MOC approval is
 * a named person authorising a change to a facility; falsely confirming
 * one is the most consequential lie in this module.
 *
 * One of the two rows also carried `urgent: true`, which rendered an
 * "Overdue" badge on a task that had no due date at all.
 */
export default function MOCApprovals() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    records, approvals, loading, error, userId, decideApproval, refresh,
  } = useManagementOfChange();
  const { nameOf } = useOrgMembers();

  const [mineOnly, setMineOnly] = useState(true);
  const [deciding, setDeciding] = useState(null);
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);

  const queue = useMemo(() => {
    const byId = new Map(records.map((m) => [m.id, m]));
    return approvals
      .filter((a) => a.status === 'Pending')
      .filter((a) => !mineOnly || a.approver_id === userId)
      .map((a) => ({ ...a, moc: byId.get(a.moc_id) }))
      .filter((a) => a.moc)
      // AS13: a pending gate on a Closed, Rejected or Cancelled change is
      // part of that change's record, not work waiting on anybody.
      .filter((a) => !TERMINAL_STAGES.includes(a.moc.stage))
      .sort((a, b) => (a.level ?? 1) - (b.level ?? 1));
  }, [approvals, records, mineOnly, userId]);

  const decide = async (approval, status) => {
    setSaving(true);
    const result = await decideApproval(approval, status, comments);
    setSaving(false);
    if (!result.success) {
      toast({ title: 'Not recorded', description: result.error, variant: 'destructive' });
      return;
    }
    setDeciding(null); setComments('');
    toast({ description: `${approval.moc.moc_code} ${status.toLowerCase()} at level ${approval.level ?? 1}.` });
  };

  if (loading) return <MOCPageShell><Loading label="Loading your approval queue..." /></MOCPageShell>;
  if (error) return <MOCPageShell><ErrorState error={error} onRetry={refresh} /></MOCPageShell>;

  return (
    <MOCPageShell title="Approval Queue" description="Changes waiting on an authorisation">
      <div className="max-w-5xl mx-auto w-full space-y-6 pb-20 md:pb-0 animate-in fade-in duration-300">
        <div className="flex justify-between items-center gap-4 flex-wrap">
          <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
            Requires action ({queue.length})
          </h2>
          <label className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            Assigned to me
          </label>
        </div>

        {queue.length === 0 ? (
          <EmptyState
            icon={<CheckCircle className="w-12 h-12" />}
            title={mineOnly ? 'Nothing is waiting on you' : 'Nothing is waiting on an approver'}
            description={mineOnly
              ? 'No approval gate is assigned to you. Clear the filter to see every gate in the queue.'
              : 'Changes appear here once approval gates are set on them.'}
          />
        ) : (
          <div className="space-y-4">
            {queue.map((a) => (
              <Card key={a.id} className="panel-elevation">
                <CardContent className="p-5">
                  <div className="flex flex-col md:flex-row justify-between gap-4">
                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button type="button"
                          className="text-sm font-bold text-[hsl(var(--primary))] hover:underline font-mono"
                          onClick={() => navigate(`${BASE}/${a.moc.id}`)}>
                          {a.moc.moc_code}
                        </button>
                        <TypeBadge type={a.moc.type} />
                        <RiskBadge risk={a.moc.risk_level} />
                        <StageBadge stage={a.moc.stage} />
                      </div>
                      <h3 className="text-lg font-semibold">{a.moc.title}</h3>
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">
                        Approval level {a.level ?? 1} · {a.role || 'Approver'}
                        {a.created_at ? ` · assigned ${formatDistanceToNow(new Date(a.created_at))} ago` : ''}
                      </p>
                      {a.moc.description ? (
                        <p className="text-sm line-clamp-2">{a.moc.description}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-row md:flex-col gap-2 justify-center border-t md:border-t-0 md:border-l border-[hsl(var(--border))] pt-4 md:pt-0 md:pl-6 shrink-0">
                      {deciding === a.id ? null : (
                        <>
                          {canDecideApproval(a, a.moc, userId).ok ? (
                            <Button size="sm" className="w-full"
                              onClick={() => { setDeciding(a.id); setComments(''); }}>
                              <CheckCircle className="w-4 h-4 mr-2" /> Decide
                            </Button>
                          ) : (
                            <p className="text-xs text-[hsl(var(--muted-foreground))] max-w-[12rem]">
                              Assigned to {nameOf(a.approver_id) || 'another member'}. Only they can decide it.
                            </p>
                          )}
                          <Button variant="ghost" size="sm" className="w-full"
                            onClick={() => navigate(`${BASE}/${a.moc.id}`)}>
                            <ExternalLink className="w-4 h-4 mr-2" /> Open
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {deciding === a.id ? (
                    <div className="mt-4 pt-4 border-t border-[hsl(var(--border))] space-y-3">
                      <Textarea rows={2} value={comments} onChange={(e) => setComments(e.target.value)}
                        placeholder="Comments. Required for a rejection, so the originator knows what would make the change acceptable." />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setDeciding(null)} disabled={saving}>
                          Cancel
                        </Button>
                        <Button variant="outline" size="sm" disabled={saving || !comments.trim()}
                          onClick={() => decide(a, 'Rejected')}>
                          <XCircle className="w-4 h-4 mr-2" /> Reject
                        </Button>
                        <Button size="sm" disabled={saving} onClick={() => decide(a, 'Approved')}>
                          <CheckCircle className="w-4 h-4 mr-2" /> Approve
                        </Button>
                      </div>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] text-right">
                        Approving signs level {a.level ?? 1}. The change still needs
                        every other level before it can be implemented.
                      </p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MOCPageShell>
  );
}
