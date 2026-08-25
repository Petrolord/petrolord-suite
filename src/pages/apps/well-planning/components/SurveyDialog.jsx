// Actual-survey import dialog (WD3): manual paste, CSV file (via the
// shared wellImport mapping helpers) or a geo_wells registry deviation.
// Stations are stored in METRES with the azimuths as entered plus the
// run's azimuth reference; the grid-converted station cache is written
// alongside so every reader (and the org share path) gets grid without
// re-deriving the chain.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Upload } from 'lucide-react';
import { parseDelimited, guessMapping, buildDeviation } from '@/lib/wellImport';
import { listWells } from '@/lib/wellsRegistry';
import { parseManualStations, toGridSurvey } from '../services/surveyUtils';
import { M_TO_FT } from '../engine/surveyMath';

const SOURCES = [
  { id: 'manual', label: 'Paste stations' },
  { id: 'csv', label: 'CSV file' },
  { id: 'geo_wells', label: 'From wells registry' },
];

const SurveyDialog = ({ open, onOpenChange, wellbore, survey, onSave }) => {
  const editing = Boolean(survey?.id);
  const { toast } = useToast();
  const fileRef = useRef(null);

  const [name, setName] = useState('');
  const [source, setSource] = useState('manual');
  const [toolcode, setToolcode] = useState('');
  const [aziRef, setAziRef] = useState('grid');
  const [unit, setUnit] = useState('m');
  const [text, setText] = useState('');
  const [csv, setCsv] = useState(null); // {fileName, header, rows, map}
  const [geoWells, setGeoWells] = useState(null);
  const [geoWellId, setGeoWellId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(survey?.name || '');
    setSource(survey?.source || 'manual');
    setToolcode(survey?.instrument_toolcode || '');
    setAziRef(survey?.imported_from?.azimuth_reference
      || wellbore?.azimuth_reference || 'grid');
    setUnit(wellbore?.depth_unit === 'ft' ? 'ft' : 'm');
    setCsv(null);
    setGeoWellId('');
    if (editing && Array.isArray(survey?.stations)) {
      const toUser = wellbore?.depth_unit === 'ft' ? M_TO_FT : 1;
      setUnit(wellbore?.depth_unit === 'ft' ? 'ft' : 'm');
      setText(survey.stations
        .map((s) => `${(s.md * toUser).toFixed(2)}  ${s.inc}  ${s.azi}`)
        .join('\n'));
      setSource('manual');
    } else {
      setText('');
    }
  }, [open, survey, wellbore, editing]);

  useEffect(() => {
    if (!open || source !== 'geo_wells' || geoWells) return;
    listWells()
      .then((rows) => setGeoWells(rows.filter((w) => Array.isArray(w.deviation) && w.deviation.length >= 2)))
      .catch((e) => toast({ variant: 'destructive', title: 'Wells registry', description: e.message }));
  }, [open, source, geoWells, toast]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const parsed = parseDelimited(content);
      if (!parsed.rows.length) throw new Error('The file has no data rows.');
      const map = parsed.header
        ? guessMapping(parsed.header, ['md', 'inc', 'azi'])
        : { md: 0, inc: 1, azi: 2 };
      setCsv({ fileName: file.name, header: parsed.header, rows: parsed.rows, map });
    } catch (err) {
      toast({ variant: 'destructive', title: 'CSV import', description: err.message });
    } finally {
      e.target.value = '';
    }
  };

  const setCsvMap = (field) => (v) => setCsv((c) => ({ ...c, map: { ...c.map, [field]: Number(v) } }));

  // Stations in the ENTERED unit, azimuths as entered.
  const stationsPreview = useMemo(() => {
    try {
      if (source === 'manual') {
        if (!text.trim()) return { stations: null };
        return { stations: parseManualStations(text) };
      }
      if (source === 'csv') {
        if (!csv) return { stations: null };
        return { stations: buildDeviation(csv.rows, csv.map) };
      }
      if (source === 'geo_wells') {
        const w = (geoWells || []).find((x) => x.id === geoWellId);
        if (!w) return { stations: null };
        return { stations: w.deviation.map((s) => ({ md: s.md, inc: s.inc, azi: s.azi })), geoWell: w };
      }
      return { stations: null };
    } catch (e) {
      return { stations: null, error: e.message };
    }
  }, [source, text, csv, geoWells, geoWellId]);

  // The registry stores deviations in metres/grid.
  const effectiveUnit = source === 'geo_wells' ? 'm' : unit;
  const effectiveAziRef = source === 'geo_wells' ? 'grid' : aziRef;

  const handleSave = async () => {
    const { stations, error, geoWell } = stationsPreview;
    if (error) { toast({ variant: 'destructive', title: 'Survey data', description: error }); return; }
    if (!stations || !name.trim()) return;
    setSaving(true);
    try {
      const toM = effectiveUnit === 'ft' ? 1 / M_TO_FT : 1;
      const stationsM = stations.map((s) => ({ md: s.md * toM, inc: s.inc, azi: s.azi }));
      let gridStations;
      try {
        gridStations = toGridSurvey(stationsM, effectiveAziRef, wellbore);
      } catch (e) {
        throw new Error(`Cannot convert ${effectiveAziRef}-north azimuths to grid: ${e.message} Re-save the wellbore with a site CRS to cache convergence and declination.`);
      }
      await onSave({
        name: name.trim(),
        // Editing re-opens the stations as an editable grid; the run
        // keeps its original source badge.
        source: editing ? survey.source : source,
        instrument_toolcode: toolcode || null,
        stations: stationsM,
        computed: gridStations,
        md_from_m: stationsM[0].md,
        md_to_m: stationsM[stationsM.length - 1].md,
        imported_from: {
          ...(editing ? (survey.imported_from || {}) : {}),
          azimuth_reference: effectiveAziRef,
          entered_unit: effectiveUnit,
          ...(source === 'csv' && csv ? { file_name: csv.fileName } : {}),
          ...(source === 'geo_wells' && geoWell ? { geo_well_id: geoWell.id, geo_well_name: geoWell.name } : {}),
        },
      });
      onOpenChange(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Survey save failed', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const preview = stationsPreview.stations;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit survey run' : 'New survey run'}</DialogTitle>
          <DialogDescription className="text-slate-400">
            Actual stations for {wellbore?.name}. Azimuths convert to grid through the cached convergence and WMM2025 declination.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Run name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="MWD run 1" className="bg-slate-800 border-slate-700 h-9" data-testid="survey-name" />
            </div>
            <div>
              <Label className="text-xs">Tool (optional)</Label>
              <Input value={toolcode} onChange={(e) => setToolcode(e.target.value)} placeholder="MWD" className="bg-slate-800 border-slate-700 h-9" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Source</Label>
              <Select value={source} onValueChange={setSource} disabled={editing}>
                <SelectTrigger className="bg-slate-800 border-slate-700 h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {SOURCES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Azimuths are</Label>
              <Select value={effectiveAziRef} onValueChange={setAziRef} disabled={source === 'geo_wells'}>
                <SelectTrigger className="bg-slate-800 border-slate-700 h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="grid">Grid north</SelectItem>
                  <SelectItem value="true">True north</SelectItem>
                  <SelectItem value="magnetic">Magnetic north</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">MD unit</Label>
              <Select value={effectiveUnit} onValueChange={setUnit} disabled={source === 'geo_wells'}>
                <SelectTrigger className="bg-slate-800 border-slate-700 h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="m">Metres</SelectItem>
                  <SelectItem value="ft">Feet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {source === 'manual' && (
            <div>
              <Label className="text-xs">Stations (one per line: MD  inclination  azimuth)</Label>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={7}
                placeholder={'0 0 0\n500 0 0\n800 15 45\n1200 30 45'}
                className="bg-slate-800 border-slate-700 font-mono text-xs" data-testid="survey-stations" />
            </div>
          )}

          {source === 'csv' && (
            <div className="space-y-2">
              <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleFile} />
              <Button variant="outline" onClick={() => fileRef.current?.click()} className="w-full border-slate-600 text-slate-300 h-9">
                <Upload className="mr-2 h-4 w-4" /> {csv ? csv.fileName : 'Choose a CSV / text file'}
              </Button>
              {csv?.header && (
                <div className="grid grid-cols-3 gap-2">
                  {['md', 'inc', 'azi'].map((f) => (
                    <div key={f}>
                      <Label className="text-[10px] uppercase">{f} column</Label>
                      <Select value={String(csv.map[f])} onValueChange={setCsvMap(f)}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="-1">Not mapped</SelectItem>
                          {csv.header.map((h, i) => <SelectItem key={h + i} value={String(i)}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {source === 'geo_wells' && (
            <div>
              <Label className="text-xs">Registry well (deviation in metres, grid north)</Label>
              <Select value={geoWellId} onValueChange={setGeoWellId}>
                <SelectTrigger className="bg-slate-800 border-slate-700 h-9"><SelectValue placeholder={geoWells ? 'Select a well...' : 'Loading wells...'} /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {(geoWells || []).map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name} ({w.deviation.length} stations)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="rounded-md border border-slate-700 bg-slate-800/50 p-2 text-xs">
            {stationsPreview.error && <span className="text-red-400">{stationsPreview.error}</span>}
            {!stationsPreview.error && preview && (
              <span className="text-slate-300">
                {preview.length} stations, MD {preview[0].md.toFixed(1)} to {preview[preview.length - 1].md.toFixed(1)} {effectiveUnit}
              </span>
            )}
            {!stationsPreview.error && !preview && <span className="italic text-slate-500">No stations yet.</span>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-600 text-slate-300">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !preview} className="bg-[#4CAF50] hover:bg-[#43a047] text-white" data-testid="survey-save">
            {editing ? 'Save changes' : 'Add survey'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SurveyDialog;
