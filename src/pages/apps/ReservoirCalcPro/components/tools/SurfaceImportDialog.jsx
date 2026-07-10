import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { UploadCloud, FileText, Check, AlertCircle, AlertTriangle, XCircle, Waves, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { SurfaceParser, SurfaceParseError } from '../../services/SurfaceParser';
// Cross-app handoff: surfaces Seismolord published to seismic_exported_surfaces
// (XYZ text in Storage). Same parse path as a manual upload from here on.
import { listExportedSurfaces, downloadExportedSurface } from '@/pages/apps/Seismolord/services/exportsService';

const SurfaceImportDialog = ({ open, onOpenChange, onImport }) => {
    const { toast } = useToast();
    const [step, setStep] = useState(1);
    const [importData, setImportData] = useState({
        name: '',
        format: 'xyz',
        rawData: '',
        file: null,
        xyUnit: 'm',            // horizontal + vertical coordinate unit of the file
        zConvention: 'elevation', // 'elevation' = Z negative downward; 'depth' = Z positive downward (TVDSS)
        crs: ''                 // coordinate reference system, e.g. "EPSG:32631"; auto-detected when the file carries it
    });
    const [isParsing, setIsParsing] = useState(false);
    // Persistent, in-dialog feedback so a bad upload never fails silently.
    // `error` = a hard, blocking problem ({title, message, guidance}).
    // `pending` = a parsed surface held back for confirmation because it triggered
    //             non-fatal quality warnings the user should see first.
    const [error, setError] = useState(null);
    const [pending, setPending] = useState(null); // { surface, warnings }
    // Seismolord handoff source
    const [seismolordSurfaces, setSeismolordSurfaces] = useState(null);
    const [fetchingHandoffId, setFetchingHandoffId] = useState(null);

    const resetFeedback = () => { setError(null); setPending(null); };

    useEffect(() => {
        if (!open) return;
        listExportedSurfaces()
            .then(setSeismolordSurfaces)
            .catch(() => setSeismolordSurfaces([]));   // table empty/unreachable: hide the section
    }, [open]);

    const loadSeismolordSurface = async (row) => {
        setFetchingHandoffId(row.id);
        resetFeedback();
        try {
            const text = await downloadExportedSurface(row);
            const file = new File([text], `${row.name.replace(/[^\w-]+/g, '_')}.xyz`, { type: 'text/plain' });
            setImportData(prev => ({
                ...prev,
                file,
                rawData: text,
                name: row.name,
                format: 'xyz',
                xyUnit: 'm',                 // Seismolord exports XY in metres
                zConvention: 'elevation',    // z negative downward
            }));
            toast({ title: 'Surface loaded from Seismolord', description: row.name });
        } catch (e) {
            setError({ title: 'Could not load Seismolord surface', message: e.message, guidance: [] });
        } finally {
            setFetchingHandoffId(null);
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            resetFeedback();
            setImportData({ ...importData, file, name: file.name.split('.')[0] });
            const ext = file.name.split('.').pop().toLowerCase();
            const reader = new FileReader();
            reader.onload = (ev) => {
                const raw = ev.target.result;
                // Prefill CRS if the file self-describes one; the user can still override.
                const detected = SurfaceParser.detectCrs(raw, ext);
                setImportData(prev => ({ ...prev, rawData: raw, crs: prev.crs || detected || '' }));
            };
            reader.readAsText(file);
        }
    };

    const readFileText = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.onerror = () => reject(new Error("Could not read file."));
        reader.readAsText(file);
    });

    // Turn a successful parse into the surface object the app consumes.
    const buildSurface = (points) => {
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        const zValues = points.map(p => p.z);
        const minZ = Math.min(...zValues);
        const maxZ = Math.max(...zValues);
        const avgZ = zValues.reduce((s, v) => s + v, 0) / zValues.length;
        // Bounding-box extent as a first-order area estimate; the volume engine
        // reads estimatedArea/avgZ for its surface + hybrid methods.
        const estimatedArea = Math.abs(
            (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
        );

        return {
            id: crypto.randomUUID(),
            name: importData.name || 'Imported Surface',
            format: importData.format,
            points: points.slice(0, 5000),
            minZ,
            maxZ,
            avgZ,
            estimatedArea,
            pointCount: points.length,
            // Geometry metadata consumed by ContactVolumetricsEngine so areas and
            // depths convert to physical units correctly.
            xyUnit: importData.xyUnit,
            depthUnit: importData.xyUnit,
            zConvention: importData.zConvention,
            // Coordinate reference system (optional). Carried for provenance and
            // cross-app hand-off; a blank value means "unspecified / local grid".
            crs: (importData.crs || '').trim() || null,
            createdAt: new Date().toISOString()
        };
    };

    const finalizeImport = (surface) => {
        onImport(surface);
        onOpenChange(false);
        setStep(1);
        resetFeedback();
        setImportData(prev => ({ name: '', format: 'xyz', rawData: '', file: null, xyUnit: prev.xyUnit, zConvention: prev.zConvention, crs: '' }));
    };

    const parseData = async () => {
        setIsParsing(true);
        resetFeedback();
        try {
            let points = null;
            let warnings = [];

            // Prefer the multi-format parser (ESRI ASCII grid, ZMap+, GeoJSON, and
            // robust delimited CSV/DAT/XYZ). It raises a SurfaceParseError with a
            // plain-language explanation when the file clearly isn't a surface — we
            // show that to the user rather than silently limping on with bad data.
            if (importData.file) {
                try {
                    const parsed = await SurfaceParser.parse(importData.file);
                    if (parsed?.points?.length >= 3) {
                        points = parsed.points;
                        warnings = parsed.warnings || [];
                    }
                } catch (err) {
                    // A definitive "this is the wrong kind of file" verdict: stop and
                    // explain. Only genuinely unexpected errors fall through to the
                    // lenient inline reader below.
                    if (err instanceof SurfaceParseError) {
                        setError({ title: err.title, message: err.message, guidance: err.guidance || [] });
                        toast({ variant: 'destructive', title: err.title, description: err.message });
                        return;
                    }
                    console.warn('Primary surface parser failed unexpectedly, trying simple reader:', err);
                }
            }

            if (!points) {
                // Read straight from the File rather than trusting importData.rawData:
                // that state is filled asynchronously by handleFileChange's reader, so a
                // quick click here can race ahead of it and see an empty string.
                let raw = importData.rawData;
                if ((!raw || !raw.trim()) && importData.file) {
                    raw = await readFileText(importData.file);
                }
                const lines = (raw || '').split('\n').filter(l => l.trim().length > 0);
                points = [];
                for (const line of lines) {
                    const parts = line.trim().split(/[\s,]+/);
                    const x = parseFloat(parts[0]);
                    const y = parseFloat(parts[1]);
                    const z = parseFloat(parts[2]);
                    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) points.push({ x, y, z });
                }
            }

            if (!points || points.length < 3) {
                setError({
                    title: "We couldn't read a surface from this file",
                    message: `"${importData.file?.name || 'The file'}" doesn't contain enough valid X Y Z rows to build a surface.`,
                    guidance: [
                        'A surface needs at least three rows of: X (easting), Y (northing), Z (depth).',
                        'Accepted formats: XYZ, CSV, DAT, ESRI ASCII grid (.asc), ZMap+, CPS-3, GeoJSON.',
                        'Re-export the surface as "XYZ points" or "ASCII grid" from your mapping package.',
                    ],
                });
                return;
            }

            const surface = buildSurface(points);
            if (warnings.length) {
                // Soft problems (too few points, collinear, all-flat…). Let the user
                // see them and decide whether to proceed rather than guessing.
                surface.warnings = warnings;
                setPending({ surface, warnings });
                return;
            }

            finalizeImport(surface);

        } catch (err) {
            console.error(err);
            setError({
                title: 'Import failed',
                message: err?.message || 'Something went wrong while reading the file.',
                guidance: ['Please check the file and try again, or try a different export format.'],
            });
            toast({ variant: 'destructive', title: 'Import failed', description: err?.message || 'Could not read the surface file.' });
        } finally {
            setIsParsing(false);
        }
    };

    // FIX: Use simple conditionals instead of mapping step objects to avoid "isActive" errors
    // This is much safer than a complex stepper component
    const renderStepContent = () => {
        if (step === 1) {
            return (
                <div className="space-y-4 py-4">
                    <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer relative">
                        <input 
                            type="file" 
                            className="absolute inset-0 opacity-0 cursor-pointer" 
                            onChange={handleFileChange}
                            accept=".txt,.csv,.dat,.xyz,.asc,.grd,.json,.geojson,.zmap,.dat"
                        />
                        <UploadCloud className="w-12 h-12 mx-auto text-slate-500 mb-2" />
                        <p className="text-sm text-slate-300 font-medium">Click to upload or drag and drop</p>
                        <p className="text-xs text-slate-500 mt-1">Supported: XYZ, CSV, CPS-3</p>
                    </div>
                    
                    {importData.file && (
                        <div className="flex items-center p-2 bg-slate-800 rounded border border-slate-700">
                            <FileText className="w-4 h-4 text-blue-400 mr-2" />
                            <span className="text-sm truncate flex-1">{importData.file.name}</span>
                            <Check className="w-4 h-4 text-emerald-500" />
                        </div>
                    )}

                    {/* Surfaces published by Seismolord (seismic_exported_surfaces) */}
                    {seismolordSurfaces && seismolordSurfaces.length > 0 && (
                        <div className="rounded-lg border border-cyan-900/60 bg-cyan-950/20 p-3">
                            <div className="flex items-center text-sm text-cyan-300 font-medium mb-2">
                                <Waves className="w-4 h-4 mr-2" />
                                From Seismolord
                            </div>
                            <ul className="space-y-1 max-h-32 overflow-y-auto">
                                {seismolordSurfaces.map((s) => (
                                    <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                                        <div className="min-w-0">
                                            <span className="text-slate-200 truncate block">{s.name}</span>
                                            <span className="text-[11px] text-slate-500">
                                                {s.domain === 'depth_ft' ? 'depth ft' : 'TWT ms'} ·{' '}
                                                {new Date(s.created_at).toLocaleString()}
                                            </span>
                                        </div>
                                        <Button
                                            size="sm" variant="outline"
                                            className="shrink-0 border-cyan-700/60 text-cyan-300"
                                            disabled={fetchingHandoffId === s.id}
                                            onClick={() => loadSeismolordSurface(s)}
                                        >
                                            {fetchingHandoffId === s.id
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                : 'Use'}
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Hard error — the upload can't be used. Explains why, in plain terms. */}
                    {error && (
                        <div className="rounded-lg border border-red-800/60 bg-red-950/40 p-3">
                            <div className="flex items-start gap-2">
                                <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-red-300">{error.title}</p>
                                    <p className="text-xs text-red-200/80 mt-0.5">{error.message}</p>
                                    {error.guidance?.length > 0 && (
                                        <ul className="mt-2 space-y-1 text-[11px] text-red-200/70 list-disc pl-4">
                                            {error.guidance.map((g, i) => <li key={i}>{g}</li>)}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Soft warnings — parsed OK but the surface looks suspect. */}
                    {pending && (
                        <div className="rounded-lg border border-amber-700/60 bg-amber-950/30 p-3">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-amber-300">Check this surface before importing</p>
                                    <ul className="mt-1.5 space-y-1 text-[11px] text-amber-200/80 list-disc pl-4">
                                        {pending.warnings.map((w, i) => <li key={i}>{w}</li>)}
                                    </ul>
                                    <p className="text-[11px] text-amber-200/60 mt-2">
                                        You can import it anyway, or pick a different file.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Surface Name</Label>
                        <Input 
                            value={importData.name} 
                            onChange={e => setImportData({...importData, name: e.target.value})}
                            placeholder="e.g. Top Reservoir"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Format</Label>
                        <Tabs value={importData.format} onValueChange={v => setImportData({...importData, format: v})}>
                            <TabsList className="grid grid-cols-3 w-full">
                                <TabsTrigger value="xyz">XYZ (Grid)</TabsTrigger>
                                <TabsTrigger value="cps3">CPS-3</TabsTrigger>
                                <TabsTrigger value="zmap">ZMap</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>Coordinate Units</Label>
                            <Tabs value={importData.xyUnit} onValueChange={v => setImportData({...importData, xyUnit: v})}>
                                <TabsList className="grid grid-cols-2 w-full">
                                    <TabsTrigger value="m">Meters</TabsTrigger>
                                    <TabsTrigger value="ft">Feet</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                        <div className="space-y-2">
                            <Label>Depth Convention</Label>
                            <Tabs value={importData.zConvention} onValueChange={v => setImportData({...importData, zConvention: v})}>
                                <TabsList className="grid grid-cols-2 w-full">
                                    <TabsTrigger value="elevation" title="Z negative downward">Elevation (−)</TabsTrigger>
                                    <TabsTrigger value="depth" title="Z positive downward (TVDSS)">Depth (+)</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-500 -mt-1">
                        Used to convert areas &amp; depths to physical volumes. XY&nbsp;=&nbsp;Z unit; contacts (OWC/GOC) must use the same convention.
                    </p>

                    <div className="space-y-2">
                        <Label>Coordinate Reference System <span className="text-slate-500 font-normal">(optional)</span></Label>
                        <Input
                            value={importData.crs}
                            onChange={e => setImportData({ ...importData, crs: e.target.value })}
                            placeholder="e.g. EPSG:32631 (WGS 84 / UTM 31N)"
                        />
                        <p className="text-[11px] text-slate-500 -mt-1">
                            Auto-detected from GeoJSON/gridded files when present. Recorded for provenance &amp; cross-app hand-off; leave blank for a local grid.
                        </p>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Import Surface</DialogTitle>
                </DialogHeader>
                
                {renderStepContent()}

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    {pending ? (
                        <Button
                            onClick={() => finalizeImport(pending.surface)}
                            className="bg-amber-600 hover:bg-amber-700"
                        >
                            Import Anyway
                        </Button>
                    ) : (
                        <Button
                            onClick={parseData}
                            disabled={!importData.file || !importData.name || isParsing}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            {isParsing ? "Importing..." : "Import Surface"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default SurfaceImportDialog;