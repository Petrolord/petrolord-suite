import React from 'react';
import LayerLinesPlot from './LayerLinesPlot';

const TemperatureHistoryPlot = ({ results }) => (
    <LayerLinesPlot
        results={results}
        field="temperature"
        title="Temperature History"
        yLabel="Temperature (°C)"
    />
);

export default TemperatureHistoryPlot;
