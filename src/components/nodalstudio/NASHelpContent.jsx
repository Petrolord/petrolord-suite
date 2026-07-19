// Help drawer content for the Nodal Analysis Studio.
import React from 'react';
import { Activity, GitMerge, Waves, SlidersHorizontal, Wind, CircleDot, BookOpen } from 'lucide-react';

const Section = ({ icon: Icon, title, children }) => (
  <section className="bg-slate-900/50 p-4 rounded-lg border border-slate-800">
    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-2">
      <Icon className="w-4 h-4 text-cyan-400" />
      {title}
    </h3>
    <div className="text-xs text-slate-400 leading-relaxed space-y-2">{children}</div>
  </section>
);

const NASHelpContent = () => (
  <div className="space-y-4">
    <Section icon={Activity} title="What this studio does">
      <p>
        Nodal analysis balances what the reservoir can deliver (the inflow performance
        relationship) against what the wellbore can lift (the vertical lift performance). The
        crossing of the two curves at the bottomhole node is the natural operating point of the
        well.
      </p>
      <p>
        Set up the fluid, the inflow model, the well geometry and the completion on the left. The
        System tab solves the crossing continuously as you type.
      </p>
    </Section>

    <Section icon={GitMerge} title="Inflow (IPR)">
      <p>
        Oil wells offer straight-line PI, Vogel, composite Standing, Fetkovich and Jones models,
        calibrated from a productivity index or a measured well test point. Gas wells offer
        back-pressure, LIT and Darcy deliverability.
      </p>
      <p>
        The engine behind this tab is validated against an independent oracle and published worked
        examples before anything reaches the screen.
      </p>
    </Section>

    <Section icon={Waves} title="Outflow (VLP)">
      <p>
        Oil wells march a pressure traverse along the wellbore with a chosen multiphase
        correlation: Beggs and Brill with the Payne corrections, modified Hagedorn-Brown, Gray for
        wet gas, Fancher-Brown as the light screening bound, or a plain no-slip gradient. Gas wells
        use the Cullender-Smith column or the Gray correlation.
      </p>
      <p>
        Fancher-Brown deliberately reads low. Industry practice keeps it as a quality-control
        envelope, not a design tool.
      </p>
    </Section>

    <Section icon={SlidersHorizontal} title="Sensitivity">
      <p>
        Sweep wellhead pressure, tubing size, water cut, producing GOR or reservoir pressure. Every
        value re-solves the full system, so the chart shows true operating rates, not shifted
        curves.
      </p>
    </Section>

    <Section icon={Wind} title="Gas lift screening">
      <p>
        The screening injects gas at the node and rebuilds the operating point at each injection
        rate. The response curve shows the classic shape: the column lightens and the rate climbs,
        then friction from the injected gas flattens and finally reverses the gains. The economic
        point marks where each extra unit of gas stops paying.
      </p>
      <p>
        Valve spacing and unloading design are outside this screening pass.
      </p>
    </Section>

    <Section icon={CircleDot} title="Chokes">
      <p>
        Two-phase critical flow uses the Gilbert family of bean correlations with the published
        coefficient sets. Gas chokes use the sonic and subsonic nozzle equations with the critical
        pressure ratio, and report the temperature drop across the bean so icing risk is visible.
      </p>
    </Section>

    <Section icon={BookOpen} title="Validation and units">
      <p>
        All engine math is gated in tools/validation/nodal: an independent Python oracle, route
        independent integration checks and armed literature anchors from Guo and Ghalambor, Brill
        and Mukherjee, Lyons and Plisga and the SPE Petroleum Engineering Handbook.
      </p>
      <p>
        State is stored in oilfield units. The display toggle converts to SI without touching the
        engines, and saved projects persist inputs only; results recompute on load.
      </p>
    </Section>
  </div>
);

export default NASHelpContent;
