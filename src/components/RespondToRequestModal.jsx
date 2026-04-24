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
  const [action, setAction] = useState(null); // 'approved' or 'rejected'

  const handleSubmit = async () => {
    if (!action) return;
    setLoading(true);
    try {
        const { data, error } = await supabase.functions.invoke('respond-to-access-request', {
            body: {
                request_id: request.id,
                approval_status: action,
                admin_response: responseMsg
            }
        });

        if (error || data?.error) throw new Error(error?.message || data?.error);

        toast({ 
            title: `Request ${action === 'approved' ? 'Approved' : 'Rejected'}`, 
            description: "Employee has been notified.", 
            className: action === 'approved' ? "bg-green-600 text-white" : "bg-red-600 text-white"
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
      <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Review Access Request</DialogTitle>
          <DialogDescription className="text-slate-400 pt-2 space-y-2">
            <div><strong>User:</strong> {request?.member?.full_name} ({request?.member?.email})</div>
            <div><strong>App:</strong> {request?.app_id}</div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800 mt-2">
                <span className="text-xs text-slate-500 uppercase font-bold">Reason:</span>
                <p className="text-sm italic text-slate-300">"{request?.reason}"</p>
            </div>
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
            <div className="grid gap-2">
                <Label htmlFor="response">Admin Response / Note (Optional)</Label>
                <Textarea 
                    id="response" 
                    placeholder="Optional message to the employee..." 
                    className="bg-slate-950 border-slate-700 h-24"
                    value={responseMsg}
                    onChange={(e) => setResponseMsg(e.target.value)}
                />
            </div>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between">
            <div className="flex gap-2 w-full justify-end">
                <Button 
                    variant="outline" 
                    className="border-red-900/50 text-red-400 hover:bg-red-900/20 hover:text-red-300"
                    onClick={() => { setAction('rejected'); setTimeout(handleSubmit, 100); }} // immediate trigger for UX simplicity or confirm? assume confirm
                    disabled={loading}
                >
                    {loading && action === 'rejected' ? <Loader2 className="w-4 h-4 animate-spin"/> : <XCircle className="w-4 h-4 mr-2"/>}
                    Reject
                </Button>
                <Button 
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => { setAction('approved'); setTimeout(handleSubmit, 100); }}
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