import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2, CheckCircle, XCircle, ArrowRight, RefreshCw, Home, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

const PaymentVerification = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const reference = searchParams.get('reference') || searchParams.get('trxref');
  const quoteIdParam = searchParams.get('quote_id'); 
  
  // Task 9: Browser state persistence
  const getInitialState = () => {
      const saved = localStorage.getItem('payment_verification_state');
      if (saved) {
          const parsed = JSON.parse(saved);
          // Only restore if reference matches
          if (parsed.reference === reference) {
              return parsed.status;
          }
      }
      return 'verifying';
  };

  const [status, setStatus] = useState(getInitialState()); // verifying, success, error, pending
  const [message, setMessage] = useState('Verifying your payment with Paystack...');
  const [errorDetails, setErrorDetails] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  
  // Polling control
  const pollingRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const maxPollingDuration = 120000; // 2 minutes

  useEffect(() => {
    // Save state on change
    if (reference) {
        localStorage.setItem('payment_verification_state', JSON.stringify({ reference, status }));
    }
  }, [status, reference]);

  useEffect(() => {
    if (!reference) {
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
  }, [reference, retryCount]); // Dependency on retryCount allows manual retry to restart flow

  const verifyPayment = async () => {
    try {
      console.log("Verifying payment:", { reference, quoteIdParam });
      
      const { data, error } = await supabase.functions.invoke('verify-paystack-payment', {
        body: { 
            reference, 
            quote_id: quoteIdParam
        }
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
          } else if (data.status === 'failed' || data.status === 'abandoned') {
            setStatus('error');
            setMessage(data.message || 'Payment verification failed.');
            setErrorDetails('The transaction was not successful.');
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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl relative overflow-hidden">
        {/* Decorative background blur */}
        <div className="absolute top-[-50px] right-[-50px] w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-50px] left-[-50px] w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <CardHeader className="text-center pb-2">
          <CardTitle className="text-white text-2xl">Payment Verification</CardTitle>
          <CardDescription className="text-slate-400">Reference: <span className="font-mono text-xs bg-slate-800 px-1 rounded">{reference}</span></CardDescription>
        </CardHeader>
        
        <CardContent className="flex flex-col items-center text-center space-y-8 pt-6">
          
          {(status === 'verifying' || status === 'pending') && (
            <div className="flex flex-col items-center animate-in fade-in duration-500">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-slate-800 rounded-full"></div>
                <div className="w-20 h-20 border-4 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                <Loader2 className="w-8 h-8 text-blue-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse" />
              </div>
              <p className="text-slate-300 mt-6 text-lg font-medium">{message}</p>
              <p className="text-slate-500 text-sm mt-2">Checking payment status...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center animate-in zoom-in duration-300">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-4 ring-4 ring-green-500/10">
                <CheckCircle className="w-10 h-10 text-green-500" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Activation Complete</h3>
              <p className="text-slate-400 mb-8 max-w-xs">{message}</p>
              
              <div className="grid gap-3 w-full">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-md font-medium shadow-lg shadow-blue-900/20" onClick={() => navigate('/dashboard/subscriptions')}>
                  Go to Subscription Dashboard <ArrowRight className="w-4 h-4 ml-2"/>
                </Button>
                <Button variant="outline" className="w-full border-slate-700 text-slate-300 hover:text-white" onClick={() => navigate('/dashboard/modules')}>
                  View Unlocked Apps
                </Button>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center animate-in zoom-in duration-300 w-full">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-4 ring-4 ring-red-500/10">
                <XCircle className="w-10 h-10 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Verification Failed</h3>
              <p className="text-slate-300 mb-2 max-w-xs font-medium">{message}</p>
              
              {errorDetails && (
                <div className="bg-red-950/30 border border-red-900/50 p-3 rounded mb-6 text-xs text-red-200 w-full max-w-xs flex items-start gap-2 text-left">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorDetails}</span>
                </div>
              )}
              
              <div className="flex flex-col gap-3 w-full">
                <Button className="w-full bg-slate-800 hover:bg-slate-700 text-white" onClick={handleManualRetry}>
                  <RefreshCw className="w-4 h-4 mr-2"/> Retry Verification
                </Button>
                <div className="flex gap-3">
                    <Button variant="outline" className="flex-1 border-slate-700 hover:bg-slate-800 text-slate-300" onClick={() => navigate('/dashboard')}>
                        <Home className="w-4 h-4 mr-2"/> Dashboard
                    </Button>
                    <Button variant="outline" className="flex-1 border-slate-700 hover:bg-slate-800 text-slate-300" onClick={() => window.location.href = 'mailto:support@petrolord.com'}>
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

export default PaymentVerification;