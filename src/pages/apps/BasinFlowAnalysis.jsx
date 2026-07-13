import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  Layers, Save, Play, AlertCircle, Download, Share2, 
  Thermometer, Droplet, Activity, FileText 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';

const BasinFlowAnalysis = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [project, setProject] = useState({
    id: null,
    name: 'New Basin Model',
    description: '',
    stratigraphy: [
      { id: 1, name: 'Overburden', thickness: 1500, lithology: 'Shale', age_top: 0, age_bottom: 20 },
      { id: 2, name: 'Reservoir A', thickness: 200, lithology: 'Sandstone', age_top: 20, age_bottom: 25 },
      { id: 3, name: 'Seal', thickness: 50, lithology: 'Evaporite', age_top: 25, age_bottom: 30 },
      { id: 4, name: 'Source Rock', thickness: 100, lithology: 'Organic Shale', age_top: 30, age_bottom: 45, toc: 4.5, hi: 450 }
    ],
    thermal_parameters: {
      geothermal_gradient: 30, // C/km
      surface_temp: 20, // C
      heat_flow: 60 // mW/m2
    }
  });
  
  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Calculate maturity (Simple TTI/Arrhenius proxy for demo)
  const runSimulation = useCallback(() => {
    setIsLoading(true);
    setTimeout(() => {
      // Generate synthetic burial history curves
      const burialHistory = [];
      const maturityProfile = [];
      let currentDepth = 0;
      
      // Create time steps from oldest age to present (0)
      const maxAge = Math.max(...project.stratigraphy.map(l => l.age_bottom));
      
      for (let time = maxAge; time >= 0; time-=5) {
        // Simple burial calculation
        const buriedLayers = project.stratigraphy.filter(l => l.age_top < time);
        // Calculate depth at this time (simplified linear sedimentation)
        let depth = 0;
        project.stratigraphy.forEach(layer => {
             if (layer.age_bottom > time) {
                 const depositedFraction = Math.min(1, (layer.age_bottom - time) / (layer.age_bottom - layer.age_top));
                 depth += layer.thickness * Math.max(0, depositedFraction);
             }
        });

        const temp = project.thermal_parameters.surface_temp + (depth / 1000 * project.thermal_parameters.geothermal_gradient);
        // Ro proxy
        const ro = 0.2 + (0.00015 * Math.exp(0.04 * temp));

        burialHistory.push({
          time: time,
          depth: depth,
          temp: temp,
          ro: ro
        });
      }

      setResults({ burialHistory });
      setIsLoading(false);
      toast({ title: "Simulation Complete", description: "Basin model processed successfully." });
    }, 1500);
  }, [project, toast]);

  const handleSave = async () => {
    if (!user) return;
    try {
      const payload = {
        user_id: user.id,
        name: project.name,
        description: project.description,
        stratigraphy: project.stratigraphy,
        thermal_parameters: project.thermal_parameters,
        updated_at: new Date()
      };

      let error;
      if (project.id) {
        const res = await supabase.from('bf_projects').update(payload).eq('id', project.id);
        error = res.error;
      } else {
        const res = await supabase.from('bf_projects').insert([payload]).select().single();
        if (res.data) setProject(prev => ({ ...prev, id: res.data.id }));
        error = res.error;
      }

      if (error) throw error;
      toast({ title: "Project Saved", description: "Your basin model has been saved to the cloud." });
    } catch (err) {
      console.error(err);
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    }
  };

  const updateLayer = (id, field, value) => {
    const newStrat = project.stratigraphy.map(l => l.id === id ? { ...l, [field]: value } : l);
    setProject({ ...project, stratigraphy: newStrat });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-amber-600 bg-clip-text text-transparent flex items-center gap-3">
            <Layers className="w-8 h-8 text-orange-500" />
            BasinFlow Genesis
          </h1>
          <p className="text-slate-400 mt-1">Basin Modeling & Petroleum System Analysis</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button onClick={handleSave} variant="outline" className="flex-1 md:flex-none border-slate-700 hover:bg-slate-800">
            <Save className="w-4 h-4 mr-2" /> Save
          </Button>
          <Button onClick={runSimulation} disabled={isLoading} className="flex-1 md:flex-none bg-orange-600 hover:bg-orange-700">
            {isLoading ? <Activity className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Simulate
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Panel: Inputs */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-400">
                <FileText className="w-5 h-5" /> Project Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Model Name</Label>
                <Input 
                  value={project.name} 
                  onChange={(e) => setProject({...project, name: e.target.value})} 
                  className="bg-slate-800 border-slate-700" 
                />
              </div>
              <div>
                <Label>Geothermal Gradient (°C/km)</Label>
                <div className="flex items-center gap-4">
                  <Slider 
                    value={[project.thermal_parameters.geothermal_gradient]} 
                    min={15} max={60} step={1}
                    onValueChange={(v) => setProject({...project, thermal_parameters: {...project.thermal_parameters, geothermal_gradient: v[0]}})} 
                    className="flex-1"
                  />
                  <span className="w-12 text-right">{project.thermal_parameters.geothermal_gradient}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-400">
                <Layers className="w-5 h-5" /> Stratigraphy
              </CardTitle>
              <CardDescription>Define layers from top (shallow) to bottom (deep)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
              {project.stratigraphy.map((layer, idx) => (
                <div key={layer.id} className="p-4 bg-slate-950/50 rounded-lg border border-slate-800 space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium text-slate-200">Layer {idx + 1}</h4>
                    <span className="text-xs px-2 py-1 bg-slate-800 rounded text-slate-400">{layer.lithology}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-slate-500">Name</Label>
                      <Input 
                        value={layer.name} 
                        onChange={(e) => updateLayer(layer.id, 'name', e.target.value)}
                        className="h-8 bg-slate-900 border-slate-700 text-xs" 
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Thickness (m)</Label>
                      <Input 
                        type="number" 
                        value={layer.thickness} 
                        onChange={(e) => updateLayer(layer.id, 'thickness', Number(e.target.value))}
                        className="h-8 bg-slate-900 border-slate-700 text-xs" 
                      />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right Panel: Results */}
        <div className="lg:col-span-8 space-y-6">
           {!results ? (
             <div className="h-[600px] flex flex-col items-center justify-center bg-slate-900/50 border-2 border-dashed border-slate-800 rounded-xl">
               <div className="p-4 bg-slate-800 rounded-full mb-4 animate-pulse">
                 <Layers className="w-12 h-12 text-slate-600" />
               </div>
               <h3 className="text-xl font-semibold text-slate-400">Ready to Simulate</h3>
               <p className="text-slate-500 max-w-md text-center mt-2">
                 Configure your stratigraphy and thermal parameters, then click Simulate to generate burial history and maturation models.
               </p>
             </div>
           ) : (
             <div className="grid grid-cols-1 gap-6">
               <Card className="bg-slate-900 border-slate-800">
                 <CardHeader>
                   <CardTitle>Burial History & Isotherms</CardTitle>
                 </CardHeader>
                 <CardContent className="h-[400px]">
                   <ResponsiveContainer width="100%" height="100%">
                     <AreaChart data={results.burialHistory}>
                       <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                       <XAxis dataKey="time" reversed label={{ value: 'Time (Ma)', position: 'bottom', fill: '#94a3b8' }} stroke="#94a3b8" />
                       <YAxis reversed label={{ value: 'Depth (m)', angle: -90, position: 'left', fill: '#94a3b8' }} stroke="#94a3b8" />
                       <Tooltip 
                         contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }}
                         itemStyle={{ color: '#cbd5e1' }}
                       />
                       <Legend />
                       <Area type="monotone" dataKey="depth" stroke="#f97316" fill="#f97316" fillOpacity={0.2} name="Burial Depth" />
                       <Area type="monotone" dataKey="temp" stroke="#ef4444" fill="none" name="Temperature (°C)" />
                     </AreaChart>
                   </ResponsiveContainer>
                 </CardContent>
               </Card>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <Card className="bg-slate-900 border-slate-800">
                    <CardHeader><CardTitle>Source Rock Maturity (Ro)</CardTitle></CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={results.burialHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="time" reversed stroke="#94a3b8" />
                          <YAxis domain={[0, 2.0]} label={{ value: '%Ro', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} stroke="#94a3b8" />
                          <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                          <Line type="monotone" dataKey="ro" stroke="#10b981" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                 </Card>
                 
                 <Card className="bg-slate-900 border-slate-800">
                    <CardHeader><CardTitle>Hydrocarbon Generation Window</CardTitle></CardHeader>
                    <CardContent className="flex items-center justify-center h-[300px]">
                      <div className="text-center space-y-2">
                         <div className="text-5xl font-bold text-emerald-500">
                           {results.burialHistory[results.burialHistory.length - 1].ro.toFixed(2)}%
                         </div>
                         <p className="text-slate-400 text-sm">Present Day Vitrinite Reflectance</p>
                         <div className="mt-4 px-4 py-2 bg-slate-800 rounded-lg border border-slate-700">
                           {results.burialHistory[results.burialHistory.length - 1].ro < 0.6 && <span className="text-blue-400">Immature</span>}
                           {results.burialHistory[results.burialHistory.length - 1].ro >= 0.6 && results.burialHistory[results.burialHistory.length - 1].ro < 1.0 && <span className="text-green-400">Oil Window</span>}
                           {results.burialHistory[results.burialHistory.length - 1].ro >= 1.0 && results.burialHistory[results.burialHistory.length - 1].ro < 1.3 && <span className="text-yellow-400">Wet Gas Window</span>}
                           {results.burialHistory[results.burialHistory.length - 1].ro >= 1.3 && <span className="text-red-400">Dry Gas Window</span>}
                         </div>
                      </div>
                    </CardContent>
                 </Card>
               </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default BasinFlowAnalysis;