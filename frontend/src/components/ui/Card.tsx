import clsx from 'clsx';
import type { ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  className?: string;
  hover?: boolean;
};

export function Card({ children, className, hover }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-border bg-bg-card p-6',
        hover && 'transition-colors hover:bg-bg-card-hover hover:border-border-focus',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('mb-4 flex items-center justify-between', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider">{children}</h3>;
}
