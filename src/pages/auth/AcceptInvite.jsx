import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { Lock, Loader2, CheckCircle2 } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { PublicPage, AUTH_CARD, AUTH_TITLE } from '@/components/public/PublicPage';

const AcceptInvite = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  // Security fix 2026-09-19: an invitation for an email that already has an
  // account is accepted only from a signed-in session for that email.
  const [sessionEmail, setSessionEmail] = useState(null);
  const [needsSignIn, setNeedsSignIn] = useState(null);

  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data }) => {
      if (live) setSessionEmail(data?.session?.user?.email ?? null);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  const goSignIn = () => navigate('/login', {
    state: { from: { pathname: `/auth/accept-invite?token=${encodeURIComponent(token || '')}` } },
  });

  // functions.invoke hides a non-2xx body behind error.context; read it so
  // the page can tell "sign in first" from other failures.
  const readFnError = async (error) => {
    try {
      const body = await error?.context?.json?.();
      if (body) return body;
    } catch { /* not JSON */ }
    return { error: error?.message };
  };

  const accept = async (withPassword) => {
    setLoading(true);
    try {
        const { data, error } = await supabase.functions.invoke('accept-employee-invitation', {
            body: withPassword ? { token, password } : { token }
        });

        if (error || data?.error) {
          const body = error ? await readFnError(error) : data;
          if (body?.requires_sign_in) {
            setNeedsSignIn(body.error || 'Sign in to the invited account, then open this link again.');
            return;
          }
          throw new Error(body?.error || error?.message || 'Activation failed');
        }

        setSuccess(true);
        toast({
          title: data?.linked ? "Membership Activated" : "Account Activated",
          description: data?.linked
            ? "Your account was added to the organization."
            : "Redirecting to login...",
          duration: data?.linked ? 10000 : undefined
        });

        setTimeout(() => navigate(data?.linked ? '/dashboard' : '/login'), 2000);

    } catch (err) {
        toast({ title: "Activation Failed", description: err.message, variant: "destructive" });
    } finally {
        setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
        toast({ title: "Passwords do not match", variant: "destructive" });
        return;
    }
    
    await accept(true);
  };

  if (success) {
      return (
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
            <div className={`${AUTH_CARD} text-center max-w-md w-full`}>
                <CheckCircle2 className="w-16 h-16 text-pl-success mx-auto mb-4" aria-hidden="true"/>
                <h1 className={`${AUTH_TITLE} mb-2`}>Welcome Aboard!</h1>
                <p className="text-pl-muted">Your account has been successfully set up.</p>
            </div>
        </div>
      );
  }

  return (
    <>
      <Helmet><title>Accept Invitation - Petrolord</title></Helmet>
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
            <div className={AUTH_CARD}>
                <div className="text-center mb-8">
                    <h1 className={AUTH_TITLE}>Set Your Password</h1>
                    <p className="text-pl-muted mt-2">Complete your account setup to join the team.</p>
                </div>
                
                {needsSignIn && (
                    <div className="mb-6 rounded-lg border border-pl-warning/40 bg-pl-warning-bg p-4 text-sm text-pl-warning-text">
                        <p className="mb-3">{needsSignIn}</p>
                        <Button type="button" onClick={goSignIn} variant="outline" className="w-full">
                            Sign in
                        </Button>
                    </div>
                )}
                {sessionEmail && (
                    <div className="mb-6 rounded-lg border border-pl-border p-4 text-sm text-pl-text">
                        <p className="mb-3">Signed in as <strong>{sessionEmail}</strong>. If this invitation was sent to this address, accept it with your existing account.</p>
                        <Button type="button" onClick={() => accept(false)} disabled={loading} className="w-full font-semibold">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : "Accept with this account"}
                        </Button>
                    </div>
                )}
                <p className="mb-4 text-sm text-pl-muted">
                    Already have a Petrolord account under the invited email? <button type="button" onClick={goSignIn} className="text-pl-primary-text underline">Sign in</button> and open this link again. New here? Set a password below.
                </p>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <Label>New Password</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 w-4 h-4 text-pl-muted" aria-hidden="true"/>
                            <Input 
                                type="password" 
                                className="pl-10" 
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                minLength={8}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Confirm Password</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 w-4 h-4 text-pl-muted" aria-hidden="true"/>
                            <Input 
                                type="password" 
                                className="pl-10" 
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <Button type="submit" className="w-full font-semibold" disabled={loading}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : "Activate Account"}
                    </Button>
                </form>
            </div>
        </motion.div>
      </div>
    </>
  );
};

// Batch 7C: the page wraps itself in the public frame (light, brand bar).
const AcceptInvitePage = () => (
  <PublicPage testId="accept-invite-theme-scope">
    <AcceptInvite />
  </PublicPage>
);

export default AcceptInvitePage;