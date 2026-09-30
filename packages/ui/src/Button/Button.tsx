import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import './Button.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'quiet';
}

export function Button({
  children,
  variant = 'primary',
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={[`studio-button studio-button--${variant}`, className]
        .filter(Boolean)
        .join(' ')}
      type={type}
      {...rest}
    >
      {variant === 'quiet' ? (
        <span aria-hidden="true" className="studio-button__mark">
          <Icon name="plus" size={16} />
        </span>
      ) : null}
      <span className="studio-button__label">{children}</span>
    </button>
  );
}
