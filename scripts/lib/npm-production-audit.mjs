const severityRank = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

function visitDependencies(dependencies, versions) {
  if (!dependencies || typeof dependencies !== 'object') return;

  for (const [packageName, dependency] of Object.entries(dependencies)) {
    if (!dependency || typeof dependency !== 'object') continue;

    const { resolved, version } = dependency;
    if (
      typeof version === 'string' &&
      typeof resolved === 'string' &&
      resolved.startsWith('https://registry.npmjs.org/')
    ) {
      const packageVersions = versions.get(packageName) ?? new Set();
      packageVersions.add(version);
      versions.set(packageName, packageVersions);
    }

    visitDependencies(dependency.dependencies, versions);
    visitDependencies(dependency.optionalDependencies, versions);
  }
}

export function collectRegistryVersions(projects) {
  const versions = new Map();
  for (const project of projects) {
    visitDependencies(project?.dependencies, versions);
    visitDependencies(project?.optionalDependencies, versions);
  }

  return Object.fromEntries(
    [...versions.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([packageName, packageVersions]) => [
        packageName,
        [...packageVersions].sort(),
      ]),
  );
}

export function flattenAdvisories(advisories) {
  return Object.entries(advisories)
    .flatMap(([packageName, packageAdvisories]) =>
      packageAdvisories.map((advisory) => ({ packageName, ...advisory })),
    )
    .sort(
      (left, right) =>
        (severityRank[right.severity] ?? -1) -
          (severityRank[left.severity] ?? -1) ||
        left.packageName.localeCompare(right.packageName),
    );
}

export function findBlockingAdvisories(advisories, threshold = 'high') {
  const minimum = severityRank[threshold];
  if (minimum === undefined) {
    throw new Error(`Unsupported audit threshold: ${threshold}`);
  }

  return flattenAdvisories(advisories).filter(
    ({ severity }) => (severityRank[severity] ?? -1) >= minimum,
  );
}
