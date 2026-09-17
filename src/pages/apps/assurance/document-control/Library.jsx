import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download, FileText, Plus, Search } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  CONFIDENTIALITY_LEVELS,
  DOC_STATUSES,
  byReviewUrgency,
  parseDateOnly,
  reviewState,
} from '@/lib/documentControl';
import { exportToCSV } from '@/utils/exportUtils';
import { DocControlShell, BASE } from './components/DocControlShell';
import { ConfidentialityBadge, ReviewBadge, StatusBadge } from './components/StatusBadge';
import { EmptyState, ErrorState, Loading, SchemaNotice } from './components/SharedComponents';
import { useDocumentControl } from './hooks/useDocumentControl';

const ALL = 'All';
const showDate = (v) => {
  const d = parseDateOnly(v);
  return d ? format(d, 'd MMM yyyy') : '-';
};

/**
 * AS4 — the document library.
 *
 * The page it replaces called `getDocuments()`, which threw on a failed
 * query AND on an empty result, and answered both with five invented
 * documents attributed to Sarah Jenkins, Mike Ross, Dr. Alan Grant,
 * Jessica Pearson and Louis Litt. An organization that had never
 * registered a document saw a populated controlled-document library
 * that was not its own, with no indication anywhere that it was not
 * real.
 *
 * Its Filters and Export buttons had no handlers at all: not a toast,
 * not a stub, no onClick.
 */
export default function Library() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { documents, categories, loading, error, hasAs4Schema, refresh } = useDocumentControl();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [department, setDepartment] = useState(ALL);
  const [confidentiality, setConfidentiality] = useState(ALL);

  const today = new Date();

  const departments = useMemo(
    () => [...new Set(documents.map((d) => d.department).filter(Boolean))].sort(),
    [documents],
  );
  const categoryName = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c.name]));
    return (d) => byId.get(d.category_id) || 'Uncategorised';
  }, [categories]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return documents
      .filter((d) => {
        if (status !== ALL && d.status !== status) return false;
        if (department !== ALL && d.department !== department) return false;
        if (confidentiality !== ALL && d.confidentiality !== confidentiality) return false;
        if (!term) return true;
        return [d.title, d.document_number, d.department, d.description]
          .some((v) => String(v || '').toLowerCase().includes(term));
      })
      .sort(byReviewUrgency(today));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, search, status, department, confidentiality]);

  const handleExport = () => {
    if (!filtered.length) {
      toast({ description: 'There is nothing to export with these filters.' });
      return;
    }
    exportToCSV(filtered.map((d) => ({
      Number: d.document_number || '',
      Title: d.title || '',
      Revision: d.current_revision || '',
      Status: d.status || '',
      Category: categoryName(d),
      Department: d.department || '',
      Confidentiality: d.confidentiality || '',
      Issued: d.issue_date || '',
      'Next review': d.next_review_date || '',
      'Review state': reviewState(d, today),
    })), `document-register-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  const selectClass = 'h-10 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm';

  if (loading) return <DocControlShell><Loading label="Loading the document library..." /></DocControlShell>;
  if (error) return <DocControlShell><ErrorState error={error} onRetry={refresh} /></DocControlShell>;

  return (
    <DocControlShell>
      <div className="space-y-4 animate-in fade-in duration-500">
        {!hasAs4Schema ? <SchemaNotice /> : null}

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <Input
                placeholder="Search number, title, department..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
              <option value={ALL}>All statuses</option>
              {DOC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={selectClass} value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Filter by department">
              <option value={ALL}>All departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className={selectClass} value={confidentiality} onChange={(e) => setConfidentiality(e.target.value)} aria-label="Filter by confidentiality">
              <option value={ALL}>All classifications</option>
              {CONFIDENTIALITY_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
            <Button onClick={() => navigate(`${BASE}/new`)}>
              <Plus className="w-4 h-4 mr-2" /> New document
            </Button>
          </div>
        </div>

        {documents.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-12 h-12" />}
            title="No controlled documents yet"
            description="Register the procedures, policies, manuals and drawings this organization controls, and this library will track their revisions and review dates."
            action={(
              <Button onClick={() => navigate(`${BASE}/new`)}>
                <Plus className="w-4 h-4 mr-2" /> Register the first document
              </Button>
            )}
          />
        ) : (
          <div className="data-grid-container shadow-sm">
            <table className="data-grid-table w-full">
              <thead>
                <tr>
                  <th className="data-grid-th">Number</th>
                  <th className="data-grid-th">Title</th>
                  <th className="data-grid-th">Rev</th>
                  <th className="data-grid-th">Department</th>
                  <th className="data-grid-th">Status</th>
                  <th className="data-grid-th">Classification</th>
                  <th className="data-grid-th">Next review</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-[hsl(var(--muted-foreground))] bg-[hsl(var(--card))]">
                      No documents match these filters. The library holds {documents.length}.
                    </td>
                  </tr>
                ) : filtered.map((d) => (
                  <tr key={d.id}
                    className="data-grid-tr border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--secondary))]/30 cursor-pointer"
                    onClick={() => navigate(`${BASE}/${d.id}`)}>
                    <td className="data-grid-td font-mono text-xs text-[hsl(var(--muted-foreground))]">{d.document_number}</td>
                    <td className="data-grid-td font-semibold">{d.title}</td>
                    <td className="data-grid-td text-[hsl(var(--muted-foreground))]">{d.current_revision || '-'}</td>
                    <td className="data-grid-td text-[hsl(var(--muted-foreground))]">{d.department || '-'}</td>
                    <td className="data-grid-td"><StatusBadge status={d.status} /></td>
                    <td className="data-grid-td"><ConfidentialityBadge level={d.confidentiality} /></td>
                    <td className="data-grid-td">
                      <div className="flex items-center gap-2">
                        <span>{showDate(d.next_review_date)}</span>
                        <ReviewBadge document={d} today={today} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DocControlShell>
  );
}
