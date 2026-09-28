import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FilePlus2, CheckCircle, XCircle, FileText, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

const InvoicesTab = ({ afeId, invoices, costItems, onRefresh }) => {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    cost_item_id: '',
    vendor: '',
    invoice_number: '',
    amount: 0,
    invoice_date: new Date().toISOString().split('T')[0]
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.cost_item_id) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select a cost item.' });
      return;
    }

    const { error: invError } = await supabase.from('afe_invoices').insert([{
      ...formData,
      afe_id: afeId,
      status: 'Received'
    }]);

    if (invError) {
      toast({ variant: 'destructive', title: 'Error', description: invError.message });
      return;
    }

    // Automatically update cost item actuals
    const item = costItems.find(c => c.id === formData.cost_item_id);
    const newActual = (Number(item.actual) || 0) + parseFloat(formData.amount);
    await supabase.from('afe_cost_items').update({ actual: newActual }).eq('id', item.id);

    toast({ title: 'Success', description: 'Invoice logged and actuals updated.' });
    setIsDialogOpen(false);
    onRefresh();
  };

  const handleStatusChange = async (id, status) => {
    const { error } = await supabase.from('afe_invoices').update({ status }).eq('id', id);
    if(!error) onRefresh();
  };

  return (
    <div className="space-y-4 bg-pl-surface p-4 rounded border border-pl-border">
      <div className="flex justify-between items-center">
        <div className="flex gap-4">
            <div>
                <p className="text-xs text-pl-muted">Total Invoiced</p>
                <p className="text-lg font-bold text-pl-text">${invoices.reduce((sum, i) => sum + Number(i.amount), 0).toLocaleString()}</p>
            </div>
            <div>
                <p className="text-xs text-pl-muted">Pending Approval</p>
                <p className="text-lg font-bold text-pl-warning-text">${invoices.filter(i => i.status === 'Received').reduce((sum, i) => sum + Number(i.amount), 0).toLocaleString()}</p>
            </div>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="bg-pl-success hover:bg-pl-success-bg">
          <FilePlus2 className="w-4 h-4 mr-2" /> Log Invoice
        </Button>
      </div>

      <Table>
        <TableHeader className="bg-pl-surface">
          <TableRow>
            <TableHead className="text-pl-text">Date</TableHead>
            <TableHead className="text-pl-text">Vendor</TableHead>
            <TableHead className="text-pl-text">Invoice #</TableHead>
            <TableHead className="text-pl-text">Linked Item</TableHead>
            <TableHead className="text-right text-pl-text">Amount</TableHead>
            <TableHead className="text-center text-pl-text">Match Check</TableHead>
            <TableHead className="text-center text-pl-text">Status</TableHead>
            <TableHead className="text-center text-pl-text">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map(inv => {
            const item = costItems.find(c => c.id === inv.cost_item_id);
            const isOverBudget = item && (Number(item.actual) > Number(item.budget));
            
            return (
              <TableRow key={inv.id} className="border-b border-pl-border hover:bg-pl-sunken">
                <TableCell className="whitespace-nowrap text-pl-muted">{inv.invoice_date}</TableCell>
                <TableCell className="text-pl-text font-medium">{inv.vendor}</TableCell>
                <TableCell className="text-pl-text">{inv.invoice_number}</TableCell>
                <TableCell className="text-pl-muted text-xs">
                    {item ? `${item.code} - ${item.description.substring(0,20)}...` : 'Unknown'}
                </TableCell>
                <TableCell className="text-right text-pl-text font-mono">${inv.amount.toLocaleString()}</TableCell>
                <TableCell className="text-center">
                    {isOverBudget ? (
                        <Badge variant="outline" className="bg-pl-danger-bg border-pl-danger/40 text-pl-danger-text text-[10px]">
                            Over Budget
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="bg-pl-success-bg border-pl-success/40 text-pl-success-text text-[10px]">
                            Matched
                        </Badge>
                    )}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className={`
                    ${inv.status === 'Approved' ? 'text-pl-success-text border-pl-success/40' : 
                      inv.status === 'Rejected' ? 'text-pl-danger-text border-pl-danger/40' : 'text-pl-warning-text border-pl-warning/40'}
                  `}>
                    {inv.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  {inv.status === 'Received' && (
                    <div className="flex justify-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleStatusChange(inv.id, 'Approved')} className="text-pl-success-text hover:bg-pl-success-bg"><CheckCircle className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleStatusChange(inv.id, 'Rejected')} className="text-pl-danger-text hover:bg-pl-danger-bg"><XCircle className="w-4 h-4" /></Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {invoices.length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center py-8 text-pl-muted">No invoices logged.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log New Invoice</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Cost Item (Three-Way Match)</Label>
              <select 
                className="w-full bg-pl-sunken border border-pl-border rounded p-2 text-sm"
                value={formData.cost_item_id}
                onChange={e => setFormData({...formData, cost_item_id: e.target.value})}
                required
              >
                <option value="">Select Item...</option>
                {costItems.map(c => <option key={c.id} value={c.id}>{c.code} - {c.description} (Budget: ${c.budget})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Vendor</Label>
                <Input value={formData.vendor} onChange={e => setFormData({...formData, vendor: e.target.value})} required />
              </div>
              <div>
                <Label>Invoice #</Label>
                <Input value={formData.invoice_number} onChange={e => setFormData({...formData, invoice_number: e.target.value})} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount ($)</Label>
                <Input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})} required />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={formData.invoice_date} onChange={e => setFormData({...formData, invoice_date: e.target.value})} required />
              </div>
            </div>
            <div className="bg-pl-sunken p-3 rounded flex items-center gap-3 border border-dashed border-pl-border cursor-pointer hover:bg-pl-sunken">
                <FileText className="w-6 h-6 text-pl-muted" />
                <div className="text-xs text-pl-muted">
                    Attach PDF Invoice (Simulated upload)
                </div>
            </div>
            <DialogFooter>
              <Button type="submit" className="bg-pl-success">Submit Invoice</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvoicesTab;