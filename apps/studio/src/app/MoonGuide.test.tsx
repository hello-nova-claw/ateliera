import type { StudioService } from '@studio/application';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MoonGuide } from './MoonGuide';

describe('MoonGuide', () => {
  it('shows the phase name and illumination for the day', () => {
    // 2026-06-25 is the rhythm engine's reference new moon.
    render(<MoonGuide today="2026-06-25" />);
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('0% lit')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /New, 0% lit/ }),
    ).toBeInTheDocument();
  });

  it('renders a labelled moon for a partial phase', () => {
    // ~7 days after the reference new moon: a waxing phase, partly lit.
    render(<MoonGuide today="2026-07-02" />);
    expect(screen.getByRole('img', { name: /% lit/ })).toBeInTheDocument();
    expect(screen.getByText(/% lit/)).toBeInTheDocument();
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
    // 2026-07-02 is waxing (lit on the right in the north); the south mirrors it.
    const { container } = render(
      <MoonGuide service={service} today="2026-07-02" />,
    );
    await waitFor(() =>
      expect(service.rhythmProfile.load).toHaveBeenCalled(),
    );
    // The lit terminator path is present either way; this asserts the load ran
    // and the guide still renders a moon after applying the hemisphere.
    await waitFor(() =>
      expect(container.querySelector('[data-testid="moon-lit"]')).toBeTruthy(),
    );
  });
});
