// Right rail: the study at a glance, whatever tab is open.
import React from 'react';
import { useLineSizing } from '@/contexts/LineSizingContext';
import { fmt, Row } from './fields';

const SummaryPanel = () => {
  const { inputs, bore, sizing, sweep, wall, pigging } = useLineSizing();
  const modeLabel = { liquid: 'Liquid', gas: 'Gas', multiphase: 'Multiphase' }[inputs.mode];
  return (
    <div className="space-y-1">
      <Row label="Service" value={modeLabel} />
      <Row label="Pipe" value={bore.error ? '--' : bore.label} />
      <Row label="Length" value={`${fmt(parseFloat(inputs.pipe.lengthFt))} ft`} />
      {!sizing.error && sizing.mode === 'liquid' && (
        <>
          <Row label="Pressure drop" value={`${fmt(sizing.dpTotalPsi, 1)} psi`} />
          <Row label="Velocity" value={`${fmt(sizing.vFtS, 2)} ft/s`} />
        </>
      )}
      {!sizing.error && sizing.mode === 'gas' && (
        <>
          <Row label="Outlet pressure" value={`${fmt(sizing.p2Psia, 1)} psia`} />
          <Row label="Pressure drop" value={`${fmt(sizing.dpPsi, 1)} psi`} />
        </>
      )}
      {!sizing.error && sizing.mode === 'multiphase' && (
        <>
          <Row label="Pressure drop" value={`${fmt(sizing.dpTotalPsi, 1)} psi`} />
          <Row label="Pattern" value={sizing.pattern} />
          <Row label="Holdup" value={fmt(sizing.holdup, 3)} />
        </>
      )}
      {!sweep.error && sweep.recommended && (
        <Row label="Recommended size" value={sweep.recommended.label} hint="smallest bore passing every limit" />
      )}
      {!wall.error && (
        <Row label="Required wall" value={`${fmt(wall.tRequiredIn, 3)} in`} hint={`${inputs.wall.code}, F = ${fmt(wall.designFactor, 2)}`} />
      )}
      {!pigging.error && Number.isFinite(pigging.sweptBbl) && (
        <Row label="Swept liquid" value={`${fmt(pigging.sweptBbl, 0)} bbl`} />
      )}
    </div>
  );
};

export default SummaryPanel;
