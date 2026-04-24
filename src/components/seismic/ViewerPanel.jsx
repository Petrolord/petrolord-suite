
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ViewerPanel = ({ seismicData, onSaveInterpretation }) => {
    const [pickingMode, setPickingMode] = useState(null); 
    const [currentPick, setCurrentPick] = useState([]);
    const [pickName, setPickName] = useState('');

    const startPicking = (mode) => {
        const name = prompt(`Enter name for new ${mode}:`);
        if (name) {
            setPickingMode(mode);
            setPickName(name);
            setCurrentPick([]);
        }
    };

    const savePick = () => {
        if (currentPick.length < 2) {
            alert('Need at least 2 points to save.');
            return;
        }
        const geojson = {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: currentPick,
            },
            properties: { name: pickName }
        };
        onSaveInterpretation({ name: pickName, kind: pickingMode, geojson });
        cancelPick();
    };

    const cancelPick = () => {
        setPickingMode(null);
        setCurrentPick([]);
        setPickName('');
    };

    if (!seismicData) {
        return <div className="flex items-center justify-center h-full bg-gray-800 text-gray-400">No seismic data loaded.</div>;
    }

    return (
        <div className="h-full flex flex-col">
            <div className="p-2 bg-gray-900 border-b border-gray-700 flex items-center space-x-2">
                <Button onClick={() => startPicking('horizon')} disabled={!!pickingMode}>Pick Horizon</Button>
                <Button onClick={() => startPicking('fault')} disabled={!!pickingMode}>Pick Fault</Button>
                {pickingMode && (
                    <>
                        <Input value={pickName} readOnly className="bg-gray-700 w-48" />
                        <Button onClick={savePick} variant="secondary">Save</Button>
                        <Button onClick={cancelPick} variant="destructive">Cancel</Button>
                    </>
                )}
            </div>
            <div className="flex-grow flex items-center justify-center bg-gray-900 text-slate-500">
                Chart removed
            </div>
        </div>
    );
};

export default ViewerPanel;
