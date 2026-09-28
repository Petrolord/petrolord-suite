import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Droplets, Ruler, Waves, Layers } from 'lucide-react';
import { formatNumber } from '@/utils/fdp/formatting';
import { planReservesP50 } from '@/utils/fdp/fdpCalculations';

const StatCard = ({ label, value, unit, icon: Icon }) => (
    <div className="bg-pl-sunken p-3 rounded-lg border border-pl-border flex items-center justify-between">
        <div>
            <div className="text-xs text-pl-muted uppercase tracking-wider font-semibold">{label}</div>
            <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-bold font-pl-mono tabular-nums text-pl-text">{value || '-'}</span>
                <span className="text-xs text-pl-muted">{unit}</span>
            </div>
        </div>
        <div className="p-2 rounded-full bg-pl-surface">
            <Icon className="w-5 h-5 text-pl-muted" />
        </div>
    </div>
);

const FieldStatistics = ({ data, subsurface }) => {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard 
                label="P50 Reserves" 
                value={formatNumber(planReservesP50({ subsurface }), 0)} 
                unit="MMbbl" 
                icon={Droplets} 
            />
            <StatCard 
                label="Field Area" 
                value={data.fieldArea} 
                unit="km²" 
                icon={Ruler} 
            />
            <StatCard 
                label="Water Depth" 
                value={data.waterDepth} 
                unit="m" 
                icon={Waves} 
            />
             <StatCard 
                label="Reservoir Pressure" 
                value={formatNumber(subsurface?.reservoirPressure, 0)} 
                unit="psi" 
                icon={Layers} 
            />
        </div>
    );
};

export default FieldStatistics;