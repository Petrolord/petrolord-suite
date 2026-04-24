import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Share2 } from 'lucide-react';

const IntegrationGuides = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-xl font-bold text-white">Software Integration Workflows</h2>
      
      <div className="grid grid-cols-1 gap-4">
        <Card className="bg-slate-900 border-slate-800 hover:border-blue-500/50 transition-colors cursor-pointer group">
            <CardHeader>
                <CardTitle className="text-base text-white flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-blue-400" /> Petrel® Integration
                </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-400">
                <p className="mb-2"><strong>Export Workflow:</strong></p>
                <ol className="list-decimal pl-5 space-y-1">
                    <li>Go to the <strong>Export</strong> tab in Velocity Model Builder.</li>
                    <li>Select "ZMap+ Grid Format" for surfaces (V0 maps, K maps).</li>
                    <li>Select "ASCII Well Tops" for markers.</li>
                    <li>In Petrel, right-click "Input" tree -&gt; "Import File".</li>
                    <li>Map the ZMap headers. Ensure CRS is set to Project CRS.</li>
                    <li>Use the "Make Velocity Model" process in Petrel, inputting the imported V0/k surfaces as properties.</li>
                </ol>
            </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 hover:border-yellow-500/50 transition-colors cursor-pointer group">
            <CardHeader>
                <CardTitle className="text-base text-white flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-yellow-400" /> Kingdom® Integration
                </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-400">
                <p className="mb-2"><strong>Export Workflow:</strong></p>
                <ol className="list-decimal pl-5 space-y-1">
                    <li>Kingdom prefers grid formats in standard "ZMap" or "GXF".</li>
                    <li>For Time-Depth charts, export as "T-D Pairs (CSV)".</li>
                    <li>In Kingdom, use "TD Chart Management" to batch import the CSVs matched by Well UWI/API.</li>
                    <li>Load velocity grids as horizons or grid surfaces for on-the-fly conversion in the spatial view.</li>
                </ol>
            </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 hover:border-red-500/50 transition-colors cursor-pointer group">
            <CardHeader>
                <CardTitle className="text-base text-white flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-red-400" /> Reservoir Simulation (Eclipse/CMG)
                </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-400">
                <p className="mb-2">Simulators require structural corner-point grids (GRDECL or RESQML).</p>
                <p>Velocity Model Builder exports the <strong>Depth Converted Surfaces</strong> which form the framework of the static model. Export final depth maps as "Irap Classic" or "ZMap" for direct import into the geological modeling package (Petrel/JewelSuite) that builds the simulation grid.</p>
            </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default IntegrationGuides;