// Everything the analysis wants to say out loud, and nothing it has
// quietly swallowed.
import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useFlowAssurance } from '@/contexts/FlowAssuranceContext';

const WarningsPanel = () => {
  const { analysis } = useFlowAssurance();
  const errors = analysis?.errors || [];
  const notes = analysis?.notes || [];
  if (!errors.length && !notes.length) return null;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="py-3 space-y-2">
        {errors.map((e) => (
          <p key={e} className="text-[12px] text-rose-400 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{e}</span>
          </p>
        ))}
        {notes.map((n) => (
          <p key={n} className="text-[12px] text-amber-300 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{n}</span>
          </p>
        ))}
      </CardContent>
    </Card>
  );
};

export default WarningsPanel;
