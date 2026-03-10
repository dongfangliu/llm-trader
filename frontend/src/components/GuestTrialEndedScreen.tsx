'use client';

interface GuestTrialEndedScreenProps {
  open: boolean;
  banned: boolean;
  onRegister: () => void;
  onClose: () => void;
}

export default function GuestTrialEndedScreen({ open, banned, onClose, onRegister }: GuestTrialEndedScreenProps) {
  if (!open && !banned) return null;

  if (banned) {
    return (
      <div className="gte-overlay">
        <div className="gte-content">
          <div className="gte-icon">🚫</div>
          <h1 className="gte-title">此设备已被限制</h1>
          <p className="gte-subtitle">如有疑问，请联系管理员</p>
          <button className="gte-btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    );
  }

  return (
    <div className="gte-overlay">
      <div className="gte-content">
        <div className="gte-badge">
          <span className="gte-badge-star">✦</span>
        </div>

        <h1 className="gte-title">
          专业版体验<br />已结束
        </h1>

        <p className="gte-subtitle">这是你唯一一次免费体验</p>

        <div className="gte-actions">
          <a href="/upgrade" className="gte-btn-primary">
            订阅专业版&nbsp;&nbsp;¥49/月
          </a>

          <button className="gte-btn-link" onClick={onRegister}>
            注册账号，免费继续使用 →
          </button>
        </div>
      </div>
    </div>
  );
}
