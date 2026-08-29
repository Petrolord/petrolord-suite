import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import IconToolbar from '@/components/facilitylayoutmapper/IconToolbar';
import PlacementTools from '@/components/facilitylayoutmapper/PlacementTools';
import ExportPanel from '@/components/facilitylayoutmapper/ExportPanel';
import PropertiesEditor from '@/components/facilitylayoutmapper/PropertiesEditor';
import ProjectPanel from '@/components/facilitylayoutmapper/ProjectPanel';
import CustomIconManager from '@/components/facilitylayoutmapper/CustomIconManager';
import SpacingPanel from '@/components/facilitylayoutmapper/SpacingPanel';

const ControlPanel = ({ activeTool, setActiveTool, layers, setLayers, onPlaceItem, selectedLayer, onUpdateLayer, onLoadLayout, customIcons, onAddCustomIcon }) => {

  return (
    <Accordion type="single" collapsible defaultValue="item-1" className="w-full">
       <AccordionItem value="item-project" className="border-slate-700">
        <AccordionTrigger className="px-4 text-base font-semibold hover:no-underline text-white">Project</AccordionTrigger>
        <AccordionContent className="px-4 pt-2">
          <ProjectPanel layers={layers} onLoadLayout={onLoadLayout} />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-1" className="border-slate-700">
        <AccordionTrigger className="px-4 text-base font-semibold hover:no-underline text-white">Equipment</AccordionTrigger>
        <AccordionContent className="px-4">
          <IconToolbar activeTool={activeTool} setActiveTool={setActiveTool} customIcons={customIcons} />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-custom-icons" className="border-slate-700">
        <AccordionTrigger className="px-4 text-base font-semibold hover:no-underline text-white">Custom Icons</AccordionTrigger>
        <AccordionContent className="px-4 pt-2">
          <CustomIconManager onAddCustomIcon={onAddCustomIcon} />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2" className="border-slate-700">
        <AccordionTrigger className="px-4 text-base font-semibold hover:no-underline text-white">Precision Placement</AccordionTrigger>
        <AccordionContent className="px-4 pt-2">
            <PlacementTools onPlaceItem={onPlaceItem} layers={layers} activeTool={activeTool} />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3" className="border-slate-700">
        <AccordionTrigger className="px-4 text-base font-semibold hover:no-underline text-white">Properties</AccordionTrigger>
        <AccordionContent className="px-4 pt-2">
            <PropertiesEditor selectedLayer={selectedLayer} onUpdateLayer={onUpdateLayer} />
        </AccordionContent>
      </AccordionItem>
      {/* Facilities F8: the safety distances the tile has always advertised,
          finally computed (table spacings plus radiation setbacks from duty). */}
      <AccordionItem value="item-spacing" className="border-slate-700">
        <AccordionTrigger className="px-4 text-base font-semibold hover:no-underline text-white">Safety Spacing</AccordionTrigger>
        <AccordionContent className="px-4 pt-2">
          <SpacingPanel layers={layers} />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-4" className="border-slate-700">
        <AccordionTrigger className="px-4 text-base font-semibold hover:no-underline text-white">Export</AccordionTrigger>
        <AccordionContent className="px-4 pt-2">
          <ExportPanel layers={layers} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default ControlPanel;