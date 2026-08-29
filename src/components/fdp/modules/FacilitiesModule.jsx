import React, { useState } from 'react';
import { useFDP } from '@/contexts/FDPContext';
import { Button } from '@/components/ui/button';
import { Plus, Download } from 'lucide-react';
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
import FacilitiesList from './facilities/FacilitiesList';
import FacilitiesForm from './facilities/FacilitiesForm';
import FacilitiesCapacityAnalysis from './facilities/FacilitiesCapacityAnalysis';
import FlowAssuranceAnalysis from './facilities/FlowAssuranceAnalysis';
import FacilitiesCostEstimation from './facilities/FacilitiesCostEstimation';
import { exampleFacilities, EXAMPLE_LABEL } from '@/services/fdp/exampleData';
import CollapsibleSection from '@/components/fdp/CollapsibleSection';

const FacilitiesModule = () => {
    const { state, actions } = useFDP();
    const { list: facilities, selectedId } = state.facilities;
    const { toast } = useToast();
    
    const [view, setView] = useState('list'); // list, form
    const [editingFacility, setEditingFacility] = useState(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [facilityToDelete, setFacilityToDelete] = useState(null);

    // Derived selected facility
    const selectedFacility = facilities.find(f => f.id === selectedId);

    const handleCreate = () => {
        setEditingFacility(null);
        setView('form');
    };

    const handleEdit = (facility) => {
        setEditingFacility(facility);
        setView('form');
    };

    const handleDeleteClick = (id) => {
        setFacilityToDelete(id);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = () => {
        if (facilityToDelete) {
            const updated = facilities.filter(f => f.id !== facilityToDelete);
            actions.updateFacilities({ list: updated });
            if (selectedId === facilityToDelete) actions.updateFacilities({ selectedId: null });
        }
        setDeleteDialogOpen(false);
        setFacilityToDelete(null);
    };

    const handleDuplicate = (facility) => {
        const newFacility = { ...facility, id: Date.now(), name: `${facility.name} (Copy)` };
        actions.updateFacilities({ list: [...facilities, newFacility] });
    };

    const handleSave = (facility) => {
        if (editingFacility) {
            const updated = facilities.map(f => f.id === facility.id ? facility : f);
            actions.updateFacilities({ list: updated });
        } else {
            actions.updateFacilities({ list: [...facilities, facility] });
        }
        setView('list');
    };

    const handleSelect = (id) => {
        actions.updateFacilities({ selectedId: id });
    };

    const handleLoadExample = () => {
        // Economics E3: this claimed to sync the user's own data from another
    // Suite app and contacted nothing. It loads a labelled example now.
        const added = exampleFacilities();
        actions.updateFacilities({ list: [...facilities, ...added] });
        toast({ title: 'Example loaded', description: `${added.length} example facility concepts, order-of-magnitude screening figures only.` });
    };

    return (
        <div className="space-y-6 p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-white">Facilities & Infrastructure</h2>
                    <p className="text-slate-400">Define processing capacity, cost estimations, and flow assurance strategies.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleLoadExample} className="border-slate-700 text-slate-300">
                        <Download className="w-4 h-4 mr-2" /> Load example
                    </Button>
                    <Button 
                        onClick={handleCreate} 
                        className="bg-orange-600 hover:bg-orange-700"
                    >
                        <Plus className="w-4 h-4 mr-2" /> New Facility
                    </Button>
                </div>
            </div>

            {view === 'list' ? (
                <>
                    <CollapsibleSection title="Facilities Options" defaultOpen>
                        <FacilitiesList 
                            facilities={facilities}
                            onEdit={handleEdit}
                            onDelete={handleDeleteClick}
                            onDuplicate={handleDuplicate}
                            selectedId={selectedId}
                            onSelect={handleSelect}
                        />
                    </CollapsibleSection>

                    {selectedFacility && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="space-y-6">
                                <CollapsibleSection title={`Capacity Analysis - ${selectedFacility.name}`} defaultOpen>
                                    <FacilitiesCapacityAnalysis facility={selectedFacility} />
                                </CollapsibleSection>
                                <CollapsibleSection title="Flow Assurance">
                                    <FlowAssuranceAnalysis facility={selectedFacility} />
                                </CollapsibleSection>
                            </div>
                            <div className="space-y-6">
                                <CollapsibleSection title="Cost Estimation" defaultOpen>
                                    <FacilitiesCostEstimation facility={selectedFacility} />
                                </CollapsibleSection>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <FacilitiesForm 
                    initialData={editingFacility}
                    onSave={handleSave}
                    onCancel={() => setView('list')}
                />
            )}

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Facility</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this facility? This action cannot be undone.
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

export default FacilitiesModule;