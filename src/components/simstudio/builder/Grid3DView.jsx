// 3D model preview (S5): the current builder form rendered as a rotatable
// structure surface (depth-colored) with the wells — vertical sticks or
// deviated survey paths — drawn in place. Pure math lives in simGridViz;
// this card only holds the view controls and the SVG. Display only: the
// deck geometry is still exactly what Generate composes.
import React, { useMemo, useState } from 'react';
import { Box } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { gridFromForm } from '@/utils/simDeckBuilder';
import { parseSurveyText, buildTrajectoryConnections } from '@/utils/simTrajectoryImport';
import {
  buildGridScene, wellLineVertical, wellLineFromPath, projectScene, autoVertExag,
} from '@/utils/simGridViz';

const WELL_COLORS = { producer: '#a3e635', water_injector: '#38bdf8', gas_injector: '#fb7185' };

// Legend key: the well colour as a dot beside its word, so the key reads on
// the themed page and matches the strokes on the dark canvas.
const Swatch = ({ type }) => (
  <span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: WELL_COLORS[type] }} />
);

const Slider = ({ label, value, min, max, onChange, testId }) => (
  <div className="space-y-1 w-36">
    <Label className="text-[11px] text-pl-muted">{label}: {value}</Label>
    <input type="range" min={min} max={max} value={value} data-testid={testId}
      onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-pl-primary" />
  </div>
);

const Grid3DView = ({ form }) => {
  const [azimuth, setAzimuth] = useState(225);
  const [elevation, setElevation] = useState(35);
  const [vertExag, setVertExag] = useState(0); // 0 = auto
  const [showWells, setShowWells] = useState(true);

  const built = useMemo(() => {
    let grid;
    try {
      grid = gridFromForm(form);
      if (!(grid.nx >= 1 && grid.ny >= 1 && grid.nz >= 1 && grid.dx > 0 && grid.dy > 0)) {
        return { error: 'Set the grid dimensions and cell sizes first.' };
      }
      const scene = buildGridScene(grid);
      const skipped = [];
      if (showWells) {
        form.wells.forEach((w) => {
          const name = String(w.name || '').trim().toUpperCase() || '?';
          try {
            if (w.trajectory?.enabled) {
              const { stations, errors } = parseSurveyText(w.trajectory.text);
              if (errors.length) throw new Error(errors[0]);
              const t = buildTrajectoryConnections({
                stations,
                mdUnit: w.trajectory.mdUnit === 'm' ? 'm' : 'ft',
                wellheadX: parseFloat(w.trajectory.wellheadX),
                wellheadY: parseFloat(w.trajectory.wellheadY),
                kbToDatumFt: parseFloat(w.trajectory.kbToDatum) || 0,
              }, grid);
              scene.wells.push(wellLineFromPath({ name, type: w.type }, t.pathFt));
            } else {
              scene.wells.push(wellLineVertical({
                name,
                type: w.type,
                i: Math.round(parseFloat(w.i)) || 1,
                j: Math.round(parseFloat(w.j)) || 1,
                k1: Math.round(parseFloat(w.k1)) || 1,
                k2: Math.round(parseFloat(w.k2)) || grid.nz,
              }, grid));
            }
          } catch {
            skipped.push(name);
          }
        });
      }
      return { scene, ve: autoVertExag(scene), skipped };
    } catch (e) {
      return { error: e.message };
    }
  }, [form, showWells]);

  const view = useMemo(() => {
    if (!built.scene) return null;
    return projectScene(built.scene, {
      azimuthDeg: azimuth,
      elevationDeg: elevation,
      vertExag: vertExag || built.ve,
    });
  }, [built, azimuth, elevation, vertExag]);

  const pad = view ? Math.max(view.extent.width, view.extent.height) * 0.06 : 0;
  const strokeW = view ? Math.max(view.extent.width, view.extent.height) / 500 : 1;
  const points = (pts) => pts.map((p) => p.join(',')).join(' ');

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <Box className="w-4 h-4 text-pl-muted" /> 3D preview
        </CardTitle>
        <label className="flex items-center gap-2 text-[11px] text-pl-muted">
          <input type="checkbox" checked={showWells} onChange={(e) => setShowWells(e.target.checked)} />
          Wells
        </label>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-4">
          <Slider label="Azimuth" value={azimuth} min={0} max={360} onChange={setAzimuth} testId="viz-azimuth" />
          <Slider label="Elevation" value={elevation} min={5} max={90} onChange={setElevation} testId="viz-elevation" />
          <Slider label={`Vert. exag.${vertExag ? '' : ` (auto ${built.ve ?? ''}×)`}`}
            value={vertExag || built.ve || 1} min={1} max={50} onChange={setVertExag} testId="viz-ve" />
        </div>
        {built.error && (
          <p className="text-[11px] text-pl-warning-text">{built.error}</p>
        )}
        {view && (
          <>
            {/* Dark display canvas in both themes: the depth colours and well
                strokes were tuned on a near-black ground. */}
            <div data-canvas="dark" className="w-full max-w-[560px] overflow-hidden rounded-pl-canvas border border-pl-border bg-pl-bg">
            <svg
              viewBox={`${view.extent.minX - pad} ${view.extent.minY - pad} ${view.extent.width + 2 * pad} ${view.extent.height + 2 * pad}`}
              className="block w-full"
              role="img" aria-label="3D model preview" data-testid="viz-svg">
              {view.polys.map((q, idx) => (
                <polygon key={idx} points={points(q.pts)} fill={q.fill} fillOpacity="0.92"
                  stroke="#0f172a" strokeWidth={strokeW * 0.4} />
              ))}
              {view.posts.map((seg, idx) => (
                <polyline key={`p${idx}`} points={points(seg)} fill="none"
                  stroke="#475569" strokeWidth={strokeW} />
              ))}
              {view.wells.map((w) => (
                <g key={w.name}>
                  {w.stalk && (
                    <polyline points={points(w.stalk)} fill="none" stroke={WELL_COLORS[w.type] || '#e2e8f0'}
                      strokeWidth={strokeW * 1.2} strokeDasharray={`${strokeW * 3} ${strokeW * 3}`} />
                  )}
                  <polyline points={points(w.path)} fill="none" stroke={WELL_COLORS[w.type] || '#e2e8f0'}
                    strokeWidth={strokeW * 2.2} strokeLinecap="round" />
                  <text x={(w.stalk || w.path)[0][0]} y={(w.stalk || w.path)[0][1] - strokeW * 6}
                    fill={WELL_COLORS[w.type] || '#e2e8f0'} fontSize={strokeW * 12} textAnchor="middle">
                    {w.name}
                  </text>
                </g>
              ))}
            </svg>
            </div>
            <p className="text-[11px] text-pl-muted">
              Structure surface colored shallow (warm) to deep (cool); node depths are smoothed from the
              block-centred cell tops for display. Wells: <Swatch type="producer" />producers,{' '}
              <Swatch type="water_injector" />water injectors, <Swatch type="gas_injector" />gas injectors;
              dashed = uncompleted stalk.
              {built.skipped?.length ? ` Not drawn (incomplete input): ${built.skipped.join(', ')}.` : ''}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default Grid3DView;
