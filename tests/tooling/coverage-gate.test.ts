import { expect, test } from 'vitest';

import { appCoverage, gate } from '../../bin/coverage-gate.mjs';

const report = {
  targets: [
    { name: 'Ateliera.app', lineCoverage: 0.6234, executableLines: 1000 },
    {
      name: 'AtelieraWidgetsExtension.appex',
      lineCoverage: 0.1,
      executableLines: 50,
    },
    { name: 'AtelieraTests.xctest', lineCoverage: 0.99, executableLines: 900 },
  ],
};

test('reads the app target, not tests or extensions', () => {
  expect(appCoverage(report)).toBe(62.34);
});

test('fails when coverage drops below the baseline', () => {
  expect(gate(62.34, 62.5).pass).toBe(false);
  expect(gate(62.34, 62.34).pass).toBe(true);
  expect(gate(62.34, 61).pass).toBe(true);
});

test('asks for a higher baseline when coverage rises by more than half a point', () => {
  expect(gate(62.34, 61.5).raise).toBe(true);
  expect(gate(62.34, 62).raise).toBe(false);
});

test('a missing app target is an error', () => {
  expect(() => appCoverage({ targets: [] })).toThrow(/Ateliera\.app/);
});

test('rounding never lifts coverage over the baseline', () => {
  const coverage = appCoverage({ targets: [{ name: 'Ateliera.app', lineCoverage: 0.33496 }] });
  expect(gate(coverage, 33.5).pass).toBe(false);
});
