import { useEffect, useState } from 'react';

// Persisted, app-wide ReservoirCalc Pro preferences. Stored in localStorage and
// broadcast so every open component (and the calculation engine) stays in sync.
// These are real settings — each one is consumed somewhere:
//   defaultUnitSystem  → applied when it changes / for new projects
//   gridResolution     → ContactVolumetricsEngine + hypsometry + 3D viz grid
//   defaultColorscale  → default colour map for the structure surface layer
//   autoSave           → auto-persist an already-saved project after each run

const KEY = 'rc_settings_v1';
const EVT = 'rc-settings-changed';

export const DEFAULT_SETTINGS = {
    defaultUnitSystem: 'field',
    gridResolution: 150,   // cells per axis (Coarse 80 / Standard 150 / Fine 250)
    defaultColorscale: 'Earth',
    interpolationMethod: 'kriging', // 'kriging' (ordinary kriging) or 'idw'
    autoSave: false,
};

export const INTERPOLATION_OPTIONS = [
    { value: 'kriging', label: 'Ordinary Kriging (recommended)' },
    { value: 'idw', label: 'Inverse Distance (fast)' },
];

export const RESOLUTION_OPTIONS = [
    { value: 80, label: 'Coarse (fast)' },
    { value: 150, label: 'Standard' },
    { value: 250, label: 'Fine (slow)' },
];

export const COLORSCALE_OPTIONS = ['Earth', 'Viridis', 'Jet', 'Hot', 'Blues'];

export function loadSettings() {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
        return { ...DEFAULT_SETTINGS, ...raw };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveSettings(next) {
    try {
        localStorage.setItem(KEY, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent(EVT, { detail: next }));
    } catch { /* storage disabled — ignore */ }
}

// React hook: returns [settings, update(patch)] and re-renders on cross-component
// or cross-tab changes.
export function useReservoirSettings() {
    const [settings, setSettings] = useState(loadSettings);
    useEffect(() => {
        const sync = () => setSettings(loadSettings());
        window.addEventListener(EVT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(EVT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);
    const update = (patch) => {
        const next = { ...loadSettings(), ...patch };
        saveSettings(next);
        setSettings(next);
    };
    return [settings, update];
}
