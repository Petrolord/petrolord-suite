// The unloading sequence (Unloading tab). Stage by stage: the casing
// pressure at transfer, where the fluid level has been pushed to, what
// the port passes, and whether every valve above has shut. A valve that
// has not shut is the classic multipointing fault, and it is called out
// rather than averaged away.
import React from 'react';
import { ArrowDownToLine, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGasLift } from '@/contexts/GasLiftDesignContext';

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const UnloadingPanel = () => {
  const { installation, inputs } = useGasLift();
  if (!installation.ok) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-pl-muted text-sm px-8">
          Complete the design inputs in the left rail to walk the unloading sequence.
        </CardContent>
      </Card>
    );
  }

  const stages = installation.design.unloading;
  const target = parseFloat(inputs.injection.targetQgiMscfd);
  const anyMultipoint = stages.some((s) => s.multipointing);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowDownToLine className="w-4 h-4 text-pl-muted" /> Unloading sequence
            <span className="text-xs font-normal text-pl-muted">
              {stages.length} stage{stages.length === 1 ? '' : 's'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-pl-muted border-b border-pl-border">
                  <th className="py-2 pr-3 font-semibold">Stage</th>
                  <th className="py-2 pr-3 font-semibold text-right">Injecting at (ft)</th>
                  <th className="py-2 pr-3 font-semibold text-right">Surface casing (psig)</th>
                  <th className="py-2 pr-3 font-semibold text-right">Casing at depth (psig)</th>
                  <th className="py-2 pr-3 font-semibold text-right">Tubing at depth (psig)</th>
                  <th className="py-2 pr-3 font-semibold text-right">Gas through port (Mscf/d)</th>
                  <th className="py-2 pr-3 font-semibold">Valves above</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((s) => (
                  <tr key={s.stage} className="border-b border-pl-border last:border-0">
                    <td className="py-2 pr-3 text-pl-text">{s.stage}</td>
                    <td className="py-2 pr-3 text-right font-pl-mono tabular-nums text-pl-text">{fmt(s.depthFt)}</td>
                    <td className="py-2 pr-3 text-right font-pl-mono tabular-nums text-pl-text">{fmt(s.surfaceInjectionPsig)}</td>
                    <td className="py-2 pr-3 text-right font-pl-mono tabular-nums text-pl-muted">{fmt(s.injectionAtDepthPsig)}</td>
                    <td className="py-2 pr-3 text-right font-pl-mono tabular-nums text-pl-muted">{fmt(s.productionAtDepthPsig)}</td>
                    <td className={`py-2 pr-3 text-right font-pl-mono tabular-nums ${Number.isFinite(target) && s.gasRateMscfd < target ? 'text-pl-warning-text' : 'text-pl-text'}`}>
                      {fmt(s.gasRateMscfd)}
                    </td>
                    <td className="py-2 pr-3">
                      {s.multipointing ? (
                        <span className="text-pl-warning-text text-xs flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          V{s.upperValvesOpen.join(', V')} still open
                        </span>
                      ) : (
                        <span className="text-pl-success-text text-xs flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> all shut
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-pl-muted mt-3">
            A valve shuts when the casing pressure falls back to its dome pressure, so the surface
            pressure drop per valve has to be larger than the valve's spread. If a stage shows a
            valve above still open, either increase the drop per valve or fit a smaller port.
          </p>
        </CardContent>
      </Card>

      {anyMultipoint && (
        <Card className="bg-pl-warning-bg border-pl-warning/40">
          <CardContent className="py-4 text-sm text-pl-warning-text">
            This string will inject at more than one depth during unloading. The gas splits, the
            deeper valve never carries its design rate, and the well settles above its design
            injection depth.
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default UnloadingPanel;
