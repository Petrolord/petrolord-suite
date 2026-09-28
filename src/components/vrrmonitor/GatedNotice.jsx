// Withheld-with-reason card (the Suite capability-gating convention: a
// diagnostic that cannot be computed honestly says exactly why, and is
// never faked). Local clone of waterflood/GatedFeatureNotice — component
// trees do not import across apps in this repo.
import React from 'react';
import { Lock } from 'lucide-react';
import { useStudioTheme } from '@/components/studio/studioTheme';

const GatedNotice = ({ title, reason, hint }) => {
  const { tc } = useStudioTheme();
  return (
    <div className={tc('rounded-lg border border-dashed border-slate-700 bg-slate-900/60 p-6 text-center', 'rounded-lg border border-dashed border-pl-border-strong bg-pl-surface p-6 text-center')}>
      <Lock className={tc('w-6 h-6 mx-auto text-slate-600 mb-2', 'w-6 h-6 mx-auto text-pl-muted mb-2')} aria-hidden={tc(undefined, 'true')} />
      <div className={tc('text-sm font-semibold text-slate-300', 'text-sm font-semibold text-pl-text')}>{title}</div>
      <div className={tc('text-xs text-slate-500 mt-1', 'text-xs text-pl-muted mt-1')}>{reason}</div>
      {hint && <div className={tc('text-xs text-slate-600 mt-2', 'text-xs text-pl-muted mt-2')}>{hint}</div>}
    </div>
  );
};

export default GatedNotice;
