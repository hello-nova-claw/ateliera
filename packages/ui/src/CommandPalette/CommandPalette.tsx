import { useMemo, useState } from 'react';
import { Dialog } from '../Dialog/Dialog';
import './CommandPalette.css';

export interface StudioCommand {
  id: string;
  label: string;
  onSelect: () => void;
  shortcut?: string;
}

export interface CommandPaletteProps {
  commands: readonly StudioCommand[];
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({
  commands,
  isOpen,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized.length === 0
      ? commands
      : commands.filter((command) =>
          command.label.toLocaleLowerCase().includes(normalized),
        );
  }, [commands, query]);

  return (
    <Dialog isOpen={isOpen} label="Command palette" onClose={onClose}>
      <section className="studio-command-palette">
        <label
          className="studio-command-palette__label"
          htmlFor="studio-command-query"
        >
          Find a command
        </label>
        <input
          className="studio-command-palette__input"
          id="studio-command-query"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Go somewhere or begin…"
          role="combobox"
          value={query}
        />
        <div
          aria-label="Commands"
          className="studio-command-palette__results"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <p className="studio-command-palette__empty">
              No matching commands.
            </p>
          ) : (
            filtered.map((command) => (
              <button
                className="studio-command-palette__option"
                key={command.id}
                onClick={() => {
                  command.onSelect();
                  onClose();
                }}
                role="option"
                type="button"
              >
                <span>{command.label}</span>
                {command.shortcut && <kbd>{command.shortcut}</kbd>}
              </button>
            ))
          )}
        </div>
      </section>
    </Dialog>
  );
}
