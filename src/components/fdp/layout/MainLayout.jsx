import React from 'react';
import { useFDP } from '@/contexts/FDPContext';
import SidebarNavigation from '../navigation/SidebarNavigation';
import TopNavigation from '../navigation/TopNavigation';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/utils/fdp/formatting';

/**
 * What the plan is still missing, worked out from the plan (Economics E3).
 *
 * This panel used to show two fabrications side by side. "Active
 * Integrations" listed five Suite apps with green "connected" dots against a
 * hardcoded registry that contacted nothing, and the Validation box always
 * read "Facilities cost estimates are pending validation from the
 * engineering team" whatever the plan contained. Both are gone. What is left
 * is checked against the actual state, so an empty list means the plan really
 * does have its basics in place.
 */
export const openItems = (state) => {
    const items = [];
    if (!state.fieldData?.fieldName) items.push('Name the field on the Field Overview tab.');
    if (!(state.subsurface?.reserves?.summary?.p50 > 0)) items.push('Enter P50 reserves on the Subsurface tab.');
    if (!state.wells?.list?.length) items.push('Add at least one well on the Wells tab.');
    if (!state.facilities?.list?.length) items.push('Add a facility on the Facilities tab.');
    if (!state.costs?.items?.length) items.push('Add cost items on the Economics tab.');
    if (!state.schedule?.activities?.length) items.push('Build a schedule on the Schedule tab.');
    if (!state.risks?.length) items.push('Log project risks on the Risk Management tab.');
    return items;
};

const RightPanel = () => {
    const { state } = useFDP();
    const outstanding = openItems(state);

    return (
        <div className="h-full flex flex-col bg-slate-900 border-l border-slate-800 w-80">
            <div className="p-4 border-b border-slate-800 font-semibold text-white flex items-center justify-between">
                <span>Plan status</span>
                <Activity className="w-4 h-4 text-slate-500" />
            </div>
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-6">
                    <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Project Stats</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-slate-800 p-2 rounded border border-slate-700">
                                <div className="text-xs text-slate-400">NPV</div>
                                <div className="text-lg font-bold text-green-400">
                                    {formatCurrency(state.economics.npv, 'USD', true)}
                                </div>
                            </div>
                            <div className="bg-slate-800 p-2 rounded border border-slate-700">
                                <div className="text-xs text-slate-400">Reserves (MMbbl)</div>
                                {/* The state keeps reserves under `summary`; the old panel read
                                    `reserves.p50` and printed undefined. */}
                                <div className="text-lg font-bold text-blue-400">
                                    {state.subsurface.reserves.summary.p50 || 0}
                                </div>
                            </div>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">
                            NPV is post royalty and tax, discounted mid year, through the Suite screening
                            economics engine.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Still to do</h3>
                        {outstanding.length === 0 ? (
                            <div className="bg-emerald-900/20 border border-emerald-700/30 rounded p-3 flex items-start">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 mr-2 shrink-0" />
                                <p className="text-xs text-emerald-200/80">
                                    Every section has data in it. That says the plan is complete, not that it
                                    is right; review each tab before you generate the document.
                                </p>
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {outstanding.map((item) => (
                                    <li key={item} className="bg-yellow-900/20 border border-yellow-700/30 rounded p-2 flex items-start">
                                        <AlertCircle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 mr-2 shrink-0" />
                                        <span className="text-xs text-yellow-200/80">{item}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
};

const MainLayout = ({ children }) => {
    const { state, notifications, removeNotification } = useFDP();
    const { sidebarCollapsed, rightPanelOpen } = state.navigation;

    return (
        <div className="h-screen w-full bg-slate-950 flex flex-col overflow-hidden text-slate-200 font-sans">
            <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
            <TopNavigation />
            
            <div className="flex-1 flex overflow-hidden">
                {/* Left Sidebar */}
                <aside 
                    className={cn(
                        "bg-slate-900 border-r border-slate-800 transition-all duration-300 ease-in-out flex-shrink-0 z-20",
                        sidebarCollapsed ? "w-16" : "w-64"
                    )}
                >
                    <SidebarNavigation />
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 flex flex-col overflow-hidden relative bg-slate-950">
                    <ScrollArea className="flex-1">
                        <div className="p-6 min-h-full">
                            {children}
                        </div>
                    </ScrollArea>
                </main>

                {/* Right Panel */}
                <aside 
                    className={cn(
                        "border-l border-slate-800 bg-slate-900 transition-all duration-300 ease-in-out flex-shrink-0 z-10",
                        rightPanelOpen ? "w-80" : "w-0 border-l-0 overflow-hidden"
                    )}
                >
                    <RightPanel />
                </aside>
            </div>
            
            {/* Status Bar */}
            <div className="h-6 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-4 text-[10px] text-slate-500 select-none">
                <div className="flex items-center space-x-4">
                    <span>Ready</span>
                    <span>v1.0.0</span>
                    <span>Region: Global</span>
                </div>
                <div className="flex items-center space-x-4">
                    <span>Last Saved: {new Date().toLocaleTimeString()}</span>
                    <span>{state.meta.mode.toUpperCase()} MODE</span>
                </div>
            </div>
        </div>
    );
};

export default MainLayout;