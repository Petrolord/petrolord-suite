import React from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { FileDown, FileJson, FileText, Image, Globe } from 'lucide-react';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
// Fix: Ensure we are importing correctly. If latLngToUtm is not a named export, we might need to adjust.
// Assuming it is a named export based on usage.
import { latLngToUtm } from '@/utils/coordinateUtils'; 
import Drawing from 'dxf-writer';

const ExportPanel = ({ layers }) => {
  const { toast } = useToast();

  const toGeoJSON = () => {
    const features = layers.map(layer => {
      let geometry;
      if (layer.type === 'icon') {
        geometry = { type: 'Point', coordinates: [layer.latlng.lng, layer.latlng.lat] };
      } else if (layer.type === 'pipeline') {
        geometry = { type: 'LineString', coordinates: layer.latlngs.map(p => [p.lng, p.lat]) };
      }
      return {
        type: 'Feature',
        geometry,
        properties: {
          id: layer.id,
          type: layer.type,
          tag: layer.tag,
          iconName: layer.iconName,
          lineSize: layer.lineSize,
          length: layer.length
        },
      };
    });

    const geojson = {
      type: 'FeatureCollection',
      features,
    };
    return JSON.stringify(geojson, null, 2);
  };

  const toKML = () => {
    let kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Facility Layout</name>`;

    layers.forEach(layer => {
      kmlContent += `
    <Placemark>
      <name>${layer.tag || 'Untitled'}</name>
      <description>Type: ${layer.type}, ID: ${layer.id}</description>`;
      
      if (layer.type === 'icon') {
        kmlContent += `
      <Point>
        <coordinates>${layer.latlng.lng},${layer.latlng.lat},0</coordinates>
      </Point>`;
      } else if (layer.type === 'pipeline') {
        const coordinates = layer.latlngs.map(p => `${p.lng},${p.lat},0`).join(' ');
        kmlContent += `
      <LineString>
        <coordinates>${coordinates}</coordinates>
      </LineString>`;
      }
      kmlContent += `
    </Placemark>`;
    });

    kmlContent += `
  </Document>
</kml>`;
    return kmlContent;
  };

  const toSVG = () => {
    if (layers.length === 0) return '';
    const allPoints = layers.flatMap(l => l.type === 'icon' ? [l.latlng] : l.latlngs);
    const utmPoints = allPoints.map(p => latLngToUtm(p.lat, p.lng));
    const minX = Math.min(...utmPoints.map(p => p.x));
    const minY = Math.min(...utmPoints.map(p => p.y));
    const maxX = Math.max(...utmPoints.map(p => p.x));
    const maxY = Math.max(...utmPoints.map(p => p.y));
    const padding = 50;
    const width = maxX - minX + 2 * padding;
    const height = maxY - minY + 2 * padding;

    let svgElements = '';
    layers.forEach(layer => {
        const utm = latLngToUtm(layer.latlng?.lat, layer.latlng?.lng);
        const x = (utm.x - minX + padding);
        const y = (height - (utm.y - minY + padding));

        if (layer.type === 'icon') {
            svgElements += `<circle cx="${x}" cy="${y}" r="8" fill="#0f766e" stroke="#14b8a6" stroke-width="2" />
<text x="${x}" y="${y - 12}" font-family="sans-serif" font-size="10" fill="#fff" text-anchor="middle">${layer.tag}</text>`;
        } else if (layer.type === 'pipeline') {
            const points = layer.latlngs.map(p => {
                const utmP = latLngToUtm(p.lat, p.lng);
                const px = utmP.x - minX + padding;
                const py = height - (utmP.y - minY + padding);
                return `${px},${py}`;
            }).join(' ');
            svgElements += `<polyline points="${points}" stroke="#0f766e" stroke-width="3" fill="none" />`;
            const midIndex = Math.floor(layer.latlngs.length / 2);
            const midPointUtm = latLngToUtm(layer.latlngs[midIndex].lat, layer.latlngs[midIndex].lng);
            const midX = midPointUtm.x - minX + padding;
            const midY = height - (midPointUtm.y - minY + padding);
            svgElements += `<text x="${midX}" y="${midY - 8}" font-family="sans-serif" font-size="10" fill="#fff" text-anchor="middle">${layer.tag}</text>`;
        }
    });

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background-color:#1e293b;">${svgElements}</svg>`;
  };

  const toDXF = () => {
    const d = new Drawing();
    d.addLayer('EQUIPMENT', Drawing.ACI.GREEN, 'CONTINUOUS');
    d.addLayer('PIPELINES', Drawing.ACI.CYAN, 'CONTINUOUS');
    d.addLayer('LABELS', Drawing.ACI.WHITE, 'CONTINUOUS');

    if (layers.length === 0) return d.toDxfString();

    const allPoints = layers.flatMap(l => l.type === 'icon' ? [l.latlng] : l.latlngs);
    if(allPoints.length === 0) return d.toDxfString();
    
    const utmPoints = allPoints.map(p => latLngToUtm(p.lat, p.lng));
    const originX = utmPoints[0].x;
    const originY = utmPoints[0].y;

    layers.forEach(layer => {
        if (layer.type === 'icon') {
            const utm = latLngToUtm(layer.latlng.lat, layer.latlng.lng);
            d.setActiveLayer('EQUIPMENT').drawCircle(utm.x - originX, utm.y - originY, 5);
            d.setActiveLayer('LABELS').drawText(utm.x - originX, utm.y - originY + 7, 2.5, 0, layer.tag);
        } else if (layer.type === 'pipeline') {
            const points = layer.latlngs.map(p => {
                const utmP = latLngToUtm(p.lat, p.lng);
                return [utmP.x - originX, utmP.y - originY];
            });
            d.setActiveLayer('PIPELINES').drawPolyline(points);
            const midIndex = Math.floor(layer.latlngs.length / 2);
            const midPointUtm = latLngToUtm(layer.latlngs[midIndex].lat, layer.latlngs[midIndex].lng);
            d.setActiveLayer('LABELS').drawText(midPointUtm.x - originX, midPointUtm.y - originY + 5, 2.5, 0, layer.tag);
        }
    });

    return d.toDxfString();
  };

  const handleExport = (format) => {
    if (layers.length === 0) {
      toast({ title: 'Export Failed', description: 'There is nothing to export.', variant: 'destructive' });
      return;
    }

    try {
      let blob;
      let filename;
      switch (format) {
        case 'svg':
          blob = new Blob([toSVG()], { type: 'image/svg+xml;charset=utf-8' });
          filename = 'facility_layout.svg';
          break;
        case 'dxf':
          blob = new Blob([toDXF()], { type: 'application/dxf;charset=utf-8' });
          filename = 'facility_layout.dxf';
          break;
        case 'kml':
          blob = new Blob([toKML()], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8' });
          filename = 'facility_layout.kml';
          break;
        case 'pdf':
          const doc = new jsPDF();
          doc.text("Facility Layout", 14, 16);
          const tableData = layers.map(l => [l.tag || 'N/A', l.type, l.id.substring(0,8)]);
          doc.autoTable({
            head: [['Tag', 'Type', 'ID']],
            body: tableData,
            startY: 22,
          });
          blob = doc.output('blob');
          filename = 'facility_layout.pdf';
          break;
        case 'geojson':
          blob = new Blob([toGeoJSON()], { type: 'application/geo+json;charset=utf-8' });
          filename = 'facility_layout.geojson';
          break;
        default:
          return;
      }
      saveAs(blob, filename);
      toast({ title: 'Export Successful!', description: `Downloaded ${filename}` });
    } catch (error) {
      console.error("Export error:", error);
      toast({ title: 'Export Failed', description: `An error occurred: ${error.message}`, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3 p-1">
      <h3 className="text-sm font-semibold text-slate-400 mb-2 px-1">CAD & GIS</h3>
      <Button onClick={() => handleExport('svg')} className="w-full justify-start bg-slate-800 hover:bg-slate-700 text-white">
        <Image className="w-4 h-4 mr-2" /> Export as SVG
      </Button>
      <Button onClick={() => handleExport('dxf')} className="w-full justify-start bg-slate-800 hover:bg-slate-700 text-white">
        <FileDown className="w-4 h-4 mr-2" /> Export as DXF
      </Button>
       <Button onClick={() => handleExport('kml')} className="w-full justify-start bg-slate-800 hover:bg-slate-700 text-white">
        <Globe className="w-4 h-4 mr-2" /> Export as KML
      </Button>
       <Button onClick={() => handleExport('geojson')} className="w-full justify-start bg-slate-800 hover:bg-slate-700 text-white">
        <FileJson className="w-4 h-4 mr-2" /> Export as GeoJSON
      </Button>
      <h3 className="text-sm font-semibold text-slate-400 pt-3 mb-2 px-1">Documents</h3>
      <Button onClick={() => handleExport('pdf')} className="w-full justify-start bg-slate-800 hover:bg-slate-700 text-white">
        <FileText className="w-4 h-4 mr-2" /> Export as PDF
      </Button>
    </div>
  );
};

export default ExportPanel;