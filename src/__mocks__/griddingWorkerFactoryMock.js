// jest stand-in for Seismolord's griddingWorkerFactory.js (which uses
// import.meta — unparseable under babel-jest's CJS transform). Tests
// exercising gridHorizonSurface must inject their own worker behavior;
// the amplitude/pick workflows never construct one.
export const newGriddingWorker = () => {
  throw new Error('gridding worker unavailable under jest');
};
