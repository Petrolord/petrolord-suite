import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2, Save, ListTodo, Flag } from 'lucide-react';

const TaskFormDialog = ({ open, onOpenChange, project, existingTask, parentTaskId, onSaved, tasks = [], initialType }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [type, setType] = useState('task');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [owner, setOwner] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [status, setStatus] = useState('To Do');
  const [percentComplete, setPercentComplete] = useState(0);
  const [selectedParent, setSelectedParent] = useState('none');
  const [description, setDescription] = useState('');

  // Strictly check if we have a valid task ID to determine Edit mode
  const isEditMode = Boolean(existingTask && existingTask.id);

  useEffect(() => {
    if (isEditMode) {
      setName(existingTask.name || '');
      setType(existingTask.type || 'task');
      setStartDate(existingTask.planned_start_date ? new Date(existingTask.planned_start_date).toISOString().split('T')[0] : '');
      setEndDate(existingTask.planned_end_date ? new Date(existingTask.planned_end_date).toISOString().split('T')[0] : '');
      setOwner(existingTask.owner || '');
      setPriority(existingTask.priority || 'Medium');
      setStatus(existingTask.status || 'To Do');
      setPercentComplete(existingTask.percent_complete || 0);
      setSelectedParent(existingTask.parent_task_id || 'none');
      setDescription(existingTask.description || '');
    } else {
      setName('');
      // Use existingTask.type as fallback for backwards compatibility with old caller components
      setType(existingTask?.type || initialType || 'task');
      setStartDate(new Date().toISOString().split('T')[0]);
      setEndDate(new Date().toISOString().split('T')[0]);
      setOwner('');
      setPriority('Medium');
      setStatus('To Do');
      setPercentComplete(0);
      setSelectedParent(parentTaskId || 'none');
      setDescription('');
    }
  }, [existingTask, isEditMode, parentTaskId, open, initialType]);

  const validateForm = () => {
    if (!name.trim()) return "Name cannot be empty.";
    if (!startDate) return "Start date is required.";
    if (!endDate) return "End date is required.";
    if (new Date(startDate) > new Date(endDate)) return "Start date cannot be after end date.";
    
    if (!isEditMode) {
       const isDuplicate = tasks.some(t => t.name.toLowerCase() === name.trim().toLowerCase() && t.type === type);
       if (isDuplicate) return `A ${type} with this name already exists in the project.`;
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!project) {
        toast({ variant: "destructive", title: "No project selected." });
        return;
    }

    const validationError = validateForm();
    if (validationError) {
        toast({ variant: "destructive", title: "Validation Error", description: validationError });
        return;
    }

    setLoading(true);

    const payload = {
        project_id: project.id,
        name: name.trim(),
        type,
        planned_start_date: startDate,
        planned_end_date: endDate,
        owner,
        priority,
        status,
        percent_complete: percentComplete,
        parent_task_id: selectedParent === 'none' ? null : selectedParent,
        description: description ? description.trim() : null
    };

    let error;

    try {
        if (isEditMode) {
            // Additional safety guard against undefined IDs in PATCH requests
            if (!existingTask.id) {
                throw new Error("Task ID is missing. Cannot perform update.");
            }
            
            console.log(`[TaskFormDialog] Updating existing ${type} with ID:`, existingTask.id);
            const { error: updateError, data } = await supabase
                .from('tasks')
                .update(payload)
                .eq('id', existingTask.id)
                .select();
                
            error = updateError;
            if (!error && data?.length) {
                console.log(`[TaskFormDialog] Successfully updated ${type}:`, data[0].id);
            }
        } else {
            console.log(`[TaskFormDialog] Creating new ${type}...`);
            const { count } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('project_id', project.id);
            payload.display_order = (count || 0) + 1;
            
            if (type === 'milestone') {
                payload.milestone_details = { readiness_score: 0, approvers: [], criteria: [] };
            }
            
            const { error: insertError, data } = await supabase
                .from('tasks')
                .insert([payload])
                .select();
                
            error = insertError;
            if (!error && data?.length) {
                console.log(`[TaskFormDialog] Successfully created new ${type} with ID:`, data[0].id);
            }
        }
    } catch (err) {
        console.error(`[TaskFormDialog] Exception caught during save:`, err);
        error = err;
    }

    setLoading(false);

    if (error) {
        console.error(`[TaskFormDialog] DB Error:`, error);
        toast({ 
            variant: "destructive", 
            title: `Error ${isEditMode ? 'updating' : 'creating'} ${type}`, 
            description: error.message || "An unexpected error occurred." 
        });
    } else {
        toast({ 
            title: "Success", 
            description: `${type === 'task' ? 'Task' : 'Milestone'} ${isEditMode ? 'updated' : 'created'} successfully.` 
        });
        if (onSaved) onSaved();
        onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === 'milestone' ? <Flag className="w-5 h-5 text-purple-400" /> : <ListTodo className="w-5 h-5 text-blue-400" />}
            {isEditMode ? `Edit ${type === 'milestone' ? 'Milestone' : 'Task'}` : `Add New ${type === 'milestone' ? 'Milestone' : 'Task'}`}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Fill in the details below. Required fields are marked with an asterisk (*).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2 md:col-span-1">
                    <Label>Name *</Label>
                    <Input placeholder="e.g. Phase 1 Review" value={name} onChange={e => setName(e.target.value)} className="bg-slate-800 border-slate-700 text-white" required />
                </div>
                <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={type} onValueChange={setType} disabled={isEditMode}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700 text-white">
                            <SelectItem value="task">Task</SelectItem>
                            <SelectItem value="milestone">Milestone</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Start Date *</Label>
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-800 border-slate-700 text-white [color-scheme:dark]" required />
                </div>
                <div className="space-y-2">
                    <Label>End Date *</Label>
                    <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-800 border-slate-700 text-white [color-scheme:dark]" required />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Owner/Assignee</Label>
                    <Input placeholder="e.g. John Doe" value={owner} onChange={e => setOwner(e.target.value)} className="bg-slate-800 border-slate-700 text-white" />
                </div>
                <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={priority} onValueChange={setPriority}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700 text-white">
                            <SelectItem value="Low">Low</SelectItem>
                            <SelectItem value="Medium">Medium</SelectItem>
                            <SelectItem value="High">High</SelectItem>
                            <SelectItem value="Critical">Critical</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700 text-white">
                            <SelectItem value="To Do">To Do</SelectItem>
                            <SelectItem value="In Progress">In Progress</SelectItem>
                            <SelectItem value="Review">Review</SelectItem>
                            <SelectItem value="Done">Done</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>Progress (%)</Label>
                    <Input type="number" min="0" max="100" value={percentComplete} onChange={e => setPercentComplete(parseInt(e.target.value) || 0)} className="bg-slate-800 border-slate-700 text-white" />
                </div>
            </div>

            <div className="space-y-2">
                <Label>Parent Task / Dependency</Label>
                <Select value={selectedParent} onValueChange={setSelectedParent}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                        <SelectItem value="none">None</SelectItem>
                        {tasks.filter(t => t.id !== existingTask?.id && t.type === 'task').map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label>Description</Label>
                <Textarea 
                    placeholder="Add notes or descriptions..." 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    className="bg-slate-800 border-slate-700 text-white min-h-[80px]" 
                />
            </div>

            <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    Save {type === 'milestone' ? 'Milestone' : 'Task'}
                </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TaskFormDialog;