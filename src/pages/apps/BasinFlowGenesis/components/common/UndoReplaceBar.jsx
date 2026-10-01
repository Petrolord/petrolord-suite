import React from 'react';
import { Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBasinFlow } from '../../contexts/BasinFlowContext';

// U2-010 (BF-U1-023): after a template, a tops file or a registry well
// replaced the layers, one click puts the model back as it was.
export default function UndoReplaceBar() {
    const { state, dispatch } = useBasinFlow();
    const u = state.undo;
    if (!u) return null;
    return (
        <div className="flex items-center gap-3 px-4 py-2 text-xs bg-pl-sunken border-b border-pl-border text-pl-text" data-testid="bf-undo-bar">
            <span>{u.label} replaced {u.stratigraphy?.length || 0} layer{u.stratigraphy?.length === 1 ? '' : 's'}.</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="bf-undo-replace" onClick={() => dispatch({ type: 'UNDO_REPLACE' })}>
                <Undo2 className="w-3 h-3 mr-1" /> Undo
            </Button>
        </div>
    );
}
