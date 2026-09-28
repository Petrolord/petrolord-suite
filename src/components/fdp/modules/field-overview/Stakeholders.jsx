import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Users, Trash2, Plus } from 'lucide-react';

const Stakeholders = ({ stakeholders = [], onChange }) => {
    
    const addStakeholder = () => {
        onChange([...stakeholders, { id: Date.now(), name: '', role: 'Partner', interest: '' }]);
    };

    const updateStakeholder = (id, field, value) => {
        const updated = stakeholders.map(s => s.id === id ? { ...s, [field]: value } : s);
        onChange(updated);
    };

    const removeStakeholder = (id) => {
        onChange(stakeholders.filter(s => s.id !== id));
    };

    return (
        <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-medium text-pl-text flex items-center">
                    <Users className="w-5 h-5 mr-2 text-pl-muted" />
                    Stakeholders & Equity
                </CardTitle>
                <Button size="sm" variant="outline" onClick={addStakeholder} className="border-pl-border hover:bg-pl-sunken">
                    <Plus className="w-4 h-4 mr-2" /> Add
                </Button>
            </CardHeader>
            <CardContent className="space-y-3">
                {stakeholders.length === 0 && (
                    <div className="text-center py-4 text-pl-muted text-sm">No stakeholders added yet.</div>
                )}
                {stakeholders.map((stakeholder) => (
                    <div key={stakeholder.id} className="grid grid-cols-12 gap-2 items-center bg-pl-sunken p-2 rounded border border-pl-border">
                        <div className="col-span-5">
                            <Input 
                                placeholder="Company Name" 
                                value={stakeholder.name}
                                onChange={(e) => updateStakeholder(stakeholder.id, 'name', e.target.value)}
                                className="h-8"
                            />
                        </div>
                        <div className="col-span-4">
                            <Input 
                                placeholder="Role" 
                                value={stakeholder.role}
                                onChange={(e) => updateStakeholder(stakeholder.id, 'role', e.target.value)}
                                className="h-8"
                            />
                        </div>
                        <div className="col-span-2">
                             <Input 
                                placeholder="%" 
                                type="number"
                                value={stakeholder.interest}
                                onChange={(e) => updateStakeholder(stakeholder.id, 'interest', e.target.value)}
                                className="h-8 text-right"
                            />
                        </div>
                        <div className="col-span-1 flex justify-end">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-pl-muted hover:text-pl-danger-text" onClick={() => removeStakeholder(stakeholder.id)}>
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
};

export default Stakeholders;