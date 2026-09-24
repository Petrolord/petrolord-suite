// Production Forecasting ML Workbench worker (Data & AI D4): the postMessage
// shell around forecastJobs.js handleForecastMessage. All numerics are the
// vendored engine's.
import { handleForecastMessage } from '../forecastJobs';

self.onmessage = (e) => handleForecastMessage(e.data, (m) => self.postMessage(m));
