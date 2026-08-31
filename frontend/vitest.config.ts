import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      // pino cannot load under Vite's externalisation (its runtime require()
      // resolves against a rewritten __dirname). Swap in a console logger with
      // the same factory shape so backend code needs no test-only branch.
      { find: /^pino$/, replacement: resolve(__dirname, '../backend/logger/console-logger.ts') },
    ],
  },
  test: {
    include: ['../backend/**/*.test.ts', './**/*.test.ts'],
    environment: 'node',
  },
});
