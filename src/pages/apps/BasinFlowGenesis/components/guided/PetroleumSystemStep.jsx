import React from 'react';
import { useGuidedMode } from '../../contexts/GuidedModeContext';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Droplet, Layers, Shield } from 'lucide-react';

const PetroleumSystemStep = () => {
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

    // Calculate summary
    const sourceCount = layers.filter(l => l.sourceRock?.isSource).length;
    const resCount = layers.filter(l => ['sandstone', 'limestone'].includes(l.lithology)).length; // Simple heuristic for now
    const sealCount = layers.filter(l => ['shale', 'salt'].includes(l.lithology)).length;

    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-pl-text mb-2">Petroleum System Elements</h2>
                    <p className="text-pl-muted">Identify source rocks and define their geochemical properties.</p>
                </div>
                
                <div className="flex gap-4 text-xs text-pl-muted bg-pl-surface p-2 rounded-lg border border-pl-border">
                    <div className="flex items-center gap-2">
                        <Droplet className={`w-4 h-4 ${sourceCount > 0 ? 'text-pl-primary-text' : 'text-pl-muted'}`} />
                        <span>{sourceCount} Source</span>
                    </div>
                    <div className="w-px h-4 bg-pl-border" />
                    <div className="flex items-center gap-2">
                        <Layers className={`w-4 h-4 ${resCount > 0 ? 'text-pl-primary-text' : 'text-pl-muted'}`} />
                        <span>{resCount} Reservoir</span>
                    </div>
                    <div className="w-px h-4 bg-pl-border" />
                    <div className="flex items-center gap-2">
                        <Shield className={`w-4 h-4 ${sealCount > 0 ? 'text-pl-primary-text' : 'text-pl-muted'}`} />
                        <span>{sealCount} Seal</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-2">
                <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-bold text-pl-muted border-b border-pl-border mb-2 sticky top-0 bg-pl-bg z-10">
                    <div className="col-span-3">Layer</div>
                    <div className="col-span-2 text-center">Is Source?</div>
                    <div className="col-span-7 text-center">Source Properties</div>
                </div>

                {layers.map((layer) => (
                    <div key={layer.id} className="grid grid-cols-12 gap-4 items-center p-3 bg-pl-surface rounded border border-pl-border hover:border-pl-border-strong transition-colors">
                        <div className="col-span-3 overflow-hidden">
                            <div className="font-medium text-sm text-pl-text truncate" title={layer.name}>{layer.name}</div>
                            <div className="text-[10px] text-pl-muted capitalize">{layer.lithology}</div>
                        </div>

                        <div className="col-span-2 flex justify-center">
                            <Checkbox 
                                checked={layer.sourceRock?.isSource || false}
                                onCheckedChange={(checked) => toggleSource(layer, checked)}
                            />
                        </div>

                        <div className="col-span-7">
                            {layer.sourceRock?.isSource ? (
                                <div className="grid grid-cols-3 gap-3 animate-in fade-in zoom-in-95 duration-200">
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
                                        <label className="text-[9px] text-pl-muted block mb-1">Kerogen Type</label>
                                        <Select 
                                            value={layer.sourceRock.kerogen} 
                                            onValueChange={(v) => updateSourceProps(layer, 'kerogen', v)}
                                        >
                                            <SelectTrigger className="h-7 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Type I">Type I (Oil)</SelectItem>
                                                <SelectItem value="Type II">Type II (Oil/Gas)</SelectItem>
                                                <SelectItem value="Type III">Type III (Gas)</SelectItem>
                                                <SelectItem value="Type IV">Type IV (Inert)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                     <div>
                                        <label className="text-[9px] text-pl-muted block mb-1">HI (mg/g)</label>
                                        <Input 
                                            type="number" 
                                            className="h-7 text-xs"
                                            value={layer.sourceRock.hi || 400}
                                            onChange={(e) => updateSourceProps(layer, 'hi', parseFloat(e.target.value))}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex items-center justify-center border-2 border-dashed border-pl-border rounded bg-pl-surface">
                                    <span className="text-[10px] text-pl-muted italic">Not selected as source</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PetroleumSystemStep;