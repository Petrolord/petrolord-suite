import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, FileWarning, Search, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { exportToCSV } from '@/utils/exportUtils';
import {
  FINDING_STATUSES,
  FINDING_TYPES,
  findingAgeDays,
  findingByAttention,
  isActionOpen,
  isFindingOpen,
  isFindingOverdue,
} from '@/lib/auditManagement';
import { AuditShell, BASE } from './components/AuditShell';
import {
  EmptyState, ErrorState, Loading, MetricTile, SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import {
  FindingStatusBadge, FindingTypeBadge, StopWorkBadge,
} from './components/AuditBadges';
import { useAuditManagement } from './hooks/useAuditManagement';

/**
 * AS10 — the findings register.
 *
 * Findings are raised from an audit, on the answer that failed, rather
 * than typed into this page: that link is what the report gate checks.
 * This register is where they are worked to closure.
 */
export default function Findings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    findings, audits, loading, error, refresh, hasAs10Schema, deleteFinding,
  } = useAuditManagement();

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [stopWorkOnly, setStopWorkOnly] = useState(false);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const today = new Date();

  const auditById = useMemo(() => new Map(audits.map((a) => [a.id, a])), [audits]);

  const rows = useMemo(() => findings
    .filter((f) => {
      if (typeFilter && f.finding_type !== typeFilter) return false;
      if (statusFilter && f.status !== statusFilter) return false;
      if (stopWorkOnly && !f.stop_work) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return [f.finding_code, f.title, f.description, f.department, f.site, f.owner_name]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    })
    .sort(findingByAttention(today)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [findings, query, typeFilter, statusFilter, stopWorkOnly]);

  const remove = async (f) => {
    setFailure(null);
    setBusy(true);
    const result = await deleteFinding(f.id);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({ description: `${f.finding_code} deleted.` });
  };

  const exportRegister = () => {
    if (!rows.length) {
      toast({ description: 'There is nothing to export.' });
      return;
    }
    exportToCSV(rows.map((f) => ({
      Finding: f.finding_code || '',
      Title: f.title || '',
      Type: f.finding_type || '',
      'Work stopped': f.stop_work ? 'Yes' : 'No',
      Status: f.status || '',
      Audit: auditById.get(f.audit_id)?.audit_code || '',
      Site: f.site || '',
      Department: f.department || '',
      Owner: f.owner_name || '',
      Raised: f.raised_date || '',
      Due: f.due_date || '',
      Overdue: isFindingOverdue(f, today) ? 'Yes' : 'No',
      'Age (days)': findingAgeDays(f, today) ?? '',
      Correction: f.correction || '',
      'Root cause': f.root_cause || '',
      Actions: (f.actions || []).length,
      'Actions open': (f.actions || []).filter(isActionOpen).length,
      Closed: f.closed_date || '',
    })), `audit-findings-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  if (loading) return <AuditShell title="Findings"><Loading /></AuditShell>;
  if (error) {
    return <AuditShell title="Findings"><ErrorState error={error} onRetry={refresh} /></AuditShell>;
  }
  if (!hasAs10Schema) return <AuditShell title="Findings"><SchemaNotice /></AuditShell>;

  const selectClass = 'h-10 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm';
  const stopWorkOpen = findings.filter((f) => f.stop_work && isFindingOpen(f)).length;

  return (
    <AuditShell
      title="Findings"
      description="Raised from an audit, carried to closure"
      actions={(
        <Button variant="outline" onClick={exportRegister}>
          <Download className="w-4 h-4 mr-2" /> Export (CSV)
        </Button>
      )}
    >
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <WriteFailure error={failure} />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricTile label="Findings" value={findings.length} />
          <MetricTile
            label="Open" value={findings.filter(isFindingOpen).length} token="--warning" />
          <MetricTile
            label="Work stopped, still open" value={stopWorkOpen}
            token={stopWorkOpen ? '--destructive' : '--success'}
          />
          <MetricTile
            label="Overdue"
            value={findings.filter((f) => isFindingOverdue(f, today)).length}
            token="--destructive"
          />
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 space-y-3">
            <CardTitle className="text-lg">
              {rows.length} of {findings.length} finding{findings.length === 1 ? '' : 's'}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search finding, site, owner" className="pl-9 w-64" />
              </div>
              <select className={selectClass} value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">Every type</option>
                {FINDING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className={selectClass} value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Every status</option>
                {FINDING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm px-2">
                <input type="checkbox" checked={stopWorkOnly}
                  onChange={(e) => setStopWorkOnly(e.target.checked)} />
                Work stopped only
              </label>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <EmptyState
                icon={<FileWarning className="w-12 h-12" />}
                title={findings.length ? 'Nothing matches those filters' : 'No findings raised'}
                description={findings.length
                  ? 'Clear the filters to see the rest of the register.'
                  : 'Findings are raised from an audit, against the checklist answer that failed, so the audit knows they exist.'}
                action={findings.length ? null : (
                  <Button onClick={() => navigate(`${BASE}/audits`)}>Go to the audits</Button>
                )}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-grid-table w-full">
                  <thead>
                    <tr>
                      <th className="data-grid-th">Finding</th>
                      <th className="data-grid-th">Title</th>
                      <th className="data-grid-th">Type</th>
                      <th className="data-grid-th">Audit</th>
                      <th className="data-grid-th">Owner</th>
                      <th className="data-grid-th">Due</th>
                      <th className="data-grid-th">Actions</th>
                      <th className="data-grid-th">Status</th>
                      <th className="data-grid-th" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((f) => (
                      <tr key={f.id}
                        className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--secondary))]/50"
                        onClick={() => navigate(`${BASE}/findings/${f.id}`)}>
                        <td className="data-grid-td font-mono text-xs">{f.finding_code}</td>
                        <td className="data-grid-td">
                          {f.title}
                          <span className="ml-2"><StopWorkBadge finding={f} /></span>
                        </td>
                        <td className="data-grid-td"><FindingTypeBadge type={f.finding_type} /></td>
                        <td className="data-grid-td font-mono text-xs">
                          {auditById.get(f.audit_id)?.audit_code || ''}
                        </td>
                        <td className="data-grid-td text-xs">{f.owner_name || 'Unassigned'}</td>
                        <td className="data-grid-td text-xs">
                          <span className={isFindingOverdue(f, today)
                            ? 'text-[hsl(var(--destructive))] font-medium' : ''}>
                            {f.due_date || 'Not set'}
                          </span>
                        </td>
                        <td className="data-grid-td text-xs">
                          {(f.actions || []).filter(isActionOpen).length} open
                          {' '}of {(f.actions || []).length}
                        </td>
                        <td className="data-grid-td"><FindingStatusBadge status={f.status} /></td>
                        <td className="data-grid-td text-right">
                          <Button size="sm" variant="ghost" disabled={busy}
                            onClick={(e) => { e.stopPropagation(); remove(f); }}
                            title="Delete this finding">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AuditShell>
  );
}
