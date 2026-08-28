// The well, the duty it is on, what a treatment would leave, and what
// the job costs. The shared per-well record does the description.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import SharedWellModelPanel from '@/components/production/WellModelPanel';
import { useIntervention } from '@/contexts/InterventionPlannerContext';
import { Field, NumberInput, fmt } from './fields';

const WellPanel = () => {
  const { inputs, setSection, skinFloor } = useIntervention();
  const skin = Number(inputs.well.skin);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Damage</p>
        <Field
          label="Skin"
          hint="From a pressure transient test. Everything about what a stimulation is worth comes out of this one number, and there is no way to infer it from production data."
        >
          <NumberInput section="well" name="skin" step="0.1" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Drainage radius (ft)"><NumberInput section="well" name="reFt" /></Field>
          <Field label="Wellbore radius (ft)"><NumberInput section="well" name="rwFt" step="0.001" /></Field>
        </div>
        {Number.isFinite(skinFloor) && (
          <p className={`text-[11px] ${skin <= skinFloor ? 'text-rose-400' : 'text-slate-600'}`}>
            This geometry cannot carry a skin below {fmt(skinFloor, 1)}: at that value the
            productivity index goes infinite, which is the equation running out rather than a very
            good well. Real treatments reach about -3 to -5 on acid and -5 to -6 on a fracture.
          </p>
        )}
      </div>

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
          What the well is doing today
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Water cut (%)"><NumberInput section="duty" name="wctPct" /></Field>
          <Field label="Gas-oil ratio (scf/stb)"><NumberInput section="duty" name="gor" /></Field>
        </div>
        <Field
          label="Wellhead pressure (psia)"
          hint="The well is solved against this, before and after, so the comparison holds everything else fixed."
        >
          <NumberInput section="duty" name="whpPsia" />
        </Field>
        <Field
          label="Expected gas-oil ratio (scf/stb)"
          hint="What the fluid should be producing. A ratio well above it is a gas problem rather than solution gas. Blank uses the fluid model's."
        >
          <NumberInput section="well" name="expectedGor" />
        </Field>
      </div>

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
          The treatment
        </p>
        <Field label="Size which one">
          <Select
            value={inputs.treatment.kind}
            onValueChange={(v) => setSection('treatment', 'kind', v)}
          >
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              <SelectItem value="stimulation">Stimulation, by skin removed</SelectItem>
              <SelectItem value="shutoff">Water shutoff, by water left</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {inputs.treatment.kind === 'stimulation' ? (
          <Field
            label="Skin afterwards"
            hint="What the job is expected to leave. Zero is a clean wellbore; negative is a genuine stimulation."
          >
            <NumberInput section="treatment" name="skinAfter" step="0.1" />
          </Field>
        ) : (
          <Field
            label="Water cut afterwards (%)"
            hint="What the squeeze is expected to leave. The gain comes through the column, so this is the number that drives it."
          >
            <NumberInput section="treatment" name="wctAfterPct" />
          </Field>
        )}
      </div>

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Economics</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Job cost ($MM)"><NumberInput section="economics" name="costUsdMM" step="0.01" /></Field>
          <Field label="Oil price ($/bbl)"><NumberInput section="economics" name="oilPriceUsd" /></Field>
          <Field
            label="Uplift decline (% per year)"
            hint="Required. No default."
          >
            <NumberInput section="economics" name="declinePctPerYear" />
          </Field>
          <Field label="Evaluation life (years)"><NumberInput section="economics" name="projectLife" /></Field>
          <Field label="Discount rate (%)"><NumberInput section="economics" name="discountRate" /></Field>
          <Field label="Variable opex ($/bbl)"><NumberInput section="economics" name="opexUsdPerBbl" step="0.1" /></Field>
          <Field label="Royalty (%)"><NumberInput section="economics" name="royaltyRate" /></Field>
          <Field label="Tax (%)"><NumberInput section="economics" name="taxRate" /></Field>
        </div>
        <p className="text-[11px] text-slate-600">
          Screening economics on the Suite's canonical engine, which discounts mid-year. Full
          Nigerian fiscal terms live in the Petroleum Economics Studio; take a decision to that one.
        </p>
      </div>

      <div className="border-t border-slate-800 pt-3">
        <SharedWellModelPanel
          inputs={inputs}
          setSection={setSection}
          showCompletion
          depthLabel="Perforation depth (ft TVD)"
          depthHint="The node depth. The well is solved between here and the wellhead, before and after."
          fluidNote="The water cut and gas-oil ratio the well is on today live with the plan, not in the shared record: they are what the well was doing on the day."
        />
      </div>
    </div>
  );
};

export default WellPanel;
