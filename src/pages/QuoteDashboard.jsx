import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { 
  Download, CreditCard, Building, Calendar, CheckCircle, 
  AlertCircle, Upload, FileText, Loader2, RefreshCw, ShieldCheck, Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

// Helper to format currency
const formatCurrency = (val, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val);
};

// Helper to format date
const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString();
};

const STATUS_COLORS = {
  PENDING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  PENDING_PAYMENT: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  PENDING_VERIFICATION: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  ACCEPTED: 'bg-green-500/20 text-green-400 border-green-500/50',
  ACTIVE: 'bg-green-500/20 text-green-400 border-green-500/50',
  EXPIRED: 'bg-red-500/20 text-red-400 border-red-500/50',
  REJECTED: 'bg-red-500/20 text-red-400 border-red-500/50'
};

export default function QuoteDashboard() {
  const { quoteId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [quote, setQuote] = useState(null);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [proofFile, setProofFile] = useState(null);
  const [unlockedModules, setUnlockedModules] = useState([]);
  
  // Task 5: Display real names for UUIDs
  const [appNames, setAppNames] = useState({});

  useEffect(() => {
    if (quoteId) initQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  // Load the quote, then reconcile its payment status with Paystack:
  //  - If Paystack redirected here after checkout it appends ?reference/&trxref —
  //    show a blocking "Confirming payment" screen and verify (the redirect case).
  //  - Otherwise, if the quote is still unpaid but already has a Paystack
  //    reference, silently re-check once. This catches the case where the user
  //    paid but the tab closed before the redirect, and — crucially — lets us
  //    hide the "Pay Now" link the moment we detect the payment, so it can never
  //    reopen an already-completed transaction.
  const initQuote = async () => {
    const q = await fetchQuote();
    if (!q || q.payment_verified) return;
    const params = new URLSearchParams(window.location.search);
    const redirectRef = params.get('reference') || params.get('trxref');
    const reference = redirectRef || q.paystack_reference;
    if (!reference) return;
    await runVerification(reference, { fromRedirect: !!redirectRef });
  };

  const runVerification = async (reference, { fromRedirect }) => {
    if (fromRedirect) setVerifyingPayment(true);
    else setCheckingPayment(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-paystack-payment', {
        body: { reference, quote_id: quoteId, user_id: user?.id, user_email: user?.email }
      });
      if (error) throw error;
      if (data?.success) {
        toast({ title: 'Payment Confirmed', description: 'Thank you! Your payment is verified and your subscription is now active.', className: 'bg-green-600 text-white' });
        await fetchQuote();
      } else if (fromRedirect) {
        toast({ title: 'Payment Not Yet Confirmed', description: data?.message || "If you were debited, use 'I Have Paid (Verify)' to retry, or contact support.", variant: 'destructive' });
      }
      // Silent check that comes back unpaid: stay quiet and leave Pay Now visible.
    } catch (err) {
      console.error('Payment verification error:', err);
      if (fromRedirect) {
        toast({ title: 'Verification Issue', description: err.message || 'Could not verify payment automatically. Please use the Verify button.', variant: 'destructive' });
      }
    } finally {
      if (fromRedirect) {
        // Strip the Paystack query params so a refresh doesn't re-trigger verification.
        navigate(`/dashboard/quote/${quoteId}`, { replace: true });
      }
      setVerifyingPayment(false);
      setCheckingPayment(false);
    }
  };

  // Fetch App Names
  useEffect(() => {
      const fetchAppNames = async () => {
          const { data } = await supabase.from('master_apps').select('id, app_name');
          if (data) {
              const map = {};
              data.forEach(a => map[a.id] = a.app_name);
              setAppNames(map);
          }
      };
      fetchAppNames();
  }, []);

  const fetchQuote = async () => {
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select('*, organizations(*)')
        .or(`quote_id.eq.${quoteId},quote_number.eq.${quoteId}`)
        .single();

      if (error) throw error;
      setQuote(data);
      setOrg(data.organizations);
      
      // Fetch unlocked modules if verified
      if(data.payment_verified) {
          const { data: modules } = await supabase
            .from('module_access')
            .select('*')
            .eq('organization_id', data.organization_id);
          setUnlockedModules(modules || []);
      }
      return data;
    } catch (error) {
      console.error('Error fetching quote:', error);
      toast({ title: 'Error', description: 'Could not load quote details.', variant: 'destructive' });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!quote?.pdf_url) {
       toast({ title: "PDF Not Found", description: "PDF generation might be in progress or failed." });
       return;
    }
    window.open(quote.pdf_url, '_blank');
  };

  const handleProofUpload = async () => {
    if (!proofFile) return;
    setUploading(true);
    
    try {
      const reader = new FileReader();
      reader.readAsDataURL(proofFile);
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const { error } = await supabase.functions.invoke('verify-bank-transfer', {
          body: {
            quote_id: quote.quote_id,
            user_id: user.id,
            fileBase64: base64,
            fileName: proofFile.name
          }
        });

        if (error) throw error;

        toast({ title: "Proof Uploaded", description: "Our team will verify your payment shortly." });
        setUploading(false);
        fetchQuote(); 
      };
    } catch (error) {
      console.error(error);
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
      setUploading(false);
    }
  };

  const handleVerifyPayment = async () => {
      setVerifying(true);
      try {
          const { data, error } = await supabase.functions.invoke('verify-paystack-payment', {
              body: { reference: quote.paystack_reference || quote.quote_id, quote_id: quote.quote_id, user_id: user.id, user_email: user.email }
          });
          
          if(error) throw error;
          if(data && data.success) {
              toast({ title: "Success", description: "Payment verified successfully! Modules unlocked." });
              fetchQuote();
          } else {
              throw new Error(data?.error || "Verification failed");
          }
      } catch (err) {
          console.error(err);
          toast({ title: "Verification Failed", description: err.message, variant: "destructive" });
      } finally {
          setVerifying(false);
      }
  };

  // Stripe (international, USD): create a Checkout Session on demand and redirect.
  const handleStripeCheckout = async () => {
      setStripeLoading(true);
      try {
          const { data, error } = await supabase.functions.invoke('create-stripe-checkout', {
              body: { quote_id: quote.quote_id, origin: window.location.origin }
          });
          if (error) throw error;
          if (data?.url) {
              window.location.href = data.url;
          } else {
              throw new Error(data?.error || "Could not start Stripe checkout");
          }
      } catch (err) {
          console.error(err);
          toast({ title: "Stripe checkout failed", description: err.message, variant: "destructive" });
          setStripeLoading(false);
      }
  };

  if (verifyingPayment) return (
    <div className="h-screen flex items-center justify-center bg-slate-950 text-white">
      <div className="text-center max-w-sm px-6">
        <Loader2 className="w-10 h-10 animate-spin text-lime-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-1">Confirming your payment…</h2>
        <p className="text-slate-400 text-sm">Please wait while we verify your transaction with Paystack. Don't close this tab.</p>
      </div>
    </div>
  );
  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-white"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (!quote) return <div className="h-screen flex items-center justify-center bg-slate-950 text-white">Quote Not Found</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <Button variant="ghost" onClick={() => navigate('/dashboard')} className="mb-6 text-slate-400 hover:text-white pl-0">
          &larr; Back to Dashboard
        </Button>

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">Quote Dashboard</h1>
              <Badge className={`${STATUS_COLORS[quote.status] || 'bg-slate-700'} border`}>
                  {quote.payment_verified ? 'VERIFIED & PAID' : quote.status.replace('_', ' ')}
              </Badge>
            </div>
            <p className="text-slate-400 flex items-center gap-2">
              <FileText className="w-4 h-4"/> Quote Ref: <span className="font-mono text-white">{quote.quote_number || quote.quote_id}</span>
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="border-slate-700 text-white hover:bg-slate-800" onClick={fetchQuote}>
              <RefreshCw className="w-4 h-4 mr-2"/> Refresh
            </Button>
            <Button className="bg-lime-600 hover:bg-lime-700 text-white" onClick={handleDownloadPDF} disabled={!quote.pdf_url}>
              <Download className="w-4 h-4 mr-2"/> Download PDF
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Org Info */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Building className="w-5 h-5 text-lime-400"/> Organization Details</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2 text-slate-300">
                <div className="grid grid-cols-2">
                  <span>Name:</span> <span className="text-white font-medium text-right">{org?.name}</span>
                </div>
                <div className="grid grid-cols-2">
                  <span>Email:</span> <span className="text-white font-medium text-right">{org?.contact_email}</span>
                </div>
                <div className="grid grid-cols-2">
                  <span>Generated:</span> <span className="text-white font-medium text-right">{formatDate(quote.quote_date || quote.created_at)}</span>
                </div>
                <div className="grid grid-cols-2">
                  <span>Valid Until:</span> <span className="text-white font-medium text-right">{formatDate(quote.expiry_date || quote.validity_period)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Line Items */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader><CardTitle className="text-lg">Subscription Details</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Billing Term</span>
                    <span className="capitalize font-medium text-white">{quote.billing_term}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Seats</span>
                    <span className="font-medium text-white">{quote.seats}</span>
                  </div>
                  {quote.bridge_code && (
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-slate-400">NextGen Expert Bridge</span>
                      <span className="font-medium text-green-400">
                        {quote.bridge_code} ({quote.bridge_discount_pct}% off {quote.bridge_module})
                        {quote.bridge_redeemed_at ? ' · redeemed' : ''}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-400 block mb-2">Modules & Apps</span>
                    <div className="flex flex-wrap gap-2">
                        {/* Task 6: Prioritize showing App Names, not UUIDs */}
                        {quote.selected_items && Array.isArray(quote.selected_items) ? 
                            quote.selected_items
                                .filter(i => i.type !== 'discount')
                                .map((i, idx) => (
                                    <Badge key={idx} variant="outline" className="border-slate-600 text-white bg-slate-800 hover:bg-slate-700">{i.item}</Badge>
                                )) 
                            : 
                            <>
                                {Array.isArray(quote.modules) && quote.modules.map(m => <Badge key={m} variant="outline" className="border-slate-600 text-white bg-slate-800 hover:bg-slate-700">{m}</Badge>)}
                                {Array.isArray(quote.apps) && quote.apps.map((a, idx) => {
                                    // `a` is either a UUID string (legacy quotes) or an object
                                    // { id, name, seats, module } (current generate-quote shape).
                                    const isObj = a && typeof a === 'object';
                                    const id = isObj ? a.id : a;
                                    const seats = isObj ? a.seats : undefined;
                                    // Prefer the stored name, then the master_apps lookup, then a truncated id.
                                    const displayName = (isObj && a.name)
                                        || appNames[id]
                                        || (typeof id === 'string' && id.length > 8 ? id.substring(0, 8) + '...' : id)
                                        || 'App';
                                    const seatLabel = seats ? ` · ${seats} seat${seats === 1 ? '' : 's'}` : '';
                                    return (
                                        <Badge key={id || idx} variant="outline" className="border-slate-600 text-white bg-slate-800 hover:bg-slate-700" title={typeof id === 'string' ? id : ''}>
                                            {displayName}{seatLabel}
                                        </Badge>
                                    );
                                })}
                            </>
                        }
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Unlocked Modules (If Verified) */}
            {quote.payment_verified && (
                <Card className="bg-slate-900 border-green-500/30">
                    <CardHeader><CardTitle className="text-lg flex items-center gap-2 text-green-400"><ShieldCheck className="w-5 h-5"/> Unlocked Access</CardTitle></CardHeader>
                    <CardContent>
                        {unlockedModules.length > 0 ? (
                            <div className="space-y-2">
                                {unlockedModules.map((mod) => (
                                    <div key={mod.id} className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
                                        <span className="capitalize text-white">{mod.module_id} Module</span>
                                        <Badge className="bg-green-600 text-white">Unlocked</Badge>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-slate-500 italic">No modules unlocked yet. System sync in progress.</p>
                        )}
                        <Button className="mt-4 w-full" onClick={() => navigate('/dashboard/modules')}>Manage Access</Button>
                    </CardContent>
                </Card>
            )}
          </div>

          {/* Payment / Action Sidebar */}
          <div className="space-y-6">
            <Card className="bg-gradient-to-b from-slate-900 to-slate-900 border-slate-700 shadow-xl overflow-hidden relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-lime-500"/>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>Total Due</span>
                  <span className="text-3xl font-bold text-lime-400">{formatCurrency(quote.total_amount, quote.currency || 'USD')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                
                {quote.payment_verified ? (
                  <div className="bg-green-900/20 border border-green-900 rounded-lg p-4 text-center">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2"/>
                    <h3 className="font-bold text-green-400">Payment Verified</h3>
                    <p className="text-xs text-green-300">Your subscription is active.</p>
                    <p className="text-xs text-slate-400 mt-2">Verified: {formatDate(quote.payment_verified_at)}</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {/* International card payment — Stripe, real USD */}
                      <div className="space-y-1">
                        <Button
                          onClick={handleStripeCheckout}
                          disabled={stripeLoading || checkingPayment}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 text-lg text-white"
                        >
                          {stripeLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2"/> : <CreditCard className="w-5 h-5 mr-2"/>}
                          Pay with Card (USD)
                        </Button>
                        <p className="text-xs text-center text-slate-500">International cards · Secured by Stripe</p>
                      </div>

                      <div className="relative py-1">
                        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-800"></span></div>
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-slate-900 px-2 text-slate-600">or pay in NGN</span></div>
                      </div>

                      {/* Local card payment — Paystack, NGN */}
                      {quote.paystack_link ? (
                          <div className="space-y-2">
                              {checkingPayment ? (
                                <Button disabled className="w-full bg-blue-600/60 h-12 text-lg text-white cursor-not-allowed">
                                    <Loader2 className="w-5 h-5 animate-spin mr-2"/> Checking payment status…
                                </Button>
                              ) : (
                                <a href={quote.paystack_link} target="_blank" rel="noreferrer" className="w-full block">
                                  <Button className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-lg text-white">
                                      <CreditCard className="w-5 h-5 mr-2"/> Pay with Paystack (NGN)
                                  </Button>
                                </a>
                              )}
                              <Button
                                onClick={handleVerifyPayment}
                                disabled={verifying || checkingPayment}
                                variant="outline"
                                className="w-full border-blue-500 text-blue-400 hover:bg-blue-950"
                              >
                                  {verifying ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <CheckCircle className="w-4 h-4 mr-2"/>}
                                  I Have Paid (Verify)
                              </Button>
                          </div>
                      ) : (
                          <p className="text-xs text-center text-slate-500">NGN payment link unavailable. Please contact sales.</p>
                      )}
                    </div>

                    <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-700"></span></div>
                      <div className="relative flex justify-center text-xs uppercase"><span className="bg-slate-900 px-2 text-slate-500">Or Pay via Transfer</span></div>
                    </div>

                    <div className="bg-slate-800 p-4 rounded-lg text-sm space-y-2 border border-slate-700">
                      <div className="font-semibold text-slate-300 mb-2">Bank Details:</div>
                      <div className="flex justify-between"><span className="text-slate-500">Bank</span> <span className="text-white">Providus Bank</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Account</span> <span className="text-white">1305745085</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Name</span> <span className="text-white">Lordsway Energy Tech Ltd</span></div>
                    </div>

                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full border-lime-600 text-lime-500 hover:bg-lime-900/20">
                          <Upload className="w-4 h-4 mr-2"/> Upload Payment Proof
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-slate-900 border-slate-700 text-white">
                        <DialogHeader>
                          <DialogTitle>Upload Transfer Proof</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:bg-slate-800/50 transition-colors">
                            <Input 
                              type="file" 
                              accept="image/*,.pdf" 
                              className="hidden" 
                              id="file-upload"
                              onChange={(e) => setProofFile(e.target.files[0])}
                            />
                            <label htmlFor="file-upload" className="cursor-pointer block">
                              <Upload className="w-10 h-10 text-slate-500 mx-auto mb-2"/>
                              <span className="text-slate-300 block">{proofFile ? proofFile.name : "Click to select receipt image or PDF"}</span>
                            </label>
                          </div>
                          <Button onClick={handleProofUpload} disabled={!proofFile || uploading} className="w-full bg-lime-600 hover:bg-lime-700 text-white">
                            {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : null}
                            Submit for Verification
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </>
                )}

              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}