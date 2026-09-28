import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { 
    Trash2, Save, Flag, ArrowUp, ArrowDown, Edit, 
    MoreHorizontal, Copy, Archive, ListTree, History, Download, Eye, AlertCircle,
    ListTodo 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import ExportControls from './ExportControls';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from "@/components/ui/dropdown-menu";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent } from "@/components/ui/context-menu";

import TaskFormDialog from './TaskFormDialog';

const WBSView = ({ tasks, onDataChange, projectName }) => {
  const { toast } = useToast();
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editedValues, setEditedValues] = useState({});
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedDetailsItem, setSelectedDetailsItem] = useState(null);
  
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [selectedTaskForEdit, setSelectedTaskForEdit] = useState(null);
  const [parentTaskForSub, setParentTaskForSub] = useState(null);
  
  const [showArchived, setShowArchived] = useState(false);

  const getStatusColor = (task) => {
    // Status tones; the status word is always printed beside the colour.
    if (task.is_archived) return 'text-pl-muted line-through';
    if (task.type === 'milestone') return 'text-pl-text';
    if (task.percent_complete === 100) return 'text-pl-success-text';
    if (new Date(task.planned_end_date) < new Date() && task.percent_complete < 100) return 'text-pl-danger-text';
    return 'text-pl-info-text';
  };

  const getStatusText = (task) => {
    if (task.is_archived) return 'Archived';
    if (task.type === 'milestone') return 'Milestone';
    if (task.percent_complete === 100) return 'Completed';
    if (new Date(task.planned_end_date) < new Date() && task.percent_complete < 100) return 'Delayed';
    return 'In Progress';
  };

  const getPriorityColor = (priority) => {
      switch(priority) {
          // bg, text, border: the details dialog reads the text class (index 1)
          case 'Critical': return 'bg-pl-danger-bg text-pl-danger-text border-pl-danger/40';
          case 'High': return 'bg-pl-warning-bg text-pl-warning-text border-pl-warning/40';
          case 'Medium': return 'bg-pl-info-bg text-pl-info-text border-pl-info/40';
          case 'Low': return 'bg-pl-sunken text-pl-muted border-pl-border';
          default: return 'bg-pl-sunken text-pl-muted border-pl-border';
      }
  };

  const handleDelete = async (taskId) => {
    if (window.confirm('Are you sure you want to completely delete this item? This cannot be undone.')) {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) {
        toast({ variant: 'destructive', title: 'Failed to delete item', description: error.message });
      } else {
        toast({ title: 'Item Deleted' });
        onDataChange();
      }
    }
  };

  const handleToggleArchive = async (task) => {
      const isArchived = !task.is_archived;
      const { error } = await supabase.from('tasks').update({ is_archived: isArchived }).eq('id', task.id);
      if (error) {
          toast({ variant: 'destructive', title: 'Action failed', description: error.message });
      } else {
          toast({ title: isArchived ? 'Item Archived' : 'Item Unarchived' });
          onDataChange();
      }
  };

  const handleDuplicate = async (task) => {
      const { id, created_at, updated_at, ...taskData } = task; // Exclude specific IDs
      taskData.name = `${task.name} (Copy)`;
      taskData.percent_complete = 0;
      taskData.status = 'To Do';
      
      const { error } = await supabase.from('tasks').insert([taskData]);
      if (error) {
          toast({ variant: 'destructive', title: 'Duplication failed', description: error.message });
      } else {
          toast({ title: 'Item Duplicated successfully.' });
          onDataChange();
      }
  };

  const handleChangePriority = async (taskId, priority) => {
      const { error } = await supabase.from('tasks').update({ priority }).eq('id', taskId);
      if (error) {
          toast({ variant: 'destructive', title: 'Priority update failed', description: error.message });
      } else {
          toast({ title: `Priority set to ${priority}` });
          onDataChange();
      }
  };

  const handleExportSingleJson = (task) => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(task, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `${task.name.replace(/\s+/g, '_')}_details.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
  };

  const openEditDialog = (task) => {
      setSelectedTaskForEdit(task);
      setParentTaskForSub(null);
      setTaskFormOpen(true);
  };

  const openSubTaskDialog = (parentTask) => {
      setSelectedTaskForEdit(null);
      setParentTaskForSub(parentTask.id);
      setTaskFormOpen(true);
  };

  const openDetails = (task) => {
      setSelectedDetailsItem(task);
      setDetailsDialogOpen(true);
  };

  const handleValueChange = (taskId, field, value) => {
    setEditedValues(prev => ({
      ...prev,
      [taskId]: {
        ...prev[taskId],
        [field]: value
      }
    }));
    setEditingTaskId(taskId);
  };

  const handleSaveTask = async (taskId) => {
    const updates = editedValues[taskId];
    if (!updates) return;

    const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
    if (error) {
      toast({ variant: 'destructive', title: 'Failed to update', description: error.message });
    } else {
      toast({ title: 'Updated Successfully!' });
      setEditingTaskId(null);
      setEditedValues(prev => {
        const newVals = { ...prev };
        delete newVals[taskId];
        return newVals;
      });
      onDataChange();
    }
  };

  const handleReorder = async (task, direction) => {
    const currentIndex = tasks.findIndex(t => t.id === task.id);
    if ((direction === 'up' && currentIndex === 0) || (direction === 'down' && currentIndex === tasks.length - 1)) {
      return;
    }

    const otherIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const otherTask = tasks[otherIndex];

    // Use two updates instead of an upsert to avoid triggering INSERT RLS rules for incomplete records.
    const { error: err1 } = await supabase.from('tasks').update({ display_order: otherTask.display_order }).eq('id', task.id);
    const { error: err2 } = await supabase.from('tasks').update({ display_order: task.display_order }).eq('id', otherTask.id);

    if (err1 || err2) {
      toast({ variant: 'destructive', title: 'Failed to reorder tasks', description: (err1 || err2).message });
    } else {
      onDataChange();
    }
  };

  const exportColumns = [
      { header: "Name", accessor: "name" },
      { header: "Priority", accessor: "priority" },
      { header: "Workstream", accessor: "workstream" },
      { header: "Owner", accessor: "owner" },
      { header: "Start Date", accessor: "planned_start_date" },
      { header: "End Date", accessor: "planned_end_date" },
      { header: "Status", accessor: "status" }
  ];
  
  const exportData = tasks.map(t => ({
      name: t.name,
      priority: t.priority || 'Medium',
      workstream: t.workstream || '-',
      owner: t.owner || 'N/A',
      planned_start_date: new Date(t.planned_start_date).toLocaleDateString(),
      planned_end_date: new Date(t.planned_end_date).toLocaleDateString(),
      status: getStatusText(t)
  }));

  const visibleTasks = tasks.filter(t => showArchived || !t.is_archived);
  
  return (
    <div className="flex flex-col h-full">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
            <div className="flex items-center space-x-2">
                <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
                <Label htmlFor="show-archived" className="text-pl-muted text-sm">Show Archived</Label>
            </div>
            <ExportControls columns={exportColumns} data={exportData} fileName={`${projectName}_WBS`} title={`${projectName} - WBS`} />
        </div>
        
        <div className="flex-1 overflow-auto bg-pl-surface border border-pl-border rounded-md">
            <Table id="tasks-table">
                <TableHeader>
                    <TableRow className="bg-pl-sunken sticky top-0 z-10">
                        <TableHead className="w-[50px]">Order</TableHead>
                        <TableHead>Name & Details</TableHead>
                        <TableHead className="w-[100px]">Priority</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right w-[140px]">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {visibleTasks && visibleTasks.length > 0 ? visibleTasks.map((task, index) => (
                        <ContextMenu key={task.id}>
                            <ContextMenuTrigger asChild>
                                <TableRow className={`${task.type === 'milestone' ? 'bg-pl-sunken/60' : ''} ${task.is_archived ? 'opacity-50 grayscale' : ''}`}>
                                    <TableCell className="flex flex-col items-center justify-center gap-1">
                                        <Button variant="ghost" size="icon" className="h-5 w-5 text-pl-muted hover:text-pl-text" onClick={() => handleReorder(task, 'up')} disabled={index === 0 || showArchived}>
                                            <ArrowUp className="w-3 h-3" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-5 w-5 text-pl-muted hover:text-pl-text" onClick={() => handleReorder(task, 'down')} disabled={index === visibleTasks.length - 1 || showArchived}>
                                            <ArrowDown className="w-3 h-3" />
                                        </Button>
                                    </TableCell>
                                    
                                    <TableCell className="font-medium text-pl-text">
                                        <div className="flex items-center gap-2">
                                            {task.type === 'milestone' ? <Flag className="w-4 h-4 text-pl-accent-text" aria-label="Milestone" /> : <div className="w-4 h-4 rounded-full border border-pl-border-strong" />}
                                            {editingTaskId === task.id ? (
                                                <Input className="h-7 w-48" defaultValue={task.name} onChange={e => handleValueChange(task.id, 'name', e.target.value)} />
                                            ) : (
                                                <span className={`truncate max-w-[200px] ${task.is_archived ? 'line-through text-pl-muted' : ''}`}>{task.name}</span>
                                            )}
                                        </div>
                                        <div className="flex gap-2 items-center ml-6 mt-1">
                                            {task.task_category && <span className="text-[10px] text-pl-muted">{task.task_category}</span>}
                                            {task.owner && <span className="text-[10px] bg-pl-sunken text-pl-muted px-1.5 py-0.5 rounded border border-pl-border">👤 {task.owner}</span>}
                                        </div>
                                    </TableCell>
                                    
                                    <TableCell>
                                        <Badge variant="outline" className={`text-[10px] ${getPriorityColor(task.priority || 'Medium')}`}>
                                            {task.priority || 'Medium'}
                                        </Badge>
                                    </TableCell>
                                    
                                    <TableCell className="text-xs">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center justify-between w-32">
                                                <span className="text-pl-muted w-8">Plan:</span>
                                                <Input 
                                                    type="date" 
                                                    defaultValue={task.planned_end_date}
                                                    onChange={(e) => handleValueChange(task.id, 'planned_end_date', e.target.value)}
                                                    className="h-6 bg-transparent border-0 p-0 text-xs w-24 text-right text-pl-text focus:ring-0"
                                                />
                                            </div>
                                             <div className="flex items-center justify-between w-32">
                                                <span className="text-pl-muted w-8">Act:</span>
                                                <Input 
                                                    type="date" 
                                                    defaultValue={task.actual_end_date}
                                                    onChange={(e) => handleValueChange(task.id, 'actual_end_date', e.target.value)}
                                                    className="h-6 bg-transparent border-0 p-0 text-xs w-24 text-right text-pl-success-text focus:ring-0 placeholder:text-pl-muted"
                                                    placeholder="Set Date"
                                                />
                                            </div>
                                        </div>
                                    </TableCell>
                                    
                                    <TableCell>
                                        <div className="flex items-center gap-2 w-28">
                                            <Progress value={task.percent_complete || 0} className="h-2 flex-1" />
                                            <span className="text-xs text-pl-muted w-8 text-right font-pl-mono tabular-nums">{task.percent_complete || 0}%</span>
                                        </div>
                                    </TableCell>
                                    
                                    <TableCell className={`text-xs font-medium ${getStatusColor(task)}`}>
                                        {getStatusText(task)}
                                    </TableCell>
                                    
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1 items-center">
                                            {editingTaskId === task.id && (
                                                <Button variant="ghost" size="icon" onClick={() => handleSaveTask(task.id)} className="h-7 w-7 text-pl-primary-text">
                                                    <Save className="w-3 h-3" />
                                                </Button>
                                            )}
                                            
                                            {/* Inline Actions */}
                                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(task)} className="h-7 w-7 text-pl-muted hover:text-pl-text">
                                                <Edit className="w-3 h-3" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => openDetails(task)} className="h-7 w-7 text-pl-muted hover:text-pl-text">
                                                <Eye className="w-3 h-3" />
                                            </Button>

                                            {/* Dropdown Menu Actions */}
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-text">
                                                        <MoreHorizontal className="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent className="w-48" align="end">
                                                    <DropdownMenuItem onClick={() => openEditDialog(task)} className="cursor-pointer">
                                                        <Edit className="w-4 h-4 mr-2" /> Edit Details
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => openDetails(task)} className="cursor-pointer">
                                                        <AlertCircle className="w-4 h-4 mr-2" /> View Full Info
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleDuplicate(task)} className="cursor-pointer">
                                                        <Copy className="w-4 h-4 mr-2" /> Duplicate
                                                    </DropdownMenuItem>
                                                    
                                                    {task.type === 'milestone' && (
                                                        <DropdownMenuItem onClick={() => openSubTaskDialog(task)} className="cursor-pointer">
                                                            <ListTree className="w-4 h-4 mr-2" /> Add Sub-task
                                                        </DropdownMenuItem>
                                                    )}

                                                    <DropdownMenuSub>
                                                        <DropdownMenuSubTrigger className="cursor-pointer">
                                                            <Flag className="w-4 h-4 mr-2" /> Set Priority
                                                        </DropdownMenuSubTrigger>
                                                        <DropdownMenuPortal>
                                                            <DropdownMenuSubContent>
                                                                <DropdownMenuItem onClick={() => handleChangePriority(task.id, 'Low')}>Low</DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => handleChangePriority(task.id, 'Medium')}>Medium</DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => handleChangePriority(task.id, 'High')}>High</DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => handleChangePriority(task.id, 'Critical')}>Critical</DropdownMenuItem>
                                                            </DropdownMenuSubContent>
                                                        </DropdownMenuPortal>
                                                    </DropdownMenuSub>

                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => handleExportSingleJson(task)} className="cursor-pointer">
                                                        <Download className="w-4 h-4 mr-2" /> Export JSON
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleToggleArchive(task)} className="cursor-pointer">
                                                        <Archive className="w-4 h-4 mr-2" /> {task.is_archived ? 'Unarchive' : 'Archive'}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => handleDelete(task.id)} className="cursor-pointer text-pl-danger-text">
                                                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-48">
                                <ContextMenuItem onClick={() => openEditDialog(task)} className="cursor-pointer"><Edit className="w-4 h-4 mr-2" /> Edit</ContextMenuItem>
                                <ContextMenuItem onClick={() => openDetails(task)} className="cursor-pointer"><Eye className="w-4 h-4 mr-2" /> View Details</ContextMenuItem>
                                <ContextMenuItem onClick={() => handleDuplicate(task)} className="cursor-pointer"><Copy className="w-4 h-4 mr-2" /> Duplicate</ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="cursor-pointer"><Flag className="w-4 h-4 mr-2" /> Priority</ContextMenuSubTrigger>
                                    <ContextMenuSubContent>
                                        <ContextMenuItem onClick={() => handleChangePriority(task.id, 'Low')} className="cursor-pointer">Low</ContextMenuItem>
                                        <ContextMenuItem onClick={() => handleChangePriority(task.id, 'Medium')} className="cursor-pointer">Medium</ContextMenuItem>
                                        <ContextMenuItem onClick={() => handleChangePriority(task.id, 'High')} className="cursor-pointer">High</ContextMenuItem>
                                        <ContextMenuItem onClick={() => handleChangePriority(task.id, 'Critical')} className="cursor-pointer">Critical</ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>
                                <ContextMenuItem onClick={() => handleToggleArchive(task)} className="cursor-pointer"><Archive className="w-4 h-4 mr-2" /> {task.is_archived ? 'Unarchive' : 'Archive'}</ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem onClick={() => handleDelete(task.id)} className="cursor-pointer text-pl-danger-text"><Trash2 className="w-4 h-4 mr-2" /> Delete</ContextMenuItem>
                            </ContextMenuContent>
                        </ContextMenu>
                    )) : (
                        <TableRow><TableCell colSpan="7" className="text-center text-pl-muted py-10 border-b-0">No items found matching the current filters.</TableCell></TableRow>
                    )}
                </TableBody>
            </Table>
        </div>

        {/* Task Form Dialog (Create/Edit) */}
        <TaskFormDialog 
            open={taskFormOpen} 
            onOpenChange={setTaskFormOpen} 
            project={{ id: tasks[0]?.project_id }} 
            existingTask={selectedTaskForEdit} 
            parentTaskId={parentTaskForSub}
            tasks={tasks}
            onDataChange={onDataChange} 
        />

        {/* Details Dialog */}
        <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {selectedDetailsItem?.type === 'milestone' ? <Flag className="w-5 h-5 text-pl-accent-text" /> : <ListTodo className="w-5 h-5 text-pl-primary-text" />}
                        {selectedDetailsItem?.type === 'milestone' ? 'Milestone Details' : 'Task Details'}: {selectedDetailsItem?.name}
                    </DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-pl-sunken p-4 rounded border border-pl-border">
                        <div>
                            <Label className="text-pl-muted text-xs uppercase">Status</Label>
                            <p className="font-semibold text-sm">{selectedDetailsItem?.status || 'Unknown'}</p>
                        </div>
                        <div>
                            <Label className="text-pl-muted text-xs uppercase">Progress</Label>
                            <p className="font-semibold text-sm">{selectedDetailsItem?.percent_complete || 0}%</p>
                        </div>
                        <div>
                            <Label className="text-pl-muted text-xs uppercase">Owner</Label>
                            <p className="font-semibold text-sm">{selectedDetailsItem?.owner || 'Unassigned'}</p>
                        </div>
                        <div>
                            <Label className="text-pl-muted text-xs uppercase">Priority</Label>
                            <p className={`font-semibold text-sm ${getPriorityColor(selectedDetailsItem?.priority).split(' ')[1]}`}>
                                {selectedDetailsItem?.priority || 'Medium'}
                            </p>
                        </div>
                        <div>
                            <Label className="text-pl-muted text-xs uppercase">Planned Start</Label>
                            <p className="font-semibold text-sm">{selectedDetailsItem?.planned_start_date ? new Date(selectedDetailsItem.planned_start_date).toLocaleDateString() : '-'}</p>
                        </div>
                        <div>
                            <Label className="text-pl-muted text-xs uppercase">Planned End</Label>
                            <p className="font-semibold text-sm">{selectedDetailsItem?.planned_end_date ? new Date(selectedDetailsItem.planned_end_date).toLocaleDateString() : '-'}</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-pl-muted">Description</Label>
                        <div className="text-sm text-pl-text p-3 bg-pl-sunken rounded border border-pl-border min-h-[60px]">
                            {selectedDetailsItem?.description || <span className="italic text-pl-muted">No description provided.</span>}
                        </div>
                    </div>
                    
                    {selectedDetailsItem?.type === 'milestone' && (
                        <div className="p-3 bg-pl-sunken rounded border border-pl-border">
                            <h4 className="text-sm font-medium text-pl-text mb-2">Gate Readiness</h4>
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-pl-surface border-2 border-pl-primary text-pl-text font-pl-mono font-bold text-lg">
                                    {selectedDetailsItem?.milestone_details?.readiness_score || '0'}%
                                </div>
                                <div className="text-xs text-pl-muted flex-1">
                                    Score based on completed deliverables and sign-offs.
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label className="text-pl-muted flex items-center gap-2"><History className="w-4 h-4" /> Recent History</Label>
                        <div className="text-xs text-pl-muted italic p-2 bg-pl-sunken rounded">
                            Created at: {selectedDetailsItem?.created_at ? new Date(selectedDetailsItem.created_at).toLocaleString() : 'Unknown'}
                            <br />
                            Last updated: {selectedDetailsItem?.updated_at ? new Date(selectedDetailsItem.updated_at).toLocaleString() : 'Unknown'}
                        </div>
                    </div>
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => handleExportSingleJson(selectedDetailsItem)} >
                        <Download className="w-4 h-4 mr-2" /> Export JSON
                    </Button>
                    <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
};

export default WBSView;