import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { getUserOrgRow } from '@/lib/orgContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AccountScope } from '@/components/account/accountChrome';

function RenewSubscriptionPage() {
  const { moduleId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [moduleData, setModuleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [duration, setDuration] = useState('12');

  useEffect(() => {
      if(user) fetchModule();
  }, [user, moduleId]);

  const fetchModule = async () => {
      const orgUser = await getUserOrgRow(user.id);
      if(orgUser) {
          const { data } = await supabase.from('purchased_modules')
            .select('*')
            .eq('organization_id', orgUser.organization_id)
            .eq('module_id', moduleId)
            .single();
          setModuleData(data);
      }
      setLoading(false);
  };

  const handleRenewal = async () => {
      setProcessing(true);
      try {
          // Simulate Payment Process
          // In real app, this would open Paystack modal
          await new Promise(r => setTimeout(r, 1500)); 
          
          const orgUser = await getUserOrgRow(user.id);

          const { error } = await supabase.functions.invoke('renew-subscription', {
              body: {
                  module_id: moduleId,
                  organization_id: orgUser.organization_id,
                  duration_months: parseInt(duration),
                  payment_reference: `REF-${Date.now()}` // Mock ref
              }
          });

          if(error) throw error;

          toast({ title: "Success", description: "Subscription renewed successfully!", className: "bg-green-600 text-white" });
          navigate('/dashboard/subscriptions');

      } catch (e) {
          toast({ title: "Failed", description: e.message, variant: "destructive" });
      } finally {
          setProcessing(false);
      }
  };

  if(loading) return <div className="p-8 text-pl-muted">Loading...</div>;
  if(!moduleData) return <div className="p-8 text-pl-muted">Module not found.</div>;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
            <CardHeader>
                <div className="flex items-center justify-between gap-2 mb-2">
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-md text-sm text-pl-muted hover:text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus"
                        onClick={() => navigate('/dashboard/subscriptions')}
                    >
                        <ArrowLeft className="w-4 h-4" aria-hidden="true"/> Back
                    </button>
                    <ThemeToggle />
                </div>
                <CardTitle>Renew Subscription: {moduleData.module_name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="bg-pl-sunken p-4 rounded-md border border-pl-border">
                    <p className="text-sm text-pl-muted">Current Expiry</p>
                    <p className="text-xl font-pl-mono tabular-nums text-pl-text">{new Date(moduleData.expiry_date).toLocaleDateString()}</p>
                </div>

                <div className="space-y-2">
                    <Label>Renewal Duration</Label>
                    <Select value={duration} onValueChange={setDuration}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="12">12 Months (Standard)</SelectItem>
                            <SelectItem value="24">24 Months (10% Discount)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex justify-between items-center py-2 border-t border-pl-border mt-4 text-pl-text">
                    <span>Estimated Cost</span>
                    <span className="text-xl font-bold font-pl-mono tabular-nums">$15,000.00</span>
                </div>
            </CardContent>
            <CardFooter>
                <Button className="w-full" onClick={handleRenewal} disabled={processing}>
                    {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <CheckCircle2 className="w-4 h-4 mr-2"/>}
                    Confirm & Pay
                </Button>
            </CardFooter>
        </Card>
    </div>
  );
}

// Design system rollout batch 1E: the page wraps itself in <ThemedApp>.
export default function RenewSubscription() {
  return (
    <AccountScope testId="renew-subscription-theme-scope">
      <RenewSubscriptionPage />
    </AccountScope>
  );
}
