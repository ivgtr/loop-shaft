import { defineConfig } from 'vitest/config';

// Separate includes: the normal suite's exclusions must not disable manual probes.
export default defineConfig({
  test: { include: ['tests/**/*.extended.test.ts'] },
});
