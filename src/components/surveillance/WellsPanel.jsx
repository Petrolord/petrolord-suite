// Well register for the current field: as-imported labels, well type
// (producer/injector drives the exception rules) and the wellsRegistry
// linkage. Linking is by id, never by free-text name, so downstream
// apps join production to subsurface data safely.
import React, { useMemo } from 'react';
import { Link2, Link2Off, Wand2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useSurveillance } from '@/contexts/ProductionSurveillanceContext';

// The four types po_wells accepts (20260829120000_p1_create_po_spine.sql).
const WELL_TYPES = [
  { value: 'producer', label: 'Producer' },
  { value: 'injector', label: 'Injector' },
  { value: 'observation', label: 'Observation' },
  { value: 'other', label: 'Other' },
];

const WellsPanel = () => {
  const {
    wells, geoWells, wellSeries, canEditField, currentField,
    registrySuggestions, applySuggestedLinks, setWellType,
  } = useSurveillance();

  const geoById = useMemo(
    () => new Map((geoWells || []).map((g) => [g.id, g])),
    [geoWells],
  );
  const statsById = useMemo(() => {
    const m = new Map();
    wellSeries.forEach(({ well, points }) => {
      const last = points[points.length - 1];
      m.set(well.id, { rows: points.length, first: points[0]?.date, last: last?.date });
    });
    return m;
  }, [wellSeries]);

  if (!currentField) return null;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-base">
          Wells <span className="text-slate-500 font-normal">({wells.length})</span>
        </CardTitle>
        {canEditField && registrySuggestions.length > 0 && (
          <Button size="sm" variant="outline" onClick={applySuggestedLinks}>
            <Wand2 className="w-4 h-4 mr-1" />
            Link {registrySuggestions.length} to registry
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {wells.length === 0 ? (
          <p className="text-sm text-slate-500">
            No wells yet. Wells are created from the well column of the first ledger or well-test
            import.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-3 font-semibold">Well</th>
                  <th className="py-2 pr-3 font-semibold">Type</th>
                  <th className="py-2 pr-3 font-semibold">Ledger rows</th>
                  <th className="py-2 pr-3 font-semibold">Period</th>
                  <th className="py-2 font-semibold">Registry</th>
                </tr>
              </thead>
              <tbody>
                {wells.map((w) => {
                  const stats = statsById.get(w.id);
                  const geo = w.geo_well_id ? geoById.get(w.geo_well_id) : null;
                  return (
                    <tr key={w.id} className="border-b border-slate-800/60 last:border-0">
                      <td className="py-2 pr-3 text-slate-200">{w.name}</td>
                      <td className="py-2 pr-3">
                        {canEditField ? (
                          <Select
                            value={w.well_type || 'producer'}
                            onValueChange={(v) => setWellType(w.id, v)}
                          >
                            <SelectTrigger className="h-7 w-28 bg-slate-800 border-slate-700 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                              {WELL_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-slate-400 capitalize">{w.well_type || 'producer'}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-slate-400">{(stats?.rows || 0).toLocaleString()}</td>
                      <td className="py-2 pr-3 text-slate-500 text-xs">
                        {stats?.first ? `${stats.first} to ${stats.last}` : 'no ledger rows'}
                      </td>
                      <td className="py-2 text-xs">
                        {geo ? (
                          <span className="flex items-center gap-1.5 text-emerald-400">
                            <Link2 size={12} /> {geo.name}
                          </span>
                        ) : w.geo_well_id ? (
                          <span className="flex items-center gap-1.5 text-slate-400">
                            <Link2 size={12} /> linked
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <Link2Off size={12} /> not linked
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-[11px] text-slate-500 flex items-start gap-1.5">
          <Users size={12} className="mt-0.5 shrink-0" />
          Well type drives the exception rules: producers are surveilled on oil rate, watercut,
          GOR and hours on stream; injectors on injection rate; observation wells are left out of
          exception surveillance.
        </p>
      </CardContent>
    </Card>
  );
};

export default WellsPanel;
