// JV partner management (Economics E4).
//
// Partners lived in React state seeded with two invented companies, "Partner
// A Corp" at 30 percent and "Partner B Ltd" at 15 percent. Every user opening
// this tab met the same two fictional partners, could generate a billing
// statement against them, and lost anything they typed on reload. Partners
// are real data now: they belong to the AFE and persist with it.
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Users, PlusCircle, DollarSign, FileText, Trash2, Send } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { calculatePartnerCosts, generateBillingStatement } from '@/utils/afeServices';
import { supabase } from '@/lib/customSupabaseClient';
import { AlertTriangle } from 'lucide-react';

const JVPartnerManagement = ({ afe, costItems }) => {
  const { toast } = useToast();
  const [partners, setPartners] = useState([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newPartner, setNewPartner] = useState({ name: '', working_interest: 0 });

  const loadPartners = useCallback(async () => {
    if (!afe?.id) { setPartners([]); return; }
    const { data, error } = await supabase
      .from('afe_partners')
      .select('*')
      .eq('afe_id', afe.id)
      .order('created_at', { ascending: true });
    if (error) {
      // A missing table is the one failure that is neither the user's fault
      // nor transient; say which migration fixes it.
      const missing = error.code === '42P01';
      toast({
        variant: 'destructive',
        title: 'Could not load partners',
        description: missing
          ? "Partner records aren't set up yet. Run the e4_afe_partners migration."
          : error.message,
      });
      return;
    }
    setPartners(data || []);
  }, [afe?.id, toast]);

  useEffect(() => { loadPartners(); }, [loadPartners]);

  const totalActuals = useMemo(() => costItems.reduce((sum, item) => sum + (item.actual || 0), 0), [costItems]);
  const {
    partnerAllocations, operatorShare, operatorAmount, valid, note,
  } = useMemo(() => calculatePartnerCosts(totalActuals, partners), [totalActuals, partners]);

  const handleAddPartner = async () => {
    if (!newPartner.name) {
        toast({ variant: 'destructive', title: 'Name the partner', description: 'A partner needs a name.' });
        return;
    }
    if (operatorShare - Number(newPartner.working_interest) < 0) {
        toast({ variant: 'destructive', title: 'Error', description: 'Total working interest cannot exceed 100%.' });
        return;
    }
    const { error } = await supabase.from('afe_partners').insert({
        afe_id: afe.id,
        name: newPartner.name,
        working_interest: Number(newPartner.working_interest) || 0,
        partner_type: 'Non-Operator',
    });
    if (error) {
        toast({ variant: 'destructive', title: 'Could not add partner', description: error.message });
        return;
    }
    setIsDialogOpen(false);
    setNewPartner({ name: '', working_interest: 0 });
    loadPartners();
  };

  const handleDelete = async (id) => {
      const { error } = await supabase.from('afe_partners').delete().eq('id', id);
      if (error) {
          toast({ variant: 'destructive', title: 'Could not remove partner', description: error.message });
          return;
      }
      loadPartners();
  };

  const handleGenerateBill = (partner, amount) => {
      generateBillingStatement(afe, partner, amount, new Date().toLocaleString('default', { month: 'long', year: 'numeric' }));
      toast({ title: 'Statement Generated', description: `Billing PDF for ${partner.name} downloaded.` });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
                <p className="text-sm text-slate-400">Gross Cost (100%)</p>
                <h3 className="text-2xl font-bold text-white mt-1">${totalActuals.toLocaleString()}</h3>
            </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
                <p className="text-sm text-slate-400">Operator Share ({operatorShare.toFixed(2)}%)</p>
                <h3 className="text-2xl font-bold text-blue-400 mt-1">${operatorAmount.toLocaleString()}</h3>
            </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
                <p className="text-sm text-slate-400">Partner Recoverable</p>
                <h3 className="text-2xl font-bold text-green-400 mt-1">${(totalActuals - operatorAmount).toLocaleString()}</h3>
            </CardContent>
        </Card>
      </div>

      {!valid && (
        <div className="flex items-start gap-2 rounded border border-red-800 bg-red-950/40 p-3">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-200">{note}</p>
        </div>
      )}

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-medium text-slate-200">Joint Venture Partners</CardTitle>
            <Button onClick={() => setIsDialogOpen(true)} size="sm" className="bg-blue-600 hover:bg-blue-700">
                <PlusCircle className="w-4 h-4 mr-2" /> Add Partner
            </Button>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow className="border-slate-800">
                        <TableHead className="text-slate-400">Partner Name</TableHead>
                        <TableHead className="text-slate-400">Type</TableHead>
                        <TableHead className="text-right text-slate-400">Working Interest</TableHead>
                        <TableHead className="text-right text-slate-400">Current Share of Cost</TableHead>
                        <TableHead className="text-right text-slate-400">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow className="border-slate-800 bg-slate-800/30">
                        <TableCell className="font-bold text-white">Petrolord (Operator)</TableCell>
                        <TableCell className="text-slate-400">Operator</TableCell>
                        <TableCell className="text-right font-mono text-blue-300">{operatorShare.toFixed(2)}%</TableCell>
                        <TableCell className="text-right font-mono text-white">${operatorAmount.toLocaleString()}</TableCell>
                        <TableCell></TableCell>
                    </TableRow>
                    {partnerAllocations.map(partner => (
                        <TableRow key={partner.id} className="border-slate-800">
                            <TableCell className="text-slate-200">{partner.name}</TableCell>
                            <TableCell className="text-slate-400">{partner.type}</TableCell>
                            <TableCell className="text-right font-mono text-slate-300">{partner.working_interest}%</TableCell>
                            <TableCell className="text-right font-mono text-white">${partner.shareAmount.toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => handleGenerateBill(partner, partner.shareAmount)} title="Generate Bill">
                                        <FileText className="w-4 h-4 text-green-400" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleDelete(partner.id)} title="Remove">
                                        <Trash2 className="w-4 h-4 text-red-400" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
            <DialogHeader><DialogTitle>Add JV Partner</DialogTitle></DialogHeader>
            <div className="space-y-4">
                <div>
                    <Label>Partner Name</Label>
                    <Input value={newPartner.name} onChange={e => setNewPartner({...newPartner, name: e.target.value})} className="bg-slate-800 border-slate-700" />
                </div>
                <div>
                    <Label>Working Interest (%)</Label>
                    <Input type="number" value={newPartner.working_interest} onChange={e => setNewPartner({...newPartner, working_interest: parseFloat(e.target.value)})} className="bg-slate-800 border-slate-700" />
                </div>
            </div>
            <DialogFooter>
                <Button onClick={handleAddPartner} className="bg-blue-600">Add Partner</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JVPartnerManagement;