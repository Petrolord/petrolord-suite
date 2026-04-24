
import React from 'react';

const VisualizationPanel = () => {
    return (
        <div className="h-full w-full bg-slate-900/50 p-4 flex flex-col">
            <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg overflow-hidden relative flex items-center justify-center text-slate-500">
                Chart removed
            </div>
            <div className="mt-4 p-3 bg-slate-900 border border-slate-800 rounded text-xs text-slate-400 flex gap-4 justify-center">
                 <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#f4a261]"></div> Sandstone</div>
                 <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#264653]"></div> Shale</div>
                 <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#2a9d8f]"></div> Limestone</div>
                 <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#e9c46a]"></div> Salt</div>
                 <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#1d1d1d]"></div> Coal</div>
            </div>
        </div>
    );
};

export default VisualizationPanel;
