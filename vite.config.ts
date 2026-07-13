import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'apps/*/vite.config.ts',
      {
        test: {
          name: 'tooling',
          environment: 'node',
          include: ['tests/tooling/**/*.test.ts'],
        },
      },
    ],
  },
});
