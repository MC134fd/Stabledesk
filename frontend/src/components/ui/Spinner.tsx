import { Loader2 } from 'lucide-react';
import clsx from 'clsx';

export function Spinner({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <Loader2 size={size} className="animate-spin text-teal" />
    </div>
  );
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Spinner size={32} />
    </div>
  );
}
