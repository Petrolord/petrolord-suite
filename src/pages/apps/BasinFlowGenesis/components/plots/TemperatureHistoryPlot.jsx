import React from 'react';
import LayerLinesPlot from './LayerLinesPlot';
import { tempToDisplay, tempLabel } from '../../services/units';

const TemperatureHistoryPlot = ({ results, units = { temp: 'C' } }) => (
    <LayerLinesPlot
        results={results}
        field="temperature"
        title="Temperature History"
        yLabel={tempLabel(units.temp)}
        yConvert={(c) => tempToDisplay(c, units.temp)}
    />
);

export default TemperatureHistoryPlot;
