import React, { useRef, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { UploadCloud, FileText, Check, AlertCircle, AlertTriangle, XCircle, Waves, Loader2, Layers } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { SurfaceParser, SurfaceParseError } from '../../services/SurfaceParser';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
// Cross-app handoff: surfaces Seismolord published to seismic_exported_surfaces
// (XYZ text in Storage). Same parse path as a manual upload from here on.
import { listExportedSurfaces, downloadExportedSurface } from '@/pages/apps/Seismolord/services/exportsService';
// Cross-app handoff (G4): surfaces Mapping & Surface Studio published to
// geo_surfaces (f32 grids). Bridged to XYZ via the byte-golden writeXYZ,
// then parsed on the same path — no filesystem round-trip.
import { listSurfaces, downloadSurfaceGrid } from '@/lib/surfacesRegistry';
import { surfaceDomainOf, DOMAIN_LABEL } from '@/lib/readDepthSurface';
// U1 (RCP-U1-002, 010, 011, 016): one door per source; see services/surfaceDoor.js
import { surfaceFromRegistryRow, seismolordExportUnits, pointsFromSurfaceFile, buildImportedSurface } from '../../services/surfaceDoor';

const SurfaceImportDialog = ({ open, onOpenChange, onImport, preselectId = null }) => {
    // EM5: the registry row a deep link asked for is loaded once it is listed
    const preselectedRef = useRef(null);
    const { toast } = useToast();
    const [step, setStep] = useState(1);
    const [importData, setImportData] = useState({
        name: '',
        format: 'xyz',
        rawData: '',
        file: null,
        xyUnit: 'm',            // horizontal coordinate unit of the file
        depthUnit: 'm',         // depth unit of the file (RCP-U1-011: no longer tied to XY)
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
    // a registry or Seismolord surface already read through its door
    const [ready, setReady] = useState(null);     // { surface, notes }
    // Seismolord handoff source
    const [seismolordSurfaces, setSeismolordSurfaces] = useState(null);
    const [fetchingHandoffId, setFetchingHandoffId] = useState(null);
    // Mapping & Surface Studio handoff source (geo_surfaces)
    const [mappingSurfaces, setMappingSurfaces] = useState(null);

    const resetFeedback = () => { setError(null); setPending(null); setReady(null); };

    // RC0: the registry reads go through the app backend (the harness
    // injects in-memory stores)
    const { backend } = useReservoirCalc();
    const surfacesApi = backend?.surfaces || { listSurfaces, downloadSurfaceGrid, listExportedSurfaces, downloadExportedSurface };
    useEffect(() => {
        if (!open) return;
        surfacesApi.listExportedSurfaces()
            .then(setSeismolordSurfaces)
            .catch(() => setSeismolordSurfaces([]));   // table empty/unreachable: hide the section
        surfacesApi.listSurfaces()
            .then(setMappingSurfaces)
            .catch(() => setMappingSurfaces([]));
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!open || !preselectId || !mappingSurfaces || preselectedRef.current === preselectId) return;
        const row = mappingSurfaces.find((s) => s.id === preselectId);
        if (!row) return;
        preselectedRef.current = preselectId;
        loadMappingSurface(row);
    }, [open, preselectId, mappingSurfaces]); // eslint-disable-line react-hooks/exhaustive-deps

    // geo_surfaces row -> the shared door (readDepthSurface): depth
    // structures only, metres elevation, the row's own XY frame and its
    // metres per unit, rotation honoured (RCP-U1-002). The row is refused
    // with the door's reason when it is time, an isochore or an attribute.
    const loadMappingSurface = async (row) => {
        setFetchingHandoffId(row.id);
        resetFeedback();
        try {
            const grid = await surfacesApi.downloadSurfaceGrid(row);
            const r = surfaceFromRegistryRow(row, grid);
            if (!r.ok) {
                setError({ title: 'This surface cannot be used for volumetrics', message: r.reason, guidance: [] });
                return;
            }
            setReady({ surface: r.surface, notes: r.notes, source: 'Mapping & Surface Studio' });
            // RC3: the card keeps the registry row for Open in Mapping / Earth Modeling
            setImportData(prev => ({ ...prev, name: row.name, file: null, registryId: row.id, registryName: row.name }));
        } catch (e) {
            setError({ title: 'Could not load mapped surface', message: e.message, guidance: [] });
        } finally {
            setFetchingHandoffId(null);
        }
    };

    // Seismolord's legacy exports: depth in feet over XY in metres (the
    // depth unit is now its own choice, so the XY stay coordinates in
    // their CRS); two-way time is refused (RCP-U1-010).
    const loadSeismolordSurface = async (row) => {
        setFetchingHandoffId(row.id);
        resetFeedback();
        try {
            const units = seismolordExportUnits(row);
            if (!units.ok) {
                setError({ title: 'This surface cannot be used for volumetrics', message: units.reason, guidance: [] });
                return;
            }
            const raw = await surfacesApi.downloadExportedSurface(row);
            const r = pointsFromSurfaceFile(raw);
            if (!r.ok) {
                setError({ title: 'Could not read the Seismolord surface', message: r.reason, guidance: [] });
                return;
            }
            const surface = buildImportedSurface(r.points, {
                name: row.name, format: 'seismolord', xyUnit: units.xyUnit, depthUnit: units.depthUnit,
                zConvention: 'elevation', notes: r.notes,
            });
            setReady({ surface, notes: r.notes, source: 'Seismolord' });
            setImportData(prev => ({ ...prev, name: row.name, file: null, registryId: null, registryName: null }));
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
            setImportData({ ...importData, file, name: file.name.split('.')[0], registryId: null, registryName: null });
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
    const buildSurface = (points, notes = []) => buildImportedSurface(points, {
        name: importData.name || 'Imported Surface',
        format: importData.format,
        xyUnit: importData.xyUnit,
        depthUnit: importData.depthUnit,
        zConvention: importData.zConvention,
        crs: importData.crs,
        registryId: importData.registryId,
        registryName: importData.registryName,
        notes,
    });

    const finalizeImport = (surface) => {
        onImport(surface);
        onOpenChange(false);
        setStep(1);
        resetFeedback();
        setImportData(prev => ({ name: '', format: 'xyz', rawData: '', file: null, xyUnit: prev.xyUnit, depthUnit: prev.depthUnit, zConvention: prev.zConvention, crs: '', registryId: null, registryName: null }));
    };

    const parseData = async () => {
        setIsParsing(true);
        resetFeedback();
        try {
            // A registry or Seismolord surface was already read through its door.
            if (ready) {
                finalizeImport({ ...ready.surface, name: importData.name || ready.surface.name });
                return;
            }
            let points = null;
            let warnings = [];
            let doorNotes = [];

            // U1 (RCP-U1-016): the shared surface file door first (Petrel
            // CPS-3, Kingdom ZMAP+, Irap, XYZ with headers, semicolons,
            // columns in any order, rotated lattices). It refuses TWT.
            if (importData.file) {
                const text = await readFileText(importData.file);
                const door = pointsFromSurfaceFile(text);
                if (door.ok) {
                    points = door.points;
                    doorNotes = door.notes;
                    if (door.hint?.zUnit && door.hint.zUnit !== importData.depthUnit) {
                        doorNotes.push(`The file header says depths are in ${door.hint.zUnit}, but the depth unit is set to ${importData.depthUnit}. Check the Depth unit before you import.`);
                        warnings.push(doorNotes[doorNotes.length - 1]);
                    }
                } else if (!door.fallback) {
                    setError({ title: "This file can't be used as a depth surface", message: door.reason, guidance: [] });
                    return;
                }
            }

            // Then the multi-format parser (ESRI ASCII grid, ZMap+, GeoJSON, and
            // robust delimited CSV/DAT/XYZ). It raises a SurfaceParseError with a
            // plain-language explanation when the file clearly isn't a surface — we
            // show that to the user rather than silently limping on with bad data.
            if (!points && importData.file) {
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

            const surface = buildSurface(points, doorNotes);
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
                    <div className="border-2 border-dashed border-pl-border rounded-lg p-8 text-center hover:border-pl-primary transition-colors cursor-pointer relative">
                        <input 
                            type="file" 
                            className="absolute inset-0 opacity-0 cursor-pointer" 
                            onChange={handleFileChange}
                            accept=".txt,.csv,.dat,.xyz,.asc,.grd,.json,.geojson,.zmap,.cps,.irap,.gri"
                        />
                        <UploadCloud className="w-12 h-12 mx-auto text-pl-muted mb-2" />
                        <p className="text-sm text-pl-text font-medium">Click to upload or drag and drop</p>
                        <p className="text-xs text-pl-muted mt-1">Supported: XYZ (any column order, headers), CSV, Petrel CPS-3, ZMAP+, Irap classic, ESRI ASCII, GeoJSON points</p>
                    </div>
                    
                    {importData.file && (
                        <div className="flex items-center p-2 bg-pl-sunken rounded border border-pl-border">
                            <FileText className="w-4 h-4 text-pl-muted mr-2" />
                            <span className="text-sm truncate flex-1">{importData.file.name}</span>
                            <Check className="w-4 h-4 text-pl-success-text" />
                        </div>
                    )}

                    {/* Surfaces published by Seismolord (seismic_exported_surfaces) */}
                    {seismolordSurfaces && seismolordSurfaces.length > 0 && (
                        <div className="rounded-lg border border-pl-border bg-pl-sunken p-3">
                            <div className="flex items-center text-sm text-pl-text font-medium mb-2">
                                <Waves className="w-4 h-4 mr-2" />
                                From Seismolord
                            </div>
                            <ul className="space-y-1 max-h-32 overflow-y-auto">
                                {seismolordSurfaces.map((s) => (
                                    <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                                        <div className="min-w-0">
                                            <span className="text-pl-text truncate block">{s.name}</span>
                                            <span className="text-[11px] text-pl-muted">
                                                {s.domain === 'depth_ft' ? 'depth ft' : 'TWT ms'} ·{' '}
                                                {new Date(s.created_at).toLocaleString()}
                                            </span>
                                        </div>
                                        <Button
                                            size="sm" variant="outline"
                                            className="shrink-0"
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

                    {/* Surfaces published by Mapping & Surface Studio (geo_surfaces) */}
                    {mappingSurfaces && mappingSurfaces.length > 0 && (
                        <div className="rounded-lg border border-pl-border bg-pl-sunken p-3">
                            <div className="flex items-center text-sm text-pl-text font-medium mb-2">
                                <Layers className="w-4 h-4 mr-2" />
                                From Mapping &amp; Surface Studio
                            </div>
                            <ul className="space-y-1 max-h-32 overflow-y-auto">
                                {mappingSurfaces.map((s) => (
                                    <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                                        <div className="min-w-0">
                                            <span className="text-pl-text truncate block">{s.name}</span>
                                            <span className="text-[11px] text-pl-muted" data-testid={`rcp-registry-domain-${s.name}`}>
                                                {surfaceDomainOf(s) === 'elevation' ? 'depth structure' : DOMAIN_LABEL[surfaceDomainOf(s)]} · {s.nx}×{s.ny}{s.xy_unit ? ` · XY ${s.xy_unit}` : ''}{s.z_unit ? ` · Z ${s.z_unit}` : ''} · {new Date(s.created_at).toLocaleString()}
                                            </span>
                                        </div>
                                        <Button
                                            size="sm" variant="outline"
                                            className="shrink-0"
                                            disabled={fetchingHandoffId === s.id}
                                            data-testid={`rcp-registry-use-${s.name}`}
                                            onClick={() => loadMappingSurface(s)}
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
                        <div className="rounded-lg border border-pl-danger/40 bg-pl-danger-bg p-3">
                            <div className="flex items-start gap-2">
                                <XCircle className="w-4 h-4 text-pl-danger-text mt-0.5 flex-shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-pl-danger-text">{error.title}</p>
                                    <p className="text-xs text-pl-danger-text mt-0.5">{error.message}</p>
                                    {error.guidance?.length > 0 && (
                                        <ul className="mt-2 space-y-1 text-[11px] text-pl-danger-text list-disc pl-4">
                                            {error.guidance.map((g, i) => <li key={i}>{g}</li>)}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* A registry or Seismolord surface read through its door: what was read */}
                    {ready && (
                        <div className="rounded-lg border border-pl-border bg-pl-surface p-3 text-[11px] text-pl-text" data-testid="rcp-import-ready">
                            <p className="font-semibold">{ready.surface.name} from {ready.source}</p>
                            <p className="text-pl-muted mt-0.5">
                                {ready.surface.pointCount.toLocaleString()} live nodes · depth {ready.surface.depthUnit}, elevation (negative below datum) · XY {ready.surface.xyUnit}{ready.surface.crs ? ` · ${ready.surface.crs}` : ' · no CRS'}
                            </p>
                            {ready.notes?.length > 0 && (
                                <ul className="mt-1 list-disc pl-4 text-pl-warning-text" data-testid="rcp-import-notes">
                                    {ready.notes.map((n, i) => <li key={i}>{n}</li>)}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* Soft warnings — parsed OK but the surface looks suspect. */}
                    {pending && (
                        <div className="rounded-lg border border-pl-warning/40 bg-pl-warning-bg p-3">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-pl-warning-text mt-0.5 flex-shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-pl-warning-text">Check this surface before importing</p>
                                    <ul className="mt-1.5 space-y-1 text-[11px] text-pl-warning-text list-disc pl-4">
                                        {pending.warnings.map((w, i) => <li key={i}>{w}</li>)}
                                    </ul>
                                    <p className="text-[11px] text-pl-warning-text mt-2">
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

                    {!ready && (<>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                            <Label>XY unit</Label>
                            <Tabs value={importData.xyUnit} onValueChange={v => setImportData({...importData, xyUnit: v})}>
                                <TabsList className="grid grid-cols-2 w-full">
                                    <TabsTrigger value="m" data-testid="rcp-import-xy-m">m</TabsTrigger>
                                    <TabsTrigger value="ft" data-testid="rcp-import-xy-ft">ft</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                        <div className="space-y-2">
                            <Label>Depth unit</Label>
                            <Tabs value={importData.depthUnit} onValueChange={v => setImportData({...importData, depthUnit: v})}>
                                <TabsList className="grid grid-cols-2 w-full">
                                    <TabsTrigger value="m" data-testid="rcp-import-z-m">m</TabsTrigger>
                                    <TabsTrigger value="ft" data-testid="rcp-import-z-ft">ft</TabsTrigger>
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
                    <p className="text-[11px] text-pl-muted -mt-1">
                        Used to convert areas and depths to physical volumes. A UTM grid in metres with depths in feet is common: set each unit on its own. Contacts are typed separately, as TVDSS elevations.
                    </p>

                    <div className="space-y-2">
                        <Label>Coordinate Reference System <span className="text-pl-muted font-normal">(optional)</span></Label>
                        <Input
                            value={importData.crs}
                            onChange={e => setImportData({ ...importData, crs: e.target.value })}
                            placeholder="e.g. EPSG:32631 (WGS 84 / UTM 31N)"
                        />
                        <p className="text-[11px] text-pl-muted -mt-1">
                            Auto-detected from GeoJSON/gridded files when present. Recorded for provenance &amp; cross-app hand-off; leave blank for a local grid.
                        </p>
                    </div>
                    </>)}
                </div>
            );
        }
        return null;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Import Surface</DialogTitle>
                </DialogHeader>
                
                {renderStepContent()}

                <DialogFooter>
                    <Button variant="ghost" data-testid="rcp-import-cancel" onClick={() => onOpenChange(false)}>Cancel</Button>
                    {pending ? (
                        <Button
                            data-testid="rcp-import-anyway"
                            onClick={() => finalizeImport(pending.surface)}
                            className="bg-pl-warning text-pl-warning-fg hover:bg-pl-warning/90"
                        >
                            Import Anyway
                        </Button>
                    ) : (
                        <Button
                            data-testid="rcp-import-confirm"
                            onClick={parseData}
                            disabled={(!importData.file && !ready) || !importData.name || isParsing}
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