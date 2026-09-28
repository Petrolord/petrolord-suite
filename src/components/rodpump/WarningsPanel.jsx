// Design checks. Each is a real fault the sizing detected, phrased as
// the thing to change.
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRodPump } from '@/contexts/RodPumpDesignContext';

const RodWarningsPanel = () => {
  const { design } = useRodPump();
  const warnings = design?.warnings || [];
  if (!warnings.length) return null;

  return (
    <Card className="bg-pl-warning-bg border-pl-warning/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-pl-warning-text">
          <AlertTriangle className="w-4 h-4" /> Design checks
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {warnings.map((w, i) => (
            <li key={`${w.code}-${i}`} className="text-sm text-pl-warning-text flex gap-2">
              <span className="text-[10px] uppercase tracking-wider text-pl-warning-text mt-1 whitespace-nowrap">
                {w.code}
              </span>
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

export default RodWarningsPanel;
