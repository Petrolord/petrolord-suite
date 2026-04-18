import React from 'react';
import { ArrowRight, Layers, Filter, Droplets, Wind, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ICON_MAP = {
  'API Separator': Layers,
  'CPI Separator': Layers,
  'De-oiling Hydrocyclone': Zap,
  'Induced Gas Flotation': Wind,
  'Dissolved Air Flotation': Wind,
  'Nutshell Filter': Filter,
  'Multi-Media Filter': Droplets
};

const COLOR_MAP = {
  primary: 'text-primary border-primary bg-primary/20',
  secondary: 'text-secondary border-secondary bg-secondary/20',
  tertiary: 'text-accent border-accent bg-accent/20'
};

const CheckCircleIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

export const PwtVisualizer = ({ stageResults }) => {
  return (
    <Card className="bg-card border-border shadow-lg overflow-hidden">
      <CardHeader className="bg-muted/50 border-b border-border pb-4">
        <CardTitle className="text-xl font-bold text-foreground">Treatment Train Visualization</CardTitle>
      </CardHeader>
      <CardContent className="p-6 overflow-x-auto custom-scrollbar">
        <div className="flex items-center min-w-max py-4 space-x-4">
          
          {/* Inlet */}
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-blue-500/20 border-2 border-blue-400 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.3)]">
              <Droplets className="w-8 h-8 text-blue-400" />
            </div>
            <span className="mt-3 text-sm font-semibold text-slate-300">Raw Water</span>
          </div>

          {stageResults.map((stage, idx) => {
            const Icon = ICON_MAP[stage.name] || Layers;
            const colors = COLOR_MAP[stage.stage] || 'text-muted-foreground border-border bg-muted/10';

            return (
              <React.Fragment key={idx}>
                <ArrowRight className="w-6 h-6 text-slate-500 animate-pulse" />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: idx * 0.15 }}
                  className="flex flex-col items-center"
                >
                  <div className={`w-32 h-32 rounded-xl border-2 flex flex-col items-center justify-center p-3 shadow-lg relative ${colors}`}>
                    <Icon className="w-10 h-10 mb-2 opacity-90" />
                    <span className="text-xs text-center font-bold leading-tight tracking-wide">{stage.name}</span>
                    <div className="absolute -bottom-3 bg-slate-800 border border-slate-600 text-slate-200 text-[11px] font-medium px-3 py-1 rounded-full whitespace-nowrap shadow-md">
                      OIW: {stage.outOiw.toFixed(1)}
                    </div>
                  </div>
                </motion.div>
              </React.Fragment>
            );
          })}

          <ArrowRight className="w-6 h-6 text-slate-500 animate-pulse" />
          
          {/* Outlet */}
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              <CheckCircleIcon className="w-8 h-8 text-emerald-400" />
            </div>
            <span className="mt-3 text-sm font-semibold text-emerald-400">Treated</span>
          </div>

        </div>
      </CardContent>
    </Card>
  );
};

export default PwtVisualizer;