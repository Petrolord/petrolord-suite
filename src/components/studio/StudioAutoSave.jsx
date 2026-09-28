// Studio shell autosave widget — saving spinner / "Saved Ns ago" / save-failed
// states with a manual-save click. Props-driven (generalized from DCAAutoSave).
import React, { useState, useEffect } from 'react';
import { Save, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useStudioTheme } from './studioTheme';

// Design system: theme roles inside a <ThemedApp> scope, legacy classes outside.

const StudioAutoSave = ({ isSaving, saveError, lastSaveTime, onSave, disabled = false }) => {
  const [timeAgo, setTimeAgo] = useState('Just now');
  const { tc } = useStudioTheme();

  useEffect(() => {
    setTimeAgo('Just now');
    const interval = setInterval(() => {
      if (!lastSaveTime) return;
      const seconds = Math.floor((new Date() - lastSaveTime) / 1000);
      if (seconds < 60) setTimeAgo('Just now');
      else setTimeAgo(`${Math.floor(seconds / 60)}m ago`);
    }, 10000);
    return () => clearInterval(interval);
  }, [lastSaveTime]);

  return (
    <div className="flex items-center gap-2 px-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={tc('h-8 px-2 text-xs text-slate-400 hover:text-white gap-2', 'h-8 px-2 text-xs gap-2')}
              onClick={onSave}
              disabled={isSaving || disabled}
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} className={tc('animate-spin text-blue-400', 'animate-spin text-pl-info-text')} />
                  <span>Saving...</span>
                </>
              ) : saveError ? (
                <>
                  <AlertCircle size={14} className={tc('text-red-400', 'text-pl-danger-text')} />
                  <span className={tc('text-red-400', 'text-pl-danger-text')}>Save Failed</span>
                </>
              ) : lastSaveTime ? (
                <>
                  <CheckCircle2 size={14} className={tc('text-emerald-400', 'text-pl-success-text')} />
                  <span>Saved {timeAgo}</span>
                </>
              ) : (
                <>
                  <Save size={14} />
                  <span>Save</span>
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {saveError ? saveError : `Last saved: ${lastSaveTime ? lastSaveTime.toLocaleTimeString() : 'Never'}`}
            <div className={tc('text-[10px] text-slate-400 pt-1', 'text-[10px] opacity-80 pt-1')}>Click to save manually</div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export default StudioAutoSave;
