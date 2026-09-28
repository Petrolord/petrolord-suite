import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminOrg } from '@/contexts/AdminOrganizationContext';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Send, ExternalLink, FileDown } from 'lucide-react';
import { formatDate } from '@/utils/adminHelpers';
import { supabase } from '@/lib/customSupabaseClient';

/**
 * Admin organisation detail, Quotes tab.
 *
 * W7F. This tab listed two made-up quotes (QT-2023-001 "Q4 Expansion",
 * QT-2023-002) for every organisation, and its New, Save and Delete
 * buttons only changed that list in the browser. It now reads the
 * organisation's rows from the quotes table (read only, the same table the
 * quote dashboard and the organisations list read), and new quotes go
 * through the Send Quote page.
 */

const moneyOf = (amount, currency) => {
  const n = Number(amount);
  if (amount === null || amount === undefined || !Number.isFinite(n)) return 'Not recorded';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency || ''}`.trim();
  }
};

// Status colour travels with the status word (Badge status variants).
const statusVariant = (status) => {
  switch (String(status || '').toUpperCase()) {
    case 'PAID':
    case 'COMPLETED':
    case 'ACCEPTED':
    case 'VERIFIED': return 'success';
    case 'PENDING':
    case 'PENDING_VERIFICATION': return 'warning';
    case 'EXPIRED':
    case 'CANCELLED':
    case 'REJECTED':
    case 'FAILED': return 'danger';
    default: return 'neutral';
  }
};

const OrgQuotes = () => {
  const { selectedOrg } = useAdminOrg();
  const orgId = selectedOrg?.id;
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!orgId) { setLoading(false); return; }
      setLoading(true);
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        setLoadError(error.message || 'Could not load quotes.');
        setQuotes([]);
      } else {
        setLoadError(null);
        setQuotes(Array.isArray(data) ? data : []);
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [orgId]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
        <div>
          <h3 className="text-lg font-semibold text-pl-text">Quote Management</h3>
          <p className="text-sm text-pl-muted">Quotes issued to this organisation.</p>
        </div>
        {orgId ? (
          <Button asChild>
            <Link to={`/admin/organizations/${orgId}/send-quote`}>
              <Send className="h-4 w-4 mr-2" aria-hidden="true" /> Send Quote
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="border border-pl-border rounded-md flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quote ID</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Valid until</TableHead>
              <TableHead>Term</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32 text-pl-muted" role="status">Loading quotes...</TableCell>
              </TableRow>
            ) : loadError ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32 text-pl-danger-text">{loadError}</TableCell>
              </TableRow>
            ) : quotes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32 text-pl-muted" data-testid="org-quotes-empty">
                  No quotes issued to this organisation yet.
                </TableCell>
              </TableRow>
            ) : (
              quotes.map((q) => {
                const ref = q.quote_id || q.quote_number || q.id;
                return (
                  <TableRow key={q.id || ref}>
                    <TableCell className="font-pl-mono text-pl-text whitespace-nowrap">{ref}</TableCell>
                    <TableCell className="text-pl-muted whitespace-nowrap">{formatDate(q.created_at)}</TableCell>
                    <TableCell className="text-pl-muted whitespace-nowrap">{formatDate(q.validity_period)}</TableCell>
                    <TableCell className="text-pl-muted whitespace-nowrap">{q.billing_term || q.billing_period || 'Not recorded'}</TableCell>
                    <TableCell className="font-pl-mono tabular-nums text-pl-text whitespace-nowrap">{moneyOf(q.total_amount, q.currency)}</TableCell>
                    <TableCell><Badge variant={statusVariant(q.status)}>{q.status || 'unknown'}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {q.quote_id ? (
                          <Button asChild variant="ghost" size="icon" title="Open quote" aria-label={`Open quote ${ref}`}>
                            <a href={`/dashboard/quote/${q.quote_id}`} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            </a>
                          </Button>
                        ) : null}
                        {q.pdf_url ? (
                          <Button asChild variant="ghost" size="icon" title="Quote PDF" aria-label={`Quote PDF ${ref}`}>
                            <a href={q.pdf_url} target="_blank" rel="noreferrer">
                              <FileDown className="h-4 w-4" aria-hidden="true" />
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default OrgQuotes;
