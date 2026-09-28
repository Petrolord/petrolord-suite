import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { NumericTable, NumTh, NumRow, NumCell } from '@/components/ui/numeric-table';
import { NativeSelect } from '@/components/ui/native-select';
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
    <div className="space-y-4 rounded-lg border border-pl-border bg-pl-surface p-4 shadow-pl-sm">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex flex-wrap gap-4">
            <div>
                <p className="text-xs text-pl-muted">Total Invoiced</p>
                <p className="text-lg font-semibold font-pl-mono tabular-nums text-pl-text">${invoices.reduce((sum, i) => sum + Number(i.amount), 0).toLocaleString()}</p>
            </div>
            <div>
                <p className="text-xs text-pl-muted">Pending Approval</p>
                <p className="text-lg font-semibold font-pl-mono tabular-nums text-pl-text">${invoices.filter(i => i.status === 'Received').reduce((sum, i) => sum + Number(i.amount), 0).toLocaleString()}</p>
            </div>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <FilePlus2 className="w-4 h-4 mr-2" /> Log Invoice
        </Button>
      </div>

      <NumericTable className="p-0" data-testid="afe-invoice-table">
        <thead>
          <tr>
            <NumTh>Date</NumTh>
            <NumTh>Vendor</NumTh>
            <NumTh>Invoice #</NumTh>
            <NumTh>Linked Item</NumTh>
            <NumTh numeric>Amount</NumTh>
            <NumTh className="text-center">Match Check</NumTh>
            <NumTh className="text-center">Status</NumTh>
            <NumTh className="text-center">Actions</NumTh>
          </tr>
        </thead>
        <tbody>
          {invoices.map(inv => {
            const item = costItems.find(c => c.id === inv.cost_item_id);
            const isOverBudget = item && (Number(item.actual) > Number(item.budget));
            
            return (
              <NumRow key={inv.id}>
                <td className="border-b border-pl-border px-3 py-2 whitespace-nowrap font-pl-mono text-xs tabular-nums text-pl-muted">{inv.invoice_date}</td>
                <td className="border-b border-pl-border px-3 py-2 font-medium text-pl-text">{inv.vendor}</td>
                <td className="border-b border-pl-border px-3 py-2 text-pl-text">{inv.invoice_number}</td>
                <td className="border-b border-pl-border px-3 py-2 text-xs text-pl-muted">
                    {item ? `${item.code} - ${item.description.substring(0,20)}...` : 'Unknown'}
                </td>
                <NumCell value={Number(inv.amount)}>${inv.amount.toLocaleString()}</NumCell>
                <td className="border-b border-pl-border px-3 py-2 text-center">
                    {isOverBudget ? (
                        <Badge variant="danger" className="text-[10px]">
                            Over Budget
                        </Badge>
                    ) : (
                        <Badge variant="success" className="text-[10px]">
                            Matched
                        </Badge>
                    )}
                </td>
                <td className="border-b border-pl-border px-3 py-2 text-center">
                  <Badge variant={inv.status === 'Approved' ? 'success' : inv.status === 'Rejected' ? 'danger' : 'warning'}>
                    {inv.status}
                  </Badge>
                </td>
                <td className="border-b border-pl-border px-3 py-2 text-center">
                  {inv.status === 'Received' && (
                    <div className="flex justify-center gap-2">
                      <Button variant="ghost" size="icon" aria-label="Approve invoice" title="Approve" onClick={() => handleStatusChange(inv.id, 'Approved')} className="text-pl-success-text hover:bg-pl-success-bg"><CheckCircle className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label="Reject invoice" title="Reject" onClick={() => handleStatusChange(inv.id, 'Rejected')} className="text-pl-danger-text hover:bg-pl-danger-bg"><XCircle className="w-4 h-4" /></Button>
                    </div>
                  )}
                </td>
              </NumRow>
            );
          })}
          {invoices.length === 0 && (
            <tr><td colSpan={8} className="text-center py-8 text-pl-muted">No invoices logged.</td></tr>
          )}
        </tbody>
      </NumericTable>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log New Invoice</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Cost Item (Three-Way Match)</Label>
              <NativeSelect
                aria-label="Cost Item (Three-Way Match)"
                value={formData.cost_item_id}
                onChange={e => setFormData({...formData, cost_item_id: e.target.value})}
                required
              >
                <option value="">Select Item...</option>
                {costItems.map(c => <option key={c.id} value={c.id}>{c.code} - {c.description} (Budget: ${c.budget})</option>)}
              </NativeSelect>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Vendor</Label>
                <Input value={formData.vendor} onChange={e => setFormData({...formData, vendor: e.target.value})} required />
              </div>
              <div>
                <Label>Invoice #</Label>
                <Input value={formData.invoice_number} onChange={e => setFormData({...formData, invoice_number: e.target.value})} required />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Amount ($)</Label>
                <Input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})} required />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={formData.invoice_date} onChange={e => setFormData({...formData, invoice_date: e.target.value})} required />
              </div>
            </div>
            <div className="bg-pl-sunken/60 p-3 rounded flex items-center gap-3 border border-dashed border-pl-border-strong cursor-pointer hover:bg-pl-sunken">
                <FileText className="w-6 h-6 text-pl-muted" />
                <div className="text-xs text-pl-muted">
                    Attach PDF Invoice (Simulated upload)
                </div>
            </div>
            <DialogFooter>
              <Button type="submit">Submit Invoice</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvoicesTab;