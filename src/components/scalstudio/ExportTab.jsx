// Export tab (SC5): hand the working curves to the Waterflood Design
// Studio, download the working tables as CSV, and move whole projects as
// JSON. Chart PNGs come from the download button on every chart.
import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Waves, FileSpreadsheet, FileJson, Upload, Info,
} from 'lucide-react';
import { useScalStudio } from '@/contexts/ScalStudioContext';
import { exportProjectAsJSON, importProjectFromJSON } from '@/utils/savedProjects';
import {
  buildKrCsv, buildHeightCsv, buildPcCsv, buildScalKrHandoff, downloadCsv,
} from './exports';

const slug = (s) => (s || 'scal').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();

const ExportTab = () => {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const {
    projectName, curves, ow, heightProfile, reservoirPc, height,
    samples, capillary, notes, addNotification, setSamples,
  } = useScalStudio();

  const sendToWaterflood = () => {
    const payload = buildScalKrHandoff({
      owParams: ow.params,
      projectName,
      muW: parseFloat(curves.muW),
      muO: parseFloat(curves.muO),
    });
    if (!payload) {
      addNotification('Fix the oil-water Corey set on the Curves tab first.', 'error');
      return;
    }
    navigate('/dashboard/apps/reservoir/waterflood-design-studio', { state: { scalKr: payload } });
  };

  const exportKr = () => {
    const csv = buildKrCsv(ow.params);
    if (!csv) {
      addNotification('Fix the oil-water Corey set on the Curves tab first.', 'error');
      return;
    }
    downloadCsv(csv, `scal-kr-${slug(projectName)}.csv`);
  };

  const exportHeight = () => {
    const fwl = parseFloat(height.fwl_tvdss);
    const csv = buildHeightCsv(heightProfile, Number.isFinite(fwl) ? fwl : null);
    if (!csv) {
      addNotification('The Height and Saturation tab has no profile yet.', 'error');
      return;
    }
    downloadCsv(csv, `scal-saturation-height-${slug(projectName)}.csv`);
  };

  const exportPc = () => {
    const csv = buildPcCsv(reservoirPc);
    if (!csv) {
      addNotification('The Capillary tab has no reservoir Pc curve yet.', 'error');
      return;
    }
    downloadCsv(csv, `scal-reservoir-pc-${slug(projectName)}.csv`);
  };

  const exportJson = () => {
    exportProjectAsJSON({
      name: projectName || 'scal-project',
      schema: 1,
      curves, samples, capillary, height, notes,
    });
  };

  const importJson = async (file) => {
    if (!file) return;
    try {
      const payload = await importProjectFromJSON(file);
      if (Array.isArray(payload?.samples)) {
        setSamples(payload.samples);
        addNotification(`${payload.samples.length} sample(s) imported from "${file.name}". Other groups load through the project manager.`, 'success');
      } else {
        addNotification('That JSON has no samples array.', 'error');
      }
    } catch (e) {
      addNotification(e.message || 'Could not read that JSON file.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Waves className="w-4 h-4 text-cyan-500" />
            Send to Waterflood Design Studio
          </CardTitle>
          <CardDescription>
            Hands the working oil-water Corey set (and your preview viscosities) to the Waterflood displacement
            inputs. Gas-oil sets are not handed off because the displacement calculation is oil-water.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={sendToWaterflood}>
            <Waves className="w-4 h-4 mr-1.5" /> Send curves to Waterflood
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-base">CSV exports</CardTitle>
          <CardDescription>
            Working tables for simulators and spreadsheets: the Corey kr set (25 points), the reservoir Pc curve,
            and the saturation-height profile (with TVDSS when a FWL is set).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportKr}>
            <FileSpreadsheet className="w-4 h-4 mr-1.5" /> kr table
          </Button>
          <Button variant="outline" onClick={exportPc}>
            <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Reservoir Pc
          </Button>
          <Button variant="outline" onClick={exportHeight}>
            <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Saturation-height
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-base">Project JSON</CardTitle>
          <CardDescription>
            Full project payload (curves, samples, capillary and height configuration) for hand-off between
            accounts or archiving. Sample import merges the file's samples into the open project.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => { importJson(e.target.files?.[0]); e.target.value = ''; }}
          />
          <Button variant="outline" onClick={exportJson}>
            <FileJson className="w-4 h-4 mr-1.5" /> Export project JSON
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1.5" /> Import samples from JSON
          </Button>
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5 basis-full">
            <Info className="w-3.5 h-3.5" /> Chart PNGs download from the button on each chart.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExportTab;
