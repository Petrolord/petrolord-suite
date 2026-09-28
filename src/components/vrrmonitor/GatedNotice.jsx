// Withheld-with-reason card (the Suite capability-gating convention: a
// diagnostic that cannot be computed honestly says exactly why, and is
// never faked). Local clone of waterflood/GatedFeatureNotice — component
// trees do not import across apps in this repo.
import React from 'react';
import { Lock } from 'lucide-react';

const GatedNotice = ({ title, reason, hint }) => {
  return (
    <div className="rounded-lg border border-dashed border-pl-border-strong bg-pl-surface p-6 text-center">
      <Lock className="w-6 h-6 mx-auto text-pl-muted mb-2" aria-hidden="true" />
      <div className="text-sm font-semibold text-pl-text">{title}</div>
      <div className="text-xs text-pl-muted mt-1">{reason}</div>
      {hint && <div className="text-xs text-pl-muted mt-2">{hint}</div>}
    </div>
  );
};

export default GatedNotice;
