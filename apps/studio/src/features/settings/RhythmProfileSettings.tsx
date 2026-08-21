import type { StoredRhythmProfile } from '@studio/application';
import {
  computeNatalChartLocal,
  searchPlaces as defaultSearchPlaces,
  zoneOptions,
  type Place,
} from '@studio/rhythm';
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import './RhythmProfileSettings.css';

export interface RhythmProfileSettingsProps {
  onSave: (profile: StoredRhythmProfile) => Promise<void>;
  profile: StoredRhythmProfile | null;
  /** Injectable so tests never load the ~6.5 MB gazetteer. */
  searchPlaces?: (query: string, limit?: number) => Promise<Place[]>;
}

type Hemisphere = 'N' | 'S';

const SUGGESTION_LIMIT = 8;

function placementLabel(key: string): string {
  return `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

function placeLabel(place: Place): string {
  return `${place.name}, ${place.country}`;
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
  searchPlaces = defaultSearchPlaces,
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

  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const latestQuery = useRef('');
  const listboxId = useId();
  const optionId = (index: number): string => `${listboxId}-opt-${index}`;

  function closeSuggestions(): void {
    setListOpen(false);
    setActiveIndex(-1);
    setSuggestions([]);
  }

  function handlePlaceChange(value: string): void {
    setPlace(value);
    latestQuery.current = value;
    if (value.trim() === '') {
      closeSuggestions();
      return;
    }
    void searchPlaces(value, SUGGESTION_LIMIT)
      .then((results) => {
        // Ignore a slow response the person has already typed past.
        if (latestQuery.current !== value) return;
        setSuggestions(results);
        setListOpen(results.length > 0);
        setActiveIndex(results.length > 0 ? 0 : -1);
      })
      .catch(() => {
        // Gazetteer unavailable (e.g. cold offline before it's cached): quietly
        // offer no suggestions. Manual entry via Advanced still works.
        closeSuggestions();
      });
  }

  function selectPlace(chosen: Place): void {
    setPlace(placeLabel(chosen));
    setLat(String(chosen.lat));
    setLon(String(chosen.lon));
    setTimeZone(chosen.timeZone);
    setHemisphere(chosen.hemisphere);
    closeSuggestions();
  }

  function handlePlaceKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!listOpen && suggestions.length > 0) {
        setListOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      const chosen = suggestions[activeIndex];
      if (listOpen && chosen !== undefined) {
        event.preventDefault();
        selectPlace(chosen);
      }
    } else if (event.key === 'Escape') {
      if (listOpen) {
        event.preventDefault();
        closeSuggestions();
      }
    }
  }

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
    <section
      aria-labelledby="rhythm-profile-heading"
      className="rhythm-profile-settings"
    >
      <div className="rhythm-profile-settings__header">
        <p className="rhythm-profile-settings__kicker">Your rhythm</p>
        <h2 id="rhythm-profile-heading">Rhythm profile</h2>
        <p className="rhythm-profile-settings__description">
          Enter your birth details once so the Studio can quietly reflect
          your season, moon, and cycle back to you. Nothing leaves this
          device.
        </p>
      </div>

      <form
        className="rhythm-profile-settings__section"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div>
          <p className="rhythm-profile-settings__kicker">Birth details</p>
          <p className="rhythm-profile-settings__description">
            Time and place are optional, but each one you add sharpens the
            chart from sun-only to sun, moon, and rising. Choose your birthplace
            and the Studio works out its coordinates and timezone for you.
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
        </div>

        <div className="rhythm-profile-settings__place">
          <label className="rhythm-profile-settings__field">
            <span>Birth place</span>
            <input
              aria-activedescendant={
                listOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined
              }
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-expanded={listOpen}
              autoComplete="off"
              onBlur={() => setListOpen(false)}
              onChange={(event) => handlePlaceChange(event.currentTarget.value)}
              onKeyDown={handlePlaceKeyDown}
              role="combobox"
              type="text"
              value={place}
            />
          </label>
          {listOpen && suggestions.length > 0 && (
            <ul
              className="rhythm-profile-settings__suggestions"
              id={listboxId}
              role="listbox"
            >
              {suggestions.map((suggestion, index) => (
                <li
                  aria-selected={index === activeIndex}
                  className="rhythm-profile-settings__suggestion"
                  id={optionId(index)}
                  key={`${suggestion.name}-${suggestion.country}-${suggestion.lat}-${suggestion.lon}`}
                  onClick={() => selectPlace(suggestion)}
                  onMouseDown={(event) => {
                    // Keep focus on the input (avoids the blur that would close
                    // the list) so the click that follows still selects.
                    event.preventDefault();
                  }}
                  role="option"
                >
                  {placeLabel(suggestion)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <details className="rhythm-profile-settings__advanced">
          <summary>Set the location manually</summary>
          <p className="rhythm-profile-settings__description">
            Only needed if your birthplace isn't listed, or you'd rather enter
            exact coordinates. Choosing a place above fills these in for you.
          </p>
          <div className="rhythm-profile-settings__grid">
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
        </details>

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
    </section>
  );
}
