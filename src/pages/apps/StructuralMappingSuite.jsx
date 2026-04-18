import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layers, Map, Construction } from 'lucide-react';

const StructuralMappingSuite = () => {
  return (
    <div className="p-6 bg-slate-950 min-h-screen text-slate-100">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Structural Mapping Suite
            </h1>
            <p className="text-slate-400 mt-2">
              Advanced geological structure interpretation and mapping tools.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">Load Project</Button>
            <Button className="bg-blue-600 hover:bg-blue-500">New Map</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-400" />
                Horizon Mapping
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-400 text-sm mb-4">
                Interpret and map key geological horizons across 2D/3D seismic data.
              </p>
              <Button className="w-full bg-slate-800 hover:bg-slate-700">Launch Tool</Button>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Construction className="w-5 h-5 text-orange-400" />
                Fault Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-400 text-sm mb-4">
                Detailed fault plane interpretation and seal analysis workflows.
              </p>
              <Button className="w-full bg-slate-800 hover:bg-slate-700">Launch Tool</Button>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Map className="w-5 h-5 text-emerald-400" />
                Grid Generation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-400 text-sm mb-4">
                Create structural grids and surfaces for reservoir modeling.
              </p>
              <Button className="w-full bg-slate-800 hover:bg-slate-700">Launch Tool</Button>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-slate-900 border-slate-800 min-h-[400px] flex items-center justify-center border-dashed">
          <div className="text-center text-slate-500">
            <Map className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-medium">Interactive Mapping Canvas</h3>
            <p className="max-w-md mx-auto mt-2">
              Select a tool above or load a project to begin structural interpretation.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default StructuralMappingSuite;