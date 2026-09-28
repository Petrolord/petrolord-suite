import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import IconToolbar from '@/components/facilitylayoutmapper/IconToolbar';
import PlacementTools from '@/components/facilitylayoutmapper/PlacementTools';
import ExportPanel from '@/components/facilitylayoutmapper/ExportPanel';
import PropertiesEditor from '@/components/facilitylayoutmapper/PropertiesEditor';
import ProjectPanel from '@/components/facilitylayoutmapper/ProjectPanel';
import CustomIconManager from '@/components/facilitylayoutmapper/CustomIconManager';
import SpacingPanel from '@/components/facilitylayoutmapper/SpacingPanel';

const ControlPanel = ({ activeTool, setActiveTool, layers, setLayers, onPlaceItem, selectedLayer, onUpdateLayer, onLoadLayout, customIcons, onAddCustomIcon, spacingInputs, onSpacingInputsChange }) => {

  return (
    <Accordion type="single" collapsible defaultValue="item-1" className="w-full">
       <AccordionItem value="item-project" className="border-pl-border">
        <AccordionTrigger className="px-4 text-base font-semibold hover:no-underline text-pl-text">Project</AccordionTrigger>
        <AccordionContent className="px-4 pt-2">
          <ProjectPanel layers={layers} spacingInputs={spacingInputs} onLoadLayout={onLoadLayout} />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-1" className="border-pl-border">
        <AccordionTrigger className="px-4 text-base font-semibold hover:no-underline text-pl-text">Equipment</AccordionTrigger>
        <AccordionContent className="px-4">
          <IconToolbar activeTool={activeTool} setActiveTool={setActiveTool} customIcons={customIcons} />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-custom-icons" className="border-pl-border">
        <AccordionTrigger className="px-4 text-base font-semibold hover:no-underline text-pl-text">Custom Icons</AccordionTrigger>
        <AccordionContent className="px-4 pt-2">
          <CustomIconManager onAddCustomIcon={onAddCustomIcon} />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2" className="border-pl-border">
        <AccordionTrigger className="px-4 text-base font-semibold hover:no-underline text-pl-text">Precision Placement</AccordionTrigger>
        <AccordionContent className="px-4 pt-2">
            <PlacementTools onPlaceItem={onPlaceItem} layers={layers} activeTool={activeTool} />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3" className="border-pl-border">
        <AccordionTrigger className="px-4 text-base font-semibold hover:no-underline text-pl-text">Properties</AccordionTrigger>
        <AccordionContent className="px-4 pt-2">
            <PropertiesEditor selectedLayer={selectedLayer} onUpdateLayer={onUpdateLayer} />
        </AccordionContent>
      </AccordionItem>
      {/* Facilities F8: the safety distances the tile has always advertised,
          finally computed (table spacings plus radiation setbacks from duty). */}
      <AccordionItem value="item-spacing" className="border-pl-border">
        <AccordionTrigger className="px-4 text-base font-semibold hover:no-underline text-pl-text">Safety Spacing</AccordionTrigger>
        <AccordionContent className="px-4 pt-2">
          <SpacingPanel layers={layers} inputs={spacingInputs} onChange={onSpacingInputsChange} />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-4" className="border-pl-border">
        <AccordionTrigger className="px-4 text-base font-semibold hover:no-underline text-pl-text">Export</AccordionTrigger>
        <AccordionContent className="px-4 pt-2">
          <ExportPanel layers={layers} spacingInputs={spacingInputs} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default ControlPanel;