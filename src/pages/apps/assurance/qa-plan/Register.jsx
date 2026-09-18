import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClipboardList, Download, Search } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { exportToCSV } from '@/utils/exportUtils';
import {
  PLAN_STATUSES, planProgress,
} from '@/lib/qualityAssurance';
import { QAPlanShell, BASE } from './components/QAPlanShell';
import { EmptyState, ErrorState, Loading, SchemaNotice } from './components/SharedComponents';
import { HoldPointBadge, PlanStatusBadge, ProgressBar } from './components/QABadges';
import { useQualityAssurance } from './hooks/useQualityAssurance';

/**
 * AS7 — the quality plan register, from this organization's own rows.
 *
 * What it replaces: a table over the six invented plans, with a search
 * box that had no `value` and no `onChange` and therefore filtered
 * nothing, and a progress bar per row driven by a `progress` number
 * written into a data file. Clicking a row navigated to
 * `/qa-plan/${plan.id}`, where the detail page read `useParams().id`
 * while the route declared `:qaPlanId` — so every row opened the same
 * plan.
 */
export default function Register() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { plans, loading, error, refresh, hasAs7Schema } = useQualityAssurance();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plans.filter((p) => {
      if (status !== 'All' && p.status !== status) return false;
      if (!q) return true;
      return [p.plan_code, p.title, p.department, p.discipline, p.project_ref,
        p.asset_id, p.contractor]
        .some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [plans, search, status]);

  const exportRegister = () => {
    if (!filtered.length) {
      toast({ description: 'There is nothing to export.' });
      return;
    }
    exportToCSV(filtered.map((p) => {
      const progress = planProgress(p.checkpoints);
      return {
        Number: p.plan_code || '',
        Title: p.title || '',
        Status: p.status || '',
        Revision: p.revision || '',
        Department: p.department || '',
        Discipline: p.discipline || '',
        Project: p.project_ref || '',
        Asset: p.asset_id || '',
        Contractor: p.contractor || '',
        'Inspection points': progress.total,
        Resolved: progress.resolved,
        Failed: progress.failed,
        'Hold points outstanding': progress.holdPointsOutstanding,
        'Open non-conformances': (p.ncrs || []).filter(
          (n) => !['Closed', 'Voided'].includes(n.status)).length,
        Start: p.start_date || '',
        End: p.end_date || '',
      };
    }), `quality-plan-register-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  if (loading) return <QAPlanShell><Loading label="Loading quality plans..." /></QAPlanShell>;
  if (error) return <QAPlanShell><ErrorState error={error} onRetry={refresh} /></QAPlanShell>;
  if (!hasAs7Schema) return <QAPlanShell><SchemaNotice /></QAPlanShell>;

  return (
    <QAPlanShell title="Quality plan register"
      description="Every quality and inspection plan this organization has recorded">
      <div className="space-y-4 animate-in fade-in duration-300">
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
          <CardContent className="p-4 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by number, title, department, project, asset or contractor"
                className="pl-9"
              />
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
            >
              <option value="All">All statuses</option>
              {PLAN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Button variant="outline" onClick={exportRegister}>
              <Download className="w-4 h-4 mr-2" /> Export (CSV)
            </Button>
          </CardContent>
        </Card>

        {plans.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="w-12 h-12" />}
            title="No quality plans yet"
            description="Create one and its inspection and test points, and it will appear here."
            action={<Button onClick={() => navigate(`${BASE}/new`)}>Create a plan</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Search className="w-12 h-12" />}
            title="No plan matches those filters"
            description={`${plans.length} plan${plans.length === 1 ? '' : 's'} in the register. Clear the search or the status filter.`}
          />
        ) : (
          <>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Showing {filtered.length} of {plans.length} plan{plans.length === 1 ? '' : 's'}.
            </p>
            <div className="border border-[hsl(var(--border))] rounded-lg overflow-x-auto bg-[hsl(var(--card))]">
              <table className="data-grid-table w-full">
                <thead>
                  <tr>
                    <th className="data-grid-th">Number</th>
                    <th className="data-grid-th">Title</th>
                    <th className="data-grid-th">Department</th>
                    <th className="data-grid-th">Inspection and test plan</th>
                    <th className="data-grid-th">Open NCRs</th>
                    <th className="data-grid-th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const progress = planProgress(p.checkpoints);
                    const openNcrs = (p.ncrs || []).filter(
                      (n) => !['Closed', 'Voided'].includes(n.status)).length;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => navigate(`${BASE}/${p.id}`)}
                        className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--secondary))]/50 cursor-pointer"
                      >
                        <td className="data-grid-td font-mono text-xs text-[hsl(var(--primary))]">
                          {p.plan_code}
                          {p.revision ? <span className="text-[hsl(var(--muted-foreground))]"> rev {p.revision}</span> : null}
                        </td>
                        <td className="data-grid-td">
                          <p className="font-medium">{p.title}</p>
                          {p.project_ref ? (
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">{p.project_ref}</p>
                          ) : null}
                        </td>
                        <td className="data-grid-td text-[hsl(var(--muted-foreground))]">
                          {p.department || p.discipline || '-'}
                        </td>
                        <td className="data-grid-td">
                          <div className="flex items-center gap-2">
                            <ProgressBar progress={progress} />
                            <HoldPointBadge progress={progress} />
                          </div>
                        </td>
                        <td className="data-grid-td">
                          {openNcrs
                            ? <span className="text-[hsl(var(--destructive))] font-medium">{openNcrs}</span>
                            : <span className="text-[hsl(var(--muted-foreground))]">0</span>}
                        </td>
                        <td className="data-grid-td"><PlanStatusBadge status={p.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </QAPlanShell>
  );
}
