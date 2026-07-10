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
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
        >
            <Icon className="h-3.5 w-3.5" /> {label}
        </button>
    );
    return (
        <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 p-1">
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
            <DialogContent className="max-w-[96vw] w-full h-[92vh] bg-slate-950 border-slate-800 p-0 flex flex-col">
                <DialogHeader className="px-6 py-3 border-b border-slate-800 flex flex-row items-center justify-between shrink-0">
                    <div>
                        <DialogTitle className="text-lg font-bold text-white">Calculation Results</DialogTitle>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Project: <span className="text-emerald-400 font-medium">{state.currentProjectMeta?.name || state.reservoirName || 'Untitled'}</span>
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
                        <div className="h-full overflow-hidden bg-slate-950">
                            {isProb ? <ProbabilisticResultsDisplay /> : <DeterministicResultsDisplay />}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ResultsModal;
