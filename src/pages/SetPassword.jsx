import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { KeyRound, Loader2, UserCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Helmet } from 'react-helmet';

const SetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Form state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [validatingToken, setValidatingToken] = useState(false);
  const [user, setUser] = useState(null);
  const [success, setSuccess] = useState(false);
  const [tokenError, setTokenError] = useState('');

  // Extract query parameters from URL
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  const type = searchParams.get('type'); // 'invite' or 'recovery'
  const urlError = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Validate token and check session on mount
  useEffect(() => {
    const validateAndCheckSession = async () => {
      console.log('[SetPassword] 🔍 Starting validation...');
      console.log('[SetPassword] Token present:', !!token);
      console.log('[SetPassword] Email present:', !!email);
      console.log('[SetPassword] Type:', type);

      // Handle URL error parameters
      if (urlError) {
        console.error('[SetPassword] ❌ URL Error:', urlError);
        toast({
          variant: "destructive",
          title: "Authentication Error",
          description: errorDescription || "An error occurred during authentication link validation.",
        });
        setTokenError('Invalid or expired link. Please request a new invitation.');
        setCheckingSession(false);
        return;
      }

      // If we have a token, validate it
      if (token) {
        console.log('[SetPassword] 🔐 Validating recovery token...');
        setValidatingToken(true);
        
        try {
          // Try to get user with the token
          const { data: { user: tokenUser }, error: tokenError } = await supabase.auth.getUser(token);
          
          if (tokenError || !tokenUser) {
            console.error('[SetPassword] ❌ Token validation failed:', tokenError);
            setTokenError('Invalid or expired reset link. Please request a new invitation.');
            setCheckingSession(false);
            setValidatingToken(false);
            return;
          }

          console.log('[SetPassword] ✅ Token validated for user:', tokenUser.email);
          setUser(tokenUser);
          setDisplayName(tokenUser.user_metadata?.display_name || tokenUser.user_metadata?.full_name || '');
          setCheckingSession(false);
          setValidatingToken(false);
          return;
        } catch (err) {
          console.error('[SetPassword] 💥 Token validation error:', err);
          setTokenError('An error occurred while validating your link.');
          setCheckingSession(false);
          setValidatingToken(false);
          return;
        }
      }

      // If no token, check for existing session (magic link flow)
      console.log('[SetPassword] 📋 Checking for existing session...');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          console.log('[SetPassword] ✅ Session found for user:', session.user.email);
          setUser(session.user);
          setDisplayName(session.user.user_metadata?.display_name || session.user.user_metadata?.full_name || '');
        } else {
          console.log('[SetPassword] ℹ️ No session found, waiting for auth state change...');
        }
      } catch (err) {
        console.error('[SetPassword] ⚠️ Session check error:', err);
      }

      setCheckingSession(false);
    };

    validateAndCheckSession();

    // Listen for auth state changes (e.g. after clicking a magic link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[SetPassword] 🔄 Auth state changed:', event);
      
      if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session?.user) {
        console.log('[SetPassword] ✅ User authenticated:', session.user.email);
        setUser(session.user);
        setDisplayName(session.user.user_metadata?.display_name || session.user.user_metadata?.full_name || '');
        setCheckingSession(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [token, email, type, urlError, errorDescription, toast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTokenError('');

    // Validation
    if (!displayName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Display Name Required',
        description: 'Please enter your display name.',
      });
      return;
    }

    if (!password) {
      toast({
        variant: 'destructive',
        title: 'Password Required',
        description: 'Please enter a password.',
      });
      return;
    }

    if (password.length < 8) {
      toast({
        variant: 'destructive',
        title: 'Password Too Short',
        description: 'Your password must be at least 8 characters long.',
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Passwords Do Not Match",
        description: "Please re-enter your password and confirm it.",
      });
      return;
    }

    setLoading(true);

    try {
      console.log('[SetPassword] 🔐 Updating password...');

      // Update password and user metadata
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
        data: { 
          display_name: displayName,
          full_name: displayName,
          profile_setup_complete: true 
        }
      });

      if (updateError) {
        console.error('[SetPassword] ❌ Password update failed:', updateError);
        throw updateError;
      }

      console.log('[SetPassword] ✅ Password updated successfully');

      // Try to update profile table if it exists
      if (user?.id) {
        console.log('[SetPassword] 👤 Updating user profile...');
        try {
          const { error: profileError } = await supabase
            .from('profiles')
            .update({
              display_name: displayName,
              full_name: displayName,
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id);

          if (profileError) {
            console.warn('[SetPassword] ⚠️ Profile update warning:', profileError);
            // Don't throw - profile update is secondary
          } else {
            console.log('[SetPassword] ✅ Profile updated successfully');
          }
        } catch (profileErr) {
          console.warn('[SetPassword] ⚠️ Profile update error (non-critical):', profileErr);
        }
      }

      setSuccess(true);
      console.log('[SetPassword] ✅ SUCCESS! Account setup complete');

      toast({
        title: 'Account Activated!',
        description: 'Your password has been set. Redirecting you to the dashboard.',
      });

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 2000);

    } catch (error) {
      console.error('[SetPassword] 💥 Error:', error);
      const errorMessage = error.message || 'An error occurred. Please try again.';
      setTokenError(errorMessage);
      toast({
        variant: 'destructive',
        title: 'Setup Failed',
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const getPageTitle = () => {
    if (type === 'recovery') return "Reset Your Password";
    if (type === 'invite') return "Complete Your Profile";
    return "Set Your Password";
  };

  const getPageDescription = () => {
    if (type === 'recovery') return "Enter a new password to recover your account.";
    if (type === 'invite') return "Welcome to the team! Set up your details to get started.";
    return "Please set a secure password for your account.";
  };

  // Loading/validating state
  if (checkingSession || validatingToken) {
    return (
      <>
        <Helmet>
          <title>Validating Invitation - Petrolord</title>
          <meta name="description" content="Validating your invitation link..." />
        </Helmet>
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
          >
            <div className="bg-slate-800/50 backdrop-blur-lg border border-slate-700 rounded-2xl p-8 shadow-2xl">
              <div className="text-center">
                <Loader2 className="h-12 w-12 animate-spin text-lime-400 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-lime-300">Validating Invitation</h1>
                <p className="text-slate-400 mt-4">Please wait while we verify your invitation link...</p>
                <p className="text-slate-500 text-sm mt-2">Ensure you have accessed this page via your invitation email.</p>
              </div>
            </div>
          </motion.div>
        </div>
      </>
    );
  }

  // Success state
  if (success) {
    return (
      <>
        <Helmet>
          <title>Account Activated - Petrolord</title>
          <meta name="description" content="Your account has been successfully activated." />
        </Helmet>
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
          >
            <div className="bg-slate-800/50 backdrop-blur-lg border border-lime-700/30 rounded-2xl p-8 shadow-2xl">
              <div className="text-center mb-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  <CheckCircle2 className="h-16 w-16 text-lime-400 mx-auto mb-4" />
                </motion.div>
                <h1 className="text-3xl font-bold text-lime-300">Success!</h1>
                <p className="text-slate-400 mt-2">Your account has been activated.</p>
              </div>
              <p className="text-slate-300 text-center mb-6">
                You will be redirected to the dashboard shortly. If not, click the button below.
              </p>
              <Button
                onClick={() => navigate('/dashboard', { replace: true })}
                className="w-full bg-gradient-to-r from-lime-400 to-teal-500 hover:from-lime-500 hover:to-teal-600 text-slate-900 font-bold shadow-lg shadow-lime-900/20"
              >
                Go to Dashboard
              </Button>
            </div>
          </motion.div>
        </div>
      </>
    );
  }

  // Invalid token state
  if (tokenError) {
    return (
      <>
        <Helmet>
          <title>Invalid Link - Petrolord</title>
          <meta name="description" content="This reset link is invalid or has expired." />
        </Helmet>
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
          >
            <div className="bg-slate-800/50 backdrop-blur-lg border border-red-700/30 rounded-2xl p-8 shadow-2xl">
              <div className="text-center mb-8">
                <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-red-400">Invalid Link</h1>
                <p className="text-slate-400 mt-2">This reset link is invalid or has expired.</p>
              </div>
              <p className="text-slate-300 text-center mb-6">
                {tokenError}
              </p>
              <Button
                onClick={() => navigate('/', { replace: true })}
                className="w-full bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white font-bold shadow-lg shadow-slate-900/20"
              >
                Back to Home
              </Button>
            </div>
          </motion.div>
        </div>
      </>
    );
  }

  // Main form state
  return (
    <>
      <Helmet>
        <title>{getPageTitle()} - Petrolord</title>
        <meta name="description" content="Complete your Petrolord account setup by setting your password." />
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
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <KeyRound className="h-12 w-12 text-lime-400 mx-auto mb-4" />
              </motion.div>
              <h1 className="text-3xl font-bold text-lime-300">{getPageTitle()}</h1>
              <p className="text-slate-400 mt-2">{getPageDescription()}</p>
            </div>

            {user ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Email (Read-only) */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-lime-300">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={user.email || email || ''}
                    disabled
                    className="bg-slate-900/80 border-slate-700 text-slate-400 cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-500">This is the email you were invited with</p>
                </div>

                {/* Display Name */}
                <div className="space-y-2">
                  <Label htmlFor="displayName" className="text-lime-300">Full Name</Label>
                  <Input
                    id="displayName"
                    type="text"
                    placeholder="Your full name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={loading}
                    className="bg-slate-900/50 border-slate-700 focus:border-lime-400"
                    required
                  />
                  <p className="text-xs text-slate-500">How you'll appear in the system</p>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-lime-300">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="bg-slate-900/50 border-slate-700 focus:border-lime-400"
                    required
                    minLength={8}
                  />
                  <p className="text-xs text-slate-500">Minimum 8 characters</p>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-lime-300">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    className="bg-slate-900/50 border-slate-700 focus:border-lime-400"
                    required
                    minLength={8}
                  />
                </div>

                {/* Submit Button */}
                <Button 
                  type="submit" 
                  disabled={loading} 
                  className="w-full bg-gradient-to-r from-lime-400 to-teal-500 hover:from-lime-500 hover:to-teal-600 text-slate-900 font-bold shadow-lg shadow-lime-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Setting up your account...
                    </>
                  ) : (
                    <>
                      <UserCheck className="mr-2 h-4 w-4" />
                      {type === 'recovery' ? 'Reset Password' : 'Activate Account'}
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <div className="text-center text-slate-400 flex flex-col items-center py-8">
                <div className="bg-red-500/10 p-3 rounded-full mb-4">
                  <KeyRound className="h-8 w-8 text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Invalid or Expired Link</h3>
                <p className="text-sm">The link you used is either invalid or has expired.</p>
                <Button 
                  variant="link" 
                  className="mt-4 text-lime-400 hover:text-lime-300"
                  onClick={() => navigate('/login', { replace: true })}
                >
                  Return to Login
                </Button>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-slate-700">
              <p className="text-center text-slate-400 text-sm">
                Having trouble? Contact your administrator for a new invitation link.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default SetPassword;