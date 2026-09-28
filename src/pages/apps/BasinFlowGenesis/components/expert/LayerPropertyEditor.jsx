import React from 'react';
import StratigraphyPanel from '../StratigraphyPanel';
import GlobalHistoryPanel from '../GlobalHistoryPanel';

const LayerPropertyEditor = () => {
    return (
        <div className="h-full flex flex-col lg:flex-row bg-pl-bg">
            <div className="w-full lg:w-96 shrink-0 h-full lg:border-r border-pl-border">
                <StratigraphyPanel />
            </div>
            <div className="flex-1 h-full overflow-hidden">
                <GlobalHistoryPanel />
            </div>
        </div>
    );
};

export default LayerPropertyEditor;