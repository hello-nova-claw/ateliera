import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RhythmLayersSettings } from './RhythmLayersSettings';

describe('RhythmLayersSettings', () => {
  it('reflects the current layer states as checkboxes', () => {
    render(
      <RhythmLayersSettings
        layers={{ moon: true, microSeason: false, cycle: true }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('checkbox', { name: /The moon/ })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: /The turning year/ }),
    ).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Your cycle/ })).toBeChecked();
  });

  it('emits the full layer set with one flag toggled off', () => {
    const onChange = vi.fn();
    render(
      <RhythmLayersSettings
        layers={{ moon: true, microSeason: true, cycle: true }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /The moon/ }));
    expect(onChange).toHaveBeenCalledWith({
      moon: false,
      microSeason: true,
      cycle: true,
    });
  });
});
