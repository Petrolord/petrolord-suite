import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { FileCheck, Clock, AlertCircle, CheckCircle2, Plus } from 'lucide-react';
import { format } from 'date-fns';

const DeliverableManager = ({ project, deliverables = [], onUpdate }) => {
  const { toast } = useToast();
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [newName, setNewName] = useState('');
  const [newSource, setNewSource] = useState('PPFG');
  const [newVersion, setNewVersion] = useState('v1.0');

  const handleStatusChange = async (deliverable, newStatus) => {
    const updates = {
        status: newStatus,
        updated_at: new Date(),
        approved_date: newStatus === 'Approved' ? new Date() : deliverable.approved_date
    };
    
    const { error } = await supabase.from('pm_deliverables').update(updates).eq('id', deliverable.id);
    
    if (error) {
        toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
    } else {
        toast({ title: 'Status Updated', description: `${deliverable.name} is now ${newStatus}` });
        onUpdate();
    }
  };

  const handleCreate = async () => {
      if (!newName) return;
      setLoading(true);
      const { error } = await supabase.from('pm_deliverables').insert({
          project_id: project.id,
          name: newName,
          app_source: newSource,
          version: newVersion,
          status: 'Draft',
          created_by: (await supabase.auth.getUser()).data.user.id
      });

      setLoading(false);
      if (error) {
          toast({ variant: 'destructive', title: 'Creation Failed', description: error.message });
      } else {
          toast({ title: 'Deliverable Created', description: newName });
          setCreateOpen(false);
          setNewName('');
          onUpdate();
      }
  };

  const getStatusColor = (status) => {
      switch(status) {
          case 'Approved': return 'bg-green-500/20 text-green-400 border-green-500/50';
          case 'Under Review': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
          default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
      }
  };

  return (
    <div className="space-y-4">
        <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                <FileCheck className="w-4 h-4" /> Project Deliverables
            </h3>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} className="border-dashed border-slate-600 hover:bg-slate-800">
                <Plus className="w-4 h-4 mr-2" /> Add Deliverable
            </Button>
        </div>

        <div className="rounded-md border border-slate-800 bg-slate-900/50 overflow-hidden">
            <Table>
                <TableHeader className="bg-slate-900">
                    <TableRow>
                        <TableHead className="text-slate-400">Deliverable Name</TableHead>
                        <TableHead className="text-slate-400">Source App</TableHead>
                        <TableHead className="text-slate-400">Version</TableHead>
                        <TableHead className="text-slate-400">Date</TableHead>
                        <TableHead className="text-slate-400">Status</TableHead>
                        <TableHead className="text-right text-slate-400">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {deliverables.map((item) => (
                        <TableRow key={item.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                            <TableCell className="font-medium text-white">{item.name}</TableCell>
                            <TableCell>
                                <Badge variant="outline" className="bg-blue-950/30 text-blue-400 border-blue-900">{item.app_source}</Badge>
                            </TableCell>
                            <TableCell className="text-slate-400 font-mono text-xs">{item.version}</TableCell>
                            <TableCell className="text-slate-400 text-xs">{format(new Date(item.created_at), 'MMM dd, yyyy')}</TableCell>
                            <TableCell>
                                <span className={`text-xs px-2 py-0.5 rounded border ${getStatusColor(item.status)}`}>
                                    {item.status}
                                </span>
                            </TableCell>
                            <TableCell className="text-right">
                                {item.status !== 'Approved' ? (
                                    <Button 
                                        size="sm" 
                                        variant="ghost" 
                                        className="text-green-400 hover:text-green-300 hover:bg-green-950/30"
                                        onClick={() => handleStatusChange(item, item.status === 'Draft' ? 'Under Review' : 'Approved')}
                                    >
                                        {item.status === 'Draft' ? 'Submit Review' : 'Approve'}
                                    </Button>
                                ) : (
                                    <span className="text-green-500 flex justify-end items-center gap-1 text-xs">
                                        <CheckCircle2 className="w-3 h-3" /> Approved
                                    </span>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                    {deliverables.length === 0 && (
                        <TableRow>
                            <TableCell colSpan="6" className="text-center py-8 text-slate-500">No deliverables tracked.</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setCreateOpen}>
            {/* Interim (rollout 6C): a dark island until this file moves to theme roles; remove data-pl-theme then. */}
            <DialogContent data-pl-theme="dark" className="bg-slate-900 border-slate-700 text-white">
                <DialogHeader>
                    <DialogTitle>Register Deliverable</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label>Deliverable Name</Label>
                        <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Final Pore Pressure Report" className="bg-slate-800 border-slate-700" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Source Application</Label>
                            <Select value={newSource} onValueChange={setNewSource}>
                                <SelectTrigger className="bg-slate-800 border-slate-700">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                                    <SelectItem value="PPFG">PPFG Analysis</SelectItem>
                                    <SelectItem value="Velocity Model">Velocity Model</SelectItem>
                                    <SelectItem value="Log Facies">Log Facies</SelectItem>
                                    <SelectItem value="1D Geomech">1D Geomech</SelectItem>
                                    <SelectItem value="BasinFlow">BasinFlow Genesis</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Version</Label>
                            <Input value={newVersion} onChange={e => setNewVersion(e.target.value)} className="bg-slate-800 border-slate-700" />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreate} disabled={loading} className="bg-blue-600 hover:bg-blue-700">Create</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
};

export default DeliverableManager;