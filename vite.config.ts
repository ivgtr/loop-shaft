import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset URLs support GitHub Pages and custom domains.
  base: './',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/i18nSetup.ts'],
    // Authoring constraints and multi-seed probes are opt-in, not merge gates.
    exclude: ['tests/**/*.extended.test.ts'],
  },
});
