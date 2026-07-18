// Right-rail diagnostics: tab-aware readouts above the scenario manager.
import React from 'react';
import { Separator } from '@/components/ui/separator';
import { useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import ScenarioRail from './ScenarioRail';
import { SectionLabel, fmt } from './primitives';

const Row = ({ label, value }) => (
  <div className="flex justify-between text-xs py-1 border-b border-slate-800/60 last:border-0">
    <span className="text-slate-500">{label}</span>
    <span className="text-slate-200 font-medium">{value}</span>
  </div>
);

const DiagnosticsRail = ({ activeTab }) => {
  const { displacement, layeredResult, patternResult, uncertaintyResult, uncertaintyStale, surveillanceResult } = useWaterfloodDesign();
  const bl = displacement?.bl;
  const mc = uncertaintyResult;

  return (
    <div className="space-y-6">
      {activeTab === 'displacement' && (
        <section>
          <SectionLabel>Front diagnostics</SectionLabel>
          <Row label="Shock front Swf" value={fmt.f3(bl?.Swf)} />
          <Row label="fw at front" value={fmt.f3(bl?.fwf)} />
          <Row label="fw′ at front" value={fmt.f2(bl?.fwPrimeF)} />
          <Row label="Avg Sw behind front @ BT" value={fmt.f3(bl?.SwAvgBt)} />
          <Row label="PV injected @ BT" value={fmt.f2(bl?.QiBt)} />
          <Row label="Effective μw (cp)" value={fmt.f2(displacement?.muWeff)} />
        </section>
      )}

      {activeTab === 'layered' && (
        <section>
          <SectionLabel>Heterogeneity</SectionLabel>
          <Row label="Dykstra-Parsons V" value={fmt.f3(layeredResult?.V?.V)} />
          <Row label="ln(k) sigma" value={fmt.f3(layeredResult?.V?.sigma)} />
          <Row label="Median k (md)" value={fmt.f1(layeredResult?.V?.k50)} />
          <Row label="Layers" value={layeredResult?.layers?.length ?? '—'} />
          <Row label="M in use" value={fmt.f2(layeredResult?.M)} />
        </section>
      )}

      {activeTab === 'pattern' && (
        <section>
          <SectionLabel>Pattern summary</SectionLabel>
          <Row label="Mobility ratio M" value={fmt.f2(patternResult?.summary?.M)} />
          <Row label="EA @ BT" value={fmt.pct(patternResult?.summary?.EAbt)} />
          <Row label="Wi @ BT (Mbbl)" value={fmt.f1(patternResult?.summary?.WiBT_bbl / 1000)} />
          <Row label="Flooded OOIP (Mstb)" value={fmt.f1(patternResult?.summary?.ooip_flooded_stb / 1000)} />
          <Row label="Elapsed (yr)" value={fmt.f1(patternResult?.summary?.elapsed_days / 365.25)} />
        </section>
      )}

      {activeTab === 'uncertainty' && (
        <section>
          <SectionLabel>Last MC run</SectionLabel>
          <Row label="Status" value={mc ? (uncertaintyStale ? 'Stale' : 'Current') : 'Not run'} />
          <Row label="Valid realizations" value={mc ? mc.validCount.toLocaleString() : '—'} />
          <Row label="Rejected" value={mc ? mc.rejectedCount.toLocaleString() : '—'} />
          <Row label="Np P50 (Mstb)" value={fmt.f1(mc?.stats?.np?.p50 / 1000)} />
          <Row label="Np spread P10/P90" value={mc?.stats?.np?.p90 > 0 ? fmt.f2(mc.stats.np.p10 / mc.stats.np.p90) : '—'} />
        </section>
      )}

      {activeTab === 'surveillance' && !surveillanceResult?.error && (
        <section>
          <SectionLabel>Field summary</SectionLabel>
          <Row label="Cumulative VRR" value={fmt.f2(surveillanceResult?.kpis?.vrr_avg)} />
          <Row label="Rolling VRR" value={fmt.f2(surveillanceResult?.kpis?.vrr_rolling)} />
          <Row label="Avg water cut" value={surveillanceResult?.kpis ? `${fmt.f1(surveillanceResult.kpis.avg_water_cut_pct)}%` : '—'} />
          <Row label="Injectors / producers" value={surveillanceResult?.wells ? `${surveillanceResult.wells.injectors?.length ?? 0} / ${surveillanceResult.wells.producers?.length ?? 0}` : '—'} />
          <Row label="Alerts" value={surveillanceResult ? (surveillanceResult.alerts?.length ?? 0) : '—'} />
        </section>
      )}

      {activeTab !== 'scenarios' && <Separator className="bg-slate-800" />}
      <ScenarioRail />
    </div>
  );
};

export default DiagnosticsRail;
