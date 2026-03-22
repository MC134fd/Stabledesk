import clsx from 'clsx';
import type { InputHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function Input({ label, error, id, className, ...props }: InputProps) {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');
  const errorId = `${inputId}-error`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-text-secondary">
        {label}
      </label>
      <input
        id={inputId}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={!!error}
        className={clsx(
          'w-full rounded-lg border bg-bg-surface px-3 py-2 text-sm text-text-primary',
          'placeholder:text-text-muted',
          'transition-colors focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal/25',
          error ? 'border-status-red' : 'border-border',
          className,
        )}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-xs text-status-red" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
