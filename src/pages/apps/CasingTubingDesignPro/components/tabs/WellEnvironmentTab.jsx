import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useCasingTubingDesign } from '../../contexts/CasingTubingDesignContext';
import { RefreshCw, BadgeCheck, PencilLine } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { tvdAt } from '../../engine/wellControl';
import { attitudeAtMd } from '../../engine/surveyMath';
import { depthDisp, depthLabel } from '../../services/ctRun';

const NumInput = ({ label, value, onChange, step = 1, suffix, testId }) => (
  <div className="space-y-1">
    <Label className="text-[10px] text-pl-muted uppercase font-bold">{label}</Label>
    <div className="flex items-center space-x-2">
      <Input
        data-testid={testId}
        type="number"
        step={step}
        value={value ?? ''}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-8 text-xs font-pl-mono tabular-nums text-right"
      />
      {suffix && <span className="text-[10px] text-pl-muted w-14">{suffix}</span>}
    </div>
  </div>
);

const WellEnvironmentTab = () => {
  const {
    stations, trajectory, mudWindow, depthUnit,
    caseDoc, setEnvironment, syncPpfgFromPublished,
  } = useCasingTubingDesign();

  const env = caseDoc?.environment;
  const ppfg = env?.ppfg || {};
  const unit = depthLabel(depthUnit);

  const trajRows = useMemo(() => {
    if (!stations.length) return [];
    const td = stations[stations.length - 1].md;
    const rows = [];
    const step = Math.max(50, Math.round(td / 40 / 50) * 50);
    for (let md = 0; md <= td + 1e-9; md += step) {
      const m = Math.min(md, td);
      const att = attitudeAtMd(stations, m);
      rows.push({ md: m, tvd: tvdAt(stations, m), inc: att?.inc ?? 0 });
    }
    return rows;
  }, [stations]);

  if (!env) return null;

  const maxTvd = trajRows.length ? trajRows[trajRows.length - 1].tvd : 0;
  const maxInc = trajRows.length ? Math.max(...trajRows.map((r) => r.inc)) : 0;

  return (
    <div className="grid grid-cols-12 gap-4 h-full p-1 overflow-hidden">
      {/* Left: the wellbore's working trajectory (definitive design, else actual composite, draft, or registry survey) */}
      <div className="col-span-12 lg:col-span-4 flex flex-col space-y-4 h-full overflow-y-auto pr-2 custom-scrollbar">
        <Card>
          <CardHeader className="py-3 px-4 border-b border-pl-border flex flex-row items-center justify-between bg-pl-sunken">
            <CardTitle className="text-sm font-semibold text-pl-text">Trajectory</CardTitle>
            <span className={`text-[10px] px-2 py-0.5 rounded border ${trajectory?.source === 'definitive' ? 'text-pl-muted bg-pl-sunken border-pl-border' : 'text-pl-warning-text bg-pl-warning-bg border-pl-warning/40'}`} title={trajectory?.note || ''} data-testid="ct-traj-source">
              {trajectory?.label || trajectory?.design?.name || 'no design'}
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4 grid grid-cols-2 gap-3 mb-2">
              <div className="bg-pl-sunken p-2 rounded border border-pl-border">
                <span className="text-[10px] text-pl-muted uppercase font-bold">Shoe TVD</span>
                <div data-testid="ct-shoe-tvd" className="text-lg font-pl-mono tabular-nums text-pl-text leading-none mt-1">
                  {depthDisp(maxTvd, depthUnit)?.toFixed(0)} <span className="text-xs text-pl-muted">{unit}</span>
                </div>
              </div>
              <div className="bg-pl-sunken p-2 rounded border border-pl-border">
                <span className="text-[10px] text-pl-muted uppercase font-bold">Max Inc</span>
                <div className="text-lg font-pl-mono tabular-nums text-pl-text leading-none mt-1">
                  {maxInc.toFixed(1)}<span className="text-xs text-pl-muted">°</span>
                </div>
              </div>
            </div>
            <div className="h-48 border-t border-pl-border">
              <ScrollArea className="h-full w-full">
                <Table>
                  <TableHeader>
                    <TableRow className="border-pl-border hover:bg-transparent h-8">
                      <TableHead className="text-[10px] h-8 text-pl-muted">MD ({unit})</TableHead>
                      <TableHead className="text-[10px] h-8 text-pl-muted">TVD ({unit})</TableHead>
                      <TableHead className="text-[10px] h-8 text-pl-muted">Inc (°)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trajRows.map((pt, i) => (
                      <TableRow key={i} className="border-pl-border hover:bg-pl-sunken h-7">
                        <TableCell className="text-[10px] font-pl-mono tabular-nums py-1">{depthDisp(pt.md, depthUnit).toFixed(0)}</TableCell>
                        <TableCell className="text-[10px] font-pl-mono tabular-nums py-1">{depthDisp(pt.tvd, depthUnit).toFixed(0)}</TableCell>
                        <TableCell className="text-[10px] font-pl-mono tabular-nums py-1">{pt.inc.toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4 border-b border-pl-border bg-pl-sunken">
            <CardTitle className="text-sm font-semibold text-pl-text">Temperature Profile (linear)</CardTitle>
          </CardHeader>
          <CardContent className="p-4 grid grid-cols-2 gap-4">
            <NumInput
              label="Surface Temp" suffix="°C" step={1}
              value={env.tempSurfC}
              onChange={(v) => setEnvironment({ tempSurfC: v })}
            />
            <NumInput
              label="Gradient" suffix="°C/m" step={0.005}
              value={env.tempGradCPerM}
              onChange={(v) => setEnvironment({ tempGradCPerM: v })}
            />
            <p className="col-span-2 text-[10px] text-pl-muted">
              Tubing thermal forces use the mean temperature change of this linear profile; per-case overrides live on the tubing load cases.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Right: PPFG + fluids */}
      <div className="col-span-12 lg:col-span-8 flex flex-col h-full space-y-4 overflow-y-auto custom-scrollbar pr-1">
        <Card>
          <CardHeader className="py-3 px-4 border-b border-pl-border flex flex-row items-center justify-between bg-pl-sunken shrink-0">
            <div className="flex items-center space-x-3">
              <CardTitle className="text-sm font-semibold text-pl-text">Pore Pressure & Fracture Gradient</CardTitle>
              {ppfg.source === 'published' ? (
                <span data-testid="ct-ppfg-badge" className="flex items-center text-[10px] text-pl-success-text bg-pl-success-bg px-2 py-0.5 rounded border border-pl-success/40">
                  <BadgeCheck className="w-3 h-3 mr-1" /> Published pp-1.0.0
                </span>
              ) : (
                <span data-testid="ct-ppfg-badge" className="flex items-center text-[10px] text-pl-muted bg-pl-sunken px-2 py-0.5 rounded border border-pl-border">
                  <PencilLine className="w-3 h-3 mr-1" /> Manual
                </span>
              )}
            </div>
            <Button
              data-testid="ct-ppfg-sync"
              variant="ghost" size="sm"
              className="h-7 text-xs text-pl-primary-text hover:text-pl-primary-text-hover hover:bg-pl-sunken"
              onClick={syncPpfgFromPublished}
              disabled={!mudWindow}
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Sync from Pore Pressure Studio
            </Button>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4 max-w-lg">
              <NumInput
                label="Pore EMW at shoe" suffix="kg/m³" step={10}
                testId="ct-pp-emw"
                value={ppfg.ppEmwAtShoeKgM3}
                onChange={(v) => setEnvironment({ ppfg: { ...ppfg, source: 'manual', ppEmwAtShoeKgM3: v } })}
              />
              <NumInput
                label="Frac EMW at shoe" suffix="kg/m³" step={10}
                testId="ct-frac-emw"
                value={ppfg.fracEmwAtShoeKgM3}
                onChange={(v) => setEnvironment({ ppfg: { ...ppfg, source: 'manual', fracEmwAtShoeKgM3: v } })}
              />
            </div>
            <p className="text-[10px] text-pl-muted max-w-2xl">
              The gas-kick burst case takes the shoe control pressure from the frac EMW here (or a reservoir pressure override on the load case). Publishing PP/FP curves from Pore Pressure Studio to this wellbore&apos;s registry well makes Sync available.
            </p>
            {mudWindow && (
              <div className="h-40 border border-pl-border rounded bg-pl-surface">
                <ScrollArea className="h-full w-full">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-pl-border hover:bg-transparent h-7">
                        <TableHead className="text-[10px] h-7 text-pl-muted pl-4">MD ({unit})</TableHead>
                        <TableHead className="text-[10px] h-7 text-pl-muted">TVD ({unit})</TableHead>
                        <TableHead className="text-[10px] h-7 text-pl-muted">PP EMW (g/cc)</TableHead>
                        <TableHead className="text-[10px] h-7 text-pl-muted">Frac EMW (g/cc)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mudWindow.filter((_, i) => i % 2 === 0).map((pt, i) => (
                        <TableRow key={i} className="border-pl-border hover:bg-pl-sunken h-7">
                          <TableCell className="text-[10px] font-pl-mono tabular-nums py-1 pl-4">{depthDisp(pt.md, depthUnit).toFixed(0)}</TableCell>
                          <TableCell className="text-[10px] font-pl-mono tabular-nums py-1">{depthDisp(pt.tvd, depthUnit).toFixed(0)}</TableCell>
                          <TableCell className="text-[10px] font-pl-mono tabular-nums py-1 text-pl-text">{pt.ppEmw != null ? pt.ppEmw.toFixed(2) : '—'}</TableCell>
                          <TableCell className="text-[10px] font-pl-mono tabular-nums py-1 text-pl-text">{pt.fpEmw != null ? pt.fpEmw.toFixed(2) : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4 border-b border-pl-border bg-pl-sunken">
            <CardTitle className="text-sm font-semibold text-pl-text">Well Fluids</CardTitle>
          </CardHeader>
          <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <NumInput
              label="Mud Density" suffix="kg/m³" step={10} testId="ct-mud-density"
              value={env.mudKgM3}
              onChange={(v) => setEnvironment({ mudKgM3: v })}
            />
            <NumInput
              label="Cement Slurry" suffix="kg/m³" step={10}
              value={env.cementKgM3}
              onChange={(v) => setEnvironment({ cementKgM3: v })}
            />
            <NumInput
              label="Packer Fluid" suffix="kg/m³" step={10}
              value={env.packerFluidKgM3}
              onChange={(v) => setEnvironment({ packerFluidKgM3: v })}
            />
            <NumInput
              label="Backup Water" suffix="kg/m³" step={10}
              value={env.seawaterKgM3}
              onChange={(v) => setEnvironment({ seawaterKgM3: v })}
            />
            <NumInput
              label="Gas Gradient" suffix="Pa/m" step={100}
              value={env.gasGradPaPerM}
              onChange={(v) => setEnvironment({ gasGradPaPerM: v })}
            />
            <NumInput
              label="Produced Fluid" suffix="kg/m³" step={10}
              value={env.mixtureKgM3}
              onChange={(v) => setEnvironment({ mixtureKgM3: v })}
            />
            <NumInput
              label="Design DLS" suffix="°/30m" step={0.5}
              value={env.bendingDlsDegPer30m}
              onChange={(v) => setEnvironment({ bendingDlsDegPer30m: v })}
            />
            <p className="col-span-2 md:col-span-1 text-[10px] text-pl-muted self-end">
              DLS feeds the triaxial bending stress; the produced-fluid density feeds the API RP 14E erosional check.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default WellEnvironmentTab;
