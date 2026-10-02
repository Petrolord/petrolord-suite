import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
import CompositionalSeparatorCard from '@/components/fluidstudio/CompositionalSeparatorCard';
import LabTuningCard from '@/components/fluidstudio/LabTuningCard';
import EosPvtTableCard from '@/components/fluidstudio/EosPvtTableCard';
import PhaseEnvelopeCard from '@/components/fluidstudio/PhaseEnvelopeCard';
import FluidReportTab from '@/components/fluidstudio/FluidReportTab';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { PVT_PROJECT_PARAM } from '@/lib/inputProvenance/pvtContract';
import { useFluidUnits } from '@/components/fluidstudio/FluidUnitsContext';
import { pvtTableCsv, downloadText } from '@/utils/fluidstudio/csvExport';
import { buildLabOverlay, labPlotIds } from '@/utils/fluidstudio/pvtSeries';
import { screenWarnings } from '@/utils/fluidstudio/screenWarnings';

const KPICard = ({ title, value, unit, icon: Icon }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-pl-text min-w-0">{title}</CardTitle>
      <Icon className="h-4 w-4 shrink-0 text-pl-muted" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold tabular-nums whitespace-nowrap">{value}</div>
      <p className="text-xs text-pl-muted">{unit}</p>
    </CardContent>
  </Card>
);

const fmt = (v, d = 0) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toFixed(d));

// Where each handoff goes. Inside the /dev harness the receiving app's
// harness route is used, so the chain can be walked signed out.
const ROUTES = {
  lineSizing: ['/dashboard/apps/facilities/facility-network-hydraulics', '/dev/facilities/pipeline'],
  wellTest: ['/dashboard/apps/reservoir/well-test-analysis-studio', '/dev/well-test-analysis-studio'],
};

// Facilities F1: the hand-off returns, pointing at the Pipeline & Line
// Sizing Studio (the F0-retired Pipeline Sizer's mock is gone; the studio
// reads the backbone via location.state and prefills its multiphase fluid).
//
// FLUID-U1: the handoff carries the pvt-1 block. When the fluid is a saved
// project its id rides in the URL (?fluidProject=), so the receiving app can
// read the block again after a page refresh; `onBeforeSend` saves first.
const IntegrationSuite = ({ backbone, projectId, onBeforeSend }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const inHarness = location.pathname.startsWith('/dev/');
  const ready = backbone
    && ['oil_gravity', 'gas_gravity', 'inlet_temperature'].some((k) => Number.isFinite(backbone[k]));

  const send = async (route) => {
    if (onBeforeSend) await onBeforeSend();
    const base = ROUTES[route][inHarness ? 1 : 0];
    const to = projectId ? `${base}?${PVT_PROJECT_PARAM}=${encodeURIComponent(projectId)}` : base;
    navigate(to, { state: { fluidStudioData: backbone } });
  };

  const sendToLineSizing = () => { if (ready) send('lineSizing'); };

  // Well Test Analysis Studio takes Bo and viscosity at the bubble point,
  // with the method that produced each one named.
  const wellTestReady = backbone && Number.isFinite(backbone.bo_at_pb) && Number.isFinite(backbone.mu_o_at_pb);
  const sendToWellTest = () => { if (wellTestReady) send('wellTest'); };

  return (
    <Card className="mt-6" data-testid="fluid-integration">
      <CardHeader>
        <CardTitle className="flex items-center"><Share2 className="mr-2 text-pl-muted" /> Integration Suite</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-pl-text">
          Send this fluid to other Petrolord applications. The receiving app is told the method behind every property, the units, the bubble point source and the project it came from.
          {backbone?.source === 'eos' && ' The handoff carries the compositional surface numbers: stock tank API, surface gas gravity, separator-flash GOR and the EOS black-oil table.'}
        </p>
        <p className="text-xs text-pl-muted" data-testid="fluid-handoff-note">
          {projectId
            ? 'This fluid is a saved project: it is saved before sending, and the receiving app can read it again after a page refresh.'
            : 'This fluid is not saved as a project yet. The handoff works, but the receiving app cannot read it again after a page refresh. Create a project first to keep the link.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Button onClick={sendToLineSizing} disabled={!ready} className="flex-1 disabled:opacity-40">
            <Zap className="w-4 h-4 mr-2" /> Send to Line Sizing Studio
          </Button>
          <Button onClick={sendToWellTest} disabled={!wellTestReady} variant="outline" className="flex-1 disabled:opacity-40">
            <Zap className="w-4 h-4 mr-2" /> Send to Well Test Analysis Studio
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
const FluidStudioResults = ({
  results, eos, composition, sepStages, onUpdateTuning,
  // FLUID-U1: the report door, the pvt-1 handoff and the lifted envelope
  inputs, report, handoff, projectId, onBeforeSend, organizationName,
  onIdentification, onSource, onExportPdf, exporting, envelope, onEnvelope,
}) => {
  const u = useFluidUnits();
  const { pvt, separator, backbone, meta, blending, flowAssurance, batchSummary } = results;
  const kpis = pvt?.kpis;
  const warnings = useMemo(() => screenWarnings(results, u), [results, u]);
  const lab = useMemo(() => (eos?.pvtTable?.table
    ? buildLabOverlay({
      lab: composition?.tuning?.lab, flashPressure: Number(composition?.pressure), flashTempF: Number(composition?.temp),
      modelPb: eos.pvtTable.table.pb, system: u.system,
    })
    : null), [eos, composition, u.system]);
  if (!kpis) return null;

  // the table the app hands over and exports: the EOS table in compositional mode
  const exportRows = report?.model?.pvtRows ?? pvt.table;
  const exportCsv = () => downloadText(
    pvtTableCsv({ rows: exportRows, contract: report?.contract ?? null, system: u.system }),
    'fluid_studio_pvt.csv',
  );
  const eosTable = eos?.pvtTable?.table;

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div className="rounded-lg border border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text px-4 py-3 text-sm flex gap-3" data-testid="fluid-warnings">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <ul className="space-y-1 list-disc list-inside">
            {warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* six across only where each card fits its value (Wave 2 T1: at 1366 px
          the values ran out of the cards) */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KPICard title="Bubble Point" value={fmt(u.show('pressure', kpis.pb))} unit={u.label('pressure')} icon={Droplets} />
        <KPICard title="Solution GOR" value={fmt(u.show('gor', kpis.rsb), u.system === 'si' ? 1 : 0)} unit={u.label('gor')} icon={Wind} />
        <KPICard title="Oil FVF @ Pb" value={fmt(u.show('fvfOil', kpis.bo_at_pb), 3)} unit={u.label('fvfOil')} icon={Beaker} />
        <KPICard title="Oil Visc. @ Pb" value={fmt(u.show('viscosity', kpis.mu_o_at_pb), 3)} unit={u.label('viscosity')} icon={Thermometer} />
        <KPICard title="Z-factor @ Pb" value={fmt(kpis.z_at_pb, 3)} unit="dimensionless" icon={Gauge} />
        <KPICard title="Surface GOR" value={fmt(u.show('gor', separator?.totals?.surface_gor), u.system === 'si' ? 1 : 0)} unit={u.label('gor')} icon={Layers} />
      </div>
      {eos && (
        <p className="text-xs text-pl-muted" data-testid="fluid-kpi-basis">
          These six values are the black-oil correlation stream. The compositional results are on the Compositional tab, and the report and the handoffs use {eosTable ? 'the compositional table' : 'the black-oil table, because the compositional model has no table at these conditions'}.
        </p>
      )}

      <Tabs defaultValue="pvt" className="w-full">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="pvt">PVT Analysis</TabsTrigger>
            {eos && <TabsTrigger value="compositional">Compositional</TabsTrigger>}
            <TabsTrigger value="separators">Separator Train</TabsTrigger>
            {blending && <TabsTrigger value="blending">Blending</TabsTrigger>}
            {flowAssurance && <TabsTrigger value="flow-assurance">Flow Assurance</TabsTrigger>}
            {batchSummary && <TabsTrigger value="batch">Batch Sweep</TabsTrigger>}
            {report?.model && <TabsTrigger value="report">Report</TabsTrigger>}
          </TabsList>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="w-4 h-4 mr-2" /> Export PVT CSV
          </Button>
        </div>

        <TabsContent value="pvt" className="mt-4">
          <PvtChartsCard table={pvt.table} pb={kpis.pb} />
        </TabsContent>

        {eos && (
          <TabsContent value="compositional" className="mt-4 space-y-4">
            <CompositionalResultsCard eos={eos} />
            {onUpdateTuning && (
              <LabTuningCard composition={composition} stages={sepStages} onUpdateTuning={onUpdateTuning} />
            )}
            {eosTable && lab && labPlotIds(lab).length > 0 && (
              <div data-testid="fluid-lab-vs-model">
                <p className="text-sm font-semibold text-pl-text mb-2">Laboratory values against the model</p>
                <PvtChartsCard table={eosTable.rows} pb={eosTable.pb} satKind={eosTable.satKind} only={labPlotIds(lab)} lab={lab} />
                {lab.notes.map((n) => <p key={n} className="text-xs text-pl-muted mt-1">{n}</p>)}
              </div>
            )}
            <CompositionalSeparatorCard separator={eos.separator} tuned={!!eos.parsed?.tuning} />
            <EosPvtTableCard result={eos.pvtTable} tuned={!!eos.parsed?.tuning} contract={report?.contract} />
            {eosTable && <PvtChartsCard table={eosTable.rows} pb={eosTable.pb} satKind={eosTable.satKind} />}
            <PhaseEnvelopeCard composition={composition} tuned={!!eos.parsed?.tuning} envelope={envelope} onEnvelope={onEnvelope} />
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

        {report?.model && (
          <TabsContent value="report" className="mt-4">
            <FluidReportTab
              report={report}
              inputs={inputs}
              organizationName={organizationName}
              onIdentification={onIdentification}
              onSource={onSource}
              onExport={onExportPdf}
              exporting={exporting}
            />
          </TabsContent>
        )}
      </Tabs>

      <IntegrationSuite backbone={handoff ?? eos?.pvtTable?.backbone ?? backbone} projectId={projectId} onBeforeSend={onBeforeSend} />
    </div>
  );
};

export default FluidStudioResults;
