// Builder forms of the SIM-U2 deck tests (not a test file), shared by
// simU2Decks.test.js (the fixtures) and simAquiferValidation.test.js.
import { defaultBuilderForm } from '@/utils/simDeckBuilder';
import { DAKE, DAKE_W } from './simU2Kit';

/** A 10 x 10 x 1 tank joined on its west edge, its permeability (50 D) so high that its pressure is near uniform: the aquifer face sees the field pressure, so the Material Balance engine can be marched on FPR (a validation tank, not a reservoir). */
export function aquiferForm(model) {
  const f = defaultBuilderForm();
  f.title = `U2 aquifer ${model}`;
  f.grid = { ...f.grid, nx: '10', ny: '10', nz: '1', dx: '1000', dy: '1000', topsDepth: '8000', layers: [{ dz: '100', poro: '0.25', permx: '50000', permz: '5000' }] };
  f.fluid = { ...f.fluid, gor: '300' };
  f.equil = { datumDepth: '8050', datumPressure: String(DAKE.pi), owc: '', goc: '' };
  f.wells = [
    { ...f.wells[0], i: '6', j: '5', k1: '1', k2: '1', rate: '15000', bhp: '1000' },
    { ...f.wells[1], i: '10', j: '10', k1: '1', k2: '1', rate: '0', bhp: '6000' },
  ];
  f.schedule = { years: '4', reportDays: '30.4375' };
  f.aquifer = {
    ...f.aquifer, enabled: true, model, face: 'I-',
    fet: { W_rb: String(DAKE_W), J_rb_d_psi: String(DAKE.J), ct_psi: String(DAKE.ct) },
    ct: { k_md: String(DAKE.k), phi: String(DAKE.phi), h_ft: String(DAKE.h), theta_deg: String(DAKE.theta), r_R_ft: String(DAKE.rR), reD: String(DAKE.reD), muw_cp: String(DAKE.muw), ct_psi: String(DAKE.ct) },
  };
  return f;
}

