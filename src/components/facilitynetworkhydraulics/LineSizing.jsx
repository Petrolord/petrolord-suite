import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { calculatePipelineHydraulics, calculatePipeStress } from './PipelineSizerEngine';
import { PipeSchedules, Materials } from './PipeDatabase';
import { optimizePipeline } from './OptimizationEngine';
import { exportToPDF, exportToJSON } from './ExportUtils';
import { Download, Save, TrendingUp, Settings, BarChart2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

export default function LineSizing() {
  const { toast } = useToast();
  const [inputs, setInputs] = useState({
    flowRate: 500, // m3/hr
    density: 850, // kg/m3
    viscosity: 2.5, // cP
    diameter: 6.065, // inches (ID)
    length: 1000, // meters
    roughness: 0.0018, // inches
    elevationChange: 10, // meters
    fittingsK: 2.5,
    operatingPressure: 50, // bar
    material: 'cs_api_5l_b'
  });

  const [results, setResults] = useState(null);
  const [stress, setStress] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  
  useEffect(() => {
    handleCalculate();
  }, [inputs]);

  const handleInputChange = (field, value) => {
    setInputs(prev => ({ ...prev, [field]: parseFloat(value) || value }));
  };

  const handleCalculate = () => {
    try {
      const selectedMat = Materials.find(m => m.id === inputs.material);
      const hydRes = calculatePipelineHydraulics(inputs);
      const strRes = calculatePipeStress(
        inputs.operatingPressure, 
        inputs.diameter + 0.5, // Approx OD
        0.25, // Approx WT
        selectedMat?.yieldStrength || 35000
      );
      
      setResults(hydRes);
      setStress(strRes);
    } catch (error) {
      console.error(error);
    }
  };

  const handleOptimize = () => {
    const selectedMat = Materials.find(m => m.id === inputs.material);
    const optimal = optimizePipeline(
      { ...inputs, yieldStrength: selectedMat?.yieldStrength || 35000 },
      { maxVelocity: 3.5, maxPressureDrop: 5, minSafetyFactor: 1.5 }
    );
    
    if (optimal) {
      toast({
        title: "Optimization Complete",
        description: `Optimal size found: ${optimal.pipe.nominalSize}" Sch ${optimal.pipe.schedule}`,
      });
      handleInputChange('diameter', optimal.pipe.id);
    } else {
      toast({
        variant: "destructive",
        title: "Optimization Failed",
        description: "No pipe schedule meets the constraints.",
      });
    }
  };

  const handleSaveScenario = () => {
    const newScenario = { id: Date.now(), inputs: { ...inputs }, results, stress };
    setScenarios([...scenarios, newScenario]);
    toast({ title: "Scenario Saved", description: "Added to comparison list." });
  };

  const profileData = [
    { dist: 0, pressure: inputs.operatingPressure },
    { dist: inputs.length * 0.25, pressure: inputs.operatingPressure - ((results?.totalPressureDropBar || 0) * 0.25) },
    { dist: inputs.length * 0.5, pressure: inputs.operatingPressure - ((results?.totalPressureDropBar || 0) * 0.5) },
    { dist: inputs.length * 0.75, pressure: inputs.operatingPressure - ((results?.totalPressureDropBar || 0) * 0.75) },
    { dist: inputs.length, pressure: inputs.operatingPressure - (results?.totalPressureDropBar || 0) },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Panel */}
        <Card className="col-span-1 bg-slate-900 border-slate-800 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1670580479846-261c4e21ff17)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <CardHeader className="relative z-10">
            <CardTitle className="text-xl font-semibold flex items-center"><Settings className="w-5 h-5 mr-2" /> Parameters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 relative z-10">
            <div className="space-y-2">
              <Label className="text-slate-300">Flow Rate (m³/hr)</Label>
              <Input type="number" value={inputs.flowRate} onChange={(e) => handleInputChange('flowRate', e.target.value)} className="bg-slate-800 border-slate-700 text-white" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Density (kg/m³)</Label>
                <Input type="number" value={inputs.density} onChange={(e) => handleInputChange('density', e.target.value)} className="bg-slate-800 border-slate-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Viscosity (cP)</Label>
                <Input type="number" value={inputs.viscosity} onChange={(e) => handleInputChange('viscosity', e.target.value)} className="bg-slate-800 border-slate-700 text-white" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Internal Diameter (inches)</Label>
              <Input type="number" value={inputs.diameter} onChange={(e) => handleInputChange('diameter', e.target.value)} className="bg-slate-800 border-slate-700 text-white" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Length (m)</Label>
                <Input type="number" value={inputs.length} onChange={(e) => handleInputChange('length', e.target.value)} className="bg-slate-800 border-slate-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Elevation (m)</Label>
                <Input type="number" value={inputs.elevationChange} onChange={(e) => handleInputChange('elevationChange', e.target.value)} className="bg-slate-800 border-slate-700 text-white" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Material</Label>
              <Select value={inputs.material} onValueChange={(val) => handleInputChange('material', val)}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  {Materials.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="pt-4 flex gap-2">
              <Button onClick={handleOptimize} className="flex-1 bg-indigo-600 hover:bg-indigo-700"><TrendingUp className="w-4 h-4 mr-2" /> Optimize</Button>
              <Button onClick={handleSaveScenario} variant="outline" className="flex-1 border-slate-700 text-white hover:bg-slate-800"><Save className="w-4 h-4 mr-2" /> Save</Button>
            </div>
          </CardContent>
        </Card>

        {/* Results Dashboard */}
        <div className="col-span-1 lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-6">
                <div className="text-sm text-slate-400">Velocity</div>
                <div className={`text-2xl font-bold ${results?.velocity > 3 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {results?.velocity?.toFixed(2)} m/s
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-6">
                <div className="text-sm text-slate-400">Total ΔP</div>
                <div className="text-2xl font-bold text-blue-400">
                  {results?.totalPressureDropBar?.toFixed(2)} bar
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-6">
                <div className="text-sm text-slate-400">Flow Regime</div>
                <div className="text-2xl font-bold text-amber-400">
                  {results?.flowRegime}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-6">
                <div className="text-sm text-slate-400">Safety Factor</div>
                <div className={`text-2xl font-bold ${stress?.isSafe ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stress?.safetyFactor?.toFixed(1)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-900 border-slate-800 text-white relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1521737023650-6f374e9fb8d5)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <CardHeader className="flex flex-row items-center justify-between relative z-10">
              <CardTitle className="text-xl flex items-center"><BarChart2 className="w-5 h-5 mr-2" /> Pressure Profile</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportToJSON({inputs, results}, 'pipeline.json')} className="border-slate-700 text-white hover:bg-slate-800"><Download className="w-4 h-4 mr-2" /> JSON</Button>
                <Button size="sm" onClick={() => exportToPDF({inputs, results}, 'pipeline.pdf')} className="bg-blue-600 hover:bg-blue-700 text-white"><Download className="w-4 h-4 mr-2" /> PDF</Button>
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={profileData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="dist" stroke="#94a3b8" label={{ value: 'Distance (m)', position: 'insideBottomRight', offset: -10, fill: '#94a3b8' }} />
                    <YAxis stroke="#94a3b8" label={{ value: 'Pressure (bar)', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                    <Line type="monotone" dataKey="pressure" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          
          {scenarios.length > 0 && (
             <Card className="bg-slate-900 border-slate-800 text-white">
                <CardHeader>
                  <CardTitle className="text-xl">Scenario Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={scenarios.map((s, i) => ({ name: `Scen ${i+1}`, dp: s.results.totalPressureDropBar, vel: s.results.velocity }))} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis yAxisId="left" stroke="#3b82f6" label={{ value: 'ΔP (bar)', angle: -90, position: 'insideLeft', fill: '#3b82f6' }} />
                        <YAxis yAxisId="right" orientation="right" stroke="#10b981" label={{ value: 'Velocity (m/s)', angle: -90, position: 'insideRight', fill: '#10b981' }} />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                        <Bar yAxisId="left" dataKey="dp" fill="#3b82f6" name="Pressure Drop" />
                        <Bar yAxisId="right" dataKey="vel" fill="#10b981" name="Velocity" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
             </Card>
          )}

        </div>
      </div>
    </div>
  );
}