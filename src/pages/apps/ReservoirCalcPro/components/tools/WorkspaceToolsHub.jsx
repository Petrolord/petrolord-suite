import React, { useMemo, useState } from 'react';
import { SlidersHorizontal, History, Database, Users, Layers } from 'lucide-react';
import Settings from './Settings';
import AuditTrail from './AuditTrail';
import DataManager from './DataManager';
import TeamCollaboration from './TeamCollaboration';
import ProspectRiskingPanel from './ProspectRiskingPanel';
import { makeRegistryProspectsBackend } from '../../services/prospectsService';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';

// Pull a {mean,p90,p50,p10} unrisked distribution out of RCP's Monte
// Carlo result, whatever its wrapping (stooip/giip/oil/gas or flat).
function pickUnrisked(pr) {
    if (!pr) return null;
    for (const cand of [pr.stooip, pr.giip, pr.oil, pr.gas, pr.result, pr]) {
        if (cand && Number.isFinite(cand.mean) && Number.isFinite(cand.p50)) return cand;
    }
    return null;
}

// Prospect Risking wraps the shared panel with the real rcp_prospects
// backend and the latest MC result (unrisked volume) from RCP context.
const ProspectRiskingTool = () => {
    const backend = useMemo(() => makeRegistryProspectsBackend(), []);
    const { state } = useReservoirCalc();
    const unrisked = pickUnrisked(state?.probResults);
    return <ProspectRiskingPanel backend={backend} unrisked={unrisked} />;
};

const TABS = [
    { id: 'settings', label: 'Settings', icon: SlidersHorizontal, Comp: Settings },
    { id: 'risking', label: 'Prospect Risking', icon: Layers, Comp: ProspectRiskingTool },
    { id: 'audit', label: 'Audit Trail', icon: History, Comp: AuditTrail },
    { id: 'data', label: 'Data Manager', icon: Database, Comp: DataManager },
    { id: 'team', label: 'Collaboration', icon: Users, Comp: TeamCollaboration },
];

// Container that hosts the four workspace tools in a single side panel.
const WorkspaceToolsHub = ({ initialTab = 'settings' }) => {
    const [active, setActive] = useState(initialTab);
    const Active = (TABS.find((t) => t.id === active) || TABS[0]).Comp;

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-100">
            <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-800 bg-slate-900 shrink-0">
                <Database className="w-4 h-4 text-blue-400 mr-1" />
                <span className="text-sm font-semibold text-slate-200 mr-3">Workspace Tools</span>
                <div className="flex gap-1 flex-wrap">
                    {TABS.map((t) => {
                        const Icon = t.icon;
                        return (
                            <button
                                key={t.id}
                                onClick={() => setActive(t.id)}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${active === t.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                            >
                                <Icon className="w-3.5 h-3.5" /> {t.label}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                <Active />
            </div>
        </div>
    );
};

export default WorkspaceToolsHub;
