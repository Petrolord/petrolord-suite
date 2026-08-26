// Withheld-with-reason card (the Suite capability-gating convention: a
// diagnostic that cannot be computed honestly says exactly why, and is
// never faked). Local clone of waterflood/GatedFeatureNotice — component
// trees do not import across apps in this repo.
import React from 'react';
import { Lock } from 'lucide-react';

const GatedNotice = ({ title, reason, hint }) => (
  <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/60 p-6 text-center">
    <Lock className="w-6 h-6 mx-auto text-slate-600 mb-2" />
    <div className="text-sm font-semibold text-slate-300">{title}</div>
    <div className="text-xs text-slate-500 mt-1">{reason}</div>
    {hint && <div className="text-xs text-slate-600 mt-2">{hint}</div>}
  </div>
);

export default GatedNotice;
