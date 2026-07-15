export interface PnpmDependencyNode {
  dependencies?: Record<string, PnpmDependencyNode>;
  optionalDependencies?: Record<string, PnpmDependencyNode>;
  resolved?: string;
  version?: string;
}

export interface PnpmProjectNode {
  dependencies?: Record<string, PnpmDependencyNode>;
  optionalDependencies?: Record<string, PnpmDependencyNode>;
}

export interface Advisory {
  id: number | string;
  severity: string;
  title: string;
  url: string;
  vulnerable_versions: string;
}

export interface NamedAdvisory extends Advisory {
  packageName: string;
}

export function collectRegistryVersions(
  projects: PnpmProjectNode[],
): Record<string, string[]>;

export function flattenAdvisories(
  advisories: Record<string, Advisory[]>,
): NamedAdvisory[];

export function findBlockingAdvisories(
  advisories: Record<string, Advisory[]>,
  threshold?: string,
): NamedAdvisory[];
