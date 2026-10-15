// Suite Projects P2: the current project's settings (units, CRS, datum,
// timescale edition) on the Projects page. Owners and organisation admins
// edit; everyone else reads. A setting changes what people see, type and
// import from then on; stored data is never rewritten.
import React, { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useToast } from '@/components/ui/use-toast';
import { useProject } from '@/contexts/ProjectContext';
import { ProfileEditor } from '@/pages/UnitSettings';
import { makeProfile } from '@/lib/units/presets';
import { DEPTH_REF_KINDS, COMMON_VERTICAL_DATUMS } from '@/lib/wellDatum';
import { setProjectCrs } from '@/lib/crs/settingsService';
import { TIMESCALE_VERSION, TIMESCALE_VERSIONS } from '@/lib/stratigraphy/timescale';

function Section({ title, children, testId }) {
  return (
    <div className="space-y-2 border-b border-pl-border pb-4 last:border-b-0 last:pb-0" data-testid={testId}>
      <h3 className="text-sm font-medium text-pl-text">{title}</h3>
      {children}
    </div>
  );
}

export default function ProjectSettingsCard() {
  const p = useProject();
  const { toast } = useToast();
  const [busy, setBusy] = useState(null);
  const s = p.settings;
  const canEdit = p.canManage(p.current);

  const [unitsMode, setUnitsMode] = useState(s.units ? 'project' : 'follow');
  const [unitsDraft, setUnitsDraft] = useState(() => s.units || makeProfile('oilfield'));
  const [crsTag, setCrsTag] = useState(s.crs?.tag || '');
  const [crsName, setCrsName] = useState(s.crs?.name || '');
  const [datum, setDatum] = useState({ refKind: s.datum?.refKind || '', verticalDatum: s.datum?.verticalDatum || '', srdM: s.datum?.srdM ?? '' });
  const [timescale, setTimescale] = useState(s.timescale || '');
  const [seismic, setSeismic] = useState({ storage: s.seismic?.storage || 'cloud', previews: s.seismic?.previews || '' });

  // re-seed when the project (or its stored settings) changes
  const key = `${p.current?.id}:${JSON.stringify(s)}`;
  useEffect(() => {
    setUnitsMode(s.units ? 'project' : 'follow');
    setUnitsDraft(s.units || makeProfile('oilfield'));
    setCrsTag(s.crs?.tag || ''); setCrsName(s.crs?.name || '');
    setDatum({ refKind: s.datum?.refKind || '', verticalDatum: s.datum?.verticalDatum || '', srdM: s.datum?.srdM ?? '' });
    setTimescale(s.timescale || '');
    setSeismic({ storage: s.seismic?.storage || 'cloud', previews: s.seismic?.previews || '' });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (what, fn, done) => {
    setBusy(what);
    try { await fn(); toast({ title: done }); } catch (e) {
      toast({ variant: 'destructive', title: 'Setting not saved', description: e.message });
    } finally { setBusy(null); }
  };

  if (!p.available || !p.current) return null;

  return (
    <Card data-testid="projects-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><SlidersHorizontal className="h-4 w-4" /> Settings for {p.current.name}</CardTitle>
        <CardDescription>
          Every app in this project uses these. A change applies to what you see, type and import from now on;
          data already stored never changes.{!canEdit && ' Only the project owner or an organisation admin can change them.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Section title="Units" testId="projects-settings-units">
          <NativeSelect value={unitsMode} disabled={!canEdit} onChange={(e) => setUnitsMode(e.target.value)} className="max-w-md" data-testid="projects-settings-units-mode">
            <option value="follow">Follow the organisation default</option>
            <option value="project">Set units for this project</option>
          </NativeSelect>
          {unitsMode === 'project' && canEdit && (
            <ProfileEditor draft={unitsDraft} onChange={setUnitsDraft} openLabel="Organisation default" testId="projects-settings-profile" />
          )}
          <p className="text-xs text-pl-muted">Anyone who chose their own units on the Units page keeps them.</p>
          {canEdit && (
            <Button size="sm" disabled={busy === 'units'} data-testid="projects-settings-units-save"
              onClick={() => run('units', () => p.saveSettings({ units: unitsMode === 'project' ? unitsDraft : null }), 'Project units saved')}>
              Save units
            </Button>
          )}
        </Section>

        <Section title="Coordinate reference system" testId="projects-settings-crs">
          {p.isDefault ? (
            <p className="text-xs text-pl-muted">In the Default project each person keeps their own Project CRS, set in Seismolord or on first import.</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={crsTag} disabled={!canEdit} onChange={(e) => setCrsTag(e.target.value)} placeholder="EPSG:26332, CUSTOM:..., or LOCAL" aria-label="Project CRS" data-testid="projects-settings-crs-tag" />
                <Input value={crsName} disabled={!canEdit} onChange={(e) => setCrsName(e.target.value)} placeholder="Name, for example Minna / UTM zone 32N" aria-label="CRS name" />
              </div>
              <p className="text-xs text-pl-muted">Imports into this project convert into this system. Once the project holds data in it, change it with Seismolord&apos;s reproject flow.</p>
              {canEdit && (
                <Button size="sm" disabled={!crsTag.trim() || busy === 'crs'} data-testid="projects-settings-crs-save"
                  onClick={() => run('crs', () => setProjectCrs({ tag: crsTag.trim(), name: crsName.trim() || null }), 'Project CRS saved')}>
                  Save CRS
                </Button>
              )}
            </>
          )}
        </Section>

        <Section title="Datum" testId="projects-settings-datum">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-pl-muted">Depth reference for new wells
              <NativeSelect value={datum.refKind} disabled={!canEdit} onChange={(e) => setDatum({ ...datum, refKind: e.target.value })} data-testid="projects-settings-datum-ref">
                <option value="">KB (built-in)</option>
                {DEPTH_REF_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </NativeSelect>
            </label>
            <label className="text-xs text-pl-muted">Vertical datum
              <NativeSelect value={datum.verticalDatum} disabled={!canEdit} onChange={(e) => setDatum({ ...datum, verticalDatum: e.target.value })}>
                <option value="">Not set</option>
                {COMMON_VERTICAL_DATUMS.map((k) => <option key={k} value={k}>{k}</option>)}
              </NativeSelect>
            </label>
            <label className="text-xs text-pl-muted">Seismic reference datum (m above sea level)
              <Input value={datum.srdM} disabled={!canEdit} onChange={(e) => setDatum({ ...datum, srdM: e.target.value })} inputMode="decimal" placeholder="0" />
            </label>
          </div>
          {canEdit && (
            <Button size="sm" disabled={busy === 'datum'} data-testid="projects-settings-datum-save"
              onClick={() => run('datum', () => p.saveSettings({ datum: { refKind: datum.refKind || null, verticalDatum: datum.verticalDatum || null, srdM: datum.srdM === '' ? null : datum.srdM } }), 'Datum defaults saved')}>
              Save datum
            </Button>
          )}
        </Section>

        <Section title="Seismic storage" testId="projects-settings-seismic">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-pl-muted">Where new seismic volumes live
              <NativeSelect value={seismic.storage} disabled={!canEdit} onChange={(e) => setSeismic({ ...seismic, storage: e.target.value })} data-testid="projects-settings-seismic-storage">
                <option value="local">On each person&apos;s computer (nothing uploaded)</option>
                <option value="cloud">On Petrolord servers</option>
              </NativeSelect>
            </label>
            <label className="text-xs text-pl-muted">Previews of local volumes
              <NativeSelect value={seismic.previews} disabled={!canEdit} onChange={(e) => setSeismic({ ...seismic, previews: e.target.value })} data-testid="projects-settings-seismic-previews">
                <option value="">{p.current.visibility === 'members' ? 'Off (members-only project)' : 'Shared with the project'}</option>
                <option value="on">Always share small previews</option>
                <option value="off">Never share previews</option>
              </NativeSelect>
            </label>
          </div>
          <p className="text-xs text-pl-muted">Volumes already imported stay where they are. Local volumes never leave the computer unless their owner copies them to the cloud; colleagues see their name, geometry, horizons and, if allowed, a small preview.</p>
          {canEdit && (
            <Button size="sm" disabled={busy === 'seismic'} data-testid="projects-settings-seismic-save"
              onClick={() => run('seismic', () => p.saveSettings({ seismic: { storage: seismic.storage, previews: seismic.previews || null } }), 'Seismic storage saved')}>
              Save seismic storage
            </Button>
          )}
        </Section>

        <Section title="Geologic timescale" testId="projects-settings-timescale">
          <NativeSelect value={timescale} disabled={!canEdit} onChange={(e) => setTimescale(e.target.value)} className="max-w-md" data-testid="projects-settings-timescale-select">
            <option value="">Current chart ({TIMESCALE_VERSION})</option>
            {TIMESCALE_VERSIONS.filter((v) => v !== TIMESCALE_VERSION).map((v) => <option key={v} value={v}>Stay on {v}</option>)}
          </NativeSelect>
          <p className="text-xs text-pl-muted">Stratigraphy lookups, stage fills and exports use this edition. Every age keeps the edition it was entered under.</p>
          {canEdit && (
            <Button size="sm" disabled={busy === 'timescale'} data-testid="projects-settings-timescale-save"
              onClick={() => run('timescale', () => p.saveSettings({ timescale: timescale || null }), 'Chart edition saved')}>
              Save chart edition
            </Button>
          )}
        </Section>
      </CardContent>
    </Card>
  );
}
