'use client';

interface BottomNavProps {
  activePanel: 'analyze' | 'loading' | 'result';
  setActivePanel: (p: 'analyze' | 'loading' | 'result') => void;
  hasResult: boolean;
  hasHistory: boolean;
  historyCount: number;
  tier: string;
  onUpgrade: () => void;
  onAccount: () => void;
  newResultsCount?: number;
  analyzingCount?: number;
}

const IconSearch = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={active ? '2.2' : '1.7'} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const IconChart = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={active ? '2.2' : '1.7'} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const IconPerson = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={active ? '2.2' : '1.7'} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export default function BottomNav({
  activePanel,
  setActivePanel,
  tier,
  onAccount,
  newResultsCount = 0,
  analyzingCount = 0,
}: BottomNavProps) {
  const isAnalyze = activePanel === 'analyze';
  const isResult = activePanel === 'result';

  const showNewBadge = newResultsCount > 0 && !isResult;
  const showAnalyzingDot = analyzingCount > 0 && !showNewBadge && !isResult;

  return (
    <nav className="bottom-nav" aria-label="底部导航">
      {/* 分析 */}
      <button
        className={`bottom-nav-item${isAnalyze ? ' active' : ''}`}
        onClick={() => setActivePanel('analyze')}
        aria-label="分析"
      >
        <span className="bottom-nav-icon"><IconSearch active={isAnalyze} /></span>
        <span>分析</span>
      </button>

      {/* 结果 */}
      <button
        className={`bottom-nav-item${isResult ? ' active' : ''}`}
        onClick={() => setActivePanel('result')}
        aria-label="结果"
        style={{ position: 'relative' }}
      >
        <span className="bottom-nav-icon" style={{ position: 'relative', display: 'inline-flex' }}>
          <IconChart active={isResult} />
          {showNewBadge && (
            <span className="bottom-nav-badge bottom-nav-badge-pulse">
              {newResultsCount > 9 ? '9+' : newResultsCount}
            </span>
          )}
          {showAnalyzingDot && (
            <span style={{
              position: 'absolute', top: -3, right: -5,
              width: 8, height: 8,
              background: '#007aff',
              borderRadius: '50%',
              border: '1.5px solid rgba(249,249,249,0.94)',
              animation: 'badge-breathe 1.8s ease-in-out infinite',
            }} />
          )}
        </span>
        <span>结果</span>
      </button>

      {/* 我的 — always accessible; upgrade dot for non-premium */}
      <button className="bottom-nav-item" onClick={onAccount} aria-label="我的" style={{ position: 'relative' }}>
        <span className="bottom-nav-icon" style={{ position: 'relative', display: 'inline-flex' }}>
          <IconPerson active={false} />
          {tier !== 'premium' && (
            <span style={{
              position: 'absolute', top: -3, right: -5,
              width: 8, height: 8,
              background: '#ff9500',
              borderRadius: '50%',
              border: '1.5px solid rgba(249,249,249,0.94)',
            }} />
          )}
        </span>
        <span>我的</span>
      </button>
    </nav>
  );
}
