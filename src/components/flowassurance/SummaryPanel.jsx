// The right rail: the verdict, in the order an engineer asks for it.
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFlowAssurance } from '@/contexts/FlowAssuranceContext';
import { Row, fmt } from './fields';

const SummaryPanel = () => {
  const { analysis, model } = useFlowAssurance();
  if (!model) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-4">
          <p className="text-sm text-slate-500">
            The well model is incomplete. Fill in the Well tab and the trace will run.
          </p>
        </CardContent>
      </Card>
    );
  }

  const h = analysis?.hydrate;
  const leg = analysis?.legs?.[0];

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="py-3">
        <Row
          label="Flowing bottomhole"
          value={`${fmt(analysis?.wellbore?.bhpPsia)} psia`}
          hint="From the wellhead, down the validated traverse"
        />
        <Row
          label="Across the choke"
          value={analysis?.choke?.ok ? `-${fmt(analysis.choke.coolingF, 1)} F` : '--'}
          hint={analysis?.choke?.ok ? `${fmt(analysis.choke.dpPsi)} psi drop` : undefined}
        />
        <Row
          label="Arrival"
          value={`${fmt(analysis?.arrival?.tempF, 1)} F`}
          hint={`${fmt(analysis?.arrival?.pPsia)} psia`}
        />
        <Row
          label="Overall U"
          value={leg ? fmt(leg.u.uBtuHrFt2F, 3) : '--'}
          hint={leg ? `NTU ${fmt(leg.ntu, 2)}` : undefined}
        />
        <Row
          label="Worst subcooling"
          value={h ? `${fmt(h.maxSubcoolingF, 1)} F` : '--'}
          accent={h?.inHydrate ? 'text-rose-400' : 'text-emerald-400'}
          hint={h?.inHydrate ? `${fmt(h.exposedLengthFt)} ft exposed` : 'Clear of the region'}
        />
        <Row
          label="Inhibitor"
          value={analysis?.inhibition?.ok && analysis.inhibition.required
            ? `${fmt(analysis.inhibition.rate.rateBpd, 1)} bbl/d`
            : (analysis?.inhibition?.required === false ? 'None needed' : '--')}
          hint={analysis?.inhibition?.ok && analysis.inhibition.required
            ? `${fmt(analysis.inhibition.weightPct, 1)} wt %`
            : undefined}
        />
        <Row
          label="No-touch time"
          value={analysis?.cooldown?.ok && Number.isFinite(analysis.cooldown.hours)
            ? `${fmt(analysis.cooldown.hours, 1)} hr`
            : '--'}
        />
      </CardContent>
    </Card>
  );
};

export default SummaryPanel;
