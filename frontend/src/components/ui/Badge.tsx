import clsx from 'clsx';

type BadgeProps = {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  className?: string;
};

const variants = {
  default: 'bg-bg-card text-text-secondary border-border',
  success: 'bg-status-green-dim text-status-green border-status-green/20',
  warning: 'bg-status-yellow-dim text-status-yellow border-status-yellow/20',
  error: 'bg-status-red-dim text-status-red border-status-red/20',
  info: 'bg-teal-dim text-teal border-teal/20',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
