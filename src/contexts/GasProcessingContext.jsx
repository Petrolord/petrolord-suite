// Gas Processing Studio state (Facilities F3,
// Facilities-ROADMAP.md §3 app 3) — the upgraded Gas Treating &
// Dehydration on the studio kit, keeping its slug. One app, three
// units (owner decision F#1): dehydration, sweetening, dew point.
//
// Every design choice the old app hid inside a constant is a visible
// input here. All derivations are live; a saved study is inputs only.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  saturatedWaterContent, kremserFractionRemoved, kremserStagesFor,
  tegPackage, AMINES, amineOf, aminePackage, contactorDiameter,
  jouleThomsonFPerPsi, jtDrop,
} from '@/utils/facilities/engine/gasProcessing';
import { suttonPseudoCriticals, dakZ, toRankine } from '@/utils/production/engine/gasProperties';

const TABLE = 'saved_gasprocessing_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save gas processing studies.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  if (error?.code === '42P01' || /relation[^\n]*saved_gasprocessing_projects[^\n]*does not exist/i.test(msg)) {
    return "Saving isn't set up yet. Run the f3_saved_gasprocessing_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => ({
  teg: {
    gasMMscfd: '50', pPsia: '1000', tF: '100',
    inletMode: 'saturated', inletLbMMscf: '60', outletLbMMscf: '7',
    circulationGalPerLb: '3', leanTegWtPct: '99',
    absorberTF: '100', reboilerTF: '380', refluxRatio: '0.25',
    stages: '2', absorptionFactor: '2.5',
    btexInletPpmv: '100', btexAbsorbedFrac: '0.15',
    gasSg: '0.65', ksFtS: '0.3',
  },
  amine: {
    gasMMscfd: '100', pPsia: '1000', tF: '110',
    co2MolPct: '4', h2sMolPct: '1', co2SpecMolPct: '2', h2sSpecMolPct: '0.0004',
    amineId: 'MDEA', amineWtPct: '45', leanLoading: '0.05', richLoading: '0.5',
    dutyBtuPerGal: '800', gasSg: '0.7', ksFtS: '0.25',
  },
  dewpoint: {
    p1Psia: '1000', p2Psia: '600', tF: '100', gasSg: '0.65', cpBtuLbmolF: '9.5',
  },
});

const SECTIONS = ['teg', 'amine', 'dewpoint'];

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs();
  const out = { ...base };
  SECTIONS.forEach((s) => {
    out[s] = { ...base[s], ...(raw[s] || {}) };
  });
  return out;
};

const GasProcessingContext = createContext();

export const useGasProcessing = () => {
  const context = useContext(GasProcessingContext);
  if (!context) throw new Error('useGasProcessing must be used within a GasProcessingProvider');
  return context;
};

const num = (v, fallback = NaN) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Cubic feet to US gallons: 1728 in3 per ft3 over 231 in3 per gal, exact. */
export const GAL_PER_FT3 = 1728 / 231;

/**
 * The water density the engine's own amine balance divides by
 * (`solutionGpd = solutionLbDay / (8.34 * sgSolution)`), carried here
 * so the liquid density this studio hands the contactor is the same
 * water the circulation was computed from rather than a second one.
 */
export const WATER_LB_PER_GAL = 8.34;

/**
 * Liquid density of an amine solution at its table gravity, lb/ft3.
 *
 * The FC4-0 engine repair exports the same quantity as
 * `solutionLbPerFt3`. Import it from there once it is vendored and
 * delete this; it is here only because the vendored engine predates it,
 * and it is the same arithmetic on the same two constants.
 */
export const amineSolutionLbFt3 = (amine) => (
  amine && amine.sgSolution > 0 ? WATER_LB_PER_GAL * GAL_PER_FT3 * amine.sgSolution : NaN
);

/**
 * Dranchuk and Abou-Kassem was fitted over these reduced conditions.
 * Outside them the Newton solve can return a root that is not a
 * compressibility at all: across the range these boxes accept, 35 of
 * 8316 combinations do not converge and three of those come back with a
 * NEGATIVE z (FC4-0 F-U2 sweep).
 */
export const DAK_BAND = { pprMin: 0.2, pprMax: 30, tprMin: 1.0, tprMax: 3.0 };

/**
 * Every typed box in this studio, with the bounds of the quantity it
 * holds. `NumberInput` puts `min` and `max` on the control and prints
 * the refusal under the box; the tab memos below refuse before the
 * engine is called, so an out-of-range value never reaches the
 * arithmetic (FC4 finding F-U3).
 *
 * `minExclusive` and `maxExclusive` mean the bound itself is refused.
 * The DOM `min` and `max` attributes cannot express that, so they carry
 * the closed bound and the message carries the open one.
 */
export const FIELD_LIMITS = {
  teg: {
    gasMMscfd: { label: 'the gas rate', unit: 'MMscfd', min: 0, minExclusive: true, max: 5000 },
    pPsia: { label: 'the pressure', unit: 'psia', min: 0, minExclusive: true, max: 15000 },
    tF: { label: 'the gas temperature', unit: 'F', min: -100, max: 400 },
    inletLbMMscf: { label: 'the inlet water content', unit: 'lb/MMscf', min: 0, max: 100000 },
    outletLbMMscf: { label: 'the outlet spec', unit: 'lb/MMscf', min: 0, max: 100000 },
    circulationGalPerLb: { label: 'the circulation ratio', unit: 'gal per lb', min: 0, minExclusive: true, max: 100 },
    leanTegWtPct: { label: 'the lean TEG strength', unit: 'wt %', min: 90, minExclusive: true, max: 100, maxExclusive: true },
    absorberTF: { label: 'the absorber temperature', unit: 'F', min: -100, max: 400 },
    reboilerTF: { label: 'the reboiler temperature', unit: 'F', min: -100, max: 500 },
    refluxRatio: { label: 'the reflux ratio', min: 0, max: 5 },
    stages: { label: 'the theoretical stage count', min: 0, minExclusive: true, max: 50 },
    absorptionFactor: { label: 'the absorption factor', min: 0, minExclusive: true, max: 100 },
    btexInletPpmv: { label: 'the BTEX inlet content', unit: 'ppmv', min: 0, max: 1000000 },
    btexAbsorbedFrac: { label: 'the BTEX absorbed fraction', min: 0, max: 1 },
    gasSg: { label: 'the gas gravity', min: 0.55, max: 2 },
    ksFtS: { label: 'the contactor K value', unit: 'ft/s', min: 0, minExclusive: true, max: 1 },
  },
  amine: {
    gasMMscfd: { label: 'the gas rate', unit: 'MMscfd', min: 0, minExclusive: true, max: 5000 },
    pPsia: { label: 'the pressure', unit: 'psia', min: 0, minExclusive: true, max: 15000 },
    tF: { label: 'the gas temperature', unit: 'F', min: -100, max: 400 },
    co2MolPct: { label: 'the CO2 inlet content', unit: 'mol %', min: 0, max: 100 },
    h2sMolPct: { label: 'the H2S inlet content', unit: 'mol %', min: 0, max: 100 },
    co2SpecMolPct: { label: 'the CO2 spec', unit: 'mol %', min: 0, max: 100 },
    h2sSpecMolPct: { label: 'the H2S spec', unit: 'mol %', min: 0, max: 100 },
    amineWtPct: { label: 'the amine strength', unit: 'wt %', min: 0, minExclusive: true, max: 100 },
    leanLoading: { label: 'the lean loading', unit: 'mol/mol', min: 0, max: 2 },
    richLoading: { label: 'the rich loading', unit: 'mol/mol', min: 0, minExclusive: true, max: 2 },
    dutyBtuPerGal: { label: 'the regenerator duty', unit: 'Btu/gal', min: 0, minExclusive: true, max: 5000 },
    gasSg: { label: 'the gas gravity', min: 0.55, max: 2 },
    ksFtS: { label: 'the contactor K value', unit: 'ft/s', min: 0, minExclusive: true, max: 1 },
  },
  dewpoint: {
    p1Psia: { label: 'the upstream pressure', unit: 'psia', min: 0, minExclusive: true, max: 15000 },
    p2Psia: { label: 'the downstream pressure', unit: 'psia', min: 0, minExclusive: true, max: 15000 },
    tF: { label: 'the upstream temperature', unit: 'F', min: -100, max: 400 },
    gasSg: { label: 'the gas gravity', min: 0.55, max: 2 },
    cpBtuLbmolF: { label: 'the heat capacity Cp', unit: 'Btu/lbmol F', min: 0, minExclusive: true, max: 100 },
  },
};

const withUnit = (limit, v) => (limit.unit ? `${v} ${limit.unit}` : `${v}`);

/** The refusal for one box, or null. Pure, and exported for the gates. */
export const fieldIssue = (section, name, raw) => {
  const limit = FIELD_LIMITS[section] && FIELD_LIMITS[section][name];
  if (!limit) return null;
  const v = parseFloat(raw);
  if (!Number.isFinite(v)) return `${limit.label} needs a number`;
  if (limit.minExclusive ? !(v > limit.min) : v < limit.min) {
    return `${limit.label} must be above ${withUnit(limit, limit.min)}`;
  }
  if (limit.maxExclusive ? !(v < limit.max) : v > limit.max) {
    return `${limit.label} must be below ${withUnit(limit, limit.max)}`;
  }
  return null;
};

const firstIssue = (section, values, skip = []) => {
  const names = Object.keys(FIELD_LIMITS[section]);
  for (let i = 0; i < names.length; i += 1) {
    if (!skip.includes(names[i])) {
      const issue = fieldIssue(section, names[i], values[names[i]]);
      if (issue) return issue;
    }
  }
  return null;
};

/**
 * The dehydration tab, checked at the door.
 *
 * The reboiler check is FC4 finding F-E4: the engine takes a reboiler
 * temperature below the absorber temperature and reports a negative
 * sensible heat, a negative duty per gallon and a negative reboiler
 * duty with no warning at all.
 */
export const tegIssue = (t) => {
  const one = firstIssue('teg', t, t.inletMode === 'saturated' ? ['inletLbMMscf'] : []);
  if (one) return one;
  if (!(num(t.reboilerTF) > num(t.absorberTF))) {
    return 'the reboiler temperature must be above the absorber temperature, or the still takes heat out of the glycol instead of boiling water off it';
  }
  return null;
};

/**
 * The sweetening tab, checked at the door.
 *
 * The specs are read before the totals so that a spec above its own
 * inlet is named for what it is. The engine tests the sum first and
 * reports "no acid gas to remove at these specs" for a CO2 spec above
 * the CO2 inlet when there is no H2S, which sends the user to the wrong
 * box (FC4 finding F-C8).
 */
export const amineIssue = (a) => {
  const one = firstIssue('amine', a);
  if (one) return one;
  if (num(a.co2SpecMolPct) > num(a.co2MolPct)) {
    return 'the CO2 spec is above the CO2 already in the gas, so there is nothing for the amine to take out';
  }
  if (num(a.h2sSpecMolPct) > num(a.h2sMolPct)) {
    return 'the H2S spec is above the H2S already in the gas, so there is nothing for the amine to take out';
  }
  if (num(a.co2MolPct) + num(a.h2sMolPct) > 100) {
    return 'the CO2 and H2S together cannot be more than 100 mol % of the gas';
  }
  if (!(num(a.richLoading) > num(a.leanLoading))) {
    return 'the rich loading must be above the lean loading, or the solution picks up nothing on its way down the column';
  }
  return null;
};

/** The dew point tab, checked at the door. */
export const dewpointIssue = (d) => {
  const one = firstIssue('dewpoint', d);
  if (one) return one;
  if (!(num(d.p1Psia) > num(d.p2Psia))) {
    return 'the upstream pressure must be above the downstream pressure, or there is no let-down to cool the gas';
  }
  return null;
};

/**
 * Whether the DAK correlation the contactor and the JT screening both
 * run converged, and whether the reduced conditions sit on the band it
 * was fitted over.
 *
 * Neither consumer in the engine carries the `converged` flag out
 * (FC4 findings F-E15, F-E16, F-U5), so this studio asks the same
 * published correlation the same question itself, with the same
 * arguments, and reports the answer. The number on screen still comes
 * from the engine.
 */
export const dakStanding = ({ pPsia, tF, gasSg }) => {
  if (!(pPsia > 0) || !(gasSg > 0) || !Number.isFinite(tF)) return null;
  const { tpcR, ppcPsia } = suttonPseudoCriticals(gasSg);
  if (!(ppcPsia > 0) || !(tpcR > 0)) {
    return { warning: `Sutton's pseudo-criticals are not positive at a gas gravity of ${gasSg}, so the compressibility below is not a compressibility` };
  }
  const ppr = pPsia / ppcPsia;
  const tpr = toRankine(tF) / tpcR;
  const solved = dakZ({ ppr, tpr });
  if (!solved.converged || !(solved.z > 0)) {
    return {
      ppr,
      tpr,
      warning: `the compressibility correlation did not converge at ${pPsia} psia and ${tF} F on a gas gravity of ${gasSg} (reduced pressure ${ppr.toFixed(2)}, reduced temperature ${tpr.toFixed(2)}), so nothing computed from z here is a design number`,
    };
  }
  if (ppr < DAK_BAND.pprMin || ppr > DAK_BAND.pprMax
    || tpr < DAK_BAND.tprMin || tpr > DAK_BAND.tprMax) {
    return {
      ppr,
      tpr,
      warning: `reduced pressure ${ppr.toFixed(2)} and reduced temperature ${tpr.toFixed(2)} are off the ${DAK_BAND.pprMin} to ${DAK_BAND.pprMax} and ${DAK_BAND.tprMin} to ${DAK_BAND.tprMax} band the compressibility correlation was fitted over: read it as an extrapolation`,
    };
  }
  return { ppr, tpr, warning: null };
};

/**
 * The liquid density the engine actually sized the column against, read
 * back out of its own answer through the Souders-Brown velocity it
 * returned. Used only to LABEL the diameter, never to correct it.
 *
 * `contactorDiameter` hard-codes a glycol density today and the amine
 * column is sized against it (FC4 findings F-C4, F-U1). The sweetening
 * tab passes `rhoLLbFt3` for the solution it is actually treating;
 * until the engine reads it, this read-back is how the screen names the
 * liquid the number really came from instead of implying the one that
 * was asked for.
 */
export const liquidDensityUsed = (contactor, ksFtS) => {
  if (!contactor || contactor.error) return NaN;
  const { rhoG, vAllowFtS } = contactor;
  if (!(rhoG > 0) || !Number.isFinite(vAllowFtS) || !(ksFtS > 0)) return NaN;
  return rhoG * (1 + (vAllowFtS / ksFtS) ** 2);
};

/**
 * `kremserFractionRemoved` read through both of its shapes.
 *
 * It was the one export in the module outside the
 * object-carrying-an-error contract: it returned a BARE NUMBER, so a
 * non-positive absorption factor or stage count came back as NaN, every
 * caller's `if (r.error)` guard passed, and this studio rendered `--`
 * where a fault belonged (FC4 finding F-S1). The FC4-0 engine repair
 * gives it the module's own contract, `{ fractionRemoved }` or
 * `{ error }`.
 *
 * That repair is merged in the engines repo and the copy vendored here
 * predates it, because the vendor pull is a separate change with its own
 * blast radius. Reading both shapes means neither ordering of the two
 * merges leaves this studio broken. **Delete this the day the pin in
 * `packages/engines/VENDOR.json` moves past the FC4-0 engine repair**,
 * and read `.fractionRemoved` directly.
 */
export const readFractionRemoved = (r) => {
  if (typeof r === 'number') {
    return Number.isFinite(r)
      ? { fractionRemoved: r }
      : { error: 'the Kremser relation needs a positive absorption factor and a positive stage count' };
  }
  if (r && typeof r === 'object') return r;
  return { error: 'the Kremser relation returned nothing' };
};

/** Names of the numeric fields that came back non-finite, in order. */
export const nonFiniteFields = (result) => (result && typeof result === 'object'
  ? Object.keys(result).filter((k) => typeof result[k] === 'number' && !Number.isFinite(result[k]))
  : []);

export const OUTPUT_LABELS = {
  waterLbDay: 'the water removed',
  circGpm: 'the circulation',
  circGpd: 'the circulation per day',
  dutyBtuPerGal: 'the duty per gallon',
  sensiblePerGal: 'the sensible heat per gallon',
  vaporPerGal: 'the overhead per gallon',
  reboilerMMBtuHr: 'the reboiler duty',
  btexLbDay: 'the BTEX absorbed per day',
  btexTonsYear: 'the BTEX absorbed per year',
  acidMolesDay: 'the acid gas picked up',
  richLoadingUsed: 'the rich loading used',
  fractionAtStages: 'the removal at the stated stages',
  removalNeeded: 'the removal the spec demands',
  inletLbMMscf: 'the inlet water content',
  muFPerPsi: 'the JT coefficient',
  dzdT: 'the z temperature derivative',
  z: 'the compressibility',
  t2F: 'the downstream temperature',
  dropF: 'the cooling across the drop',
  diameterFt: 'the contactor diameter',
  rhoG: 'the gas density',
  vAllowFtS: 'the allowable velocity',
};

/**
 * The note for results that came back as something other than a number.
 *
 * This is the other half of F-U3. Every one of these used to reach the
 * screen as `--`, which is what an untouched box looks like, so a
 * silent failure and an empty form were the same picture.
 */
export const nonFiniteNote = (fields) => {
  if (!fields || !fields.length) return null;
  const named = fields.map((f) => OUTPUT_LABELS[f] || f);
  const list = named.length === 1
    ? named[0]
    : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
  return `${list} came back as something other than a number at these inputs. Nothing on this tab that depends on them is a design figure.`;
};

export const GasProcessingProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const [inputs, setInputs] = useState(defaultInputs);
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  const setSection = useCallback((section, key, value) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
  }, []);

  // --- Dehydration ---
  const dehydration = useMemo(() => {
    const t = inputs.teg;
    // Every typed box first. An out-of-range value never reaches the
    // engine, so nothing on this tab is a number computed from one.
    const issue = tegIssue(t);
    if (issue) return { error: issue };

    const saturated = saturatedWaterContent({ pPsia: num(t.pPsia), tF: num(t.tF) });
    // In saturated mode the saturation fit IS the inlet. It used to
    // fall back to the typed box, which is hidden in that mode, so a
    // refused fit was answered with a default nobody had seen.
    if (t.inletMode === 'saturated' && saturated.error) {
      return { error: `the inlet water content is set to saturated at line conditions, and ${saturated.error}`, saturated };
    }
    const inletLbMMscf = t.inletMode === 'saturated' ? saturated.lbPerMMscf : num(t.inletLbMMscf);

    const pack = tegPackage({
      gasMMscfd: num(t.gasMMscfd),
      inletLbMMscf,
      outletLbMMscf: num(t.outletLbMMscf),
      circulationGalPerLb: num(t.circulationGalPerLb, 3),
      leanTegWtPct: num(t.leanTegWtPct, 99),
      absorberTF: num(t.absorberTF, 100),
      reboilerTF: num(t.reboilerTF, 380),
      refluxRatio: num(t.refluxRatio, 0.25),
      btexInletPpmv: num(t.btexInletPpmv, 0),
      btexAbsorbedFrac: num(t.btexAbsorbedFrac, 0.15),
    });
    if (pack.error) return { ...pack, saturated, inletLbMMscf };
    const removalNeeded = 1 - num(t.outletLbMMscf) / inletLbMMscf;
    const stagesNeeded = kremserStagesFor({
      absorptionFactor: num(t.absorptionFactor, 2.5),
      fractionRemoved: removalNeeded,
    });
    const fraction = readFractionRemoved(kremserFractionRemoved({
      absorptionFactor: num(t.absorptionFactor, 2.5),
      stages: num(t.stages, 2),
    }));
    const fractionAtStages = fraction.fractionRemoved;
    const ksFtS = num(t.ksFtS, 0.3);
    // No liquid density is passed here. The fluid in a TEG contactor is
    // the glycol the engine already assumes, and the engine owns the
    // one glycol density in the system. Naming a second one in the
    // Suite is how two densities for one fluid start (FC4 F-C3).
    const contactor = contactorDiameter({
      gasMMscfd: num(t.gasMMscfd), pPsia: num(t.pPsia), tF: num(t.tF),
      gasSg: num(t.gasSg, 0.65), ksFtS,
    });
    const liquidUsed = liquidDensityUsed(contactor, ksFtS);
    const standing = dakStanding({ pPsia: num(t.pPsia), tF: num(t.tF), gasSg: num(t.gasSg, 0.65) });
    return {
      saturated, inletLbMMscf, ...pack,
      removalNeeded, stagesNeeded, fractionAtStages,
      fractionAtStagesError: fraction.error || null,
      contactor, liquidUsed,
      zWarning: standing ? standing.warning : null,
      // Only what the engine handed back, so a label of this studio's
      // own making cannot be reported as a broken result.
      nonFinite: nonFiniteFields({
        inletLbMMscf, ...pack, removalNeeded, fractionAtStages, ...contactor,
      }),
    };
  }, [inputs.teg]);

  // --- Sweetening ---
  const sweetening = useMemo(() => {
    const a = inputs.amine;
    const issue = amineIssue(a);
    if (issue) return { error: issue };

    const pack = aminePackage({
      gasMMscfd: num(a.gasMMscfd),
      co2MolPct: num(a.co2MolPct, 0), h2sMolPct: num(a.h2sMolPct, 0),
      co2SpecMolPct: num(a.co2SpecMolPct, 0), h2sSpecMolPct: num(a.h2sSpecMolPct, 0),
      amineId: a.amineId,
      amineWtPct: num(a.amineWtPct, undefined),
      leanLoading: num(a.leanLoading, 0.05),
      richLoading: num(a.richLoading, undefined),
      dutyBtuPerGal: num(a.dutyBtuPerGal, undefined),
    });
    if (pack.error) return pack;
    const ksFtS = num(a.ksFtS, 0.25);
    // The column on this tab is full of AMINE SOLUTION, so the liquid
    // the settling velocity is measured against is the amine solution
    // at its own table gravity rather than the glycol the dehydration
    // tab uses (FC4 findings F-C4, F-U1).
    const liquidAsked = amineSolutionLbFt3(amineOf(a.amineId));
    const contactor = contactorDiameter({
      gasMMscfd: num(a.gasMMscfd), pPsia: num(a.pPsia), tF: num(a.tF),
      gasSg: num(a.gasSg, 0.7), ksFtS,
      rhoLLbFt3: liquidAsked,
    });
    const liquidUsed = liquidDensityUsed(contactor, ksFtS);
    const standing = dakStanding({ pPsia: num(a.pPsia), tF: num(a.tF), gasSg: num(a.gasSg, 0.7) });
    return {
      ...pack, contactor, liquidAsked, liquidUsed,
      amineLabel: a.amineId,
      zWarning: standing ? standing.warning : null,
      nonFinite: nonFiniteFields({ ...pack, ...contactor }),
    };
  }, [inputs.amine]);

  // --- Dew point / JT ---
  const dewpoint = useMemo(() => {
    const d = inputs.dewpoint;
    const issue = dewpointIssue(d);
    if (issue) return { error: issue };

    const mu = jouleThomsonFPerPsi({
      pPsia: num(d.p1Psia), tF: num(d.tF), gasSg: num(d.gasSg, 0.65),
      cpBtuLbmolF: num(d.cpBtuLbmolF, 9.5),
    });
    if (mu.error) return mu;
    const standing = dakStanding({ pPsia: num(d.p1Psia), tF: num(d.tF), gasSg: num(d.gasSg, 0.65) });
    const drop = jtDrop({
      p1Psia: num(d.p1Psia), p2Psia: num(d.p2Psia), tF: num(d.tF),
      gasSg: num(d.gasSg, 0.65), cpBtuLbmolF: num(d.cpBtuLbmolF, 9.5),
    });
    const zWarning = standing ? standing.warning : null;
    if (drop.error) {
      return { ...mu, zWarning, dropError: drop.error, nonFinite: nonFiniteFields(mu) };
    }
    const waterAtOutlet = Number.isFinite(drop.t2F)
      ? saturatedWaterContent({ pPsia: num(d.p2Psia), tF: drop.t2F })
      : { error: 'the downstream temperature is not a number, so the water the cold gas can hold cannot be read' };
    return {
      ...mu, ...drop, waterAtOutlet, zWarning,
      nonFinite: nonFiniteFields({ ...mu, ...drop }),
    };
  }, [inputs.dewpoint]);

  // --- Project lifecycle (studio-kit recipe) ---
  const serialize = useCallback((name) => ({
    id: currentProjectId,
    name,
    schema: 1,
    ...SECTIONS.reduce((acc, s) => ({ ...acc, [s]: inputs[s] }), {}),
    modified: new Date().toISOString(),
  }), [currentProjectId, inputs]);

  useEffect(() => {
    (async () => {
      try {
        setProjects(await service.list());
      } catch (e) {
        console.error(e);
        addNotification(friendlyError(e), 'error');
      }
    })();
  }, [addNotification]);

  const createProject = useCallback(async (name) => {
    const id = uuidv4();
    try {
      await service.save(id, { ...serialize(name), id });
      setCurrentProjectId(id);
      setProjectName(name);
      setHydrated(true);
      setLastSaveTime(new Date());
      setSaveError(null);
      setProjects(await service.list());
      addNotification(`Study "${name}" created`, 'success');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [serialize, addNotification]);

  const openProject = useCallback(async (id) => {
    try {
      const payload = await service.load(id);
      const restored = inputsFromPayload(payload);
      if (!restored) {
        addNotification('Study not found', 'error');
        return;
      }
      setCurrentProjectId(id);
      setProjectName(payload?.name || projects.find((p) => p.id === id)?.name || 'Untitled study');
      setInputs(restored);
      setHydrated(true);
      setSaveError(null);
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [projects, addNotification]);

  const deleteProject = useCallback(async (id) => {
    try {
      await service.remove(id);
      if (id === currentProjectId) {
        setCurrentProjectId(null);
        setProjectName('');
        setHydrated(false);
        setLastSaveTime(null);
      }
      setProjects(await service.list());
      addNotification('Study deleted', 'info');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [currentProjectId, addNotification]);

  const manualSave = useCallback(async () => {
    if (!currentProjectId) {
      addNotification('Create or open a study first', 'info');
      return;
    }
    setIsSaving(true);
    try {
      await service.save(currentProjectId, serialize(projectName));
      setLastSaveTime(new Date());
      setSaveError(null);
    } catch (e) {
      console.error(e);
      setSaveError('Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [currentProjectId, projectName, serialize, addNotification]);

  const autosaveRef = useRef(null);
  autosaveRef.current = () => serialize(projectName);
  useEffect(() => {
    if (!currentProjectId || !hydrated) return undefined;
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await service.save(currentProjectId, autosaveRef.current());
        setLastSaveTime(new Date());
        setSaveError(null);
      } catch (e) {
        console.error(e);
        setSaveError('Auto-save failed');
      } finally {
        setIsSaving(false);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [inputs, currentProjectId, hydrated]);

  const value = {
    inputs,
    setSection,
    amines: AMINES,
    // derived
    dehydration,
    sweetening,
    dewpoint,
    // projects
    projects,
    currentProjectId,
    projectName,
    createProject,
    openProject,
    deleteProject,
    manualSave,
    isSaving,
    saveError,
    lastSaveTime,
    // notifications
    notifications,
    addNotification,
    removeNotification,
  };

  return <GasProcessingContext.Provider value={value}>{children}</GasProcessingContext.Provider>;
};
