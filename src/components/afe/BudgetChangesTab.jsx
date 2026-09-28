import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { NumericTable, NumTh, NumRow, NumCell } from '@/components/ui/numeric-table';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { History, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

const BudgetChangesTab = ({ afeId, changes, currentBudget, onRefresh }) => {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    description: '',
    amount: 0,
    reason: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('afe_changes').insert([{
      ...formData,
      afe_id: afeId,
      status: 'Pending'
    }]);

    if (error) toast({ variant: 'destructive', title: 'Error', description: error.message });
    else {
      toast({ title: 'Success', description: 'Change request submitted.' });
      setIsDialogOpen(false);
      onRefresh();
    }
  };

  const handleAction = async (change, action) => {
    if (action === 'Approved') {
      const { data: afe } = await supabase.from('afes').select('budget').eq('id', afeId).single();
      await supabase.from('afes').update({ budget: (afe.budget || 0) + Number(change.amount) }).eq('id', afeId);
    }
    
    await supabase.from('afe_changes').update({ status: action }).eq('id', change.id);
    onRefresh();
  };

  return (
    <div className="space-y-4 rounded-lg border border-pl-border bg-pl-surface p-4 shadow-pl-sm">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h3 className="text-lg font-semibold text-pl-text">Change Control Log</h3>
          <p className="text-xs text-pl-muted">Current Approved Budget: <span className="font-pl-mono tabular-nums text-pl-text">${currentBudget.toLocaleString()}</span></p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <History className="w-4 h-4 mr-2" /> Request Change
        </Button>
      </div>

      <NumericTable className="p-0" data-testid="afe-changes-table">
        <thead>
          <tr>
            <NumTh>Date</NumTh>
            <NumTh>Description</NumTh>
            <NumTh>Reason</NumTh>
            <NumTh numeric>Amount</NumTh>
            <NumTh className="text-center">Status</NumTh>
            <NumTh className="text-center">Action</NumTh>
          </tr>
        </thead>
        <tbody>
          {changes.map(change => (
            <NumRow key={change.id}>
              <td className="border-b border-pl-border px-3 py-2 whitespace-nowrap font-pl-mono text-xs tabular-nums text-pl-muted">{new Date(change.created_at).toLocaleDateString()}</td>
              <td className="border-b border-pl-border px-3 py-2 text-pl-text">{change.description}</td>
              <td className="border-b border-pl-border px-3 py-2 text-sm text-pl-muted">{change.reason}</td>
              <NumCell value={Number(change.amount)}>
                {change.amount > 0 ? '+' : ''}{Number(change.amount).toLocaleString()}
              </NumCell>
              <td className="border-b border-pl-border px-3 py-2 text-center">
                <Badge variant={
                  change.status === 'Approved' ? 'success' :
                  change.status === 'Rejected' ? 'danger' : 'warning'
                }>{change.status}</Badge>
              </td>
              <td className="border-b border-pl-border px-3 py-2 text-center">
                {change.status === 'Pending' && (
                  <div className="flex justify-center gap-2">
                    <Button size="icon" variant="ghost" aria-label="Approve change" title="Approve" onClick={() => handleAction(change, 'Approved')} className="text-pl-success-text hover:bg-pl-success-bg"><CheckCircle className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Reject change" title="Reject" onClick={() => handleAction(change, 'Rejected')} className="text-pl-danger-text hover:bg-pl-danger-bg"><XCircle className="w-4 h-4" /></Button>
                  </div>
                )}
              </td>
            </NumRow>
          ))}
          {changes.length === 0 && (
            <tr><td colSpan={6} className="text-center py-8 text-pl-muted">No changes recorded.</td></tr>
          )}
        </tbody>
      </NumericTable>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Budget Change</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Description</Label>
              <Input value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required />
            </div>
            <div>
              <Label>Amount ($)</Label>
              <Input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})} required placeholder="+ for increase, - for decrease" />
            </div>
            <div>
              <Label>Reason / Justification</Label>
              <Input value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} required />
            </div>
            <DialogFooter>
              <Button type="submit">Submit Request</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BudgetChangesTab;