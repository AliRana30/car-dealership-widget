// ============================================================
// Color Utilities — Single Source of Truth Model
// All conversions go through normalized {h, s, v} (HSV/HSB)
// ============================================================

export interface RGB { r: number; g: number; b: number }
export interface HSV { h: number; s: number; v: number }
export interface HSL { h: number; s: number; l: number }

// -----------------------------------------------------------
// HEX ↔ RGB
// -----------------------------------------------------------
export function hexToRgb(hex: string): RGB {
  let h = hex.replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return {
    r: (n >> 16) & 0xff,
    g: (n >> 8) & 0xff,
    b: n & 0xff,
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map(v => {
    const clamped = Math.round(Math.max(0, Math.min(255, v)));
    return clamped.toString(16).padStart(2, '0');
  }).join('');
}

// -----------------------------------------------------------
// RGB ↔ HSV
// -----------------------------------------------------------
export function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s: Math.round(s * 100), v: Math.round(v * 100) };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const sn = s / 100, vn = v / 100;
  const c = vn * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vn - c;

  let rn = 0, gn = 0, bn = 0;
  if (h < 60)       { rn = c; gn = x; bn = 0; }
  else if (h < 120) { rn = x; gn = c; bn = 0; }
  else if (h < 180) { rn = 0; gn = c; bn = x; }
  else if (h < 240) { rn = 0; gn = x; bn = c; }
  else if (h < 300) { rn = x; gn = 0; bn = c; }
  else              { rn = c; gn = 0; bn = x; }

  return {
    r: Math.round((rn + m) * 255),
    g: Math.round((gn + m) * 255),
    b: Math.round((bn + m) * 255),
  };
}

// -----------------------------------------------------------
// HSV ↔ HSL
// -----------------------------------------------------------
export function hsvToHsl({ h, s, v }: HSV): HSL {
  const sn = s / 100, vn = v / 100;
  const l = vn * (1 - sn / 2);
  const sl = (l === 0 || l === 1) ? 0 : (vn - l) / Math.min(l, 1 - l);
  return { h, s: Math.round(sl * 100), l: Math.round(l * 100) };
}

export function hslToHsv({ h, s, l }: HSL): HSV {
  const sn = s / 100, ln = l / 100;
  const v = ln + sn * Math.min(ln, 1 - ln);
  const sv = v === 0 ? 0 : 2 * (1 - ln / v);
  return { h, s: Math.round(sv * 100), v: Math.round(v * 100) };
}

// -----------------------------------------------------------
// Convenience: HEX → everything
// -----------------------------------------------------------
export function hexToHsv(hex: string): HSV {
  return rgbToHsv(hexToRgb(hex));
}

export function hsvToHex(hsv: HSV): string {
  return rgbToHex(hsvToRgb(hsv));
}

// -----------------------------------------------------------
// Validation helpers
// -----------------------------------------------------------
export function isValidHex(hex: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex);
}

export function normalizeHex(hex: string): string {
  const h = hex.replace(/^#/, '');
  if (h.length === 3) {
    return '#' + h.split('').map(c => c + c).join('');
  }
  if (h.length === 6) return '#' + h;
  return hex;
}

// -----------------------------------------------------------
// Contrast helper — returns 'white' or 'black' for text on bg
// -----------------------------------------------------------
export function getContrastColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}
