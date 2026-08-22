import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import stylelint from 'stylelint';

const {
  createPlugin,
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

const ruleName = 'studio/no-undefined-token';

const messages = ruleMessages(ruleName, {
  rejected: (token) =>
    `"${token}" is not declared in tokens.css or typography.css. Two undefined tokens once slipped through eleven rooms — declare it or fix the reference.`,
});

const meta = {
  url: 'https://github.com/ateliera/docs/architecture/decisions/ADR-009-revise-studio-typefaces.md',
};

// The two files that are the single source of truth for --studio-* tokens.
const SOURCES = [
  'apps/studio/src/styles/tokens.css',
  'apps/studio/src/styles/typography.css',
];

let declared;
function declaredTokens() {
  if (declared) return declared;
  declared = new Set();
  for (const relative of SOURCES) {
    const css = readFileSync(resolve(process.cwd(), relative), 'utf8');
    for (const match of css.matchAll(/(--studio-[a-z0-9-]+)\s*:/g)) {
      declared.add(match[1]);
    }
  }
  return declared;
}

const ruleFunction = (primary) => (root, result) => {
  const valid = validateOptions(result, ruleName, {
    actual: primary,
    possible: [true],
  });
  if (!valid || primary !== true) return;

  const tokens = declaredTokens();

  root.walkDecls((decl) => {
    for (const match of decl.value.matchAll(/var\(\s*(--studio-[a-z0-9-]+)/g)) {
      const token = match[1];
      if (tokens.has(token)) continue;
      report({
        result,
        ruleName,
        node: decl,
        word: token,
        message: messages.rejected(token),
        meta,
      });
    }
  });
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = meta;

export default createPlugin(ruleName, ruleFunction);
