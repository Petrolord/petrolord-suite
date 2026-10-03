// Export tab (SC5; SCAL-U1): hand the working curves to the Waterflood
// Design Studio with the kr-1 block, download the working tables as CSV with
// their provenance and units, and move whole projects as JSON. Chart PNGs
// come from the download button on every chart.
import React, { useRef } from 'react';
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
import { buildKrCsv, buildHeightCsv, buildPcCsv, downloadCsv } from './exports';

const slug = (s) => (s || 'scal').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();

// Where the handoff goes. Inside the /dev harness the receiving app's
// harness route is used, so the chain can be walked signed out.
const WATERFLOOD = ['/dashboard/apps/reservoir/waterflood-design-studio', '/dev/studio/waterflood'];

const ExportTab = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const inHarness = location.pathname.startsWith('/dev/');
  const fileRef = useRef(null);
  const c = useScalStudio();
  const {
    projectName, curves, ow, heightProfile, reservoirPc, height, unitSystem,
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

  const exportKr = () => {
    const csv = buildKrCsv(ow.params, 25, { header: header('oil-water relative permeability, working Corey set, 26 rows') });
    if (!csv) {
      addNotification('Fix the oil-water Corey set on the Curves tab first.', 'error');
      return;
    }
    downloadCsv(csv, `scal-kr-${slug(projectName)}.csv`);
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
          <Button onClick={sendToWaterflood} data-testid="scal-send-waterflood">
            <Waves className="w-4 h-4 mr-1.5" /> Send curves to Waterflood
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">CSV exports</CardTitle>
          <CardDescription>
            Working tables for simulators and spreadsheets: the Corey kr set (25 intervals), the reservoir Pc curve,
            and the saturation-height profile (with TVDSS when a FWL is set). Each file opens with lines starting with #
            that say where it came from and in which units; Pc and heights are in the display units.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportKr} data-testid="scal-csv-kr">
            <FileSpreadsheet className="w-4 h-4 mr-1.5" /> kr table
          </Button>
          <Button variant="outline" onClick={exportPc} data-testid="scal-csv-pc">
            <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Reservoir Pc
          </Button>
          <Button variant="outline" onClick={exportHeight} data-testid="scal-csv-height">
            <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Saturation-height
          </Button>
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
