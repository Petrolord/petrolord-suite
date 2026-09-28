import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit2, Trash2, Copy, CheckCircle } from 'lucide-react';
import { calculateConceptCost } from '@/utils/fdp/conceptCalculations';

const ConceptCard = ({ concept, onEdit, onDelete, onDuplicate, isSelected, onSelect }) => {
    const costs = calculateConceptCost(concept);

    return (
        <Card 
            className={`bg-pl-sunken border transition-all duration-200 cursor-pointer ${isSelected ? 'border-pl-primary ring-1 ring-pl-primary shadow-pl-md' : 'border-pl-border hover:border-pl-border-strong'}`}
            onClick={() => onSelect(concept.id)}
        >
            <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-pl-text">{concept.name}</h3>
                        {isSelected && <CheckCircle className="w-4 h-4 text-pl-primary-text" />}
                    </div>
                    <Badge variant="outline" className="bg-pl-surface text-pl-text border-pl-border">
                        {concept.facilityType}
                    </Badge>
                </div>
                
                <p className="text-sm text-pl-muted line-clamp-2 mb-4 h-10">
                    {concept.description || "No description provided."}
                </p>

                <div className="grid grid-cols-3 gap-2 text-xs mb-4">
                    <div className="bg-pl-surface p-2 rounded">
                        <div className="text-pl-muted">Total CAPEX</div>
                        <div className="font-pl-mono tabular-nums text-pl-text">${costs.totalCapex}m</div>
                    </div>
                    <div className="bg-pl-surface p-2 rounded">
                        <div className="text-pl-muted">Peak Prod</div>
                        <div className="font-pl-mono tabular-nums text-pl-text">{concept.peakProduction} kbpd</div>
                    </div>
                    <div className="bg-pl-surface p-2 rounded">
                        <div className="text-pl-muted">Wells</div>
                        <div className="font-pl-mono tabular-nums text-pl-text">{concept.wellCount}</div>
                    </div>
                </div>

                <div className="flex justify-end gap-1 border-t border-pl-border pt-2" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-text" onClick={() => onDuplicate(concept)}>
                        <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-text" onClick={() => onEdit(concept)}>
                        <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-danger-text" onClick={() => onDelete(concept.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

const ConceptManager = ({ concepts, onEdit, onDelete, onDuplicate, selectedId, onSelect }) => {
    if (concepts.length === 0) {
        return (
            <div className="text-center py-12 bg-pl-surface border border-dashed border-pl-border rounded-lg">
                <p className="text-pl-muted mb-2">No concepts defined yet.</p>
                <p className="text-sm text-pl-muted">Create a new concept to start evaluating development options.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {concepts.map(concept => (
                <ConceptCard 
                    key={concept.id} 
                    concept={concept} 
                    onEdit={onEdit} 
                    onDelete={onDelete}
                    onDuplicate={onDuplicate}
                    isSelected={selectedId === concept.id}
                    onSelect={onSelect}
                />
            ))}
        </div>
    );
};

export default ConceptManager;