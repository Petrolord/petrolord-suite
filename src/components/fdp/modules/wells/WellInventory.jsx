import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Edit2, Trash2, Copy, CheckCircle, Circle } from 'lucide-react';
import { useFullPrecision } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';

const WellInventory = ({ wells, onEdit, onDelete, onDuplicate }) => {
    // W3 (D3): with Full precision on, each well cost prints to the USD and a
    // campaign total row appears; off, the column prints $MM to 1 dp as before.
    const { full } = useFullPrecision();
    if (wells.length === 0) {
        return (
            <div className="text-center py-12 bg-slate-900/50 border border-dashed border-slate-800 rounded-lg">
                <p className="text-slate-500 mb-2">No wells defined yet.</p>
                <p className="text-sm text-slate-600">Add wells to build your drilling schedule.</p>
            </div>
        );
    }

    return (
        <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-800/50">
                            <TableRow className="border-slate-800">
                                <TableHead className="text-slate-300">Well Name</TableHead>
                                <TableHead className="text-slate-300">Type</TableHead>
                                <TableHead className="text-slate-300">Trajectory</TableHead>
                                <TableHead className="text-slate-300 text-right">MD (ft)</TableHead>
                                <TableHead className="text-slate-300 text-right">{full ? 'Est. Cost (USD)' : 'Est. Cost ($MM)'}</TableHead>
                                <TableHead className="text-slate-300">Status</TableHead>
                                <TableHead className="text-right w-[120px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {wells.map((well) => (
                                <TableRow key={well.id} className="border-slate-800 hover:bg-slate-800/30">
                                    <TableCell className="font-medium text-white">{well.name}</TableCell>
                                    <TableCell>
                                        <span className={`text-xs px-2 py-1 rounded-full border ${
                                            well.type.includes('Producer') 
                                                ? 'bg-green-950 border-green-800 text-green-400' 
                                                : well.type.includes('Injector') 
                                                    ? 'bg-blue-950 border-blue-800 text-blue-400'
                                                    : 'bg-slate-800 border-slate-700 text-slate-400'
                                        }`}>
                                            {well.type}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-slate-400">{well.trajectory}</TableCell>
                                    <TableCell className="text-right font-mono text-slate-300">{well.md?.toLocaleString()}</TableCell>
                                    <TableCell className="text-right font-mono text-slate-300">{full ? formatFull(well.cost, 0) : (well.cost / 1000000).toFixed(1)}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center">
                                            {well.status === 'Completed' ? (
                                                <CheckCircle className="w-3 h-3 mr-2 text-green-500" />
                                            ) : (
                                                <Circle className="w-3 h-3 mr-2 text-yellow-500" />
                                            )}
                                            <span className="text-slate-400">{well.status}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-white" onClick={() => onDuplicate(well)}>
                                                <Copy className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-white" onClick={() => onEdit(well)}>
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-400" onClick={() => onDelete(well.id)}>
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {full && (
                                <TableRow className="border-slate-800" data-testid="well-campaign-total">
                                    <TableCell className="font-medium text-white" colSpan={4}>Campaign total</TableCell>
                                    <TableCell className="text-right font-mono text-white">
                                        {formatFull(wells.reduce((sum, w) => sum + (Number(w.cost) || 0), 0), 0)}
                                    </TableCell>
                                    <TableCell colSpan={2} />
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};

export default WellInventory;