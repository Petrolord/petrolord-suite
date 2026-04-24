
import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Download, FileText, Save, BrainCircuit, Link as LinkIcon, AlertCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const renderCard = (title, children, icon) => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/5 p-6 rounded-xl border border-white/10">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center">
            {React.createElement(icon, { className: "w-6 h-6 mr-3 text-lime-400" })}
            {title}
        </h2>
        {children}
    </motion.div>
);

const ResultsPanel = ({ results, inputs }) => {
  const { liveData, recommendation, alerts, connections } = results;
  const { toast } = useToast();

  const handleSave = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to save.' });
        return;
    }

    const projectData = {
        user_id: user.id,
        project_name: inputs.projectName,
        inputs_data: inputs,
        results_data: results,
        updated_at: new Date().toISOString()
    };
    
    const { error } = await supabase.from('rto_projects').upsert(projectData, { onConflict: 'user_id, project_name' });

    if (error) {
        toast({ variant: 'destructive', title: 'Save Error', description: error.message });
    } else {
        toast({ title: 'Project Saved & Updated', description: `Results for "${inputs.projectName}" have been saved.` });
    }
  };

  const handleExport = (type) => {
    toast({
        title: "🚧 Feature Coming Soon!",
        description: `Export to ${type.toUpperCase()} isn't implemented yet.`,
        duration: 4000,
    });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
            {Object.entries(liveData.latest_sample).map(([key, value]) => (
                <div key={key} className="bg-white/5 p-4 rounded-lg">
                    <p className="text-sm text-lime-300 uppercase">{key.replace(/_/g, ' ')}</p>
                    <p className="text-2xl font-bold text-white">{typeof value === 'number' ? value.toFixed(1) : value}</p>
                </div>
            ))}
        </div>
        
        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-4 h-[300px] flex items-center justify-center text-slate-500">
            Chart removed
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {renderCard("Digital Driller", (
                <div className="p-4 bg-slate-700/50 rounded-lg">
                    <p className="font-bold text-lime-300">Recommendation:</p>
                    <p className="font-mono text-xl">WOB: {recommendation.wob_klbf} klbf, RPM: {recommendation.rpm} rpm</p>
                    <p className="text-sm text-slate-300 mt-2">{recommendation.reason}</p>
                </div>
            ), BrainCircuit)}

            {renderCard("Active Alerts", (
                <div className="space-y-2">
                    {alerts.length > 0 ? alerts.map(a => (
                        <div key={a.id} className="flex items-start space-x-2 text-yellow-300">
                           <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-yellow-400"/>
                           <p>{a.message}</p>
                        </div>
                    )) : <p className="text-green-300">No active alerts.</p>}
                </div>
            ), AlertCircle)}

            {renderCard("Connections", (
                <div className="max-h-40 overflow-auto">
                    <Table>
                        <TableHeader><TableRow><TableHead>Start</TableHead><TableHead>Duration</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {connections.map(c => (
                                <TableRow key={c.id}>
                                    <TableCell>{new Date(c.start_ts).toLocaleTimeString()}</TableCell>
                                    <TableCell>{c.conn_time_sec}s</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            ), LinkIcon)}
        </div>


        <div className="bg-slate-800/50 p-6 rounded-lg flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Save & Download</h3>
            <div className="flex items-center gap-3">
                <Button onClick={handleSave}><Save className="w-4 h-4 mr-2"/>Save Results</Button>
                <Button onClick={() => handleExport('csv')}><Download className="w-4 h-4 mr-2"/>Export CSV</Button>
                <Button onClick={() => handleExport('pdf')}><FileText className="w-4 h-4 mr-2"/>Export PDF</Button>
            </div>
        </div>
    </motion.div>
  );
};

export default ResultsPanel;
