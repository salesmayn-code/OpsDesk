'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ToastEntry {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

interface ToastContextValue {
  toast: (message: string, tone?: 'success' | 'error') => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Lightweight transient feedback; no dependency needed for this scope. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const toast = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((entry) => entry.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2"
      >
        {toasts.map((entry) => (
          <p
            key={entry.id}
            role="status"
            className={cn(
              'pointer-events-auto rounded-card border px-4 py-2 text-sm shadow-sm',
              entry.tone === 'success'
                ? 'border-status-success-bg bg-status-success-bg text-status-success-fg'
                : 'border-status-danger-bg bg-status-danger-bg text-status-danger-fg',
            )}
          >
            {entry.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within <ToastProvider>');
  return context;
}
