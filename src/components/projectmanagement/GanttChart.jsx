import React, { useRef, useState } from 'react';
import { Gantt, ViewMode } from 'gantt-task-react';
import ChartLogo from '@/components/charts/ChartLogo';
import "gantt-task-react/dist/index.css";
import { Button } from '@/components/ui/button';
import { Download, ZoomIn, ZoomOut } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

const GanttChart = ({ tasks, projectName, companyName, onDataChange }) => {
  const ganttRef = useRef(null);
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState(ViewMode.Month);

  const getBarColor = (task) => {
    if (task.type === 'milestone') return '#a855f7'; // purple
    if (task.progress === 100) return '#22c55e'; // green
    if (new Date(task.end) < new Date() && task.progress < 100) return '#ef4444'; // red
    return '#3b82f6'; // blue
  };

  // Map Supabase tasks to gantt-task-react format
  const ganttTasks = tasks.map(task => ({
    start: new Date(task.start || task.planned_start_date),
    end: new Date(task.end || task.planned_end_date),
    name: task.name,
    id: task.id,
    type: task.type === 'milestone' ? 'milestone' : 'task',
    progress: task.percent_complete || 0,
    isDisabled: false,
    styles: {
      backgroundColor: getBarColor({ ...task, progress: task.percent_complete, end: task.planned_end_date }),
      backgroundSelectedColor: '#ffffff', // highlight on select
      progressColor: '#ffffff',
      progressSelectedColor: '#ffffff',
    },
    dependencies: task.predecessors || [] // Use predecessors from DB
  }));

  // Ensure at least one task exists to prevent crashes
  if (ganttTasks.length === 0) {
    return (
        <div className="flex items-center justify-center h-64 border border-dashed border-slate-700 rounded-lg bg-slate-900/50 text-slate-500">
            No tasks to display in timeline. Add tasks or import a template.
        </div>
    );
  }

  const handleTaskChange = async (task) => {
    // Update DB when task is dragged/resized in Gantt
    const { error } = await supabase
      .from('tasks')
      .update({
        planned_start_date: task.start.toISOString(),
        planned_end_date: task.end.toISOString(),
      })
      .eq('id', task.id);

    if (error) {
      toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
    } else {
      onDataChange();
    }
  };

  const handleProgressChange = async (task) => {
    const { error } = await supabase
      .from('tasks')
      .update({
        percent_complete: task.progress,
        status: task.progress === 100 ? 'Done' : task.progress > 0 ? 'In Progress' : 'To Do'
      })
      .eq('id', task.id);

    if (error) {
       toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
    } else {
       onDataChange();
    }
  };

  const handleExport = () => {
    toast({ title: 'Export Feature', description: "Coming soon! Currently restricted by browser permissions." });
  };

  const toggleViewMode = () => {
      setViewMode(prev => {
          if (prev === ViewMode.Month) return ViewMode.Week;
          if (prev === ViewMode.Week) return ViewMode.Day;
          return ViewMode.Month;
      });
  };

  return (
    <div className="gantt-container text-white h-full flex flex-col">
      <div id="gantt-export-container" className="bg-slate-900 p-4 rounded-lg border border-slate-800 h-full flex flex-col" ref={ganttRef}>
        <div className="flex justify-between items-center mb-4">
          <div>
              <h3 className="text-xl font-bold text-white">{projectName}</h3>
              <p className="text-md text-slate-300">{companyName || 'Project Schedule'}</p>
          </div>
          <div className="flex gap-2">
              <Button onClick={toggleViewMode} variant="outline" size="sm" className="text-white border-slate-600 hover:bg-slate-800">
                {viewMode === ViewMode.Month ? <ZoomIn className="w-4 h-4 mr-2" /> : <ZoomOut className="w-4 h-4 mr-2" />}
                {viewMode} View
              </Button>
              <Button onClick={handleExport} variant="outline" size="sm" className="text-white border-lime-400 hover:bg-lime-500/20">
                <Download className="w-4 h-4 mr-2" />Export
              </Button>
          </div>
        </div>
        
        
        {/* Senior test T1 (2026-09-27): the dark theme here set CSS variables
            gantt-task-react never reads, so the task list inherited white
            text over the library's light zebra rows and every second task
            was unreadable. The chart now sits on the Suite's white chart
            standard with dark text. */}
        <div className="relative flex-1 overflow-hidden rounded border border-slate-300 bg-white text-slate-800">
            <Gantt
            tasks={ganttTasks}
            viewMode={viewMode}
            onDateChange={handleTaskChange}
            onProgressChange={handleProgressChange}
            barBackgroundColor="#3b82f6"
            barBackgroundSelectedColor="#2563eb"
            projectBackgroundColor="#475569"
            projectBackgroundSelectedColor="#334155"
            arrowColor="#94a3b8"
            todayColor="rgba(59, 130, 246, 0.1)"
            fontFamily="inherit"
            fontSize="12px"
            rowHeight={40}
            columnWidth={viewMode === ViewMode.Month ? 150 : 60}
            listCellWidth="160px"
            />
            <ChartLogo />
        </div>
      </div>
    </div>
  );
};

export default GanttChart;