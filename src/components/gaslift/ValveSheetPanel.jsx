// The valve sheet (Design tab): one row per valve with what a shop
// needs to set it and what a field hand needs to run it. This table is
// the deliverable a gas-lift design produces.
import React from 'react';
import { Wrench, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useGasLift } from '@/contexts/GasLiftDesignContext';

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const portLabel = (idIn) => {
  const sixteenths = Math.round(idIn * 32);
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const g = gcd(sixteenths, 32);
  return `${sixteenths / g}/${32 / g} in`;
};

const toCsv = (rows) => {
  const header = [
    'Valve', 'Depth (ft TVD)', 'Temperature (F)', 'Type', 'Port', 'R',
    'Injection at depth (psig)', 'Production at depth (psig)', 'Dome at temp (psig)',
    'Test rack opening (psig)', 'Spread (psi)', 'Closes at surface (psig)', 'Gas rate (Mscf/d)',
  ];
  const body = rows.map((r) => [
    r.valve, Math.round(r.depthFt), Math.round(r.tempF), r.type, portLabel(r.portIn),
    r.r === null || r.r === undefined ? '' : r.r.toFixed(4),
    Math.round(r.injectionPsig), Math.round(r.productionPsig),
    r.domeAtTempPsig === null ? '' : Math.round(r.domeAtTempPsig),
    r.testRackPsig === null ? '' : Math.round(r.testRackPsig),
    r.spreadPsi === null ? '' : Math.round(r.spreadPsi),
    r.closingSurfacePsig === null ? '' : Math.round(r.closingSurfacePsig),
    Math.round(r.gasRateMscfd),
  ].join(','));
  return [header.join(','), ...body].join('\n');
};

const ValveSheetPanel = () => {
  const { valveSheet, installation } = useGasLift();
  if (!installation.ok || !valveSheet.length) return null;

  const download = () => {
    const blob = new Blob([toCsv(valveSheet)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gas-lift-valve-sheet.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="w-4 h-4 text-amber-400" /> Valve sheet
        </CardTitle>
        <Button size="sm" variant="outline" className="h-8" onClick={download}>
          <Download className="w-3 h-3 mr-1" /> CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-3 font-semibold">Valve</th>
                <th className="py-2 pr-3 font-semibold text-right">Depth (ft)</th>
                <th className="py-2 pr-3 font-semibold text-right">Temp (F)</th>
                <th className="py-2 pr-3 font-semibold">Port</th>
                <th className="py-2 pr-3 font-semibold text-right">R</th>
                <th className="py-2 pr-3 font-semibold text-right">Injection (psig)</th>
                <th className="py-2 pr-3 font-semibold text-right">Tubing (psig)</th>
                <th className="py-2 pr-3 font-semibold text-right">Dome at temp (psig)</th>
                <th className="py-2 pr-3 font-semibold text-right">Test rack (psig)</th>
                <th className="py-2 pr-3 font-semibold text-right">Spread (psi)</th>
                <th className="py-2 pr-3 font-semibold text-right">Closes at (psig)</th>
                <th className="py-2 pr-3 font-semibold text-right">Gas (Mscf/d)</th>
              </tr>
            </thead>
            <tbody>
              {valveSheet.map((r) => (
                <tr key={r.valve} className="border-b border-slate-800/60 last:border-0">
                  <td className="py-2 pr-3 text-slate-200">
                    {r.type === 'orifice' ? 'Orifice' : `V${r.valve}`}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{fmt(r.depthFt)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{fmt(r.tempF)}</td>
                  <td className="py-2 pr-3 text-slate-400">{portLabel(r.portIn)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-400">
                    {r.r === null || r.r === undefined ? '--' : r.r.toFixed(4)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{fmt(r.injectionPsig)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{fmt(r.productionPsig)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{fmt(r.domeAtTempPsig)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-semibold text-emerald-400">
                    {fmt(r.testRackPsig)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{fmt(r.spreadPsi)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{fmt(r.closingSurfacePsig)}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${r.passesTarget === false ? 'text-amber-400' : 'text-slate-300'}`}>
                    {fmt(r.gasRateMscfd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-600 mt-3">
          Test rack opening is the 60 F bench setting, from the dome charge corrected off valve
          temperature by the real-gas nitrogen ratio. Set every valve from the vendor sheet for the
          valve actually run: bellows area and R vary by manufacturer.
        </p>
      </CardContent>
    </Card>
  );
};

export default ValveSheetPanel;
