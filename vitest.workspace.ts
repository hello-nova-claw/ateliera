import { defineWorkspace } from 'vitest/config';

export default defineWorkspace(['apps/*/vite.config.ts', 'packages/*/vitest.config.ts']);
