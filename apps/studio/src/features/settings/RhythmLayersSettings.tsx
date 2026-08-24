import type { RhythmLayers } from './rhythm-layers';
import './RhythmLayersSettings.css';

export interface RhythmLayersSettingsProps {
  layers: RhythmLayers;
  onChange: (next: RhythmLayers) => void | Promise<void>;
}

interface LayerCopy {
  key: keyof RhythmLayers;
  label: string;
  description: string;
}

const LAYERS: readonly LayerCopy[] = [
  {
    key: 'microSeason',
    label: 'The turning year',
    description:
      "The season and its micro-season, in the Foyer's almanac and the Season room.",
  },
  {
    key: 'moon',
    label: 'The moon',
    description: "The moon's phase and how full it is tonight.",
  },
  {
    key: 'cycle',
    label: 'Your cycle',
    description:
      'The day and phase of your cycle. Only appears once you add its dates in the rhythm profile.',
  },
];

export function RhythmLayersSettings({ layers, onChange }: RhythmLayersSettingsProps) {
  return (
    <section
      aria-labelledby="rhythm-layers-heading"
      className="rhythm-layers-settings"
    >
      <div className="rhythm-layers-settings__header">
        <p className="rhythm-layers-settings__kicker">Your rhythm</p>
        <h2 id="rhythm-layers-heading">Rhythm layers</h2>
        <p className="rhythm-layers-settings__description">
          Choose which ambient rhythms the Studio reflects back to you. These are
          quiet display choices — turning one off hides it everywhere and never
          deletes anything from your rhythm profile.
        </p>
      </div>
      <ul className="rhythm-layers-settings__list">
        {LAYERS.map((layer) => {
          const descriptionId = `rhythm-layer-${layer.key}-description`;
          return (
            <li className="rhythm-layers-settings__item" key={layer.key}>
              <label className="rhythm-layers-settings__toggle">
                <input
                  aria-describedby={descriptionId}
                  checked={layers[layer.key]}
                  onChange={(event) =>
                    void onChange({
                      ...layers,
                      [layer.key]: event.currentTarget.checked,
                    })
                  }
                  type="checkbox"
                />
                <span className="rhythm-layers-settings__label">{layer.label}</span>
              </label>
              <p
                className="rhythm-layers-settings__item-description"
                id={descriptionId}
              >
                {layer.description}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
