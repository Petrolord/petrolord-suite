import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Users, CreditCard, AlertTriangle, CheckCircle, Edit, Calendar } from 'lucide-react';
import { useAdminOrg } from '@/contexts/AdminOrganizationContext';
import { formatCurrency, formatDate } from '@/utils/adminHelpers';
import UnifiedAccessConfig from './UnifiedAccessConfig';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import UpgradeSuiteButton from '@/components/UpgradeSuiteButton';
import { subscriptionRowsOf } from './OrgSubscription';

/**
 * Admin organisation detail, Overview tab.
 *
 * W8. With no subscription on record this tab used to invent one: a 10 seat
 * limit, an "Active" status and a "Free Tier" plan. It now reads the
 * subscriptions rows the detail page loaded (the same helper as the
 * Subscription tab, W7F) and says plainly when there is none.
 *
 * W9. The third KPI card was a hard-coded "Healthy / System operational" that
 * checked nothing. It now counts the active subscriptions rows OrgDetail
 * already loads, with the total on record and the organisation's created date.
 */
const OrgOverview = ({ orgUsers }) => {
  const { selectedOrg } = useAdminOrg();
  const navigate = useNavigate();
  const rows = subscriptionRowsOf(selectedOrg);
  const activeSubscriptions = rows.filter((r) => String(r.status || '').toLowerCase() === 'active').length;
  const subscription = rows.find((r) => String(r.status || '').toLowerCase() === 'active') || rows[0] || null;

  const activeUsers = orgUsers ? orgUsers.length : 0;
  const userLimit = Number(subscription?.user_limit);
  const hasUserLimit = Number.isFinite(userLimit) && userLimit > 0;
  const usagePercent = hasUserLimit ? Math.min(100, Math.round((activeUsers / userLimit) * 100)) : null;
  const planName = subscription ? (subscription.quote_details?.planName || subscription.tier || 'Plan not recorded') : 'No subscription';
  const status = subscription?.status || null;
  const amount = Number(subscription?.amount);
  const hasAmount = subscription?.amount !== null && subscription?.amount !== undefined && Number.isFinite(amount);

  const subscribedModules = selectedOrg.subscribed_modules || [];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-pl-muted">Total Members</CardTitle>
            <Users className="h-4 w-4 text-pl-muted" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-pl-text">{activeUsers}</div>
            <div className="text-xs text-pl-muted mt-1" data-testid="org-overview-seats">
              {hasUserLimit
                ? `${activeUsers} / ${userLimit} seats used (${usagePercent}%)`
                : subscription ? 'No seat limit recorded' : 'No subscription sets a seat limit'}
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-pl-muted">Current Plan</CardTitle>
            <CreditCard className="h-4 w-4 text-pl-muted" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div
              className={subscription ? 'text-2xl font-bold text-pl-text capitalize truncate' : 'text-2xl font-bold text-pl-muted truncate'}
              data-testid="org-overview-plan"
            >
              {planName}
            </div>
            <div className="flex justify-between items-center mt-1">
                <div className="text-xs text-pl-muted flex items-center" data-testid="org-overview-status">
                {status ? (
                  <>
                    <span className={`w-2 h-2 rounded-full mr-2 ${String(status).toLowerCase() === 'active' ? 'bg-pl-success' : 'bg-pl-warning'}`}></span>
                    {status}
                  </>
                ) : (subscription ? 'Status not recorded' : 'None on record')}
                </div>
                <Button 
                    variant="link" 
                    className="text-pl-accent-text h-auto p-0 text-xs font-bold hover:text-pl-text"
                    onClick={() => navigate('/dashboard/upgrade', { state: { targetOrgId: selectedOrg.id } })}
                >
                    Upgrade
                </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-pl-muted">Active Subscriptions</CardTitle>
            <CheckCircle className="h-4 w-4 text-pl-muted" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-pl-text" data-testid="org-overview-active-subs">{activeSubscriptions}</div>
            <p className="text-xs text-pl-muted mt-1" data-testid="org-overview-subs-detail">
              {rows.length === 1 ? '1 subscription on record' : `${rows.length} subscriptions on record`}
              {selectedOrg.created_at ? `. Created ${formatDate(selectedOrg.created_at)}` : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-pl-muted">Est. MRR</CardTitle>
            <Activity className="h-4 w-4 text-pl-muted" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className={hasAmount ? 'text-2xl font-bold text-pl-text' : 'text-2xl font-bold text-pl-muted'} data-testid="org-overview-mrr">
              {hasAmount ? formatCurrency(amount) : 'Not recorded'}
            </div>
            <p className="text-xs text-pl-muted mt-1">{subscription ? 'Recurring revenue' : 'No subscription on record'}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Organization Info Card */}
        <Card className="lg:col-span-2 h-full">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Organization Profile</CardTitle>
            <Button size="sm" variant="outline" onClick={() => navigate(`/admin/organizations/${selectedOrg.id}/edit`)}>
              <Edit className="h-4 w-4 mr-2" /> Edit
            </Button>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-pl-muted uppercase">Organization Name</label>
                <div className="text-base text-pl-text font-medium mt-1">{selectedOrg.name}</div>
              </div>
              <div>
                <label className="text-xs font-bold text-pl-muted uppercase">Contact Email</label>
                <div className="text-base text-pl-text mt-1">{selectedOrg.contact_email}</div>
              </div>
              <div>
                <label className="text-xs font-bold text-pl-muted uppercase">Phone</label>
                <div className="text-base text-pl-text mt-1">{selectedOrg.contact_phone || 'N/A'}</div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-pl-muted uppercase">Organization ID</label>
                <div className="text-xs font-pl-mono text-pl-muted mt-1 bg-pl-sunken p-2 rounded border border-pl-border select-all break-all">
                  {selectedOrg.id}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-pl-muted uppercase">Joined On</label>
                <div className="text-base text-pl-text mt-1 flex items-center">
                  <Calendar className="h-4 w-4 mr-2 text-pl-muted" aria-hidden="true" />
                  {formatDate(selectedOrg.created_at)}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-pl-muted uppercase">Subscribed Modules</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {subscribedModules.length > 0 ? subscribedModules.map(m => (
                    <Badge key={m} variant="neutral" className="capitalize">
                      {m.replace('_', ' ')}
                    </Badge>
                  )) : <span className="text-sm text-pl-muted">No active modules</span>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Unified Access Config */}
        <div className="lg:col-span-1 h-full">
          <UnifiedAccessConfig />
        </div>
      </div>
    </div>
  );
};

export default OrgOverview;