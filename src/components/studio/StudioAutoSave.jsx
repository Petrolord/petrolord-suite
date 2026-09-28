// Studio shell autosave widget — saving spinner / "Saved Ns ago" / save-failed
// states with a manual-save click. Props-driven (generalized from DCAAutoSave).
import React, { useState, useEffect } from 'react';
import { Save, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Design system: theme roles inside a <ThemedApp> scope, legacy classes outside.

const StudioAutoSave = ({ isSaving, saveError, lastSaveTime, onSave, disabled = false }) => {
  const [timeAgo, setTimeAgo] = useState('Just now');

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
              className="h-8 px-2 text-xs gap-2"
              onClick={onSave}
              disabled={isSaving || disabled}
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin text-pl-info-text" />
                  <span>Saving...</span>
                </>
              ) : saveError ? (
                <>
                  <AlertCircle size={14} className="text-pl-danger-text" />
                  <span className="text-pl-danger-text">Save Failed</span>
                </>
              ) : lastSaveTime ? (
                <>
                  <CheckCircle2 size={14} className="text-pl-success-text" />
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
            <div className="text-[10px] opacity-80 pt-1">Click to save manually</div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export default StudioAutoSave;
