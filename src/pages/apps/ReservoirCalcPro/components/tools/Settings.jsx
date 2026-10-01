import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2 } from 'lucide-react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { useReservoirSettings, RESOLUTION_OPTIONS, COLORSCALE_OPTIONS, INTERPOLATION_OPTIONS } from '../../hooks/useReservoirSettings';
import { effectiveGridding } from '../../services/griddingSettings';

// Real, persisted preferences. Each control writes to localStorage immediately and
// is consumed by the app (no dead "Save Changes" button).
const Settings = () => {
    const { state, setUnitSystem, setGridding } = useReservoirCalc();
    const [settings, update] = useReservoirSettings();
    // U2-013: the gridding is the project's once it is saved; a change here
    // updates the project (and the browser default for new projects)
    const grid = effectiveGridding(state.gridding, settings);
    const setGrid = (patch) => {
        update(patch);
        if (state.project?.id || state.gridding) setGridding({ gridResolution: grid.gridResolution, interpolationMethod: grid.interpolationMethod, ...patch });
    };

    return (
        <div className="max-w-3xl mx-auto w-full space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-pl-text">Settings</h2>
                <span className="text-[11px] text-pl-success-text flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Saved automatically
                </span>
            </div>

            <Card>
                <CardHeader><CardTitle className="text-pl-text text-sm">Defaults</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-pl-text">Unit system for this workspace</Label>
                            <p className="text-xs text-pl-muted">New projects start from your Suite units (the Units page). Saved projects keep the units they were saved with.</p>
                        </div>
                        <Select
                            value={state.unitSystem || 'field'}
                            onValueChange={(v) => setUnitSystem(v)}
                        >
                            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="field">Field (Oilfield)</SelectItem>
                                <SelectItem value="metric">Metric (SI)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-pl-text">Default Map Colour Scale</Label>
                            <p className="text-xs text-pl-muted">Colour map for the structure surface (2D &amp; 3D).</p>
                        </div>
                        <Select value={settings.defaultColorscale} onValueChange={(v) => update({ defaultColorscale: v })}>
                            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {COLORSCALE_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle className="text-pl-text text-sm">Calculation</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-xs text-pl-muted" data-testid="rcp-gridding-source">
                        {grid.source === 'project'
                            ? `This project's gridding (saved with it): ${grid.gridResolution} cells per axis, ${grid.interpolationMethod === 'kriging' ? 'ordinary kriging' : 'inverse distance'}. Any machine that opens the project uses it.`
                            : state.project?.id
                                ? 'This project was saved before gridding was stored, so this browser\'s setting applies. Save the project to keep it with the project.'
                                : 'New project: this browser\'s setting applies and is saved with the project.'}
                    </p>
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-pl-text">Grid Resolution</Label>
                            <p className="text-xs text-pl-muted">Cells per axis for contact-based volumetrics. Higher = more accurate, slower.</p>
                        </div>
                        <Select value={String(grid.gridResolution)} onValueChange={(v) => setGrid({ gridResolution: parseInt(v, 10) })}>
                            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {RESOLUTION_OPTIONS.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label} ({o.value}²)</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-pl-text">Surface Interpolation</Label>
                            <p className="text-xs text-pl-muted">Method for gridding scattered surface points (maps, 3D &amp; contact volumetrics).</p>
                        </div>
                        <Select value={grid.interpolationMethod} onValueChange={(v) => setGrid({ interpolationMethod: v })}>
                            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {INTERPOLATION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-pl-text">Auto-save after each run</Label>
                            <p className="text-xs text-pl-muted">Re-save an already-saved project when a calculation completes.</p>
                        </div>
                        <Switch checked={settings.autoSave} onCheckedChange={(v) => update({ autoSave: v })} />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default Settings;
