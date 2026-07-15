import type { StudioService } from '@studio/application';
import { SeasonPage } from '../../features/season/SeasonPage';
import { useSeason } from '../../features/season/use-season';
import type { TourExample } from '../../features/onboarding/tour-examples';

export default function SeasonRoom({
  projectionRevision = 0,
  service,
  tourExamples,
}: {
  projectionRevision?: number;
  service?: StudioService;
  tourExamples?: readonly TourExample[];
}) {
  const season = useSeason(service, projectionRevision);
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
      {...(season.wizardStep ? { wizardStep: season.wizardStep } : {})}
      {...(tourExamples ? { tourExamples } : {})}
    />
  );
}
