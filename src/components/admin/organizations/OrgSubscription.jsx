import React from 'react';
import { Link } from 'react-router-dom';
import { useAdminOrg } from '@/contexts/AdminOrganizationContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CreditCard, ExternalLink, Copy, CheckCircle, Send, Users } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { formatDate } from '@/utils/adminHelpers';

/**
 * Admin organisation detail, Subscription tab.
 *
 * W7F. This tab used to invent a plan when the organisation had none
 * ("growth" tier, $1,899 a month, 10 seats), print 8 seats and 124 GB used
 * for every organisation, and list three made-up October 2023 invoices. Its
 * "Modify Plan" button wrote a `subscription` field on organizations, which
 * is not a column, so nothing it showed or saved was real. It now lists the
 * organisation's subscriptions rows as the detail page loaded them, counts
 * seats from the members the page loaded, and says so when there are no
 * rows. Plans change through a paid quote, so the plan editor is gone and
 * the tab links to Send Quote.
 */

/** The subscription rows the page loaded, whichever shape they came in. */
export const subscriptionRowsOf = (org) => {
  if (!org) return [];
  const raw = Array.isArray(org.subscriptionRows)
    ? org.subscriptionRows
    : Array.isArray(org.subscription)
      ? org.subscription
      : org.subscription ? [org.subscription] : [];
  return raw.filter((r) => r && typeof r === 'object' && Object.keys(r).length > 0);
};

const moneyOf = (amount, currency) => {
  const n = Number(amount);
  if (amount === null || amount === undefined || !Number.isFinite(n)) return 'Not recorded';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency || ''}`.trim();
  }
};

const statusVariant = (status) => {
  switch (String(status || '').toLowerCase()) {
    case 'active': return 'success';
    case 'expired':
    case 'cancelled':
    case 'canceled':
    case 'suspended': return 'danger';
    case 'pending': return 'warning';
    default: return 'neutral';
  }
};

const listOf = (v) => (Array.isArray(v) ? v : []);

const OrgSubscription = ({ memberCount }) => {
  const { selectedOrg } = useAdminOrg();
  const { toast } = useToast();
  const rows = subscriptionRowsOf(selectedOrg);
  const active = rows.find((r) => String(r.status || '').toLowerCase() === 'active');
  const seatLimit = Number(active?.user_limit);
  const hasSeatLimit = Number.isFinite(seatLimit) && seatLimit > 0;
  const subscribedModules = listOf(selectedOrg?.subscribed_modules);

  const copyLoginLink = () => {
    navigator.clipboard.writeText('https://petrolord.com/login');
    toast({ title: 'Link Copied', description: 'Unified login URL copied to clipboard.' });
  };

  return (
    <div className="space-y-6 h-full overflow-y-auto pr-2">
      <div className="flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
        <div>
          <h2 className="text-lg font-semibold text-pl-text flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-pl-muted" aria-hidden="true" /> Subscriptions
          </h2>
          <p className="text-sm text-pl-muted">Plans change through a paid quote.</p>
        </div>
        {selectedOrg?.id ? (
          <Button asChild variant="outline">
            <Link to={`/admin/organizations/${selectedOrg.id}/send-quote`}>
              <Send className="h-4 w-4 mr-2" aria-hidden="true" /> Send Quote
            </Link>
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-pl-border rounded-md p-8 text-center" data-testid="org-subscription-empty">
          <p className="text-pl-text font-medium">No subscription on record</p>
          <p className="text-sm text-pl-muted mt-1">
            This organisation has no subscriptions rows. One is created when a quote is paid and verified.
          </p>
        </div>
      ) : (
        <div className="border border-pl-border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Modules</TableHead>
                <TableHead>Term</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Seats</TableHead>
                <TableHead>Quote total</TableHead>
                <TableHead>Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => {
                const modules = listOf(r.modules).length ? listOf(r.modules) : listOf(r.quote_details?.modules);
                return (
                  <TableRow key={r.id || i}>
                    <TableCell>
                      <Badge variant={statusVariant(r.status)} className="capitalize">{r.status || 'unknown'}</Badge>
                    </TableCell>
                    <TableCell className="text-pl-text">
                      {modules.length ? modules.join(', ') : <span className="text-pl-muted">None listed</span>}
                    </TableCell>
                    <TableCell className="text-pl-muted whitespace-nowrap">{r.term || r.billing_period || r.quote_details?.billing_term || 'Not recorded'}</TableCell>
                    <TableCell className="text-pl-muted whitespace-nowrap">{r.start_date ? formatDate(r.start_date) : 'Not recorded'}</TableCell>
                    <TableCell className="text-pl-muted whitespace-nowrap">{r.end_date ? formatDate(r.end_date) : 'Not recorded'}</TableCell>
                    <TableCell className="font-pl-mono tabular-nums text-pl-text">{r.user_limit ?? r.quote_details?.seats ?? 'Not recorded'}</TableCell>
                    <TableCell className="font-pl-mono tabular-nums text-pl-text whitespace-nowrap">
                      {moneyOf(r.quote_details?.total_amount, r.quote_details?.currency)}
                    </TableCell>
                    <TableCell className="text-pl-muted">{r.payment_status || 'Not recorded'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <h3 className="text-sm font-bold text-pl-muted uppercase mb-2 flex items-center gap-2">
              <Users className="h-4 w-4" aria-hidden="true" /> Seat usage
            </h3>
            <p className="text-pl-text" data-testid="org-subscription-seats">
              {typeof memberCount === 'number' ? (
                <>
                  <span className="text-2xl font-bold font-pl-mono tabular-nums">{memberCount}</span>{' '}
                  <span className="text-sm text-pl-muted">
                    {hasSeatLimit ? `members of ${seatLimit} seats on the active subscription` : 'members; no active subscription sets a seat limit'}
                  </span>
                </>
              ) : (
                <span className="text-sm text-pl-muted">
                  {hasSeatLimit ? `${seatLimit} seats on the active subscription` : 'No active subscription sets a seat limit'}
                </span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <h3 className="text-sm font-bold text-pl-muted uppercase mb-2">Subscribed modules</h3>
            {subscribedModules.length ? (
              <div className="flex flex-wrap gap-2">
                {subscribedModules.map((m) => (
                  <Badge key={m} variant="neutral" className="capitalize">{m === 'hse_free' ? 'HSE (Free)' : m}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-pl-muted">None recorded on the organisation.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Unified Login Info */}
      <Card className="relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5 text-pl-text" aria-hidden="true">
          <ExternalLink className="h-32 w-32" />
        </div>
        <CardContent className="p-4 sm:p-6 relative z-10">
          <div className="flex justify-between items-center gap-4">
            <div>
              <h3 className="text-lg font-bold text-pl-text mb-1">Unified Login Information</h3>
              <p className="text-pl-muted text-sm mb-4">All users in this organization access both Suite and HSE platforms via a single portal.</p>
              <div className="items-center gap-2 bg-pl-sunken p-2 rounded border border-pl-border inline-flex max-w-full">
                <code className="text-sm font-pl-mono text-pl-primary-text break-all">https://petrolord.com/login</code>
                <Button variant="ghost" size="icon" className="h-6 w-6 ml-2 shrink-0" onClick={copyLoginLink} aria-label="Copy login link">
                  <Copy className="h-3 w-3" aria-hidden="true" />
                </Button>
              </div>
            </div>
            <div className="text-right hidden md:block">
              <div className="text-sm text-pl-muted mb-1">Unified Access</div>
              <div className="text-pl-success-text font-bold flex items-center justify-end gap-1">
                <CheckCircle className="h-4 w-4" aria-hidden="true" /> Active
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrgSubscription;
