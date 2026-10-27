export function missingTests(changed: string[]): boolean;
export function missingChangelogFragment(added: string[]): boolean;
export function missingPrivacyDoc(
  changed: string[],
  usageDiff: (path: string) => string,
): boolean;
