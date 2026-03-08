'use client';

import { useEffect, useRef, ReactNode } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  maxHeight?: string;
}

export default function BottomSheet({ isOpen, onClose, children, title, maxHeight = '85vh' }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      {/* Overlay */}
      <div
        className="bottom-sheet-overlay"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0 }}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        className="bottom-sheet-panel entering"
        style={{ maxHeight }}
      >
        <div className="bottom-sheet-drag-handle" />
        {title && (
          <div className="bottom-sheet-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{title}</span>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '1.25rem', color: 'var(--muted)', padding: '0.25rem',
                minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label="关闭"
            >
              ✕
            </button>
          </div>
        )}
        <div className="bottom-sheet-body">
          {children}
        </div>
      </div>
    </div>
  );
}
