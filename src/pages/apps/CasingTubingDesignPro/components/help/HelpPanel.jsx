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
            <SheetContent className="w-[400px] border-l p-0 flex flex-col">
                <SheetHeader className="p-6 border-b border-pl-border">
                    <SheetTitle className="text-pl-text flex items-center">
                        <BookOpen className="w-5 h-5 mr-2 text-pl-muted" />
                        Help & Resources
                    </SheetTitle>
                    <SheetDescription className="text-pl-muted text-xs">
                        Quick reference for casing and tubing design. The full user guide lives on the Guide button in the top bar.
                    </SheetDescription>
                </SheetHeader>

                <Tabs defaultValue="quickstart" className="flex-1 flex flex-col">
                    <div className="px-6 pt-4">
                        <TabsList className="w-full grid grid-cols-3">
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