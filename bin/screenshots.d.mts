export interface ShotDiff {
  changed: string[];
  added: string[];
  removed: string[];
  unchanged: number;
}
export const MARKER: string;
export const SHOT: RegExp;
export const SHOWN: number;
export function shotName(suggested: string): string | null;
export function isJpeg(buffer: Buffer): boolean;
export function validate(dir: string): void;
export function hashes(dir: string): Map<string, string>;
export function diff(
  base: Map<string, string>,
  head: Map<string, string>,
): ShotDiff;
export function stage(mainDir: string, headDir: string, prDir: string): ShotDiff;
export function comment(options: {
  diff: ShotDiff;
  repo: string;
  pr: string;
  headSha: string;
  branchSha: string;
}): string;
