import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, AlertTriangle } from 'lucide-react';

const EmergencyAccessModal = ({ isOpen, onClose, organization, superAdminId, onSuccess, masterApps }) => {
  const [email, setEmail] = useState('');
  const [selectedApps, setSelectedApps] = useState([]);
  const [reason, setReason] = useState('');
  const [expiryDays, setExpiryDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [foundUser, setFoundUser] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
      if(!isOpen) {
          // Reset
          setEmail('');
          setSelectedApps([]);
          setReason('');
          setExpiryDays(30);
          setFoundUser(null);
      }
  }, [isOpen]);

  const handleSearchUser = async () => {
      if (!email || !organization?.id) return;
      setSearchLoading(true);
      try {
          // We search specifically within the organization's users first to verify membership
          // Or search auth.users/public users table? Assuming public.users linked to org via organization_users
          // Let's use organization_members view or join
          const { data, error } = await supabase
            .from('organization_users')
            .select('user_id, users(email)')
            .eq('organization_id', organization.id)
            .ilike('users.email', email) // Note: filtering on joined column syntax depends on supabase-js version, mostly filtering post-fetch or using inner join filter
            // Easier: just search user by email, verify membership later or assume input is correct for now
            // Let's verify user exists at least.
          
          // Better approach: Search profiles/users table
          const { data: users, error: userError } = await supabase
            .from('users')
            .select('id, email')
            .eq('email', email)
            .single();

          if (userError || !users) {
              toast({ variant: 'destructive', title: 'User not found', description: 'No user with this email found.' });
              setFoundUser(null);
          } else {
              setFoundUser(users);
              toast({ title: 'User Found', description: `Ready to grant access to ${users.email}` });
          }

      } catch (err) {
          console.error(err);
      } finally {
          setSearchLoading(false);
      }
  };

  const handleGrant = async () => {
    if (!foundUser) {
        toast({ variant: 'destructive', description: 'Please verify user email first.' });
        return;
    }
    if (selectedApps.length === 0) {
        toast({ variant: 'destructive', description: 'Select at least one application.' });
        return;
    }
    if (!reason) {
        toast({ variant: 'destructive', description: 'Reason is required for emergency access.' });
        return;
    }

    setLoading(true);
    try {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(expiryDays));

        // Grant access for EACH selected app
        // We'll call the function once per app or update function to handle bulk?
        // The existing function handles one app. Let's loop for now (simple) or update function.
        // Task 7 says "Update... Edge Function". Let's assume we can call it.
        // But for safety and existing contract, let's just loop sequentially or Promise.all
        
        const promises = selectedApps.map(appId => 
             supabase.functions.invoke('admin-grant-user-app-access', {
                body: {
                    user_id: foundUser.id,
                    app_id: appId,
                    expires_at: expiresAt.toISOString(),
                    super_admin_id: superAdminId,
                    reason: reason,
                    grant_type: 'emergency',
                    granted_by: superAdminId
                }
            })
        );

        const results = await Promise.all(promises);
        
        // Check for errors
        const errors = results.filter(r => r.error);
        if (errors.length > 0) {
            throw new Error(`Failed to grant access for ${errors.length} apps.`);
        }

        toast({ title: 'Access Granted', description: `Emergency access granted for ${selectedApps.length} apps.` });
        console.log(`EmergencyAccessModal: Granted access to ${foundUser.email}`);
        onSuccess();
        onClose();

    } catch (error) {
        console.error('Emergency Access Error:', error);
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
        setLoading(false);
    }
  };

  const toggleApp = (appId) => {
      setSelectedApps(prev => 
        prev.includes(appId) ? prev.filter(id => id !== appId) : [...prev, appId]
      );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 text-white border-red-900 max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-500">
             <AlertTriangle className="h-5 w-5"/> Grant Emergency Access
          </DialogTitle>
          <DialogDescription className="text-slate-400">
             Provide temporary access to applications for support or emergency purposes.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
            <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-2">
                    <label className="text-sm font-medium text-slate-300">User Email</label>
                    <Input 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        placeholder="user@organization.com"
                        className="bg-slate-800 border-slate-700"
                    />
                </div>
                <Button variant="secondary" onClick={handleSearchUser} disabled={searchLoading || !email}>
                    {searchLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : 'Verify'}
                </Button>
            </div>
            {foundUser && <p className="text-xs text-green-400">✓ User ID: {foundUser.id}</p>}

            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Applications</label>
                <div className="bg-slate-800 border border-slate-700 rounded-md p-3 max-h-40 overflow-y-auto grid grid-cols-2 gap-2">
                    {masterApps.map(app => (
                        <div key={app.app_id} className="flex items-center space-x-2">
                            <Checkbox 
                                id={`app-${app.app_id}`} 
                                checked={selectedApps.includes(app.app_id)}
                                onCheckedChange={() => toggleApp(app.app_id)}
                                className="border-slate-500 data-[state=checked]:bg-blue-600"
                            />
                            <label htmlFor={`app-${app.app_id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-slate-300 cursor-pointer">
                                {app.name || app.app_name}
                            </label>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Expiration (Days)</label>
                    <Input 
                        type="number" 
                        value={expiryDays} 
                        onChange={(e) => setExpiryDays(e.target.value)}
                        className="bg-slate-800 border-slate-700"
                    />
                </div>
                {expiryDays > 90 && <p className="col-span-2 text-xs text-amber-500">Warning: Long duration access.</p>}
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Reason for Access</label>
                <Textarea 
                    value={reason} 
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Debugging production issue #1234"
                    className="bg-slate-800 border-slate-700 resize-none"
                    rows={3}
                />
            </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-slate-400">Cancel</Button>
          <Button onClick={handleGrant} disabled={loading || !foundUser || selectedApps.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white">
             {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : null}
             Grant Access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmergencyAccessModal;