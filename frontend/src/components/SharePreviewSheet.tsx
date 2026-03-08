'use client';

import { useEffect, useRef, useState } from 'react';

interface SharePreviewSheetProps {
  isOpen: boolean;
  blob: Blob | null;
  filename: string;
  onClose: () => void;
}

export default function SharePreviewSheet({ isOpen, blob, filename, onClose }: SharePreviewSheetProps) {
  const [closing, setClosing] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const prevBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    if (blob && blob !== prevBlobRef.current) {
      prevBlobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [blob]);

  useEffect(() => {
    if (isOpen) {
      setClosing(false);
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

  const handleDownload = () => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  };

  const handleCopyHint = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen && !closing) return null;

  return (
    <div
      className="sps-root"
      style={{ opacity: closing ? 0 : 1, transition: 'opacity 0.32s ease' }}
      onClick={dismiss}
    >
      <div
        className={`sps-panel${closing ? ' sps-panel-out' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="sps-handle-zone">
          <div className="sps-handle-pill" />
        </div>

        {/* Header */}
        <div className="sps-header">
          <span className="sps-title">你的研判凭证</span>
          <button className="sps-close-btn" onClick={dismiss} aria-label="关闭">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Card preview */}
        <div className="sps-preview-wrap">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="洞见卡片预览"
              className="sps-preview-img"
              draggable={false}
            />
          ) : (
            <div className="sps-preview-placeholder">
              <div className="sps-preview-spinner" />
            </div>
          )}
        </div>

        {/* Hint text */}
        <div className="sps-hint">长按图片可直接保存到相册</div>

        {/* Platform action row */}
        <div className="sps-platform-row">
          {/* Save to album */}
          <button className="sps-platform-btn" onClick={handleDownload}>
            <div className="sps-platform-icon sps-icon-download">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </div>
            <span className="sps-platform-label">保存图片</span>
          </button>

          {/* Share to 小红书 */}
          <button className="sps-platform-btn" onClick={() => { handleDownload(); handleCopyHint(); }}>
            <div className="sps-platform-icon sps-icon-xhs">
              {/* 小红书 stylized icon */}
              <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
                <rect width="48" height="48" rx="12" fill="#FF2442"/>
                <path d="M14 16h20M14 24h20M14 32h12" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"/>
                <circle cx="36" cy="32" r="5" fill="#fff"/>
                <path d="M33 32h6M36 29v6" stroke="#FF2442" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="sps-platform-label">{copied ? '已复制提示' : '小红书'}</span>
          </button>

          {/* Share to WeChat */}
          <button className="sps-platform-btn" onClick={() => { handleDownload(); handleCopyHint(); }}>
            <div className="sps-platform-icon sps-icon-wechat">
              <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
                <rect width="48" height="48" rx="12" fill="#07C160"/>
                <ellipse cx="19" cy="21" rx="10" ry="8" fill="none" stroke="#fff" strokeWidth="2.5"/>
                <circle cx="15.5" cy="21" r="1.8" fill="#fff"/>
                <circle cx="22.5" cy="21" r="1.8" fill="#fff"/>
                <ellipse cx="31" cy="26" rx="8" ry="6.5" fill="none" stroke="#fff" strokeWidth="2.5"/>
                <circle cx="28" cy="26" r="1.5" fill="#fff"/>
                <circle cx="34" cy="26" r="1.5" fill="#fff"/>
              </svg>
            </div>
            <span className="sps-platform-label">微信</span>
          </button>

          {/* Share to 朋友圈 */}
          <button className="sps-platform-btn" onClick={() => { handleDownload(); handleCopyHint(); }}>
            <div className="sps-platform-icon sps-icon-moments">
              <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
                <rect width="48" height="48" rx="12" fill="#07C160"/>
                <circle cx="24" cy="24" r="7" fill="#fff"/>
                <circle cx="24" cy="10" r="3" fill="#fff"/>
                <circle cx="38" cy="19" r="3" fill="#fff"/>
                <circle cx="38" cy="33" r="3" fill="#fff"/>
                <circle cx="24" cy="38" r="3" fill="#fff"/>
                <circle cx="10" cy="33" r="3" fill="#fff"/>
                <circle cx="10" cy="19" r="3" fill="#fff"/>
              </svg>
            </div>
            <span className="sps-platform-label">朋友圈</span>
          </button>
        </div>

        {/* Compliance note */}
        <div className="sps-compliance">仅供参考，不构成投资建议</div>

        {/* Cancel */}
        <button className="sps-cancel-btn" onClick={dismiss}>取消</button>
      </div>
    </div>
  );
}
