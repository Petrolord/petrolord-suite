import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, CheckCircle2 } from 'lucide-react';

export default function RequestAccessModal({ appId, appName, moduleId, trigger, orgId }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) {
        toast({ title: "Reason Required", description: "Please explain why you need access.", variant: "destructive" });
        return;
    }
    
    setLoading(true);
    try {
        // Fetch org ID if not passed
        let targetOrgId = orgId;
        if (!targetOrgId) {
            const { data } = await supabase.from('organization_users').select('organization_id').eq('user_id', user.id).single();
            targetOrgId = data?.organization_id;
        }

        const { data, error } = await supabase.functions.invoke('request-app-access', {
            body: {
                app_id: appId,
                module_id: moduleId || 'unknown',
                reason: reason,
                organization_id: targetOrgId
            }
        });

        if (error || data?.error) throw new Error(error?.message || data?.error);

        setSuccess(true);
        toast({ title: "Request Sent", description: "Admins have been notified.", className: "bg-green-600 text-white" });
        setTimeout(() => setIsOpen(false), 2000);

    } catch (err) {
        console.error(err);
        toast({ title: "Request Failed", description: err.message, variant: "destructive" });
    } finally {
        setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(val) => { setIsOpen(val); if(!val) setSuccess(false); }}>
      <DialogTrigger asChild>
        {trigger || <Button variant="outline">Request Access</Button>}
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Request Access</DialogTitle>
          <DialogDescription className="text-slate-400">
            Submit a request to access <strong>{appName || appId}</strong>.
          </DialogDescription>
        </DialogHeader>
        
        {success ? (
            <div className="flex flex-col items-center justify-center py-6 space-y-4">
                <CheckCircle2 className="w-16 h-16 text-green-500" />
                <p className="text-lg font-medium">Request Sent Successfully!</p>
            </div>
        ) : (
            <div className="grid gap-4 py-4">
            <div className="grid gap-2">
                <Label htmlFor="reason">Reason for Access</Label>
                <Textarea 
                    id="reason" 
                    placeholder="I need this for the XYZ Project..." 
                    className="bg-slate-950 border-slate-700 h-24"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                />
            </div>
            </div>
        )}

        <DialogFooter>
            {!success && (
                <>
                    <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={loading}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Submit Request
                    </Button>
                </>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}