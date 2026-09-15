// Facility Layout Mapper help guide (FC1-0).
//
// Written against the code as it stands: what the map does, how the
// spacing check measures, where the radiation model stops being right,
// and what each export contains. Keep it in step with the app; the guard
// in src/components/__tests__/layoutMapperHelpGuide.test.js pins the
// load-bearing statements and the copy rule (no em dashes).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, MapPin, GitBranch, Ruler, Flame, AlertTriangle, FolderOpen, Download,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

export const LAYOUT_MAPPER_HELP_CONTENT = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What the map does',
    content:
      'The Layout Mapper is a drafting tool for a surface facility on a real map. You place standard equipment icons (wellhead, manifold, separator, heater-treater, tank, flare, pump, compressor, valve and PSV) or your own uploaded SVG or PNG icons, route pipe runs between them, and check the spacing between the placed equipment. Coordinates under the cursor are shown as latitude and longitude and as UTM metres.',
  },
  {
    id: 'placing',
    icon: MapPin,
    title: 'Placing equipment',
    content:
      'Pick an icon in the Equipment section, then click the map to place it. Precision Placement places the selected icon at a typed latitude and longitude, or at a bearing and distance in metres from an item already on the map. Each item gets a sequential tag by type (Tank-001, Tank-002), taken as the lowest number not already in use, and you can rename it in Properties. Custom icons you add are available for this session; the items you place with them are saved with the layout.',
  },
  {
    id: 'pipes',
    icon: GitBranch,
    title: 'Pipe runs',
    content:
      'Choose the pipeline tool and draw a line on the map. Its length is summed along the drawn route, and it gets a sequential tag (PL-001, PL-002) the same way equipment does, with a default line size of 6 inches that you can change in Properties. Moving or deleting items uses the edit and delete controls at the top right of the map. Bend radius is not checked.',
  },
  {
    id: 'spacing',
    icon: Ruler,
    title: 'How spacing is checked',
    content:
      'Every pair of placed standard equipment is compared against a spacing table by equipment class. Distances are great-circle distances measured centre to centre between the icon positions, so the check knows nothing about the footprint of the real equipment: allow for it yourself. The table holds customary onshore production-facility figures that have not yet been verified against the published literature, so treat a pass as a screening result and use your site or company standard for design. A pair the table gives as zero has no requirement. Pipe runs and custom icons are not checked, and the panel says how many items it skipped. Violations are listed worst first with the shortfall in metres.',
  },
  {
    id: 'radiation',
    icon: Flame,
    title: 'Radiation setbacks from a flare or a pool fire',
    content:
      'When enabled, each flare and each tank also gets a setback computed from a stated duty, and every other placed item is checked against it, again centre to centre. The flare setback uses the point-source model from the relief rate, heating value, fraction radiated and allowable radiation you enter. The pool fire assumes a burning pool of the stated diameter centred on the tank, with the burn rate, heating value, fraction radiated and allowable you enter, and the check uses the radius from the pool centre; the distance from the pool edge is shown for reference. Flare and pool fire each have their own allowable radiation. The API 521 levels are 1.58, 4.73, 6.31 and 9.46 kW/m2. A blank or invalid input stops that setback being computed, the panel names the missing input, and the check is marked incomplete. These inputs are saved with the layout.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Limits of the radiation model',
    content:
      'A point source is a far-field model. Near the flame it under-predicts, and for a pool fire the panel warns when the computed radius falls inside the flame height; use a solid-flame view factor model for design there. Flare stack height is ignored: the distance is measured along the ground from the flare icon. Wind tilt of the flame is not modelled, so the downwind setback can be longer than shown. Solar radiation is not added to the flame radiation, so leave margin below the allowable where the sun adds to it. Atmospheric transmissivity is taken as 1, with no absorption by the air.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Saving and loading',
    content:
      'Save Project stores the layout (every placed item and pipe run) and the radiation inputs of the spacing check under a project name, when you are signed in. Each save writes a new saved project. Load Project lists your saved layouts and opens one onto the map. Layouts saved before the radiation inputs were stored open with the initial example values.',
  },
  {
    id: 'exports',
    icon: Download,
    title: 'Exports',
    content:
      'SVG draws the items and pipe runs in UTM metres. DXF writes equipment circles, pipe polylines and tag labels on separate layers, in UTM metres relative to the first point. KML and GeoJSON carry the items as points and pipe runs as lines in latitude and longitude, with their tags. The PDF lists every item by tag and type, followed by a safety spacing section: the pass or fail summary, any setback that could not be computed, the computed setbacks, the pairs that are too close and the measurement notes above.',
  },
];

export const LayoutMapperHelpContent = () => (
  <Accordion type="single" collapsible className="w-full" defaultValue="what">
    {LAYOUT_MAPPER_HELP_CONTENT.map((item) => {
      const Icon = item.icon;
      return (
        <AccordionItem value={item.id} key={item.id}>
          <AccordionTrigger className="text-base hover:no-underline">
            <div className="flex items-center">
              <Icon className="w-5 h-5 mr-3 text-teal-400" />
              {item.title}
            </div>
          </AccordionTrigger>
          <AccordionContent className="text-slate-300 pl-8 leading-relaxed">
            {item.content}
          </AccordionContent>
        </AccordionItem>
      );
    })}
  </Accordion>
);

const LayoutMapperHelpGuide = () => (
  <StudioHelp
    title="Facility Layout Mapper"
    description="Placing equipment, how the spacing check measures, the limits of the radiation model, and what each export holds."
    triggerTitle="Layout Mapper guide"
  >
    <LayoutMapperHelpContent />
  </StudioHelp>
);

export default LayoutMapperHelpGuide;
