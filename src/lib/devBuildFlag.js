// True in a Vite dev server (local dev and the staging server
// suite.studio.petrolord.com), false in a production build. Kept in its own
// module because jest cannot parse import.meta; jest.config.js maps this file
// to src/__mocks__/devBuildFlagMock.js.
export const IS_DEV_BUILD = Boolean(import.meta.env.DEV);
