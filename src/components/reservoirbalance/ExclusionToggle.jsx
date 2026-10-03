// Exclude a timestep from the fit, or put it back, with the reason
// (MBAL-U2-003). Used under the regression plot (the clicked point) and in
// the data table. The change is saved to the case at once; the stored run
// then reads as an earlier run until the engine runs again.
import React, { useContext, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import MaterialBalanceStudioContext from '@/contexts/MaterialBalanceStudioContext';

/**
 * @param {{step: number, compact?: boolean}} props compact: the data-table form (one line)
 */
const ExclusionToggle = ({ step, compact = false }) => {
  // outside the studio (a tab rendered on its own) there is no case to save to
  const studio = useContext(MaterialBalanceStudioContext);
  const { toast } = useToast();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!studio?.setExclusion) return null;
  const { exclusions, setExclusion, readOnlyReason } = studio;
  if (step === 0) {
    return <span className="text-[10px] text-pl-muted" data-testid={`mbal-exclusion-${step}`}>Initial state</span>;
  }
  const excluded = exclusions?.excluded?.includes(step);
  const why = exclusions?.reasons?.[String(step)];
  const disabled = Boolean(readOnlyReason) || busy;

  const save = async (change) => {
    setBusy(true);
    const { error } = await setExclusion(step, change);
    setBusy(false);
    if (error) {
      toast({ title: change.exclude ? 'Point not excluded' : 'Point not restored', description: error.message, variant: 'destructive' });
      return;
    }
    setAsking(false);
    setReason('');
    toast({
      title: change.exclude ? `Timestep ${step} excluded from the fit` : `Timestep ${step} back in the fit`,
      description: 'Run the engine again: the result on screen is from the earlier run until then.',
    });
  };

  if (excluded) {
    return (
      <span className={`flex ${compact ? 'items-center' : 'flex-wrap items-center'} gap-2`} data-testid={`mbal-exclusion-${step}`}>
        <span className="text-[10px] text-pl-warning-text" data-testid={`mbal-exclusion-reason-${step}`}>
          Excluded{why ? `: ${why}` : ''}
        </span>
        <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={disabled}
          onClick={() => save({ exclude: false })} data-testid={`mbal-exclusion-restore-${step}`}
          title={readOnlyReason || 'Put this timestep back in the fit'}>
          Restore
        </Button>
      </span>
    );
  }
  if (!asking) {
    return (
      <span data-testid={`mbal-exclusion-${step}`}>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={disabled}
          onClick={() => setAsking(true)} data-testid={`mbal-exclusion-exclude-${step}`}
          title={readOnlyReason || 'Leave this timestep out of the fit, with a reason'}>
          {compact ? 'Exclude' : 'Exclude from the fit'}
        </Button>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2" data-testid={`mbal-exclusion-${step}`}>
      <Input
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && reason.trim()) save({ exclude: true, reason }); if (e.key === 'Escape') setAsking(false); }}
        placeholder="Reason, e.g. survey not built up"
        aria-label={`Reason for excluding timestep ${step}`}
        className="h-6 text-[11px] w-56"
        data-testid={`mbal-exclusion-input-${step}`}
      />
      <Button size="sm" className="h-6 px-2 text-[10px]" disabled={disabled || !reason.trim()}
        onClick={() => save({ exclude: true, reason })} data-testid={`mbal-exclusion-confirm-${step}`}>
        Exclude
      </Button>
      <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => { setAsking(false); setReason(''); }}>
        Cancel
      </Button>
    </span>
  );
};

export default ExclusionToggle;
