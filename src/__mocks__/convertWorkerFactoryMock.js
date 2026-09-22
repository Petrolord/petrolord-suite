// Jest stand-in for convertWorkerFactory (import.meta worker URL). Tests
// inject a conversion runner into the import job manager; this default
// just refuses loudly.
export const newConvertWorker = () => {
  throw new Error('No conversion worker in jest: pass convert to createImportJobManager.');
};
