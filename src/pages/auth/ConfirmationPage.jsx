import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Mail, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Helmet } from 'react-helmet';

const ConfirmationPage = () => {
  const location = useLocation();
  const email = location.state?.email;
  const { toast } = useToast();
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });

      if (error) throw error;

      toast({
        title: "Email Sent",
        description: "A new confirmation link has been sent to your inbox.",
        className: "bg-green-600 text-white"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error.message || "Failed to resend email. Please try again.",
        variant: "destructive"
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Check Your Email - Petrolord</title>
      </Helmet>
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-blue-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">Check Your Email</CardTitle>
            <CardDescription className="text-slate-400 text-base mt-2">
              We've sent a confirmation link to <br/>
              <span className="font-semibold text-white">{email || 'your email address'}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6 text-center">
            <div className="text-sm text-slate-400 bg-slate-800/50 p-4 rounded-lg border border-slate-700">
              <p className="mb-2">Please click the link in the email to verify your account and access the dashboard.</p>
              <p>Can't find it? Check your spam folder.</p>
            </div>

            <div className="space-y-3">
              <Button 
                variant="outline" 
                className="w-full border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                onClick={handleResend}
                disabled={resending || !email}
              >
                {resending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Resend Confirmation Email
              </Button>
              
              <Link to="/login" className="block w-full">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  Back to Login
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default ConfirmationPage;