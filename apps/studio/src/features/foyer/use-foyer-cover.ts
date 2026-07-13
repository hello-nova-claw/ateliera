import type {
  CoverMediaResult,
  FoyerImageProjection,
  StudioService,
} from '@studio/application';
import { useEffect, useState } from 'react';

export type FoyerCoverView =
  | { state: 'none' | 'loading' }
  | { state: 'ready'; url: string }
  | {
      state: 'unavailable';
      reason: Extract<CoverMediaResult, { kind: 'unavailable' }>['reason'];
    }
  | { state: 'error'; error: string };

export function useFoyerCover(
  service: StudioService | undefined,
  image: FoyerImageProjection | null,
): FoyerCoverView {
  const [view, setView] = useState<FoyerCoverView>({ state: 'none' });

  useEffect(() => {
    if (service === undefined || image === null) {
      setView({ state: 'none' });
      return undefined;
    }
    let current = true;
    let objectUrl: string | undefined;
    setView({ state: 'loading' });
    void service
      .resolveCover(image.path)
      .then((result) => {
        if (!current) return;
        if (result.kind === 'available') {
          objectUrl = URL.createObjectURL(
            new Blob([result.bytes], { type: result.mimeType }),
          );
          setView({ state: 'ready', url: objectUrl });
          return;
        }
        if (result.kind === 'unavailable') {
          setView({ state: 'unavailable', reason: result.reason });
          return;
        }
        setView({ state: 'none' });
      })
      .catch((reason: unknown) => {
        if (!current) return;
        setView({
          state: 'error',
          error:
            reason instanceof Error
              ? reason.message
              : 'This image could not be prepared.',
        });
      });
    return () => {
      current = false;
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    };
  }, [image, service]);

  return view;
}
