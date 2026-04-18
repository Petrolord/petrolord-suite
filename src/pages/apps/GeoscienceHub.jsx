import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layers, Box, TrendingUp, ArrowRight, Database, Cuboid, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AppCard = ({ title, description, icon: Icon, path, status = "Available" }) => {
  const navigate = useNavigate();
  return (
    <Card className="bg-slate-900 border-slate-800 hover:border-slate-600 transition-all cursor-pointer group" onClick={() => navigate(path)}>
      <CardHeader>
        <div className="flex items-center justify-between mb-2">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Icon className="h-6 w-6 text-blue-400" />
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${status === 'Available' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
            {status}
          </span>
        </div>
        <CardTitle className="text-slate-100 group-hover:text-blue-400 transition-colors">{title}</CardTitle>
        <CardDescription className="text-slate-400">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="ghost" className="w-full justify-between group-hover:bg-slate-800 text-slate-300 hover:text-white">
          Launch App <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
};

const GeoscienceHub = () => {
  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white tracking-tight">Geoscience Analytics Hub</h1>
          <p className="text-slate-400 text-lg">Advanced tools for subsurface modeling, petrophysics, and reservoir characterization.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AppCard 
            title="EarthModel Pro"
            description="Comprehensive 3D geological modeling platform. Build surfaces, grids, and calculate volumes."
            icon={Cuboid}
            path="/dashboard/apps/geoscience/earth-model-pro"
          />
          <AppCard 
            title="Well Correlation Tool"
            description="Interactively correlate well logs, create cross-sections, and visualize subsurface data."
            icon={Activity}
            path="/dashboard/apps/geoscience/well-correlation-tool"
          />
          <AppCard 
            title="Log Facies Analysis"
            description="AI-powered facies classification and well log interpretation."
            icon={Layers}
            path="/dashboard/apps/geoscience/log-facies-analysis"
          />
          <AppCard 
            title="Petrophysics Estimator"
            description="Advanced petrophysical property estimation and saturation modeling."
            icon={Database}
            path="/dashboard/apps/geoscience/petrophysics-estimator"
          />
          <AppCard 
            title="Petrophysical Integration Suite"
            description="Advanced petrophysical data integration, well log conditioning, and cross-domain workflows."
            icon={Database}
            path="/dashboard/apps/geoscience/petrophysical-integration-suite"
          />
          <AppCard 
            title="Contour Map Digitizer"
            description="Convert static map images into digital XYZ contour data."
            icon={Box}
            path="/dashboard/apps/geoscience/contour-map-digitizer"
          />
          <AppCard 
            title="Velocity Model Builder"
            description="Create and calibration velocity models for depth conversion."
            icon={TrendingUp}
            path="/dashboard/apps/geoscience/velocity-model-builder"
          />
          <AppCard 
            title="Mechanical Earth Model"
            description="Geomechanical modeling and wellbore stability analysis."
            icon={Layers}
            path="/dashboard/apps/geoscience/mechanical-earth-model"
          />
        </div>

        <div className="mt-12 p-6 bg-slate-900/50 rounded-xl border border-slate-800">
          <h2 className="text-xl font-semibold text-white mb-4">Documentation & Resources</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">View API Documentation</Button>
            <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">Watch Video Tutorials</Button>
            <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">Contact Support</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeoscienceHub;