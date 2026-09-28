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
import { Loader2, Send, Calculator } from 'lucide-react';
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

const OrgSendQuotePage = () => {
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
            description: `Quote for ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(pricing.total)} has been sent to ${org.contact_email}.`
        });
        
        navigate(`/admin/organizations/${orgId}`);

    } catch (error) {
        console.error("Send Quote Error:", error);
        toast({ title: "Error Sending Quote", description: error.message, variant: "destructive" });
    } finally {
        setSending(false);
    }
  };

  if (loading) return <div className="p-8 text-pl-muted" role="status">Loading...</div>;

  const inputCls = 'font-pl-mono tabular-nums';

  return (
    <AccountPage width="max-w-5xl">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-pl-muted">
          <Link to="/admin/organizations" className="hover:text-pl-text transition-colors">Organizations</Link>
          <span aria-hidden="true">/</span>
          <Link to={`/admin/organizations/${orgId}`} className="hover:text-pl-text transition-colors">{org?.name}</Link>
          <span aria-hidden="true">/</span>
          <span className="text-pl-text font-medium">Send Quote</span>
        </nav>

        <AccountHeader
          eyebrow="Platform admin"
          icon={Send}
          title="Send Quote"
          description={org?.contact_email ? `To ${org.contact_email}` : undefined}
          backTo={`/admin/organizations/${orgId}`}
          backLabel="Cancel and go back"
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* Form Column */}
            <div className="lg:col-span-2 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Quote Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="sq-users">User Licenses</Label>
                                <Input 
                                    id="sq-users"
                                    type="number" 
                                    min="1"
                                    value={quoteData.user_count}
                                    onChange={(e) => setQuoteData({...quoteData, user_count: parseInt(e.target.value) || 0})}
                                    className={inputCls}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="sq-apps">Active Apps</Label>
                                <Input 
                                    id="sq-apps"
                                    type="number" 
                                    min="1"
                                    value={quoteData.app_count}
                                    onChange={(e) => setQuoteData({...quoteData, app_count: parseInt(e.target.value) || 0})}
                                    className={inputCls}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>Deployment</Label>
                                <Select value={quoteData.deployment} onValueChange={(val) => setQuoteData({...quoteData, deployment: val})}>
                                    <SelectTrigger aria-label="Deployment">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cloud">Cloud (SaaS)</SelectItem>
                                        <SelectItem value="hybrid">Hybrid</SelectItem>
                                        <SelectItem value="premise">On-Premise</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Support Level</Label>
                                <Select value={quoteData.support} onValueChange={(val) => setQuoteData({...quoteData, support: val})}>
                                    <SelectTrigger aria-label="Support Level">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="standard">Standard (Email)</SelectItem>
                                        <SelectItem value="priority">Priority (24h)</SelectItem>
                                        <SelectItem value="24/7">24/7 Dedicated</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="sq-duration">Duration (Months)</Label>
                                <Input 
                                    id="sq-duration"
                                    type="number" 
                                    min="1"
                                    value={quoteData.duration}
                                    onChange={(e) => setQuoteData({...quoteData, duration: parseInt(e.target.value) || 0})}
                                    className={inputCls}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="sq-discount">Discount (%)</Label>
                                <Input 
                                    id="sq-discount"
                                    type="number" 
                                    min="0"
                                    max="100"
                                    value={quoteData.discount}
                                    onChange={(e) => setQuoteData({...quoteData, discount: parseFloat(e.target.value) || 0})}
                                    className={inputCls}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="sq-notes">Notes / Custom Terms</Label>
                            <Textarea 
                                id="sq-notes"
                                value={quoteData.notes}
                                onChange={(e) => setQuoteData({...quoteData, notes: e.target.value})}
                                className="min-h-[100px]"
                                placeholder="Enter any specific terms or notes for this quote..."
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Summary Column */}
            <div className="space-y-6">
                <Card className="shadow-pl-md lg:sticky lg:top-8 overflow-hidden">
                    <CardHeader className="bg-pl-sunken border-b border-pl-border">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Calculator className="w-5 h-5 text-pl-muted" aria-hidden="true"/> Estimated Cost
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between text-pl-muted">
                                <span>Monthly Base</span>
                                <span className="font-pl-mono tabular-nums">${pricing.monthly.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-pl-muted">
                                <span>Duration</span>
                                <span className="font-pl-mono tabular-nums">{quoteData.duration} Months</span>
                            </div>
                            <div className="flex justify-between text-pl-text font-medium pt-2 border-t border-pl-border">
                                <span>Subtotal</span>
                                <span className="font-pl-mono tabular-nums">${pricing.subtotal.toFixed(2)}</span>
                            </div>
                            {pricing.discountAmount > 0 && (
                                <div className="flex justify-between text-pl-text">
                                    <span>Discount ({quoteData.discount}%)</span>
                                    <span className="font-pl-mono tabular-nums">-${pricing.discountAmount.toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                        
                        <div className="pt-4 border-t border-pl-border">
                            <div className="flex justify-between items-end gap-2">
                                <span className="text-lg font-bold text-pl-text">Total</span>
                                <span className="text-3xl font-bold font-pl-mono tabular-nums text-pl-text">
                                    ${pricing.total.toFixed(2)}
                                </span>
                            </div>
                            <p className="text-xs text-pl-muted text-right mt-1">USD (Excl. Tax)</p>
                        </div>

                        <Button 
                            variant="accent"
                            className="w-full font-bold mt-4" 
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
    </AccountPage>
  );
};

export default function OrgSendQuote() {
  return (
    <AccountScope testId="org-send-quote-theme-scope">
      <OrgSendQuotePage />
    </AccountScope>
  );
}
