/**
 * RF-U2-012: one porosity, Swi and Boi per case. Linked (a new case), the
 * method reads the volumetric values through deriveRf, the function the
 * screen, report and saved record share; a saved project whose two values
 * differ opens unlinked with its numbers unchanged and the difference
 * flagged.
 */
import { deriveRf } from '../workspace';
import { sampleInputs, inputsFromPayload, sharedValuesAgree } from '../model';
import { apiWaterDriveRF } from '@/utils/recoveryFactorCalculations';

const api = (o = {}) => ({ ...sampleInputs(), method: 'api_water_drive', origin: 'entered', ...o });

describe('one porosity, Swi and Boi per case (RF-U2-012)', () => {
  test('linked: the method reads the volumetric porosity, Swi and Boi', () => {
    const i = api({ vol: { ...sampleInputs().vol, phi: '0.18', sw: '0.32', boi: '1.25' } });
    expect(i.linked).toBe(true);
    const d = deriveRf(i);
    expect(d.inputsUsed.corr).toMatchObject({ phi: '0.18', swi: '0.32', boi: '1.25' });
    expect(d.result.rf).toBe(apiWaterDriveRF({ ...i.corr, phi: '0.18', swi: '0.32', boi: '1.25' }));
    expect(d.flags.filter((f) => f.scope === 'consistency')).toEqual([]);
  });

  test('negative control: unlinked, the typed method values are read and the difference is flagged', () => {
    const i = api({ linked: false, vol: { ...sampleInputs().vol, phi: '0.18' } });
    const d = deriveRf(i);
    expect(d.inputsUsed.corr.phi).toBe('0.22');
    expect(d.result.rf).toBe(apiWaterDriveRF(i.corr));
    expect(d.result.rf).not.toBe(deriveRf({ ...i, linked: true }).result.rf);
    expect(d.flags.find((f) => f.scope === 'consistency').text).toMatch(/Porosity is 0.18 in the volumetrics and 0.22 in the method inputs/);
  });

  test('a saved project keeps its two values where they differ (unlinked), and links where they agree', () => {
    const differ = { inputs: { ...api(), linked: undefined, vol: { ...sampleInputs().vol, sw: '0.30' } } };
    const a = inputsFromPayload(differ);
    expect(a.linked).toBe(false);
    expect(deriveRf(a).result.rf).toBe(apiWaterDriveRF(a.corr));
    const agree = { inputs: { ...api(), linked: undefined } };
    expect(inputsFromPayload(agree).linked).toBe(true);
    expect(sharedValuesAgree({ phi: '0.2', sw: '0.3', boi: '1.2' }, { phi: '0.20', swi: '0.3', boi: '1.2' })).toBe(true);
  });

  test('a direct in-place entry has no volumetric values to link: the method values are read', () => {
    const i = api({ inPlaceMode: 'direct', ooipDirect: '40000000', vol: { ...sampleInputs().vol, phi: '0.1' } });
    expect(deriveRf(i).inputsUsed.corr.phi).toBe('0.22');
  });
});
