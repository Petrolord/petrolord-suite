/**
 * Suite unit profile settings (/dashboard/units): the real provider over a
 * stand-in Supabase client. Admins edit the organisation default; members
 * read it with the admin named; "My units" follows the organisation or
 * takes a custom set; the table-absent state explains itself.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';

const mockTables = {};
jest.mock('@/lib/customSupabaseClient', () => {
  const { makeSupabase } = require('./accountTestKit');
  return { supabase: new Proxy({}, { get: (_t, p) => makeSupabase(mockTables)[p] }) };
});

import { describeAppTheme } from '@/design/testing/themeAssertions';
import UnitSettings from '@/pages/UnitSettings';
import { UnitProfileProvider, StaticUnitProfileProvider } from '@/lib/units/UnitProfileContext';
import { invalidateLayers } from '@/lib/units/profileService';
import { makeProfile } from '@/lib/units/presets';
import { renderAccountPage } from './accountTestKit';

const WithProvider = () => <UnitProfileProvider><UnitSettings /></UnitProfileProvider>;
const setTables = (t) => { for (const k of Object.keys(mockTables)) delete mockTables[k]; Object.assign(mockTables, t); invalidateLayers('u1'); };

const ORG_METRIC = { scope: 'organization', organization_id: 'o1', profile: makeProfile('metric'), updated_by: 'adm', updated_at: '2026-09-30' };

describeAppTheme({
  name: 'Units',
  route: '/dashboard/units',
  renderApp: () => { setTables({ suite_unit_settings: [ORG_METRIC], organization_members: [{ full_name: 'Ada Admin' }], geoscience_settings: [] }); return renderAccountPage(WithProvider, { auth: { role: 'member' } }); },
  ready: () => screen.findByText(/Set by Ada Admin/),
  scopeTestId: 'unit-settings',
  userId: 'u1',
});

describe('Units settings', () => {
  beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); });

  test('a member reads the organisation default with the admin named, and cannot edit it', async () => {
    setTables({ suite_unit_settings: [ORG_METRIC], organization_members: [{ full_name: 'Ada Admin' }], geoscience_settings: [] });
    renderAccountPage(WithProvider, { auth: { role: 'member' } });
    expect(await screen.findByText(/Set by Ada Admin\. Only an organisation admin can change it\./)).toBeInTheDocument();
    expect(screen.queryByTestId('units-org-save')).toBeNull();
    expect(screen.getByTestId('units-org-view-row-depth')).toHaveTextContent('m');
    // following the organisation: depth in metres from the organisation default
    expect(screen.getByTestId('units-mine-follow')).toBeChecked();
    expect(screen.getByTestId('units-mine-view-row-pressure')).toHaveTextContent('kPa');
    expect(screen.getByTestId('units-help')).toHaveTextContent('never changes your data');
  });

  test('an admin edits the preset and one family, and saves', async () => {
    const saveOrg = jest.fn().mockResolvedValue();
    renderAccountPage(() => (
      <StaticUnitProfileProvider layers={{ organization: makeProfile('metric'), tableAvailable: true }} role="admin" onSaveOrganization={saveOrg}>
        <UnitSettings />
      </StaticUnitProfileProvider>
    ));
    expect(screen.getByTestId('units-org-save')).toBeDisabled(); // nothing changed yet
    fireEvent.change(screen.getByTestId('units-org-pressure'), { target: { value: 'bar' } });
    expect(screen.getByTestId('units-org-row-pressure')).toHaveTextContent('changed from preset');
    fireEvent.click(screen.getByTestId('units-org-save'));
    await waitFor(() => expect(saveOrg).toHaveBeenCalledWith({ preset: 'metric', units: { pressure: 'bar' }, version: 1 }));
    // choosing the preset's own unit again drops the override
    fireEvent.change(screen.getByTestId('units-org-pressure'), { target: { value: 'kPa' } });
    expect(screen.getByTestId('units-org-row-pressure')).not.toHaveTextContent('changed from preset');
  });

  test('my own custom units change one family and show where each unit comes from', async () => {
    const saveMine = jest.fn().mockResolvedValue({ stored: 'database' });
    renderAccountPage(() => (
      <StaticUnitProfileProvider layers={{ organization: makeProfile('metric'), tableAvailable: true }} onSaveMine={saveMine}>
        <UnitSettings />
      </StaticUnitProfileProvider>
    ));
    fireEvent.click(screen.getByTestId('units-mine-own'));
    fireEvent.change(screen.getByTestId('units-mine-depth'), { target: { value: 'ft' } });
    expect(screen.getByTestId('units-mine-row-depth')).toHaveTextContent('(your setting)');
    expect(screen.getByTestId('units-mine-row-pressure')).toHaveTextContent('(organisation default)');
    fireEvent.click(screen.getByTestId('units-mine-save'));
    await waitFor(() => expect(saveMine).toHaveBeenCalledWith({ preset: 'custom', units: { depth: 'ft' }, version: 1 }));
  });

  test('going back to following the organisation clears my row', async () => {
    const saveMine = jest.fn().mockResolvedValue({ stored: 'database' });
    renderAccountPage(() => (
      <StaticUnitProfileProvider layers={{ user: makeProfile('oilfield'), tableAvailable: true }} onSaveMine={saveMine}>
        <UnitSettings />
      </StaticUnitProfileProvider>
    ));
    expect(screen.getByTestId('units-mine-own')).toBeChecked();
    fireEvent.click(screen.getByTestId('units-mine-follow'));
    fireEvent.click(screen.getByTestId('units-mine-save'));
    await waitFor(() => expect(saveMine).toHaveBeenCalledWith(null));
  });

  test('table not applied yet: plain words, the built-in default shows, the admin cannot save the organisation default', async () => {
    renderAccountPage(() => (
      <StaticUnitProfileProvider layers={{ tableAvailable: false, legacyDepthUnit: 'm' }} role="admin">
        <UnitSettings />
      </StaticUnitProfileProvider>
    ));
    expect(screen.getByTestId('units-table-absent')).toHaveTextContent('not switched on for this database yet');
    fireEvent.change(screen.getByTestId('units-org-pressure'), { target: { value: 'bar' } });
    expect(screen.getByTestId('units-org-save')).toBeDisabled();
  });
});
