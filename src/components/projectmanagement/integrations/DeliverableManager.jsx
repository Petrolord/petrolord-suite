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

  const statusVariant = (status) => {
      switch(status) {
          case 'Approved': return 'success';
          case 'Under Review': return 'warning';
          default: return 'neutral';
      }
  };

  return (
    <div className="space-y-4">
        <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-pl-text flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-pl-muted" aria-hidden="true" /> Project Deliverables
            </h3>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} className="border-dashed">
                <Plus className="w-4 h-4 mr-2" /> Add Deliverable
            </Button>
        </div>

        <div className="rounded-md border border-pl-border bg-pl-surface overflow-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Deliverable Name</TableHead>
                        <TableHead>Source App</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {deliverables.map((item) => (
                        <TableRow key={item.id} className="border-b border-pl-border hover:bg-pl-sunken/60">
                            <TableCell className="font-medium text-pl-text">{item.name}</TableCell>
                            <TableCell>
                                <Badge variant="neutral">{item.app_source}</Badge>
                            </TableCell>
                            <TableCell className="text-pl-muted font-pl-mono text-xs">{item.version}</TableCell>
                            <TableCell className="text-pl-muted text-xs">{format(new Date(item.created_at), 'MMM dd, yyyy')}</TableCell>
                            <TableCell>
                                <Badge variant={statusVariant(item.status)}>
                                    {item.status}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                                {item.status !== 'Approved' ? (
                                    <Button 
                                        size="sm" 
                                        variant="ghost" 
                                        className="text-pl-primary-text hover:text-pl-primary-text-hover"
                                        onClick={() => handleStatusChange(item, item.status === 'Draft' ? 'Under Review' : 'Approved')}
                                    >
                                        {item.status === 'Draft' ? 'Submit Review' : 'Approve'}
                                    </Button>
                                ) : (
                                    <span className="text-pl-success-text flex justify-end items-center gap-1 text-xs">
                                        <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Approved
                                    </span>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                    {deliverables.length === 0 && (
                        <TableRow>
                            <TableCell colSpan="6" className="text-center py-8 text-pl-muted">No deliverables tracked.</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setCreateOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Register Deliverable</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label>Deliverable Name</Label>
                        <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Final Pore Pressure Report" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Source Application</Label>
                            <Select value={newSource} onValueChange={setNewSource}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
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
                            <Input value={newVersion} onChange={e => setNewVersion(e.target.value)} />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreate} disabled={loading}>Create</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
};

export default DeliverableManager;