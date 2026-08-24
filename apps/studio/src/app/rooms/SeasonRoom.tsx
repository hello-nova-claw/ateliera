import type { StudioService } from '@studio/application';
import { SeasonPage } from '../../features/season/SeasonPage';
import { useSeason } from '../../features/season/use-season';
import { useAlmanac } from '../../features/foyer/use-almanac';
import { resolveRhythmLayers } from '../../features/settings/rhythm-layers';
import { useStudioPreferences } from '../../features/settings/use-studio-preferences';
import type { TourExample } from '../../features/onboarding/tour-examples';

function localDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function SeasonRoom({
  now = () => new Date(),
  projectionRevision = 0,
  service,
  tourExamples,
}: {
  now?: () => Date;
  projectionRevision?: number;
  service?: StudioService;
  tourExamples?: readonly TourExample[];
}) {
  const season = useSeason(service, projectionRevision);
  const almanac = useAlmanac(service, localDateISO(now()));
  const { preferences } = useStudioPreferences(service);
  const showYearWheel = resolveRhythmLayers(preferences).microSeason;
  return (
    <SeasonPage
      conflicts={season.conflicts}
      {...(season.error ? { error: season.error } : {})}
      onBegin={season.startWizard}
      onCloseSeason={season.close}
      onCreate={season.create}
      onCreatePriority={season.createPriority}
      onEdit={season.edit}
      onRepairActive={season.repairActive}
      onSaveStep={season.saveStep}
      record={season.record}
      priorityCandidates={season.priorityCandidates}
      state={season.state}
      {...(showYearWheel
        ? {
            yearWheel: {
              season: almanac.season,
              microSeason: almanac.microSeason,
            },
          }
        : {})}
      {...(season.wizardStep ? { wizardStep: season.wizardStep } : {})}
      {...(tourExamples ? { tourExamples } : {})}
    />
  );
}
