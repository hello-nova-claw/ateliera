import { useId } from 'react';
import { Button } from '../Button/Button';
import './PromptField.css';

export interface PromptFieldEntry {
  id: string;
  body: string;
  date?: string;
}

export interface PromptFieldProps {
  title: string;
  helper?: string;
  entries: PromptFieldEntry[];
  onAdd: () => void;
  addLabel?: string;
}

export function PromptField({
  title,
  helper,
  entries,
  onAdd,
  addLabel = 'Add',
}: PromptFieldProps) {
  const helperId = useId();

  return (
    <section
      aria-describedby={helper ? helperId : undefined}
      className="studio-prompt-field"
    >
      <h3 className="studio-prompt-field__title">{title}</h3>
      {helper ? (
        <p className="studio-prompt-field__helper" id={helperId}>
          {helper}
        </p>
      ) : null}
      <ul className="studio-prompt-field__entries">
        {entries.map((entry) => (
          <li className="studio-prompt-field__entry" key={entry.id}>
            <p className="studio-prompt-field__body">{entry.body}</p>
            {entry.date ? (
              <p className="studio-prompt-field__date">{entry.date}</p>
            ) : null}
          </li>
        ))}
      </ul>
      <Button onClick={onAdd} variant="quiet">
        {addLabel}
      </Button>
    </section>
  );
}
