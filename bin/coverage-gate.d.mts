export function appCoverage(report: {
  targets: { name: string; lineCoverage: number }[];
}): number;
export function gate(
  coverage: number,
  baseline: number,
): { pass: boolean; raise: boolean };
export const TOLERANCE: number;
export function suggestedBaseline(coverage: number): string;
