'use client';

import { useState } from 'react';

interface ErrorReportDialogProps {
  /** The raw error detail from the backend — shown verbatim so the user can screenshot it. */
  error: string | null;
  onClose: () => void;
}

/**
 * System-error dialog shown when a real server error occurs (5xx, unexpected).
 * Displays the actual backend error message and prompts the user to screenshot
 * and report to the admin.
 */
export function ErrorReportDialog({ error, onClose }: ErrorReportDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!error) return null;

  const copy = () => {
    navigator.clipboard.writeText(error).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--background, #fff)',
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          width: '100%',
          maxWidth: '32rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '1.4rem' }}>🚨</span>
          <h2 style={{ fontWeight: 700, fontSize: '1rem', margin: 0 }}>发生错误</h2>
        </div>

        {/* Error detail */}
        <pre
          style={{
            background: 'var(--muted-bg, #f8fafc)',
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: '0.4rem',
            padding: '0.75rem',
            fontSize: '0.75rem',
            lineHeight: 1.6,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            maxHeight: '12rem',
            overflowY: 'auto',
            color: '#dc2626',
            margin: '0 0 1rem 0',
          }}
        >
          {error}
        </pre>

        {/* Instruction */}
        <p style={{ fontSize: '0.82rem', color: 'var(--muted, #6b7280)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
          请<strong>截图此对话框</strong>，将错误信息提供给管理员以便排查。
          也可以点击「复制」将错误文本直接粘贴给管理员。
        </p>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-secondary"
            onClick={copy}
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.9rem' }}
          >
            {copied ? '✅ 已复制' : '📋 复制错误'}
          </button>
          <button
            className="btn btn-primary"
            onClick={onClose}
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.9rem' }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Returns true when the error should trigger the ErrorReportDialog
 * (i.e., it's a real server / unexpected error, not a user-facing quota/auth message).
 */
export function isSystemError(status: number | undefined): boolean {
  if (!status) return false;
  return status >= 500;
}
