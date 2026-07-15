import type { StudioCardProjection, StudioService } from '@studio/application';
import type { LandscapeAnchor } from '@studio/domain';
import { useEffect, useRef } from 'react';
import { LandscapePage } from '../../features/landscape/LandscapePage';
import { useLandscape } from '../../features/landscape/use-landscape';
import type { TourExample } from '../../features/onboarding/tour-examples';
import type { UseTourExample } from '../../features/onboarding/TourPreview';

export default function LandscapeRoom({
  onCreateLandscape,
  onNavigate,
  onOpenCard,
  path = '/landscape',
  projectionRevision = 0,
  service,
  tourExamples,
  onUseTourExample,
}: {
  onCreateLandscape?: (
    lifeArea: string,
    anchor: LandscapeAnchor,
    trigger: HTMLButtonElement,
  ) => void;
  onNavigate?: (path: string, options?: { replace?: boolean }) => void;
  onOpenCard?: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
  path?: string;
  projectionRevision?: number;
  service?: StudioService;
  tourExamples?: readonly TourExample[];
  onUseTourExample?: UseTourExample;
}) {
  const landscape = useLandscape(service, projectionRevision);
  const restoreFocus = useRef<string | undefined>(undefined);
  const navigate = (next: string) => {
    if (path === '/landscape' && next !== '/landscape')
      restoreFocus.current = next.split('/').at(-1);
    onNavigate?.(next);
  };
  useEffect(() => {
    if (path !== '/landscape' || restoreFocus.current === undefined) return;
    const area = restoreFocus.current;
    restoreFocus.current = undefined;
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(
          `[data-landscape-area="${CSS.escape(area)}"]`,
        )
        ?.focus(),
    );
  }, [path]);
  useEffect(() => {
    if (
      path === '/landscape' &&
      landscape.areas[0] !== undefined &&
      (window.matchMedia?.('(width < 768px)').matches ?? false)
    ) {
      onNavigate?.(`/landscape/${landscape.areas[0].id}`, { replace: true });
    }
  }, [landscape.areas, onNavigate, path]);
  return (
    <LandscapePage
      areas={landscape.areas}
      board={landscape.board}
      {...(landscape.configUnavailable
        ? { configUnavailable: landscape.configUnavailable }
        : {})}
      {...(landscape.error ? { error: landscape.error } : {})}
      onAddArea={(area) => void landscape.addArea(area).catch(() => undefined)}
      {...(onCreateLandscape ? { onCreate: onCreateLandscape } : {})}
      onMove={landscape.move}
      onNavigate={navigate}
      {...(onOpenCard ? { onOpen: onOpenCard } : {})}
      onRemoveArea={(id) =>
        void landscape.removeArea(id).catch(() => undefined)
      }
      onRepairAreas={landscape.repairAreas}
      onRenameArea={(id, title) =>
        void landscape.renameArea(id, title).catch(() => undefined)
      }
      onReorder={landscape.reorder}
      onReorderArea={(id, offset) =>
        void landscape.reorderArea(id, offset).catch(() => undefined)
      }
      path={path}
      repairRequired={landscape.repairRequired}
      state={landscape.state}
      {...(tourExamples ? { tourExamples } : {})}
      {...(onUseTourExample ? { onUseTourExample } : {})}
    />
  );
}
