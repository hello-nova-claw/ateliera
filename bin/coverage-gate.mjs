#!/usr/bin/env node
// Fails when the Apple app's line coverage drops below .github/coverage-baseline.
// Reads the report from `xcrun xccov view --report --json <result bundle>`, and
// counts only the app target: not test bundles, extensions or generated code.
//
// Usage: node bin/coverage-gate.mjs <path to .xcresult>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const APP = 'Ateliera.app';

export function appCoverage(report) {
  const app = report.targets.find((target) => target.name === APP);
  if (!app) throw new Error(`No ${APP} target in the coverage report.`);
  // Kept to four decimal places of a percent: enough that 33.496% never passes a
  // 33.5% baseline, and it drops binary noise such as 0.3409 * 100 = 34.0899….
  return Math.round(app.lineCoverage * 1e6) / 1e4;
}

// Rounds down to two decimal places, so the suggested baseline never fails the
// coverage that suggested it.
export function suggestedBaseline(coverage) {
  return (Math.floor(Math.round(coverage * 1e4) / 100) / 100).toFixed(2);
}

export function gate(coverage, baseline) {
  return { pass: coverage >= baseline, raise: coverage - baseline > 0.5 };
}

function main([bundle]) {
  const report = JSON.parse(
    execFileSync('xcrun', ['xccov', 'view', '--report', '--json', bundle], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    }),
  );
  const coverage = appCoverage(report);
  const baseline = Number.parseFloat(
    readFileSync('.github/coverage-baseline', 'utf8'),
  );
  const { pass, raise } = gate(coverage, baseline);
  const shown = coverage.toFixed(2);
  console.log(`Ateliera.app line coverage: ${shown}% (baseline ${baseline}%).`);
  if (!pass) {
    console.log(
      `::error::Line coverage fell from ${baseline}% to ${shown}%. Add tests (CONTRIBUTING.md, Tests).`,
    );
    process.exit(1);
  }
  if (raise) {
    console.log(
      `::notice::Coverage rose by more than half a point. Set .github/coverage-baseline to ${suggestedBaseline(coverage)} in this pull request.`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2));
