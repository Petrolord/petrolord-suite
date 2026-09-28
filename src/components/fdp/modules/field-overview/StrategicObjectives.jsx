import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Target, Plus, X } from 'lucide-react';

const StrategicObjectives = ({ objectives = [], onChange }) => {
    
    const addObjective = () => {
        onChange([...objectives, { id: Date.now(), text: '' }]);
    };

    const updateObjective = (id, text) => {
        const updated = objectives.map(o => o.id === id ? { ...o, text } : o);
        onChange(updated);
    };

    const removeObjective = (id) => {
        onChange(objectives.filter(o => o.id !== id));
    };

    return (
        <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-medium text-pl-text flex items-center">
                    <Target className="w-5 h-5 mr-2 text-pl-muted" />
                    Strategic Objectives
                </CardTitle>
                <Button size="sm" variant="outline" onClick={addObjective} className="border-pl-border hover:bg-pl-sunken">
                    <Plus className="w-4 h-4 mr-2" /> Add
                </Button>
            </CardHeader>
            <CardContent className="space-y-3">
                 {objectives.length === 0 && (
                    <div className="text-center py-4 text-pl-muted text-sm">No objectives defined.</div>
                )}
                {objectives.map((obj) => (
                    <div key={obj.id} className="flex gap-2">
                        <Textarea 
                            placeholder="Define strategic objective (e.g., maximize recovery, fast-track first oil)..." 
                            value={obj.text}
                            onChange={(e) => updateObjective(obj.id, e.target.value)}
                            className="min-h-[60px]"
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8 mt-2 text-pl-muted hover:text-pl-danger-text" onClick={() => removeObjective(obj.id)}>
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
};

export default StrategicObjectives;