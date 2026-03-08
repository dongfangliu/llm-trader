'use client';

interface Stock { code: string; name: string; market: string; }

interface HotStocksStripProps {
  stocks: Stock[];
  onSelect: (stock: Stock) => void;
  onRefresh: () => void;
}

export default function HotStocksStrip({ stocks, onSelect, onRefresh }: HotStocksStripProps) {
  if (stocks.length === 0) return null;
  return (
    <div>
      <div className="h-strip" style={{ gap: '8px' }}>
        {stocks.map((s) => (
          <button
            key={`${s.market}_${s.code}`}
            type="button"
            className="h-strip-item"
            onClick={() => onSelect(s)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              padding: '8px 14px', minHeight: '44px', minWidth: '80px',
              background: 'white', border: 'none', borderRadius: '10px',
              cursor: 'pointer', flexShrink: 0,
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#000', lineHeight: '1.2', whiteSpace: 'nowrap' }}>{s.name}</span>
            <span style={{ fontSize: '12px', color: '#8e8e93', marginTop: '1px' }}>{s.code}</span>
          </button>
        ))}
        <button
          type="button" onClick={onRefresh}
          style={{
            flexShrink: 0, width: 44, height: 44, borderRadius: '10px',
            background: 'white', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px', color: '#8e8e93',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >↻</button>
      </div>
    </div>
  );
}
