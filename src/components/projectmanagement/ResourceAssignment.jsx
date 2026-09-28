import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from '@/components/ui/button';
import { Slider } from "@/components/ui/slider";
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { UserPlus, Trash2, CalendarClock } from 'lucide-react';
import { format } from 'date-fns';

const ResourceAssignment = ({ task, resources, assignments, onUpdate }) => {
  const { toast } = useToast();
  const [selectedResource, setSelectedResource] = useState('');
  const [allocation, setAllocation] = useState(100);
  const [role, setRole] = useState('Member');

  const currentAssignments = assignments.filter(a => a.task_id === task.id);

  const handleAssign = async () => {
    if (!selectedResource) return;

    const newAssignment = {
        task_id: task.id,
        resource_id: selectedResource,
        role: role,
        allocation_percent: allocation,
        start_date: task.planned_start_date,
        end_date: task.planned_end_date
    };

    const { error } = await supabase.from('pm_resource_assignments').insert([newAssignment]);

    if (error) {
        toast({ variant: 'destructive', title: 'Assignment Failed', description: error.message });
    } else {
        toast({ title: 'Resource Assigned' });
        setSelectedResource('');
        onUpdate();
    }
  };

  const handleRemove = async (assignmentId) => {
      const { error } = await supabase.from('pm_resource_assignments').delete().eq('id', assignmentId);
      if (error) {
          toast({ variant: 'destructive', title: 'Removal Failed', description: error.message });
      } else {
          onUpdate();
      }
  };

  return (
    <div className="space-y-4 p-2">
      <div className="space-y-3 border-b border-pl-border pb-4">
        <h4 className="text-sm font-medium text-pl-text flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-pl-muted" /> New Assignment
        </h4>
        
        <Select value={selectedResource} onValueChange={setSelectedResource}>
            <SelectTrigger>
                <SelectValue placeholder="Select Resource" />
            </SelectTrigger>
            <SelectContent>
                {resources.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name} - {r.discipline}</SelectItem>
                ))}
            </SelectContent>
        </Select>

        <div className="grid grid-cols-2 gap-3">
            <div>
                <Label className="text-[10px] text-pl-muted">Role</Label>
                <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Primary Owner">Primary Owner</SelectItem>
                        <SelectItem value="Member">Member</SelectItem>
                        <SelectItem value="Support">Support</SelectItem>
                        <SelectItem value="Reviewer">Reviewer</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label className="text-[10px] text-pl-muted">Allocation: {allocation}%</Label>
                <Slider 
                    value={[allocation]} 
                    onValueChange={vals => setAllocation(vals[0])} 
                    max={100} step={10} 
                    className="mt-2"
                />
            </div>
        </div>

        <Button onClick={handleAssign} disabled={!selectedResource} size="sm" className="w-full">
            Assign Resource
        </Button>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-bold uppercase text-pl-muted">Current Team</h4>
        {currentAssignments.length === 0 && <p className="text-xs text-pl-muted italic">No resources assigned.</p>}
        
        {currentAssignments.map(assign => {
            const res = resources.find(r => r.id === assign.resource_id);
            if (!res) return null;
            return (
                <div key={assign.id} className="flex items-center justify-between p-2 bg-pl-sunken rounded border border-pl-border">
                    <div>
                        <div className="font-bold text-sm text-pl-text">{res.name}</div>
                        <div className="text-[10px] text-pl-muted">{assign.role} • {assign.allocation_percent}%</div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-pl-muted hover:text-pl-danger-text" aria-label="Remove assignment" onClick={() => handleRemove(assign.id)}>
                        <Trash2 className="w-3 h-3" />
                    </Button>
                </div>
            );
        })}
      </div>
    </div>
  );
};

export default ResourceAssignment;