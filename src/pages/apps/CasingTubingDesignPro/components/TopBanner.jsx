import React from 'react';
import { ChevronRight, Home, HelpCircle, BookOpen } from 'lucide-react';
import { useCasingTubingDesign } from '../contexts/CasingTubingDesignContext';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { fmtSF } from '../services/ctRun';

const statusColor = {
  PASS: 'text-pl-success-text bg-pl-success-bg border-pl-success/40',
  WARNING: 'text-pl-warning-text bg-pl-warning-bg border-pl-warning/40',
  FAIL: 'text-pl-danger-text bg-pl-danger-bg border-pl-danger/40',
};

const TopBanner = () => {
  const {
    selectedSite, selectedWellbore, selectedCase, results, toggleHelp,
  } = useCasingTubingDesign();
  const overall = results?.kpis?.overall;
  // CT-T1-002: a FAIL beside a passing governing burst SF needs its reason
  // (the failing checks lived only in the Warnings panel at the bottom)
  const failing = overall === 'FAIL' ? (results?.warnings || []).filter((w) => w.severity === 'high') : [];
  const failWhere = [...new Set(failing.map((w) => w.message.split(':')[0]))];

  return (
    <div className="bg-pl-surface border-b border-pl-border px-4 sm:px-6 py-3 shrink-0 shadow-pl-sm z-20">
      <div className="flex flex-col space-y-2">
        <nav className="flex items-center text-xs text-pl-muted justify-between">
          <div className="flex items-center">
            <Link to="/dashboard" className="hover:text-pl-text transition-colors flex items-center">
              <Home className="w-3 h-3 mr-1" /> Dashboard
            </Link>
            <ChevronRight className="w-3 h-3 mx-1 opacity-50" />
            <Link to="/dashboard/drilling" className="hover:text-pl-text transition-colors">
              Drilling & Completions
            </Link>
            <ChevronRight className="w-3 h-3 mx-1 opacity-50" />
            <span className="text-pl-text font-medium">Casing & Tubing Design Studio</span>
          </div>

          <div className="flex items-center space-x-1">
            <Link to="/dashboard/apps/drilling/casing-tubing-design-pro/help">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-pl-muted hover:text-pl-text text-[10px]"
                title="User guide"
              >
                <BookOpen className="w-3.5 h-3.5 mr-1" /> Guide
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-pl-muted hover:text-pl-text"
              onClick={toggleHelp}
              title="Help & Shortcuts (Ctrl+H)"
            >
              <HelpCircle className="w-4 h-4" />
            </Button>
            <ThemeToggle className="h-7 w-7" />
          </div>
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-8">
            <div>
              <span className="text-[10px] uppercase text-pl-muted font-bold tracking-wider">Site</span>
              <div className="text-pl-text font-medium text-sm">
                {selectedSite?.name || <span className="text-pl-muted italic">Select a site</span>}
              </div>
            </div>
            <div className="hidden sm:block h-8 w-px bg-pl-border"></div>
            <div>
              <span className="text-[10px] uppercase text-pl-muted font-bold tracking-wider">Wellbore</span>
              <div className="text-pl-text font-bold text-lg leading-tight">
                {selectedWellbore ? selectedWellbore.name : <span className="text-pl-muted italic text-sm font-medium">Select a wellbore</span>}
              </div>
            </div>
            <div className="hidden sm:block h-8 w-px bg-pl-border"></div>
            <div>
              <span className="text-[10px] uppercase text-pl-muted font-bold tracking-wider">Design Case</span>
              <div className="flex items-center space-x-2">
                <span className="text-pl-text font-semibold text-sm">
                  {selectedCase ? selectedCase.name : <span className="text-pl-muted italic">No active case</span>}
                </span>
                {selectedCase && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-pl-primary/10 text-pl-primary-text border border-pl-primary/40 font-pl-mono tabular-nums">
                    ACTIVE
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {overall && (
              <div className="text-right">
                <span className="text-[10px] text-pl-muted block">Design Status</span>
                <span
                  data-testid="ct-overall-status"
                  className={`inline-block px-2 py-0.5 rounded border text-xs font-bold font-pl-mono tabular-nums ${statusColor[overall] || ''}`}
                >
                  {overall}
                </span>
                {failWhere.length > 0 && (
                  <span className="block max-w-[260px] truncate text-[10px] text-pl-danger-text" data-testid="ct-fail-reason"
                    title={failing.map((w) => w.message).join('\n')}>
                    {failWhere.join(', ')} ({failing.length} check{failing.length === 1 ? '' : 's'}; see Warnings)
                  </span>
                )}
              </div>
            )}
            {results?.kpis?.minBurst && (
              <div className="text-right">
                <span className="text-[10px] text-pl-muted block">Governing Burst SF</span>
                <span className="text-xs text-pl-text font-pl-mono tabular-nums">{fmtSF(results.kpis.minBurst.value)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopBanner;
