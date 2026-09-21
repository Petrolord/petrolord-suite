import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Droplets, Ruler, Waves, Layers } from 'lucide-react';
import { formatNumber } from '@/utils/fdp/formatting';
import { planReservesP50 } from '@/utils/fdp/fdpCalculations';

const StatCard = ({ label, value, unit, icon: Icon, color }) => (
    <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 flex items-center justify-between">
        <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{label}</div>
            <div className="flex items-baseline gap-1 mt-1">
                <span className={`text-xl font-bold text-${color}-400`}>{value || '-'}</span>
                <span className="text-xs text-slate-500">{unit}</span>
            </div>
        </div>
        <div className={`p-2 rounded-full bg-${color}-500/10`}>
            <Icon className={`w-5 h-5 text-${color}-500`} />
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
                color="green" 
            />
            <StatCard 
                label="Field Area" 
                value={data.fieldArea} 
                unit="km²" 
                icon={Ruler} 
                color="blue" 
            />
            <StatCard 
                label="Water Depth" 
                value={data.waterDepth} 
                unit="m" 
                icon={Waves} 
                color="cyan" 
            />
             <StatCard 
                label="Reservoir Pressure" 
                value={formatNumber(subsurface?.reservoirPressure, 0)} 
                unit="psi" 
                icon={Layers} 
                color="orange" 
            />
        </div>
    );
};

export default FieldStatistics;