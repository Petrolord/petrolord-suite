import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TASK_TEMPLATES } from '@/utils/taskTemplates';
import { addDays } from 'date-fns';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Briefcase, Calendar } from 'lucide-react';

const TaskTemplateDialog = ({ open, onOpenChange, projectId, onTasksAdded }) => {
  const { toast } = useToast();
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedTasks, setSelectedTasks] = useState({});
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeTemplate = TASK_TEMPLATES.find(t => t.id === selectedTemplateId);

  const handleTemplateChange = (value) => {
    setSelectedTemplateId(value);
    const template = TASK_TEMPLATES.find(t => t.id === value);
    if (template) {
      // Select all tasks by default
      const allSelected = {};
      template.tasks.forEach((_, idx) => allSelected[idx] = true);
      setSelectedTasks(allSelected);
    }
  };

  const toggleTask = (index) => {
    setSelectedTasks(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const handleSubmit = async () => {
    if (!projectId || !activeTemplate) return;

    setIsSubmitting(true);
    try {
      // Prepare tasks for insertion
      let currentOffset = 0;
      const tasksToInsert = activeTemplate.tasks
        .filter((_, idx) => selectedTasks[idx])
        .map(task => {
           const start = addDays(new Date(startDate), currentOffset);
           const end = addDays(start, task.duration);
           
           // Update offset for next task (simple sequential assumption for template)
           currentOffset += task.duration;

           return {
             project_id: projectId,
             name: task.name,
             type: task.category === 'Milestone' ? 'milestone' : 'task',
             planned_start_date: start.toISOString(),
             planned_end_date: end.toISOString(),
             status: 'To Do',
             percent_complete: 0,
             workstream: task.workstream,
             task_category: task.category,
             display_order: 999 // Database can handle sorting or we fetch max first
           };
        });
      
      if (tasksToInsert.length === 0) {
         toast({ variant: "destructive", title: "No tasks selected" });
         setIsSubmitting(false);
         return;
      }

      const { error } = await supabase.from('tasks').insert(tasksToInsert);

      if (error) throw error;

      toast({ title: "Success", description: `Added ${tasksToInsert.length} tasks from ${activeTemplate.name}` });
      onTasksAdded();
      onOpenChange(false);
      setSelectedTemplateId('');

    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error adding tasks", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-pl-muted" />
            Import Task Template
          </DialogTitle>
          <DialogDescription className="text-pl-muted">
            Select a standard work pack to bulk-create tasks for your project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <label className="text-sm font-medium text-pl-text">Select Template</label>
                <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                    <SelectTrigger>
                    <SelectValue placeholder="Choose a pack..." />
                    </SelectTrigger>
                    <SelectContent>
                    {TASK_TEMPLATES.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <label className="text-sm font-medium text-pl-text">Start Date</label>
                <div className="relative">
                    <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-pl-muted" />
                    <input 
                        type="date" 
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full h-10 pl-9 rounded-md border border-pl-border-strong bg-pl-surface text-sm text-pl-text focus:outline-none focus:ring-2 focus:ring-pl-focus"
                    />
                </div>
            </div>
          </div>

          {activeTemplate && (
            <div className="border border-pl-border rounded-md overflow-hidden bg-pl-surface">
              <div className="p-2 bg-pl-sunken border-b border-pl-border text-xs font-semibold text-pl-muted flex justify-between">
                <span>Tasks to Import</span>
                <span>Duration: {activeTemplate.tasks.reduce((acc, t) => acc + t.duration, 0)} days approx</span>
              </div>
              <ScrollArea className="h-[300px]">
                <div className="p-2 space-y-1">
                    {activeTemplate.tasks.map((task, idx) => (
                        <div key={idx} className="flex items-center space-x-2 p-2 hover:bg-pl-sunken/60 rounded group">
                            <Checkbox 
                                id={`task-${idx}`} 
                                checked={!!selectedTasks[idx]}
                                onCheckedChange={() => toggleTask(idx)}
                            />
                            <label htmlFor={`task-${idx}`} className="text-sm flex-1 cursor-pointer flex justify-between">
                                <span className={selectedTasks[idx] ? 'text-pl-text' : 'text-pl-muted'}>{task.name}</span>
                                <span className="text-xs text-pl-muted flex items-center gap-2">
                                    <Badge variant="neutral" className="text-[10px] h-4 px-1">{task.workstream}</Badge>
                                    {task.duration}d
                                </span>
                            </label>
                        </div>
                    ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!selectedTemplateId || isSubmitting}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Import Tasks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TaskTemplateDialog;