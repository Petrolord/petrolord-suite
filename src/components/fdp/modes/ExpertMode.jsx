import React from 'react';
import { useFDP } from '@/contexts/FDPContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
    TrendingUp, 
    Target, 
    Calendar,
    AlertTriangle
} from 'lucide-react';
import { formatCurrency } from '@/utils/fdp/formatting';
import HSEModule from '@/components/fdp/modules/HSEModule';
import CommunityRelationsModule from '@/components/fdp/modules/CommunityRelationsModule';
import WellsModule from '@/components/fdp/modules/WellsModule';
import FacilitiesModule from '@/components/fdp/modules/FacilitiesModule';
import ScheduleModule from '@/components/fdp/modules/ScheduleModule'; 
import CostModule from '@/components/fdp/modules/CostModule'; 
import RiskManagementModule from '@/components/fdp/modules/RiskManagementModule'; 
import FDPGenerationModule from '@/components/fdp/modules/FDPGenerationModule';
import ConceptModule from '@/components/fdp/modules/ConceptModule'; 
import SubsurfaceModule from '@/components/fdp/modules/SubsurfaceModule';
import FieldOverviewModule from '@/components/fdp/modules/FieldOverviewModule';
import ScenarioModule from '@/components/fdp/modules/ScenarioModule';

// --- Module Placeholders (Simulating other expert modules) ---
const OverviewModule = () => {
    const { state, actions } = useFDP();
    return (
        <div className="space-y-6 fade-in animate-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-pl-muted font-medium uppercase">Est. NPV</p>
                            {/* EC6-0: nothing wrote state.economics, so this tile read $0 in
                                green on every plan. It now shows the plan's own screening NPV,
                                and says so plainly when the plan cannot be costed yet. */}
                            <h3 className={`text-2xl font-bold mt-1 ${state.economics.available === false ? 'text-pl-muted text-base' : (state.economics.npv >= 0 ? 'text-pl-success-text' : 'text-pl-danger-text')}`}>
                                {state.economics.available === false
                                    ? 'Not costed yet'
                                    : formatCurrency(state.economics.npv, 'USD', true)}
                            </h3>
                        </div>
                        <div className="p-2 bg-pl-sunken rounded-lg">
                            <TrendingUp className="w-5 h-5 text-pl-muted" />
                        </div>
                    </div>
                </Card>
                <Card className="p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-pl-muted font-medium uppercase">Total CAPEX</p>
                            <h3 className="text-2xl font-bold text-pl-text mt-1">{formatCurrency(state.economics.capex, 'USD', true)}</h3>
                        </div>
                        <div className="p-2 bg-pl-sunken rounded-lg">
                            <Target className="w-5 h-5 text-pl-muted" />
                        </div>
                    </div>
                </Card>
                <Card className="p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-pl-muted font-medium uppercase">First Oil</p>
                            <h3 className="text-2xl font-bold text-pl-text mt-1">Q4 2026</h3>
                        </div>
                        <div className="p-2 bg-pl-sunken rounded-lg">
                            <Calendar className="w-5 h-5 text-pl-muted" />
                        </div>
                    </div>
                </Card>
                 <Card className="p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-pl-muted font-medium uppercase">HSE Risks</p>
                            <h3 className="text-2xl font-bold text-pl-text mt-1">{state.hseData.hazards.length}</h3>
                        </div>
                        <div className="p-2 bg-pl-sunken rounded-lg">
                            <AlertTriangle className="w-5 h-5 text-pl-muted" />
                        </div>
                    </div>
                </Card>
            </div>
            
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="col-span-2 p-6">
                    <h3 className="text-lg font-semibold text-pl-text mb-4">Field Development Concept</h3>
                    <div className="bg-pl-sunken rounded-lg border border-pl-border p-8 flex items-center justify-center h-64 text-pl-muted">
                        Expert Mode Dashboard Visualization
                    </div>
                </Card>

                <Card className="col-span-1 p-6">
                    <h3 className="text-lg font-semibold text-pl-text mb-4">Quick Edit</h3>
                     <div className="space-y-4">
                        <div>
                            <label className="text-xs text-pl-muted mb-1 block">Project Name</label>
                            <Input 
                                value={state.meta.name} 
                                onChange={(e) => actions.setProjectName(e.target.value)} 
                            />
                        </div>
                         <Button className="w-full mt-4">
                            Run Simulation
                        </Button>
                    </div>
                </Card>
             </div>
        </div>
    );
};

const ExpertMode = () => {
    const { state } = useFDP();
    
    // Route content based on active tab
    switch (state.navigation.activeTab) {
        case 'overview': return <FieldOverviewModule />; 
        case 'concepts': return <ConceptModule />; 
        case 'subsurface': return <SubsurfaceModule />; 
        case 'wells': return <WellsModule />;
        case 'facilities': return <FacilitiesModule />; 
        case 'schedule': return <ScheduleModule />; 
        case 'economics': return <CostModule />; 
        case 'hse': return <HSEModule />;
        case 'community': return <CommunityRelationsModule />;
        case 'risks': return <RiskManagementModule />;
        case 'documents': return <FDPGenerationModule />;
        case 'scenarios': return <ScenarioModule />; 
        default: return <OverviewModule />;
    }
};

export default ExpertMode;