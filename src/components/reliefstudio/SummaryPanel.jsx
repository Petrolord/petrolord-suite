// Right rail: the relief study at a glance.
import React from 'react';
import { useRelief } from '@/contexts/ReliefStudioContext';
import { fmt, Row } from './fields';

const scenarioLabel = { gas: 'Gas / vapor', liquid: 'Liquid', steam: 'Steam', fire: 'Fire (API 521)' };

const SummaryPanel = () => {
  const { inputs, psv, drum, radiation, blowdownResult } = useRelief();
  return (
    <div className="space-y-1">
      <Row label="Scenario" value={scenarioLabel[inputs.scenario]} />
      {!psv.error && (
        <>
          <Row label="Required area" value={`${fmt(psv.areaIn2, 3)} in2`} />
          <Row label="Orifice" value={psv.orifice?.error ? `${psv.orifice.multipleOfT} x T` : psv.orifice?.orifice} />
        </>
      )}
      {!drum.error && (
        <Row label="KO drum" value={`${fmt(drum.requiredLengthFt, 0)} ft at L/D ${fmt(drum.ld, 1)}`} />
      )}
      {!radiation.error && Number.isFinite(radiation.requiredDistanceM) && (
        <Row label="Radiation distance" value={`${fmt(radiation.requiredDistanceM, 0)} m`} hint="for the chosen allowable" />
      )}
      {!blowdownResult.error && (
        <Row label="Blowdown" value={`${fmt(blowdownResult.timeS / 60, 1)} min`} />
      )}
    </div>
  );
};

export default SummaryPanel;
