
// file deleted to resolve lint errors

// jsdom has no structuredClone (Node does, but the jest jsdom realm hides
// it); fake-indexeddb and Dexie need it for the Wellsite Studio local store
// tests. v8 serialisation covers plain data, Dates, Maps and typed arrays.
if (typeof globalThis.structuredClone !== 'function') {
  // eslint-disable-next-line global-require
  const v8 = require('node:v8');
  globalThis.structuredClone = (value) => v8.deserialize(v8.serialize(value));
}
