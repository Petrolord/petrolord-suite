import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { BarChart, Download, FileText, ShieldCheck, AlertTriangle, Beaker, DollarSign, Map, Save, LineChart as LineChartIcon, Thermometer } from 'lucide-react';
import CollapsibleSection from './CollapsibleSection';
import RiskHeatmap from './RiskHeatmap';
import { supabase } from '@/lib/customSupabaseClient';
import { exportFlowAssuranceCSV, exportFlowAssurancePDF } from '@/utils/flowAssuranceExport';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-800/80 backdrop-blur-sm p-2 border border-lime-400/50 rounded-md shadow-lg text-white">
                <p className="label text-lime-300">{`Distance: ${(label / 1000).toFixed(2)} kft`}</p>
                {payload.map(p => (
                     <p key={p.name} style={{ color: p.color }}>{`${p.name}: ${p.value.toFixed(1)}`}</p>
                ))}
            </div>
        );
    }
    return null;
};

const ResultsPanel = ({ results, inputs }) => {
  const { kpis, profiles, recommendations, alerts } = results;
  const { toast } = useToast();

  const handleSave = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to save.' });
        return;
    }

    try {
        // Task 3: Implement explicit Select -> Update/Insert to avoid any ON CONFLICT issues
        const { data: existingProject, error: fetchError } = await supabase
            .from('flow_assurance_projects')
            .select('id')
            .eq('user_id', user.id)
            .eq('project_name', inputs.projectName)
            .maybeSingle();

        if (fetchError) throw fetchError;

        const projectData = {
            user_id: user.id,
            project_name: inputs.projectName,
            inputs_data: inputs,
            results_data: results,
            updated_at: new Date().toISOString()
        };
        
        if (existingProject) {
            // Update
            const { error: updateError } = await supabase
                .from('flow_assurance_projects')
                .update(projectData)
                .eq('id', existingProject.id);
            if (updateError) throw updateError;
        } else {
            // Insert
            const { error: insertError } = await supabase
                .from('flow_assurance_projects')
                .insert(projectData);
            if (insertError) throw insertError;
        }

        toast({ title: 'Project Saved & Updated', description: `Results for "${inputs.projectName}" have been saved.` });
    } catch (error) {
        console.error('Save results error:', error);
        toast({ variant: 'destructive', title: 'Save Error', description: error.message || 'Failed to save results.' });
    }
  };

  const kpiCards = [
    { key: 'overallRisk', label: 'Overall Risk', icon: ShieldCheck },
    { key: 'highestRiskFactor', label: 'Highest Risk Factor', icon: AlertTriangle },
    { key: 'mitigationCost', label: 'Est. Mitigation Cost', unit: '$/day', icon: DollarSign },
  ];
  
  const recommendationCards = [
    { key: 'inhibitorType', label: 'Inhibitor Type', icon: Beaker },
    { key: 'dosage', label: 'Dosage', unit: 'ppm', icon: Beaker },
    { key: 'action', label: 'Primary Action', icon: Beaker },
  ];

  return (
    <div className="space-y-6">
      <CollapsibleSection title="Overall Risk Status & KPIs" icon={<BarChart />} defaultOpen>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {kpiCards.map(({ key, label, icon: Icon, unit }) => (
            <motion.div key={key} className={`bg-slate-800/50 p-4 rounded-lg ${kpis.overallRisk !== 'Low' && key === 'overallRisk' ? 'bg-red-500/20' : ''}`}>
              <div className="flex items-center space-x-3">
                <Icon className={`w-6 h-6 ${kpis.overallRisk !== 'Low' && key === 'overallRisk' ? 'text-red-400' : 'text-lime-300'}`} />
                <p className="text-sm text-slate-300">{label}</p>
              </div>
              <p className="text-3xl font-bold text-white mt-2">{kpis[key]} <span className="text-lg font-normal text-slate-400">{unit}</span></p>
            </motion.div>
          ))}
        </div>
      </CollapsibleSection>

        <CollapsibleSection title="P/T Profile & Risk Envelopes" icon={<LineChartIcon />} defaultOpen>
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={profiles.ptProfile}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.2)" />
                    <XAxis dataKey="distance" unit=" ft" stroke="#a3e635" tickFormatter={(tick) => (tick / 1000).toFixed(1) + 'k'}/>
                    <YAxis yAxisId="left" stroke="#38bdf8" label={{ value: 'Pressure (psia)', angle: -90, position: 'insideLeft', fill: '#38bdf8' }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#facc15" label={{ value: 'Temperature (°F)', angle: -90, position: 'insideRight', fill: '#facc15' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="pressure" stroke="#38bdf8" name="Pressure Profile" dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="temperature" stroke="#facc15" name="Temp. Profile" dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="hydrateTemp" stroke="#ef4444" name="Hydrate Curve" dot={false} strokeDasharray="5 5" />
                    <Line yAxisId="right" type="monotone" dataKey="waxTemp" stroke="#a855f7" name="WAT" dot={false} strokeDasharray="5 5" />
                </LineChart>
            </ResponsiveContainer>
      </CollapsibleSection>

      <CollapsibleSection title="Risk Heatmap by Segment" icon={<Map />} defaultOpen>
        <RiskHeatmap data={profiles.riskProfile} />
      </CollapsibleSection>
      
      <CollapsibleSection title="AI-Driven Mitigation Strategy" icon={<Beaker />} defaultOpen>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {recommendationCards.map(({ key, label, unit, icon: Icon }) => (
            <motion.div key={key} className="bg-green-500/10 p-4 rounded-lg border border-green-500/30">
              <div className="flex items-center space-x-3">
                <Icon className="w-6 h-6 text-green-300" />
                <p className="text-sm text-green-200">{label}</p>
              </div>
              <p className="text-2xl font-bold text-white mt-2">{recommendations[key]} <span className="text-lg text-green-300">{unit}</span></p>
            </motion.div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Active Alerts Log" icon={<AlertTriangle />}>
        <div className="bg-slate-800/50 p-4 rounded-lg max-h-60 overflow-y-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-lime-300 uppercase">
                    <tr><th className="p-2">Time</th><th className="p-2">Location</th><th className="p-2">Risk Type</th><th className="p-2">Severity</th><th className="p-2">Action</th></tr>
                </thead>
                <tbody className="text-white">
                    {alerts.map((alert, i) => (
                        <tr key={i} className="border-b border-slate-700">
                            <td className="p-2">{alert.timestamp}</td>
                            <td className="p-2">{alert.location}</td>
                            <td className="p-2">{alert.riskType}</td>
                            <td className="p-2"><span className="font-bold text-red-400">{alert.severity}</span></td>
                            <td className="p-2">{alert.action}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Save & Export Results" icon={<Download />}>
        <div className="bg-slate-800/50 p-6 rounded-lg flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Save Progress & Download Analysis</h3>
            <div className="flex items-center gap-3">
                <Button onClick={handleSave} className="bg-lime-600 hover:bg-lime-500 text-white"><Save className="w-4 h-4 mr-2"/>Save Results</Button>
                <Button variant="outline" className="border-slate-700 hover:bg-slate-800 text-white" onClick={() => exportFlowAssuranceCSV(results, inputs)}><Download className="w-4 h-4 mr-2"/>Export CSV</Button>
                <Button variant="outline" className="border-slate-700 hover:bg-slate-800 text-white" onClick={() => exportFlowAssurancePDF(results, inputs)}><FileText className="w-4 h-4 mr-2"/>Export PDF</Button>
            </div>
        </div>
      </CollapsibleSection>
    </div>
  );
};

export default ResultsPanel;