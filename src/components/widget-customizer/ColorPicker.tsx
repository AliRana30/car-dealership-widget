'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  hexToHsv, hsvToHex, hsvToHsl, hslToHsv,
  hsvToRgb, rgbToHex, hexToRgb, isValidHex, normalizeHex,
  HSV, getContrastColor,
} from './colorUtils';

// iro is a browser-only library — imported dynamically in useEffect
type IroColorPicker = {
  color: { hexString: string };
  on: (event: string, cb: (color: { hexString: string }) => void) => void;
  off: (event: string, cb: (color: { hexString: string }) => void) => void;
};

interface ColorPickerProps {
  value: string;            // HEX string, e.g. "#6366F1"
  onChange: (hex: string) => void;
}

export default function ColorPicker({ value, onChange }: ColorPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<IroColorPicker | null>(null);
  const suppressRef = useRef(false);        // prevents circular update loops

  // Derived state from `value` (single source of truth)
  const [hex, setHex] = useState(() => normalizeHex(value));
  const [hexInput, setHexInput] = useState(() => normalizeHex(value));
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(normalizeHex(value)));
  const [copied, setCopied] = useState(false);

  // Whenever external `value` prop changes, sync internal state
  useEffect(() => {
    const normalized = normalizeHex(value);
    if (normalized === hex) return;
    const newHsv = hexToHsv(normalized);
    suppressRef.current = true;
    setHex(normalized);
    setHexInput(normalized);
    setHsv(newHsv);
    if (pickerRef.current) {
      (pickerRef.current as any).color.hexString = normalized;
    }
    setTimeout(() => { suppressRef.current = false; }, 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Initialize iro picker
  useEffect(() => {
    if (!containerRef.current) return;

    let picker: IroColorPicker | null = null;
    let destroyed = false;

    import('@jaames/iro').then(({ default: iro }) => {
      if (destroyed || !containerRef.current) return;

      picker = new (iro as any).ColorPicker(containerRef.current, {
        width: 220,
        color: normalizeHex(value),
        borderWidth: 2,
        borderColor: 'rgba(0,0,0,0.06)',
        layout: [
          { component: (iro as any).ui.Wheel, options: {} },
          { component: (iro as any).ui.Box, options: {} },
          { component: (iro as any).ui.Slider, options: { sliderType: 'hue' } },
        ],
      }) as IroColorPicker;

      pickerRef.current = picker;

      const handleChange = (color: { hexString: string }) => {
        if (suppressRef.current) return;
        const h = normalizeHex(color.hexString);
        suppressRef.current = true;
        setHex(h);
        setHexInput(h);
        setHsv(hexToHsv(h));
        onChange(h);
        setTimeout(() => { suppressRef.current = false; }, 50);
      };

      picker.on('color:change', handleChange);
    });

    return () => {
      destroyed = true;
      if (picker) {
        try {
          (picker as any).el?.remove?.();
        } catch {}
      }
      pickerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply state → picker (triggered from input changes)
  const applyColor = useCallback((newHex: string) => {
    const normalized = normalizeHex(newHex);
    suppressRef.current = true;
    setHex(normalized);
    setHexInput(normalized);
    setHsv(hexToHsv(normalized));
    if (pickerRef.current) {
      (pickerRef.current as any).color.hexString = normalized;
    }
    onChange(normalized);
    setTimeout(() => { suppressRef.current = false; }, 50);
  }, [onChange]);

  // HEX input
  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setHexInput(raw);
    const withHash = raw.startsWith('#') ? raw : '#' + raw;
    if (isValidHex(withHash)) applyColor(withHash);
  };

  const handleHexBlur = () => {
    if (!isValidHex(hexInput) && !isValidHex('#' + hexInput)) {
      setHexInput(hex); // revert to last known good
    }
  };

  // RGB inputs
  const rgb = hsvToRgb(hsv);
  const handleRgbChange = (channel: 'r' | 'g' | 'b', raw: string) => {
    const n = parseInt(raw);
    if (isNaN(n)) return;
    const clamped = Math.max(0, Math.min(255, n));
    const next = { ...rgb, [channel]: clamped };
    applyColor(rgbToHex(next));
  };

  // HSL inputs
  const hsl = hsvToHsl(hsv);
  const handleHslChange = (channel: 'h' | 's' | 'l', raw: string) => {
    const n = parseInt(raw);
    if (isNaN(n)) return;
    const max = channel === 'h' ? 360 : 100;
    const clamped = Math.max(0, Math.min(max, n));
    const nextHsl = { ...hsl, [channel]: clamped };
    const nextHsv = hslToHsv(nextHsl);
    applyColor(hsvToHex(nextHsv));
  };

  // Copy
  const handleCopy = () => {
    navigator.clipboard.writeText(hex).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const contrastColor = getContrastColor(hex);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Iro wheel + box + slider */}
      <div
        ref={containerRef}
        style={{ display: 'flex', justifyContent: 'center' }}
      />

      {/* Color preview + copy */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div
          style={{
            flex: 1,
            height: '36px',
            borderRadius: '8px',
            background: hex,
            border: '1px solid rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: '10px',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            color: contrastColor,
          }}
        >
          {hex.toUpperCase()}
        </div>
        <button
          onClick={handleCopy}
          style={{
            height: '36px',
            padding: '0 12px',
            borderRadius: '8px',
            border: '1px solid rgba(0,0,0,0.1)',
            background: copied ? '#22c55e' : '#f4f5f7',
            color: copied ? '#fff' : '#374151',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap',
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {/* HEX input */}
      <div>
        <label style={labelStyle}>HEX</label>
        <input
          type="text"
          value={hexInput}
          onChange={handleHexChange}
          onBlur={handleHexBlur}
          spellCheck={false}
          maxLength={7}
          style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}
        />
      </div>

      {/* RGB inputs */}
      <div>
        <label style={labelStyle}>RGB</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
          {(['r', 'g', 'b'] as const).map((ch) => (
            <div key={ch}>
              <input
                type="number"
                min={0} max={255}
                value={rgb[ch]}
                onChange={(e) => handleRgbChange(ch, e.target.value)}
                style={inputStyle}
              />
              <div style={subLabelStyle}>{ch.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* HSL inputs */}
      <div>
        <label style={labelStyle}>HSL</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
          <div>
            <input
              type="number"
              min={0} max={360}
              value={hsl.h}
              onChange={(e) => handleHslChange('h', e.target.value)}
              style={inputStyle}
            />
            <div style={subLabelStyle}>H°</div>
          </div>
          <div>
            <input
              type="number"
              min={0} max={100}
              value={hsl.s}
              onChange={(e) => handleHslChange('s', e.target.value)}
              style={inputStyle}
            />
            <div style={subLabelStyle}>S%</div>
          </div>
          <div>
            <input
              type="number"
              min={0} max={100}
              value={hsl.l}
              onChange={(e) => handleHslChange('l', e.target.value)}
              style={inputStyle}
            />
            <div style={subLabelStyle}>L%</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#9ca3af',
  marginBottom: '6px',
};

const subLabelStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: '10px',
  color: '#9ca3af',
  marginTop: '3px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  fontSize: '12px',
  fontWeight: 500,
  borderRadius: '7px',
  border: '1px solid #e5e7eb',
  background: '#f9fafb',
  color: '#111827',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};
