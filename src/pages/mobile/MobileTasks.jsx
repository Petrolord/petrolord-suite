import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const MobileTasks = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (user) fetchTasks();
  }, [user]);

  const fetchTasks = async () => {
    // In a real app, we'd join with projects to verify ownership or check assigned_to
    // For this demo, fetching all tasks in user's projects (implied ownership via RLS usually)
    // Assuming we fetch tasks for user's projects
    const { data: projectIds } = await supabase.from('projects').select('id').eq('user_id', user.id);
    const ids = projectIds.map(p => p.id);
    
    if (ids.length > 0) {
        const { data } = await supabase.from('tasks')
            .select('*')
            .in('project_id', ids)
            .order('planned_end_date', { ascending: true });
        setTasks(data || []);
    }
  };

  const toggleTask = async (taskId, currentStatus) => {
      const newStatus = currentStatus === 'Done' ? 'To Do' : 'Done';
      const newPercent = newStatus === 'Done' ? 100 : 0;
      
      // Optimistic update
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus, percent_complete: newPercent } : t));

      await supabase.from('tasks').update({ status: newStatus, percent_complete: newPercent }).eq('id', taskId);
  };

  const filteredTasks = tasks.filter(t => {
      if (filter === 'todo') return t.status !== 'Done';
      if (filter === 'done') return t.status === 'Done';
      return true;
  });

  return (
    <div className="p-4 space-y-4 min-h-full pb-24">
        <h1 className="text-lg font-bold text-pl-text">Tasks</h1>
        
        <Tabs defaultValue="all" onValueChange={setFilter} className="w-full">
            <TabsList className="w-full">
                <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
                <TabsTrigger value="todo" className="flex-1">To Do</TabsTrigger>
                <TabsTrigger value="done" className="flex-1">Done</TabsTrigger>
            </TabsList>
        </Tabs>

        <div className="space-y-2 mt-4">
            {filteredTasks.map(task => (
                <div key={task.id} className="flex items-start space-x-3 p-3 bg-pl-surface border border-pl-border rounded-lg">
                    <Checkbox 
                        checked={task.status === 'Done'} 
                        onCheckedChange={() => toggleTask(task.id, task.status)}
                        className="mt-1"
                    />
                    <div className="flex-1">
                        <p className={`text-sm font-medium ${task.status === 'Done' ? 'text-pl-muted line-through' : 'text-pl-text'}`}>
                            {task.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-pl-muted">
                            <Calendar className="w-3 h-3" />
                            <span>{new Date(task.planned_end_date).toLocaleDateString()}</span>
                            {task.project_id && <Badge variant="neutral" className="ml-auto px-1.5 py-0 text-[10px]">Proj</Badge>}
                        </div>
                    </div>
                </div>
            ))}
            {filteredTasks.length === 0 && (
                <div className="text-center text-pl-muted mt-10 py-10">No tasks in this view.</div>
            )}
        </div>
    </div>
  );
};

export default MobileTasks;