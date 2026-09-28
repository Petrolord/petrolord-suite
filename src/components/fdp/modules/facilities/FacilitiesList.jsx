import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Edit2, Trash2, Copy, CheckCircle } from 'lucide-react';

const FacilitiesList = ({ facilities, onEdit, onDelete, onDuplicate, selectedId, onSelect }) => {
    if (!facilities || facilities.length === 0) {
        return (
            <div className="text-center py-12 bg-pl-surface border border-dashed border-pl-border rounded-lg">
                <p className="text-pl-muted mb-2">No facilities defined yet.</p>
                <p className="text-sm text-pl-muted">Create a facility concept to start engineering.</p>
            </div>
        );
    }

    return (
        <Card>
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-pl-sunken">
                            <TableRow className="border-pl-border">
                                <TableHead className="w-[50px]">Sel</TableHead>
                                <TableHead>Facility Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead className="text-right">Oil Cap (bpd)</TableHead>
                                <TableHead className="text-right">CAPEX ($MM)</TableHead>
                                <TableHead className="text-right w-[120px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {facilities.map((facility) => (
                                <TableRow 
                                    key={facility.id} 
                                    className={`border-pl-border hover:bg-pl-sunken/60 cursor-pointer ${selectedId === facility.id ? 'bg-pl-sunken' : ''}`}
                                    onClick={() => onSelect(facility.id)}
                                >
                                    <TableCell>
                                        {selectedId === facility.id && <CheckCircle className="w-4 h-4 text-pl-primary-text" />}
                                    </TableCell>
                                    <TableCell className="font-medium text-pl-text">{facility.name}</TableCell>
                                    <TableCell>
                                        <span className="text-xs px-2 py-1 rounded-full border bg-pl-sunken border-pl-border text-pl-muted">
                                            {facility.type}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{facility.nameplateCapacity?.toLocaleString()}</TableCell>
                                    <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{facility.capex}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-pl-muted hover:text-pl-text" onClick={() => onDuplicate(facility)}>
                                                <Copy className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-pl-muted hover:text-pl-text" onClick={() => onEdit(facility)}>
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-pl-muted hover:text-pl-danger-text" onClick={() => onDelete(facility.id)}>
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};

export default FacilitiesList;