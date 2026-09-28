import React, { useState } from 'react';
import { useFDP } from '@/contexts/FDPContext';
import { Button } from '@/components/ui/button';
import { Plus, BarChart2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ConceptManager from './concepts/ConceptManager';
import ConceptForm from './concepts/ConceptForm';
import ConceptComparison from './concepts/ConceptComparison';

const ConceptModule = () => {
    const { state, actions } = useFDP();
    const { list: concepts, selectedId } = state.concepts;
    const [view, setView] = useState('list'); // list, form, compare
    const [editingConcept, setEditingConcept] = useState(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [conceptToDelete, setConceptToDelete] = useState(null);

    const handleCreate = () => {
        setEditingConcept(null);
        setView('form');
    };

    const handleEdit = (concept) => {
        setEditingConcept(concept);
        setView('form');
    };

    const handleDeleteClick = (id) => {
        setConceptToDelete(id);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = () => {
        if (conceptToDelete) {
            const updated = concepts.filter(c => c.id !== conceptToDelete);
            actions.updateConcepts({ list: updated });
            if (selectedId === conceptToDelete) actions.updateConcepts({ selectedId: null });
        }
        setDeleteDialogOpen(false);
        setConceptToDelete(null);
    };

    const handleDuplicate = (concept) => {
        const newConcept = { ...concept, id: Date.now(), name: `${concept.name} (Copy)` };
        actions.updateConcepts({ list: [...concepts, newConcept] });
    };

    const handleSave = (concept) => {
        if (editingConcept) {
            // Update
            const updated = concepts.map(c => c.id === concept.id ? concept : c);
            actions.updateConcepts({ list: updated });
        } else {
            // Create
            actions.updateConcepts({ list: [...concepts, concept] });
        }
        setView('list');
    };

    const handleSelect = (id) => {
        actions.updateConcepts({ selectedId: id });
    };

    return (
        <div className="space-y-6 p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-pl-text">Development Concepts</h2>
                    <p className="text-pl-muted">Define and evaluate different technical solutions.</p>
                </div>
                <div className="flex gap-2">
                    <Button 
                        variant={view === 'compare' ? 'secondary' : 'outline'} 
                        onClick={() => setView('compare')}
                        disabled={concepts.length < 2}
                    >
                        <BarChart2 className="w-4 h-4 mr-2" /> Compare
                    </Button>
                    <Button 
                        variant={view === 'form' ? 'secondary' : 'default'}
                        onClick={handleCreate} 
                        className=""
                    >
                        <Plus className="w-4 h-4 mr-2" /> New Concept
                    </Button>
                </div>
            </div>

            {view === 'list' && (
                <ConceptManager 
                    concepts={concepts}
                    onEdit={handleEdit}
                    onDelete={handleDeleteClick}
                    onDuplicate={handleDuplicate}
                    selectedId={selectedId}
                    onSelect={handleSelect}
                />
            )}

            {view === 'form' && (
                <ConceptForm 
                    initialData={editingConcept}
                    onSave={handleSave}
                    onCancel={() => setView('list')}
                />
            )}

            {view === 'compare' && (
                <div className="space-y-4">
                    <Button variant="ghost" onClick={() => setView('list')} className="text-pl-muted">
                        ← Back to List
                    </Button>
                    <ConceptComparison concepts={concepts} />
                </div>
            )}

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Concept</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this concept? This action cannot be undone.
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

export default ConceptModule;