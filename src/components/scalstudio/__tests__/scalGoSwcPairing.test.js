/**
 * SIM-U2-014: one connate water. SCAL Studio holds the gas-oil set at the
 * oil-water Swc, so the kr-1 block it saves pairs the two sets and
 * Reservoir Simulation Studio takes it without moving anything (no warning,
 * no adjustment). A project saved before, with two Swc, is moved to the
 * oil-water Swc on opening and says so; the Simulation intake of an old
 * saved block (two Swc) still warns, as before.
 * Negative control: the workspace without the pairing (the old behaviour)
 * gives a block the Simulation intake has to adjust.
 */
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { pairGoSwc, deriveScalState } from '@/utils/scalstudio/workspace';
import { buildScalKrContract } from '@/utils/scalstudio/krHandoff';
import { takeKrIntoForm } from '@/utils/simstudio/builderIntakes';
import { defaultBuilderForm, buildDeckFromForm } from '@/utils/simDeckBuilder';
import { identifiedFitted, inputsFromPayload, AT, BUILD } from './scalTestKit';

const contractOf = (inputs) => buildScalKrContract({ ...deriveScalState(inputs), projectId: 'scal-1', projectName: 'Ekene E-2000 SCAL', build: BUILD, generatedAt: AT });

describe('SIM-U2-014: the gas-oil set at the oil-water Swc', () => {
  it('a project with two Swc opens with the gas-oil set moved to the oil-water Swc, and the move is kept', () => {
    const old = identifiedFitted(); // the demo: fitted oil-water Swc 0.18, gas-oil set at 0.2
    expect(old.curves.ow.Swc).toBe('0.180');
    expect(old.curves.go.Swc).toBe('0.2');
    const opened = inputsFromPayload(JSON.parse(JSON.stringify(old)));
    expect(opened.curves.go.Swc).toBe('0.180');
    expect(opened.curves.goSwcPairing).toEqual({ from: 0.2, to: 0.18, why: 'saved before the gas-oil set followed the oil-water Swc' });
    // the other gas-oil parameters are kept
    expect({ ...opened.curves.go, Swc: null }).toEqual({ ...old.curves.go, Swc: null });
    // paired already: nothing moves, nothing is recorded
    expect(pairGoSwc(opened.curves)).toBe(opened.curves);
  });

  it('the block SCAL saves is paired; Simulation takes it with no adjustment and no warning', () => {
    const opened = inputsFromPayload(JSON.parse(JSON.stringify(identifiedFitted())));
    const block = { ...contractOf(opened), generated_at: AT.toISOString() };
    expect(block.gas_oil.params.Swc).toBe(block.oil_water.params.Swc);
    const res = takeKrIntoForm(defaultBuilderForm(), block, { at: AT.toISOString() });
    expect(res.ok).toBe(true);
    expect(res.form.krSource.intake.goSwcAdjusted).toBeNull();
    expect(res.warnings.join(' ')).not.toMatch(/gas-oil set was saved at Swc/);
    const deck = buildDeckFromForm(res.form).deck;
    expect(deck).not.toMatch(/written at the oil-water Swc/);
    expect(deck).toMatch(/\n {2}0\.82 0\.6 0 0/); // SGOF closes at 1 - 0.18
  });

  it('negative control: the old workspace (no pairing) gives a block the Simulation intake must adjust, and says so', () => {
    const block = { ...contractOf(identifiedFitted()), generated_at: AT.toISOString() };
    expect(block.gas_oil.params.Swc).not.toBe(block.oil_water.params.Swc);
    const res = takeKrIntoForm(defaultBuilderForm(), block);
    expect(res.form.krSource.intake.goSwcAdjusted).toEqual({ from: 0.2, to: 0.18 });
    expect(res.warnings[0]).toMatch(/gas-oil set was saved at Swc 0\.2 and the oil-water set at Swc 0\.18/);
  });
});

describe('SIM-U2-014: the Curves tab keeps them paired', () => {
  // the provider's setters, through the real context
  // eslint-disable-next-line global-require
  const { ScalStudioProvider, useScalStudio } = require('@/contexts/ScalStudioContext');
  it('typing the oil-water Swc moves the gas-oil Swc; the gas-oil Swc cannot be typed on its own', async () => {
    const { result } = renderHook(() => useScalStudio(), { wrapper: ({ children }) => React.createElement(ScalStudioProvider, null, children) });
    act(() => result.current.setOwField('Swc', '0.25'));
    expect(result.current.curves.go.Swc).toBe('0.25');
    act(() => result.current.setGoField('Swc', '0.3'));
    expect(result.current.curves.go.Swc).toBe('0.25');
  });
});
