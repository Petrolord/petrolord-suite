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

const OrgOverview = ({ orgUsers }) => {
  const { selectedOrg } = useAdminOrg();
  const navigate = useNavigate();
  const subscription = selectedOrg?.subscription || {};

  const activeUsers = orgUsers ? orgUsers.length : 0;
  const userLimit = subscription.user_limit || 10;
  const usagePercent = Math.min(100, Math.round((activeUsers / userLimit) * 100));
  const planName = subscription.quote_details?.planName || subscription.tier || 'Free Tier';
  
  const subscribedModules = selectedOrg.subscribed_modules || [];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800 rounded-xl shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Members</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{activeUsers}</div>
            <div className="text-xs text-slate-500 mt-1">
              {activeUsers} / {userLimit} seats used ({usagePercent}%)
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 rounded-xl shadow-lg relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Current Plan</CardTitle>
            <CreditCard className="h-4 w-4 text-lime-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100 capitalize truncate">{planName}</div>
            <div className="flex justify-between items-center mt-1">
                <div className="text-xs text-slate-500 flex items-center">
                <span className={`w-2 h-2 rounded-full mr-2 ${subscription.status === 'active' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                {subscription.status || 'Active'}
                </div>
                <Button 
                    variant="link" 
                    className="text-[#D4AF37] h-auto p-0 text-xs font-bold hover:text-[#B5902B]"
                    onClick={() => navigate('/dashboard/upgrade', { state: { targetOrgId: selectedOrg.id } })}
                >
                    Upgrade
                </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 rounded-xl shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Health Status</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">Healthy</div>
            <p className="text-xs text-slate-500 mt-1">System operational</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 rounded-xl shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Est. MRR</CardTitle>
            <Activity className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{formatCurrency(subscription.amount || 0)}</div>
            <p className="text-xs text-slate-500 mt-1">Recurring revenue</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Organization Info Card */}
        <Card className="lg:col-span-2 bg-slate-900 border-slate-800 rounded-xl shadow-lg h-full">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Organization Profile</CardTitle>
            <Button size="sm" variant="outline" onClick={() => navigate(`/admin/organizations/${selectedOrg.id}/edit`)}>
              <Edit className="h-4 w-4 mr-2" /> Edit
            </Button>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Organization Name</label>
                <div className="text-base text-slate-200 font-medium mt-1">{selectedOrg.name}</div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Contact Email</label>
                <div className="text-base text-slate-200 mt-1">{selectedOrg.contact_email}</div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Phone</label>
                <div className="text-base text-slate-200 mt-1">{selectedOrg.contact_phone || 'N/A'}</div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Organization ID</label>
                <div className="text-xs font-mono text-slate-400 mt-1 bg-slate-950 p-2 rounded border border-slate-800 select-all">
                  {selectedOrg.id}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Joined On</label>
                <div className="text-base text-slate-200 mt-1 flex items-center">
                  <Calendar className="h-4 w-4 mr-2 text-slate-500" />
                  {formatDate(selectedOrg.created_at)}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Subscribed Modules</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {subscribedModules.length > 0 ? subscribedModules.map(m => (
                    <Badge key={m} variant="secondary" className="capitalize bg-slate-800 text-slate-300">
                      {m.replace('_', ' ')}
                    </Badge>
                  )) : <span className="text-sm text-slate-500">No active modules</span>}
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