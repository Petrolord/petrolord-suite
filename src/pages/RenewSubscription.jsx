import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';

export default function RenewSubscription() {
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
      const { data: orgUser } = await supabase.from('organization_users').select('organization_id').eq('user_id', user.id).single();
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
          
          const { data: orgUser } = await supabase.from('organization_users').select('organization_id').eq('user_id', user.id).single();

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

  if(loading) return <div className="p-8 text-white">Loading...</div>;
  if(!moduleData) return <div className="p-8 text-white">Module not found.</div>;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg bg-slate-900 border-slate-800 text-white">
            <CardHeader>
                <div className="flex items-center gap-2 mb-2 text-slate-400 cursor-pointer hover:text-white" onClick={() => navigate('/dashboard/subscriptions')}>
                    <ArrowLeft className="w-4 h-4"/> Back
                </div>
                <CardTitle>Renew Subscription: {moduleData.module_name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="bg-slate-950 p-4 rounded border border-slate-800">
                    <p className="text-sm text-slate-400">Current Expiry</p>
                    <p className="text-xl font-mono">{new Date(moduleData.expiry_date).toLocaleDateString()}</p>
                </div>

                <div className="space-y-2">
                    <Label>Renewal Duration</Label>
                    <Select value={duration} onValueChange={setDuration}>
                        <SelectTrigger className="bg-slate-950 border-slate-700 text-white">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-white">
                            <SelectItem value="12">12 Months (Standard)</SelectItem>
                            <SelectItem value="24">24 Months (10% Discount)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex justify-between items-center py-2 border-t border-slate-800 mt-4">
                    <span>Estimated Cost</span>
                    <span className="text-xl font-bold text-green-400">$15,000.00</span>
                </div>
            </CardContent>
            <CardFooter>
                <Button className="w-full bg-green-600 hover:bg-green-700 text-white" onClick={handleRenewal} disabled={processing}>
                    {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <CheckCircle2 className="w-4 h-4 mr-2"/>}
                    Confirm & Pay
                </Button>
            </CardFooter>
        </Card>
    </div>
  );
}