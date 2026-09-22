// Site dialog: the Minna to WGS 84 transformation in use, its accuracy,
// the per-site override, and that the override is what lon/lat uses.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/components/ui/select', () => {
  const R = require('react');
  const Ctx = R.createContext(null);
  return {
    Select: ({ value, onValueChange, children }) => (
      <Ctx.Provider value={{ value, onValueChange }}>{children}</Ctx.Provider>
    ),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }) => {
      const c = R.useContext(Ctx);
      return (
        <select value={c.value ?? ''} onChange={(e) => c.onValueChange(e.target.value)}>
          {children}
        </select>
      );
    },
    SelectItem: ({ value, children }) => <option value={value}>{children}</option>,
  };
});

import SiteDialog from '../components/SiteDialog';
import { siteCrsOpts, siteDatumTransform, withDatumTransform } from '../services/siteCrs';
import { toLonLat } from '@/lib/crs';

// West Belt grid point at about 5.5N 5.0E (Niger delta onshore).
const X = 286131.31;
const Y = 165839.51;

const datumSelect = () => screen.getAllByRole('combobox')
  .find((el) => [...el.options].some((o) => o.value === 'EPSG:1754'));

test('siteCrsOpts carries a valid override and drops one that does not apply', () => {
  expect(siteCrsOpts({ crs: 'EPSG:26391' })).toEqual({});
  expect(siteCrsOpts({ crs: 'EPSG:26391', crs_provenance: { datum_transform: 'EPSG:1168' } }))
    .toEqual({ datumTransform: 'EPSG:1168' });
  expect(siteDatumTransform({ crs: 'EPSG:26393', crs_provenance: { datum_transform: 'EPSG:1754' } })).toBeNull();
  expect(siteDatumTransform({ crs: 'EPSG:32631', crs_provenance: { datum_transform: 'EPSG:1168' } })).toBeNull();
  expect(withDatumTransform({ declared_crs: 'x', datum_transform: 'EPSG:1168' }, null)).toEqual({ declared_crs: 'x' });
  expect(withDatumTransform(null, 'EPSG:1168')).toEqual({ datum_transform: 'EPSG:1168' });
});

test('the override moves the site lon/lat by the published difference (about 10 m)', () => {
  const site = { crs: 'EPSG:26391', crs_provenance: { datum_transform: 'EPSG:1168' } };
  const a = toLonLat(site.crs, X, Y);
  const b = toLonLat(site.crs, X, Y, {}, siteCrsOpts(site));
  const dE = (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  const dN = (a.lat - b.lat) * 110574;
  const d = Math.hypot(dE, dN);
  expect(d).toBeGreaterThan(8);
  expect(d).toBeLessThan(12);
});

test('picking a Minna site shows the transformation, its accuracy, and saves an override', async () => {
  const onSave = jest.fn(async () => {});
  render(
    <SiteDialog
      open
      onOpenChange={() => {}}
      site={{ id: 's1', name: 'Pad A', crs: 'EPSG:26391', origin_x: X, origin_y: Y, crs_provenance: { note: 'kept' } }}
      onSave={onSave}
    />,
  );
  const acc = screen.getByTestId('site-datum-accuracy');
  expect(acc).toHaveTextContent('Minna to WGS 84 (3) (EPSG:1754)');
  expect(acc).toHaveTextContent('Published accuracy 5 m');
  expect(acc).toHaveTextContent('Nigeria - onshore south');
  expect(screen.queryByTestId('site-datum-outside')).toBeNull();

  fireEvent.change(datumSelect(), { target: { value: 'EPSG:1168' } });
  expect(screen.getByTestId('site-datum-accuracy')).toHaveTextContent('Published accuracy 15 m');

  fireEvent.click(screen.getByText('Save changes'));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(onSave.mock.calls[0][0].crs_provenance).toEqual({ note: 'kept', datum_transform: 'EPSG:1168' });
});

test('choosing the default back clears the override', async () => {
  const onSave = jest.fn(async () => {});
  render(
    <SiteDialog
      open
      onOpenChange={() => {}}
      site={{ id: 's1', name: 'Pad A', crs: 'EPSG:26391', crs_provenance: { datum_transform: 'EPSG:1168' } }}
      onSave={onSave}
    />,
  );
  expect(screen.getByTestId('site-datum-accuracy')).toHaveTextContent('EPSG:1168');
  fireEvent.change(datumSelect(), { target: { value: 'EPSG:1754' } });
  fireEvent.click(screen.getByText('Save changes'));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(onSave.mock.calls[0][0].crs_provenance).toEqual({});
});

test('an origin outside the transformation area is flagged with the ones that cover it', () => {
  // Lagos area (about 6.45N 3.4E): West Belt, west of EPSG:1754's area.
  const { x, y } = (() => {
    const { projectorFor } = require('@/lib/crs');
    return projectorFor('EPSG:26391').fromLonLat(3.4, 6.45);
  })();
  render(
    <SiteDialog open onOpenChange={() => {}} site={{ id: 's2', name: 'Lagos', crs: 'EPSG:26391', origin_x: x, origin_y: y }} onSave={jest.fn()} />,
  );
  const warn = screen.getByTestId('site-datum-outside');
  expect(warn).toHaveTextContent("outside this transformation's published area of use");
  expect(warn).toHaveTextContent('EPSG:1168');
});

test('a non-Minna datum shows its approximate accuracy; WGS 84 shows none', () => {
  const { unmount } = render(
    <SiteDialog open onOpenChange={() => {}} site={{ id: 's3', name: 'North Sea', crs: 'EPSG:23031' }} onSave={jest.fn()} />,
  );
  expect(screen.getByTestId('site-datum-accuracy')).toHaveTextContent('approximate, about 3 m');
  unmount();
  render(<SiteDialog open onOpenChange={() => {}} site={{ id: 's4', name: 'W', crs: 'EPSG:32631' }} onSave={jest.fn()} />);
  expect(screen.queryByTestId('site-datum-accuracy')).toBeNull();
});
