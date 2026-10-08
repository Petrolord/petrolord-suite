import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, Loader2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { PublicPage, AUTH_CARD, AUTH_TITLE, TEXT_LINK } from '@/components/public/PublicPage';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState(null);
  
  const { signIn, user } = useAuth();
  // Set once the password is accepted. The auth context publishes the user
  // only after it has loaded the organisation and permissions, so navigating
  // straight away reached /dashboard with no user yet and the route guard
  // sent the person back here (2026-10-08). Navigate when the user arrives.
  const [signedIn, setSignedIn] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const from = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    if (signedIn && user) navigate(from, { replace: true });
  }, [signedIn, user, from, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setUnconfirmedEmail(null);

    const { error } = await signIn(email, password);
    
    if (error) {
      if (error.message.includes('Email not confirmed')) {
        setUnconfirmedEmail(email);
        toast({
          title: "Email Not Confirmed",
          description: "Please verify your email address before logging in.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Login Failed",
          description: error.message || "Invalid credentials. Please try again.",
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: 'Login Successful!',
        description: "Welcome back! Redirecting you to the dashboard...",
      });
      setSignedIn(true); // the effect above navigates once the user is loaded
      return; // keep the button busy until then
    }
    setLoading(false);
  };

  return (
    <>
      <Helmet>
        <title>Login - Petrolord</title>
        <meta name="description" content="Login to your Petrolord account." />
      </Helmet>
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className={AUTH_CARD}>
            <div className="text-center mb-8">
              <h1 className={AUTH_TITLE}>Welcome back</h1>
              <p className="text-pl-muted mt-2">Sign in to access your dashboard</p>
            </div>

            <AnimatePresence>
              {unconfirmedEmail && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-pl-warning-bg border border-pl-warning/30 rounded-lg p-4 mb-6 text-sm text-pl-warning-text"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-pl-warning shrink-0" aria-hidden="true" />
                    <div>
                      <p className="font-medium mb-1">Email not verified</p>
                      <p className="mb-2">We sent a confirmation link to {unconfirmedEmail}.</p>
                      <Link 
                        to="/auth/confirm" 
                        state={{ email: unconfirmedEmail }}
                        className="underline font-semibold hover:no-underline"
                      >
                        Resend confirmation email
                      </Link>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password">Password</Label>
                  <Link to="/forgot-password" className={`text-sm ${TEXT_LINK}`}>
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm text-pl-muted hover:text-pl-text"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <Button type="submit" disabled={loading} className="w-full font-semibold">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                Login
              </Button>
            </form>
            <p className="text-center text-sm text-pl-muted mt-8">
              Don't have an account?{' '}
              <Link to="/signup" className={TEXT_LINK}>
                Sign up
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </>
  );
};

// Batch 7C: the page wraps itself in the public frame (light, brand bar).
const LoginPage = () => (
  <PublicPage testId="login-theme-scope">
    <Login />
  </PublicPage>
);

export default LoginPage;
