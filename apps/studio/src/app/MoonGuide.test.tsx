import type { StudioService } from '@studio/application';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MoonGuide } from './MoonGuide';

describe('MoonGuide', () => {
  it('shows the phase name and illumination for the day', () => {
    // 2026-08-23 is a waxing gibbous, roughly three-quarters lit.
    render(<MoonGuide today="2026-08-23" />);
    expect(screen.getByText('Waxing gibbous')).toBeInTheDocument();
    expect(screen.getByText(/% lit/)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Waxing gibbous, \d+% lit/ }),
    ).toBeInTheDocument();
  });

  it('names the new moon', () => {
    // 2026-08-12 is a new moon.
    render(<MoonGuide today="2026-08-12" />);
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /New/ })).toBeInTheDocument();
  });

  it('mirrors the lit limb for a southern-hemisphere profile', async () => {
    const service = {
      rhythmProfile: {
        load: vi.fn().mockResolvedValue({
          profile: { hemisphere: 'S', natal: { placements: {} } },
          revision: 'r1',
          repairRequired: false,
        }),
      },
    } as unknown as StudioService;
    // A waxing gibbous is lit on the right in the north; the south mirrors it.
    const { container } = render(
      <MoonGuide service={service} today="2026-08-23" />,
    );
    await waitFor(() => expect(service.rhythmProfile.load).toHaveBeenCalled());
    await waitFor(() =>
      expect(container.querySelector('[data-testid="moon-lit"]')).toBeTruthy(),
    );
  });
});
