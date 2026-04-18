import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Activity, Layers, GitBranch, Map } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const WellCorrelationTool = () => {
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
            <Activity className="h-8 w-8 text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Well Correlation Tool</h1>
            <p className="text-slate-400 mt-1">Interactively correlate well logs, create cross-sections, and visualize subsurface data.</p>
          </div>
        </div>

        {/* Status Banner */}
        <Card className="bg-blue-950/20 border-blue-900/50">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-3 bg-blue-500/20 rounded-full">
              <Activity className="h-6 w-6 text-blue-400 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-blue-100">Application Initializing</h3>
              <p className="text-sm text-blue-200/70 mt-1">
                The core capabilities for the Well Correlation Tool are currently loading. Soon you will be able to perform stratigraphic correlations, build cross-sections, and integrate seismic surfaces.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <Layers className="h-6 w-6 text-emerald-400 mb-2" />
              <CardTitle className="text-slate-100">Stratigraphic Correlation</CardTitle>
              <CardDescription className="text-slate-400">
                Pick and correlate stratigraphic tops and markers interactively across multiple well logs.
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
              <GitBranch className="h-6 w-6 text-purple-400 mb-2" />
              <CardTitle className="text-slate-100">Cross-Section Builder</CardTitle>
              <CardDescription className="text-slate-400">
                Construct detailed structural and stratigraphic cross-sections using drag-and-drop mechanics.
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
              <Map className="h-6 w-6 text-amber-400 mb-2" />
              <CardTitle className="text-slate-100">Map Integration</CardTitle>
              <CardDescription className="text-slate-400">
                View correlation lines over base maps with seismic horizons and fault overlays.
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

export default WellCorrelationTool;