// Main area for the Surveillance tab: the retired Waterflood Dashboard's
// panels (all real, jest-tested analytics) mounted on the studio shell.
// Capability gating mirrors the dashboard page it replaces: each advanced
// diagnostic states what data it needs instead of rendering silently empty.
import React from 'react';
import { useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import DataQualityPanel from '@/components/waterflood/DataQualityPanel';
import KPIPanel from '@/components/waterflood/KPIPanel';
import ChartsPanel from '@/components/waterflood/ChartsPanel';
import InsightsPanel from '@/components/waterflood/InsightsPanel';
import GatedFeatureNotice from '@/components/waterflood/GatedFeatureNotice';
import PatternResponsePanel from '@/components/waterflood/PatternResponsePanel';
import RecommendationsPanel from '@/components/waterflood/RecommendationsPanel';
import HallPlotPanel from '@/components/waterflood/HallPlotPanel';
import ChanDiagnosticsPanel from '@/components/waterflood/ChanDiagnosticsPanel';

const SurveillanceResults = () => {
  const { surveillanceResult: result, surveillanceRows } = useWaterfloodDesign();

  if (!surveillanceRows.length) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-400">
        Import a field injection/production history CSV in the left panel (or load the sample) to run surveillance:
        reservoir-barrel VRR, Hall plot injectivity, Chan water-control diagnostics, and injector-producer response.
      </div>
    );
  }

  if (result?.error) {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 px-4 py-3 text-sm">
        {result.error}
      </div>
    );
  }
  if (!result) return null;

  return (
    <div className="space-y-4 overflow-y-auto">
      <DataQualityPanel data={result.data_quality} />
      <KPIPanel kpis={result.kpis} />
      <ChartsPanel dailySeries={result.daily_series} vrrSeries={result.vrr_series} />
      <InsightsPanel alerts={result.alerts} />

      {result.capabilities?.pattern_lags?.available && result.pattern_lags?.length ? (
        <PatternResponsePanel data={result.pattern_lags} />
      ) : (
        <GatedFeatureNotice
          title="Pattern Response"
          message={result.capabilities?.pattern_lags?.reason ||
            'Injector-producer response requires injection and offset-producer rate histories in the dataset.'}
        />
      )}

      {result.capabilities?.recommendations?.available && result.recommendations?.length ? (
        <RecommendationsPanel data={result.recommendations} note={result.capabilities?.recommendations?.note} />
      ) : (
        <GatedFeatureNotice
          title="Injector Recommendations"
          message={result.capabilities?.recommendations?.reason ||
            'Suggested rates need at least one injector well in the dataset.'}
        />
      )}

      {result.capabilities?.hall?.available && result.hall_plots?.length ? (
        <HallPlotPanel data={result.hall_plots} alerts={result.alerts} />
      ) : (
        <GatedFeatureNotice
          title="Hall Plot Analysis"
          message={result.capabilities?.hall?.reason ||
            'Hall plot injectivity diagnostics require measured injection pressure (whp_psi) on injector rows.'}
        />
      )}

      {result.capabilities?.chan?.available && result.chan ? (
        <ChanDiagnosticsPanel chan={result.chan} />
      ) : (
        <GatedFeatureNotice
          title="Chan Water-Control Diagnostics"
          message={result.capabilities?.chan?.reason ||
            'Chan diagnostics need a producing history with both oil and water rates over enough time.'}
        />
      )}
    </div>
  );
};

export default SurveillanceResults;
