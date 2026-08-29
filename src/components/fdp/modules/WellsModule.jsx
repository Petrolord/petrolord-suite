import React, { useState } from 'react';
import { useFDP } from '@/contexts/FDPContext';
import { Button } from '@/components/ui/button';
import { Plus, Download, Upload, LayoutGrid, List } from 'lucide-react';
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
import WellInventory from './wells/WellInventory';
import WellForm from './wells/WellForm';
import WellStrategy from './wells/WellStrategy';
import DrillingRiskAssessment from './wells/DrillingRiskAssessment';
import { exampleWells, EXAMPLE_LABEL } from '@/services/fdp/exampleData';
import CollapsibleSection from '@/components/fdp/CollapsibleSection';

const WellsModule = () => {
    const { state, actions } = useFDP();
    const { list: wells } = state.wells;
    const { toast } = useToast();
    
    const [view, setView] = useState('list'); // list, form
    const [editingWell, setEditingWell] = useState(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [wellToDelete, setWellToDelete] = useState(null);

    const handleCreate = () => {
        setEditingWell(null);
        setView('form');
    };

    const handleEdit = (well) => {
        setEditingWell(well);
        setView('form');
    };

    const handleDeleteClick = (id) => {
        setWellToDelete(id);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = () => {
        if (wellToDelete) {
            const updated = wells.filter(w => w.id !== wellToDelete);
            actions.updateWells({ list: updated });
        }
        setDeleteDialogOpen(false);
        setWellToDelete(null);
    };

    const handleDuplicate = (well) => {
        const newWell = { ...well, id: Date.now(), name: `${well.name} (Copy)` };
        actions.updateWells({ list: [...wells, newWell] });
    };

    const handleSave = (well) => {
        if (editingWell) {
            const updated = wells.map(w => w.id === well.id ? well : w);
            actions.updateWells({ list: updated });
        } else {
            actions.updateWells({ list: [...wells, well] });
        }
        setView('list');
    };

    const handleLoadExample = () => {
        // Economics E3: this claimed to sync the user's own data from another
    // Suite app and contacted nothing. It loads a labelled example now.
        // Days and cost per well are part of the example, stated rather than
        // silently defaulted the way the old "imported" wells were.
        const added = exampleWells().map((w) => ({ ...w, days: 30, cost: 7500000 }));
        actions.updateWells({ list: [...wells, ...added] });
        toast({ title: 'Example loaded', description: `${added.length} example wells. ${EXAMPLE_LABEL}.` });
    };

    return (
        <div className="space-y-6 p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-white">Wells & Drilling</h2>
                    <p className="text-slate-400">Design well trajectories, schedule drilling campaigns, and manage risks.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleLoadExample} className="border-slate-700 text-slate-300">
                        <Download className="w-4 h-4 mr-2" /> Load example
                    </Button>
                    <Button 
                        onClick={handleCreate} 
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        <Plus className="w-4 h-4 mr-2" /> Add Well
                    </Button>
                </div>
            </div>

            {view === 'list' ? (
                <>
                    <CollapsibleSection title="Well Inventory" defaultOpen>
                        <WellInventory 
                            wells={wells}
                            onEdit={handleEdit}
                            onDelete={handleDeleteClick}
                            onDuplicate={handleDuplicate}
                        />
                    </CollapsibleSection>

                    <CollapsibleSection title="Drilling Strategy & Schedule">
                        <WellStrategy wells={wells} />
                    </CollapsibleSection>

                    <CollapsibleSection title="Risk Assessment">
                        <DrillingRiskAssessment />
                    </CollapsibleSection>
                </>
            ) : (
                <WellForm 
                    initialData={editingWell}
                    onSave={handleSave}
                    onCancel={() => setView('list')}
                />
            )}

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Well</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this well? This action cannot be undone.
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

export default WellsModule;