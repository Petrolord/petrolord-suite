import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combine, CheckCircle, AlertTriangle, XCircle, Droplets, Wind, Beaker, Waves } from 'lucide-react';

const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));

const TotIt = ({ label, value, icon: Icon }) => (
  <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2">
    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
      {Icon && <Icon className="w-3 h-3" />}{label}
    </div>
    <div className="text-base font-bold text-white mt-0.5">{value}</div>
  </div>
);

/**
 * Blending results: an asphaltene-compatibility screening banner (colored by
 * risk) plus the blended fluid's black-oil properties. No chart (four scalars).
 */
const BlendingResultsCard = ({ blending }) => {
  if (!blending) return null;
  const { compatibility, properties } = blending;
  const asi = compatibility.asi;

  const tone = asi < 0.35
    ? { box: 'bg-emerald-900/30 border-emerald-700', text: 'text-emerald-300', Icon: CheckCircle }
    : asi < 0.6
      ? { box: 'bg-amber-900/30 border-amber-700', text: 'text-amber-300', Icon: AlertTriangle }
      : { box: 'bg-red-900/30 border-red-700', text: 'text-red-300', Icon: XCircle };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-white flex items-center"><Combine className="mr-2 text-cyan-300 w-5 h-5" /> Blending compatibility</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`p-4 rounded-lg flex items-start gap-4 border ${tone.box}`}>
          <tone.Icon className={`w-8 h-8 shrink-0 ${tone.text}`} />
          <div>
            <h3 className={`text-lg font-bold ${tone.text}`}>Asphaltene Stability Index (ASI): {asi.toFixed(2)}</h3>
            <p className="text-sm text-slate-300 mt-0.5">{compatibility.message}</p>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-lime-300 mb-2">Blended fluid properties</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <TotIt label="Blended API" value={`${fmt(properties.api, 1)} °API`} icon={Droplets} />
            <TotIt label="Blended GOR" value={`${fmt(properties.gor, 0)} scf/STB`} icon={Wind} />
            <TotIt label="Blended gas SG" value={fmt(properties.gasSg, 3)} icon={Beaker} />
            <TotIt label="Blended salinity" value={`${fmt(properties.salinity, 0)} ppm`} icon={Waves} />
          </div>
        </div>

        <p className="text-xs text-slate-500">
          ASI is an API-contrast screening heuristic, not a SARA/CII calculation. Confirm marginal or high-risk blends
          with an ASTM D7112/D7157 spot test. Blended API is on a specific-gravity (volume) basis, not a linear API average;
          salinity/temperature blends are labeled proxies. The blend&apos;s bubble point is re-solved and drives the PVT &amp; Separator tabs.
        </p>
      </CardContent>
    </Card>
  );
};

export default BlendingResultsCard;
