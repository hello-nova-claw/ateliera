// Build-time generator for the design-sync token stylesheet.
// Concatenates the app's authoritative token/reset/typography CSS into
// packages/ui/dist/design-tokens.css (pointed at by cfg.cssEntry), stripping
// typography.css's @font-face blocks — those ship separately, with correct
// url()s, via cfg.extraFonts → fonts/fonts.css. Regenerated on every (re-)sync
// from the live sources, so it never drifts from the design system.
import { readFileSync, writeFileSync } from 'node:fs';

const STYLES = 'apps/studio/src/styles';
const read = (f) => readFileSync(`${STYLES}/${f}`, 'utf8');

const typographyVars = read('typography.css').replace(/@font-face\s*\{[^}]*\}/g, '');
const out = [read('tokens.css'), read('reset.css'), typographyVars].join('\n');

writeFileSync('packages/ui/dist/design-tokens.css', out);
console.error(`  gen-design-tokens: wrote ${out.length} bytes to packages/ui/dist/design-tokens.css`);
