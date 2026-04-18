import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Send, Calculator } from 'lucide-react';

const OrgSendQuote = () => {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [org, setOrg] = useState(null);

  // Quote Form State
  const [quoteData, setQuoteData] = useState({
    user_count: 5,
    app_count: 3,
    deployment: 'cloud', // cloud, hybrid, premise
    support: 'standard', // standard, priority, 24/7
    duration: 12, // months
    notes: '',
    discount: 0 // percentage
  });

  // Calculated Pricing
  const [pricing, setPricing] = useState({
    base: 0,
    users: 0,
    apps: 0,
    support: 0,
    subtotal: 0,
    discountAmount: 0,
    total: 0
  });

  useEffect(() => {
    fetchOrg();
  }, [orgId]);

  useEffect(() => {
    calculatePrice();
  }, [quoteData]);

  const fetchOrg = async () => {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('name, contact_email')
        .eq('id', orgId)
        .single();
      if (error) throw error;
      setOrg(data);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load org data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const calculatePrice = () => {
    // Basic Pricing Model (Example)
    const BASE_CLOUD = 500;
    const BASE_HYBRID = 1500;
    const BASE_PREMISE = 5000;
    
    const COST_PER_USER = 50;
    const COST_PER_APP = 100;
    
    const SUPPORT_MULTIPLIER = {
      'standard': 1,
      'priority': 1.2,
      '24/7': 1.5
    };

    let basePrice = 0;
    if (quoteData.deployment === 'cloud') basePrice = BASE_CLOUD;
    if (quoteData.deployment === 'hybrid') basePrice = BASE_HYBRID;
    if (quoteData.deployment === 'premise') basePrice = BASE_PREMISE;

    const userCost = quoteData.user_count * COST_PER_USER;
    const appCost = quoteData.app_count * COST_PER_APP;
    
    let monthlySubtotal = (basePrice + userCost + appCost) * SUPPORT_MULTIPLIER[quoteData.support];
    let totalContractValue = monthlySubtotal * quoteData.duration;

    const discountVal = totalContractValue * (quoteData.discount / 100);
    const finalTotal = totalContractValue - discountVal;

    setPricing({
      base: basePrice,
      users: userCost,
      apps: appCost,
      monthly: monthlySubtotal,
      subtotal: totalContractValue,
      discountAmount: discountVal,
      total: finalTotal
    });
  };

  const handleSendQuote = async () => {
    if (!org?.contact_email) {
      toast({ title: "Error", description: "Organization has no contact email.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
        // 1. Call Edge Function
        // The edge function handles DB insertion and Email sending
        const { data, error } = await supabase.functions.invoke('send-quote', {
            body: {
                organization_id: orgId,
                org_name: org.name,
                email: org.contact_email,
                quote_details: quoteData,
                pricing: pricing
            }
        });

        if (error) throw error;
        
        if (data && !data.success) {
            throw new Error(data.message || "Failed to send quote");
        }

        toast({ 
            title: "Quote Sent!", 
            description: `Quote for ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(pricing.total)} has been sent to ${org.contact_email}.`,
            className: "bg-green-600 text-white"
        });
        
        navigate(`/admin/organizations/${orgId}`);

    } catch (error) {
        console.error("Send Quote Error:", error);
        toast({ title: "Error Sending Quote", description: error.message, variant: "destructive" });
    } finally {
        setSending(false);
    }
  };

  if (loading) return <div className="p-8 text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link to="/admin/organizations" className="hover:text-white transition-colors">Organizations</Link>
            <span>/</span>
            <Link to={`/admin/organizations/${orgId}`} className="hover:text-white transition-colors">{org?.name}</Link>
            <span>/</span>
            <span className="text-white font-medium">Send Quote</span>
          </div>
          <div className="flex justify-between items-center">
            <Button variant="ghost" className="text-slate-400 hover:text-white pl-0" onClick={() => navigate(`/admin/organizations/${orgId}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Cancel
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Form Column */}
            <div className="lg:col-span-2 space-y-6">
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white">Quote Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-slate-300">User Licenses</Label>
                                <Input 
                                    type="number" 
                                    min="1"
                                    value={quoteData.user_count}
                                    onChange={(e) => setQuoteData({...quoteData, user_count: parseInt(e.target.value) || 0})}
                                    className="bg-slate-950 border-slate-700"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-slate-300">Active Apps</Label>
                                <Input 
                                    type="number" 
                                    min="1"
                                    value={quoteData.app_count}
                                    onChange={(e) => setQuoteData({...quoteData, app_count: parseInt(e.target.value) || 0})}
                                    className="bg-slate-950 border-slate-700"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-slate-300">Deployment</Label>
                                <Select value={quoteData.deployment} onValueChange={(val) => setQuoteData({...quoteData, deployment: val})}>
                                    <SelectTrigger className="bg-slate-950 border-slate-700">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                                        <SelectItem value="cloud">Cloud (SaaS)</SelectItem>
                                        <SelectItem value="hybrid">Hybrid</SelectItem>
                                        <SelectItem value="premise">On-Premise</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-slate-300">Support Level</Label>
                                <Select value={quoteData.support} onValueChange={(val) => setQuoteData({...quoteData, support: val})}>
                                    <SelectTrigger className="bg-slate-950 border-slate-700">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                                        <SelectItem value="standard">Standard (Email)</SelectItem>
                                        <SelectItem value="priority">Priority (24h)</SelectItem>
                                        <SelectItem value="24/7">24/7 Dedicated</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-slate-300">Duration (Months)</Label>
                                <Input 
                                    type="number" 
                                    min="1"
                                    value={quoteData.duration}
                                    onChange={(e) => setQuoteData({...quoteData, duration: parseInt(e.target.value) || 0})}
                                    className="bg-slate-950 border-slate-700"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-slate-300">Discount (%)</Label>
                                <Input 
                                    type="number" 
                                    min="0"
                                    max="100"
                                    value={quoteData.discount}
                                    onChange={(e) => setQuoteData({...quoteData, discount: parseFloat(e.target.value) || 0})}
                                    className="bg-slate-950 border-slate-700"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-slate-300">Notes / Custom Terms</Label>
                            <Textarea 
                                value={quoteData.notes}
                                onChange={(e) => setQuoteData({...quoteData, notes: e.target.value})}
                                className="bg-slate-950 border-slate-700 min-h-[100px]"
                                placeholder="Enter any specific terms or notes for this quote..."
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Summary Column */}
            <div className="space-y-6">
                <Card className="bg-[#1e293b] border-[#FCD34D]/20 shadow-2xl sticky top-8">
                    <CardHeader className="bg-[#FCD34D]/10 border-b border-[#FCD34D]/10">
                        <CardTitle className="text-[#FCD34D] flex items-center gap-2">
                            <Calculator className="w-5 h-5"/> Estimated Cost
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between text-slate-400">
                                <span>Monthly Base</span>
                                <span>${pricing.monthly.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>Duration</span>
                                <span>{quoteData.duration} Months</span>
                            </div>
                            <div className="flex justify-between text-white font-medium pt-2 border-t border-slate-700">
                                <span>Subtotal</span>
                                <span>${pricing.subtotal.toFixed(2)}</span>
                            </div>
                            {pricing.discountAmount > 0 && (
                                <div className="flex justify-between text-green-400">
                                    <span>Discount ({quoteData.discount}%)</span>
                                    <span>-${pricing.discountAmount.toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                        
                        <div className="pt-4 border-t border-slate-700">
                            <div className="flex justify-between items-end">
                                <span className="text-lg font-bold text-white">Total</span>
                                <span className="text-3xl font-bold text-[#FCD34D]">
                                    ${pricing.total.toFixed(2)}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 text-right mt-1">USD (Excl. Tax)</p>
                        </div>

                        <Button 
                            className="w-full bg-[#FCD34D] hover:bg-[#fbbf24] text-slate-900 font-bold mt-4" 
                            size="lg"
                            onClick={handleSendQuote}
                            disabled={sending}
                        >
                            {sending ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5 mr-2"/>}
                            Generate & Send Quote
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
      </div>
    </div>
  );
};

export default OrgSendQuote;