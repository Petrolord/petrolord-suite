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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Quote: {quote?.id}</DialogTitle>
          <DialogDescription>Email this proposal to the client.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="quote-email-to">Recipient Email</Label>
            <Input id="quote-email-to" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-email-message">Message</Label>
            <Textarea id="quote-email-message" value={message} onChange={(e) => setMessage(e.target.value)} className="h-32" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? 'Sending...' : 'Send Email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmailQuoteModal;