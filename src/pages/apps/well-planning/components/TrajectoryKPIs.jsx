import React from 'react';
import { Activity, ArrowDownToLine, MoveHorizontal, AlertTriangle, Layers, MapPin } from 'lucide-react';

const KPIItem = ({ label, value, unit, icon: Icon, warning = false }) => (
    <div className={`flex flex-col p-3 rounded-lg border ${warning ? 'bg-pl-danger-bg border-pl-danger/40' : 'bg-pl-sunken border-pl-border'}`}>
        <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] uppercase tracking-wider text-pl-muted font-semibold">{label}</span>
            {Icon && <Icon className={`w-3 h-3 ${warning ? 'text-pl-danger-text' : 'text-pl-muted'}`} />}
        </div>
        <div className="flex items-baseline">
            <span className={`text-lg font-mono font-bold ${warning ? 'text-pl-danger-text' : 'text-pl-text'}`}>
                {value}
            </span>
            {unit && <span className="ml-1 text-[10px] text-pl-muted">{unit}</span>}
        </div>
    </div>
);

// KPI strip fed by the drilling engine survey table. TVD is below KB by
// convention (no datum re-add); displacement is the wellhead-relative
// closure at TD; the DLS warning reflects the engine QA (design over
// its own max-DLS constraint), not the retired length pseudo-check.
const TrajectoryKPIs = ({ summary, qc, depthUnit = 'ft' }) => {
    if (!summary) return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-20 bg-pl-sunken rounded-lg animate-pulse" />)}
        </div>
    );

    const bh = summary.bottomHole;
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPIItem
                label="Total MD"
                value={summary.totalMD.toFixed(0)}
                unit={depthUnit}
                icon={Layers}
            />
            <KPIItem
                label="TVD at TD"
                value={summary.totalTVD.toFixed(0)}
                unit={`${depthUnit} below KB`}
                icon={ArrowDownToLine}
            />
            <KPIItem
                label="Displacement"
                value={summary.horizontalDisplacement.toFixed(0)}
                unit={depthUnit}
                icon={MoveHorizontal}
            />
            <KPIItem
                label="Max Inc"
                value={summary.maxInclination.toFixed(1)}
                unit="deg"
                icon={Activity}
            />
            <KPIItem
                label="Max DLS"
                value={summary.maxDLS.toFixed(2)}
                unit={`/ ${depthUnit === 'ft' ? '100ft' : '30m'}`}
                icon={AlertTriangle}
                warning={Boolean(qc?.dlsExceeded)}
            />
            <KPIItem
                label="Bottom hole"
                value={bh ? `${bh.lat.toFixed(4)}, ${bh.lon.toFixed(4)}` : 'Set well CRS'}
                unit=""
                icon={MapPin}
            />
        </div>
    );
};

export default TrajectoryKPIs;
