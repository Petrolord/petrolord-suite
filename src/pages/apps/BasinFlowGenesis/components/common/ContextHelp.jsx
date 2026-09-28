import React from 'react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/popover'; // Using popover components but naming contextually if needed, or stick to standard
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * A small question mark icon that reveals help text on hover/click
 * @param {string} content - The help text to display
 * @param {string} title - Optional title for the popover
 */
export const ContextHelp = ({ content, title }) => {
    return (
        <TooltipProvider>
            <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                    <span className="inline-flex items-center justify-center ml-1.5 align-middle cursor-help opacity-70 hover:opacity-100 transition-opacity">
                        <HelpCircle className="w-3.5 h-3.5 text-pl-muted" />
                    </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs bg-pl-surface border-pl-border text-pl-text text-xs p-3 shadow-xl">
                    {title && <div className="font-semibold text-pl-text mb-1">{title}</div>}
                    <p>{content}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

export default ContextHelp;