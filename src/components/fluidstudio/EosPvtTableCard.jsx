import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Download, Table2 } from 'lucide-react';
import FluidStudioTierBadge from '@/components/fluidstudio/FluidStudioTierBadge';
import { eosPvtTableCsv } from '@/utils/fluidstudio/eosAnalysis';

const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? 'n/a' : Number(v).toFixed(d));

const Stat = ({ label, value, unit }) => (
  <div className="rounded-md bg-slate-800/60 border border-slate-700 px-3 py-2">
    <p className="text-[11px] text-slate-400">{label}</p>
    <p className="text-sm font-semibold text-white">{value}<span className="ml-1 text-xs font-normal text-slate-400">{unit}</span></p>
  </div>
);

const exportCsv = (table) => {
  const blob = new Blob([eosPvtTableCsv(table)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fluid_studio_eos_pvt_table.csv';
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * EOS black-oil table (FS7): differential liberation at the flash
 * temperature composited with the separator-train flash (Amyx
 * adjustment), exported in MB Studio's PVT lab-table schema.
 */
const EosPvtTableCard = ({ result, tuned = false }) => {
  if (!result) return null;
  const { table, warnings } = result;

  if (!table) {
    if (!warnings?.length) return null;
    return (
      <Card className="bg-slate-800/50 border-slate-700 text-white">
        <CardHeader><CardTitle className="flex items-center text-base"><Table2 className="w-4 h-4 mr-2 text-cyan-300" />EOS black-oil table</CardTitle></CardHeader>
        <CardContent>
          <div className="text-sm text-amber-300 flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <ul className="space-y-1">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700 text-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center text-base">
            <Table2 className="w-4 h-4 mr-2 text-cyan-300" />
            EOS black-oil table
          </CardTitle>
          <div className="flex gap-2 items-center">
            {tuned && <FluidStudioTierBadge tier="lab_tuned" />}
            <FluidStudioTierBadge tier="oracle_gated" />
            <FluidStudioTierBadge
              tier="published_method"
              note="Differential liberation composited with the separator flash by the standard Amyx and McCain adjustment: Bo = Bod x Bofb/Bodb and Rs = Rsfb minus (Rsdb minus Rsd) x Bofb/Bodb. The adjustment is exact at the bubble point and approximate toward atmospheric pressure, as in laboratory practice."
            />
            <Button variant="outline" size="sm" onClick={() => exportCsv(table)} className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
              <Download className="w-4 h-4 mr-2" /> Export CSV (MB schema)
            </Button>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Differential liberation at the flash temperature, adjusted to your separator train. The CSV columns match the Material Balance Studio PVT lab-table schema so the export drops straight into that workflow.
        </p>
        {table.warnings.length > 0 && (
          <div className="mt-2 text-xs text-amber-300 flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <ul className="space-y-0.5">{table.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Stat label={table.satKind === 'dew' ? 'Dew point' : 'Bubble point'} value={fmt(table.pb, 0)} unit="psia" />
          <Stat label="Rs at Pb (flash)" value={fmt(table.kpis.rsfb, 1)} unit="scf/STB" />
          <Stat label="Bo at Pb (flash)" value={fmt(table.kpis.bofb, 4)} unit="rb/STB" />
          <Stat label="Bod / Rsd at Pb (DL)" value={`${fmt(table.kpis.bodb, 4)} / ${fmt(table.kpis.rsdb, 0)}`} unit="rb/STB · scf/STB" />
          <Stat label="Stock tank oil" value={fmt(table.kpis.stoApi, 1)} unit="°API" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="text-left py-1.5 pr-2 font-medium">P (psia)</th>
                <th className="text-right py-1.5 px-2 font-medium">Rs (scf/STB)</th>
                <th className="text-right py-1.5 px-2 font-medium">Bo (rb/STB)</th>
                <th className="text-right py-1.5 px-2 font-medium">Bg (rb/scf)</th>
                <th className="text-right py-1.5 px-2 font-medium">Z gas</th>
                <th className="text-right py-1.5 px-2 font-medium">μo (cP)</th>
                <th className="text-right py-1.5 pl-2 font-medium">μg (cP)</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={`${r.pressure}-${r.phase}`} className={`border-b border-slate-800 ${r.phase === 'saturated' ? 'text-cyan-200 font-semibold' : 'text-slate-200'}`}>
                  <td className="py-1 pr-2 font-mono text-xs">{fmt(r.pressure, 0)}{r.phase === 'saturated' ? ' (Pb)' : ''}</td>
                  <td className="text-right py-1 px-2 font-mono text-xs">{fmt(r.Rs, 1)}</td>
                  <td className="text-right py-1 px-2 font-mono text-xs">{fmt(r.Bo, 4)}</td>
                  <td className="text-right py-1 px-2 font-mono text-xs">{r.Bg != null ? Number(r.Bg).toFixed(6) : 'n/a'}</td>
                  <td className="text-right py-1 px-2 font-mono text-xs">{fmt(r.Z, 4)}</td>
                  <td className="text-right py-1 px-2 font-mono text-xs">{fmt(r.mu_o, 4)}</td>
                  <td className="text-right py-1 pl-2 font-mono text-xs">{r.mu_g != null ? Number(r.mu_g).toFixed(5) : 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 mt-1">
            Viscosities are untuned Lohrenz-Bray-Clark estimates (screening tier). The low-pressure tail of the composite Rs and Bo is approximate, as with laboratory separator adjustment.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default EosPvtTableCard;
