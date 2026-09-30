
// file deleted to resolve lint errors

// jsdom has no structuredClone (Node does, but the jest jsdom realm hides
// it); fake-indexeddb and Dexie need it for the Wellsite Studio local store
// tests. v8 serialisation covers plain data, Dates, Maps and typed arrays.
if (typeof globalThis.structuredClone !== 'function') {
  // eslint-disable-next-line global-require
  const v8 = require('node:v8');
  globalThis.structuredClone = (value) => v8.deserialize(v8.serialize(value));
}

// Suite unit profile: an app's unit switch is a view override kept in
// sessionStorage for the browser tab. jsdom keeps sessionStorage across the
// tests of one file, so each test starts as a fresh tab for those keys.
beforeEach(() => {
  try {
    const s = globalThis.window?.sessionStorage;
    if (!s) return;
    for (let i = s.length - 1; i >= 0; i -= 1) {
      const k = s.key(i);
      if (k && k.startsWith('petrolord.units.')) s.removeItem(k);
    }
  } catch { /* no storage in this environment */ }
});
