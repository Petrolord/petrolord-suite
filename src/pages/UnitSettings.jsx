// Units (Suite unit profile, owner approved 2026-09-30). The organisation
// default (admins edit, everyone else reads it with the admin named) and
// "My units" (follow the organisation, or my own). Changing units changes
// what people see and type; stored data never changes. Theme roles only.
import React, { useEffect, useMemo, useState } from 'react';
import { Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { useToast } from '@/components/ui/use-toast';
import { AccountScope, AccountPage, AccountHeader, accountCallout } from '@/components/account/accountChrome';
import { useUnitProfile } from '@/lib/units/UnitProfileContext';
import { FAMILIES, FAMILY_KEYS, unitInfo } from '@/lib/units/registry';
import { PRESETS, PRESET_LABELS, makeProfile, normalizeProfile } from '@/lib/units/presets';
import { resolveProfile, sourceLabel } from '@/lib/units/profile';

const unitLabel = (fam, u) => unitInfo(fam, u)?.label || u;

/** The draft's unit for a family ('' when a custom profile leaves it open). */
function draftUnit(draft, fam) {
  if (!draft) return '';
  return draft.units[fam] || PRESETS[draft.preset]?.[fam] || '';
}

/**
 * Preset picker and one row per family. For a preset, choosing the preset's
 * own unit drops the override; for custom, the empty choice leaves the
 * family to the next layer (`openLabel`).
 */
export function ProfileEditor({ draft, onChange, openLabel, inUse, sources, testId }) {
  const setPreset = (preset) => onChange(makeProfile(preset, preset === 'custom' ? draft.units : {}));
  const setUnit = (fam, unit) => {
    const units = { ...draft.units };
    if (!unit || (draft.preset !== 'custom' && PRESETS[draft.preset]?.[fam] === unit)) delete units[fam];
    else units[fam] = unit;
    onChange(makeProfile(draft.preset, units));
  };
  return (
    <div className="space-y-3" data-testid={testId}>
      <label className="block max-w-md text-sm text-pl-text">
        <span className="mb-1 block font-medium">Preset</span>
        <NativeSelect value={draft.preset} onChange={(e) => setPreset(e.target.value)} data-testid={`${testId}-preset`}>
          {Object.entries(PRESET_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </NativeSelect>
      </label>
      <FamilyTable
        rows={FAMILY_KEYS.map((fam) => ({ fam, value: draftUnit(draft, fam), changed: !!draft.units[fam] && draft.preset !== 'custom' }))}
        onSet={setUnit}
        openLabel={draft.preset === 'custom' ? openLabel : null}
        inUse={inUse}
        sources={sources}
        testId={testId}
      />
    </div>
  );
}

function FamilyTable({ rows, onSet, openLabel, inUse, sources, readOnly = false, testId }) {
  return (
    <div className="rounded-md border border-pl-border" role="table" aria-label="Units by quantity">
      <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-pl-border bg-pl-sunken px-3 py-2 text-xs font-semibold uppercase tracking-wide text-pl-muted sm:grid" role="row">
        <span role="columnheader">Quantity</span>
        <span role="columnheader">{readOnly ? 'Unit' : 'Choose'}</span>
        <span role="columnheader">{inUse ? 'In use for you' : ''}</span>
      </div>
      {rows.map(({ fam, value, changed }) => (
        <div key={fam} role="row" data-testid={`${testId}-row-${fam}`}
          className="grid grid-cols-1 gap-1 border-b border-pl-border px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-3">
          <span role="cell" className="text-sm text-pl-text">
            {FAMILIES[fam].label}
            {changed && <span className="ml-2 text-[11px] text-pl-accent-text">changed from preset</span>}
          </span>
          <span role="cell">
            {readOnly ? (
              <span className="text-sm text-pl-text">{value ? unitLabel(fam, value) : (openLabel || 'n/a')}</span>
            ) : (
              <NativeSelect compact value={value} onChange={(e) => onSet(fam, e.target.value)} aria-label={`${FAMILIES[fam].label} unit`} data-testid={`${testId}-${fam}`}>
                {openLabel && <option value="">{openLabel}</option>}
                {FAMILIES[fam].units.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
              </NativeSelect>
            )}
          </span>
          <span role="cell" className="text-xs text-pl-muted">
            {inUse ? <>{unitLabel(fam, inUse[fam])} <span className="text-pl-muted">({sourceLabel(sources?.[fam])})</span></> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function UnitSettings() {
  const profile = useUnitProfile();
  const { toast } = useToast();
  const orgRow = profile.layers?.organization || null;
  const userRow = profile.layers?.user || null;

  const [orgDraft, setOrgDraft] = useState(() => orgRow || makeProfile('oilfield'));
  const [mode, setMode] = useState(userRow ? 'own' : 'follow');
  const [myDraft, setMyDraft] = useState(() => userRow || makeProfile('custom'));
  const [busy, setBusy] = useState(null);

  // re-seed the drafts when the stored rows arrive or change
  const orgKey = JSON.stringify(orgRow); const userKey = JSON.stringify(userRow);
  useEffect(() => { setOrgDraft(orgRow || makeProfile('oilfield')); }, [orgKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setMode(userRow ? 'own' : 'follow'); setMyDraft(userRow || makeProfile('custom')); }, [userKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // what the user would see with the drafts applied
  const preview = useMemo(() => resolveProfile({
    user: mode === 'own' ? myDraft : null,
    organization: profile.isOrgAdmin ? orgDraft : orgRow,
    legacyDepthUnit: profile.layers?.legacyDepthUnit || null,
  }), [mode, myDraft, orgDraft, orgRow, profile.isOrgAdmin, profile.layers]);

  const run = async (what, fn, done) => {
    setBusy(what);
    try {
      const res = await fn();
      toast({ title: done(res) });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Units not saved', description: e.message });
    } finally {
      setBusy(null);
    }
  };

  const adminName = profile.orgMeta?.updatedByName || 'an organisation admin';
  const orgDirty = JSON.stringify(normalizeProfile(orgDraft)) !== JSON.stringify(orgRow);
  const myDirty = mode === 'follow' ? !!userRow : JSON.stringify(normalizeProfile(myDraft)) !== JSON.stringify(userRow);

  return (
    <AccountScope testId="unit-settings">
      <AccountPage width="max-w-4xl">
        <AccountHeader
          icon={Ruler}
          title="Units"
          description="One set of units for every Suite app. Units change what you see and type; the data you have stored never changes."
        />

        {!profile.tableAvailable && (
          <div className={accountCallout('info')} data-testid="units-table-absent" role="status">
            Organisation units are not switched on for this database yet. Until they are, the Suite uses the built-in
            oilfield units and your earlier depth setting, and your own units are kept in this browser.
          </div>
        )}

        <Card data-testid="units-org-card">
          <CardHeader>
            <CardTitle className="text-lg">Organisation default</CardTitle>
            <CardDescription>
              {profile.isOrgAdmin
                ? 'Everyone in your organisation starts from these units. People can still pick their own below.'
                : orgRow
                  ? `Set by ${adminName}. Only an organisation admin can change it.`
                  : 'Your organisation has not set a default yet, so the built-in oilfield units apply. Only an organisation admin can set one.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile.isOrgAdmin ? (
              <>
                <ProfileEditor draft={orgDraft} onChange={setOrgDraft} openLabel="Built-in default" testId="units-org" />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => run('org', () => profile.saveOrganization(orgDraft), () => 'Organisation default saved')}
                    disabled={!!busy || !orgDirty || !profile.tableAvailable} data-testid="units-org-save">
                    {busy === 'org' ? 'Saving...' : 'Save organisation default'}
                  </Button>
                  {orgRow && (
                    <Button variant="outline" onClick={() => run('org', () => profile.saveOrganization(null), () => 'Organisation default cleared; the built-in units apply')}
                      disabled={!!busy} data-testid="units-org-clear">
                      Clear organisation default
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <FamilyTable readOnly testId="units-org-view"
                rows={FAMILY_KEYS.map((fam) => ({ fam, value: orgRow ? draftUnit(orgRow, fam) : PRESETS.oilfield[fam] }))}
                openLabel="Built-in default" />
            )}
          </CardContent>
        </Card>

        <Card data-testid="units-mine-card">
          <CardHeader>
            <CardTitle className="text-lg">My units</CardTitle>
            <CardDescription>Follow the organisation default, or choose your own. A custom set changes only the quantities you pick.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset className="flex flex-col gap-2 sm:flex-row sm:gap-6" data-testid="units-mine-mode">
              <legend className="sr-only">My units</legend>
              <label className="flex items-center gap-2 text-sm text-pl-text">
                <input type="radio" name="units-mode" value="follow" checked={mode === 'follow'} onChange={() => setMode('follow')} data-testid="units-mine-follow" />
                Follow the organisation default
              </label>
              <label className="flex items-center gap-2 text-sm text-pl-text">
                <input type="radio" name="units-mode" value="own" checked={mode === 'own'} onChange={() => setMode('own')} data-testid="units-mine-own" />
                Use my own units
              </label>
            </fieldset>
            {mode === 'own' ? (
              <ProfileEditor draft={myDraft} onChange={setMyDraft} openLabel="Follow organisation" inUse={preview.units} sources={preview.sources} testId="units-mine" />
            ) : (
              <FamilyTable readOnly testId="units-mine-view" rows={FAMILY_KEYS.map((fam) => ({ fam, value: preview.units[fam] }))} inUse={null} />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => run('mine', () => profile.saveMine(mode === 'own' ? myDraft : null),
                (res) => (res?.stored === 'browser' ? 'Your units are saved in this browser' : 'Your units are saved'))}
                disabled={!!busy || !myDirty} data-testid="units-mine-save">
                {busy === 'mine' ? 'Saving...' : 'Save my units'}
              </Button>
              <span className="text-xs text-pl-muted">Open apps follow the change straight away. A view you switched inside an app keeps that choice for this session.</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">How units are chosen</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-pl-muted" data-testid="units-help">
            <p>For each quantity the Suite takes the first of: your own units, the organisation default, your earlier depth setting (depth only), then the built-in oilfield units.</p>
            <p>An app&apos;s own unit switch changes that view for this session only, and the app says when a view differs from your units.</p>
            <p>Saved Well Test, Nodal and ReservoirCalc Pro projects keep the units they were saved with; new projects start from your units.</p>
            <p>Every stored value stays in its canonical unit (metres, pascals, cubic metres and so on), so changing units never changes your data. A .pld project package carries the organisation default as information, and importing one offers it as your own setting.</p>
          </CardContent>
        </Card>
      </AccountPage>
    </AccountScope>
  );
}
