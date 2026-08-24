import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RoomsSettings } from './RoomsSettings';
import { DEFAULT_RHYTHM_LAYERS } from './rhythm-layers';

afterEach(cleanup);

describe('RoomsSettings', () => {
  it('lists every optional room with its purpose and a switch', () => {
    render(
      <RoomsSettings
        preferences={{}}
        rhythmLayers={DEFAULT_RHYTHM_LAYERS}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('checkbox', { name: /Identity Studio/i })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Current Season/i })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Wisdom Garden/i })).toBeTruthy();
    expect(screen.getByText(/possibilities that don't need a plan/i)).toBeTruthy();
  });

  it('shows an existing Studio with every optional room on', () => {
    render(
      <RoomsSettings
        preferences={{}}
        rhythmLayers={DEFAULT_RHYTHM_LAYERS}
        onChange={vi.fn()}
      />,
    );
    const identity = screen.getByRole('checkbox', {
      name: /Identity Studio/i,
    }) as HTMLInputElement;
    expect(identity.checked).toBe(true);
  });

  it('turns an optional room off by writing an explicit off', () => {
    const onChange = vi.fn();
    render(
      <RoomsSettings
        preferences={{}}
        rhythmLayers={DEFAULT_RHYTHM_LAYERS}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Identity Studio/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].rooms.identity).toBe('off');
  });

  it('turns an optional room back on', () => {
    const onChange = vi.fn();
    render(
      <RoomsSettings
        preferences={{ rooms: { identity: 'off' } }}
        rhythmLayers={DEFAULT_RHYTHM_LAYERS}
        onChange={onChange}
      />,
    );
    const identity = screen.getByRole('checkbox', {
      name: /Identity Studio/i,
    }) as HTMLInputElement;
    expect(identity.checked).toBe(false);
    fireEvent.click(identity);
    expect(onChange.mock.calls[0]![0].rooms.identity).toBe('on');
  });

  it('has a "show every room" action that turns all optional rooms on', () => {
    const onChange = vi.fn();
    render(
      <RoomsSettings
        preferences={{ rooms: { identity: 'off', season: 'off' } }}
        rhythmLayers={DEFAULT_RHYTHM_LAYERS}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /show every room/i }));
    const next = onChange.mock.calls[0]![0].rooms;
    expect(next.identity).toBe('on');
    expect(next.season).toBe('on');
    expect(next.uncharted).toBe('on');
    expect(next.wisdom).toBe('on');
    expect(next.reflection).toBe('on');
    expect(next.inbox).toBe('on');
  });

  it('shows core and utility rooms as always on and not switchable', () => {
    render(
      <RoomsSettings
        preferences={{}}
        rhythmLayers={DEFAULT_RHYTHM_LAYERS}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/always here/i).length).toBeGreaterThan(0);
    // No switch should exist for a core room.
    expect(screen.queryByRole('checkbox', { name: /^Foyer$/i })).toBeNull();
  });

  it('lists Foyer sections and toggles them', () => {
    const onChange = vi.fn();
    render(
      <RoomsSettings
        preferences={{}}
        rhythmLayers={DEFAULT_RHYTHM_LAYERS}
        onChange={onChange}
      />,
    );
    const feelings = screen.getByRole('checkbox', {
      name: /Feelings/i,
    }) as HTMLInputElement;
    expect(feelings.checked).toBe(true);
    fireEvent.click(feelings);
    expect(onChange.mock.calls[0]![0].foyerSections.feelings).toBe('off');
  });

  it('disables the almanac section switch when every rhythm layer is off', () => {
    render(
      <RoomsSettings
        preferences={{}}
        rhythmLayers={{ moon: false, microSeason: false, cycle: false }}
        onChange={vi.fn()}
      />,
    );
    const almanac = screen.getByRole('checkbox', {
      name: /Almanac/i,
    }) as HTMLInputElement;
    expect(almanac.disabled).toBe(true);
    expect(screen.getByText(/Turn on a rhythm layer/i)).toBeTruthy();
  });

  it('merges each change into the existing sparse preferences', () => {
    const onChange = vi.fn();
    render(
      <RoomsSettings
        preferences={{ rhythm: { moon: false } }}
        rhythmLayers={{ moon: false, microSeason: true, cycle: true }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Current Season/i }));
    // The unrelated rhythm preference is preserved.
    expect(onChange.mock.calls[0]![0].rhythm).toEqual({ moon: false });
  });
});
