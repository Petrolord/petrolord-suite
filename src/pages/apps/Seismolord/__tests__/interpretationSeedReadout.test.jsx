/**
 * The Interpretation ribbon's seed readout names the seed in the survey's
 * own terms (inline, crossline, two-way time), never lattice indices.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import InterpretationTab, { describeSeed } from '@/pages/apps/Seismolord/components/workspace/ribbonTabs/InterpretationTab';

const GEOMETRY = { il: { min: 1000, step: 1 }, xl: { min: 2000, step: 2 }, dt_us: 4000 };
const SEED = { ilIdx: 27, xlIdx: 51, sample: 322.77 };

describe('describeSeed', () => {
  it('converts lattice indices and samples to line numbers and ms', () => {
    expect(describeSeed(SEED, GEOMETRY)).toBe('Seed: IL 1027, XL 2102, 1291.1 ms');
  });

  it('falls back to the indices without a geometry', () => {
    expect(describeSeed(SEED, null)).toBe('Seed: IL idx 27, XL idx 51, s 322.77');
  });

  it('is empty without a seed', () => {
    expect(describeSeed(null, GEOMETRY)).toBe('');
  });
});

describe('InterpretationTab seed readout', () => {
  it('shows the seed as inline, crossline and time', () => {
    const noop = () => {};
    render(
      <InterpretationTab
        manifest={{ geometry: GEOMETRY }}
        orientation="inline"
        pickMode="seed"
        setPickMode={noop}
        seedPick={SEED}
        snapMode="peak"
        setSnapMode={noop}
        snapWindow={3}
        setSnapWindow={noop}
        corrThreshold={0.7}
        setCorrThreshold={noop}
        tracking={null}
        trackHorizon={noop}
        growHorizon={noop}
        cancelTracking={noop}
        track2D={noop}
        editTarget="new"
        changeEditTarget={noop}
        horizons={[]}
        toggleEditTool={noop}
        eraseSize={1}
        setEraseSize={noop}
        edit={{ undo: 0, redo: 0, dirty: false }}
        draftSticks={[]}
      />,
    );
    expect(screen.getByTestId('sl-seed-readout')).toHaveTextContent('Seed: IL 1027, XL 2102, 1291.1 ms');
    expect(screen.queryByText(/IL idx/)).toBeNull();
  });
});
