// Export tab (SC5; SCAL-U1): hand the working curves to the Waterflood
// Design Studio with the kr-1 block, download the working tables as CSV with
// their provenance and units, and move whole projects as JSON. Chart PNGs
// come from the download button on every chart.
import React, { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Waves, FileSpreadsheet, FileJson, Upload, Info,
} from 'lucide-react';
import { useScalStudio } from '@/contexts/ScalStudioContext';
import { exportProjectAsJSON, importProjectFromJSON } from '@/utils/savedProjects';
import { krContractCsvHeader, KR_PROJECT_PARAM, KR_HANDOFF_STATE_KEY } from '@/lib/inputProvenance/krContract';
import { buildScalKrHandoffV2 } from '@/utils/scalstudio/krHandoff';
import { buildKrCsv, buildGoKrCsv, buildHeightCsv, buildPcCsv, downloadCsv } from './exports';
import { buildSatKeywords, SAT_DECK_UNITS } from '@/utils/scalstudio/simKeywords';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const slug = (s) => (s || 'scal').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();

// Where the handoff goes. Inside the /dev harness the receiving app's
// harness route is used, so the chain can be walked signed out.
const WATERFLOOD = ['/dashboard/apps/reservoir/waterflood-design-studio', '/dev/studio/waterflood'];
// SIM-U1-004: Reservoir Simulation Studio's deck builder reads the saved kr-1 block by id
const SIMULATION = ['/dashboard/apps/reservoir/reservoir-simulation-studio', '/dev/reservoir-simulation-studio'];

const ExportTab = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const inHarness = location.pathname.startsWith('/dev/');
  const fileRef = useRef(null);
  const c = useScalStudio();
  const {
    projectName, curves, ow, go, jResolved, reservoir, heightProfile, reservoirPc, height, unitSystem,
    addNotification, currentProjectId, manualSave, contractFor,
  } = c;

  const header = (what) => krContractCsvHeader(contractFor(currentProjectId, projectName), {
    extra: [`File: ${what}`, `Display units: ${c.u.line()}`],
  });

  const sendToWaterflood = async () => {
    if (!ow.params) {
      addNotification('Fix the oil-water Corey set on the Curves tab first.', 'error');
      return;
    }
    // SCAL-U1-024: save first, so the receiver can read the same block again
    // by id; cite the project only when the save landed (a read-only shared
    // project, or a failed save, sends the curves without a project to re-read)
    const saved = currentProjectId ? await manualSave() : false;
    const citeId = saved ? currentProjectId : null;
    if (currentProjectId && !saved) addNotification('The project could not be saved first, so the curves go without a project to read again later.', 'info');
    const contract = contractFor(citeId, projectName);
    const payload = buildScalKrHandoffV2({ contract, muW: parseFloat(curves.muW), muO: parseFloat(curves.muO) });
    const base = WATERFLOOD[inHarness ? 1 : 0];
    const to = citeId ? `${base}?${KR_PROJECT_PARAM}=${encodeURIComponent(citeId)}` : base;
    navigate(to, { state: { [KR_HANDOFF_STATE_KEY]: payload } });
  };

  const sendToSimulation = async () => {
    if (!currentProjectId) {
      addNotification('Save the SCAL project first: Reservoir Simulation Studio reads it by id.', 'error');
      return;
    }
    const saved = await manualSave();
    if (!saved) {
      addNotification('The project could not be saved first, so there is no saved block for Reservoir Simulation Studio to read.', 'error');
      return;
    }
    navigate(`${SIMULATION[inHarness ? 1 : 0]}?${KR_PROJECT_PARAM}=${encodeURIComponent(currentProjectId)}&tab=builder`);
  };

  const exportKr = () => {
    const csv = buildKrCsv(ow.params, 25, { header: header('oil-water relative permeability, working Corey set, 26 rows') });
    if (!csv) {
      addNotification('Fix the oil-water Corey set on the Curves tab first.', 'error');
      return;
    }
    downloadCsv(csv, `scal-kr-${slug(projectName)}.csv`);
  };

  // SCAL-U2-001: SWOF and SGOF for a simulator deck, Pc from the working J
  const [deckUnits, setDeckUnits] = useState(unitSystem === 'si' ? 'METRIC' : 'FIELD');
  const [deckPc, setDeckPc] = useState(true);
  const satOut = buildSatKeywords({
    contract: contractFor(currentProjectId, projectName),
    ow: ow.params, go: go.params, jSpec: jResolved?.jSpec, reservoir: reservoir?.props,
    withPc: deckPc, units: deckUnits, displayUnits: c.u.line(),
  });
  const exportDeck = () => {
    if (!satOut.ok) {
      addNotification(satOut.errors[0], 'error');
      return;
    }
    const blob = new Blob([satOut.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scal-swof-sgof-${slug(projectName)}.inc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // SCAL-U2-002: the gas-oil set leaves the studio too (at connate water)
  const exportGo = () => {
    const csv = buildGoKrCsv(go.params, 25, { header: header('gas-oil relative permeability at connate water, working Corey set, 26 rows') });
    if (!csv) {
      addNotification('Fix the gas-oil Corey set on the Curves tab first.', 'error');
      return;
    }
    downloadCsv(csv, `scal-kr-gas-oil-${slug(projectName)}.csv`);
  };

  const exportHeight = () => {
    const fwl = parseFloat(height.fwl_tvdss);
    const csv = buildHeightCsv(heightProfile, Number.isFinite(fwl) ? fwl : null, { system: unitSystem, header: header('saturation against height above the free water level; TVDSS positive down') });
    if (!csv) {
      addNotification('The Height and Saturation tab has no profile yet.', 'error');
      return;
    }
    downloadCsv(csv, `scal-saturation-height-${slug(projectName)}.csv`);
  };

  const exportPc = () => {
    const csv = buildPcCsv(reservoirPc, { system: unitSystem, header: header('reservoir capillary pressure from the working J curve') });
    if (!csv) {
      addNotification('The Capillary tab has no reservoir Pc curve yet.', 'error');
      return;
    }
    downloadCsv(csv, `scal-reservoir-pc-${slug(projectName)}.csv`);
  };

  // SCAL-U1-010: the exported file is the saved payload itself (kr-1 block
  // included), and importing it restores the whole project, not only the
  // samples.
  const exportJson = () => {
    exportProjectAsJSON(c.serializeForExport());
  };

  const importJson = async (file) => {
    if (!file) return;
    try {
      const payload = await importProjectFromJSON(file);
      if (payload && (payload.curves || payload.capillary || Array.isArray(payload.samples))) {
        c.hydrateFromFile(payload);
        addNotification(`Project file "${file.name}" read: curves, samples, capillary, height, identification and sources restored. Save it as a project to keep it.`, 'success');
      } else {
        addNotification('That JSON is not a SCAL Studio project.', 'error');
      }
    } catch (e) {
      addNotification(e.message || 'Could not read that JSON file.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Waves className="w-4 h-4 text-pl-muted" />
            Send to Waterflood Design Studio
          </CardTitle>
          <CardDescription>
            Hands the working oil-water Corey set (and your preview viscosities) to the Waterflood displacement
            inputs, with where it came from: fitted to which sample or typed, the sample pedigree, the project and the
            time. A saved project is saved first, so Waterflood can read it again by id. Gas-oil sets are not handed off
            because the displacement calculation is oil-water.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button onClick={sendToWaterflood} data-testid="scal-send-waterflood">
              <Waves className="w-4 h-4 mr-1.5" /> Send curves to Waterflood
            </Button>
            <Button variant="outline" onClick={sendToSimulation} disabled={!currentProjectId} data-testid="scal-send-simulation"
              title={currentProjectId ? 'Opens the deck builder of Reservoir Simulation Studio with this project named; take the curves there' : 'Save the project first'}>
              <Waves className="w-4 h-4 mr-1.5" /> Send curves and Pc to Reservoir Simulation Studio
            </Button>
          </div>
          <p className="text-[11px] text-pl-muted mt-2">
            Reservoir Simulation Studio takes the oil-water and gas-oil sets and the Leverett J with its own Swirr from the saved project, and writes them as the SWOF and SGOF of the export below.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">CSV exports</CardTitle>
          <CardDescription>
            Working tables for simulators and spreadsheets: the oil-water and gas-oil Corey sets (25 intervals each; the
            gas-oil set at connate water), the reservoir Pc curve,
            and the saturation-height profile (with TVDSS when a FWL is set). Each file opens with lines starting with #
            that say where it came from and in which units; Pc and heights are in the display units.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportKr} data-testid="scal-csv-kr">
            <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Oil-water kr table
          </Button>
          <Button variant="outline" onClick={exportGo} data-testid="scal-csv-go">
            <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Gas-oil kr table
          </Button>
          <Button variant="outline" onClick={exportPc} data-testid="scal-csv-pc">
            <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Reservoir Pc
          </Button>
          <Button variant="outline" onClick={exportHeight} data-testid="scal-csv-height">
            <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Saturation-height
          </Button>
        </CardContent>
      </Card>

      <Card data-testid="scal-deck-card">
        <CardHeader>
          <CardTitle className="text-base">Simulator keywords (SWOF and SGOF)</CardTitle>
          <CardDescription>
            The working oil-water and gas-oil sets as SWOF and SGOF tables for an Eclipse or OPM Flow deck, with the
            capillary pressure of the working J curve in the SWOF Pcow column. SWOF runs from Swc to Sw = 1 and SGOF from
            Sg = 0 to 1 - Swc, so the two close; this needs one Swc in both sets. The file opens with comment lines that
            say where the curves came from, the units and the conventions. Gas-oil capillary pressure is written as zero.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-pl-muted">Deck units</Label>
              <Select value={deckUnits} onValueChange={setDeckUnits}>
                <SelectTrigger className="h-8 w-36" aria-label="Deck units" data-testid="scal-deck-units"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(SAT_DECK_UNITS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label} (Pc in {v.pc})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={deckPc} onCheckedChange={setDeckPc} aria-label="Capillary pressure in SWOF" data-testid="scal-deck-pc" />
              <Label className="text-xs text-pl-muted">Capillary pressure in SWOF</Label>
            </div>
            <Button variant="outline" onClick={exportDeck} disabled={!satOut.ok} data-testid="scal-deck-export">
              <FileSpreadsheet className="w-4 h-4 mr-1.5" /> SWOF and SGOF (.inc)
            </Button>
          </div>
          {!satOut.ok && <p className="text-xs text-pl-warning-text" data-testid="scal-deck-refused">{satOut.errors.join(' ')}</p>}
          {satOut.ok && satOut.warnings.map((w) => <p key={w} className="text-xs text-pl-warning-text">{w}</p>)}
          <p className="text-[11px] text-pl-muted">Simulation Studio does not read this file by id yet; that comes with its own upgrade round.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project JSON</CardTitle>
          <CardDescription>
            The saved project payload itself (curves, samples, capillary and height set-up, identification, sources and
            the kr-1 block), for hand-off between accounts or archiving. Importing a file restores the whole project on
            screen; save it as a project to keep it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => { importJson(e.target.files?.[0]); e.target.value = ''; }}
          />
          <Button variant="outline" onClick={exportJson} data-testid="scal-json-export">
            <FileJson className="w-4 h-4 mr-1.5" /> Export project JSON
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} data-testid="scal-json-import">
            <Upload className="w-4 h-4 mr-1.5" /> Import project JSON
          </Button>
          <p className="text-[11px] text-pl-muted flex items-center gap-1.5 basis-full">
            <Info className="w-3.5 h-3.5" /> Chart PNGs download from the button on each chart.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExportTab;
