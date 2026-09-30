import './FilterChips.css';

export interface FilterChipItem {
  id: string;
  label: string;
}

export interface FilterChipsProps {
  items: FilterChipItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Accessible name for the chip group. */
  label?: string;
}

export function FilterChips({
  items,
  selectedId,
  onSelect,
  label = 'Filter',
}: FilterChipsProps) {
  return (
    <div aria-label={label} className="studio-filter-chips" role="group">
      {items.map((item) => {
        const selected = item.id === selectedId;
        return (
          <button
            aria-pressed={selected}
            className="studio-filter-chips__chip"
            key={item.id}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
