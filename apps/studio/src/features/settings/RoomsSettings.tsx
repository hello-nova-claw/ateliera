import type { StoredStudioPreferences } from '@studio/application';
import type { RhythmLayers } from './rhythm-layers';
import {
  FOYER_SECTIONS,
  OPTIONAL_ROOMS,
  ROOMS,
  resolveFoyerSections,
  resolveRoomVisibility,
} from './room-visibility';
import './RoomsSettings.css';

export interface RoomsSettingsProps {
  preferences: StoredStudioPreferences;
  rhythmLayers: RhythmLayers;
  onChange: (next: StoredStudioPreferences) => void | Promise<void>;
}

const CORE_UTILITY_ROOMS = ROOMS.filter(
  (room) => room.kind === 'core' || room.kind === 'utility',
);

export function RoomsSettings({
  preferences,
  rhythmLayers,
  onChange,
}: RoomsSettingsProps) {
  const roomVisibility = resolveRoomVisibility(preferences);
  const sectionVisibility = resolveFoyerSections(preferences);
  const everyRhythmLayerOff =
    !rhythmLayers.moon && !rhythmLayers.microSeason && !rhythmLayers.cycle;

  const setRoom = (id: string, on: boolean) => {
    void onChange({
      ...preferences,
      rooms: { ...preferences.rooms, [id]: on ? 'on' : 'off' },
    });
  };

  const setSection = (id: string, on: boolean) => {
    void onChange({
      ...preferences,
      foyerSections: {
        ...preferences.foyerSections,
        [id]: on ? 'on' : 'off',
      },
    });
  };

  const showEveryRoom = () => {
    void onChange({
      ...preferences,
      rooms: {
        ...preferences.rooms,
        ...Object.fromEntries(
          OPTIONAL_ROOMS.map((room) => [room.id, 'on'] as const),
        ),
      },
    });
  };

  return (
    <section aria-labelledby="rooms-settings-heading" className="rooms-settings">
      <div className="rooms-settings__header">
        <p className="rooms-settings__kicker">Your Studio</p>
        <h2 id="rooms-settings-heading">Rooms &amp; sections</h2>
        <p className="rooms-settings__description">
          Choose how much of the house is open. A room you turn off is never gone —
          it stays one switch away, and any deep link still opens it. Start with a
          little and let the Studio grow with you.
        </p>
      </div>

      <div className="rooms-settings__group">
        <div className="rooms-settings__group-header">
          <h3 className="rooms-settings__group-title">Rooms</h3>
          <button
            className="rooms-settings__action"
            onClick={showEveryRoom}
            type="button"
          >
            Show every room
          </button>
        </div>
        <ul className="rooms-settings__list">
          {OPTIONAL_ROOMS.map((room) => {
            const descriptionId = `room-${room.id}-description`;
            return (
              <li className="rooms-settings__item" key={room.id}>
                <label className="rooms-settings__toggle">
                  <input
                    aria-describedby={descriptionId}
                    checked={roomVisibility[room.id]}
                    onChange={(event) =>
                      setRoom(room.id, event.currentTarget.checked)
                    }
                    type="checkbox"
                  />
                  <span className="rooms-settings__label">{room.name}</span>
                </label>
                <p className="rooms-settings__item-description" id={descriptionId}>
                  {room.purpose}
                </p>
              </li>
            );
          })}
        </ul>
        <ul className="rooms-settings__always">
          {CORE_UTILITY_ROOMS.map((room) => (
            <li className="rooms-settings__always-item" key={room.id}>
              <span className="rooms-settings__label">{room.name}</span>
              <span className="rooms-settings__always-note">
                always here — {room.purpose}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rooms-settings__group">
        <div className="rooms-settings__group-header">
          <h3 className="rooms-settings__group-title">Foyer sections</h3>
        </div>
        <p className="rooms-settings__group-description">
          The parts of the Foyer that greet you at the door. Turn on only what you
          want to see there.
        </p>
        <ul className="rooms-settings__list">
          {FOYER_SECTIONS.map((section) => {
            const descriptionId = `foyer-section-${section.id}-description`;
            const disabled = section.rhythmGated && everyRhythmLayerOff;
            return (
              <li className="rooms-settings__item" key={section.id}>
                <label className="rooms-settings__toggle">
                  <input
                    aria-describedby={descriptionId}
                    checked={sectionVisibility[section.id] && !disabled}
                    disabled={disabled}
                    onChange={(event) =>
                      setSection(section.id, event.currentTarget.checked)
                    }
                    type="checkbox"
                  />
                  <span className="rooms-settings__label">{section.label}</span>
                </label>
                <p className="rooms-settings__item-description" id={descriptionId}>
                  {disabled
                    ? 'Turn on a rhythm layer to show the almanac.'
                    : section.purpose}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
