import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Edit, Plus, Search, Shield, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  REGIMES,
  STATUS_SEVERITY,
  byUrgency,
  deriveStatus,
  nextActionDate,
  parseDateOnly,
} from '@/lib/complianceStatus';
import { exportToCSV } from '@/utils/exportUtils';
import { useRegulatoryCompliance } from './hooks/useRegulatoryCompliance';
import {
  ConfirmDelete,
  EmptyState,
  ErrorState,
  Loading,
  SchemaNotice,
  StatusBadge,
} from './components/SharedComponents';

const BASE = '/dashboard/apps/assurance/regulatory-compliance';
const ALL = 'All';

const showDate = (value) => {
  const d = parseDateOnly(value);
  return d ? format(d, 'd MMM yyyy') : '-';
};

/**
 * AS3 — the obligation register.
 *
 * What this page used to do: Filters, Export, Add Record, Edit and the
 * title of every row all called one handler that toasted "This feature
 * isn't implemented yet, but don't worry! You can request it in your
 * next prompt!". That string shipped to paying customers on six
 * controls in this file alone, and it names the prompt-builder this app
 * was generated in.
 *
 * Delete worked. So the only thing a user could do to their compliance
 * register from this screen was destroy a row.
 */
export default function Register() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    obligations, authorities, loading, error, hasAs3Schema, deleteObligation, refresh,
  } = useRegulatoryCompliance();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [regime, setRegime] = useState(ALL);
  const [authority, setAuthority] = useState(ALL);
  const [confirming, setConfirming] = useState(null);

  const today = new Date();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return obligations
      .filter((o) => {
        if (status !== ALL && deriveStatus(o, today) !== status) return false;
        if (regime !== ALL && (o.regime || 'Unspecified') !== regime) return false;
        if (authority !== ALL && o.authority_id !== authority) return false;
        if (!term) return true;
        return [o.title, o.facility, o.reference, o.obligation_code, o.jurisdiction]
          .some((v) => String(v || '').toLowerCase().includes(term));
      })
      .sort(byUrgency(today));
    // `today` is stable within a render; the filter is recomputed when
    // any input changes, which is the only time it can matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obligations, search, status, regime, authority]);

  const handleExport = () => {
    if (!filtered.length) {
      toast({ description: 'There is nothing to export with these filters.' });
      return;
    }
    const byId = new Map(authorities.map((a) => [a.id, a]));
    // Exports the rows on screen, with the derived status rather than
    // the cached column, so a register handed to an auditor says the
    // same thing the app does.
    exportToCSV(
      filtered.map((o) => ({
        Code: o.obligation_code || '',
        Title: o.title || '',
        Status: deriveStatus(o, today),
        Regulator: byId.get(o.authority_id)?.name || '',
        Regime: o.regime || '',
        Type: o.obligation_type || '',
        Facility: o.facility || '',
        Jurisdiction: o.jurisdiction || '',
        Reference: o.reference || '',
        Frequency: o.frequency || '',
        'Next due': o.due_date || '',
        'Permit expires': o.expiry_date || '',
        'Last filed': o.last_submitted_date || '',
        Lifecycle: o.lifecycle || '',
      })),
      // exportToCSV appends the extension itself (AS13: this passed
      // '.csv' and the file downloaded as '.csv.csv').
      `compliance-register-${format(today, 'yyyy-MM-dd')}`,
    );
  };

  const handleDelete = async (o) => {
    setConfirming(null);
    const result = await deleteObligation(o.id);
    toast(result.success
      ? { description: `${o.obligation_code || 'Obligation'} deleted.` }
      : { title: 'Not deleted', description: result.error, variant: 'destructive' });
  };

  if (loading) return <Loading label="Loading the register..." />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;

  const selectClass = 'h-10 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))]';

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 pb-24 bg-[hsl(var(--background))]">
      {!hasAs3Schema ? <SchemaNotice /> : null}

      <div className="p-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] flex flex-wrap gap-3 justify-between items-center sticky top-0 z-10">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <Input
              placeholder="Search titles, facilities, permit numbers..."
              className="pl-9 bg-[hsl(var(--background))] border-[hsl(var(--border))] focus-visible:ring-[hsl(var(--warning))] text-[hsl(var(--foreground))]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value={ALL}>All statuses</option>
            {STATUS_SEVERITY.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {hasAs3Schema ? (
            <select className={selectClass} value={regime} onChange={(e) => setRegime(e.target.value)} aria-label="Filter by regime">
              <option value={ALL}>All regimes</option>
              {REGIMES.map((r) => <option key={r} value={r}>{r}</option>)}
              <option value="Unspecified">Unspecified</option>
            </select>
          ) : null}
          <select className={selectClass} value={authority} onChange={(e) => setAuthority(e.target.value)} aria-label="Filter by regulator">
            <option value={ALL}>All regulators</option>
            {authorities.map((a) => (
              <option key={a.id} value={a.id}>{a.acronym || a.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport}
            className="bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]">
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button onClick={() => navigate(`${BASE}/new`)}
            className="bg-[hsl(var(--warning))] text-white hover:bg-[hsl(var(--warning))]/90 border-0">
            <Plus className="w-4 h-4 mr-2" /> Add obligation
          </Button>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-auto">
        {obligations.length === 0 ? (
          <EmptyState
            icon={<Shield className="w-12 h-12" />}
            title="No obligations yet"
            description="Log the permits, licences and returns this organization is held to, and this register will tell you what falls due and what has lapsed."
            action={(
              <Button onClick={() => navigate(`${BASE}/new`)}
                className="bg-[hsl(var(--warning))] text-white hover:bg-[hsl(var(--warning))]/90 border-0">
                <Plus className="w-4 h-4 mr-2" /> Add the first obligation
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
                  <th className="data-grid-th">Regulator</th>
                  <th className="data-grid-th">Regime</th>
                  <th className="data-grid-th">Facility</th>
                  <th className="data-grid-th">Next date</th>
                  <th className="data-grid-th">Status</th>
                  <th className="data-grid-th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-[hsl(var(--muted-foreground))] bg-[hsl(var(--card))]">
                      No obligations match these filters. The register holds {obligations.length}.
                    </td>
                  </tr>
                ) : filtered.map((o) => {
                  const authorityRow = authorities.find((a) => a.id === o.authority_id);
                  const next = nextActionDate(o);
                  const isExpiry = next && o.expiry_date
                    && parseDateOnly(o.expiry_date)?.getTime() === next.getTime();
                  return (
                    <tr key={o.id}
                      className="data-grid-tr group border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--secondary))]/30 cursor-pointer"
                      onClick={() => navigate(`${BASE}/${o.id}`)}>
                      <td className="data-grid-td text-[hsl(var(--muted-foreground))] font-mono text-xs">{o.obligation_code || '-'}</td>
                      <td className="data-grid-td font-semibold text-[hsl(var(--foreground))]">{o.title}</td>
                      <td className="data-grid-td text-[hsl(var(--muted-foreground))]">{authorityRow?.acronym || authorityRow?.name || '-'}</td>
                      <td className="data-grid-td text-[hsl(var(--muted-foreground))]">{o.regime || '-'}</td>
                      <td className="data-grid-td text-[hsl(var(--muted-foreground))]">{o.facility || '-'}</td>
                      <td className="data-grid-td text-[hsl(var(--foreground))]">
                        {showDate(next)}
                        {/* Which of the two dates is counting down matters:
                            a lapsing permit and a due return are not the
                            same problem. */}
                        {isExpiry ? (
                          <span className="block text-xs text-[hsl(var(--muted-foreground))]">expiry</span>
                        ) : null}
                      </td>
                      <td className="data-grid-td"><StatusBadge obligation={o} today={today} /></td>
                      <td className="data-grid-td text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                            aria-label="Edit"
                            onClick={(e) => { e.stopPropagation(); navigate(`${BASE}/${o.id}/edit`); }}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]"
                            aria-label="Delete"
                            onClick={(e) => { e.stopPropagation(); setConfirming(o); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDelete
        target={confirming}
        title="Delete this obligation?"
        description={confirming
          ? `${confirming.obligation_code || confirming.title} and every filing recorded against it will be removed. This cannot be undone.`
          : ''}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
