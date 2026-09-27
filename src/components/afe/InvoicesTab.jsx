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
    <div className="space-y-4 bg-slate-900/50 p-4 rounded border border-slate-800">
      <div className="flex justify-between items-center">
        <div className="flex gap-4">
            <div>
                <p className="text-xs text-slate-500">Total Invoiced</p>
                <p className="text-lg font-bold text-white">${invoices.reduce((sum, i) => sum + Number(i.amount), 0).toLocaleString()}</p>
            </div>
            <div>
                <p className="text-xs text-slate-500">Pending Approval</p>
                <p className="text-lg font-bold text-amber-400">${invoices.filter(i => i.status === 'Received').reduce((sum, i) => sum + Number(i.amount), 0).toLocaleString()}</p>
            </div>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <FilePlus2 className="w-4 h-4 mr-2" /> Log Invoice
        </Button>
      </div>

      <Table>
        <TableHeader className="bg-slate-900">
          <TableRow>
            <TableHead className="text-slate-300">Date</TableHead>
            <TableHead className="text-slate-300">Vendor</TableHead>
            <TableHead className="text-slate-300">Invoice #</TableHead>
            <TableHead className="text-slate-300">Linked Item</TableHead>
            <TableHead className="text-right text-slate-300">Amount</TableHead>
            <TableHead className="text-center text-slate-300">Match Check</TableHead>
            <TableHead className="text-center text-slate-300">Status</TableHead>
            <TableHead className="text-center text-slate-300">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map(inv => {
            const item = costItems.find(c => c.id === inv.cost_item_id);
            const isOverBudget = item && (Number(item.actual) > Number(item.budget));
            
            return (
              <TableRow key={inv.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <TableCell className="whitespace-nowrap text-slate-400">{inv.invoice_date}</TableCell>
                <TableCell className="text-white font-medium">{inv.vendor}</TableCell>
                <TableCell className="text-slate-300">{inv.invoice_number}</TableCell>
                <TableCell className="text-slate-400 text-xs">
                    {item ? `${item.code} - ${item.description.substring(0,20)}...` : 'Unknown'}
                </TableCell>
                <TableCell className="text-right text-white font-mono">${inv.amount.toLocaleString()}</TableCell>
                <TableCell className="text-center">
                    {isOverBudget ? (
                        <Badge variant="outline" className="bg-red-900/20 border-red-500 text-red-400 text-[10px]">
                            Over Budget
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="bg-green-900/20 border-green-500 text-green-400 text-[10px]">
                            Matched
                        </Badge>
                    )}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className={`
                    ${inv.status === 'Approved' ? 'text-green-400 border-green-500/50' : 
                      inv.status === 'Rejected' ? 'text-red-400 border-red-500/50' : 'text-yellow-400 border-yellow-500/50'}
                  `}>
                    {inv.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  {inv.status === 'Received' && (
                    <div className="flex justify-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleStatusChange(inv.id, 'Approved')} className="text-green-500 hover:bg-green-900/20"><CheckCircle className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleStatusChange(inv.id, 'Rejected')} className="text-red-500 hover:bg-red-900/20"><XCircle className="w-4 h-4" /></Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {invoices.length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500">No invoices logged.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader><DialogTitle>Log New Invoice</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Cost Item (Three-Way Match)</Label>
              <select 
                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm"
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
                <Input value={formData.vendor} onChange={e => setFormData({...formData, vendor: e.target.value})} className="bg-slate-800 border-slate-700" required />
              </div>
              <div>
                <Label>Invoice #</Label>
                <Input value={formData.invoice_number} onChange={e => setFormData({...formData, invoice_number: e.target.value})} className="bg-slate-800 border-slate-700" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount ($)</Label>
                <Input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})} className="bg-slate-800 border-slate-700" required />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={formData.invoice_date} onChange={e => setFormData({...formData, invoice_date: e.target.value})} className="bg-slate-800 border-slate-700" required />
              </div>
            </div>
            <div className="bg-slate-800 p-3 rounded flex items-center gap-3 border border-dashed border-slate-600 cursor-pointer hover:bg-slate-700/50">
                <FileText className="w-6 h-6 text-slate-400" />
                <div className="text-xs text-slate-400">
                    Attach PDF Invoice (Simulated upload)
                </div>
            </div>
            <DialogFooter>
              <Button type="submit" className="bg-emerald-600">Submit Invoice</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvoicesTab;