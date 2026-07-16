import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeclineCurveProvider } from '@/contexts/DeclineCurveContext';
import DCALayout from '@/components/declineCurve/DCALayout';
import DCAProjectManager from '@/components/declineCurve/DCAProjectManager';
import DCAWellSelector from '@/components/declineCurve/DCAWellSelector';
import DCADataImporter from '@/components/declineCurve/DCADataImporter';
import DCAModelFitting from '@/components/declineCurve/DCAModelFitting';
import DCAForecastEngine from '@/components/declineCurve/DCAForecastEngine';
import DCAScenarioBuilder from '@/components/declineCurve/DCAScenarioBuilder';
import DCAFitDiagnostics from '@/components/declineCurve/DCAFitDiagnostics';
import DCAScenarioComparison from '@/components/declineCurve/DCAScenarioComparison';
import DCABasePlots from '@/components/declineCurve/DCABasePlots';
import DCAKPICardsEnhanced from '@/components/declineCurve/DCAKPICardsEnhanced';
import DCAForecastResults from '@/components/declineCurve/DCAForecastResults';
import DCAMultiStreamAnalysis from '@/components/declineCurve/DCAMultiStreamAnalysis';
import DCAGroupRollup from '@/components/declineCurve/DCAGroupRollup';
import DCATypeCurve from '@/components/declineCurve/DCATypeCurve';
import DCAWellGrouping from '@/components/declineCurve/DCAWellGrouping';
import DCAWellFilters from '@/components/declineCurve/DCAWellFilters';
import DCAIntegrationPanel from '@/components/declineCurve/DCAIntegrationPanel';
import DCAWellMetadata from '@/components/declineCurve/DCAWellMetadata';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingDown, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DeclineCurveContent = () => {
  const [activeTab, setActiveTab] = useState('analysis'); // analysis, typecurve
  const navigate = useNavigate();

  return (
    <DCALayout
      header={
        <div className="flex items-center gap-4 w-full">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/dashboard/reservoir')}
            className="text-slate-400 hover:text-white hover:bg-slate-800/50 mr-1"
            title="Back to Reservoir Management"
          >
            <ArrowLeft size={20} />
          </Button>

          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-1.5 rounded-md shadow-lg shadow-blue-900/20">
              <TrendingDown size={18} className="text-white" />
            </div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 hidden sm:block">
              Decline Curve Analysis
            </h1>
          </div>
          
          <div className="h-6 w-[1px] bg-slate-700 mx-2"></div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-8">
            <TabsList className="h-8 bg-slate-800/50 border border-slate-700 p-0.5">
              <TabsTrigger value="analysis" className="h-7 text-xs px-3 data-[state=active]:bg-slate-700">Single Well Analysis</TabsTrigger>
              <TabsTrigger value="typecurve" className="h-7 text-xs px-3 data-[state=active]:bg-slate-700">Type Curve</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      }
      sidebarLeft={
        activeTab === 'analysis' ? (
          <div className="space-y-6">
            <section>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">Project & Data</h3>
              <DCAProjectManager />
              <div className="h-2"></div>
              <DCAWellSelector />
              <div className="mt-4">
                <DCADataImporter />
              </div>
            </section>
            
            <Separator className="bg-slate-800" />
            
            <section>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">Analysis</h3>
              <DCAMultiStreamAnalysis />
              <DCAModelFitting />
            </section>

            <Separator className="bg-slate-800" />

            <section>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">Forecasting</h3>
              <DCAForecastEngine />
            </section>
          </div>
        ) : (
          <div className="space-y-6">
             <section>
              <DCAWellGrouping />
            </section>
            <Separator className="bg-slate-800" />
            <section>
              <DCAWellFilters />
            </section>
          </div>
        )
      }
      sidebarRight={
        activeTab === 'analysis' ? (
          <div className="space-y-6">
            <section>
              <DCAWellMetadata />
            </section>
            <Separator className="bg-slate-800" />
            <section>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">Scenarios</h3>
              <DCAScenarioBuilder />
            </section>

            <Separator className="bg-slate-800" />

            <section>
              <DCAScenarioComparison />
            </section>

            <Separator className="bg-slate-800" />

            <section>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">Diagnostics</h3>
              <DCAFitDiagnostics />
            </section>

            <Separator className="bg-slate-800" />

            <section>
              <DCAIntegrationPanel />
            </section>
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <DCAGroupRollup />
            </section>
          </div>
        )
      }
      main={
        activeTab === 'analysis' ? (
          <div className="h-full flex flex-col gap-4">
            <div className="flex-shrink-0">
              <DCAKPICardsEnhanced />
            </div>
            <div className="flex-1 min-h-0">
              <DCABasePlots />
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col gap-4">
            <DCATypeCurve />
          </div>
        )
      }
      bottom={
        activeTab === 'analysis' ? <DCAForecastResults /> : null
      }
    />
  );
};

const DeclineCurveAnalysisPage = () => {
  return (
    <DeclineCurveProvider>
      <DeclineCurveContent />
    </DeclineCurveProvider>
  );
};

export default DeclineCurveAnalysisPage;