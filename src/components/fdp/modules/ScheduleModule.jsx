import React, { useState } from 'react';
import { useFDP } from '@/contexts/FDPContext';
import { Button } from '@/components/ui/button';
import { Plus, Download, Upload, LayoutList, GanttChart as GanttIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import CollapsibleSection from '@/components/fdp/CollapsibleSection';
import { ScheduleDataImporter } from '@/services/fdp/ScheduleDataImporter';

import ProjectSchedule from './schedule/ProjectSchedule';
import GanttChart from './schedule/GanttChart';
import ScheduleForm from './schedule/ScheduleForm';

const ScheduleModule = () => {
    const { state, actions } = useFDP();
    const { activities } = state.schedule;
    const { toast } = useToast();
    
    const [view, setView] = useState('gantt'); // gantt, list, form
    const [editingActivity, setEditingActivity] = useState(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [activityToDelete, setActivityToDelete] = useState(null);

    const handleCreate = () => {
        setEditingActivity(null);
        setView('form');
    };

    const handleEdit = (activity) => {
        setEditingActivity(activity);
        setView('form');
    };

    const handleDeleteClick = (id) => {
        setActivityToDelete(id);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = () => {
        if (activityToDelete) {
            const updated = activities.filter(a => a.id !== activityToDelete);
            actions.updateSchedule({ activities: updated });
        }
        setDeleteDialogOpen(false);
        setActivityToDelete(null);
    };

    const handleSave = (activity) => {
        if (editingActivity) {
            const updated = activities.map(a => a.id === activity.id ? activity : a);
            actions.updateSchedule({ activities: updated });
        } else {
            actions.updateSchedule({ activities: [...activities, activity] });
        }
        setView('list'); // Return to list after save
    };

    const handleImport = async () => {
        try {
            toast({ title: "Importing Schedule", description: "Loading plan from Project Management Pro..." });
            const imported = await ScheduleDataImporter.importFromProjectManagement();
            actions.updateSchedule({ activities: imported });
            toast({ title: "Success", description: `Imported ${imported.length} activities.` });
        } catch (e) {
            toast({ title: "Import Failed", description: "Could not load schedule.", variant: "destructive" });
        }
    };

    return (
        <div className="space-y-6 p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-white">Project Schedule</h2>
                    <p className="text-slate-400">Manage timeline, critical path, and milestones.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleImport} className="border-slate-700 text-slate-300">
                        <Download className="w-4 h-4 mr-2" /> Import Plan
                    </Button>
                    <div className="flex bg-slate-800 rounded-md border border-slate-700 p-1">
                        <Button 
                            variant={view === 'gantt' ? 'secondary' : 'ghost'} 
                            size="sm"
                            onClick={() => setView('gantt')}
                            className="h-8"
                        >
                            <GanttIcon className="w-4 h-4 mr-2" /> Gantt
                        </Button>
                        <Button 
                            variant={view === 'list' ? 'secondary' : 'ghost'} 
                            size="sm"
                            onClick={() => setView('list')}
                            className="h-8"
                        >
                            <LayoutList className="w-4 h-4 mr-2" /> List
                        </Button>
                    </div>
                    <Button 
                        onClick={handleCreate} 
                        className="bg-purple-600 hover:bg-purple-700"
                    >
                        <Plus className="w-4 h-4 mr-2" /> Add Activity
                    </Button>
                </div>
            </div>

            {view === 'form' ? (
                <ScheduleForm 
                    initialData={editingActivity}
                    onSave={handleSave}
                    onCancel={() => setView('list')}
                />
            ) : (
                <>
                    {view === 'gantt' && (
                        <CollapsibleSection title="Gantt Visualization" defaultOpen>
                            <GanttChart activities={activities} />
                        </CollapsibleSection>
                    )}

                    <CollapsibleSection title="Activity List" defaultOpen={view === 'list'}>
                        <ProjectSchedule 
                            activities={activities}
                            onEdit={handleEdit}
                            onDelete={handleDeleteClick}
                        />
                    </CollapsibleSection>
                </>
            )}

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Activity</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this activity? This affects schedule logic.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex justify-end gap-2">
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700">
                            Delete
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default ScheduleModule;