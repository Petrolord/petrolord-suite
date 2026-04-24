import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, Loader2, AlertTriangle } from 'lucide-react';
import { Helmet } from 'react-helmet';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState(null);
  
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const from = location.state?.from?.pathname || '/dashboard';

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
      navigate(from, { replace: true });
    }
    setLoading(false);
  };

  return (
    <>
      <Helmet>
        <title>Login - Petrolord</title>
        <meta name="description" content="Login to your Petrolord account." />
      </Helmet>
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="bg-slate-800/50 backdrop-blur-lg border border-slate-700 rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-8">
              <img
                src="https://horizons-cdn.hostinger.com/43fa5c4b-d185-4d6d-9ff4-a1d78861fb87/petrolord-symbol-text-7X03X.png"
                alt="Petrolord - Energy Industry Management"
                className="h-14 w-auto mx-auto mb-2"
              />
              <p className="text-slate-400 mt-2">Sign in to access your dashboard</p>
            </div>

            <AnimatePresence>
              {unconfirmedEmail && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-6 text-sm text-yellow-200"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
                    <div>
                      <p className="font-medium mb-1">Email not verified</p>
                      <p className="text-yellow-200/80 mb-2">We sent a confirmation link to {unconfirmedEmail}.</p>
                      <Link 
                        to="/auth/confirm" 
                        state={{ email: unconfirmedEmail }}
                        className="text-yellow-400 hover:text-yellow-300 underline font-medium"
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
                <Label htmlFor="email" className="text-lime-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-slate-900/50 border-slate-700 focus:border-lime-400"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password" className="text-lime-300">Password</Label>
                  <Link to="/forgot-password" className="text-sm text-lime-400 hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-slate-900/50 border-slate-700 focus:border-lime-400"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-lime-400 to-teal-500 hover:from-lime-500 hover:to-teal-600 text-slate-900 font-bold">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                Login
              </Button>
            </form>
            <p className="text-center text-sm text-slate-400 mt-8">
              Don't have an account?{' '}
              <Link to="/signup" className="font-medium text-lime-400 hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default Login;