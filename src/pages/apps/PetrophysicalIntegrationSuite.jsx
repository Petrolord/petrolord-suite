import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, Layers, ArrowLeft, Activity, Compass, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PetrophysicalIntegrationSuite = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-slate-800 pb-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/dashboard/geoscience')}
            className="text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="p-3 bg-blue-500/10 rounded-xl">
            <Database className="h-8 w-8 text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Petrophysical Integration Suite</h1>
            <p className="text-slate-400 mt-1">Advanced petrophysical data integration and cross-domain workflows.</p>
          </div>
        </div>

        {/* Status / Under Construction Banner */}
        <Card className="bg-blue-950/20 border-blue-900/50">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-3 bg-blue-500/20 rounded-full">
              <Compass className="h-6 w-6 text-blue-400 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-blue-100">Module Under Construction</h3>
              <p className="text-sm text-blue-200/70 mt-1">
                We are currently building out the core capabilities for the Petrophysical Integration Suite. 
                Soon, you will be able to perform seamless well log conditioning, core-to-log integration, and multi-mineral analysis.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Feature Grid placeholder */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <Activity className="h-6 w-6 text-emerald-400 mb-2" />
              <CardTitle className="text-slate-100">Log Conditioning</CardTitle>
              <CardDescription className="text-slate-400">
                Automated environmental corrections, depth matching, and splice generation for raw wireline data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button disabled variant="outline" className="w-full border-slate-700 text-slate-300">
                Coming Soon
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <Layers className="h-6 w-6 text-purple-400 mb-2" />
              <CardTitle className="text-slate-100">Core-Log Integration</CardTitle>
              <CardDescription className="text-slate-400">
                Seamlessly calibrate log responses to core measurements with interactive cross-plotting and regression.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button disabled variant="outline" className="w-full border-slate-700 text-slate-300">
                Coming Soon
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <Settings className="h-6 w-6 text-amber-400 mb-2" />
              <CardTitle className="text-slate-100">Multi-Mineral Solvers</CardTitle>
              <CardDescription className="text-slate-400">
                Determine complex lithology and pore fluid volumes using advanced probabilistic algorithms.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button disabled variant="outline" className="w-full border-slate-700 text-slate-300">
                Coming Soon
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PetrophysicalIntegrationSuite;