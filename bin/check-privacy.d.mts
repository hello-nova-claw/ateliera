export interface Finding {
  rule: string;
  path: string;
  line: number;
  message: string;
}
export interface Config {
  allowNetwork: { path: string; reason: string }[];
  exceptions: { rule: string; path: string; count: number; issue: number }[];
  allowSwiftPackages?: string[];
}
export const config: Config;
export function scan(
  files: { path: string; text: string }[],
  config: Config,
): Finding[];
