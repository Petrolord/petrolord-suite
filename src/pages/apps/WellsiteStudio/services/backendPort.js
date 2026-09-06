// The port every Wellsite Studio screen talks to (plan section 4). One
// implementation, localBackend (Dexie), in the app and in the /dev harness;
// what differs is the transport behind it (Supabase or the fake). The
// list below is the contract; assertBackend refuses a backend that misses
// a function so a missing method fails at mount, not at the first click.

export const PORT = Object.freeze([
  // session
  'currentUser', 'online',
  // wells
  'listWells', 'getWell', 'refreshWells', 'listRegistryWells', 'createWell', 'updateWellSettings', 'updateWellHeader',
  'listMembers',
  // records (WS0 generic; later phases add typed helpers on top)
  'addRecord', 'addRecords', 'listRecords', 'latestRecord', 'getRecord', 'addVersion', 'correctObservation',
  // samples (WS3)
  'listSamples', 'addSamples', 'listStages', 'addStage',
  // photos (WS4)
  'listPhotos', 'addPhoto', 'photoUrl',
  // tops and prognosis (WS5)
  'listTops', 'addTop', 'addTopVersion', 'listPrognosis', 'addPrognosis', 'loadPrognosisSources',
  // sync surface (WS6 fills in)
  'syncStatus', 'subscribeSync', 'flush', 'setCurrentWell', 'retryRejected', 'listConflicts',
  // storage
  'storageInfo',
]);

export function assertBackend(b) {
  const missing = PORT.filter((k) => typeof b?.[k] !== 'function');
  if (missing.length) throw new Error(`Wellsite backend is missing ${missing.join(', ')}.`);
  return b;
}
