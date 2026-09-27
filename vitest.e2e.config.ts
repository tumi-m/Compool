import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** Browser tests, run on demand against a deployment. Separate config so the
 *  default suite can exclude them and stay under a second. */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['test/e2e/**/*.e2e.ts'], testTimeout: 90_000, hookTimeout: 60_000 },
});
