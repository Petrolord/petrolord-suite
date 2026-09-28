import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Mail, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Helmet } from 'react-helmet';
import { PublicPage } from '@/components/public/PublicPage';

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
        description: "A new confirmation link has been sent to your inbox."
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
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:py-16">
        <Card className="w-full max-w-md rounded-2xl bg-pl-raised shadow-pl-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-pl-sunken rounded-full flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-pl-primary-text" aria-hidden="true" />
            </div>
            <CardTitle className="font-pl-display text-3xl font-semibold text-pl-text">Check Your Email</CardTitle>
            <CardDescription className="text-base mt-2">
              We've sent a confirmation link to <br/>
              <span className="font-semibold text-pl-text">{email || 'your email address'}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6 text-center">
            <div className="text-sm text-pl-muted bg-pl-surface p-4 rounded-lg border border-pl-border">
              <p className="mb-2">Please click the link in the email to verify your account and access the dashboard.</p>
              <p>Can't find it? Check your spam folder.</p>
            </div>

            <div className="space-y-3">
              <Button 
                variant="outline" 
                className="w-full"
                onClick={handleResend}
                disabled={resending || !email}
              >
                {resending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Resend Confirmation Email
              </Button>
              
              <Link to="/login" className="block w-full">
                <Button className="w-full font-semibold">
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

// Batch 7C: the page wraps itself in the public frame (light, brand bar).
const ConfirmationPagePage = () => (
  <PublicPage testId="confirmation-theme-scope">
    <ConfirmationPage />
  </PublicPage>
);

export default ConfirmationPagePage;