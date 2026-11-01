import eslint from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { noCrossPackageRelativeImports } from './tooling/eslint/no-cross-package-relative-imports.js';

const workspacePackages = [
  '@studio/application',
  '@studio/content',
  '@studio/domain',
  '@studio/index',
  '@studio/rhythm',
  '@studio/storage',
  '@studio/test-utils',
  '@studio/ui',
];

// no-restricted-imports doesn't see import(), so dynamic imports of a package outside the
// layer are caught by their source text instead.
const forbidWorkspaceImportsExcept = (allowed) => {
  const forbidden = workspacePackages.filter((packageName) => !allowed.includes(packageName));
  const message = (packageName) =>
    `${packageName} is outside this package's allowed dependency layer.`;
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: forbidden.map((packageName) => ({
          group: [packageName, `${packageName}/*`],
          message: message(packageName),
        })),
      },
    ],
    'no-restricted-syntax': [
      'error',
      ...forbidden.map((packageName) => ({
        selector: `ImportExpression[source.value=/^${packageName.replace('/', '\\/')}(\\/|$)/]`,
        message: message(packageName),
      })),
    ],
  };
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.toolchains/**',
      // Agent worktrees: each one is linted from inside itself.
      '.claude/**',
      'apps/studio/src-tauri/target/**',
      'artifacts/**',
      'playwright-report/**',
      'test-results/**',
      'packages/rhythm/src/places-data.js',
      // Generated / vendored design-system artifacts (all gitignored).
      'ds-bundle/**',
      '.ds-sync/**',
      '.design-sync/**',
      // Design handoff bundle — reference prototypes, not app source.
      'design_handoff_ateliera_polish/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: {
      studio: { rules: { 'no-cross-package-relative-imports': noCrossPackageRelativeImports } },
    },
    rules: {
      'studio/no-cross-package-relative-imports': 'error',
    },
  },
  {
    files: ['apps/studio/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...reactRefresh.configs.vite.rules,
      // TODO(#229): the app also reaches the packages below directly. Which layers it may
      // use is open; until then it may use those it already does, and no others.
      ...forbidWorkspaceImportsExcept([
        '@studio/application',
        '@studio/ui',
        '@studio/content',
        '@studio/domain',
        '@studio/index',
        '@studio/rhythm',
        '@studio/storage',
      ]),
    },
  },
  {
    files: ['packages/domain/**/*.{ts,tsx}'],
    rules: forbidWorkspaceImportsExcept([]),
  },
  {
    files: ['packages/rhythm/**/*.{ts,tsx}'],
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
  '@studio/rhythm',
      '@studio/storage',
    ]),
  },
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: {
      ...forbidWorkspaceImportsExcept(['@studio/domain']),
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'UI must receive data through props and callbacks.' },
        { name: 'localStorage', message: 'UI must not access browser storage.' },
      ],
    },
  },
);
