import React, { useMemo, useState } from 'react';
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
import { exampleSchedule, EXAMPLE_LABEL } from '@/services/fdp/exampleData';

import ProjectSchedule from './schedule/ProjectSchedule';
import GanttChart from './schedule/GanttChart';
import ScheduleForm from './schedule/ScheduleForm';
import CriticalPath from './schedule/CriticalPath';
import { scheduleAnalysis } from '@/utils/fdp/scheduleNetwork';

const ScheduleModule = () => {
    const { state, actions } = useFDP();
    const { activities } = state.schedule;
    const { toast } = useToast();
    
    const analysis = useMemo(() => scheduleAnalysis(activities), [activities]);

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

    const handleLoadExample = () => {
        // Economics E3: this claimed to sync the user's own data from another
    // Suite app and contacted nothing. It loads a labelled example now.
        const added = exampleSchedule();
        actions.updateSchedule({ activities: added });
        toast({ title: 'Example loaded', description: `${added.length} example activities. ${EXAMPLE_LABEL}.` });
    };

    return (
        <div className="space-y-6 p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-pl-text">Project Schedule</h2>
                    <p className="text-pl-muted">Manage timeline, critical path, and milestones.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleLoadExample}>
                        <Download className="w-4 h-4 mr-2" /> Load example
                    </Button>
                    <div className="flex bg-pl-sunken rounded-md border border-pl-border p-1">
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
                    >
                        <Plus className="w-4 h-4 mr-2" /> Add Activity
                    </Button>
                </div>
            </div>

            {view === 'form' ? (
                <ScheduleForm 
                    initialData={editingActivity}
                    activities={activities}
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

                    <CollapsibleSection title="Critical Path" defaultOpen>
                        <CriticalPath analysis={analysis} />
                    </CollapsibleSection>

                    <CollapsibleSection title="Activity List" defaultOpen={view === 'list'}>
                        <ProjectSchedule 
                            activities={activities}
                            analysis={analysis}
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
                        <AlertDialogAction onClick={handleConfirmDelete} className="bg-pl-danger text-pl-danger-fg hover:bg-pl-danger/90">
                            Delete
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default ScheduleModule;