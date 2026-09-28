import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarPlus as CalendarIcon, Save, X } from 'lucide-react';
import { differenceInDays } from 'date-fns';

/**
 * EC6-0: the form now collects predecessors. Without them the Schedule tab
 * could not compute the critical path it promised in its own header, and the
 * engine behind it called every activity critical.
 */
const ScheduleForm = ({ initialData, onSave, onCancel, activities = [] }) => {
    const [formData, setFormData] = useState({
        id: Date.now(),
        name: '',
        type: 'Engineering',
        start: new Date().toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0],
        duration: 0,
        progress: 0,
        dependencies: [],
        description: ''
    });

    useEffect(() => {
        if (initialData) {
            setFormData({ dependencies: [], ...initialData });
        }
    }, [initialData]);

    useEffect(() => {
        // Auto calc duration
        if (formData.start && formData.end) {
            const start = new Date(formData.start);
            const end = new Date(formData.end);
            const diff = differenceInDays(end, start);
            if (diff >= 0) {
                setFormData(prev => ({ ...prev, duration: diff }));
            }
        }
    }, [formData.start, formData.end]);

    const handleChange = (key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const others = (activities || []).filter((a) => String(a.id) !== String(formData.id));

    const togglePredecessor = (id) => {
        setFormData(prev => {
            const current = prev.dependencies || [];
            const has = current.some((d) => String(d) === String(id));
            return {
                ...prev,
                dependencies: has
                    ? current.filter((d) => String(d) !== String(id))
                    : [...current, id],
            };
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <Card className="max-w-2xl mx-auto">
            <CardHeader>
                <CardTitle className="text-pl-text flex items-center">
                    <CalendarIcon className="w-5 h-5 mr-2 text-pl-muted" />
                    {initialData ? 'Edit Activity' : 'New Activity'}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Activity Name</Label>
                            <Input 
                                value={formData.name} 
                                onChange={(e) => handleChange('name', e.target.value)} 
                                placeholder="e.g., FEED Study"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Type</Label>
                            <Select 
                                value={formData.type} 
                                onValueChange={(v) => handleChange('type', v)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Engineering">Engineering</SelectItem>
                                    <SelectItem value="Procurement">Procurement</SelectItem>
                                    <SelectItem value="Fabrication">Fabrication</SelectItem>
                                    <SelectItem value="Drilling">Drilling</SelectItem>
                                    <SelectItem value="Installation">Installation</SelectItem>
                                    <SelectItem value="Commissioning">Commissioning</SelectItem>
                                    <SelectItem value="Milestone">Milestone</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Start Date</Label>
                            <Input 
                                type="date"
                                value={formData.start} 
                                onChange={(e) => handleChange('start', e.target.value)} 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>End Date</Label>
                            <Input 
                                type="date"
                                value={formData.end} 
                                onChange={(e) => handleChange('end', e.target.value)} 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Duration (Days)</Label>
                            <Input 
                                type="number"
                                value={formData.duration} 
                                readOnly
                                className="bg-pl-sunken text-pl-muted cursor-not-allowed"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Must finish first (predecessors)</Label>
                        {others.length === 0 ? (
                            <p className="text-xs text-pl-muted">
                                This is the only activity in the plan, so it has nothing to wait for.
                            </p>
                        ) : (
                            <div className="max-h-40 overflow-y-auto rounded border border-pl-border bg-pl-sunken p-2 space-y-1">
                                {others.map((a) => {
                                    const checked = (formData.dependencies || []).some((d) => String(d) === String(a.id));
                                    return (
                                        <label key={a.id} className="flex items-center gap-2 text-sm text-pl-text cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => togglePredecessor(a.id)}
                                                className="accent-pl-primary"
                                            />
                                            <span>{a.name || a.id}</span>
                                            <span className="text-xs text-pl-muted">{Number(a.duration) || 0}d</span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                        <p className="text-xs text-pl-muted">
                            Finish to start. The critical path is computed from these links.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Progress (%)</Label>
                        <div className="flex items-center gap-4">
                            <Input 
                                type="range"
                                min="0"
                                max="100"
                                value={formData.progress}
                                onChange={(e) => handleChange('progress', parseInt(e.target.value))}
                                className="flex-1"
                            />
                            <span className="w-12 text-right font-pl-mono tabular-nums text-pl-text">{formData.progress}%</span>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="ghost" onClick={onCancel} className="text-pl-muted hover:text-pl-text">
                            <X className="w-4 h-4 mr-2" /> Cancel
                        </Button>
                        <Button type="submit">
                            <Save className="w-4 h-4 mr-2" /> Save Activity
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
};

export default ScheduleForm;