import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combine, CheckCircle, AlertTriangle, XCircle, Droplets, Wind, Beaker, Waves } from 'lucide-react';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));

const TotIt = ({ label, value, icon: Icon }) => (
  <div className="rounded-lg border border-pl-border bg-pl-sunken px-3 py-2">
    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-pl-muted">
      {Icon && <Icon className="w-3 h-3" />}{label}
    </div>
    <div className="text-base font-bold text-pl-text mt-0.5">{value}</div>
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
    ? { box: 'bg-pl-success-bg border-pl-success/40', text: 'text-pl-success-text', Icon: CheckCircle }
    : asi < 0.6
      ? { box: 'bg-pl-warning-bg border-pl-warning/40', text: 'text-pl-warning-text', Icon: AlertTriangle }
      : { box: 'bg-pl-danger-bg border-pl-danger/40', text: 'text-pl-danger-text', Icon: XCircle };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-pl-text flex items-center"><Combine className="mr-2 text-pl-muted w-5 h-5" /> Blending compatibility</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`p-4 rounded-lg flex items-start gap-4 border ${tone.box}`}>
          <tone.Icon className={`w-8 h-8 shrink-0 ${tone.text}`} />
          <div>
            <h3 className={`text-lg font-bold ${tone.text}`}>Asphaltene Stability Index (ASI): {asi.toFixed(2)}</h3>
            <p className="text-sm text-pl-text mt-0.5">{compatibility.message}</p>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-pl-text mb-2">Blended fluid properties</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <TotIt label="Blended API" value={`${fmt(properties.api, 1)} °API`} icon={Droplets} />
            <TotIt label="Blended GOR" value={`${fmt(properties.gor, 0)} scf/STB`} icon={Wind} />
            <TotIt label="Blended gas SG" value={fmt(properties.gasSg, 3)} icon={Beaker} />
            <TotIt label="Blended salinity" value={`${fmt(properties.salinity, 0)} ppm`} icon={Waves} />
          </div>
        </div>

        <p className="text-xs text-pl-muted">
          ASI is an API-contrast screening heuristic. It is not a SARA/CII calculation. Confirm marginal or high-risk blends
          with an ASTM D7112/D7157 spot test. Blended API is on a specific-gravity (volume) basis. It is not a linear API average;
          salinity/temperature blends are labeled proxies. The blend&apos;s bubble point is re-solved and drives the PVT &amp; Separator tabs.
        </p>
      </CardContent>
    </Card>
  );
};

export default BlendingResultsCard;
