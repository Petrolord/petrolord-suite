import React from 'react';
import { useGuidedMode } from '../../contexts/GuidedModeContext';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const SourceReservoirSealStep = () => {
    const { wizardData, updateLayer } = useGuidedMode();
    const { layers } = wizardData;

    const toggleSource = (layer, checked) => {
        const sourceRock = checked 
            ? { isSource: true, toc: 2.0, kerogen: 'Type II', hi: 400 }
            : { isSource: false };
        updateLayer(layer.id, { sourceRock });
    };

    const updateSourceProps = (layer, key, value) => {
        if(!layer.sourceRock?.isSource) return;
        updateLayer(layer.id, { sourceRock: { ...layer.sourceRock, [key]: value } });
    };

    return (
        <div className="h-full flex flex-col">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-pl-text mb-2">Petroleum System Elements</h2>
                <p className="text-pl-muted">Identify which layers act as source rocks, reservoirs, or seals.</p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1">
                <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-bold text-pl-muted border-b border-pl-border mb-2">
                    <div className="col-span-3">Layer</div>
                    <div className="col-span-2 text-center">Source</div>
                    <div className="col-span-7">Source Properties</div>
                </div>

                {layers.map((layer) => (
                    <div key={layer.id} className="grid grid-cols-12 gap-4 items-center p-3 bg-pl-surface rounded border border-pl-border hover:border-pl-border-strong transition-colors">
                        <div className="col-span-3 font-medium text-sm text-pl-text truncate" title={layer.name}>
                            {layer.name}
                            <div className="text-[10px] text-pl-muted">{layer.lithology}</div>
                        </div>

                        <div className="col-span-2 flex justify-center">
                            <Checkbox 
                                checked={layer.sourceRock?.isSource || false}
                                onCheckedChange={(checked) => toggleSource(layer, checked)}
                            />
                        </div>

                        <div className="col-span-7">
                            {layer.sourceRock?.isSource ? (
                                <div className="grid grid-cols-3 gap-2 animate-in fade-in zoom-in-95 duration-200">
                                    <div>
                                        <label className="text-[9px] text-pl-muted block mb-1">TOC (%)</label>
                                        <Input 
                                            type="number" 
                                            className="h-7 text-xs"
                                            value={layer.sourceRock.toc}
                                            onChange={(e) => updateSourceProps(layer, 'toc', parseFloat(e.target.value))}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-pl-muted block mb-1">Kerogen</label>
                                        <Select 
                                            value={layer.sourceRock.kerogen} 
                                            onValueChange={(v) => updateSourceProps(layer, 'kerogen', v)}
                                        >
                                            <SelectTrigger className="h-7 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Type I">Type I</SelectItem>
                                                <SelectItem value="Type II">Type II</SelectItem>
                                                <SelectItem value="Type III">Type III</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                     <div>
                                        <label className="text-[9px] text-pl-muted block mb-1">HI</label>
                                        <Input 
                                            type="number" 
                                            className="h-7 text-xs"
                                            value={layer.sourceRock.hi || 400}
                                            onChange={(e) => updateSourceProps(layer, 'hi', parseFloat(e.target.value))}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex items-center justify-center">
                                    <span className="text-xs text-pl-muted italic">Not a source rock</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SourceReservoirSealStep;