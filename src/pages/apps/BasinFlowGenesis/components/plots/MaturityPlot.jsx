import React from 'react';
import { ReferenceArea } from 'recharts';
import LayerLinesPlot from './LayerLinesPlot';
import { MATURITY_WINDOWS } from '../../services/resultsView';

// Maturity windows on %Ro (Tissot and Welte; Peters and Cassa), labelled
// and keyed below the chart (Basin T1-002: the bands were unlabelled and
// set the oil window at 0.5 to 1.0 %Ro). The axis grows with the data so
// an overmature section is not clipped at 3 %Ro.
const MaturityPlot = ({ results }) => {
    const all = (results?.data?.maturity || []).flat().map((e) => e.value).filter(Number.isFinite);
    const top = Math.max(2.5, Math.ceil(((all.length ? Math.max(...all) : 0) + 0.25) * 2) / 2);
    return (
        <LayerLinesPlot
            results={results}
            field="maturity"
            title="Maturity Evolution (%Ro, Easy%Ro)"
            yLabel="Vitrinite Reflectance (%Ro)"
            yDomain={[0, top]}
            footer={(
                <div className="flex flex-wrap justify-center gap-4 text-[11px] text-slate-600 pt-1" data-testid="bf-maturity-windows">
                    {MATURITY_WINDOWS.map((w) => (
                        <span key={w.key} className="flex items-center gap-1">
                            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: w.fill, opacity: 0.35 }} />
                            {w.label} {w.from} to {w.key === 'drygas' ? `${w.to}+` : w.to} %Ro
                        </span>
                    ))}
                </div>
            )}
        >
            {MATURITY_WINDOWS.map((w) => (
                <ReferenceArea key={w.key} y1={w.from} y2={Math.min(w.to, top)} fill={w.fill} fillOpacity={0.1}
                    label={{ value: w.label, position: 'insideTopLeft', fontSize: 10, fill: '#475569' }} />
            ))}
        </LayerLinesPlot>
    );
};

export default MaturityPlot;
