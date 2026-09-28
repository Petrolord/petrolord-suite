import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Layers, Hexagon, Map as MapIcon, FlaskConical, Trash2, Download } from 'lucide-react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { useToast } from '@/components/ui/use-toast';
import { FLUID_PRESETS } from '../../services/FluidPropertyLibrary';

// Real data manager — an inventory of everything actually in the workspace
// (surfaces, AOIs, property maps) with working actions, plus the fluid-property
// library you can apply straight into the inputs.
const DataManager = () => {
    const { state, deleteSurface, deleteAOI, deleteMap, updateInputs } = useReservoirCalc();
    const { toast } = useToast();

    const surfaces = Object.values(state.surfaces || {});
    const aois = state.aois || [];
    const maps = state.maps || [];

    const exportSurfaceXYZ = (s) => {
        const body = (s.points || []).map((p) => `${p.x} ${p.y} ${p.z}`).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
        a.download = `${(s.name || 'surface').replace(/\s+/g, '_')}.xyz`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const applyPreset = (kind, preset) => {
        if (kind === 'oil') {
            updateInputs({ fvf: preset.bo, api: preset.api, gasGrav: preset.gasGravity, temperature: preset.temp });
        } else {
            updateInputs({ bg: preset.bg, gasGrav: preset.gasGravity, temperature: preset.temp });
        }
        toast({ title: 'Preset applied', description: `${preset.name} written to inputs.` });
    };

    const Empty = ({ children }) => <div className="p-3 text-center text-xs text-pl-muted italic">{children}</div>;

    return (
        <div className="h-full flex flex-col gap-4 overflow-y-auto">
            <h2 className="text-xl font-bold text-pl-text">Data Manager</h2>

            <div className="grid grid-cols-3 gap-3">
                {[['Surfaces', surfaces.length, Layers, 'text-pl-muted'], ['AOIs', aois.length, Hexagon, 'text-pl-muted'], ['Property Maps', maps.length, MapIcon, 'text-pl-muted']].map(([label, n, Icon, c]) => (
                    <Card key={label}>
                        <CardContent className="p-3 flex items-center gap-3">
                            <Icon className={`w-5 h-5 ${c}`} />
                            <div><div className="text-lg font-bold text-pl-text leading-none">{n}</div><div className="text-[10px] text-pl-muted uppercase tracking-wide">{label}</div></div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Surfaces */}
            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-pl-text text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-pl-muted" /> Surfaces</CardTitle></CardHeader>
                <CardContent className="p-0">
                    {surfaces.length === 0 ? <Empty>No surfaces imported.</Empty> : surfaces.map((s) => (
                        <div key={s.id} className="flex items-center gap-3 px-4 py-2 border-t border-pl-border text-xs">
                            <div className="flex-1 min-w-0">
                                <div className="text-pl-text font-medium truncate">{s.name}</div>
                                <div className="text-pl-muted font-mono">
                                    {(s.pointCount ?? s.points?.length ?? 0).toLocaleString()} pts · z [{Math.round(s.minZ)}…{Math.round(s.maxZ)}] · {s.xyUnit || '?'}/{s.zConvention || 'elevation'}{s.crs ? ` · ${s.crs}` : ''}
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-text" title="Export XYZ" onClick={() => exportSurfaceXYZ(s)}><Download className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-danger-text" title="Delete" onClick={() => deleteSurface(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                    ))}
                </CardContent>
            </Card>

            {/* AOIs + Maps side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-pl-text text-sm flex items-center gap-2"><Hexagon className="w-4 h-4 text-pl-muted" /> Areas of Interest</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        {aois.length === 0 ? <Empty>No AOIs drawn.</Empty> : aois.map((a) => (
                            <div key={a.id} className="flex items-center gap-2 px-4 py-2 border-t border-pl-border text-xs">
                                <div className="flex-1 min-w-0"><div className="text-pl-text truncate">{a.name}</div><div className="text-pl-muted font-mono">{a.vertices?.length || 0} vertices · area {Math.round(a.area || 0).toLocaleString()}</div></div>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-danger-text" onClick={() => deleteAOI(a.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-pl-text text-sm flex items-center gap-2"><MapIcon className="w-4 h-4 text-pl-muted" /> Property Maps</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        {maps.length === 0 ? <Empty>No maps generated.</Empty> : maps.map((m) => (
                            <div key={m.id} className="flex items-center gap-2 px-4 py-2 border-t border-pl-border text-xs">
                                <div className="flex-1 min-w-0"><div className="text-pl-text truncate">{m.name}</div><div className="text-pl-muted font-mono">{m.unit || m.type}</div></div>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-danger-text" onClick={() => deleteMap(m.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>

            {/* Fluid property library */}
            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-pl-text text-sm flex items-center gap-2"><FlaskConical className="w-4 h-4 text-pl-muted" /> Fluid Property Library</CardTitle></CardHeader>
                <CardContent className="p-0">
                    {Object.entries(FLUID_PRESETS.oil).map(([k, p]) => (
                        <div key={`oil-${k}`} className="flex items-center gap-2 px-4 py-2 border-t border-pl-border text-xs">
                            <div className="flex-1 min-w-0"><div className="text-pl-text truncate">{p.name}</div><div className="text-pl-muted font-mono">Bo {p.bo} · {p.api}°API · γg {p.gasGravity} · {p.temp}°F</div></div>
                            <Badge variant="neutral" className="text-[9px]">OIL</Badge>
                            <Button variant="ghost" size="sm" className="h-7 text-[11px] text-pl-primary-text hover:text-pl-primary-text-hover" onClick={() => applyPreset('oil', p)}>Apply</Button>
                        </div>
                    ))}
                    {Object.entries(FLUID_PRESETS.gas).map(([k, p]) => (
                        <div key={`gas-${k}`} className="flex items-center gap-2 px-4 py-2 border-t border-pl-border text-xs">
                            <div className="flex-1 min-w-0"><div className="text-pl-text truncate">{p.name}</div><div className="text-pl-muted font-mono">Bg {p.bg} · γg {p.gasGravity} · Z {p.zFactor} · {p.temp}°F</div></div>
                            <Badge variant="neutral" className="text-[9px]">GAS</Badge>
                            <Button variant="ghost" size="sm" className="h-7 text-[11px] text-pl-primary-text hover:text-pl-primary-text-hover" onClick={() => applyPreset('gas', p)}>Apply</Button>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
};

export default DataManager;
