// AFE COST CONTROL METRICS RE-EXPORT SHIM (Economics extraction EC0, 2026-09-08).
// The canonical module now lives in the vendored @petrolord/engines package
// (packages/engines/engines/economics/afe.js, synced via git subtree from Petrolord/petrolord-engines) with
// committed goldens and an independent stdlib oracle. This shim keeps every
// existing import path working. Never edit the vendored copy from the
// Suite; change it in the engines repo and subtree-pull.
// EC5-0 (owner decision 2026-09-14) adds itemForecast (the ONE estimate at
// completion rule every AFE screen uses), AfeInputError (thrown on negative
// progress or an invalid asOf) and calculatePartnerCosts.
// EC5-1 (engines #194) adds itemForecastCheck: the same estimate at
// completion with the two flags that say how far to trust it, an entered
// forecast below the money already spent and committed, and a negative
// entered forecast the standard rule overrode.
export {
  AfeInputError,
  calculateMetrics,
  calculatePartnerCosts,
  generateSCurveData,
  itemForecast,
  itemForecastCheck,
} from '../../packages/engines/engines/economics/afe.js';
