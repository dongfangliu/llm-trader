'use client';

import { useEffect, useRef, useState } from 'react';

interface SharePreviewSheetProps {
  isOpen: boolean;
  blob: Blob | null;
  filename: string;
  onClose: () => void;
  actionColor?: string;
  stockMeta?: { name: string; action: string; confidence: number | null };
  archiveBlob?: Blob | null;
  archiveFilename?: string;
  analyzedAt?: string | null;
  onRequestArchive?: () => Promise<void>;
}

export default function SharePreviewSheet({
  isOpen,
  blob,
  filename,
  onClose,
  actionColor = '#60a5fa',
  stockMeta,
  archiveBlob,
  archiveFilename,
  analyzedAt,
  onRequestArchive,
}: SharePreviewSheetProps) {
  const [closing, setClosing] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [archiveImageUrl, setArchiveImageUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<'social' | 'archive'>('social');
  const [cardEntered, setCardEntered] = useState(false);
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const prevBlobRef = useRef<Blob | null>(null);
  const prevArchiveBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    if (blob && blob !== prevBlobRef.current) {
      prevBlobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [blob]);

  useEffect(() => {
    if (archiveBlob && archiveBlob !== prevArchiveBlobRef.current) {
      prevArchiveBlobRef.current = archiveBlob;
      const url = URL.createObjectURL(archiveBlob);
      setArchiveImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [archiveBlob]);

  useEffect(() => {
    if (isOpen) {
      setClosing(false);
      setMode('social');
      setCardEntered(false);
      document.body.style.overflow = 'hidden';
      setTimeout(() => setCardEntered(true), 16);
    } else {
      setCardEntered(false);
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const dismiss = () => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, 360);
  };

  const handleDownload = async (isArchive = false) => {
    const b = isArchive ? archiveBlob : blob;
    const fn = isArchive ? (archiveFilename || filename) : filename;
    if (!b) return;

    // On mobile, prefer native share sheet (save to album / share to apps)
    if (navigator.share && navigator.canShare) {
      const file = new File([b], fn, { type: b.type });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch {
          // User cancelled or share failed — fall through to download
        }
      }
    }

    // Desktop fallback: direct download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = fn;
    a.click();
  };

  const switchMode = async (next: 'social' | 'archive') => {
    if (next === mode) return;
    if (next === 'archive' && !archiveBlob && onRequestArchive) {
      await onRequestArchive();
    }
    setMode(next);
    setCardEntered(false);
    setTimeout(() => setCardEntered(true), 16);
  };

  if (!isOpen && !closing) return null;

  const activeImageUrl = mode === 'archive' ? archiveImageUrl : imageUrl;
  const hasArchiveMode = !!archiveBlob || !!onRequestArchive;

  const actionLabel =
    stockMeta?.action === 'buy' ? '买入' :
    stockMeta?.action === 'sell' ? '卖出' : '观望';

  const dateStr = analyzedAt
    ? new Date(analyzedAt).toLocaleString('zh-CN', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '';

  return (
    <div
      className="sps2-root"
      style={{ opacity: closing ? 0 : 1, transition: closing ? 'opacity 0.28s 0.1s ease' : 'opacity 0.22s ease' }}
      onClick={dismiss}
    >
      <div
        className={`sps2-panel${closing ? ' sps2-panel-out' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="sps2-handle-zone">
          <div className="sps2-handle-pill" />
        </div>

        {/* X close button */}
        <button className="sps2-close-x" onClick={dismiss}>×</button>

        {/* Card stage with swipe + entrance */}
        <div
          className={`sps2-stage${cardEntered ? ' sps2-stage-entered' : ''}`}
          onTouchStart={(e) => setSwipeStartX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (swipeStartX === null || !hasArchiveMode) return;
            const delta = e.changedTouches[0].clientX - swipeStartX;
            if (Math.abs(delta) > 44) {
              switchMode(delta < 0 ? 'archive' : 'social');
            }
            setSwipeStartX(null);
          }}
        >
          <div className="sps2-glow" style={{ background: actionColor }} />
          {activeImageUrl ? (
            <img
              src={activeImageUrl}
              alt="分析卡片预览"
              className="sps2-preview-img"
              draggable={false}
            />
          ) : (
            <div className="sps2-preview-placeholder">
              <div className="sps2-preview-spinner" />
            </div>
          )}
        </div>

        {/* Dot indicators */}
        {hasArchiveMode && (
          <div className="sps2-dot-row">
            <div
              className={`sps2-dot${mode === 'social' ? ' sps2-dot-active' : ''}`}
              onClick={() => switchMode('social')}
            />
            <div
              className={`sps2-dot${mode === 'archive' ? ' sps2-dot-active' : ''}`}
              onClick={() => switchMode('archive')}
            />
          </div>
        )}

        {/* Meta strip */}
        {stockMeta && (
          <div className="sps2-meta-strip">
            <span className="sps2-meta-name">{stockMeta.name}</span>
            <span className="sps2-meta-dot">·</span>
            <span className="sps2-meta-detail" style={{ color: actionColor }}>
              {actionLabel}
            </span>
            {stockMeta.confidence != null && (
              <>
                <span className="sps2-meta-dot">·</span>
                <span className="sps2-meta-detail" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  置信度 {stockMeta.confidence}%
                </span>
              </>
            )}
          </div>
        )}

        {/* Social mode actions */}
        {mode === 'social' && (
          <>
            <button
              className="sps2-primary-btn sps2-cta-shimmer"
              style={{
                background: `linear-gradient(135deg, ${actionColor}bb 0%, ${actionColor} 100%)`,
              }}
              onClick={() => handleDownload(false)}
            >
              保存到相册
            </button>
            <div className="sps2-platform-scroll">
              <div className="sps2-platform-pill">
                <span className="sps2-pill-icon">📷</span>
                <span className="sps2-pill-text">小红书发笔记</span>
              </div>
              <div className="sps2-platform-pill">
                <span className="sps2-pill-icon">💬</span>
                <span className="sps2-pill-text">发给朋友</span>
              </div>
              <div className="sps2-platform-pill">
                <span className="sps2-pill-icon">🌐</span>
                <span className="sps2-pill-text">朋友圈</span>
              </div>
            </div>
          </>
        )}

        {/* Archive mode actions */}
        {mode === 'archive' && (
          <div className="sps2-archive-zone">
            <div className="sps2-archive-seal">
              <div className="sps2-seal-accent-bar" style={{ background: actionColor }} />
              <div className="sps2-seal-content">
                <span className="sps2-seal-title">研判时间戳</span>
                <span className="sps2-seal-date">{dateStr}</span>
              </div>
              <div className="sps2-seal-lock">🔒</div>
            </div>
            <button
              className="sps2-archive-save-btn"
              onClick={() => handleDownload(true)}
            >
              保存存证图
            </button>
            <p className="sps2-archive-hint">保存后可截图或打印，作为研判时间凭据</p>
          </div>
        )}

        {/* Compliance note */}
        <div className="sps2-compliance">仅供参考，不构成投资建议</div>
      </div>
    </div>
  );
}
