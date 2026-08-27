import React from 'react';
import { ChevronRight, Home, HelpCircle, BookOpen } from 'lucide-react';
import { useCasingTubingDesign } from '../contexts/CasingTubingDesignContext';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { fmtSF } from '../services/ctRun';

const statusColor = {
  PASS: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  WARNING: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  FAIL: 'text-red-400 bg-red-500/10 border-red-500/20',
};

const TopBanner = () => {
  const {
    selectedSite, selectedWellbore, selectedCase, results, toggleHelp,
  } = useCasingTubingDesign();
  const overall = results?.kpis?.overall;

  return (
    <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 shrink-0 shadow-sm z-20">
      <div className="flex flex-col space-y-2">
        <nav className="flex items-center text-xs text-slate-500 justify-between">
          <div className="flex items-center">
            <Link to="/dashboard" className="hover:text-slate-300 transition-colors flex items-center">
              <Home className="w-3 h-3 mr-1" /> Dashboard
            </Link>
            <ChevronRight className="w-3 h-3 mx-1 opacity-50" />
            <Link to="/dashboard/drilling" className="hover:text-slate-300 transition-colors">
              Drilling & Completions
            </Link>
            <ChevronRight className="w-3 h-3 mx-1 opacity-50" />
            <span className="text-lime-400 font-medium">Casing & Tubing Design Studio</span>
          </div>

          <div className="flex items-center space-x-1">
            <Link to="/dashboard/apps/drilling/casing-tubing-design-pro/help">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-slate-400 hover:text-white text-[10px]"
                title="User guide"
              >
                <BookOpen className="w-3.5 h-3.5 mr-1" /> Guide
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-slate-400 hover:text-white"
              onClick={toggleHelp}
              title="Help & Shortcuts (Ctrl+H)"
            >
              <HelpCircle className="w-4 h-4" />
            </Button>
          </div>
        </nav>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <div>
              <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Site</span>
              <div className="text-slate-300 font-medium text-sm">
                {selectedSite?.name || <span className="text-slate-600 italic">Select a site</span>}
              </div>
            </div>
            <div className="h-8 w-px bg-slate-800"></div>
            <div>
              <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Wellbore</span>
              <div className="text-white font-bold text-lg leading-tight">
                {selectedWellbore ? selectedWellbore.name : <span className="text-slate-600 italic text-sm font-medium">Select a wellbore</span>}
              </div>
            </div>
            <div className="h-8 w-px bg-slate-800"></div>
            <div>
              <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Design Case</span>
              <div className="flex items-center space-x-2">
                <span className="text-white font-semibold text-sm">
                  {selectedCase ? selectedCase.name : <span className="text-slate-600 italic">No active case</span>}
                </span>
                {selectedCase && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-lime-500/10 text-lime-400 border border-lime-500/20 font-mono">
                    ACTIVE
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {overall && (
              <div className="text-right">
                <span className="text-[10px] text-slate-500 block">Design Status</span>
                <span
                  data-testid="ct-overall-status"
                  className={`inline-block px-2 py-0.5 rounded border text-xs font-bold font-mono ${statusColor[overall] || ''}`}
                >
                  {overall}
                </span>
              </div>
            )}
            {results?.kpis?.minBurst && (
              <div className="text-right">
                <span className="text-[10px] text-slate-500 block">Governing Burst SF</span>
                <span className="text-xs text-slate-200 font-mono">{fmtSF(results.kpis.minBurst.value)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopBanner;
