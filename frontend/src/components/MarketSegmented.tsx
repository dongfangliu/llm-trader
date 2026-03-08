'use client';

const MARKET_OPTIONS = [
  { value: 'a',       label: 'A股' },
  { value: 'hk',      label: '港股' },
  { value: 'us',      label: '美股' },
  { value: 'futures', label: '期货' },
];

interface MarketSegmentedProps {
  value: string;
  onChange: (v: string) => void;
  tier: string;
  onLockedClick: () => void;
}

export default function MarketSegmented({ value, onChange, tier, onLockedClick }: MarketSegmentedProps) {
  const isFree = tier === 'free';
  return (
    <div className="segmented" role="group">
      {MARKET_OPTIONS.map((opt) => {
        const locked = isFree && opt.value !== 'a';
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className={`segmented-item${active ? ' active' : ''}${locked ? ' locked' : ''}`}
            onClick={() => locked ? onLockedClick() : onChange(opt.value)}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
