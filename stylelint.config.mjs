export default {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['**/dist/**', '**/node_modules/**', 'artifacts/**'],
  rules: {
    'declaration-no-important': true,
  },
};
