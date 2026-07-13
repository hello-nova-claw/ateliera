import eslint from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

const workspacePackages = [
  '@studio/application',
  '@studio/content',
  '@studio/domain',
  '@studio/index',
  '@studio/storage',
  '@studio/test-utils',
  '@studio/ui',
];

const forbidWorkspaceImportsExcept = (allowed) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: workspacePackages
        .filter((packageName) => !allowed.includes(packageName))
        .map((packageName) => ({
          group: [packageName, `${packageName}/*`],
          message: `${packageName} is outside this package's allowed dependency layer.`,
        })),
    },
  ],
});

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'playwright-report/**', 'test-results/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['apps/studio/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...reactRefresh.configs.vite.rules,
      ...forbidWorkspaceImportsExcept(['@studio/application', '@studio/ui']).rules,
    },
  },
  {
    files: ['packages/domain/**/*.{ts,tsx}'],
    rules: forbidWorkspaceImportsExcept([]),
  },
  {
    files: ['packages/{content,index,storage}/**/*.{ts,tsx}'],
    rules: forbidWorkspaceImportsExcept(['@studio/domain']),
  },
  {
    files: ['packages/application/**/*.{ts,tsx}'],
    rules: forbidWorkspaceImportsExcept([
      '@studio/content',
      '@studio/domain',
      '@studio/index',
      '@studio/storage',
    ]),
  },
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: {
      ...forbidWorkspaceImportsExcept(['@studio/domain']).rules,
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'UI must receive data through props and callbacks.' },
        { name: 'localStorage', message: 'UI must not access browser storage.' },
      ],
    },
  },
);
