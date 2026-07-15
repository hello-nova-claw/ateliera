export interface DiskImageVerification {
  output: string;
  status: number | null;
  verified: boolean;
}

export type DiskImageRunner = (
  command: string,
  args: string[],
  options: { encoding: string },
) => {
  status: number | null;
  stderr?: string;
  stdout?: string;
};

export function unexpectedMacAppBundles(
  paths: string[],
  expected?: string,
): string[];

export function verifyDiskImage(
  path: string,
  runner?: DiskImageRunner,
): DiskImageVerification;
