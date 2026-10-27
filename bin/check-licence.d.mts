export function checkMitLicence(text: string): string[];
export function checkContentLicence(
  text: string | undefined,
  exists: (path: string) => boolean,
): string[];
