import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download, Plus, Search, Users } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  PRIORITIES,
  STAGES,
  byUrgency,
  isOverdue,
  isResolved,
  parseDateOnly,
} from '@/lib/peerReview';
import { exportToCSV } from '@/utils/exportUtils';
import { PeerReviewShell, BASE } from './components/PeerReviewShell';
import { DecisionBadge, PriorityBadge, StageBadge } from './components/StatusBadges';
import { EmptyState, ErrorState, Loading, SchemaNotice } from './components/SharedComponents';
import { usePeerReview } from './hooks/usePeerReview';

const ALL = 'All';
const showDate = (v) => {
  const d = parseDateOnly(v);
  return d ? format(d, 'd MMM yyyy') : '-';
};

/**
 * AS5 — the review register.
 *
 * It called `getReviews()`, which threw on a failed query AND on an
 * empty result and answered both with `localReviews` — the mock set.
 * Its Export button toasted "CSV file is being generated" and generated
 * nothing, and the row overflow menu toasted "More actions modal" with
 * no modal behind it.
 */
export default function ReviewRegister() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { reviews, loading, error, hasAs5Schema, refresh } = usePeerReview();

  const [search, setSearch] = useState('');
  const [stage, setStage] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [overdueOnly, setOverdueOnly] = useState(false);

  const today = new Date();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reviews
      .filter((r) => {
        if (stage !== ALL && r.stage !== stage) return false;
        if (priority !== ALL && r.priority !== priority) return false;
        if (overdueOnly && !isOverdue(r, today)) return false;
        if (!term) return true;
        return [r.title, r.review_code, r.project_asset, r.discipline, r.department]
          .some((v) => String(v || '').toLowerCase().includes(term));
      })
      .sort(byUrgency(today));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews, search, stage, priority, overdueOnly]);

  const handleExport = () => {
    if (!filtered.length) {
      toast({ description: 'There is nothing to export with these filters.' });
      return;
    }
    exportToCSV(filtered.map((r) => ({
      Code: r.review_code || '',
      Title: r.title || '',
      Type: r.review_type || '',
      'Project or asset': r.project_asset || '',
      Department: r.department || '',
      Discipline: r.discipline || '',
      Stage: r.stage || '',
      Priority: r.priority || '',
      Decision: r.decision || '',
      Due: r.due_date || '',
      Overdue: isOverdue(r, today) ? 'Yes' : 'No',
      Comments: r.comments?.length ?? 0,
      'Open comments': (r.comments || []).filter((c) => !isResolved(c)).length,
    })), `peer-review-register-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  const selectClass = 'h-10 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm';

  if (loading) return <PeerReviewShell><Loading label="Loading the review register..." /></PeerReviewShell>;
  if (error) return <PeerReviewShell><ErrorState error={error} onRetry={refresh} /></PeerReviewShell>;

  return (
    <PeerReviewShell>
      <div className="space-y-4 animate-in fade-in duration-500">
        {!hasAs5Schema ? <SchemaNotice /> : null}

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <Input placeholder="Search code, title, asset..." className="pl-9"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className={selectClass} value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Filter by stage">
              <option value={ALL}>All stages</option>
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={selectClass} value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Filter by priority">
              <option value={ALL}>All priorities</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
              <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
              Overdue only
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
            <Button onClick={() => navigate(`${BASE}/new`)}>
              <Plus className="w-4 h-4 mr-2" /> New review
            </Button>
          </div>
        </div>

        {reviews.length === 0 ? (
          <EmptyState
            icon={<Users className="w-12 h-12" />}
            title="No reviews raised yet"
            description="Raise a technical review and this register will track its stage, its comments and whether it is running late."
            action={(
              <Button onClick={() => navigate(`${BASE}/new`)}>
                <Plus className="w-4 h-4 mr-2" /> Raise the first review
              </Button>
            )}
          />
        ) : (
          <div className="data-grid-container shadow-sm">
            <table className="data-grid-table w-full">
              <thead>
                <tr>
                  <th className="data-grid-th">Code</th>
                  <th className="data-grid-th">Title</th>
                  <th className="data-grid-th">Asset</th>
                  <th className="data-grid-th">Stage</th>
                  <th className="data-grid-th">Priority</th>
                  <th className="data-grid-th">Decision</th>
                  <th className="data-grid-th">Open comments</th>
                  <th className="data-grid-th">Due</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-[hsl(var(--muted-foreground))] bg-[hsl(var(--card))]">
                      No reviews match these filters. The register holds {reviews.length}.
                    </td>
                  </tr>
                ) : filtered.map((r) => {
                  const open = (r.comments || []).filter((c) => !isResolved(c)).length;
                  const late = isOverdue(r, today);
                  return (
                    <tr key={r.id}
                      className="data-grid-tr border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--secondary))]/30 cursor-pointer"
                      onClick={() => navigate(`${BASE}/${r.id}`)}>
                      <td className="data-grid-td font-mono text-xs text-[hsl(var(--muted-foreground))]">{r.review_code}</td>
                      <td className="data-grid-td font-semibold">{r.title}</td>
                      <td className="data-grid-td text-[hsl(var(--muted-foreground))]">{r.project_asset || '-'}</td>
                      <td className="data-grid-td"><StageBadge stage={r.stage} /></td>
                      <td className="data-grid-td"><PriorityBadge priority={r.priority} /></td>
                      <td className="data-grid-td"><DecisionBadge decision={r.decision} /></td>
                      <td className="data-grid-td">{open}</td>
                      <td className="data-grid-td">
                        <span className={late ? 'text-[hsl(var(--destructive))] font-medium' : ''}>
                          {showDate(r.due_date)}
                        </span>
                        {late ? (
                          <span className="block text-xs text-[hsl(var(--destructive))]">overdue</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PeerReviewShell>
  );
}
