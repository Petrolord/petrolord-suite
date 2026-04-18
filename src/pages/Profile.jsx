import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate, useLocation } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, CheckCircle } from "lucide-react";

const Profile = () => {
  const { user, loading: authLoading, setProfileSetupComplete } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Derive completion status directly from user metadata.
  // We avoid using a useEffect redirect here to prevent infinite loops if the router/AuthGuard keeps sending us back.
  const isProfileComplete = user?.user_metadata?.profile_setup_complete === true;
  
  // Check if we are in "onboarding" mode. 
  // This is either explicitly passed via router state OR inferred if the profile is incomplete.
  const isOnboarding = location.state?.onboarding || !isProfileComplete;

  useEffect(() => {
    if (user?.user_metadata?.display_name) {
      setDisplayName(user.user_metadata.display_name);
    } else if (user?.email) {
      setDisplayName(user.email.split('@')[0]);
    }
  }, [user]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Validation for password change (required during onboarding/completion if not set)
    if (isOnboarding || password.length > 0) {
        if (password !== confirmPassword) {
            toast({
                variant: 'destructive',
                title: 'Passwords do not match',
                description: 'Please ensure your passwords match.',
            });
            setLoading(false);
            return;
        }
        if (password.length < 6 && password.length > 0) {
            toast({
                variant: 'destructive',
                title: 'Password too short',
                description: 'Password must be at least 6 characters long.',
            });
            setLoading(false);
            return;
        }
    }

    try {
      const updates = {
        data: {
          display_name: displayName,
          profile_setup_complete: true,
        },
      };

      if (password) {
          updates.password = password;
      }

      const { error } = await supabase.auth.updateUser(updates);

      if (error) {
        throw error;
      }

      // Update context state immediately to reflect changes in the app
      if (setProfileSetupComplete) {
        setProfileSetupComplete(true);
      }

      toast({
        title: 'Profile Updated',
        description: 'Your profile has been successfully updated.',
      });

      // Explicit navigation on success is safe and expected
      navigate('/dashboard', { replace: true });

    } catch (error) {
      console.error("Profile update error:", error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: error.message || "An error occurred while updating your profile.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBackToDashboard = () => {
    navigate('/dashboard', { replace: true });
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-lime-400"></div>
      </div>
    );
  }

  // If profile is already complete AND we are in an onboarding flow (likely redirected here by a guard),
  // show a static success message instead of auto-redirecting. This breaks any potential redirect loops.
  if (isProfileComplete && isOnboarding) {
      return (
        <>
          <Helmet>
            <title>Profile Complete - Petrolord Suite</title>
          </Helmet>
          <div className="flex items-center justify-center min-h-screen bg-slate-900 p-4">
            <Card className="w-full max-w-md bg-slate-800 border-slate-700 text-white">
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-8 w-8 text-lime-400" />
                    <CardTitle className="text-2xl font-bold text-lime-400">You're All Set!</CardTitle>
                </div>
                <CardDescription className="text-slate-400">
                  Your profile is complete. You can now access the dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent>
                  <p className="text-slate-300 mb-4">
                      We detected that your profile information is already saved.
                  </p>
                  <Button 
                    onClick={handleBackToDashboard} 
                    className="w-full bg-lime-400 text-slate-900 hover:bg-lime-500 font-bold"
                  >
                    Go to Dashboard
                  </Button>
              </CardContent>
            </Card>
          </div>
        </>
      );
  }

  return (
    <>
      <Helmet>
        <title>{isOnboarding ? 'Complete Your Profile' : 'My Profile'} - Petrolord Suite</title>
        <meta name="description" content="Manage your Petrolord Suite profile and account settings." />
      </Helmet>
      <div className="flex items-center justify-center min-h-screen bg-slate-900 p-4">
        <Card className="w-full max-w-md bg-slate-800 border-slate-700 text-white">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-lime-400">{isOnboarding ? 'Complete Your Profile' : 'My Profile'}</CardTitle>
            <CardDescription className="text-slate-400">
              {isOnboarding ? 'Set up your display name and password to get started.' : 'Manage your account settings.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isOnboarding && (
              <Alert className="mb-6 bg-slate-700 border-slate-600">
                <Info className="h-4 w-4 text-lime-400" />
                <AlertTitle className="text-white">Welcome to Petrolord!</AlertTitle>
                <AlertDescription className="text-slate-300">
                  Please set up your profile to continue to the dashboard.
                </AlertDescription>
              </Alert>
            )}
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">Email</Label>
                <Input id="email" type="email" value={user?.email || ''} disabled className="bg-slate-700 border-slate-600 text-slate-300" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-slate-300">Display Name</Label>
                <Input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300">
                  {isOnboarding ? 'Set New Password' : 'Change Password (Optional)'}
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-700 border-slate-600 text-white"
                  required={isOnboarding}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-slate-300">
                  {isOnboarding ? 'Confirm New Password' : 'Confirm Change'}
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-700 border-slate-600 text-white"
                  required={isOnboarding || password.length > 0}
                />
              </div>
              
               <Button type="submit" className="w-full bg-lime-400 text-slate-900 hover:bg-lime-500 font-semibold" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button variant="link" onClick={handleBackToDashboard} className="text-slate-400 hover:text-white">
              Back to Dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    </>
  );
};

export default Profile;