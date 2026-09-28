import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2, CheckCircle, XCircle, ArrowRight, RefreshCw, Home, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { PublicPage } from '@/components/public/PublicPage';

const PaymentVerification = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const reference = searchParams.get('reference') || searchParams.get('trxref');
  const quoteIdParam = searchParams.get('quote_id');
  // Stripe redirects back with ?provider=stripe&session_id=...; Paystack uses ?reference=.
  const provider = searchParams.get('provider');
  const sessionId = searchParams.get('session_id');
  const isStripe = provider === 'stripe' && !!sessionId;
  const txnKey = reference || sessionId; // unified transaction identity
  const providerLabel = isStripe ? 'Stripe' : 'Paystack';

  // Task 9: Browser state persistence
  const getInitialState = () => {
      const saved = localStorage.getItem('payment_verification_state');
      if (saved) {
          const parsed = JSON.parse(saved);
          // Only restore if the transaction matches
          if (parsed.reference === txnKey) {
              return parsed.status;
          }
      }
      return 'verifying';
  };

  const [status, setStatus] = useState(getInitialState()); // verifying, success, error, pending
  const [message, setMessage] = useState(`Verifying your payment with ${providerLabel}...`);
  const [errorDetails, setErrorDetails] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  
  // Polling control
  const pollingRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const maxPollingDuration = 120000; // 2 minutes

  useEffect(() => {
    // Save state on change
    if (txnKey) {
        localStorage.setItem('payment_verification_state', JSON.stringify({ reference: txnKey, status }));
    }
  }, [status, txnKey]);

  useEffect(() => {
    if (!txnKey) {
      setStatus('error');
      setMessage('No transaction reference found in the URL. Please check your payment confirmation email.');
      return;
    }

    if (status === 'success') return; // Stop if already success

    // Start verification immediately
    verifyPayment();

    // Task 9: Polling Logic
    pollingRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        
        if (elapsed > maxPollingDuration) {
            clearInterval(pollingRef.current);
            if (status !== 'success') {
                setStatus('error');
                setMessage('Verification timed out. Your payment might still be processing.');
                setErrorDetails('Please check your dashboard or contact support.');
            }
        } else if (status === 'verifying' || status === 'pending') {
            verifyPayment();
        }
    }, 5000); // Poll every 5s

    return () => {
        if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [txnKey, retryCount]); // Dependency on retryCount allows manual retry to restart flow

  const verifyPayment = async () => {
    try {
      console.log("Verifying payment:", { provider, reference, sessionId, quoteIdParam });

      const { data, error } = isStripe
        ? await supabase.functions.invoke('verify-stripe-payment', {
            body: { session_id: sessionId, quote_id: quoteIdParam }
          })
        : await supabase.functions.invoke('verify-paystack-payment', {
            body: { reference, quote_id: quoteIdParam }
          });

      if (error) {
          console.warn("Network error during verification:", error);
          // Don't set error status immediately on network fail, allow polling to continue unless max retries reached
          // Only set error if we want to stop polling
          return; 
      }

      if (data) {
          if (data.success) {
            setStatus('success');
            setMessage('Payment successfully verified! Your subscription is now active and modules are unlocked.');
            toast({ title: "Payment Verified", description: "Welcome to Petrolord Suite!", className: "bg-green-600 text-white" });
            if (pollingRef.current) clearInterval(pollingRef.current);
            localStorage.removeItem('payment_verification_state'); // Clear state on success
          } else if (data.status === 'failed' || data.status === 'abandoned' || data.status === 'amount_mismatch') {
            setStatus('error');
            setMessage(data.message || 'Payment verification failed.');
            setErrorDetails(data.status === 'amount_mismatch'
              ? 'The amount paid did not match the quote. Our team will reconcile this.'
              : 'The transaction was not successful.');
            if (pollingRef.current) clearInterval(pollingRef.current);
          } else {
             // Pending or other status
             setMessage(`Payment status: ${data.status}. Retrying...`);
          }
      } 
    } catch (err) {
      console.error("Verification logic failed:", err);
      // Keep polling on logic error usually, but maybe show warning
    }
  };

  const handleManualRetry = () => {
      setStatus('verifying');
      setMessage('Retrying verification manually...');
      setErrorDetails('');
      startTimeRef.current = Date.now(); // Reset timeout timer
      setRetryCount(prev => prev + 1);
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
      <Card className="w-full max-w-md rounded-2xl bg-pl-raised shadow-pl-lg relative overflow-hidden">
        <CardHeader className="text-center pb-2">
          <CardTitle className="font-pl-display text-3xl font-semibold text-pl-text">Payment Verification</CardTitle>
          <CardDescription>Reference: <span className="font-pl-mono text-xs bg-pl-sunken text-pl-text px-1 rounded">{txnKey}</span></CardDescription>
        </CardHeader>
        
        <CardContent className="flex flex-col items-center text-center space-y-8 pt-6">
          
          {(status === 'verifying' || status === 'pending') && (
            <div className="flex flex-col items-center animate-in fade-in duration-500">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-pl-sunken rounded-full"></div>
                <div className="w-20 h-20 border-4 border-t-pl-primary border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                <Loader2 className="w-8 h-8 text-pl-primary-text absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse" />
              </div>
              <p className="text-pl-text mt-6 text-lg font-medium">{message}</p>
              <p className="text-pl-muted text-sm mt-2">Checking payment status...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center animate-in zoom-in duration-300">
              <div className="w-20 h-20 bg-pl-success-bg rounded-full flex items-center justify-center mb-4 ring-4 ring-pl-success/10">
                <CheckCircle className="w-10 h-10 text-pl-success" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-semibold text-pl-success-text mb-2">Activation Complete</h3>
              <p className="text-pl-muted mb-8 max-w-xs">{message}</p>
              
              <div className="grid gap-3 w-full">
                <Button className="w-full h-12 text-base font-semibold" onClick={() => navigate('/dashboard/subscriptions')}>
                  Go to Subscription Dashboard <ArrowRight className="w-4 h-4 ml-2"/>
                </Button>
                <Button variant="outline" className="w-full" onClick={() => navigate('/dashboard/modules')}>
                  View Unlocked Apps
                </Button>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center animate-in zoom-in duration-300 w-full">
              <div className="w-20 h-20 bg-pl-danger-bg rounded-full flex items-center justify-center mb-4 ring-4 ring-pl-danger/10">
                <XCircle className="w-10 h-10 text-pl-danger" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-semibold text-pl-danger-text mb-2">Verification Failed</h3>
              <p className="text-pl-text mb-2 max-w-xs font-medium">{message}</p>
              
              {errorDetails && (
                <div className="bg-pl-danger-bg border border-pl-danger/30 p-3 rounded mb-6 text-xs text-pl-danger-text w-full max-w-xs flex items-start gap-2 text-left">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorDetails}</span>
                </div>
              )}
              
              <div className="flex flex-col gap-3 w-full">
                <Button variant="secondary" className="w-full" onClick={handleManualRetry}>
                  <RefreshCw className="w-4 h-4 mr-2"/> Retry Verification
                </Button>
                <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => navigate('/dashboard')}>
                        <Home className="w-4 h-4 mr-2"/> Dashboard
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => window.location.href = 'mailto:support@petrolord.com'}>
                        Contact Support
                    </Button>
                </div>
              </div>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
};

// Batch 7C: the page wraps itself in the public frame (light, brand bar).
const PaymentVerificationPage = () => (
  <PublicPage testId="payment-verification-theme-scope">
    <PaymentVerification />
  </PublicPage>
);

export default PaymentVerificationPage;