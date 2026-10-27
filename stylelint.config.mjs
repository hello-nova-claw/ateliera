export default {
  extends: ['stylelint-config-standard'],
  plugins: ['./tools/stylelint/no-undefined-studio-token.mjs'],
  ignoreFiles: [
    '**/dist/**',
    '**/node_modules/**',
    '**/target/**',
    'artifacts/**',
    'ds-bundle/**',
    '.claude/**',
  ],
  rules: {
    'studio/no-undefined-token': true,
    'declaration-no-important': true,
    'selector-class-pattern': [
      '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__(?:[a-z0-9]+-?)+)?(?:--(?:[a-z0-9]+-?)+)?$',
      { message: 'Expected a BEM-style class selector' },
    ],
  },
};
