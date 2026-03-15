'use client';

import { useEffect, useState, useRef } from 'react';

interface DesktopShareModalProps {
  isOpen: boolean;
  socialBlob: Blob | null;
  socialFilename: string;
  archiveBlob: Blob | null;
  archiveFilename: string;
  actionColor: string;
  stockMeta?: { name: string; action: string; confidence: number | null };
  onClose: () => void;
  onRequestArchive: () => Promise<void>;
}

export default function DesktopShareModal({
  isOpen,
  socialBlob,
  socialFilename,
  archiveBlob,
  archiveFilename,
  actionColor,
  stockMeta,
  onClose,
  onRequestArchive,
}: DesktopShareModalProps) {
  const [mode, setMode] = useState<'social' | 'archive'>('social');
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [socialUrl, setSocialUrl] = useState<string | null>(null);
  const [archiveUrl, setArchiveUrl] = useState<string | null>(null);
  const prevSocialBlob = useRef<Blob | null>(null);
  const prevArchiveBlob = useRef<Blob | null>(null);

  // Reset mode to social when modal opens
  useEffect(() => {
    if (isOpen) setMode('social');
  }, [isOpen]);

  // Manage object URLs for social blob
  useEffect(() => {
    if (socialBlob && socialBlob !== prevSocialBlob.current) {
      if (socialUrl) URL.revokeObjectURL(socialUrl);
      setSocialUrl(URL.createObjectURL(socialBlob));
      prevSocialBlob.current = socialBlob;
    }
    if (!socialBlob && socialUrl) {
      URL.revokeObjectURL(socialUrl);
      setSocialUrl(null);
    }
  }, [socialBlob]);

  // Manage object URLs for archive blob
  useEffect(() => {
    if (archiveBlob && archiveBlob !== prevArchiveBlob.current) {
      if (archiveUrl) URL.revokeObjectURL(archiveUrl);
      setArchiveUrl(URL.createObjectURL(archiveBlob));
      prevArchiveBlob.current = archiveBlob;
    }
    if (!archiveBlob && archiveUrl) {
      URL.revokeObjectURL(archiveUrl);
      setArchiveUrl(null);
    }
  }, [archiveBlob]);

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      if (socialUrl) URL.revokeObjectURL(socialUrl);
      if (archiveUrl) URL.revokeObjectURL(archiveUrl);
    };
  }, []);

  // Esc key to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleSwitchToArchive = async () => {
    setMode('archive');
    if (!archiveBlob) {
      setArchiveLoading(true);
      try {
        await onRequestArchive();
      } finally {
        setArchiveLoading(false);
      }
    }
  };

  const handleDownload = () => {
    const url = mode === 'social' ? socialUrl : archiveUrl;
    const filename = mode === 'social' ? socialFilename : archiveFilename;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'share.png';
    a.click();
  };

  if (!isOpen) return null;

  const currentUrl = mode === 'social' ? socialUrl : archiveUrl;
  const isLoading = mode === 'social' ? !socialUrl : (archiveLoading || !archiveUrl);

  return (
    <div className="dt-share-modal-backdrop" onClick={onClose}>
      <div className="dt-share-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dt-share-modal-header">
          <span className="dt-share-modal-title">分享预判</span>
          {stockMeta && (
            <span style={{ fontSize: 13, color: '#8e8e93', flex: 1, paddingLeft: 12 }}>
              {stockMeta.name}
              {stockMeta.confidence != null && (
                <span style={{ marginLeft: 6, color: actionColor, fontWeight: 600 }}>{stockMeta.confidence}%</span>
              )}
            </span>
          )}
          <button className="dt-share-modal-close" onClick={onClose} aria-label="关闭">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div style={{ height: '0.5px', background: 'rgba(60,60,67,0.12)', margin: '0 0 0 0' }} />

        {/* Segment Control */}
        <div style={{ padding: '12px 20px 0' }}>
          <div className="dt-share-modal-seg">
            <button
              className={`dt-share-modal-seg-btn${mode === 'social' ? ' active' : ''}`}
              onClick={() => setMode('social')}
            >
              社交分享
            </button>
            <button
              className={`dt-share-modal-seg-btn${mode === 'archive' ? ' active' : ''}`}
              onClick={handleSwitchToArchive}
            >
              存证预测
            </button>
          </div>
        </div>

        {/* Preview area */}
        <div className="dt-share-modal-preview" style={{ margin: '12px 20px 0' }}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 32, height: 32, border: `3px solid ${actionColor}22`,
                borderTopColor: actionColor, borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              <span style={{ fontSize: 13, color: '#8e8e93' }}>生成中…</span>
            </div>
          ) : currentUrl ? (
            <img src={currentUrl} alt="分享预览" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: 13, color: '#8e8e93' }}>暂无预览</span>
          )}
        </div>

        {/* Footer */}
        <div className="dt-share-modal-footer">
          <button
            className="dt-share-modal-download"
            onClick={handleDownload}
            disabled={isLoading || !currentUrl}
            style={isLoading || !currentUrl ? {} : { background: actionColor }}
          >
            下载此图
          </button>
          <p className="dt-share-modal-disclaimer">
            AI 生成 · 仅供参考 · 不构成投资建议
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
