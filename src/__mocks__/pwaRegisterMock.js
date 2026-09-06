// jest stand-in for virtual:pwa-register/react (a Vite virtual module)
module.exports = {
  useRegisterSW: () => ({ needRefresh: [false, () => {}], offlineReady: [false, () => {}], updateServiceWorker: async () => {} }),
};
