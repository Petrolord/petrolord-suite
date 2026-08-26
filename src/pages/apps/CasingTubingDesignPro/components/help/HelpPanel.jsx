import React from 'react';
import { useCasingTubingDesign } from '../../contexts/CasingTubingDesignContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BookOpen } from 'lucide-react';
import QuickStartGuide from './QuickStartGuide';
import ConceptNotes from './ConceptNotes';
import WorkedExamples from './WorkedExamples';

const HelpPanel = () => {
    const { isHelpOpen, toggleHelp } = useCasingTubingDesign();

    return (
        <Sheet open={isHelpOpen} onOpenChange={toggleHelp}>
            <SheetContent className="w-[400px] bg-slate-950 border-l border-slate-800 text-slate-100 p-0 flex flex-col">
                <SheetHeader className="p-6 border-b border-slate-800 bg-slate-900/50">
                    <SheetTitle className="text-white flex items-center">
                        <BookOpen className="w-5 h-5 mr-2 text-lime-400" />
                        Help & Resources
                    </SheetTitle>
                    <SheetDescription className="text-slate-400 text-xs">
                        Quick reference for casing and tubing design. The full user guide lives on the Guide button in the top bar.
                    </SheetDescription>
                </SheetHeader>

                <Tabs defaultValue="quickstart" className="flex-1 flex flex-col">
                    <div className="px-6 pt-4">
                        <TabsList className="bg-slate-900 w-full grid grid-cols-3">
                            <TabsTrigger value="quickstart" className="text-xs">Quick Start</TabsTrigger>
                            <TabsTrigger value="concepts" className="text-xs">Concepts</TabsTrigger>
                            <TabsTrigger value="examples" className="text-xs">Examples</TabsTrigger>
                        </TabsList>
                    </div>

                    <ScrollArea className="flex-1 p-6">
                        <TabsContent value="quickstart" className="mt-0">
                            <QuickStartGuide />
                        </TabsContent>
                        <TabsContent value="concepts" className="mt-0">
                            <ConceptNotes />
                        </TabsContent>
                        <TabsContent value="examples" className="mt-0">
                            <WorkedExamples />
                        </TabsContent>
                    </ScrollArea>
                </Tabs>
            </SheetContent>
        </Sheet>
    );
};

export default HelpPanel;