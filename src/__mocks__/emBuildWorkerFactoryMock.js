// jest: the Earth Modeling build worker factory uses import.meta (Vite);
// under test there is no worker and the build runs inline (U2-004).
export const createBuildWorker = () => null;
