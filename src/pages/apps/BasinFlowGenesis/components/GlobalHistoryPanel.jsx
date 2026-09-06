// Expert-mode global history dock (BF1): the heat-flow model (constant
// or a piecewise history), the surface temperature and the erosion
// events, all live state the engine reads. The previous version showed
// a constant heat-flow field and two "coming in Phase 2" placeholders
// while the engine already took a history and erosion events.

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, Thermometer, TrendingUp } from 'lucide-react';
import { useBasinFlow } from '../contexts/BasinFlowContext';
import HeatFlowHistoryEditor from './history/HeatFlowHistoryEditor';
import ErosionEventsEditor from './history/ErosionEventsEditor';
import { tempToDisplay, tempFromDisplay, tidy, tempSymbol } from '../services/units';

const GlobalHistoryPanel = () => {
    const { state, dispatch, stats, units } = useBasinFlow();
    const { heatFlow, erosionEvents, settings } = state;

    return (
        <Card className="h-full bg-slate-950 border-l border-slate-800 rounded-none w-full max-w-sm">
            <CardHeader className="border-b border-slate-800 py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                    <History className="w-4 h-4 text-purple-400" />
                    Global History
                </CardTitle>
            </CardHeader>
            <Tabs defaultValue="thermal" className="h-[calc(100%-50px)] flex flex-col">
                <div className="px-4 pt-2 bg-slate-900">
                    <TabsList className="w-full justify-start h-8 bg-transparent border-b border-slate-800 rounded-none p-0">
                        <TabsTrigger value="thermal" data-testid="bf-history-tab-thermal" className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-purple-500 rounded-none h-full px-3">
                            <Thermometer className="w-3 h-3 mr-1" /> Thermal
                        </TabsTrigger>
                        <TabsTrigger value="erosion" data-testid="bf-history-tab-erosion" className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-orange-500 rounded-none h-full px-3">
                            <TrendingUp className="w-3 h-3 mr-1" /> Erosion{erosionEvents?.length ? ` (${erosionEvents.length})` : ''}
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="thermal" className="flex-1 min-h-0 mt-0">
                    <ScrollArea className="h-full">
                        <div className="p-4 space-y-5">
                            <div className="space-y-2">
                                <h3 className="text-xs font-semibold text-slate-300">Basal heat flow</h3>
                                <HeatFlowHistoryEditor
                                    heatFlow={heatFlow}
                                    maxAge={stats.maxAge}
                                    onChange={(patch) => dispatch({ type: 'UPDATE_HEAT_FLOW', payload: patch })}
                                />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xs font-semibold text-slate-300">Surface temperature</h3>
                                <div className="bg-slate-900 p-3 rounded border border-slate-800">
                                    <Label className="text-xs text-slate-400">Present day and through time ({tempSymbol(units.temp)})</Label>
                                    <Input
                                        type="number"
                                        step="any"
                                        data-testid="bf-surface-temp"
                                        value={tidy(tempToDisplay(settings?.surfaceTemp ?? 20, units.temp))}
                                        onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { surfaceTemp: tempFromDisplay(parseFloat(e.target.value), units.temp) } })}
                                        className="mt-1 bg-slate-950 h-8"
                                    />
                                    <p className="text-[11px] text-slate-500 mt-1">The upper boundary of the heat solution, held constant through the burial history.</p>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                </TabsContent>

                <TabsContent value="erosion" className="flex-1 min-h-0 mt-0">
                    <ScrollArea className="h-full">
                        <div className="p-4">
                            <ErosionEventsEditor
                                events={erosionEvents}
                                maxAge={stats.maxAge}
                                depthUnit={units.depth}
                                onChange={(events) => dispatch({ type: 'SET_EROSION_EVENTS', payload: events })}
                            />
                        </div>
                    </ScrollArea>
                </TabsContent>
            </Tabs>
        </Card>
    );
};

export default GlobalHistoryPanel;
