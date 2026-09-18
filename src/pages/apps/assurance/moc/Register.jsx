import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MOCPageShell, BASE } from './components/MOCPageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Plus, Search, Workflow } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  CHANGE_TYPES,
  RISK_LEVELS,
  STAGES,
  byUrgency,
  isExpired,
  isOverdue,
  parseDateOnly,
} from '@/lib/managementOfChange';
import { exportToCSV } from '@/utils/exportUtils';
import { ExpiryBadge, RiskBadge, StageBadge, TypeBadge } from './components/MOCBadges';
import { EmptyState, ErrorState, Loading, SchemaNotice } from './components/SharedComponents';
import { useManagementOfChange } from './hooks/useManagementOfChange';
import { NOT_YET_IN_EFFECT, expiryDisplay } from './utils/expiryDisplay';

const ALL = 'All';
const showDate = (v) => {
  const d = parseDateOnly(v);
  return d ? format(d, 'd MMM yyyy') : '-';
};

/**
 * AS6 — the change register.
 *
 * It held five hardcoded rows — MOC-2026-089 down to -077, including
 * an Emergency "Temporary pipeline clamp" at High risk — and offered
 * them as CSV, Excel AND PDF. An MOC register is the document that
 * proves a facility's changes were controlled; a PDF of five invented
 * ones, stamped with today's date, is the kind of file that ends up in
 * an audit pack.
 *
 * Its Filters button had no handler, its stage dropdown filtered
 * nothing, its Columns button did nothing, and its pagination said
 * "Showing 1 to 5 of 5" beside two permanently disabled buttons.
 */
export default function MOCRegister() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { records, loading, error, hasAs6Schema, refresh } = useManagementOfChange();

  // AS13: the shell's header search opens this page with ?q=, so what
  // was typed there is what the register is filtered by.
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  useEffect(() => {
    const q = params.get('q');
    if (q !== null) setSearch(q);
  }, [params]);
  const [stage, setStage] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [risk, setRisk] = useState(ALL);
  const [expiredOnly, setExpiredOnly] = useState(false);

  const today = new Date();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records
      .filter((m) => {
        if (stage !== ALL && m.stage !== stage) return false;
        if (type !== ALL && m.type !== type) return false;
        if (risk !== ALL && (m.risk_level || 'Unassessed') !== risk) return false;
        if (expiredOnly && !isExpired(m, today)) return false;
        if (!term) return true;
        return [m.moc_code, m.title, m.asset_id, m.department, m.category]
          .some((v) => String(v || '').toLowerCase().includes(term));
      })
      .sort(byUrgency(today));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, search, stage, type, risk, expiredOnly]);

  const handleExport = () => {
    if (!filtered.length) {
      toast({ description: 'There is nothing to export with these filters.' });
      return;
    }
    exportToCSV(filtered.map((m) => ({
      Number: m.moc_code || '',
      Title: m.title || '',
      Type: m.type || '',
      Category: m.category || '',
      Stage: m.stage || '',
      Risk: m.risk_level || '',
      Priority: m.priority || '',
      Asset: m.asset_id || '',
      Department: m.department || '',
      'Target implementation': m.target_implementation_date || '',
      'Expires': m.expiry_date || '',
      'Expiry state': expiryDisplay(m, today)?.state || '',
      Overdue: isOverdue(m, today) ? 'Yes' : 'No',
      'Open actions': (m.actions || []).filter((a) => !['Complete', 'Cancelled'].includes(a.status)).length,
    })), `moc-register-${format(today, 'yyyy-MM-dd')}`);
  };

  const selectClass = 'h-10 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm';

  if (loading) return <MOCPageShell><Loading label="Loading the change register..." /></MOCPageShell>;
  if (error) return <MOCPageShell><ErrorState error={error} onRetry={refresh} /></MOCPageShell>;

  return (
    <MOCPageShell title="MOC Register" description="Every change this organization has raised">
      <div className="h-full flex flex-col space-y-4 pb-20 md:pb-0 animate-in fade-in duration-300">
        {!hasAs6Schema ? <SchemaNotice /> : null}

        <div className="flex flex-col lg:flex-row justify-between gap-4 bg-[hsl(var(--card))] p-4 rounded-xl border border-[hsl(var(--border))] shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <Input placeholder="Search number, title, asset..." className="pl-9"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className={selectClass} value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Filter by stage">
              <option value={ALL}>All stages</option>
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={selectClass} value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
              <option value={ALL}>All types</option>
              {CHANGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className={selectClass} value={risk} onChange={(e) => setRisk(e.target.value)} aria-label="Filter by risk">
              <option value={ALL}>All risk levels</option>
              {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
              <option value="Unassessed">Unassessed</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
              <input type="checkbox" checked={expiredOnly} onChange={(e) => setExpiredOnly(e.target.checked)} />
              Expired only
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
            <Button onClick={() => navigate(`${BASE}/new`)}>
              <Plus className="w-4 h-4 mr-2" /> New change
            </Button>
          </div>
        </div>

        {records.length === 0 ? (
          <EmptyState
            icon={<Workflow className="w-12 h-12" />}
            title="No changes raised yet"
            description="Raise a change request and this register will hold it through screening, review, approval and implementation, and tell you when a temporary change is past its expiry."
            action={(
              <Button onClick={() => navigate(`${BASE}/new`)}>
                <Plus className="w-4 h-4 mr-2" /> Raise the first change
              </Button>
            )}
          />
        ) : (
          <div className="data-grid-container flex-1 overflow-hidden flex flex-col">
            <div className="overflow-x-auto flex-1">
              <table className="data-grid-table w-full">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="data-grid-th">MOC number</th>
                    <th className="data-grid-th">Title</th>
                    <th className="data-grid-th">Type</th>
                    <th className="data-grid-th">Stage</th>
                    <th className="data-grid-th">Risk</th>
                    <th className="data-grid-th">Asset</th>
                    <th className="data-grid-th">Target</th>
                    <th className="data-grid-th">Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-[hsl(var(--muted-foreground))] bg-[hsl(var(--card))]">
                        No changes match these filters. The register holds {records.length}.
                      </td>
                    </tr>
                  ) : filtered.map((m) => (
                    <tr key={m.id} className="data-grid-tr cursor-pointer hover:bg-[hsl(var(--secondary))]/30"
                      onClick={() => navigate(`${BASE}/${m.id}`)}>
                      <td className="data-grid-td font-medium text-[hsl(var(--primary))] font-mono text-xs">{m.moc_code}</td>
                      <td className="data-grid-td max-w-[300px] truncate font-semibold">{m.title}</td>
                      <td className="data-grid-td"><TypeBadge type={m.type} /></td>
                      <td className="data-grid-td"><StageBadge stage={m.stage} /></td>
                      <td className="data-grid-td"><RiskBadge risk={m.risk_level} /></td>
                      <td className="data-grid-td text-xs text-[hsl(var(--muted-foreground))]">{m.asset_id || '-'}</td>
                      <td className="data-grid-td text-xs">
                        <span className={isOverdue(m, today) ? 'text-[hsl(var(--destructive))] font-medium' : ''}>
                          {showDate(m.target_implementation_date)}
                        </span>
                      </td>
                      <td className="data-grid-td">
                        <div className="flex flex-col gap-1">
                          {expiryDisplay(m, today)?.state !== NOT_YET_IN_EFFECT ? (
                            <span className="text-xs">{showDate(m.expiry_date)}</span>
                          ) : null}
                          <ExpiryBadge moc={m} today={today} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-[hsl(var(--border))] p-3 flex items-center justify-between bg-[hsl(var(--card))]">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                Showing {filtered.length} of {records.length} change{records.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        )}
      </div>
    </MOCPageShell>
  );
}
