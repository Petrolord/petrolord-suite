// Suite unit profile in a .pld: export carries the organisation default as
// hashed metadata, import reads it and offers it as MY units only. The
// manifest schema is unchanged (older builds verify and ignore the file).
// Negative controls: a tampered file is refused; a source without a
// profile writes no file; the offer never touches the organisation default.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import JSZip from 'jszip';
import { buildPackage } from '@/lib/portability/exportPackage';
import { readPackage, importPackage } from '@/lib/portability/importPackage';
import { validateManifest } from '@/lib/portability/manifest';
import { UNIT_PROFILE_FILE, unitProfileMeta, parseUnitProfileMeta, describeUnitMeta } from '../portability';
import { makeProfile } from '../presets';
import { StaticUnitProfileProvider } from '../UnitProfileContext';
import { PackageUnitsOffer } from '@/components/portability/PackageImportDialog';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const SRC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SRC_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FIELD = '00000010-0000-4000-8000-000000000000';

function makeSource(unitProfile) {
  const rows = { po_fields: [{ id: FIELD, user_id: SRC, organization_id: SRC_ORG, name: 'Keta Field', schema_version: 1 }], po_wells: [], po_field_totals: [] };
  const src = {
    async currentUser() { return { id: SRC, organization_id: SRC_ORG, organization_name: 'Source Co' }; },
    async getRow(table, id) { return (rows[table] || []).find((r) => r.id === id) || null; },
    async listChildren(table, column, parentId) { return (rows[table] || []).filter((r) => r[column] === parentId); },
    async downloadBlob() { throw new Error('no blobs'); },
    async listBlobs() { return []; },
    async listStateRowsForWells() { return []; },
    async getCustomCrs() { return null; },
  };
  if (unitProfile !== undefined) src.unitProfile = async () => unitProfile;
  return src;
}
const makeSink = () => {
  const store = { rows: {}, jobs: new Map(), items: [] };
  return {
    store,
    async currentUser() { return { id: DST, organization_id: null }; },
    async listMyWells() { return []; },
    async createJob(job) { const id = `00009000-0000-4000-8000-00000000000${store.jobs.size}`; store.jobs.set(id, { id, ...job }); return id; },
    async updateJob(id, patch) { Object.assign(store.jobs.get(id), patch); },
    async listItems(id) { return store.items.filter((i) => i.job_id === id); },
    async recordItems(id, items) { store.items.push(...items); },
    async mergeCustomCrs() {},
    async uploadBlob() {}, async removeBlob() {},
    async insertRows(table, r) { store.rows[table] = [...(store.rows[table] || []), ...r]; },
  };
};

describe('export and import', () => {
  test('the organisation default travels as hashed metadata and reads back', async () => {
    const built = await buildPackage(makeSource(makeProfile('metric', { pressure: 'bar' })), [{ kind: 'po_field', id: FIELD }], { name: 'Keta' });
    expect(validateManifest(built.manifest).ok).toBe(true);
    expect(built.manifest.files[UNIT_PROFILE_FILE].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(built.manifest.notes.join(' ')).toMatch(/Units: Made with Source Co's organisation default: Metric/);
    const bytes = await built.writer.toUint8Array();
    const pkg = await readPackage(bytes);
    expect(pkg.unitProfile.profile).toEqual({ preset: 'metric', units: { pressure: 'bar' }, version: 1 });
    expect(pkg.unitProfile.units.depth).toBe('m');
    expect(pkg.unitProfile.units.pressure).toBe('bar');
    // the data import is unaffected by the units
    const sink = makeSink();
    const res = await importPackage(bytes, sink);
    expect(res.pkg.unitProfile.source).toBe('organisation default');
    expect(sink.store.rows.po_fields[0].name).toBe('Keta Field');
  });

  test('no organisation default: the built-in preset is carried and named as such', async () => {
    const built = await buildPackage(makeSource(null), [{ kind: 'po_field', id: FIELD }]);
    const pkg = await readPackage(await built.writer.toUint8Array());
    expect(pkg.unitProfile.source).toBe('built-in default');
    expect(pkg.unitProfile.profile.preset).toBe('oilfield');
  });

  test('negative control: a source without a profile writes no file', async () => {
    const built = await buildPackage(makeSource(undefined), [{ kind: 'po_field', id: FIELD }]);
    expect(built.manifest.files[UNIT_PROFILE_FILE]).toBeUndefined();
    const pkg = await readPackage(await built.writer.toUint8Array());
    expect(pkg.unitProfile).toBeNull();
  });

  test('negative control: an edited unit file is refused as tampered', async () => {
    const built = await buildPackage(makeSource(makeProfile('metric')), [{ kind: 'po_field', id: FIELD }]);
    const zip = await JSZip.loadAsync(await built.writer.toUint8Array());
    zip.file(UNIT_PROFILE_FILE, JSON.stringify(unitProfileMeta(makeProfile('oilfield'))));
    const edited = await zip.generateAsync({ type: 'uint8array' });
    await expect(readPackage(edited)).rejects.toMatchObject({ code: 'tampered' });
  });

  test('parse refuses anything that is not a unit profile', () => {
    expect(parseUnitProfileMeta('{"kind":"other"}')).toBeNull();
    expect(parseUnitProfileMeta('not json')).toBeNull();
    expect(parseUnitProfileMeta(JSON.stringify({ kind: 'petrolord.unit-profile', profile: { preset: 'imperial', units: {} } }))).toBeNull();
    expect(describeUnitMeta(unitProfileMeta(makeProfile('oilfield', { depth: 'm' }), { organizationName: 'Keta' })))
      .toBe("Made with Keta's organisation default: Oilfield (ft, psi, degF, bbl), with 1 unit changed.");
  });
});

describe('import review offer', () => {
  test('offers the package units as MY units and never saves an organisation default', async () => {
    const saveMine = jest.fn().mockResolvedValue({ stored: 'database' });
    const saveOrganization = jest.fn();
    const meta = unitProfileMeta(makeProfile('metric'), { organizationName: 'Source Co' });
    render(<StaticUnitProfileProvider role="admin" onSaveMine={saveMine} onSaveOrganization={saveOrganization}><PackageUnitsOffer meta={meta} /></StaticUnitProfileProvider>);
    expect(screen.getByTestId('pld-import-units')).toHaveTextContent("Made with Source Co's organisation default: Metric");
    expect(screen.getByTestId('pld-import-units')).toHaveTextContent('Your organisation default does not change.');
    fireEvent.click(screen.getByTestId('pld-import-units-apply'));
    await waitFor(() => expect(screen.getByTestId('pld-import-units-message')).toHaveTextContent('Saved as your units.'));
    expect(saveMine).toHaveBeenCalledWith({ preset: 'metric', units: {}, version: 1 });
    expect(saveOrganization).not.toHaveBeenCalled();
  });
  test('without unit metadata nothing shows', () => {
    const { container } = render(<PackageUnitsOffer meta={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
