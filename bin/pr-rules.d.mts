export function missingTests(changed: string[], present?: string[]): boolean;
export function missingChangelogFragment(added: string[]): boolean;
export function missingPrivacyDoc(
  changed: string[],
  usageDiff: (path: string) => string,
  present?: string[],
): boolean;
