import React, { useState } from 'react';
import { useFDP } from '@/contexts/FDPContext';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ScenarioManager from './scenarios/ScenarioManager';
import { planAbandonment } from '@/utils/fdp/economics';
import ScenarioForm from './scenarios/ScenarioForm';

const ScenarioModule = () => {
    const { state, actions } = useFDP();
    const { list: scenarios, selectedId } = state.scenarios;
    const { list: concepts } = state.concepts;
    const [view, setView] = useState('list'); // list, form
    const [editingScenario, setEditingScenario] = useState(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [scenarioToDelete, setScenarioToDelete] = useState(null);

    const handleCreate = () => {
        if (concepts.length === 0) {
            alert("Please create at least one Concept before creating Scenarios.");
            return;
        }
        setEditingScenario(null);
        setView('form');
    };

    const handleEdit = (scenario) => {
        setEditingScenario(scenario);
        setView('form');
    };

    const handleDeleteClick = (id) => {
        setScenarioToDelete(id);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = () => {
        if (scenarioToDelete) {
            const updated = scenarios.filter(s => s.id !== scenarioToDelete);
            actions.updateScenarios({ list: updated });
            if (selectedId === scenarioToDelete) actions.updateScenarios({ selectedId: null });
        }
        setDeleteDialogOpen(false);
        setScenarioToDelete(null);
    };

    const handleSave = (scenario) => {
        if (editingScenario) {
            const updated = scenarios.map(s => s.id === scenario.id ? scenario : s);
            actions.updateScenarios({ list: updated });
        } else {
            actions.updateScenarios({ list: [...scenarios, scenario] });
        }
        setView('list');
    };

    const handleSelect = (id) => {
        actions.updateScenarios({ selectedId: id });
    };

    return (
        <div className="space-y-6 p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-white">Scenario Planning</h2>
                    <p className="text-slate-400">Evaluate economic viability under different conditions.</p>
                </div>
                <div className="flex gap-2">
                    <Button 
                        variant={view === 'form' ? 'secondary' : 'default'}
                        onClick={handleCreate} 
                        className="bg-green-600 hover:bg-green-700"
                    >
                        <Plus className="w-4 h-4 mr-2" /> New Scenario
                    </Button>
                </div>
            </div>

            {view === 'list' && (
                <ScenarioManager 
                    scenarios={scenarios}
                    concepts={concepts}
                    abandonment={planAbandonment(state)}
                    onEdit={handleEdit}
                    onDelete={handleDeleteClick}
                    selectedId={selectedId}
                    onSelect={handleSelect}
                />
            )}

            {view === 'form' && (
                <ScenarioForm 
                    initialData={editingScenario}
                    concepts={concepts}
                    onSave={handleSave}
                    onCancel={() => setView('list')}
                />
            )}

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Scenario</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this scenario? This action cannot be undone.
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

export default ScenarioModule;