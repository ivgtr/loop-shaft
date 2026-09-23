import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/balance.test.ts',
      'tests/balanceSimulation.extended.test.ts',
      'tests/prospecting.extended.test.ts',
    ],
  },
});
