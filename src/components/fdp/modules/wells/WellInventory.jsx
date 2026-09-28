import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NumericTable, NumTh, NumRow, RowLabel, NumCell, NUMERIC_TABLE } from '@/components/ui/numeric-table';
import { Edit2, Trash2, Copy, CheckCircle, Circle } from 'lucide-react';
import { useFullPrecision } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';

// Design system rollout 6B: the inventory carries the well costs, so it sits
// in the NumericTable recipe (sticky well names, mono right-aligned depths
// and costs, strong rule above the campaign total). The figures and their
// formatting are unchanged.
const TEXT_CELL = 'whitespace-nowrap border-b border-pl-border px-3 py-2 text-left text-xs';

const WellInventory = ({ wells, onEdit, onDelete, onDuplicate }) => {
    // W3 (D3): with Full precision on, each well cost prints to the USD and a
    // campaign total row appears; off, the column prints $MM to 1 dp as before.
    const { full } = useFullPrecision();
    if (wells.length === 0) {
        return (
            <div className="text-center py-12 bg-pl-surface border border-dashed border-pl-border rounded-lg">
                <p className="text-pl-muted mb-2">No wells defined yet.</p>
                <p className="text-sm text-pl-muted">Add wells to build your drilling schedule.</p>
            </div>
        );
    }

    return (
        <NumericTable>
            <thead>
                <tr>
                    <NumTh sticky>Well Name</NumTh>
                    <NumTh>Type</NumTh>
                    <NumTh>Trajectory</NumTh>
                    <NumTh numeric>MD (ft)</NumTh>
                    <NumTh numeric>{full ? 'Est. Cost (USD)' : 'Est. Cost ($MM)'}</NumTh>
                    <NumTh>Status</NumTh>
                    <NumTh className="w-[120px] text-right">Actions</NumTh>
                </tr>
            </thead>
            <tbody>
                {wells.map((well) => (
                    <NumRow key={well.id}>
                        <RowLabel>{well.name}</RowLabel>
                        <td className={TEXT_CELL}>
                            <Badge variant="neutral">
                                {well.type}
                            </Badge>
                        </td>
                        <td className={`${TEXT_CELL} text-pl-muted`}>{well.trajectory}</td>
                        <NumCell value={well.md} signed={false}>{well.md?.toLocaleString()}</NumCell>
                        <NumCell value={well.cost} signed={false}>
                            {full ? formatFull(well.cost, 0) : (well.cost / 1000000).toFixed(1)}
                        </NumCell>
                        <td className={TEXT_CELL}>
                            <div className="flex items-center">
                                {well.status === 'Completed' ? (
                                    <CheckCircle className="w-3 h-3 mr-2 text-pl-success-text" />
                                ) : (
                                    <Circle className="w-3 h-3 mr-2 text-pl-warning-text" />
                                )}
                                <span className="text-pl-muted">{well.status}</span>
                            </div>
                        </td>
                        <td className="border-b border-pl-border px-3 py-1 text-right">
                            <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-pl-muted hover:text-pl-text" onClick={() => onDuplicate(well)}>
                                    <Copy className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-pl-muted hover:text-pl-text" onClick={() => onEdit(well)}>
                                    <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-pl-muted hover:text-pl-danger-text" onClick={() => onDelete(well.id)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </td>
                    </NumRow>
                ))}
                {full && (
                    <tr data-testid="well-campaign-total">
                        <RowLabel total>Campaign total</RowLabel>
                        <td colSpan={3} className={`${NUMERIC_TABLE.total} border-b border-pl-border`} />
                        <NumCell total signed={false}>
                            {formatFull(wells.reduce((sum, w) => sum + (Number(w.cost) || 0), 0), 0)}
                        </NumCell>
                        <td colSpan={2} className={`${NUMERIC_TABLE.total} border-b border-pl-border`} />
                    </tr>
                )}
            </tbody>
        </NumericTable>
    );
};

export default WellInventory;
