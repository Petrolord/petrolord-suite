import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { CalendarDays, User } from 'lucide-react';

// Helper to format dates
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const KanbanColumn = ({ columnId, title, tasks, colorClass }) => {
  return (
    <div className="flex-1 min-w-[260px] flex flex-col bg-pl-surface rounded-lg border border-pl-border h-full">
      <div className={`p-3 border-b border-pl-border flex items-center justify-between rounded-tl-lg ${colorClass}`}>
        <h3 className="font-semibold text-sm text-pl-text">{title}</h3>
        <Badge variant="neutral" className="text-[10px] h-5">{tasks.length}</Badge>
      </div>
      <Droppable droppableId={columnId}>
        {(provided, snapshot) => (
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
            className={`flex-1 p-2 overflow-y-auto space-y-2 transition-colors ${snapshot.isDraggingOver ? 'bg-pl-sunken' : ''}`}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(provided, snapshot) => (
                  <Card
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`bg-pl-raised hover:border-pl-border-strong transition-all cursor-grab active:cursor-grabbing ${snapshot.isDragging ? 'shadow-pl-lg ring-2 ring-pl-focus rotate-1' : ''}`}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <p className="text-sm font-medium text-pl-text leading-snug">{task.name}</p>
                      </div>
                      
                      <div className="flex flex-wrap gap-1">
                         {task.workstream && (
                            <Badge variant="neutral" className="text-[10px] h-5 px-1 py-0">
                                {task.workstream}
                            </Badge>
                         )}
                         {task.task_category && (
                            <Badge variant="outline" className="text-[10px] h-5 px-1 py-0">
                                {task.task_category}
                            </Badge>
                         )}
                      </div>

                      <div className="flex items-center justify-between pt-2 mt-1 border-t border-pl-border">
                         <div className="flex items-center gap-1 text-xs text-pl-muted">
                            <CalendarDays className="w-3 h-3" />
                            <span>{formatDate(task.planned_end_date)}</span>
                         </div>
                         {task.owner && (
                            <div className="flex items-center gap-1" title={task.owner}>
                                <div className="w-5 h-5 rounded-full bg-pl-sunken border border-pl-border flex items-center justify-center text-[10px] text-pl-text">
                                    {task.owner.substring(0,2).toUpperCase()}
                                </div>
                            </div>
                         )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};

const KanbanView = ({ tasks, onDataChange }) => {
  const { toast } = useToast();
  const [columns, setColumns] = useState({
    'To Do': [],
    'In Progress': [],
    'Review': [],
    'Done': []
  });

  useEffect(() => {
    if (tasks) {
      const newColumns = {
        'To Do': tasks.filter(t => !t.status || t.status === 'To Do'),
        'In Progress': tasks.filter(t => t.status === 'In Progress'),
        'Review': tasks.filter(t => t.status === 'Review'),
        'Done': tasks.filter(t => t.status === 'Done')
      };
      setColumns(newColumns);
    }
  }, [tasks]);

  const onDragEnd = async (result) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;

    if (source.droppableId === destination.droppableId) {
      // Reordering within same column (logic omitted for brevity, usually updates display_order)
      return;
    }

    // Moving between columns
    const sourceColumn = [...columns[source.droppableId]];
    const destColumn = [...columns[destination.droppableId]];
    const [movedTask] = sourceColumn.splice(source.index, 1);
    
    // Update local state immediately for responsiveness
    const newStatus = destination.droppableId;
    const updatedTask = { ...movedTask, status: newStatus };
    
    // Logic for auto-updating % complete based on status
    if (newStatus === 'Done') updatedTask.percent_complete = 100;
    if (newStatus === 'To Do') updatedTask.percent_complete = 0;
    if (newStatus === 'In Progress' && updatedTask.percent_complete === 0) updatedTask.percent_complete = 25;

    destColumn.splice(destination.index, 0, updatedTask);

    setColumns({
      ...columns,
      [source.droppableId]: sourceColumn,
      [destination.droppableId]: destColumn
    });

    // Update DB
    const { error } = await supabase
      .from('tasks')
      .update({ 
          status: newStatus,
          percent_complete: updatedTask.percent_complete 
      })
      .eq('id', draggableId);

    if (error) {
      toast({ variant: 'destructive', title: 'Update failed', description: error.message });
      onDataChange(); // Revert on error
    } else {
       // Optionally notify parent to refresh data to ensure sync
       // onDataChange(); 
       // We skip immediate refresh to prevent UI flicker, relying on optimistic update above
    }
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex h-full gap-4 overflow-x-auto pb-2">
        <KanbanColumn columnId="To Do" title="To Do" tasks={columns['To Do']} colorClass="border-l-4 border-l-pl-border-strong" />
        <KanbanColumn columnId="In Progress" title="In Progress" tasks={columns['In Progress']} colorClass="border-l-4 border-l-pl-info" />
        <KanbanColumn columnId="Review" title="Review" tasks={columns['Review']} colorClass="border-l-4 border-l-pl-warning" />
        <KanbanColumn columnId="Done" title="Done" tasks={columns['Done']} colorClass="border-l-4 border-l-pl-success" />
      </div>
    </DragDropContext>
  );
};

export default KanbanView;