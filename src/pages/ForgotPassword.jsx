import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';
import { Mail, Loader2 } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { PublicPage, AUTH_CARD, AUTH_TITLE, TEXT_LINK } from '@/components/public/PublicPage';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { resetPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await resetPassword(email);
    setLoading(false);
  };

  return (
    <>
      <Helmet>
        <title>Forgot Password - Petrolord</title>
        <meta name="description" content="Reset your Petrolord account password." />
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
              <h1 className={AUTH_TITLE}>Forgot Password</h1>
              <p className="text-pl-muted mt-2">Enter your email to get a reset link</p>
            </div>
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
              <Button type="submit" disabled={loading} className="w-full font-semibold">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                Send Reset Link
              </Button>
            </form>
            <p className="text-center text-sm text-pl-muted mt-8">
              Remember your password?{' '}
              <Link to="/login" className={TEXT_LINK}>
                Login
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </>
  );
};

// Batch 7C: the page wraps itself in the public frame (light, brand bar).
const ForgotPasswordPage = () => (
  <PublicPage testId="forgot-password-theme-scope">
    <ForgotPassword />
  </PublicPage>
);

export default ForgotPasswordPage;