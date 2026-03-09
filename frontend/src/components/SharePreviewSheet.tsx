'use client';

import { useEffect, useRef, useState } from 'react';

interface SharePreviewSheetProps {
  isOpen: boolean;
  blob: Blob | null;
  filename: string;
  onClose: () => void;
  // Iteration 1 — cinematic dark UI
  actionColor?: string;
  stockMeta?: { name: string; action: string; confidence: number | null };
  // Iteration 5 — dual mode (archive)
  archiveBlob?: Blob | null;
  archiveFilename?: string;
  analyzedAt?: string | null;
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
}: SharePreviewSheetProps) {
  const [closing, setClosing] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [archiveImageUrl, setArchiveImageUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<'social' | 'archive'>('social');
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
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const dismiss = () => {
    setClosing(true);
    setTimeout(onClose, 320);
  };

  const handleDownload = (isArchive = false) => {
    const b = isArchive ? archiveBlob : blob;
    const fn = isArchive ? (archiveFilename || filename) : filename;
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = fn;
    a.click();
  };

  if (!isOpen && !closing) return null;

  const activeImageUrl = mode === 'archive' ? archiveImageUrl : imageUrl;
  const hasArchiveMode = !!archiveBlob;

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
      style={{ opacity: closing ? 0 : 1, transition: 'opacity 0.32s ease' }}
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

        {/* Mode toggle — only when archive is available */}
        {hasArchiveMode && (
          <div className="sps2-mode-seg">
            <button
              className={`sps2-mode-btn${mode === 'social' ? ' sps2-mode-btn-active' : ''}`}
              onClick={() => setMode('social')}
            >
              ✦ 社交分享
            </button>
            <button
              className={`sps2-mode-btn${mode === 'archive' ? ' sps2-mode-btn-active' : ''}`}
              onClick={() => setMode('archive')}
            >
              🔒 专业存证
            </button>
          </div>
        )}

        {/* Card stage with ambient glow */}
        <div className="sps2-stage">
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
              className="sps2-primary-btn"
              style={{
                background: `linear-gradient(135deg, ${actionColor}bb 0%, ${actionColor} 100%)`,
              }}
              onClick={() => handleDownload(false)}
            >
              保存到相册
            </button>
            <div className="sps2-platform-scroll">
              <button className="sps2-platform-pill" onClick={() => handleDownload(false)}>
                📷 小红书发笔记
              </button>
              <button className="sps2-platform-pill" onClick={() => handleDownload(false)}>
                💬 发给朋友
              </button>
              <button className="sps2-platform-pill" onClick={() => handleDownload(false)}>
                🌐 朋友圈
              </button>
            </div>
          </>
        )}

        {/* Archive mode actions */}
        {mode === 'archive' && (
          <div className="sps2-archive-zone">
            <div className="sps2-archive-meta">
              <span className="sps2-archive-meta-icon">🔏 时间戳已记录</span>
              <span className="sps2-archive-meta-date">{dateStr}</span>
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

        {/* Cancel */}
        <button className="sps2-cancel" onClick={dismiss}>取消</button>
      </div>
    </div>
  );
}
