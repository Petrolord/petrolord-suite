import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { UploadCloud, FileText, Check, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { SurfaceParser } from '../../services/SurfaceParser';

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

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
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

    const parseData = async () => {
        setIsParsing(true);
        try {
            let points = null;

            // Prefer the multi-format parser (ESRI ASCII grid, ZMap+, GeoJSON, and
            // robust delimited CSV/DAT/XYZ). Fall back to the inline XYZ reader below
            // if it can't make sense of the file.
            if (importData.file) {
                try {
                    const parsed = await SurfaceParser.parse(importData.file);
                    if (parsed?.points?.length >= 3) points = parsed.points;
                } catch { /* fall through to inline parser */ }
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
                if (lines.length < 3) throw new Error("File too short or empty");
                points = [];
                for (const line of lines) {
                    const parts = line.trim().split(/[\s,]+/);
                    const x = parseFloat(parts[0]);
                    const y = parseFloat(parts[1]);
                    const z = parseFloat(parts[2]);
                    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) points.push({ x, y, z });
                }
            }

            if (points.length < 3) throw new Error("No valid XYZ rows found. Expected numeric X Y Z columns.");

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

            const surface = {
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

            onImport(surface);
            onOpenChange(false);
            setStep(1);
            setImportData(prev => ({ name: '', format: 'xyz', rawData: '', file: null, xyUnit: prev.xyUnit, zConvention: prev.zConvention, crs: '' }));

        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Parse Error", description: error.message || "Could not parse surface file. Ensure XYZ format." });
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
                    <Button 
                        onClick={parseData} 
                        disabled={!importData.file || !importData.name || isParsing}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        {isParsing ? "Importing..." : "Import Surface"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default SurfaceImportDialog;