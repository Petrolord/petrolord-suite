import React from 'react';
import { ReferenceArea } from 'recharts';
import LayerLinesPlot from './LayerLinesPlot';

const MaturityPlot = ({ results }) => (
    <LayerLinesPlot
        results={results}
        field="maturity"
        title="Maturity Evolution (%Ro, Easy%Ro)"
        yLabel="Vitrinite Reflectance (%Ro)"
        yDomain={[0, 3]}
    >
        {/* Oil / wet gas / dry gas maturity windows */}
        <ReferenceArea y1={0.5} y2={1.0} fill="#22c55e" fillOpacity={0.08} />
        <ReferenceArea y1={1.0} y2={1.3} fill="#f59e0b" fillOpacity={0.08} />
        <ReferenceArea y1={1.3} y2={2.6} fill="#ef4444" fillOpacity={0.08} />
    </LayerLinesPlot>
);

export default MaturityPlot;
