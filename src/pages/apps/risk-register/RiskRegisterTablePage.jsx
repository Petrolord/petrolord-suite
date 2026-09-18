import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format as formatDate } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, Search, Plus, X } from 'lucide-react';
import { useRiskRegister } from './hooks/useRiskRegister';
import { exportDataAsCSV, exportToPDF } from '@/utils/exportUtils';
import { useToast } from '@/hooks/use-toast';
import { RiskScoreBadge } from './components/RiskBadges';
import { RISK_STATUSES } from './constants';
import { RISK_BAND_NAMES } from '@/lib/riskScoring';
import { ALL, describeCellFilter, filterRisks } from './utils/registerFilter';

const BASE = '/dashboard/apps/assurance/risk-register';

/**
 * The register tab.
 *
 * AS13: the New Risk and Filter buttons had no handlers, the rows could
 * not be clicked, and a heatmap cell "drilled down" to this tab with no
 * filter at all. The filters below are real, a heatmap cell arrives as
 * one of them, and a row opens its risk.
 */
const RiskRegisterTablePage = ({ cell = null, onClearCell }) => {
  const { risks, loading, error } = useRiskRegister();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState(ALL);
  const [band, setBand] = useState(ALL);

  const filteredRisks = filterRisks(risks, { search: searchTerm, status, band, cell });

  const handleExport = (format) => {
    // Exports the rows on screen, so what is handed on says the same
    // thing the table does.
    if (!filteredRisks.length) {
      toast({ description: 'There are no risks on screen to export.' });
      return;
    }
    const filename = `Risk_Register_${formatDate(new Date(), 'yyyy-MM-dd')}`;
    if (format === 'csv') {
      exportDataAsCSV(filteredRisks, filename);
    } else {
      exportToPDF('Risk Register', filteredRisks, filename);
    }
  };

  const selectClass = 'h-9 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-sm';

  return (
    <div className="p-6 space-y-6 bg-[hsl(var(--background))] min-h-screen text-[hsl(var(--foreground))]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Risk Register</h1>
          <p className="text-[hsl(var(--muted-foreground))]">Manage and monitor project risks across the organization.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <Download className="w-4 h-4 mr-2" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>
            <Download className="w-4 h-4 mr-2" /> PDF
          </Button>
          <Button size="sm" className="bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
            onClick={() => navigate(`${BASE}/new`)}>
            <Plus className="w-4 h-4 mr-2" /> New Risk
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-[hsl(var(--card))] p-4 rounded-lg border border-[hsl(var(--border))]">
        <Search className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
        <input
          className="flex-1 min-w-[160px] bg-transparent border-none outline-none text-sm"
          placeholder="Search by title, category or code..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value={ALL}>All statuses</option>
          {RISK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={selectClass} value={band} onChange={(e) => setBand(e.target.value)} aria-label="Filter by band">
          <option value={ALL}>All bands</option>
          {RISK_BAND_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {cell ? (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5 text-sm">
          <span>Heatmap cell: {describeCellFilter(cell)}.</span>
          {onClearCell ? (
            <Button variant="ghost" size="sm" onClick={onClearCell}>
              <X className="w-4 h-4 mr-1" /> Show all
            </Button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/5 text-sm">
          <p className="font-medium">The register could not be loaded</p>
          <p className="text-[hsl(var(--muted-foreground))] mt-1">{error}</p>
        </div>
      ) : null}

      <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-[hsl(var(--border))] hover:bg-transparent">
              <TableHead className="w-[100px]">ID</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Likelihood</TableHead>
              <TableHead>Impact</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10">Loading risks...</TableCell></TableRow>
            ) : filteredRisks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-[hsl(var(--muted-foreground))] italic">
                  {risks.length ? `No risks match these filters. The register holds ${risks.length}.` : 'No risks found'}
                </TableCell>
              </TableRow>
            ) : (
              filteredRisks.map((risk) => (
                <TableRow
                  key={risk.id}
                  className="border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/50 cursor-pointer"
                  onClick={() => navigate(`${BASE}/${risk.id}`)}
                >
                  <TableCell className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{risk.risk_id}</TableCell>
                  <TableCell className="font-medium">{risk.title}</TableCell>
                  <TableCell>{risk.category}</TableCell>
                  <TableCell>{risk.likelihood}</TableCell>
                  <TableCell>{risk.impact}</TableCell>
                  <TableCell>
                    <RiskScoreBadge score={risk.risk_score} />
                  </TableCell>
                  <TableCell>{risk.status}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default RiskRegisterTablePage;
