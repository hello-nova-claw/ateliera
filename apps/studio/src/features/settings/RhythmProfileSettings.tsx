import type { StoredRhythmProfile } from '@studio/application';
import { computeNatalChartLocal, zoneOptions } from '@studio/rhythm';
import { type ChangeEvent, type FormEvent, useMemo, useState } from 'react';
import { RoomHeading } from '@studio/ui';

import './RhythmProfileSettings.css';

export interface RhythmProfileSettingsProps {
  onSave: (profile: StoredRhythmProfile) => Promise<void>;
  profile: StoredRhythmProfile | null;
}

type Hemisphere = 'N' | 'S';

function placementLabel(key: string): string {
  return `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

function validate(
  lat: string,
  lon: string,
  cycleStart: string,
  cycleLength: string,
): string | undefined {
  if (lat !== '') {
    const parsedLat = Number(lat);
    if (!Number.isFinite(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      return 'Latitude must be a number between -90 and 90.';
    }
  }
  if (lon !== '') {
    const parsedLon = Number(lon);
    if (!Number.isFinite(parsedLon) || parsedLon < -180 || parsedLon > 180) {
      return 'Longitude must be a number between -180 and 180.';
    }
  }
  if ((cycleStart !== '') !== (cycleLength !== '')) {
    return 'Enter both a last period start date and an average cycle length, or leave both blank.';
  }
  if (cycleLength !== '') {
    const parsedLength = Number(cycleLength);
    if (!Number.isFinite(parsedLength) || parsedLength <= 0) {
      return 'Average cycle length must be a positive number of days.';
    }
  }
  return undefined;
}

export function RhythmProfileSettings({
  onSave,
  profile,
}: RhythmProfileSettingsProps) {
  const zones = useMemo(() => zoneOptions(), []);
  const [birthDate, setBirthDate] = useState(profile?.birth.date ?? '');
  const [birthTime, setBirthTime] = useState(profile?.birth.timeLocal ?? '');
  const [timeZone, setTimeZone] = useState(profile?.birth.timeZone ?? '');
  const [place, setPlace] = useState(profile?.birth.place ?? '');
  const [lat, setLat] = useState(
    profile?.birth.lat === undefined ? '' : String(profile.birth.lat),
  );
  const [lon, setLon] = useState(
    profile?.birth.lon === undefined ? '' : String(profile.birth.lon),
  );
  const [hemisphere, setHemisphere] = useState<Hemisphere>(
    profile?.hemisphere ?? 'N',
  );
  const [cycleStart, setCycleStart] = useState(
    profile?.cycle?.lastPeriodStart ?? '',
  );
  const [cycleLength, setCycleLength] = useState(
    profile?.cycle?.avgLengthDays === undefined
      ? ''
      : String(profile.cycle.avgLengthDays),
  );
  const [placements, setPlacements] = useState<Record<string, string>>(
    profile?.natal.placements ?? {},
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  function handleLatChange(event: ChangeEvent<HTMLInputElement>): void {
    const value = event.currentTarget.value;
    setLat(value);
    const parsed = Number(value);
    if (value !== '' && Number.isFinite(parsed)) {
      setHemisphere(parsed < 0 ? 'S' : 'N');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    const validationMessage = validate(lat, lon, cycleStart, cycleLength);
    if (validationMessage !== undefined) {
      setError(validationMessage);
      setMessage(undefined);
      return;
    }
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const chart = await computeNatalChartLocal(
        birthDate,
        birthTime === '' ? null : birthTime,
        timeZone === '' ? null : timeZone,
        lat === '' ? null : Number(lat),
        lon === '' ? null : Number(lon),
      );
      const birth: StoredRhythmProfile['birth'] = {};
      if (birthDate !== '') birth.date = birthDate;
      if (birthTime !== '') birth.timeLocal = birthTime;
      if (timeZone !== '') birth.timeZone = timeZone;
      if (lat !== '') birth.lat = Number(lat);
      if (lon !== '') birth.lon = Number(lon);
      if (place !== '') birth.place = place;

      const nextProfile: StoredRhythmProfile = {
        hemisphere,
        birth,
        natal: { placements: chart.placements },
      };
      if (cycleStart !== '' && cycleLength !== '') {
        nextProfile.cycle = {
          lastPeriodStart: cycleStart,
          avgLengthDays: Number(cycleLength),
        };
      }

      await onSave(nextProfile);
      setPlacements(chart.placements);
      setMessage('Your rhythm profile is saved.');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Your rhythm profile could not be saved just now.',
      );
    } finally {
      setBusy(false);
    }
  }

  const placementEntries = Object.entries(placements);

  return (
    <div className="rhythm-profile-settings">
      <div className="rhythm-profile-settings__header">
        <RoomHeading
          eyebrow="your rhythm"
          intro="Enter your birth details once so the Studio can quietly reflect your season, moon, and cycle back to you. Nothing leaves this device."
          title="Rhythm profile"
        />
      </div>

      <form
        className="rhythm-profile-settings__section"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div>
          <p className="rhythm-profile-settings__kicker">Birth details</p>
          <p className="rhythm-profile-settings__description">
            Time and place are optional, but each one you add sharpens the
            chart from sun-only to sun, moon, and rising.
          </p>
        </div>
        <div className="rhythm-profile-settings__grid">
          <label className="rhythm-profile-settings__field">
            <span>Birth date</span>
            <input
              onChange={(event) => setBirthDate(event.currentTarget.value)}
              type="date"
              value={birthDate}
            />
          </label>
          <label className="rhythm-profile-settings__field">
            <span>Birth time</span>
            <input
              onChange={(event) => setBirthTime(event.currentTarget.value)}
              type="time"
              value={birthTime}
            />
          </label>
          <label className="rhythm-profile-settings__field">
            <span>Timezone</span>
            <select
              onChange={(event) => setTimeZone(event.currentTarget.value)}
              value={timeZone}
            >
              <option value="">Not set</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.label}
                </option>
              ))}
            </select>
          </label>
          <label className="rhythm-profile-settings__field">
            <span>Birth place</span>
            <input
              onChange={(event) => setPlace(event.currentTarget.value)}
              type="text"
              value={place}
            />
          </label>
          <label className="rhythm-profile-settings__field">
            <span>Latitude</span>
            <input onChange={handleLatChange} type="number" value={lat} />
          </label>
          <label className="rhythm-profile-settings__field">
            <span>Longitude</span>
            <input
              onChange={(event) => setLon(event.currentTarget.value)}
              type="number"
              value={lon}
            />
          </label>
          <label className="rhythm-profile-settings__field">
            <span>Hemisphere</span>
            <select
              onChange={(event) =>
                setHemisphere(event.currentTarget.value as Hemisphere)
              }
              value={hemisphere}
            >
              <option value="N">Northern</option>
              <option value="S">Southern</option>
            </select>
          </label>
        </div>

        <div>
          <p className="rhythm-profile-settings__kicker">Cycle</p>
          <p className="rhythm-profile-settings__description">
            Optional. Leave both blank if you do not track a cycle.
          </p>
        </div>
        <div className="rhythm-profile-settings__grid">
          <label className="rhythm-profile-settings__field">
            <span>Last period start</span>
            <input
              onChange={(event) => setCycleStart(event.currentTarget.value)}
              type="date"
              value={cycleStart}
            />
          </label>
          <label className="rhythm-profile-settings__field">
            <span>Average cycle length (days)</span>
            <input
              onChange={(event) => setCycleLength(event.currentTarget.value)}
              type="number"
              value={cycleLength}
            />
          </label>
        </div>

        {error !== undefined && (
          <p className="rhythm-profile-settings__error" role="alert">
            {error}
          </p>
        )}
        {message !== undefined && (
          <p className="rhythm-profile-settings__success" role="status">
            {message}
          </p>
        )}

        {placementEntries.length > 0 && (
          <ul
            aria-label="Current placements"
            className="rhythm-profile-settings__placements"
          >
            {placementEntries.map(([key, value]) => (
              <li key={key}>
                <strong>{placementLabel(key)}</strong> {value}
              </li>
            ))}
          </ul>
        )}

        <button
          aria-busy={busy}
          className="rhythm-profile-settings__primary"
          disabled={busy}
          type="submit"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
}
