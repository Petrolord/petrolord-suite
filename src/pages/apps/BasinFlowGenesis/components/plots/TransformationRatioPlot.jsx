import React, { useMemo } from 'react';
import LayerLinesPlot from './LayerLinesPlot';

/**
 * Transformation ratio of the source layers against time (Basin T1-E2):
 * the fraction of the kerogen's potential converted, the curve PetroMod
 * shows next to generation and expulsion.
 */
const TransformationRatioPlot = ({ results }) => {
    const sourceOnly = useMemo(() => {
        const { data, meta } = results || {};
        if (!data?.transformation || !meta?.layers) return null;
        const keep = meta.layers.map((l) => !!l.sourceRock?.isSource);
        if (!keep.some(Boolean)) return null;
        return {
            ...results,
            meta: { ...meta, layers: meta.layers.filter((_, i) => keep[i]) },
            data: { ...data, transformation: data.transformation.filter((_, i) => keep[i]) },
        };
    }, [results]);
    if (!sourceOnly) return null;
    return (
        <LayerLinesPlot
            results={sourceOnly}
            field="transformation"
            title="Transformation Ratio (source layers)"
            yLabel="Transformation ratio (%)"
            yDomain={[0, 100]}
            yConvert={(v) => v * 100}
        />
    );
};

export default TransformationRatioPlot;
