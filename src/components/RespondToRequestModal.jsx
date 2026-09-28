import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, XCircle, CheckCircle } from 'lucide-react';

export default function RespondToRequestModal({ request, onSuccess, trigger }) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [responseMsg, setResponseMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState(null); // 'approved' or 'rejected', for the spinner

  // Each button passes its own decision. The old handler read `action` from
  // state inside a setTimeout scheduled in the same render that set it, so it
  // still saw null and returned without sending anything.
  const handleSubmit = async (decision) => {
    if (decision !== 'approved' && decision !== 'rejected') return;
    setAction(decision);
    setLoading(true);
    try {
        const { data, error } = await supabase.functions.invoke('respond-to-access-request', {
            body: {
                request_id: request.id,
                approval_status: decision,
                admin_response: responseMsg
            }
        });

        if (error || data?.error) throw new Error(error?.message || data?.error);

        toast({
            title: `Request ${decision === 'approved' ? 'Approved' : 'Rejected'}`,
            description: "Employee has been notified.",
        });
        
        if (onSuccess) onSuccess();
        setIsOpen(false);

    } catch (err) {
        toast({ title: "Operation Failed", description: err.message, variant: "destructive" });
    } finally {
        setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || <Button size="sm">Review</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Review Access Request</DialogTitle>
          <DialogDescription className="pt-2 space-y-2">
            <div><strong>User:</strong> {request?.member?.full_name} ({request?.member?.email})</div>
            <div><strong>App:</strong> {request?.app_id}</div>
            <div className="bg-pl-sunken p-2 rounded-md border border-pl-border mt-2">
                <span className="text-xs text-pl-muted uppercase font-bold">Reason:</span>
                <p className="text-sm italic text-pl-text">"{request?.reason}"</p>
            </div>
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
            <div className="grid gap-2">
                <Label htmlFor="response">Admin Response / Note (Optional)</Label>
                <Textarea 
                    id="response" 
                    placeholder="Optional message to the employee..." 
                    className="h-24"
                    value={responseMsg}
                    onChange={(e) => setResponseMsg(e.target.value)}
                />
            </div>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between">
            <div className="flex gap-2 w-full justify-end">
                <Button 
                    variant="outline" 
                    className="text-pl-danger-text hover:bg-pl-danger-bg hover:text-pl-danger-text"
                    onClick={() => handleSubmit('rejected')}
                    disabled={loading}
                >
                    {loading && action === 'rejected' ? <Loader2 className="w-4 h-4 animate-spin"/> : <XCircle className="w-4 h-4 mr-2"/>}
                    Reject
                </Button>
                <Button 
                    onClick={() => handleSubmit('approved')}
                    disabled={loading}
                >
                    {loading && action === 'approved' ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4 mr-2"/>}
                    Approve
                </Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}