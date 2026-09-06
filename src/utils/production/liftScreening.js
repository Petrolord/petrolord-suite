// liftScreening: the Suite's door onto the engine.
//
// THE MATH LIVES IN THE ENGINE, at
// packages/engines/engines/production/liftScreening.js, re-exported through
// ./engine/liftScreening.js. This module used to be a second implementation of it;
// the engine's copy was extracted from this one and then carried the
// owner's 4 September decisions, none of which reached a user while the
// studios imported the older copy from here.
export * from './engine/liftScreening.js';
