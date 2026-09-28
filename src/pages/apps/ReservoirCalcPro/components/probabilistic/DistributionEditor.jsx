
import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import NumberField from '../common/NumberField';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { DistributionManager } from '../../services/DistributionManager';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE } from '@/utils/chartTheme';

const fmtTick = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (Math.abs(n) >= 10) return n.toFixed(1);
    return n.toFixed(2);
};

const DistributionEditor = ({ label, parameterKey, distribution, onChange, unit }) => {
    // PDF preview points for the current parameters (Petrolord chart template).
    const previewData = useMemo(
        () => (distribution.type === 'constant' ? [] : DistributionManager.getPreviewData(distribution, 60)),
        [distribution],
    );

    const handleTypeChange = (type) => {
        const newDist = DistributionManager.createDistribution(type);
        if (type === 'constant' && distribution.mean) newDist.value = distribution.mean;
        if (distribution.type === 'constant' && type !== 'constant') {
            newDist.mean = distribution.value;
            newDist.mode = distribution.value;
            newDist.min = distribution.value * 0.9;
            newDist.max = distribution.value * 1.1;
        }
        onChange(parameterKey, newDist);
    };

    const handleParamChange = (key, val) => {
        onChange(parameterKey, { ...distribution, [key]: val });
    };

    return (
        <Card className="p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-pl-text">{label} <span className="text-pl-muted font-normal">({unit})</span></Label>
                <Select value={distribution.type} onValueChange={handleTypeChange}>
                    <SelectTrigger className="h-6 w-[100px] text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="triangular">Triangular</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="lognormal">Lognormal</SelectItem>
                        <SelectItem value="uniform">Uniform</SelectItem>
                        <SelectItem value="constant">Constant</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {distribution.type === 'triangular' && (
                    <>
                        <div className="space-y-1"><Label className="text-[10px] text-pl-muted">Min</Label><NumberField className="h-6 text-xs" value={distribution.min} onCommit={v=>handleParamChange('min', v)}/></div>
                        <div className="space-y-1"><Label className="text-[10px] text-pl-muted">Mode</Label><NumberField className="h-6 text-xs" value={distribution.mode} onCommit={v=>handleParamChange('mode', v)}/></div>
                        <div className="space-y-1"><Label className="text-[10px] text-pl-muted">Max</Label><NumberField className="h-6 text-xs" value={distribution.max} onCommit={v=>handleParamChange('max', v)}/></div>
                    </>
                )}
                {(distribution.type === 'normal' || distribution.type === 'lognormal') && (
                    <>
                        <div className="col-span-1 space-y-1"><Label className="text-[10px] text-pl-muted">Mean</Label><NumberField className="h-6 text-xs" value={distribution.mean} onCommit={v=>handleParamChange('mean', v)}/></div>
                        <div className="col-span-1 space-y-1"><Label className="text-[10px] text-pl-muted">StdDev</Label><NumberField className="h-6 text-xs" value={distribution.stdDev} onCommit={v=>handleParamChange('stdDev', v)}/></div>
                    </>
                )}
                {distribution.type === 'uniform' && (
                    <>
                        <div className="col-span-1.5 space-y-1"><Label className="text-[10px] text-pl-muted">Min</Label><NumberField className="h-6 text-xs" value={distribution.min} onCommit={v=>handleParamChange('min', v)}/></div>
                        <div className="col-span-1.5 space-y-1"><Label className="text-[10px] text-pl-muted">Max</Label><NumberField className="h-6 text-xs" value={distribution.max} onCommit={v=>handleParamChange('max', v)}/></div>
                    </>
                )}
                {distribution.type === 'constant' && (
                    <div className="col-span-3 space-y-1"><Label className="text-[10px] text-pl-muted">Value</Label><NumberField className="h-6 text-xs" value={distribution.value} onCommit={v=>handleParamChange('value', v)}/></div>
                )}
            </div>

            {distribution.type !== 'constant' && previewData.length > 1 && (
                <div className="rounded-lg overflow-hidden border border-pl-border">
                    <ChartFrame height={90}>
                        <AreaChart data={previewData} margin={{ top: 8, right: 10, bottom: 0, left: 10 }}>
                            <CartesianGrid {...GRID_STYLE} vertical={false} />
                            <XAxis
                                dataKey="x"
                                stroke={CHART_COLORS.axisLine}
                                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.annotationFontSize }}
                                tickFormatter={fmtTick}
                                interval="preserveStartEnd"
                                minTickGap={40}
                            />
                            <YAxis hide />
                            <Area type="monotone" dataKey="y" stroke="#2563eb" strokeWidth={1.5} fill="#2563eb" fillOpacity={0.12} isAnimationActive={false} />
                        </AreaChart>
                    </ChartFrame>
                </div>
            )}
        </Card>
    );
};

export default DistributionEditor;
