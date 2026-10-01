/**
 * Seismolord adopts the Suite unit profile (2026-10-01): the depth display
 * unit starts from the profile, the Home tab toggle is a session view
 * override the note names (and resets), and the older per-browser choice
 * (seismolord.depthUnit.v1) no longer beats the profile. Negative control:
 * without a provider the account fallback stands and the old key is left.
 * The probe uses the same app id, spec and legacy keys ViewerPanel passes.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { StaticUnitProfileProvider } from '@/lib/units/UnitProfileContext';
import { makeProfile } from '@/lib/units/presets';
import { useAppUnits } from '@/lib/units/useAppUnits';
import UnitProfileNote from '@/components/units/UnitProfileNote';
import HomeTab from '../components/workspace/ribbonTabs/HomeTab';
import { SEISMOLORD_UNIT_APP, SEISMOLORD_UNITS, SEISMOLORD_LEGACY_UNIT_KEYS } from '../lib/unitProfile';

function Probe({ fallback = 'm' }) {
  const u = useAppUnits(SEISMOLORD_UNIT_APP, SEISMOLORD_UNITS, { fallback: { depth: fallback }, legacyKeys: [...SEISMOLORD_LEGACY_UNIT_KEYS] });
  return (
    <HomeTab
      volumes={[]} volume={null} selectVolume={() => {}} manifest={null}
      orientation="inline" setOrientation={() => {}} sliceIndex={0} maxIndex={0} changeIndex={() => {}}
      colormap="seismic_rwb" setColormap={() => {}} gain={1} setGain={() => {}} clipRms={3} setClipRms={() => {}}
      polarity={1} setPolarity={() => {}} traceBalance={false} setTraceBalance={() => {}}
      scaleMode="rms" setScaleMode={() => {}} clipPct={99} setClipPct={() => {}} manualClip={1} setManualClip={() => {}}
      agcOn={false} setAgcOn={() => {}} agcWindowMs={500} setAgcWindowMs={() => {}}
      wiggleMode="off" setWiggleMode={() => {}} reverseCmap={false} setReverseCmap={() => {}}
      overlayCandidates={[]} overlayVolumeId={null} selectOverlayVolume={() => {}}
      overlayColormap="viridis" setOverlayColormap={() => {}} overlayOpacity={0.5} setOverlayOpacity={() => {}}
      overlayBlend="mix" setOverlayBlend={() => {}}
      onUndo={() => {}} onRedo={() => {}} canUndo={false} canRedo={false}
      sectionDomain="twt" setSectionDomain={() => {}} depthReady={false}
      depthUnit={u.units.depth} setDepthUnit={(v) => u.setUnit('depth', v)}
      unitNote={<UnitProfileNote u={u} />}
    />
  );
}

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
const select = () => screen.getByTestId('sl-depth-unit').querySelector('select') || screen.getByTestId('sl-depth-unit');

test('an oilfield profile opens in feet and beats the remembered metres', () => {
  window.localStorage.setItem('seismolord.depthUnit.v1', 'm');
  render(<StaticUnitProfileProvider layers={{ organization: makeProfile('oilfield') }}><Probe /></StaticUnitProfileProvider>);
  expect(select()).toHaveValue('ft');
  expect(window.localStorage.getItem('seismolord.depthUnit.v1')).toBeNull();
  expect(screen.getByTestId('unit-profile-note').dataset.state).toBe('follows');
});

test('the toggle is a session override, named and resettable', () => {
  render(<StaticUnitProfileProvider layers={{ organization: makeProfile('metric') }}><Probe /></StaticUnitProfileProvider>);
  expect(select()).toHaveValue('m');
  fireEvent.change(select(), { target: { value: 'ft' } });
  expect(screen.getByTestId('unit-profile-note')).toHaveTextContent('depth ft (profile m)');
  fireEvent.click(screen.getByTestId('unit-profile-reset'));
  expect(select()).toHaveValue('m');
});

test('negative control: no provider keeps the account fallback and the old key', () => {
  window.localStorage.setItem('seismolord.depthUnit.v1', 'm');
  render(<Probe fallback="ft" />);
  expect(select()).toHaveValue('ft');
  expect(window.localStorage.getItem('seismolord.depthUnit.v1')).toBe('m');
  expect(screen.queryByTestId('unit-profile-note')).toBeNull();
});
