import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // The default suite is unit tests only, and must stay under a second — the
    // moment it does not, it stops being run, and then the loop is broken.
    // Browser tests live in *.e2e.ts and run on demand against a deployment.
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules/**', 'test/e2e/**'],
  },
});
