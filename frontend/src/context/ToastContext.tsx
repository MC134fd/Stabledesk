import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import clsx from 'clsx';

type ToastType = 'success' | 'error' | 'info';

type Toast = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastState = {
  toast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastState | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider duration={3500}>
        {children}
        {toasts.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            open
            onOpenChange={(open) => !open && remove(t.id)}
            className={clsx(
              'fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border px-4 py-3 shadow-xl',
              'bg-bg-card backdrop-blur-sm',
              'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4',
              'data-[state=closed]:animate-out data-[state=closed]:fade-out',
              t.type === 'success' && 'border-status-green/30',
              t.type === 'error' && 'border-status-red/30',
              t.type === 'info' && 'border-border',
            )}
          >
            <ToastPrimitive.Description className="text-sm text-text-primary">
              {t.message}
            </ToastPrimitive.Description>
            <ToastPrimitive.Close
              className="text-text-muted hover:text-text-primary transition-colors"
              aria-label="Close notification"
            >
              <X size={14} />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
