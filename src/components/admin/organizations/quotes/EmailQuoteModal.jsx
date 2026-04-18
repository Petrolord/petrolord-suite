import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

const EmailQuoteModal = ({ isOpen, onClose, quote, organization }) => {
  const { toast } = useToast();
  const [email, setEmail] = useState(organization?.contact_email || '');
  const [message, setMessage] = useState('Please find attached the proposal for your review.');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setSending(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSending(false);
    toast({ title: 'Email Sent', description: `Quote sent to ${email}` });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle>Send Quote: {quote?.id}</DialogTitle>
          <DialogDescription>Email this proposal to the client.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Recipient Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} className="bg-slate-950 border-slate-700" />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="bg-slate-950 border-slate-700 h-32" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending} className="bg-blue-600 hover:bg-blue-700">
            {sending ? 'Sending...' : 'Send Email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmailQuoteModal;