/**
 * AS13: the help drawer opens, shows the guide, and its search is real.
 * (The Risk Register's old guide had a search box that searched nothing.)
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AssuranceHelp, { AssuranceHelpContent } from '../AssuranceHelp';
import { ASSURANCE_HELP } from '@/data/assuranceHelp';

describe('AssuranceHelp', () => {
  it('opens the guide for its app', () => {
    render(<AssuranceHelp appKey="moc" />);
    fireEvent.click(screen.getByRole('button', { name: /help/i }));
    expect(screen.getAllByText(ASSURANCE_HELP.moc.title).length).toBeGreaterThan(0);
  });

  it('search narrows the guide and says when nothing matches', () => {
    render(<AssuranceHelpContent appKey="hub" />);
    const all = screen.getAllByRole('heading', { level: 3 }).length;
    fireEvent.change(screen.getByLabelText('Search this guide'), { target: { value: 'stop-work' } });
    const narrowed = screen.getAllByRole('heading', { level: 3 }).length;
    expect(narrowed).toBeLessThan(all);
    fireEvent.change(screen.getByLabelText('Search this guide'), { target: { value: 'zzqxnomatch' } });
    expect(screen.getByText(/Nothing in this guide mentions/)).toBeTruthy();
  });

  it('every section of every guide renders expanded, so search can find it', () => {
    Object.keys(ASSURANCE_HELP).forEach((key) => {
      const { unmount } = render(<AssuranceHelpContent appKey={key} />);
      ASSURANCE_HELP[key].sections.forEach((s) => expect(screen.getByText(s.title)).toBeTruthy());
      unmount();
    });
  });
});
