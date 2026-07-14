import type { ReflectionConnection } from '../../features/reflection/ReflectionPage';

export function canonicalReflectionConnection(
  requested: ReflectionConnection,
  available: readonly ReflectionConnection[],
): ReflectionConnection | undefined {
  return available.find(
    (candidate) => candidate.kind === requested.kind && candidate.id === requested.id,
  );
}
