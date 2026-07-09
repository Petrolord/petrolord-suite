import React from 'react';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';

const DeterministicSummaryTable = () => {
    const { state } = useReservoirCalc();
    const r = state.results;
    if (!r) return null;

    const reservoirName = state.reservoirName || 'Zone 1';
    // Fall back to live inputs/unitSystem for results saved before the engine
    // began echoing them back, so legacy projects render instead of crashing.
    const inputs = r.inputs || state.inputs || {};
    const isField = (r.unitSystem || state.unitSystem) === 'field';
    const ft = r.fluidType; // 'oil', 'gas', 'oil_gas'

    // Formatting helper
    const fmt = (val, decimals = 2) => (val !== undefined && val !== null) ? val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '-';

    // Columns visibility
    const showOil = ft === 'oil' || ft === 'oil_gas';
    const showGas = ft === 'gas' || ft === 'oil_gas';

    return (
        <div className="bg-white text-slate-900 rounded-lg overflow-hidden border border-slate-200 text-xs shadow-sm">
            {/* Header Information */}
            <div className="bg-slate-50 p-2 border-b border-slate-200 grid grid-cols-2 gap-4 font-medium">
                <div>
                    <div className="flex justify-between"><span className="text-slate-500">Date:</span> <span>{new Date().toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Project:</span> <span>{reservoirName}</span></div>
                </div>
                <div>
                    <div className="flex justify-between"><span className="text-slate-500">Fluid System:</span> <span className="uppercase">{ft?.replace('_', '+')}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Unit System:</span> <span className="capitalize">{r.unitSystem || state.unitSystem}</span></div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <Table className="w-full border-collapse">
                    <TableBody>
                        {/* Input Data Section */}
                        <TableRow className="bg-slate-100 border-t-2 border-slate-300"><TableCell colSpan={8} className="font-bold py-1">Input data</TableCell></TableRow>
                        <TableRow className="bg-slate-50 font-semibold text-slate-600">
                            <TableCell className="py-1">Zone(s)</TableCell>
                            <TableCell className="py-1">Top Surface</TableCell>
                            <TableCell className="py-1">Base Surface</TableCell>
                            <TableCell className="py-1">Net-to-Gross</TableCell>
                            <TableCell className="py-1">Porosity</TableCell>
                            <TableCell className="py-1">Fluid Contacts</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell className="py-1">{reservoirName}</TableCell>
                            <TableCell className="py-1">Input_Top</TableCell>
                            <TableCell className="py-1">Input_Base</TableCell>
                            <TableCell className="py-1">{fmt(inputs.ntg, 3)}</TableCell>
                            <TableCell className="py-1">{fmt(inputs.porosity, 3)}</TableCell>
                            <TableCell className="py-1">
                                {showOil && `OWC: ${inputs.owc || '-'}`}
                                {showOil && showGas && ' | '}
                                {showGas && `GOC: ${inputs.goc || '-'}`}
                            </TableCell>
                        </TableRow>

                        {/* Properties Section */}
                        <TableRow className="bg-slate-100 border-t-2 border-slate-300"><TableCell colSpan={8} className="font-bold py-1">Fluid Properties</TableCell></TableRow>
                        <TableRow className="bg-slate-50 font-semibold text-slate-600">
                            <TableCell className="py-1">Type</TableCell>
                            <TableCell className="py-1">Sat. water</TableCell>
                            {showOil && <TableCell className="py-1">Bo [{isField ? 'RB/STB' : 'rm³/sm³'}]</TableCell>}
                            {showOil && <TableCell className="py-1">Rec (Oil)</TableCell>}
                            {showGas && <TableCell className="py-1">Bg [rcf/scf]</TableCell>}
                            {showGas && <TableCell className="py-1">Rec (Gas)</TableCell>}
                        </TableRow>
                        <TableRow>
                            <TableCell className="py-1 capitalize">{ft?.replace('_',' ')}</TableCell>
                            <TableCell className="py-1">{fmt(inputs.sw, 3)}</TableCell>
                            {showOil && <TableCell className="py-1">{fmt(inputs.fvf, 3)}</TableCell>}
                            {showOil && <TableCell className="py-1">{fmt(inputs.recovery, 2)}</TableCell>}
                            {showGas && <TableCell className="py-1">{fmt(inputs.bg, 5)}</TableCell>}
                            {showGas && <TableCell className="py-1">{fmt(inputs.recoveryGas, 2)}</TableCell>}
                        </TableRow>

                        {/* Case Results */}
                        <TableRow className="bg-slate-100 border-t-2 border-slate-300"><TableCell colSpan={8} className="font-bold py-1">Volumetrics</TableCell></TableRow>
                        <TableRow className="bg-slate-50 font-semibold text-slate-600">
                            <TableCell className="py-1">Volume Type</TableCell>
                            <TableCell className="py-1">Gross Vol [{r.volUnit}]</TableCell>
                            <TableCell className="py-1">Net Vol [{r.volUnit}]</TableCell>
                            <TableCell className="py-1">Pore Vol [{r.resVolUnit}]</TableCell>
                            {showOil && <TableCell className="py-1">STOOIP [{r.volumeUnit}]</TableCell>}
                            {showGas && <TableCell className="py-1">GIIP [BSCF/Bsm³]</TableCell>}
                        </TableRow>
                        
                        {/* Oil Row */}
                        {showOil && (
                            <TableRow>
                                <TableCell className="py-1 font-medium text-emerald-600">Oil Zone</TableCell>
                                <TableCell className="py-1">{fmt(r.grvOil, 0)}</TableCell>
                                <TableCell className="py-1">{fmt(r.grvOil * inputs.ntg, 0)}</TableCell>
                                <TableCell className="py-1">{fmt(r.grvOil * inputs.ntg * inputs.porosity * (isField ? 7758 : 1e6), 0)}</TableCell>
                                <TableCell className="py-1 font-bold bg-emerald-50">{fmt(r.stooip, 0)}</TableCell>
                                {showGas && <TableCell className="py-1">-</TableCell>}
                            </TableRow>
                        )}
                        
                        {/* Gas Row */}
                        {showGas && (
                            <TableRow>
                                <TableCell className="py-1 font-medium text-amber-600">Gas Zone</TableCell>
                                <TableCell className="py-1">{fmt(r.grvGas, 0)}</TableCell>
                                <TableCell className="py-1">{fmt(r.grvGas * inputs.ntg, 0)}</TableCell>
                                <TableCell className="py-1">{fmt(r.grvGas * inputs.ntg * inputs.porosity * (isField ? 7758 : 1e6), 0)}</TableCell>
                                {showOil && <TableCell className="py-1">-</TableCell>}
                                <TableCell className="py-1 font-bold bg-amber-50">{fmt(r.giip / 1e9, 3)} B</TableCell>
                            </TableRow>
                        )}
                        
                        {/* Total Row if Mixed */}
                        {(ft === 'oil_gas') && (
                            <TableRow className="border-t-2 border-slate-300 font-bold bg-slate-50">
                                <TableCell className="py-1">Total</TableCell>
                                <TableCell className="py-1">{fmt(r.bulkVolume, 0)}</TableCell>
                                <TableCell className="py-1">{fmt(r.netVolume, 0)}</TableCell>
                                <TableCell className="py-1">{fmt(r.poreVolumeRes, 0)}</TableCell>
                                <TableCell className="py-1">{fmt(r.stooip, 0)}</TableCell>
                                <TableCell className="py-1">{fmt(r.giip / 1e9, 3)} B</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Branded footer — Petrolord mark below the last row of the report */}
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2.5">
                <span className="text-[10px] text-slate-400">
                    Screening estimate — confirm against reservoir simulation before reserves booking.
                </span>
                <div className="flex items-center gap-1.5">
                    <img src="/petrolord-icon.png" alt="Petrolord" className="h-5 w-5 rounded object-contain" />
                    <span className="text-[11px] font-bold tracking-tight text-slate-500">
                        Petrolord <span className="text-emerald-600">Suite</span>
                    </span>
                </div>
            </div>
        </div>
    );
};

export default DeterministicSummaryTable;