import type { StudioService } from '@studio/application';
import { SeasonPage } from '../../features/season/SeasonPage';
import { useSeason } from '../../features/season/use-season';

export default function SeasonRoom({
  projectionRevision = 0,
  service,
}: {
  projectionRevision?: number;
  service?: StudioService;
}) {
  const season = useSeason(service, projectionRevision);
  return <SeasonPage
    conflicts={season.conflicts}
    {...(season.error ? { error: season.error } : {})}
    onBegin={season.startWizard}
    onCloseSeason={season.close}
    onCreate={season.create}
    onEdit={season.edit}
    onSaveStep={season.saveStep}
    record={season.record}
    state={season.state}
    {...(season.wizardStep ? { wizardStep: season.wizardStep } : {})}
  />;
}
