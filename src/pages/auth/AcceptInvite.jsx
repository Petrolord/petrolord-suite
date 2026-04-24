import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { Lock, Loader2, CheckCircle2 } from 'lucide-react';
import { Helmet } from 'react-helmet';

const AcceptInvite = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
        toast({ title: "Passwords do not match", variant: "destructive" });
        return;
    }
    
    setLoading(true);
    try {
        const { data, error } = await supabase.functions.invoke('accept-employee-invitation', {
            body: { token, password }
        });

        if (error || data?.error) throw new Error(error?.message || data?.error);

        setSuccess(true);
        toast({ title: "Account Activated", description: "Redirecting to login...", className: "bg-green-600 text-white" });
        
        setTimeout(() => navigate('/login'), 2000);

    } catch (err) {
        toast({ title: "Activation Failed", description: err.message, variant: "destructive" });
    } finally {
        setLoading(false);
    }
  };

  if (success) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-white">
            <div className="bg-slate-900 border border-green-500/30 p-8 rounded-xl text-center max-w-md w-full">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4"/>
                <h1 className="text-2xl font-bold mb-2">Welcome Aboard!</h1>
                <p className="text-slate-400">Your account has been successfully set up.</p>
            </div>
        </div>
      );
  }

  return (
    <>
      <Helmet><title>Accept Invitation - Petrolord</title></Helmet>
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-white">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-xl shadow-2xl">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white">Set Your Password</h1>
                    <p className="text-slate-400 mt-2">Complete your account setup to join the team.</p>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <Label>New Password</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-500"/>
                            <Input 
                                type="password" 
                                className="pl-10 bg-slate-950 border-slate-700" 
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
                            <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-500"/>
                            <Input 
                                type="password" 
                                className="pl-10 bg-slate-950 border-slate-700" 
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <Button type="submit" className="w-full bg-lime-600 hover:bg-lime-700 text-white font-bold" disabled={loading}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : "Activate Account"}
                    </Button>
                </form>
            </div>
        </motion.div>
      </div>
    </>
  );
};

export default AcceptInvite;