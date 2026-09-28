import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BasinTemplates } from '../../data/BasinTemplates';
import { BookOpen, ArrowRight, Copy } from 'lucide-react';
import { useBasinFlow } from '../../contexts/BasinFlowContext';
import { useToast } from '@/components/ui/use-toast';
import { v4 as uuidv4 } from 'uuid';

const TemplateLibrary = () => {
    const { dispatch } = useBasinFlow();
    const { toast } = useToast();

    const handleApplyTemplate = (template) => {
        // Convert template stratigraphy to project compatible layers
        const layers = template.defaultStratigraphy.map(l => ({
            ...l,
            id: uuidv4(),
            // Ensure required fields
            ageStart: l.ageStart || 0,
            ageEnd: l.ageEnd || 0,
            thickness: l.thickness || 0,
            lithology: l.lithology || 'shale',
            sourceRock: l.sourceRock || { isSource: false },
            color: '#888' // Should use helper ideally
        }));

        dispatch({ 
            type: 'LOAD_PROJECT', 
            payload: { 
                name: `${template.name} Basin Model`,
                stratigraphy: layers 
            } 
        });
        
        toast({ title: "Template Applied", description: `Loaded ${template.name} configuration.` });
    };

    return (
        <div className="h-full p-6 bg-pl-bg overflow-y-auto">
            <div className="max-w-5xl mx-auto">
                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-pl-text flex items-center gap-2">
                        <BookOpen className="w-6 h-6 text-pl-muted" /> Template Library
                    </h2>
                    <p className="text-pl-muted">Standard basin configurations to jumpstart your modeling.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {BasinTemplates.map(t => (
                        <Card key={t.id} className="hover:border-pl-border-strong transition-all group">
                            <div className="h-32 bg-pl-sunken bg-cover bg-center" style={{ backgroundImage: `url(${t.image})` }} />
                            <CardHeader>
                                <CardTitle className="text-lg text-pl-text group-hover:text-pl-primary-text transition-colors">
                                    {t.name}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-pl-muted mb-4 line-clamp-3 min-h-[3rem]">
                                    {t.description}
                                </p>
                                <div className="flex flex-wrap gap-2 mb-6">
                                    {t.useCases.slice(0,2).map((u, i) => (
                                        <span key={i} className="text-[10px] bg-pl-sunken px-2 py-1 rounded text-pl-muted border border-pl-border">
                                            {u}
                                        </span>
                                    ))}
                                </div>
                                <Button 
                                    variant="outline"
                                    className="w-full transition-all"
                                    onClick={() => handleApplyTemplate(t)}
                                >
                                    Use Template <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                    
                    {/* Custom Template Placeholder */}
                    <Card className="border-2 border-dashed flex flex-col items-center justify-center min-h-[300px] hover:bg-pl-sunken transition-colors cursor-pointer group">
                        <div className="p-4 bg-pl-surface rounded-full mb-4 group-hover:scale-110 transition-transform">
                            <Copy className="w-6 h-6 text-pl-muted" />
                        </div>
                        <h3 className="text-pl-muted font-medium">Save Current as Template</h3>
                        <p className="text-xs text-pl-muted mt-2 max-w-[200px] text-center">
                            Create a custom template from your active project state.
                        </p>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default TemplateLibrary;