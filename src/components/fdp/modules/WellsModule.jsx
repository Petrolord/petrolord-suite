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
import { WellDataImporter } from '@/services/fdp/WellDataImporter';
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

    const handleImport = async () => {
        try {
            toast({ title: "Importing Wells", description: "Connecting to Well Design Studio..." });
            const importedWells = await WellDataImporter.importFromWellPlanning();
            // Calculate estimated costs for imported wells since mock api might not have them
            const processed = importedWells.map(w => ({
                ...w,
                days: 30, // default mock
                cost: 7500000 // default mock
            }));
            actions.updateWells({ list: [...wells, ...processed] });
            toast({ title: "Success", description: `Imported ${processed.length} wells.` });
        } catch (e) {
            toast({ title: "Import Failed", description: "Could not retrieve well data.", variant: "destructive" });
        }
    };

    return (
        <div className="space-y-6 p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-white">Wells & Drilling</h2>
                    <p className="text-slate-400">Design well trajectories, schedule drilling campaigns, and manage risks.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleImport} className="border-slate-700 text-slate-300">
                        <Download className="w-4 h-4 mr-2" /> Import
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