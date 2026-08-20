// Culture / GIS layer import (W1.3) — shared by Seismolord and Mapping
// & Surface Studio. GeoJSON, loose .shp/.dbf pairs, or a zipped
// shapefile; features import under a DECLARED CRS (the .prj text is
// shown as evidence, never trusted) and are stored converted to the
// importer's Project CRS through src/lib/crs, per the CRS program's
// door rules. LOCAL declarations stay LOCAL (deliberate engineering
// grids never transform).

import React, { useEffect, useMemo, useState } from 'react';
import { Globe2, Loader2, Upload } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import CrsPicker from '@/components/crs/CrsPicker';
import { transformPoint } from '@/lib/crs';
import { getProjectCrs } from '@/lib/crs/settingsService';
import {
  normalizeTag, isTransformableTag, LOCAL, UNKNOWN,
} from '@/lib/crs/tags';
import {
  parseGeoJSON, parseShapefile, reprojectFeatures, featuresBBox, geometryTypeOf,
} from '@/lib/cultureImport';
import { saveCulture } from '@/lib/cultureRegistry';

const KINDS = [
  { key: 'license_block', label: 'License blocks' },
  { key: 'field_outline', label: 'Field outlines' },
  { key: 'pipeline', label: 'Pipelines' },
  { key: 'coastline', label: 'Coastline' },
  { key: 'other', label: 'Other culture' },
];

const COLORS = ['#f59e0b', '#22d3ee', '#a3e635', '#f472b6', '#e2e8f0', '#fb7185', '#38bdf8'];

const summarize = (features) => {
  const n = { point: 0, polyline: 0, polygon: 0 };
  features.forEach((f) => { n[f.type] += 1; });
  return [
    n.polygon ? `${n.polygon} polygon${n.polygon === 1 ? '' : 's'}` : null,
    n.polyline ? `${n.polyline} line${n.polyline === 1 ? '' : 's'}` : null,
    n.point ? `${n.point} point${n.point === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(', ') || 'no features';
};

export default function CultureImportDialog({ open, onOpenChange, onImported }) {
  const { toast } = useToast();
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState(null);   // {features, skipped, fileName, format, prjText}
  const [name, setName] = useState('');
  const [kind, setKind] = useState('other');
  const [color, setColor] = useState(COLORS[0]);
  const [labelField, setLabelField] = useState('');
  const [fileTag, setFileTag] = useState(null);
  const [project, setProject] = useState(null); // getProjectCrs()

  useEffect(() => {
    if (!open) return;
    setParsed(null);
    setName('');
    setFileTag(null);
    getProjectCrs().then(setProject).catch(() => setProject(null));
  }, [open]);

  const propKeys = useMemo(() => {
    if (!parsed) return [];
    const keys = new Set();
    parsed.features.forEach((f) => Object.keys(f.props || {}).forEach((k) => keys.add(k)));
    return [...keys];
  }, [parsed]);

  const handleFiles = async (fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    setParsing(true);
    try {
      let result = null;
      let prjText = null;
      let format = null;
      let fileName = files[0].name;

      const geojson = files.find((f) => /\.(geo)?json$/i.test(f.name));
      const zip = files.find((f) => /\.zip$/i.test(f.name));
      const shp = files.find((f) => /\.shp$/i.test(f.name));

      if (geojson) {
        result = parseGeoJSON(await geojson.text());
        format = 'geojson';
        fileName = geojson.name;
      } else if (zip) {
        const { default: JSZip } = await import('jszip');
        const z = await JSZip.loadAsync(await zip.arrayBuffer());
        const entry = (ext) => Object.values(z.files)
          .find((e) => !e.dir && e.name.toLowerCase().endsWith(ext));
        const shpEntry = entry('.shp');
        if (!shpEntry) throw new Error('The zip contains no .shp file.');
        const dbfEntry = entry('.dbf');
        const prjEntry = entry('.prj');
        result = parseShapefile(
          await shpEntry.async('uint8array'),
          dbfEntry ? await dbfEntry.async('uint8array') : null,
        );
        if (prjEntry) prjText = (await prjEntry.async('string')).slice(0, 400);
        format = 'shapefile';
        fileName = zip.name;
      } else if (shp) {
        const dbf = files.find((f) => /\.dbf$/i.test(f.name));
        const prj = files.find((f) => /\.prj$/i.test(f.name));
        result = parseShapefile(
          new Uint8Array(await shp.arrayBuffer()),
          dbf ? new Uint8Array(await dbf.arrayBuffer()) : null,
        );
        if (prj) prjText = (await prj.text()).slice(0, 400);
        format = 'shapefile';
        fileName = shp.name;
      } else {
        throw new Error('Pick a .geojson/.json file, a zipped shapefile, or .shp (+.dbf).');
      }

      if (!result.features.length) throw new Error('The file contains no usable features.');
      setParsed({ ...result, fileName, format, prjText });
      setName(fileName.replace(/\.(zip|shp|geojson|json)$/i, ''));
      setLabelField('');
    } catch (e) {
      toast({ title: 'Could not read the file', description: e.message, variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  };

  const doImport = async () => {
    if (!parsed) return;
    const declared = normalizeTag(fileTag);
    if (declared === UNKNOWN) {
      toast({
        title: 'Declare the file CRS',
        description: 'Pick the coordinate system the file is in (or Local grid).',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const projTag = project ? normalizeTag(project.tag) : UNKNOWN;
      const customDefs = project?.customDefs || {};
      let features = parsed.features;
      let storedTag = declared;
      let converted = false;
      if (declared !== LOCAL && projTag !== UNKNOWN && declared !== projTag
        && isTransformableTag(declared) && isTransformableTag(projTag)) {
        features = reprojectFeatures(features, (x, y) => {
          const p = transformPoint(declared, projTag, x, y, customDefs);
          return [p.x, p.y];
        });
        storedTag = projTag;
        converted = true;
      }
      const row = await saveCulture({
        name: name.trim() || parsed.fileName,
        kind,
        geometryType: geometryTypeOf(features),
        features: labelField
          ? features.map((f) => ({ ...f, label: f.props?.[labelField] != null ? String(f.props[labelField]) : null }))
          : features,
        style: { color, weight: 1, label_field: labelField || null },
        crs: storedTag === UNKNOWN ? null : storedTag,
        xyUnit: storedTag === projTag ? (project?.xyUnit || 'm') : null,
        crsProvenance: converted ? 'converted_on_import' : 'declared_on_import',
        bbox: featuresBBox(features),
        provenance: {
          imported_from: {
            file: parsed.fileName,
            format: parsed.format,
            declared_crs: declared,
            skipped: parsed.skipped,
          },
          converted,
        },
      });
      toast({
        title: 'Culture layer imported',
        description: `${row.name}: ${summarize(parsed.features)}`
          + `${converted ? `, converted to ${storedTag}` : ''}.`,
      });
      if (onImported) onImported(row);
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center text-white">
            <Globe2 className="w-5 h-5 mr-2 text-cyan-400" />
            Import culture / GIS layer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-xs text-slate-400">
              GeoJSON, zipped shapefile, or .shp with its .dbf/.prj
            </span>
            <input
              type="file"
              multiple
              accept=".geojson,.json,.zip,.shp,.dbf,.prj"
              onChange={(e) => handleFiles(e.target.files)}
              className="mt-1 block w-full text-xs text-slate-300 file:mr-3 file:rounded-md
                file:border file:border-slate-700 file:bg-slate-900 file:px-3 file:py-1.5
                file:text-xs file:text-slate-200"
            />
          </label>
          {parsing && (
            <div className="flex items-center gap-2 text-cyan-300 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              Reading…
            </div>
          )}

          {parsed && (
            <>
              <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2 text-xs text-slate-300">
                <div>{`${parsed.fileName}: ${summarize(parsed.features)}`}</div>
                {parsed.skipped > 0 && (
                  <div className="text-amber-400">{`${parsed.skipped} record(s) skipped (empty or unsupported).`}</div>
                )}
                {parsed.prjText && (
                  <div className="mt-1 text-slate-500">
                    <span className="text-slate-400">.prj says (evidence, not trusted): </span>
                    <span className="font-mono break-all">{parsed.prjText.slice(0, 160)}</span>
                  </div>
                )}
              </div>

              <div>
                <span className="text-xs text-slate-400">File coordinate system (declare it)</span>
                <CrsPicker value={fileTag} onChange={(tag) => setFileTag(tag)} />
                {project && normalizeTag(project.tag) !== UNKNOWN && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {`Features convert into your Project CRS (${project.name || project.tag}) on import.`}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs text-slate-400">Layer name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-400">Kind</span>
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                    className="mt-1 w-full rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 text-sm"
                  >
                    {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-slate-400">Color</span>
                  <div className="mt-1 flex gap-1">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`color ${c}`}
                        onClick={() => setColor(c)}
                        className={`w-6 h-6 rounded border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </label>
                <label className="block">
                  <span className="text-xs text-slate-400">Label field</span>
                  <select
                    value={labelField}
                    onChange={(e) => setLabelField(e.target.value)}
                    disabled={!propKeys.length}
                    className="mt-1 w-full rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 text-sm disabled:opacity-40"
                  >
                    <option value="">No labels</option>
                    {propKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </label>
              </div>

              <div className="flex justify-end">
                <Button onClick={doImport} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    : <Upload className="w-4 h-4 mr-1" />}
                  Import layer
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
