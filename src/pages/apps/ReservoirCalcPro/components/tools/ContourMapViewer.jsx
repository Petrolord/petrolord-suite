
import React, { useEffect, useState } from 'react';
import { useResizeDetector } from 'react-resize-detector';
import { Loader2 } from 'lucide-react';

const ContourMapViewer = ({ gridData, unitSystem }) => {
    const { ref } = useResizeDetector({
        refreshMode: 'debounce',
        refreshRate: 50,
    });
    
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!gridData || !gridData.z || !gridData.x || !gridData.y) {
            return;
        }

        try {
            const zFlat = gridData.z.flat().filter(v => v !== null && v !== undefined && !isNaN(v));
            if (zFlat.length === 0) throw new Error("Grid contains no valid Z values");
            setError(null);
        } catch (err) {
            console.error("Contour Generation Error:", err);
            setError(err.message);
        }

    }, [gridData, unitSystem]);

    if (error) {
        return <div ref={ref} className="w-full h-full flex items-center justify-center text-red-400 text-xs">{error}</div>;
    }

    if (!gridData) {
        return (
            <div ref={ref} className="w-full h-full flex items-center justify-center bg-slate-950">
               <Loader2 className="w-5 h-5 text-slate-700 animate-spin" />
            </div>
        );
    }

    return (
        <div ref={ref} className="w-full h-full bg-slate-950 relative overflow-hidden flex items-center justify-center text-slate-500">
            Chart removed
        </div>
    );
};

export default React.memo(ContourMapViewer);
