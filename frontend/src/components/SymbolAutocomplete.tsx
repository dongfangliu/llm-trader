'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { loadSymbolCache, searchSymbols, getSymbolEntry, type SymbolEntry } from '@/lib/symbolCache';

interface SymbolAutocompleteProps {
  value: string;
  onChange: (v: string) => void;
  market: string;
  onSelect?: (entry: SymbolEntry) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function SymbolAutocomplete({
  value,
  onChange,
  market,
  onSelect,
  placeholder,
  disabled,
}: SymbolAutocompleteProps) {
  const [inputText, setInputText] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SymbolEntry[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const justEndedCompositionRef = useRef(false);
  const prevValueRef = useRef(value);
  const selfChangedRef = useRef(false);

  // Preload cache on mount
  useEffect(() => {
    if (market !== 'us') {
      loadSymbolCache();
    }
  }, []);

  // Clear when market changes
  useEffect(() => {
    setSuggestions([]);
    setOpen(false);
    setActiveIdx(-1);
    setInputText('');
    setSelectedName(null);
  }, [market]);

  // Sync with external value changes (e.g. HotStocks click)
  useEffect(() => {
    if (value === prevValueRef.current) return;
    prevValueRef.current = value;
    if (composingRef.current) return;
    if (selfChangedRef.current) {
      selfChangedRef.current = false;
      return;
    }
    // External set
    if (value === '') {
      setInputText('');
      setSelectedName(null);
      setSuggestions([]);
      setOpen(false);
    } else {
      setInputText(value);
      const entry = getSymbolEntry(value, market);
      setSelectedName(entry?.name ?? null);
      setSuggestions([]);
      setOpen(false);
    }
  }, [value, market]);

  const handleChange = useCallback((v: string) => {
    setInputText(v);
    setSelectedName(null); // clear name display once user starts editing
    if (/^[A-Za-z0-9.\-]*$/.test(v)) {
      selfChangedRef.current = true;
      onChange(v);
    }
    if (market === 'us' || !v.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const results = searchSymbols(v, market);
    setSuggestions(results);
    setActiveIdx(-1);
    setOpen(results.length > 0);
  }, [market, onChange]);

  const handleSelect = useCallback((entry: SymbolEntry) => {
    setInputText(entry.symbol);          // input shows code only
    setSelectedName(entry.name ?? null); // name shown below
    prevValueRef.current = entry.symbol;
    selfChangedRef.current = true;
    onChange(entry.symbol);
    setSuggestions([]);
    setOpen(false);
    setActiveIdx(-1);
    onSelect?.(entry);
  }, [onChange, onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler as EventListener);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler as EventListener);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={inputText}
        onChange={e => {
          if (composingRef.current) {
            setInputText(e.target.value);
            return;
          }
          if (justEndedCompositionRef.current) return;
          handleChange(e.target.value);
        }}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={e => {
          composingRef.current = false;
          justEndedCompositionRef.current = true;
          handleChange((e.target as HTMLInputElement).value);
          setTimeout(() => { justEndedCompositionRef.current = false; }, 0);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: '100%', height: 48, background: '#ffffff',
          border: '1px solid rgba(60,60,67,0.15)', outline: 'none',
          borderRadius: 12, padding: '0 16px 0 38px',
          fontSize: 15, color: '#1c1c1e',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          transition: 'border-color 0.15s',
          boxSizing: 'border-box',
        }}
      />
      {selectedName && (
        <div style={{
          fontSize: 12, color: '#8e8e93',
          marginTop: 5, paddingLeft: 4,
          lineHeight: 1,
        }}>
          {selectedName}
        </div>
      )}
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'white', borderRadius: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.14), 0 0 0 0.5px rgba(0,0,0,0.08)',
          zIndex: 1000, overflow: 'hidden',
        }}>
          <div style={{ maxHeight: 240, overflowY: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          {suggestions.map((entry, i) => (
            <button
              key={entry.symbol}
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(entry)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                width: '100%', padding: '9px 14px', background: i === activeIdx ? '#f2f2f7' : 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                borderBottom: i < suggestions.length - 1 ? '0.5px solid rgba(60,60,67,0.08)' : 'none',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: '#1c1c1e' }}>
                {entry.name}
              </span>
              <span style={{ fontSize: 12, color: '#8e8e93', marginLeft: 8, flexShrink: 0 }}>
                {entry.symbol}
              </span>
            </button>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}
