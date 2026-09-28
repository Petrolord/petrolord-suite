import React, { useState } from 'react';
import { useAdminOrg } from '@/contexts/AdminOrganizationContext';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { 
  CreditCard, HardDrive, Users, Layers, Calendar, 
  AlertTriangle, CheckCircle, Settings, FileText, Download,
  ExternalLink, Copy
} from 'lucide-react';
import PricingConfigurator from './components/PricingConfigurator';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate } from '@/utils/adminHelpers';

const OrgSubscription = () => {
  const { selectedOrg, updateOrganization } = useAdminOrg();
  const { toast } = useToast();
  const [isManageOpen, setIsManageOpen] = useState(false);
  
  // Mock existing subscription if not present
  const subscription = selectedOrg?.subscription || {
    status: 'active',
    modules: ['geoscience', 'reservoir'],
    apps: [],
    user_limit: 10,
    storage_limit: 500,
    tier: 'growth',
    current_period_end: new Date(Date.now() + 86400000 * 15).toISOString(),
    amount: 1899
  };

  const subscribedModules = selectedOrg.subscribed_modules || ['hse_free'];

  const handleUpdateSubscription = async (newConfig) => {
    // In real app: Call API to update subscription, handle Stripe, etc.
    const updatedSub = {
      ...subscription,
      modules: newConfig.modules,
      apps: newConfig.apps,
      user_limit: newConfig.userCount,
      storage_limit: newConfig.storageGB,
      tier: newConfig.tierId,
      amount: newConfig.calculated.monthlyTotal
    };

    // Also update organization subscribed_modules logic if needed
    // Typically subscription drives subscribed_modules
    
    await updateOrganization(selectedOrg.id, { subscription: updatedSub });
    toast({ title: 'Subscription Updated', description: 'Changes have been applied successfully.' });
    setIsManageOpen(false);
  };

  // Initial config for the builder based on current sub
  const currentConfig = {
    modules: subscription.modules || [],
    apps: subscription.apps || [],
    userCount: subscription.user_limit || 5,
    storageGB: subscription.storage_limit || 100,
    tierId: subscription.tier || 'starter',
    customDiscount: 0 
  };

  const copyLoginLink = () => {
    navigator.clipboard.writeText('https://petrolord.com/login');
    toast({ title: 'Link Copied', description: 'Unified login URL copied to clipboard.' });
  };

  return (
    <div className="space-y-6 h-full overflow-y-auto pr-2">
      {/* Status Banner */}
      <div className="bg-pl-sunken border border-pl-border rounded-lg p-4 sm:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold text-pl-text">Current Plan</h2>
            <Badge variant={subscription.status === 'active' ? 'success' : 'warning'} className="uppercase tracking-wider text-xs">
              {subscription.status}
            </Badge>
            <Badge variant="neutral" className="capitalize">
              {subscription.tier} Tier
            </Badge>
          </div>
          <p className="text-pl-muted flex flex-wrap items-center gap-4 text-sm">
            <span className="flex items-center"><Calendar className="h-3 w-3 mr-1" /> Renews: {formatDate(subscription.current_period_end)}</span>
            <span className="flex items-center"><CreditCard className="h-3 w-3 mr-1" /> {formatCurrency(subscription.amount)}/mo</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline">Payment Method</Button>
          <Button onClick={() => setIsManageOpen(true)}>
            <Settings className="h-4 w-4 mr-2" /> Modify Plan
          </Button>
        </div>
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

      {/* Usage & Limits Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Modules */}
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Layers className="h-5 w-5 mr-2 text-pl-muted" aria-hidden="true" /> Enabled Modules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold text-pl-muted uppercase">Active Subscriptions</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {subscribedModules.map(m => (
                    <Badge key={m} variant="neutral" className="capitalize">
                      {m === 'hse_free' ? 'HSE (Free)' : m}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Users */}
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Users className="h-5 w-5 mr-2 text-pl-muted" aria-hidden="true" /> Seat Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mt-2">
              <div className="flex justify-between mb-2">
                <span className="text-2xl font-bold font-pl-mono tabular-nums text-pl-text">8</span>
                <span className="text-sm text-pl-muted pt-2">of {subscription.user_limit} seats</span>
              </div>
              <div className="h-2 w-full bg-pl-sunken rounded-full overflow-hidden">
                <div className="h-full bg-pl-primary w-[80%] rounded-full" />
              </div>
              <p className="text-xs text-pl-muted mt-3">
                2 seats remaining. Upgrade plan to add more users.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Storage */}
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <HardDrive className="h-5 w-5 mr-2 text-pl-muted" aria-hidden="true" /> Data Storage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mt-2">
              <div className="flex justify-between mb-2">
                <span className="text-2xl font-bold font-pl-mono tabular-nums text-pl-text">124<span className="text-sm font-normal text-pl-muted">GB</span></span>
                <span className="text-sm text-pl-muted pt-2">of {subscription.storage_limit} GB</span>
              </div>
              <div className="h-2 w-full bg-pl-sunken rounded-full overflow-hidden">
                <div className="h-full bg-pl-primary w-[25%] rounded-full" />
              </div>
              <p className="text-xs text-pl-muted mt-3">
                Healthy usage level.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoice History */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-pl-text flex items-center gap-2">
          <FileText className="h-5 w-5 text-pl-muted" aria-hidden="true" /> Invoice History
        </h3>
        <div className="border border-pl-border rounded-md overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-pl-sunken text-pl-muted border-b border-pl-border">
              <tr>
                <th className="p-4 font-medium">Date</th>
                <th className="p-4 font-medium">Invoice #</th>
                <th className="p-4 font-medium">Amount</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 text-right font-medium">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pl-border">
              {[1,2,3].map(i => (
                <tr key={i} className="hover:bg-pl-sunken/60 transition-colors">
                  <td className="p-4 text-pl-text whitespace-nowrap">Oct 01, 2023</td>
                  <td className="p-4 text-pl-muted font-pl-mono">INV-2023-{100+i}</td>
                  <td className="p-4 text-pl-text font-pl-mono tabular-nums">$1,899.00</td>
                  <td className="p-4"><Badge variant="success">Paid</Badge></td>
                  <td className="p-4 text-right">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Download invoice"><Download className="h-4 w-4" aria-hidden="true" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modification Dialog */}
      <Dialog open={isManageOpen} onOpenChange={setIsManageOpen}>
        <DialogContent className="max-w-[90vw] w-[1200px] h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Modify Subscription</DialogTitle>
            <DialogDescription>Update modules, add apps, or change capacity limits.</DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden py-4">
            <SubscriptionModifier 
              initialConfig={currentConfig} 
              onSave={handleUpdateSubscription}
              onCancel={() => setIsManageOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Wrapper for the configurator to handle save state
const SubscriptionModifier = ({ initialConfig, onSave, onCancel }) => {
  const [config, setConfig] = useState(initialConfig);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <PricingConfigurator 
          initialConfig={initialConfig} 
          onChange={setConfig}
        />
      </div>
      <div className="mt-auto pt-4 border-t border-pl-border flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(config)}>
          Confirm Changes
        </Button>
      </div>
    </div>
  );
};

export default OrgSubscription;