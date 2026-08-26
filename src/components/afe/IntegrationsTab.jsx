import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, RefreshCw, AlertTriangle, ExternalLink, Activity, Hammer } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const IntegrationCard = ({ title, status, lastSync, icon: Icon, description }) => (
    <div className="flex items-center justify-between p-4 bg-slate-800 rounded-lg border border-slate-700">
        <div className="flex items-center gap-4">
            <div className="p-2 bg-slate-700 rounded">
                <Icon className="w-6 h-6 text-blue-400" />
            </div>
            <div>
                <h4 className="font-bold text-white">{title}</h4>
                <p className="text-xs text-slate-400">{description}</p>
            </div>
        </div>
        <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
                <div className="flex items-center gap-2 justify-end">
                    <span className={`w-2 h-2 rounded-full ${status === 'Active' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-sm text-slate-300">{status}</span>
                </div>
                <p className="text-xs text-slate-500">Last sync: {lastSync}</p>
            </div>
            <Button variant="outline" size="sm" className="border-slate-600 hover:bg-slate-700"><RefreshCw className="w-4 h-4" /></Button>
        </div>
    </div>
);

const IntegrationsTab = ({ afe }) => {
  return (
    <div className="space-y-6">
        <Tabs defaultValue="pm" className="w-full">
            <TabsList className="bg-slate-900 border border-slate-800">
                <TabsTrigger value="pm">Project Management</TabsTrigger>
                <TabsTrigger value="technical">Technical Apps</TabsTrigger>
                <TabsTrigger value="drilling">Drilling Ops</TabsTrigger>
            </TabsList>

            <TabsContent value="pm" className="mt-4 space-y-4">
                <div className="bg-slate-900 p-4 rounded border border-slate-800 mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Activity className="w-5 h-5 text-purple-400" />
                        PM Pro Integration
                    </h3>
                    <p className="text-sm text-slate-400 mb-4">Link this AFE to Project Management Pro schedules to auto-update forecasts based on schedule slip.</p>
                    <IntegrationCard 
                        title="Linked Project: Usan Field Dev Phase 2"
                        status="Active"
                        lastSync="2 mins ago"
                        icon={Activity}
                        description="Syncing milestones, tasks, and schedule dates."
                    />
                </div>
                
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader><CardTitle className="text-sm font-medium">Change Triggers from Schedule</CardTitle></CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded border border-slate-700/50">
                                <div className="flex items-center gap-3">
                                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                                    <div>
                                        <p className="text-sm text-white">Drilling Campaign Delayed by 14 days</p>
                                        <p className="text-xs text-slate-500">Source: PM Pro Schedule Update</p>
                                    </div>
                                </div>
                                <Button size="sm" variant="secondary" className="h-7 text-xs">Review Impact</Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="technical" className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4">
                    <IntegrationCard 
                        title="Pore Pressure (PPFG)" 
                        status="Active" 
                        lastSync="1 hour ago" 
                        icon={Activity} 
                        description="Monitors narrow drilling windows. Triggers contingency for stuck pipe."
                    />
                    <IntegrationCard 
                        title="Geomechanics Studio (MEM)" 
                        status="Inactive" 
                        lastSync="2 days ago" 
                        icon={Activity} 
                        description="Updates wellbore stability related costs."
                    />
                    <IntegrationCard 
                        title="BasinFlow Simulator" 
                        status="Active" 
                        lastSync="10 mins ago" 
                        icon={Activity} 
                        description="Syncs production profiles for revenue forecasting."
                    />
                </div>
            </TabsContent>

            <TabsContent value="drilling" className="mt-4 space-y-4">
                 <div className="bg-slate-900 p-4 rounded border border-slate-800">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Hammer className="w-5 h-5 text-amber-400" />
                        Drilling Plan Sync
                    </h3>
                    <p className="text-sm text-slate-400 mb-4">Real-time cost updates from daily drilling reports (DDR).</p>
                    <IntegrationCard 
                        title="Rig: Deepwater Horizon"
                        status="Active"
                        lastSync="Live"
                        icon={Hammer}
                        description="Streaming NPT and daily rig costs."
                    />
                </div>
            </TabsContent>
        </Tabs>
    </div>
  );
};

export default IntegrationsTab;