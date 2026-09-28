import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import DeterministicResultsDisplay from './DeterministicResultsDisplay';
import ProbabilisticResultsDisplay from './ProbabilisticResultsDisplay';
import DeterministicSlide from './slide/DeterministicSlide';
import ProbabilisticSlide from './slide/ProbabilisticSlide';
import { Presentation, Table2 } from 'lucide-react';

const ViewToggle = ({ view, setView }) => {
    const opt = (id, label, Icon) => (
        <button
            onClick={() => setView(id)}
            aria-pressed={view === id}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === id ? 'bg-pl-surface text-pl-text shadow-pl-sm' : 'text-pl-muted hover:text-pl-text'
            }`}
        >
            <Icon className="h-3.5 w-3.5" /> {label}
        </button>
    );
    return (
        <div className="flex items-center gap-1 rounded-lg border border-pl-border bg-pl-sunken p-1">
            {opt('slide', 'Presentation', Presentation)}
            {opt('detail', 'Detailed', Table2)}
        </div>
    );
};

const ResultsModal = ({ isOpen, onClose }) => {
    const { state } = useReservoirCalc();
    const [view, setView] = useState('slide');
    const isProb = state.calcMethod === 'probabilistic';

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[96vw] w-full h-[92vh] p-0 flex flex-col">
                <DialogHeader className="px-6 py-3 border-b border-pl-border flex flex-row items-center justify-between shrink-0">
                    <div>
                        <DialogTitle className="text-lg font-bold text-pl-text">Calculation Results</DialogTitle>
                        <p className="text-xs text-pl-muted mt-0.5">
                            Project: <span className="text-pl-text font-medium">{state.currentProjectMeta?.name || 'Untitled'}</span>
                            <span className="mx-2 text-pl-muted">|</span>
                            Reservoir: <span className="text-pl-text font-medium">{state.reservoirName || 'Reservoir 1'}</span>
                        </p>
                    </div>
                    <div className="pr-8">
                        <ViewToggle view={view} setView={setView} />
                    </div>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-hidden">
                    {view === 'slide' ? (
                        isProb ? <ProbabilisticSlide /> : <DeterministicSlide />
                    ) : (
                        <div className="h-full overflow-hidden bg-pl-sunken">
                            {isProb ? <ProbabilisticResultsDisplay /> : <DeterministicResultsDisplay />}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ResultsModal;
