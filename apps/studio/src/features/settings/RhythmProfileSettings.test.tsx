import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';

import {
  RhythmProfileSettings,
  type RhythmProfileSettingsProps,
} from './RhythmProfileSettings';

function typeInto(labelText: string, value: string): void {
  fireEvent.change(screen.getByLabelText(labelText), { target: { value } });
}

function renderSettings(
  props: Partial<RhythmProfileSettingsProps> = {},
): { onSave: ReturnType<typeof vi.fn> } {
  const onSave = vi.fn(async () => undefined);
  render(
    <RhythmProfileSettings
      onSave={onSave}
      profile={null}
      {...props}
    />,
  );
  return { onSave };
}

it('saves birth data and shows the computed placements', async () => {
  const { onSave } = renderSettings();

  typeInto('Birth date', '1990-01-01');
  typeInto('Birth time', '08:00');
  typeInto('Timezone', 'Pacific/Auckland');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        birth: expect.objectContaining({
          date: '1990-01-01',
          timeLocal: '08:00',
          timeZone: 'Pacific/Auckland',
        }),
        natal: { placements: expect.any(Object) },
      }),
    ),
  );
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Your rhythm profile is saved',
  );
  const placements = screen.getByRole('list', { name: 'Current placements' });
  expect(within(placements).getByText('Sun')).toBeVisible();
});

it('shows the existing profile when one is already saved', () => {
  renderSettings({
    profile: {
      hemisphere: 'S',
      birth: { date: '1990-01-01' },
      natal: { placements: { sun: 'Capricorn' } },
    },
  });
  expect(screen.getByLabelText('Birth date')).toHaveValue('1990-01-01');
  expect(screen.getByLabelText('Hemisphere')).toHaveValue('S');
  const placements = screen.getByRole('list', { name: 'Current placements' });
  expect(within(placements).getByText('Capricorn')).toBeVisible();
});

it('does not show a placements list when none exist yet', () => {
  renderSettings();
  expect(
    screen.queryByRole('list', { name: 'Current placements' }),
  ).not.toBeInTheDocument();
});

it('pre-fills the cycle fields from an existing profile', () => {
  renderSettings({
    profile: {
      hemisphere: 'N',
      birth: {},
      cycle: { lastPeriodStart: '2026-08-01', avgLengthDays: 28 },
      natal: { placements: {} },
    },
  });
  expect(screen.getByLabelText('Last period start')).toHaveValue('2026-08-01');
  expect(screen.getByLabelText('Average cycle length (days)')).toHaveValue(28);
});

it('infers the hemisphere from a negative latitude', () => {
  renderSettings();
  typeInto('Latitude', '-36.85');
  expect(screen.getByLabelText('Hemisphere')).toHaveValue('S');
});

it('infers the hemisphere from a positive latitude', () => {
  renderSettings();
  typeInto('Latitude', '12');
  expect(screen.getByLabelText('Hemisphere')).toHaveValue('N');
});

it('lets the hemisphere be set explicitly, overriding inference', () => {
  renderSettings();
  typeInto('Latitude', '12');
  fireEvent.change(screen.getByLabelText('Hemisphere'), {
    target: { value: 'S' },
  });
  expect(screen.getByLabelText('Hemisphere')).toHaveValue('S');
});

it('rejects an out-of-range latitude without saving', async () => {
  const { onSave } = renderSettings();
  typeInto('Latitude', '120');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Latitude must be a number between -90 and 90',
  );
  expect(onSave).not.toHaveBeenCalled();
});

it('rejects an out-of-range longitude without saving', async () => {
  const { onSave } = renderSettings();
  typeInto('Longitude', '200');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Longitude must be a number between -180 and 180',
  );
  expect(onSave).not.toHaveBeenCalled();
});

it('rejects a partially-filled cycle without saving', async () => {
  const { onSave } = renderSettings();
  typeInto('Last period start', '2026-08-01');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Enter both a last period start date and an average cycle length',
  );
  expect(onSave).not.toHaveBeenCalled();
});

it('rejects a non-positive cycle length without saving', async () => {
  const { onSave } = renderSettings();
  typeInto('Last period start', '2026-08-01');
  typeInto('Average cycle length (days)', '0');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Average cycle length must be a positive number of days',
  );
  expect(onSave).not.toHaveBeenCalled();
});

it('saves a full profile including place and cycle', async () => {
  const { onSave } = renderSettings();
  typeInto('Birth date', '1990-01-01');
  typeInto('Birth place', 'Auckland');
  typeInto('Latitude', '-36.85');
  typeInto('Longitude', '174.76');
  typeInto('Last period start', '2026-08-01');
  typeInto('Average cycle length (days)', '28');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        hemisphere: 'S',
        birth: expect.objectContaining({
          date: '1990-01-01',
          place: 'Auckland',
          lat: -36.85,
          lon: 174.76,
        }),
        cycle: { lastPeriodStart: '2026-08-01', avgLengthDays: 28 },
      }),
    ),
  );
});

it('shows an error and stays interactive when saving fails', async () => {
  const onSave = vi.fn(async () => {
    throw new Error('The vault could not be reached.');
  });
  renderSettings({ onSave });
  typeInto('Birth date', '1990-01-01');
  const saveButton = screen.getByRole('button', { name: 'Save' });
  fireEvent.click(saveButton);

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The vault could not be reached.',
  );
  await waitFor(() => expect(saveButton).not.toBeDisabled());
});

it('falls back to a generic message when a save rejects without an Error', async () => {
  const onSave = vi.fn(async () => {
    throw 'nope';
  });
  renderSettings({ onSave });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your rhythm profile could not be saved just now.',
  );
});

it('disables the Save button while a save is in flight', async () => {
  let finishSave!: () => void;
  const onSave = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
  );
  renderSettings({ onSave });
  const saveButton = screen.getByRole('button', { name: 'Save' });
  fireEvent.click(saveButton);

  await waitFor(() => expect(saveButton).toBeDisabled());
  finishSave();
  await waitFor(() => expect(saveButton).not.toBeDisabled());
});

it('ignores a second submit while a save is already in flight', async () => {
  let finishSave!: () => void;
  const onSave = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
  );
  renderSettings({ onSave });
  const saveButton = screen.getByRole('button', { name: 'Save' });
  fireEvent.click(saveButton);
  fireEvent.click(saveButton);
  fireEvent.click(saveButton);

  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  finishSave();
  await waitFor(() => expect(saveButton).not.toBeDisabled());
});

it('leaves the hemisphere as previously inferred once latitude is cleared', () => {
  renderSettings();
  typeInto('Latitude', '-36.85');
  expect(screen.getByLabelText('Hemisphere')).toHaveValue('S');
  typeInto('Latitude', '');
  expect(screen.getByLabelText('Hemisphere')).toHaveValue('S');
});
