// LPG: blend, storage, vaporizer, bottling and the cylinder float (DS7).
import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell as BarCell } from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useLpgCng } from '@/contexts/LpgCngContext';

const fmt = (v, dp = 2) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'not supplied');

const Stat = ({ label, value, hint }) => (
  <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
    <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    <p className="text-lg font-semibold text-white">{value}</p>
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const STAGE_COLORS = ['#dc2626', '#0891b2', '#f59e0b', '#7c3aed', '#059669'];

const LpgResults = () => {
  const { blend, storage, vaporizer, bottling, cylinderFleet } = useLpgCng();
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">The blend</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          Every property declares the basis it mixes on. Liquid density mixes on volume, latent
          heat per kilogram mixes on mass and molar mass mixes on moles. Using the wrong one is a
          quiet error of several percent that looks entirely plausible.
        </p>
        {blend.error ? <p className="text-sm text-amber-300">{blend.error}</p> : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Liquid density" value={`${fmt(blend.densityKgM3, 1)} kg/m3`} hint={`${blend.densityBasis} basis`} />
            <Stat label="Latent heat" value={blend.latentHeatKJkg === null ? 'not available' : `${fmt(blend.latentHeatKJkg, 1)} kJ/kg`} hint={`${blend.latentHeatBasis} basis`} />
            <Stat label="Molar mass" value={blend.molarMassKgKmol === null ? 'not available' : `${fmt(blend.molarMassKgKmol, 2)} kg/kmol`} hint={`${blend.molarMassBasis} basis`} />
          </div>
        )}
        {blend.note && <p className="text-[11px] text-amber-300 mt-2">{blend.note}</p>}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Storage</h3>
        {storage.error ? (
          <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-100">{storage.error}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Usable" value={`${fmt(storage.usableTonnes, 1)} t`} hint={`${fmt(storage.usableM3, 1)} m3 at the fill limit`} />
              <Stat label="Vapour space" value={`${fmt(storage.vapourSpaceM3, 1)} m3`} hint="not spare capacity" />
              <Stat label="Cover" value={`${fmt(storage.coverDays, 1)} days`} />
              <Stat label="Reorder at" value={`${fmt(storage.reorderAtTonnes, 1)} t`} hint={`${fmt(storage.safetyStockTonnes, 1)} t of it is safety stock`} />
            </div>
            {storage.deliveryWarning && (
              <div className="mt-3 rounded border border-amber-800/60 bg-amber-950/30 p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-100">{storage.deliveryWarning}</p>
              </div>
            )}
            {storage.deliveryFitsUllage === true && (
              <p className="text-[11px] text-slate-500 mt-2">
                {`The delivery fits the ${fmt(storage.ullageAtReorderTonnes, 1)} tonnes of room at the reorder point. About ${fmt(storage.deliveriesPerMonth, 1)} deliveries a month.`}
              </p>
            )}
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Vaporizer duty</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          Three terms, kept apart because they answer different questions. Skipping the superheat
          is how a vaporizer that is correctly sized on paper drops liquid into a burner.
        </p>
        {vaporizer.error ? <p className="text-sm text-amber-300">{vaporizer.error}</p> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {vaporizer.terms.map((t) => (
                <Stat key={t.label} label={t.label}
                  value={t.kW === null ? 'input required' : `${fmt(t.kW, 1)} kW`}
                  hint={t.share === null ? null : `${fmt(t.share * 100, 0)}% of duty`} />
              ))}
              <Stat label="Design duty" value={`${fmt(vaporizer.designDutyKW, 1)} kW`} hint={`${fmt(vaporizer.dutyKW, 1)} kW plus margin`} />
            </div>
            {vaporizer.note && <p className="text-[11px] text-amber-300 mt-2">{vaporizer.note}</p>}
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Bottling plant</h3>
        {bottling.error ? <p className="text-sm text-amber-300">{bottling.error}</p> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Minimum positions" value={bottling.minimumPositionsForThroughput} hint="for the throughput alone" />
              <Stat label="Working positions" value={fmt(bottling.effectivePositions, 1)} hint={`queue computed on ${bottling.queuePositions}`} />
              <Stat label="Utilisation" value={`${fmt(bottling.queue.utilisation * 100, 1)}%`} />
              <Stat label="Average wait"
                value={bottling.queue.stable ? `${fmt(bottling.queue.averageWaitMinutes, 1)} min` : 'unbounded'}
                hint={bottling.queue.stable ? null : 'arrivals exceed capacity'} />
            </div>
            <p className="text-[11px] text-slate-500 mt-2">{bottling.note}</p>
            {bottling.positionRoundingNote && (
              <p className="text-[11px] text-slate-500 mt-1">{bottling.positionRoundingNote}</p>
            )}
            <p className={`text-[11px] mt-1 flex items-center gap-1.5 ${bottling.meetsDemand ? 'text-emerald-300' : 'text-amber-300'}`}>
              {bottling.meetsDemand
                ? <CheckCircle2 className="w-3.5 h-3.5" />
                : <AlertTriangle className="w-3.5 h-3.5" />}
              {bottling.meetsDemand
                ? `Capacity ${fmt(bottling.throughputCapacityPerDay, 0)} cylinders a day covers the demand.`
                : `Capacity ${fmt(bottling.throughputCapacityPerDay, 0)} cylinders a day does not cover the demand.`}
            </p>
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">The cylinder float</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          {cylinderFleet.error ? '' : cylinderFleet.basis}
          {' '}
          Operators usually guess this number and usually guess it low, because the cylinders at a
          customer&apos;s house are invisible and are most of the fleet.
        </p>
        {cylinderFleet.error ? <p className="text-sm text-amber-300">{cylinderFleet.error}</p> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Cycle" value={`${fmt(cylinderFleet.cycleDays, 1)} days`} hint={`${cylinderFleet.dominantStage} dominates`} />
              <Stat label="In circulation" value={fmt(cylinderFleet.inCirculation, 0)} />
              <Stat label="Spares" value={fmt(cylinderFleet.sparesAllowance, 0)} />
              <Stat label="Fleet required" value={cylinderFleet.fleetRequired.toLocaleString()} />
            </div>
            <ChartFrame height={220} exportFilename="cylinder-cycle">
              <BarChart data={cylinderFleet.stages} margin={{ top: 12, right: 24, left: 16, bottom: 28 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="label" stroke={CHART_COLORS.axisLine} tick={tick} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis stroke={CHART_COLORS.axisLine} tick={tick}
                  label={{ value: 'days', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => `${fmt(v, 1)} days`} />
                <Bar dataKey="days" name="Days">
                  {cylinderFleet.stages.map((s, i) => (
                    <BarCell key={s.label} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartFrame>
          </>
        )}
      </div>
    </div>
  );
};

export default LpgResults;
