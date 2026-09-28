import React, { useState, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/lib/customSupabaseClient';
import PPFGIntegrationPanel from './integrations/PPFGIntegrationPanel';
import VelocityIntegrationPanel from './integrations/VelocityIntegrationPanel';
import LogFaciesIntegrationPanel from './integrations/LogFaciesIntegrationPanel';
import GeomechIntegrationPanel from './integrations/GeomechIntegrationPanel';
import BasinFlowIntegrationPanel from './integrations/BasinFlowIntegrationPanel';
import DeliverableManager from './integrations/DeliverableManager';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const AppIntegrationDashboard = ({ project }) => {
  const [deliverables, setDeliverables] = useState([]);
  const [logs, setLogs] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchIntegrationData = async () => {
    if (!project) return;
    const { data: delData } = await supabase.from('pm_deliverables').select('*').eq('project_id', project.id).order('created_at', { ascending: false });
    const { data: logData } = await supabase.from('pm_integration_logs').select('*').eq('project_id', project.id).order('timestamp', { ascending: false }).limit(10);
    
    setDeliverables(delData || []);
    setLogs(logData || []);
  };

  useEffect(() => {
    fetchIntegrationData();
  }, [project, refreshKey]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    fetchIntegrationData();
  };

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
        <div className="flex flex-wrap justify-between items-center gap-2">
            <h2 className="text-lg font-bold text-pl-text">App Integrations</h2>
            <Button size="sm" variant="ghost" onClick={handleRefresh} className="text-pl-muted hover:text-pl-text">
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh Data
            </Button>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
            {/* Left Column: Integration Panels */}
            <ScrollArea className="lg:col-span-2 h-full pr-4">
                <div className="space-y-6 pb-10">
                    <PPFGIntegrationPanel project={project} onRefresh={handleRefresh} />
                    <VelocityIntegrationPanel project={project} onRefresh={handleRefresh} />
                    <LogFaciesIntegrationPanel project={project} onRefresh={handleRefresh} />
                    <GeomechIntegrationPanel project={project} onRefresh={handleRefresh} />
                    <BasinFlowIntegrationPanel project={project} onRefresh={handleRefresh} />
                </div>
            </ScrollArea>

            {/* Right Column: Deliverables & Logs */}
            <div className="flex flex-col gap-6 h-full overflow-hidden">
                <div className="flex-1 bg-pl-surface border border-pl-border rounded-lg p-4 overflow-hidden flex flex-col">
                    <DeliverableManager project={project} deliverables={deliverables} onUpdate={handleRefresh} />
                </div>

                <div className="h-[30%] bg-pl-surface border border-pl-border rounded-lg p-4 overflow-hidden flex flex-col">
                    <h3 className="text-sm font-bold text-pl-text mb-3">Integration Activity Log</h3>
                    <ScrollArea className="flex-1">
                        <div className="space-y-2">
                            {logs.map(log => (
                                <div key={log.id} className="text-xs border-l-2 border-pl-border pl-2 py-1">
                                    <div className="flex justify-between text-pl-muted">
                                        <span className="font-semibold text-pl-text">{log.app_name}</span>
                                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <div className="text-pl-muted">{log.action} - <span className={log.status === 'Success' ? 'text-pl-success-text' : 'text-pl-danger-text'}>{log.status}</span></div>
                                </div>
                            ))}
                            {logs.length === 0 && <p className="text-xs text-pl-muted italic">No recent activity.</p>}
                        </div>
                    </ScrollArea>
                </div>
            </div>
        </div>
    </div>
  );
};

export default AppIntegrationDashboard;