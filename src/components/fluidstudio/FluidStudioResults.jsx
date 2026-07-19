import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Droplets, Thermometer, Wind, Beaker, Gauge, Zap, Share2, Download, AlertTriangle, Layers,
} from 'lucide-react';
import PvtChartsCard from '@/components/fluidstudio/PvtChartsCard';
import SeparatorResultsCard from '@/components/fluidstudio/SeparatorResultsCard';
import BlendingResultsCard from '@/components/fluidstudio/BlendingResultsCard';
import FlowAssuranceCard from '@/components/fluidstudio/FlowAssuranceCard';
import BatchSweepCard from '@/components/fluidstudio/BatchSweepCard';
import CompositionalResultsCard from '@/components/fluidstudio/CompositionalResultsCard';
import PhaseEnvelopeCard from '@/components/fluidstudio/PhaseEnvelopeCard';

const KPICard = ({ title, value, unit, icon: Icon }) => (
  <Card className="bg-slate-800/50 border-slate-700 text-white">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-slate-300">{title}</CardTitle>
      <Icon className="h-4 w-4 text-cyan-300" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      <p className="text-xs text-slate-400">{unit}</p>
    </CardContent>
  </Card>
);

const fmt = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toFixed(d));

// Export the row-oriented PVT table as CSV.
const exportPvtCsv = (table) => {
  const cols = ['pressure', 'Rs', 'Bo', 'Bg', 'Z', 'mu_o', 'mu_g', 'co', 'phase'];
  const header = cols.join(',');
  const rows = table.map((r) => cols.map((c) => (r[c] ?? '')).join(','));
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fluid_studio_pvt.csv';
  a.click();
  URL.revokeObjectURL(url);
};

const IntegrationSuite = ({ backbone }) => {
  const navigate = useNavigate();
  // Only enable the handoff when the consumer's required keys are all finite.
  const pipelineReady = backbone
    && ['oil_gravity', 'gas_gravity', 'gor', 'inlet_temperature'].every((k) => Number.isFinite(backbone[k]));

  const sendToPipelineSizer = () => {
    if (!pipelineReady) return;
    navigate('/dashboard/apps/facilities/pipeline-sizer', { state: { fluidStudioData: backbone } });
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700 text-white mt-6">
      <CardHeader>
        <CardTitle className="flex items-center"><Share2 className="mr-2 text-cyan-300" /> Integration Suite</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-slate-300">Send this fluid backbone to other Petrolord applications.</p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Button onClick={sendToPipelineSizer} disabled={!pipelineReady} className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-40">
            <Zap className="w-4 h-4 mr-2" /> Send to Pipeline Sizer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Phase-1 results: PVT analysis + separator train, computed client-side.
 * Single-run only (blending / flow-assurance / batch are deferred seams).
 */
const FluidStudioResults = ({ results, eos, composition }) => {
  const { pvt, separator, backbone, meta, blending, flowAssurance, batchSummary } = results;
  const kpis = pvt?.kpis;
  if (!kpis) return null;

  const warnings = meta?.warnings ?? [];

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-600/40 bg-amber-500/10 text-amber-200 px-4 py-3 text-sm flex gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <ul className="space-y-1 list-disc list-inside">
            {warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KPICard title="Bubble Point" value={fmt(kpis.pb)} unit="psia" icon={Droplets} />
        <KPICard title="Solution GOR" value={fmt(kpis.rsb)} unit="scf/STB" icon={Wind} />
        <KPICard title="Oil FVF @ Pb" value={fmt(kpis.bo_at_pb, 3)} unit="rb/STB" icon={Beaker} />
        <KPICard title="Oil Visc. @ Pb" value={fmt(kpis.mu_o_at_pb, 3)} unit="cP" icon={Thermometer} />
        <KPICard title="Z-factor @ Pb" value={fmt(kpis.z_at_pb, 3)} unit="–" icon={Gauge} />
        <KPICard title="Surface GOR" value={fmt(separator?.totals?.surface_gor)} unit="scf/STB" icon={Layers} />
      </div>

      <Tabs defaultValue="pvt" className="w-full">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList className="bg-slate-800 flex-wrap h-auto">
            <TabsTrigger value="pvt">PVT Analysis</TabsTrigger>
            {eos && <TabsTrigger value="compositional">Compositional</TabsTrigger>}
            <TabsTrigger value="separators">Separator Train</TabsTrigger>
            {blending && <TabsTrigger value="blending">Blending</TabsTrigger>}
            {flowAssurance && <TabsTrigger value="flow-assurance">Flow Assurance</TabsTrigger>}
            {batchSummary && <TabsTrigger value="batch">Batch Sweep</TabsTrigger>}
          </TabsList>
          <Button variant="outline" size="sm" onClick={() => exportPvtCsv(pvt.table)} className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
            <Download className="w-4 h-4 mr-2" /> Export PVT CSV
          </Button>
        </div>

        <TabsContent value="pvt" className="mt-4">
          <PvtChartsCard table={pvt.table} pb={pvt.pb} />
        </TabsContent>

        {eos && (
          <TabsContent value="compositional" className="mt-4 space-y-4">
            <CompositionalResultsCard eos={eos} />
            <PhaseEnvelopeCard composition={composition} />
          </TabsContent>
        )}

        <TabsContent value="separators" className="mt-4">
          <SeparatorResultsCard separator={separator} />
        </TabsContent>

        {blending && (
          <TabsContent value="blending" className="mt-4">
            <BlendingResultsCard blending={blending} />
          </TabsContent>
        )}

        {flowAssurance && (
          <TabsContent value="flow-assurance" className="mt-4">
            <FlowAssuranceCard fa={flowAssurance} />
          </TabsContent>
        )}

        {batchSummary && (
          <TabsContent value="batch" className="mt-4">
            <BatchSweepCard rows={batchSummary} variable={meta?.batch?.variable} unit={meta?.batch?.unit} label={meta?.batch?.label} blendingActive={!!blending} />
          </TabsContent>
        )}
      </Tabs>

      <IntegrationSuite backbone={backbone} />
    </div>
  );
};

export default FluidStudioResults;
