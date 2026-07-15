import type { TourStep } from './onboarding-state';

const preloaders = {
  foyer: () => import('../../app/rooms/FoyerRoom'),
  landscape: () => import('../../app/rooms/LandscapeRoom'),
  reflection: () => import('../../app/rooms/ReflectionRoom'),
  season: () => import('../../app/rooms/SeasonRoom'),
  uncharted: () => import('../../app/rooms/UnchartedRoom'),
} satisfies Record<TourStep, () => Promise<unknown>>;

export async function preloadTourRoom(step: TourStep): Promise<void> {
  await preloaders[step]();
}
