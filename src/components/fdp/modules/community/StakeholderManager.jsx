import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Save } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const StakeholderManager = ({ stakeholders, onUpdate }) => {
    const [newStakeholder, setNewStakeholder] = useState({
        name: '',
        influence: 'Medium',
        interest: 'Neutral',
        status: 'Neutral'
    });

    const handleAdd = () => {
        if (!newStakeholder.name) return;
        const updated = [...stakeholders, { ...newStakeholder, id: Date.now() }];
        onUpdate(updated);
        setNewStakeholder({ name: '', influence: 'Medium', interest: 'Neutral', status: 'Neutral' });
    };

    const handleDelete = (id) => {
        const updated = stakeholders.filter(s => s.id !== id);
        onUpdate(updated);
    };

    return (
        <div className="space-y-4">
            <div className="bg-pl-surface border border-pl-border rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                    <div className="md:col-span-2 space-y-1">
                        <label className="text-xs text-pl-muted">Name / Group</label>
                        <Input 
                            value={newStakeholder.name}
                            onChange={(e) => setNewStakeholder({...newStakeholder, name: e.target.value})}
                            placeholder="e.g. Local Fishermen Assoc."
                            className="h-9"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-pl-muted">Influence</label>
                        <Select value={newStakeholder.influence} onValueChange={(v) => setNewStakeholder({...newStakeholder, influence: v})}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="High">High</SelectItem>
                                <SelectItem value="Medium">Medium</SelectItem>
                                <SelectItem value="Low">Low</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-pl-muted">Status</label>
                        <Select value={newStakeholder.status} onValueChange={(v) => setNewStakeholder({...newStakeholder, status: v})}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Supportive">Supportive</SelectItem>
                                <SelectItem value="Neutral">Neutral</SelectItem>
                                <SelectItem value="Critical">Critical</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={handleAdd} className="h-9">
                        <Plus className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <div className="rounded-md border border-pl-border overflow-hidden">
                <Table>
                    <TableHeader className="bg-pl-sunken">
                        <TableRow className="border-pl-border">
                            <TableHead>Stakeholder</TableHead>
                            <TableHead>Influence</TableHead>
                            <TableHead>Interest</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {stakeholders.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-pl-muted py-4">No stakeholders added.</TableCell>
                            </TableRow>
                        ) : (
                            stakeholders.map((s) => (
                                <TableRow key={s.id} className="border-pl-border hover:bg-pl-sunken/60">
                                    <TableCell className="font-medium text-pl-text">{s.name}</TableCell>
                                    <TableCell className="text-pl-muted">{s.influence}</TableCell>
                                    <TableCell className="text-pl-muted">{s.interest}</TableCell>
                                    <TableCell>
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                                            s.status === 'Supportive' ? 'bg-pl-success-bg text-pl-success-text' : 
                                            s.status === 'Critical' ? 'bg-pl-danger-bg text-pl-danger-text' : 'bg-pl-sunken text-pl-text'
                                        }`}>
                                            {s.status}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)} className="h-8 w-8 text-pl-muted hover:text-pl-danger-text">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};

export default StakeholderManager;