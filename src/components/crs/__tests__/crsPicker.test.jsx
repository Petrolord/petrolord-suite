// CRS picker browsing (WD tester feedback 2026-09-22: "the Edit site dialog
// lists only WGS 84 / UTM zones"). The five Minna systems were always in the
// shared catalog; an empty search showed the first 30 entries, all UTM.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CrsPicker from '../CrsPicker';
import { browseGroups, searchResults, UTM_GROUP_KEY, isWgs84Utm } from '../crsBrowse';

const MINNA_FIVE = ['EPSG:26391', 'EPSG:26392', 'EPSG:26393', 'EPSG:26331', 'EPSG:26332'];

describe('crsBrowse', () => {
  test("search for 'Nigeria' and for 'Minna' each returns all five", () => {
    for (const q of ['Nigeria', 'Minna', 'minna', 'NIGERIA']) {
      const { entries, total } = searchResults(q);
      expect(total).toBe(entries.length);
      const codes = entries.map((e) => e.code);
      for (const c of MINNA_FIVE) expect(codes).toContain(c);
    }
  });

  test('empty-search browsing opens on the Nigeria systems and folds the UTM zones last', () => {
    const groups = browseGroups();
    expect(groups.slice(0, 3).map((g) => g.label)).toEqual(['Nigeria onshore', 'Nigeria offshore', 'Nigeria']);
    const firstCodes = groups.slice(0, 3).flatMap((g) => g.entries.map((e) => e.code));
    for (const c of [...MINNA_FIVE, 'EPSG:4263']) expect(firstCodes).toContain(c);
    const last = groups[groups.length - 1];
    expect(last.key).toBe(UTM_GROUP_KEY);
    expect(last.entries).toHaveLength(120);
    expect(groups.slice(0, -1).every((g) => g.entries.every((e) => !isWgs84Utm(e)))).toBe(true);
    // Nothing is lost: every catalog entry sits in exactly one group.
    const all = groups.flatMap((g) => g.entries.map((e) => e.code));
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(searchResults('').total);
  });

  test('a broad search reports the full count when it is capped', () => {
    const r = searchResults('utm', 50);
    expect(r.entries).toHaveLength(50);
    expect(r.total).toBeGreaterThan(50);
  });
});

describe('CrsPicker', () => {
  const open = (props = {}) => {
    const onChange = jest.fn();
    render(<CrsPicker value={null} onChange={onChange} {...props} />);
    fireEvent.click(screen.getByText('Choose a coordinate reference system'));
    return onChange;
  };

  test('without typing, the Nigeria systems are listed and the UTM zones are folded', () => {
    open();
    const browse = screen.getByTestId('crs-browse');
    for (const c of MINNA_FIVE) expect(within(browse).getByText(c)).toBeInTheDocument();
    expect(within(browse).getByText(/systems\. Type to search by name, EPSG code or region\./)).toBeInTheDocument();
    expect(within(browse).queryByText('EPSG:32601')).toBeNull();
    fireEvent.click(within(browse).getByText('WGS 84 / UTM'));
    expect(within(browse).getByText('EPSG:32601')).toBeInTheDocument();
  });

  test("typing 'Nigeria' or 'Minna' lists all five, and a pick reports the tag", () => {
    const onChange = open();
    const input = screen.getByPlaceholderText('Search name, EPSG code or region');
    for (const q of ['Nigeria', 'Minna']) {
      fireEvent.change(input, { target: { value: q } });
      const res = screen.getByTestId('crs-search-results');
      for (const c of MINNA_FIVE) expect(within(res).getByText(c)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByText('Minna / Nigeria East Belt'));
    expect(onChange).toHaveBeenCalledWith('EPSG:26393', { name: 'Minna / Nigeria East Belt' });
  });

  test('file-header suggestions still show above the browse list', () => {
    open({ suggestions: [{ code: 'EPSG:26332', name: null, line: 'C 4 UTM ZONE 32N DATUM MINNA', confidence: 0.9 }] });
    expect(screen.getByText(/Suggested by the file header/)).toBeInTheDocument();
  });
});
