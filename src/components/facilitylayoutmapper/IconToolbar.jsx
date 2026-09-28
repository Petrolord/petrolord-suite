import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Indent, Droplets, Flame, Wind, GitBranch, Share2, CircleDot, Waypoints, Circle, ChevronsRight, ShieldCheck, Shapes } from 'lucide-react';

const equipmentIcons = [
  { name: 'Wellhead', icon: CircleDot, type: 'icon' },
  { name: 'Manifold', icon: Share2, type: 'icon' },
  { name: 'Separator', icon: Indent, type: 'icon' },
  { name: 'Heater-Treater', icon: Flame, type: 'icon' },
  { name: 'Tank', icon: Droplets, type: 'icon' },
  { name: 'Flare', icon: Wind, type: 'icon' },
  { name: 'Pump', icon: Circle, type: 'icon' },
  { name: 'Compressor', icon: Waypoints, type: 'icon' },
  { name: 'Pipeline', icon: GitBranch, type: 'pipeline' },
  { name: 'Valve', icon: ChevronsRight, type: 'icon' },
  { name: 'PSV', icon: ShieldCheck, type: 'icon' },
];

const IconToolbar = ({ activeTool, setActiveTool, customIcons = [] }) => {
  const handleToolClick = (tool) => {
    setActiveTool(currentTool => currentTool && currentTool.name === tool.name ? null : tool);
  };

  const allIcons = [...equipmentIcons, ...customIcons];

  return (
    <div>
      <h3 className="text-sm font-semibold text-pl-muted mb-3 px-1">EQUIPMENT & PIPING</h3>
      <div className="grid grid-cols-4 gap-2">
        <TooltipProvider>
          {allIcons.map((tool) => (
            <Tooltip key={tool.name} delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => handleToolClick(tool)}
                  className={cn(
                    "flex flex-col items-center justify-center p-2 rounded-lg aspect-square transition-all duration-200",
                    activeTool && activeTool.name === tool.name
                      ? 'bg-pl-primary text-pl-primary-fg ring-2 ring-pl-focus'
                      : 'bg-pl-sunken text-pl-text hover:bg-pl-border'
                  )}
                >
                  {/* W7F: custom tools rendered a literal <img-replace> tag (an
                      unknown element, so nothing showed). A custom tool is an
                      uploaded image; without one it gets a generic icon. */}
                  {tool.isCustom ? (
                    tool.iconUrl ? (
                      <img src={tool.iconUrl} alt="" aria-hidden="true" className="w-6 h-6 mb-1 object-contain" />
                    ) : (
                      <Shapes className="w-6 h-6 mb-1" aria-hidden="true" />
                    )
                  ) : (
                    <tool.icon className="w-6 h-6 mb-1" />
                  )}
                  <span className="text-xs truncate">{tool.name}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Place {tool.name}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>
    </div>
  );
};

export default IconToolbar;