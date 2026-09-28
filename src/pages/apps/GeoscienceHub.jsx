import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layers, Box, TrendingUp, ArrowRight, Database, Cuboid, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppHeader, PageContainer } from '@/components/ui/app-shell';

const AppCard = ({ title, description, icon: Icon, path, status = "Available" }) => {
  const navigate = useNavigate();
  return (
    <Card className="hover:border-pl-primary transition-all cursor-pointer group" onClick={() => navigate(path)}>
      <CardHeader>
        <div className="flex items-center justify-between mb-2">
          <div className="p-2 bg-pl-sunken rounded-lg">
            <Icon className="h-6 w-6 text-pl-primary-text" />
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${status === 'Available' ? 'bg-pl-success-bg text-pl-success-text' : 'bg-pl-warning-bg text-pl-warning-text'}`}>
            {status}
          </span>
        </div>
        <CardTitle className="group-hover:text-pl-primary-text transition-colors">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="ghost" className="w-full justify-between group-hover:bg-pl-sunken">
          Launch App <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
};

const GeoscienceHubContent = () => {
  return (
    <>
      <AppHeader
        title="Geoscience Analytics Hub"
        subtitle="Advanced tools for subsurface modeling, petrophysics, and reservoir characterization."
        backTo="/dashboard/geoscience"
        backLabel="Geoscience"
      />
      <PageContainer className="py-8 space-y-8">

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AppCard
            title="Earth Modeling"
            description="Layer-cake earth modeling: structural frameworks from mapped surfaces, fault-block property population, and zone volumes."
            icon={Cuboid}
            path="/dashboard/apps/geoscience/earth-modeling"
          />
          <AppCard 
            title="Well Correlation Tool"
            description="Interactively correlate well logs, create cross-sections, and visualize subsurface data."
            icon={Activity}
            path="/dashboard/apps/geoscience/well-correlation-tool"
          />
          <AppCard 
            title="Petrophysics Studio"
            description="Well log interpretation, crossplots and rule-based facies from log cutoffs."
            icon={Layers}
            path="/dashboard/apps/geoscience/petrophysics-studio"
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
        </div>

        <div className="mt-12 p-6 bg-pl-surface rounded-xl border border-pl-border">
          <h2 className="text-xl font-semibold text-pl-text mb-4">Documentation & Resources</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline">View API Documentation</Button>
            <Button variant="outline">Watch Video Tutorials</Button>
            <Button variant="outline">Contact Support</Button>
          </div>
        </div>
      </PageContainer>
    </>
  );
};

// Design system rollout batch 4D: the legacy hub opens light and follows the
// user's theme from the header toggle.
const GeoscienceHub = () => (
  <div className="min-h-screen" data-testid="geo-hub-theme-scope">
    <GeoscienceHubContent />
  </div>
);

export default GeoscienceHub;