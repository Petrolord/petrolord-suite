// Studio shell autosave widget — saving spinner / "Saved Ns ago" / save-failed
// states with a manual-save click. Props-driven (generalized from DCAAutoSave).
import React, { useState, useEffect } from 'react';
import { Save, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDsTheme } from '@/design/themeContext';

// Theme roles inside an opted-in <ThemedApp> scope; legacy classes outside.
const THEMED = {
  button: 'h-8 px-2 text-xs text-pl-muted hover:text-pl-text gap-2',
  // the status word hides on a phone (the icon stays, the tooltip and the
  // accessible name still carry it)
  label: 'max-sm:sr-only',
  saving: 'animate-spin text-pl-info-text',
  failed: 'text-pl-danger-text',
  saved: 'text-pl-success-text',
  hint: 'text-[10px] text-pl-muted pt-1',
};

const StudioAutoSave = ({ isSaving, saveError, lastSaveTime, onSave, disabled = false }) => {
  const [timeAgo, setTimeAgo] = useState('Just now');
  const ds = useDsTheme();

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
    <div className={ds ? 'flex items-center gap-2 sm:px-2' : 'flex items-center gap-2 px-2'}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={ds ? THEMED.button : 'h-8 px-2 text-xs text-slate-400 hover:text-white gap-2'}
              onClick={onSave}
              disabled={isSaving || disabled}
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} className={ds ? THEMED.saving : 'animate-spin text-blue-400'} />
                  <span className={ds ? THEMED.label : undefined}>Saving...</span>
                </>
              ) : saveError ? (
                <>
                  <AlertCircle size={14} className={ds ? THEMED.failed : 'text-red-400'} />
                  <span className={ds ? `${THEMED.failed} ${THEMED.label}` : 'text-red-400'}>Save Failed</span>
                </>
              ) : lastSaveTime ? (
                <>
                  <CheckCircle2 size={14} className={ds ? THEMED.saved : 'text-emerald-400'} />
                  <span className={ds ? THEMED.label : undefined}>Saved {timeAgo}</span>
                </>
              ) : (
                <>
                  <Save size={14} />
                  <span className={ds ? THEMED.label : undefined}>Save</span>
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {saveError ? saveError : `Last saved: ${lastSaveTime ? lastSaveTime.toLocaleTimeString() : 'Never'}`}
            <div className={ds ? THEMED.hint : 'text-[10px] text-slate-400 pt-1'}>Click to save manually</div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export default StudioAutoSave;
