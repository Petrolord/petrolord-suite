import { saveAs } from 'file-saver';
import { depthToDisplay, tempToDisplay } from './units';

export class ExportEngine {
    // BF-U1-016: the PDF report moved to services/report.js (reviewer block,
    // inputs, present day); the old generator printed the retired app name,
    // "Untitled" and no inputs.

    /**
     * Generate CSV export of Time-Depth-Temp-Ro data
     */
    static generateCSV(results, units = null) {
        if (!results || !results.data) return;

        // SI columns always; the display units (BF3) as extra columns when they differ
        const zU = units?.depth && units.depth !== 'm' ? units.depth : null;
        const tU = units?.temp && units.temp !== 'C' ? units.temp : null;
        const headers = ['Age_Ma', 'Layer_ID', 'Layer_Name', 'Depth_Top_m', 'Depth_Bottom_m', 'Temp_C', 'Ro_Percent',
            ...(zU ? [`Depth_Top_${zU}`, `Depth_Bottom_${zU}`] : []), ...(tU ? [`Temp_${tU}`] : [])];
        const rows = [];

        // Layer series start at deposition (shorter than timeSteps) —
        // align rows by each entry's own age, never by global index.
        const byAge = (arr) => new Map((arr || []).map(e => [e.age, e]));
        const burialMaps = results.data.burial.map(byAge);
        const tempMaps = results.data.temperature.map(byAge);
        const matMaps = results.data.maturity.map(byAge);

        results.data.timeSteps.forEach((age) => {
            results.meta.layers.forEach((layer, layerIdx) => {
                const burial = burialMaps[layerIdx].get(age);
                const temp = tempMaps[layerIdx].get(age);
                const mat = matMaps[layerIdx].get(age);

                if (burial && temp && mat) {
                    rows.push([
                        age.toFixed(2),
                        layer.id,
                        layer.name,
                        burial.top.toFixed(2),
                        burial.bottom.toFixed(2),
                        temp.value.toFixed(2),
                        mat.value.toFixed(3),
                        ...(zU ? [depthToDisplay(burial.top, zU).toFixed(2), depthToDisplay(burial.bottom, zU).toFixed(2)] : []),
                        ...(tU ? [tempToDisplay(temp.value, tU).toFixed(2)] : []),
                    ].join(','));
                }
            });
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        saveAs(blob, 'BasinFlow_Simulation_Data.csv');
    }

    /**
     * Export full project state as JSON
     */
    static generateJSON(project) {
        const json = JSON.stringify(project, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        saveAs(blob, `BasinFlow_Project_${project.name.replace(/\s+/g, '_')}.json`);
    }
}