import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2 } from 'lucide-react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { useReservoirSettings, RESOLUTION_OPTIONS, COLORSCALE_OPTIONS, INTERPOLATION_OPTIONS } from '../../hooks/useReservoirSettings';

// Real, persisted preferences. Each control writes to localStorage immediately and
// is consumed by the app (no dead "Save Changes" button).
const Settings = () => {
    const { setUnitSystem } = useReservoirCalc();
    const [settings, update] = useReservoirSettings();

    return (
        <div className="max-w-3xl mx-auto w-full space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Settings</h2>
                <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Saved automatically
                </span>
            </div>

            <Card className="bg-slate-900 border-slate-800">
                <CardHeader><CardTitle className="text-white text-sm">Defaults</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-slate-300">Default Unit System</Label>
                            <p className="text-xs text-slate-500">Applied to the current workspace and new projects.</p>
                        </div>
                        <Select
                            value={settings.defaultUnitSystem}
                            onValueChange={(v) => { update({ defaultUnitSystem: v }); setUnitSystem(v); }}
                        >
                            <SelectTrigger className="w-[180px] bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="field">Field (Oilfield)</SelectItem>
                                <SelectItem value="metric">Metric (SI)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-slate-300">Default Map Colour Scale</Label>
                            <p className="text-xs text-slate-500">Colour map for the structure surface (2D &amp; 3D).</p>
                        </div>
                        <Select value={settings.defaultColorscale} onValueChange={(v) => update({ defaultColorscale: v })}>
                            <SelectTrigger className="w-[180px] bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {COLORSCALE_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
                <CardHeader><CardTitle className="text-white text-sm">Calculation</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-slate-300">Grid Resolution</Label>
                            <p className="text-xs text-slate-500">Cells per axis for contact-based volumetrics. Higher = more accurate, slower.</p>
                        </div>
                        <Select value={String(settings.gridResolution)} onValueChange={(v) => update({ gridResolution: parseInt(v, 10) })}>
                            <SelectTrigger className="w-[180px] bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {RESOLUTION_OPTIONS.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label} ({o.value}²)</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-slate-300">Surface Interpolation</Label>
                            <p className="text-xs text-slate-500">Method for gridding scattered surface points (maps, 3D &amp; contact volumetrics).</p>
                        </div>
                        <Select value={settings.interpolationMethod} onValueChange={(v) => update({ interpolationMethod: v })}>
                            <SelectTrigger className="w-[200px] bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {INTERPOLATION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-slate-300">Auto-save after each run</Label>
                            <p className="text-xs text-slate-500">Re-save an already-saved project when a calculation completes.</p>
                        </div>
                        <Switch checked={settings.autoSave} onCheckedChange={(v) => update({ autoSave: v })} />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default Settings;
