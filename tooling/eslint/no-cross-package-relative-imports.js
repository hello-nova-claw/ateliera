import path from 'node:path';

const packageRootPattern = /^(apps|packages)\/([^/]+)/u;

function packageRoot(relativePath) {
  const match = packageRootPattern.exec(relativePath);
  return match ? `${match[1]}/${match[2]}` : null;
}

function checkSource(context, node, source) {
  if (typeof source.value !== 'string' || !source.value.startsWith('.')) {
    return;
  }

  const repositoryRoot = process.cwd();
  const importer = path.relative(repositoryRoot, context.filename);
  const target = path.relative(
    repositoryRoot,
    path.resolve(path.dirname(context.filename), source.value),
  );
  const importerRoot = packageRoot(importer);
  const targetRoot = packageRoot(target);

  if (importerRoot && targetRoot && importerRoot !== targetRoot) {
    context.report({
      node: source,
      messageId: 'crossPackageRelativeImport',
      data: { importerRoot, targetRoot },
    });
  }
}

export const noCrossPackageRelativeImports = {
  meta: {
    type: 'problem',
    docs: { description: 'Require workspace package imports to use @studio specifiers.' },
    messages: {
      crossPackageRelativeImport:
        'Relative import crosses from {{importerRoot}} into {{targetRoot}}. Use the allowed @studio package API.',
    },
    schema: [],
  },
  create(context) {
    return {
      ExportAllDeclaration(node) {
        checkSource(context, node, node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source) checkSource(context, node, node.source);
      },
      ImportDeclaration(node) {
        checkSource(context, node, node.source);
      },
      ImportExpression(node) {
        checkSource(context, node, node.source);
      },
    };
  },
};
