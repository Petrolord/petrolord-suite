import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, Route as RouteIcon, Save, Play, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PipelineDesigner = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const [inputs, setInputs] = useState({
    flowRate: 20000,
    inletPressure: 1500,
    outletPressure: 200,
    length: 10,
    fluidType: 'oil'
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: parseFloat(value) || value }));
  };

  const handleSimulate = () => {
    setLoading(true);
    // Simulate calculation delay
    setTimeout(() => {
      setResults({
        recommendedDiameter: 8.625,
        pressureDrop: 1250,
        velocity: 6.5,
        erosionalVelocity: 35.2,
        status: 'Optimal'
      });
      setLoading(false);
      toast({
        title: "Simulation Complete",
        description: "Pipeline parameters have been optimized successfully.",
      });
    }, 1500);
  };

  return (
    <>
      <Helmet>
        <title>Pipeline Designer - Petrolord Suite</title>
        <meta name="description" content="Advanced pipeline sizing and network hydraulics design." />
      </Helmet>
      
      <div className="flex flex-col h-full bg-slate-950 text-white p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg">
              <RouteIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Pipeline Designer</h1>
              <p className="text-sm text-slate-400">Design, size, and simulate pipeline networks</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" asChild className="border-slate-700 hover:bg-slate-800">
              <Link to="/dashboard/facilities">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Link>
            </Button>
            <Button variant="outline" className="border-slate-700 hover:bg-slate-800" onClick={() => toast({ title: 'Not Implemented' })}>
              <Save className="w-4 h-4 mr-2" /> Save
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow">
          {/* Inputs Panel */}
          <Card className="bg-slate-900 border-slate-800 col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Design Parameters</CardTitle>
              <CardDescription>Enter flow conditions and constraints</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Fluid Type</Label>
                <Select value={inputs.fluidType} onValueChange={(val) => setInputs(prev => ({...prev, fluidType: val}))}>
                  <SelectTrigger className="bg-slate-950 border-slate-800">
                    <SelectValue placeholder="Select fluid..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white">
                    <SelectItem value="oil">Black Oil</SelectItem>
                    <SelectItem value="gas">Dry Gas</SelectItem>
                    <SelectItem value="multiphase">Multiphase</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Flow Rate (bbl/d or Mscf/d)</Label>
                <Input type="number" name="flowRate" value={inputs.flowRate} onChange={handleInputChange} className="bg-slate-950 border-slate-800" />
              </div>
              <div className="space-y-2">
                <Label>Inlet Pressure (psi)</Label>
                <Input type="number" name="inletPressure" value={inputs.inletPressure} onChange={handleInputChange} className="bg-slate-950 border-slate-800" />
              </div>
              <div className="space-y-2">
                <Label>Required Outlet Pressure (psi)</Label>
                <Input type="number" name="outletPressure" value={inputs.outletPressure} onChange={handleInputChange} className="bg-slate-950 border-slate-800" />
              </div>
              <div className="space-y-2">
                <Label>Pipeline Length (miles)</Label>
                <Input type="number" name="length" value={inputs.length} onChange={handleInputChange} className="bg-slate-950 border-slate-800" />
              </div>
              
              <Button onClick={handleSimulate} disabled={loading} className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700">
                {loading ? <span className="animate-pulse">Simulating...</span> : <><Play className="w-4 h-4 mr-2" /> Run Simulation</>}
              </Button>
            </CardContent>
          </Card>

          {/* Results Panel */}
          <Card className="bg-slate-900 border-slate-800 col-span-1 lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Simulation Results</CardTitle>
                <CardDescription>Optimal sizing and hydraulic profile</CardDescription>
              </div>
              {results && (
                <Button variant="outline" size="sm" className="border-slate-700">
                  <Download className="w-4 h-4 mr-2" /> Export
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!results && !loading && (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500 border-2 border-dashed border-slate-800 rounded-lg">
                  <RouteIcon className="w-12 h-12 mb-3 opacity-50" />
                  <p>Run a simulation to view results</p>
                </div>
              )}

              {loading && (
                <div className="flex flex-col items-center justify-center h-64 text-indigo-400">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
                  <p>Calculating hydraulic profile...</p>
                </div>
              )}

              {results && !loading && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                      <p className="text-xs text-slate-400 mb-1">Recommended ID</p>
                      <p className="text-2xl font-bold text-indigo-400">{results.recommendedDiameter}"</p>
                    </div>
                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                      <p className="text-xs text-slate-400 mb-1">Total Pressure Drop</p>
                      <p className="text-2xl font-bold text-rose-400">{results.pressureDrop} psi</p>
                    </div>
                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                      <p className="text-xs text-slate-400 mb-1">Avg Velocity</p>
                      <p className="text-2xl font-bold text-emerald-400">{results.velocity} ft/s</p>
                    </div>
                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                      <p className="text-xs text-slate-400 mb-1">Erosional Vel. Limit</p>
                      <p className="text-2xl font-bold text-amber-400">{results.erosionalVelocity} ft/s</p>
                    </div>
                  </div>

                  <div className="bg-slate-950 rounded-lg border border-slate-800 p-6 flex items-center justify-center h-48">
                     <p className="text-slate-500">Hydraulic Gradient Profile Chart (Placeholder)</p>
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default PipelineDesigner;