import React from 'react';
import { Button } from '@/components/ui/button';
import { NumericTable, NumTh, NumRow, RowLabel, NumCell, NUMERIC_TABLE } from '@/components/ui/numeric-table';
import { Edit2, Trash2 } from 'lucide-react';

// Design system rollout 6A: the cost items read as a ledger, so they sit in
// the NumericTable recipe (sticky item names, mono right-aligned amounts,
// strong rule above the total). The figures and their formatting are
// unchanged.
const TEXT_CELL = 'whitespace-nowrap border-b border-pl-border px-3 py-2 text-left text-xs';

const CostBreakdown = ({ costItems, onEdit, onDelete }) => {
    if (!costItems || costItems.length === 0) {
        return <div className="text-center py-8 text-pl-muted">No cost items recorded.</div>;
    }

    const total = costItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

    return (
        <NumericTable>
            <thead>
                <tr>
                    <NumTh sticky>Item Name</NumTh>
                    <NumTh>Category</NumTh>
                    <NumTh>Type</NumTh>
                    <NumTh>Phase</NumTh>
                    <NumTh numeric>Amount (MM$)</NumTh>
                    <NumTh className="w-[100px] text-right">Actions</NumTh>
                </tr>
            </thead>
            <tbody>
                {costItems.map((item) => (
                    <NumRow key={item.id}>
                        <RowLabel>{item.name}</RowLabel>
                        <td className={`${TEXT_CELL} text-pl-muted`}>{item.category}</td>
                        <td className={TEXT_CELL}>
                            <span className={`px-2 py-1 rounded text-xs font-bold bg-pl-sunken ${item.type === 'CAPEX' ? 'text-pl-text' : 'text-pl-muted'}`}>
                                {item.type}
                            </span>
                        </td>
                        <td className={`${TEXT_CELL} text-pl-muted`}>{item.phase}</td>
                        <NumCell value={parseFloat(item.amount)} signed={false}>
                            {parseFloat(item.amount).toFixed(2)}
                        </NumCell>
                        <td className="border-b border-pl-border px-3 py-1 text-right">
                            <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-text" onClick={() => onEdit(item)}>
                                    <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-danger-text" onClick={() => onDelete(item.id)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </td>
                    </NumRow>
                ))}
                <tr>
                    <RowLabel total className="uppercase tracking-wider">Total Estimate</RowLabel>
                    <td colSpan={3} className={`${NUMERIC_TABLE.total} border-b border-pl-border`} />
                    <NumCell total value={total} signed={false} className="text-sm">${total.toFixed(2)}</NumCell>
                    <td className={`${NUMERIC_TABLE.total} border-b border-pl-border`} />
                </tr>
            </tbody>
        </NumericTable>
    );
};

export default CostBreakdown;
