import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowUpToLine, ArrowDownToLine, Trash2, Undo2, Redo2 } from 'lucide-react';
import { SEGMENT_TYPES, SEGMENT_TYPE_LABELS } from '../services/planEditor';

// Compass-style Plan Editor: one row per section end plus the tie-on.
// Rows come from services/planEditor derivePlanTable (a view of the one
// `segments` array); every change goes back through the callbacks, so
// this component holds no copy of the plan. Defining cells are
// editable per section type; computed cells are read-only.

const fmt = (v, dp = 2) => (Number.isFinite(v) ? v.toFixed(dp) : '');

/** An input that commits on Enter or blur, only when the text changed. */
function EditCell({ value, dp, onCommit, testId, label }) {
    const shown = fmt(value, dp);
    const [text, setText] = useState(shown);
    const [dirty, setDirty] = useState(false);
    useEffect(() => { if (!dirty) setText(shown); }, [shown, dirty]);
    const commit = () => {
        if (!dirty) return;
        setDirty(false);
        const ok = onCommit(text);
        if (!ok) setText(shown);
    };
    return (
        <input
            type="text"
            inputMode="decimal"
            aria-label={label}
            data-testid={testId}
            value={text}
            onChange={(e) => { setText(e.target.value); setDirty(true); }}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(); e.currentTarget.blur(); }
                if (e.key === 'Escape') { setDirty(false); setText(shown); e.currentTarget.blur(); }
            }}
            className="w-full min-w-[4.5rem] rounded border border-pl-primary bg-pl-surface px-1 py-0.5 text-right font-mono text-xs text-pl-text focus:border-pl-primary focus:outline-none"
        />
    );
}

const PlanEditorTable = ({
    rows, readOnly, mdUnit, aziRef = 'grid', onEdit, onChangeType, onInsert, onDelete,
    onUndo, onRedo, canUndo, canRedo,
}) => {
    const rateUnit = mdUnit === 'ft' ? '100ft' : '30m';
    const columns = [
        { key: 'md', head: `MD (${mdUnit})` },
        { key: 'cl', head: `CL (${mdUnit})` },
        { key: 'inc', head: 'Inc (deg)' },
        { key: 'azi', head: `Azi (deg ${aziRef})` },
        { key: 'tvd', head: `TVD (${mdUnit})` },
        { key: 'n', head: `NS (${mdUnit})` },
        { key: 'e', head: `EW (${mdUnit})` },
        { key: 'vs', head: `VS (${mdUnit})` },
        { key: 'dls', head: `DLS (/${rateUnit})` },
        { key: 'tf', head: 'TF (deg)', dp: 1 },
        { key: 'build', head: `Build (/${rateUnit})` },
        { key: 'turn', head: `Turn (/${rateUnit})` },
    ];

    return (
        <div className="flex h-full flex-col" data-testid="plan-editor">
            <div className="flex flex-wrap items-center gap-2 border-b border-pl-border px-3 py-2 text-xs text-pl-muted">
                <span className="font-semibold uppercase text-pl-text">Plan editor</span>
                <span>
                    {readOnly
                        ? 'This design is read-only.'
                        : 'Green cells define each section; the rest are computed. Enter or click away to apply.'}
                </span>
                {!readOnly && (
                    <div className="ml-auto flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={onUndo} disabled={!canUndo}
                            className="h-7 px-2 text-xs text-pl-text" title="Undo (Ctrl+Z)" data-testid="plan-undo">
                            <Undo2 className="mr-1 h-3 w-3" /> Undo
                        </Button>
                        <Button size="sm" variant="ghost" onClick={onRedo} disabled={!canRedo}
                            className="h-7 px-2 text-xs text-pl-text" title="Redo (Ctrl+Shift+Z)" data-testid="plan-redo">
                            <Redo2 className="mr-1 h-3 w-3" /> Redo
                        </Button>
                    </div>
                )}
            </div>
            <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-pl-sunken">
                        <tr>
                            <th className="px-2 py-2 text-left font-medium text-pl-text">#</th>
                            {columns.map((c) => (
                                <th key={c.key} className="whitespace-nowrap px-2 py-2 text-right font-medium text-pl-text">{c.head}</th>
                            ))}
                            <th className="px-2 py-2 text-left font-medium text-pl-text">Section</th>
                            <th className="px-2 py-2 text-left font-medium text-pl-text">Target</th>
                            {!readOnly && <th className="px-2 py-2" aria-label="Row actions" />}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => {
                            const tie = row.segIndex < 0;
                            return (
                                <tr key={row.key} className={`border-b border-pl-border hover:bg-pl-sunken ${row.compiled ? '' : 'opacity-60'}`}
                                    data-testid={`plan-row-${tie ? 'tie' : row.segIndex}`}>
                                    <td className="px-2 py-1 font-mono text-pl-muted">{tie ? '' : row.segIndex + 1}</td>
                                    {columns.map((c) => {
                                        const editable = !readOnly && row.editable.includes(c.key);
                                        return (
                                            <td key={c.key} className="px-1 py-1 text-right font-mono text-pl-text">
                                                {editable ? (
                                                    <EditCell
                                                        value={row[c.key]}
                                                        dp={c.dp ?? 2}
                                                        label={`Row ${row.segIndex + 1} ${c.key}`}
                                                        testId={`plan-cell-${row.segIndex}-${c.key}`}
                                                        onCommit={(text) => onEdit(row, c.key, text)}
                                                    />
                                                ) : (
                                                    <span className={row.editable.includes(c.key) ? 'text-pl-primary-text' : ''}>{fmt(row[c.key], c.dp ?? 2)}</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="px-2 py-1">
                                        {tie ? (
                                            <span className="text-pl-muted">Tie-on</span>
                                        ) : (
                                            <div className="flex items-center gap-1">
                                                <Select value={row.type} onValueChange={(t) => onChangeType(row, t)} disabled={readOnly}>
                                                    <SelectTrigger className="h-6 w-28 text-[11px]" data-testid={`plan-type-${row.segIndex}`}>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {SEGMENT_TYPES.map((t) => (
                                                            <SelectItem key={t} value={t}>{SEGMENT_TYPE_LABELS[t]}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {!row.compiled && (
                                                    <span className="text-[10px] text-pl-warning-text" title="Needs a positive length and a nonzero rate, or all three Inc, Azi and MD values.">skipped</span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-1 text-pl-warning-text">{row.target || ''}</td>
                                    {!readOnly && (
                                        <td className="whitespace-nowrap px-1 py-1">
                                            {!tie && (
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-pl-muted hover:text-pl-primary-text"
                                                    title="Insert a line above" onClick={() => onInsert(row.segIndex)} data-testid={`plan-insert-above-${row.segIndex}`}>
                                                    <ArrowUpToLine className="h-3 w-3" />
                                                </Button>
                                            )}
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-pl-muted hover:text-pl-primary-text"
                                                title="Insert a line below" onClick={() => onInsert(row.segIndex + 1)} data-testid={`plan-insert-below-${tie ? 'tie' : row.segIndex}`}>
                                                <ArrowDownToLine className="h-3 w-3" />
                                            </Button>
                                            {!tie && (
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-pl-muted hover:text-pl-danger-text"
                                                    title="Delete this line" onClick={() => onDelete(row.segIndex)} data-testid={`plan-delete-${row.segIndex}`}>
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <p className="px-3 py-2 text-[10px] text-pl-muted">
                    Inc Azi MD sections reach the stated inclination and azimuth at the stated MD on one circular arc; their DLS and TF re-solve when rows above change.
                    Azimuths are in the wellbore&apos;s {aziRef} reference. Target names show when a section end lands on a site target.
                </p>
            </div>
        </div>
    );
};

export default PlanEditorTable;
