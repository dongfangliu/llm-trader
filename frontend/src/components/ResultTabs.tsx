'use client';

import { useEffect, useRef } from 'react';

interface Tab {
  label: string;
  key: string;
}

interface ResultTabsProps {
  tabs: Tab[];
  activeTab: number;
  onTabChange: (idx: number) => void;
  children: React.ReactNode;
}

const SHORT_LABELS: Record<string, string> = {
  market_diagnosis:       '市场诊断',
  opportunity_assessment: '机会评估',
  risk_analysis:          '风险收益',
  execution_plan:         '执行方案',
  __multiperiod__:        '多周期',
};

export default function ResultTabs({ tabs, activeTab, onTabChange, children }: ResultTabsProps) {
  const stripRef = useRef<HTMLDivElement>(null);

  // Scroll active tab into view
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const pills = strip.querySelectorAll('.result-tab-pill');
    const activePill = pills[activeTab] as HTMLElement;
    if (activePill) {
      activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeTab]);

  return (
    <div>
      {/* iOS Pill Segmented Control */}
      <div ref={stripRef} className="result-tab-segmented" role="tablist">
        {tabs.map((tab, idx) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === idx}
            className={`result-tab-pill${activeTab === idx ? ' active' : ''}`}
            onClick={() => onTabChange(idx)}
          >
            {SHORT_LABELS[tab.key] || tab.label}
          </button>
        ))}
      </div>

      {/* Content area with crossfade */}
      <div
        key={activeTab}
        className="result-tab-content result-tab-fade"
      >
        {children}
      </div>
    </div>
  );
}
