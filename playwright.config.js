// Playwright e2e config (approved Phase 2 tooling — jest remains the only
// unit runner; e2e specs live in e2e/*.spec.js so jest's testMatch never
// picks them up).
//
// Targets the staging dev server by default (the /dev/* harness routes
// exist only under Vite dev mode). Override with E2E_BASE_URL.
// PERF_STRICT=1 additionally enforces the Phase 2 performance targets —
// meaningful on real-GPU hardware; headless CI runs on SwiftShader where
// only correctness is asserted.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 180000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://suite.studio.petrolord.com',
    headless: true,
  },
  reporter: [['list']],
});
