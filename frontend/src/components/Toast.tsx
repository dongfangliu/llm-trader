'use client';

import { useState, useCallback } from 'react';

export type ToastType = 'ok' | 'error' | 'info';

interface ToastState {
  msg: string;
  type: ToastType;
}

const ICON: Record<ToastType, string> = { ok: '✅', error: '❌', info: 'ℹ️' };
const BG: Record<ToastType, string> = {
  ok: '#22c55e',
  error: '#ef4444',
  info: '#3b82f6',
};

/** Shared Toast display component. Render once per page, driven by `useToast`. */
export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 9999,
        padding: '0.75rem 1.25rem',
        borderRadius: '0.5rem',
        background: BG[toast.type],
        color: '#fff',
        fontSize: '0.875rem',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        maxWidth: '24rem',
        lineHeight: 1.5,
        pointerEvents: 'none',
      }}
    >
      {ICON[toast.type]} {toast.msg}
    </div>
  );
}

/** Hook that manages a single transient toast. */
export function useToast(durationMs = 3500) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const show = useCallback(
    (msg: string, type: ToastType = 'info') => {
      setToast({ msg, type });
      setTimeout(() => setToast(null), durationMs);
    },
    [durationMs],
  );

  return { toast, show };
}
