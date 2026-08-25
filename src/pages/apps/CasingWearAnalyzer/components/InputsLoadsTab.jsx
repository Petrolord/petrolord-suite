import React from 'react';
import { useCasingWearAnalyzer } from '../contexts/CasingWearAnalyzerContext';
import BHATemplates from './BHATemplates';
import OperationDefinition from './OperationDefinition';
import MudContactParameters from './MudContactParameters';
import ExposureTimeUsage from './ExposureTimeUsage';
import ContactForceEstimation from './ContactForceEstimation';
import OperationSummary from './OperationSummary';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const InputsLoadsTab = () => {
  const { runCalculation, isCalculating, calculationProgress } = useCasingWearAnalyzer();

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20 relative">
      
      {/* 1. Header & Summary */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white mb-1">Operation & Load Definition</h2>
          <p className="text-sm text-slate-400">Define drilling parameters, BHA composition, and calculate contact forces.</p>
        </div>
        <OperationSummary />
      </div>

      <Separator className="bg-slate-800" />

      {/* 2. Templates */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">BHA Templates</h3>
        <BHATemplates />
      </div>

      {/* 3. Detailed Configuration */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-6">
          <OperationDefinition />
          <MudContactParameters />
        </div>
        <div className="space-y-6">
          <ExposureTimeUsage />
          <ContactForceEstimation />
        </div>
      </div>

      {/* 4. Well Data Read-only */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-slate-400">
          <span className="font-semibold text-slate-200">Well Trajectory Data:</span> Integrated from Well Design Studio. 
          Current simulation uses synthetic dogleg severity data for contact force estimation. 
          Actual survey data will be loaded in production environment.
        </div>
      </div>

      {/* 5. Run Calculation Button */}
      <div className="flex justify-center pt-8 pb-4">
        <Button 
          size="lg" 
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-base px-12 py-6 h-auto shadow-lg shadow-emerald-900/20 transform hover:-translate-y-0.5 transition-all w-full max-w-md"
          onClick={runCalculation}
          disabled={isCalculating}
        >
          {isCalculating ? (
            <>
              <Loader2 className="w-5 h-5 mr-3 animate-spin" />
              Calculating...
            </>
          ) : (
            <>
              <Play className="w-5 h-5 mr-3 fill-current" />
              RUN CALCULATION
            </>
          )}
        </Button>
      </div>

      {/* Calculation Progress Dialog */}
      <Dialog open={isCalculating} onOpenChange={() => {}}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-6 space-y-6">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse"></div>
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin relative z-10" />
            </div>
            <div className="text-center space-y-2 w-full">
              <h3 className="text-lg font-bold">Calculating Wear Profile</h3>
              <p className="text-sm text-slate-400">Analyzing contact forces and wear factors...</p>
            </div>
            <div className="w-full space-y-2">
              <Progress value={calculationProgress} className="h-2 bg-slate-800" indicatorClassName="bg-emerald-500" />
              <div className="flex justify-between text-xs text-slate-500">
                <span>Processing...</span>
                <span>{calculationProgress}%</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default InputsLoadsTab;